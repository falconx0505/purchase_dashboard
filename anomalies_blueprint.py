"""Anomaly detection routes mounted under /anomalies."""
import os
import sys
import traceback
import uuid

from flask import Blueprint, jsonify, render_template, request, send_file

_MIS_ROOT = os.path.dirname(__file__)
if _MIS_ROOT not in sys.path:
    sys.path.insert(0, _MIS_ROOT)

_MIS = None
GEMINI_ENABLED = False
gemini_explainer = None


def _load_mis_env():
    env_path = os.path.join(_MIS_ROOT, ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def _get_mis():
    """Lazy-load anomaly modules so purchase_dashboard starts without optional deps."""
    global _MIS, GEMINI_ENABLED, gemini_explainer

    if _MIS is not None:
        return _MIS

    _load_mis_env()

    try:
        import numpy as np
        import polars as pl
        from exports.report_generator import create_aggregated_csv, create_excel_report
        from models.anomaly_detector import AnomalyDetector
        from models.gemini_explainer import GeminiExplainer
        from utils.data_loader import get_column_types, load_file, validate_dataframe
        from utils.data_processor import build_entity_dataframe
        from utils.suggestions import analyze_columns
    except ImportError as exc:
        raise RuntimeError(
            "Anomaly detection dependencies are not installed. "
            "Run: pip install -r requirements.txt"
        ) from exc

    try:
        gemini_explainer = GeminiExplainer()
        GEMINI_ENABLED = True
        print("✅ Gemini API initialized successfully")
    except Exception as exc:
        gemini_explainer = None
        GEMINI_ENABLED = False
        print(f"⚠️ Gemini API not available: {exc}")
        print("   Set GEMINI_API_KEY environment variable to enable AI explanations")

    _MIS = {
        "np": np,
        "pl": pl,
        "create_aggregated_csv": create_aggregated_csv,
        "create_excel_report": create_excel_report,
        "AnomalyDetector": AnomalyDetector,
        "get_column_types": get_column_types,
        "load_file": load_file,
        "validate_dataframe": validate_dataframe,
        "build_entity_dataframe": build_entity_dataframe,
        "analyze_columns": analyze_columns,
    }
    return _MIS


def _mis_runtime_error_response(exc):
    if isinstance(exc, RuntimeError):
        return jsonify({"error": str(exc)}), 503
    return None


anomalies_bp = Blueprint("anomalies", __name__, url_prefix="/anomalies")

DATA_STORE = {}


@anomalies_bp.route("")
@anomalies_bp.route("/")
def anomaly_detection_page():
    return render_template("pages/anomaly_detection.html")


@anomalies_bp.route("/upload", methods=["POST"])
def upload():
    try:
        mis = _get_mis()
        pl = mis["pl"]
        load_file = mis["load_file"]
        validate_dataframe = mis["validate_dataframe"]
        get_column_types = mis["get_column_types"]
        analyze_columns = mis["analyze_columns"]

        file = request.files["file"]
        df = load_file(file, file.filename)

        ok, err = validate_dataframe(df)
        if not ok:
            return jsonify({"error": err}), 400

        session_id = str(uuid.uuid4())
        DATA_STORE[session_id] = {"df": df}

        column_types = get_column_types(df)
        suggestions = analyze_columns(df)

        print(f"\n✅ File uploaded: {len(df)} rows, {len(df.columns)} columns")

        numeric_cols = df.select(pl.col(pl.NUMERIC_DTYPES)).columns
        memory_mb = round(df.estimated_size() / 1024**2, 2)

        return jsonify({
            "session_id": session_id,
            "gemini_enabled": GEMINI_ENABLED,
            "stats": {
                "rows": len(df),
                "columns": len(df.columns),
                "numeric_cols": len(numeric_cols),
                "memory_mb": memory_mb,
            },
            "column_types": column_types,
            "suggestions": suggestions,
        })
    except RuntimeError as exc:
        return _mis_runtime_error_response(exc)
    except Exception as exc:
        print(f"❌ Upload error: {exc}")
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 400


@anomalies_bp.route("/analyze", methods=["POST"])
def analyze():
    try:
        mis = _get_mis()
        pl = mis["pl"]
        build_entity_dataframe = mis["build_entity_dataframe"]
        AnomalyDetector = mis["AnomalyDetector"]

        data = request.json
        session_id = data["session_id"]

        if session_id not in DATA_STORE:
            return jsonify({"error": "Session not found"}), 404

        df = DATA_STORE[session_id]["df"]
        mode = data["mode"]

        print(f"\n🔍 Analyzing in {mode} mode...")
        print(f"   Data shape: {df.shape}")

        try:
            if mode == "AUTO":
                result = build_entity_dataframe(df, mode)
                if isinstance(result[0], dict):
                    multi_entity_configs = result[0]
                    is_multi_mode = True
                else:
                    entity_df, id_col, features = result
                    is_multi_mode = False

            elif mode == "FIXED":
                groupby_col = data.get("groupby_col")
                sum_cols = data.get("sum_cols", [])
                frequency_cols = data.get("frequency_cols", [])

                if not groupby_col:
                    return jsonify({"error": "Grouping column is required for FIXED mode"}), 400

                if not sum_cols and not frequency_cols:
                    return jsonify({"error": "Please select at least one Sum column or Frequency column"}), 400

                result = build_entity_dataframe(
                    df,
                    mode,
                    groupby_col=groupby_col,
                    sum_cols=sum_cols,
                    frequency_cols=frequency_cols,
                )
                entity_df, id_col, features = result
                is_multi_mode = False

            elif mode == "SEMI_FIXED":
                groupby_col = data.get("groupby_col")
                if not groupby_col:
                    return jsonify({"error": "Grouping column required for SEMI_FIXED mode"}), 400

                extra_cols = data.get("extra_numeric_cols", [])
                result = build_entity_dataframe(
                    df,
                    mode,
                    groupby_col=groupby_col,
                    extra_numeric_cols=extra_cols,
                )
                entity_df, id_col, features = result
                is_multi_mode = False
            else:
                return jsonify({"error": "Invalid mode"}), 400

        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        detector = AnomalyDetector()

        if is_multi_mode:
            all_results = []

            for groupby_col, (entity_df, features) in multi_entity_configs.items():
                print(f"\n📊 Analyzing '{groupby_col}' grouping...")

                entity_df = detector.detect_anomalies(entity_df, features, mode)
                entity_df = detector.explain_anomalies(entity_df, features)

                stats = {}
                for col in features:
                    stats[col] = {
                        "mean": float(entity_df[col].mean()),
                        "median": float(entity_df[col].median()),
                        "std": float(entity_df[col].std()),
                        "min": float(entity_df[col].min()),
                        "max": float(entity_df[col].max()),
                        "q25": float(entity_df[col].quantile(0.25)),
                        "q75": float(entity_df[col].quantile(0.75)),
                    }

                anomalies = entity_df.filter(pl.col("STRONG_ANOMALY")).clone()
                anomaly_records = []
                for row in anomalies.iter_rows(named=True):
                    record = {groupby_col: str(row[groupby_col])}
                    for feat in features:
                        val = row[feat]
                        if isinstance(val, (int, float)):
                            record[feat] = round(val, 2) if isinstance(val, float) else int(val)
                        else:
                            record[feat] = str(val)
                    record["ANOMALY_REASON"] = str(row["REASON"])
                    anomaly_records.append(record)

                gemini_summary = None
                if GEMINI_ENABLED and len(anomaly_records) > 0:
                    try:
                        summary = detector.summary(entity_df)
                        gemini_summary = gemini_explainer.generate_summary_insights(
                            summary,
                            anomaly_records,
                            features,
                        )
                        print(f"✅ Generated summary insights for '{groupby_col}'")
                    except Exception as exc:
                        print(f"⚠️ Gemini error for '{groupby_col}': {exc}")

                if len(features) >= 2:
                    chart_x = entity_df[features[0]].to_list()
                    chart_y = entity_df[features[1]].to_list()
                else:
                    chart_x = entity_df[features[0]].to_list()
                    chart_y = entity_df[features[0]].to_list()

                analysis_summary = detector.summary(entity_df)

                all_results.append({
                    "groupby_col": groupby_col,
                    "summary": analysis_summary,
                    "feature_cols": features,
                    "id_col": groupby_col,
                    "anomalies": anomaly_records,
                    "gemini_summary": gemini_summary,
                    "gemini_enabled": GEMINI_ENABLED,
                    "chart_data": {
                        "x": chart_x,
                        "y": chart_y,
                        "colors": ["red" if x else "blue" for x in entity_df["STRONG_ANOMALY"].to_list()],
                        "sizes": [14 if x else 8 for x in entity_df["STRONG_ANOMALY"].to_list()],
                        "labels": entity_df[groupby_col].cast(pl.Utf8).to_list(),
                        "reasons": entity_df["REASON"].to_list(),
                    },
                    "stats": stats,
                })

            DATA_STORE[session_id]["multi_results"] = all_results

            return jsonify({
                "is_multi_mode": True,
                "results": all_results,
            })

        entity_df = detector.detect_anomalies(entity_df, features, mode)
        entity_df = detector.explain_anomalies(entity_df, features)

        all_entities_stats = {}
        for col in features:
            all_entities_stats[col] = {
                "mean": float(entity_df[col].mean()),
                "median": float(entity_df[col].median()),
                "std": float(entity_df[col].std()),
                "min": float(entity_df[col].min()),
                "max": float(entity_df[col].max()),
                "q25": float(entity_df[col].quantile(0.25)),
                "q75": float(entity_df[col].quantile(0.75)),
            }

        DATA_STORE[session_id]["entity_df"] = entity_df
        DATA_STORE[session_id]["id_col"] = id_col
        DATA_STORE[session_id]["features"] = features
        DATA_STORE[session_id]["stats"] = all_entities_stats

        anomalies = entity_df.filter(pl.col("STRONG_ANOMALY")).clone()

        anomaly_records = []
        for row in anomalies.iter_rows(named=True):
            record = {id_col: str(row[id_col])}

            for feat in features:
                val = row[feat]
                if isinstance(val, (int, float)):
                    record[feat] = round(val, 2) if isinstance(val, float) else int(val)
                else:
                    record[feat] = str(val)

            record["ANOMALY_REASON"] = str(row["REASON"])
            anomaly_records.append(record)

        gemini_summary = None

        if GEMINI_ENABLED and len(anomaly_records) > 0:
            try:
                summary = detector.summary(entity_df)
                gemini_summary = gemini_explainer.generate_summary_insights(
                    summary,
                    anomaly_records,
                    features,
                )
                print(f"✅ Generated summary insights ({len(gemini_summary)} chars)")
            except Exception as exc:
                print(f"⚠️ Gemini explanation error: {exc}")
                traceback.print_exc()

        DATA_STORE[session_id]["gemini_summary"] = gemini_summary

        if len(features) >= 2:
            chart_x = entity_df[features[0]].to_list()
            chart_y = entity_df[features[1]].to_list()
        else:
            chart_x = entity_df[features[0]].to_list()
            chart_y = entity_df[features[0]].to_list()

        summary = detector.summary(entity_df)

        return jsonify({
            "is_multi_mode": False,
            "summary": summary,
            "feature_cols": features,
            "id_col": id_col,
            "anomalies": anomaly_records,
            "gemini_summary": gemini_summary,
            "gemini_enabled": GEMINI_ENABLED,
            "chart_data": {
                "x": chart_x,
                "y": chart_y,
                "colors": ["red" if x else "blue" for x in entity_df["STRONG_ANOMALY"].to_list()],
                "sizes": [14 if x else 8 for x in entity_df["STRONG_ANOMALY"].to_list()],
                "labels": entity_df[id_col].cast(pl.Utf8).to_list(),
                "reasons": entity_df["REASON"].to_list(),
            },
        })

    except RuntimeError as exc:
        return _mis_runtime_error_response(exc)
    except Exception as exc:
        print(f"❌ Analysis error: {exc}")
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


@anomalies_bp.route("/ask", methods=["POST"])
def ask_question():
    try:
        mis = _get_mis()
        pl = mis["pl"]
        AnomalyDetector = mis["AnomalyDetector"]

        data = request.json
        session_id = data["session_id"]
        question = data["question"]

        if session_id not in DATA_STORE:
            return jsonify({"error": "Session not found"}), 404

        if not GEMINI_ENABLED:
            return jsonify({
                "answer": "AI question answering is not available. Please set GEMINI_API_KEY environment variable."
            }), 400

        entity_df = DATA_STORE[session_id]["entity_df"]
        features = DATA_STORE[session_id]["features"]
        id_col = DATA_STORE[session_id]["id_col"]

        detector = AnomalyDetector()
        summary = detector.summary(entity_df)

        anomalies = entity_df.filter(pl.col("STRONG_ANOMALY"))
        sample_anomalies = []
        for row in anomalies.head(3).iter_rows(named=True):
            record = {id_col: str(row[id_col])}
            for feat in features:
                record[feat] = float(row[feat]) if isinstance(row[feat], (int, float)) else str(row[feat])
            record["ANOMALY_REASON"] = str(row["REASON"])
            sample_anomalies.append(record)

        context = {
            "total_entities": summary["total_entities"],
            "strong_anomalies": summary["strong_anomalies"],
            "anomaly_rate": summary["anomaly_rate"],
            "feature_cols": features,
            "id_col": id_col,
            "sample_anomalies": sample_anomalies,
        }

        answer = gemini_explainer.answer_question(question, context)

        return jsonify({"answer": answer})

    except RuntimeError as exc:
        return _mis_runtime_error_response(exc)
    except Exception as exc:
        print(f"❌ Question answering error: {exc}")
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


@anomalies_bp.route("/export/csv/<session_id>")
def export_csv(session_id):
    try:
        mis = _get_mis()
        create_aggregated_csv = mis["create_aggregated_csv"]

        if session_id not in DATA_STORE:
            return jsonify({"error": "Session not found"}), 404

        if "multi_results" in DATA_STORE[session_id]:
            from exports.report_generator import merge_multi_results

            multi_results = DATA_STORE[session_id]["multi_results"]
            entity_df = merge_multi_results(multi_results)
        else:
            entity_df = DATA_STORE[session_id]["entity_df"]

        csv_buffer = create_aggregated_csv(entity_df)

        return send_file(
            csv_buffer,
            mimetype="text/csv",
            as_attachment=True,
            download_name=f"anomalies_{session_id[:8]}.csv",
        )
    except RuntimeError as exc:
        return _mis_runtime_error_response(exc)
    except Exception as exc:
        print(f"❌ CSV export error: {exc}")
        return jsonify({"error": str(exc)}), 500


@anomalies_bp.route("/export/excel/<session_id>")
def export_excel(session_id):
    try:
        mis = _get_mis()
        pl = mis["pl"]
        create_excel_report = mis["create_excel_report"]

        if session_id not in DATA_STORE:
            return jsonify({"error": "Session not found"}), 404

        df = DATA_STORE[session_id]["df"]

        if "multi_results" in DATA_STORE[session_id]:
            from exports.report_generator import merge_multi_results

            multi_results = DATA_STORE[session_id]["multi_results"]
            entity_df = merge_multi_results(multi_results)
            id_col = "ANALYSIS_GROUPBY"
        else:
            entity_df = DATA_STORE[session_id]["entity_df"]
            id_col = DATA_STORE[session_id]["id_col"]

        if len(entity_df) > 0:
            anomaly_keys = (
                entity_df.filter(pl.col("STRONG_ANOMALY"))[id_col].unique().to_list()
                if "STRONG_ANOMALY" in entity_df.columns
                else []
            )
        else:
            anomaly_keys = []

        excel_buffer = create_excel_report(df, entity_df, anomaly_keys, id_col)

        return send_file(
            excel_buffer,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=f"Final_Anomalies_{session_id[:8]}.xlsx",
        )
    except RuntimeError as exc:
        return _mis_runtime_error_response(exc)
    except Exception as exc:
        print(f"❌ Excel export error: {exc}")
        return jsonify({"error": str(exc)}), 500
