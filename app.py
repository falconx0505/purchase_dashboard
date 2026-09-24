import os


# ============================================================
# LOAD .ENV FIRST
# ============================================================

def load_env_file(path):
    if not os.path.exists(path):
        print(f"WARNING: .env file not found at: {path}")
        return

    with open(path, encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()

            if (
                not line
                or line.startswith("#")
                or line.startswith("$env:")
                or "=" not in line
            ):
                continue

            key, _, value = line.partition("=")

            os.environ[key.strip()] = value.strip().strip('"').strip("'")


# IMPORTANT:
# .env MUST be loaded before importing db_postgres
load_env_file(os.path.join(os.path.dirname(__file__), ".env"))


# ============================================================
# DEBUG
# ============================================================

print("DEBUG PG_HOST:", os.getenv("PG_HOST"))
print("DEBUG PG_PORT:", os.getenv("PG_PORT"))
print("DEBUG PG_DB:", os.getenv("PG_DB"))
print("DEBUG PG_USER:", os.getenv("PG_USER"))
print("DEBUG PG_PASSWORD EXISTS:", bool(os.getenv("PG_PASSWORD")))


# ============================================================
# NORMAL IMPORTS
# ============================================================

import math
import random
import re
import sqlite3
import tempfile
import zipfile
import json
import time
from datetime import datetime
from xml.etree.ElementTree import iterparse

from werkzeug.utils import secure_filename
import polars as pl
import requests
import io
import shutil

from flask import (
    Flask,
    request,
    send_file,
    jsonify,
    render_template,
    session,
    redirect,
)

import pytesseract
from PIL import Image
from pdf2image import convert_from_bytes

from google import genai
from google.genai import types

import api

from anomalies_blueprint import anomalies_bp
from auth import auth_bp

from db_postgres import init_users_table

from db_encrypted_store import (
    init_encrypted_tables,
    save_purchase_snapshot,
    load_purchase_snapshot,
    save_hygiene_remark_encrypted,
    delete_hygiene_remark_encrypted,
    load_hygiene_remarks_encrypted,
)


VALID_CATEGORIES = {
    "multi_tax", "prod_gst", "dup_cust", "prod_name", "prod_code",
    "itc_access_lwd", "itc_inactive_90", "itc_pwd_stale",
    "itc_after_hours", "itc_failed_login", "itc_above_limit",
    "hr_dup_bank", "hr_dup_pan_aadhaar", "hr_missing_ids",
    "hr_missing_master", "hr_same_pan",
}


ALL_FIELDS = [
    "category", "table_name", "entity_key", "ObservationTitle",
    "ObservationSubProcess", "RepeatObservation", "ObservationType",
    "RiskType", "Department", "SBU", "FollowUpFrequency", "ShareWith",
    "ObservationDescription", "ShortObservation", "RootCause",
    "ImpactConcern", "FinancialImplication", "Auditee", "OtherAuditee",
    "Escalator1", "Escalator2", "Escalator3", "Recommendation",
    "CorrectiveActionPlan", "PreventiveActionPlan", "ShortActionPlan",
    "TargetDateNotApplicable", "TargetDate", "RevisedTargetDate",
    "PercentageCompletedAuditee", "PercentageCompletedAuditor",
    "ClosureDate", "ClosureReason", "FromDate", "ToDate",
    "CompanyID", "EmpId", "ReportNo",
]


TESSERACT_PATH = shutil.which('tesseract') or r"C:\Program Files\Tesseract-OCR\tesseract.exe"

if TESSERACT_PATH and os.path.exists(TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

# ---------------------------------------------------------------------------
# Null / NaN helpers (replaces pd.isna)
# ---------------------------------------------------------------------------

def _is_na(value) -> bool:
    """True for None, float NaN, or the string 'nan'/'none'/'nat'/'null'."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip().lower() in ("nan", "none", "nat", "null", ""):
        return True
    return False


def safe_value(value) -> str:
    """Turn blank / NaN cells into empty string, everything else into text."""
    if _is_na(value):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def safe_text(value, default="") -> str:
    if _is_na(value):
        return default
    return str(value).strip()


def make_entity_key(title, table_name, row_num):
    base = title or table_name or f"row-{row_num}"
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", base).strip("_").lower()
    return slug or f"row-{row_num}"


def row_is_completely_empty(row: dict) -> bool:
    return all(safe_value(row.get(field)) == "" for field in ALL_FIELDS)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-me")
app.register_blueprint(anomalies_bp)
app.register_blueprint(auth_bp)

init_users_table()
init_encrypted_tables()

random.seed(42)

app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["TEMPLATES_AUTO_RELOAD"] = True

DATA_PATH = os.path.join(os.path.dirname(__file__), "60rowdata.xlsx")
DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEN_MODEL = "gemini-2.5-flash"
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

ALL_MONTHS = ["January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"]
MONTH_ORDER = ALL_MONTHS
PROMINENT_REGIONS = ["Bangalore", "Mumbai", "Delhi NCR", "Hyderabad",
                     "Chennai", "Kolkata", "Pune", "Ahmedabad"]
DEMO_AMOUNT_SCALE = 850
BANKS = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak Bank"]

USE_COLUMNS = {
    "bill no", "store code", "store name", "ordering channel", "source", "region",
    "product code", "product name", "product cgst rate", "product sgst rate",
    "product cgst amount", "product sgst amount", "net sale", "gross sale",
    "item price", "quantity", "marketing discount amount", "loyalty discount amount",
    "bill date time", "business day date",
}
XML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RE_COL = re.compile(r"([A-Z]+)")


def rand_po():
    return f"PO-{random.randint(1000, 9999)}"


def rand_grn():
    return f"GRN-{random.randint(100, 999)}"


def rand_bank():
    return random.choice(BANKS)


def normalize_columns(columns):
    return [str(c).strip().lower() for c in columns]


# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------

def ensure_audit_trail_schema(conn):
    try:
        existing_columns = {row[1] for row in conn.execute("PRAGMA table_info(audit_trail_records)")}
    except Exception:
        existing_columns = set()

    for column_name, column_type in [
        ("vendor_no", "TEXT"), ("vendor_name", "TEXT"), ("field_changed", "TEXT"),
        ("field_description", "TEXT"), ("indicator", "TEXT"), ("old_value", "TEXT"),
        ("new_value", "TEXT"), ("changed_by", "TEXT"), ("risk", "TEXT"),
        ("year", "TEXT"), ("quantity", "TEXT"), ("month_name", "TEXT"),
    ]:
        if column_name not in existing_columns:
            conn.execute(f"ALTER TABLE audit_trail_records ADD COLUMN {column_name} {column_type}")


def init_db_schema(conn):
    conn.execute("""
    CREATE TABLE IF NOT EXISTS hygiene_remarks (
        issue_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        remark TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS audit_trail_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process TEXT, control TEXT, status TEXT, owner TEXT, department TEXT,
        remarks TEXT, vendor_no TEXT, vendor_name TEXT, field_changed TEXT,
        field_description TEXT, indicator TEXT, old_value TEXT, new_value TEXT,
        changed_by TEXT, risk TEXT, year TEXT, quantity TEXT, month_name TEXT,
        source_file TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    ensure_audit_trail_schema(conn)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL, table_name TEXT, entity_key TEXT,
        ObservationTitle TEXT, ObservationSubProcess TEXT, RepeatObservation TEXT,
        ObservationType TEXT, RiskType TEXT, Department TEXT, SBU TEXT,
        FollowUpFrequency TEXT, ShareWith TEXT, ObservationDescription TEXT,
        ShortObservation TEXT, RootCause TEXT, ImpactConcern TEXT,
        FinancialImplication TEXT, Auditee TEXT, OtherAuditee TEXT,
        Escalator1 TEXT, Escalator2 TEXT, Escalator3 TEXT, Recommendation TEXT,
        CorrectiveActionPlan TEXT, PreventiveActionPlan TEXT, ShortActionPlan TEXT,
        TargetDateNotApplicable BOOLEAN, TargetDate DATE, RevisedTargetDate DATE,
        PercentageCompletedAuditee DECIMAL(5,2), PercentageCompletedAuditor DECIMAL(5,2),
        ClosureDate DATE, ClosureReason TEXT, FromDate DATE, ToDate DATE,
        CompanyID INTEGER DEFAULT 1, EmpId TEXT, ReportNo TEXT,
        lars_observ_req_id TEXT, lars_plan_id TEXT, lars_url TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    observation_columns = {row[1] for row in conn.execute("PRAGMA table_info(observations)")}
    for column_name in ["CompanyID", "EmpId", "ReportNo", "lars_observ_req_id", "lars_plan_id", "lars_url"]:
        if column_name not in observation_columns:
            conn.execute(f"ALTER TABLE observations ADD COLUMN {column_name} TEXT")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db_schema(conn)
    return conn


# ---------------------------------------------------------------------------
# Observation helpers
# ---------------------------------------------------------------------------

def normalize_observation_headers(df: pl.DataFrame) -> pl.DataFrame:
    canonical_map = {re.sub(r"[^a-zA-Z0-9]+", "", str(name)).lower(): name for name in ALL_FIELDS}
    rename_map = {}
    for original in df.columns:
        key = re.sub(r"[^a-zA-Z0-9]+", "", str(original)).lower()
        if key in canonical_map and original != canonical_map[key]:
            rename_map[original] = canonical_map[key]
    if rename_map:
        df = df.rename(rename_map)
    return df


# ---------------------------------------------------------------------------
# Audit trail helpers
# ---------------------------------------------------------------------------

AUDIT_TRAIL_ALIASES = {
    "process": "process", "module": "process", "category": "process",
    "control": "control", "controlname": "control", "controlid": "control",
    "status": "status", "statusname": "status",
    "owner": "owner", "assignedto": "owner", "responsibleowner": "owner",
    "department": "department", "team": "department",
    "remarks": "remarks", "comments": "remarks", "notes": "remarks",
}


def normalize_audit_header(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(name).strip().lower())


def normalize_audit_row(row: dict) -> dict:
    normalized = {}
    for key, value in row.items():
        normalized_key = normalize_audit_header(key)
        if normalized_key in AUDIT_TRAIL_ALIASES:
            normalized[AUDIT_TRAIL_ALIASES[normalized_key]] = safe_value(value)

    if "process" not in normalized:
        normalized["process"] = safe_value(row.get("Vendor Name")) or safe_value(row.get("Vendor No")) or "Unspecified"
    if "control" not in normalized:
        normalized["control"] = safe_value(row.get("Field Changed")) or safe_value(row.get("Field Description")) or "Unspecified"
    if "status" not in normalized:
        normalized["status"] = safe_value(row.get("Indicator")) or "Unspecified"
    if "owner" not in normalized:
        normalized["owner"] = safe_value(row.get("Changed By")) or "Unspecified"
    if "department" not in normalized:
        normalized["department"] = safe_value(row.get("Risk")) or "Unspecified"
    if "remarks" not in normalized:
        normalized["remarks"] = safe_value(row.get("Old Value")) + " -> " + safe_value(row.get("New Value"))

    normalized.setdefault("fielddescription", safe_value(row.get("Field Description")) or safe_value(row.get("FieldDescription")) or "Unspecified")
    normalized.setdefault("vendorno", safe_value(row.get("Vendor No")) or safe_value(row.get("VendorNo")) or "Unspecified")

    v_raw = safe_value(row.get("Vendor Name")) or safe_value(row.get("VendorName")) or "Unspecified"
    if v_raw.lower() == "axis bank":
        normalized.setdefault("vendorname", "Axis Bank")
    elif v_raw.lower() == "qatar bank":
        normalized.setdefault("vendorname", "Qatar Bank")
    elif v_raw.lower() == "hdfc bank limited":
        normalized.setdefault("vendorname", "HDFC Bank Limited")
    elif v_raw and v_raw != "Unspecified":
        normalized.setdefault("vendorname", v_raw.title())
    else:
        normalized.setdefault("vendorname", "Unspecified")

    normalized.setdefault("fieldchanged", safe_value(row.get("Field Changed")) or safe_value(row.get("FieldChanged")) or "Unspecified")
    normalized.setdefault("indicator", safe_value(row.get("Indicator")) or "Unspecified")
    normalized.setdefault("oldvalue", safe_value(row.get("Old Value")) or "Unspecified")
    normalized.setdefault("newvalue", safe_value(row.get("New Value")) or "Unspecified")
    normalized.setdefault("changedby", safe_value(row.get("Changed By")) or "Unspecified")
    normalized.setdefault("risk", safe_value(row.get("Risk")) or "Unspecified")
    normalized.setdefault("year", safe_value(row.get("Year")) or safe_value(row.get("Month Year")) or "Unspecified")
    normalized.setdefault("quantity", safe_value(row.get("Qty")) or safe_value(row.get("Quantity")) or "Unspecified")
    normalized.setdefault("monthname", safe_value(row.get("Month Name")) or safe_value(row.get("MonthName")) or safe_value(row.get("Month")) or "Unspecified")

    if not normalized:
        return {}

    return {
        "Process": safe_value(normalized.get("process")) or "Unspecified",
        "Control": safe_value(normalized.get("control")) or "Unspecified",
        "Status": safe_value(normalized.get("status")) or "Unspecified",
        "Owner": safe_value(normalized.get("owner")) or "Unspecified",
        "Department": safe_value(normalized.get("department")) or "Unspecified",
        "Remarks": safe_value(normalized.get("remarks")),
        "VendorNo": safe_value(normalized.get("vendorno")) or "Unspecified",
        "VendorName": safe_value(normalized.get("vendorname")) or "Unspecified",
        "FieldChanged": safe_value(normalized.get("fieldchanged")) or "Unspecified",
        "FieldDescription": safe_value(normalized.get("fielddescription")) or "Unspecified",
        "Indicator": safe_value(normalized.get("indicator")) or "Unspecified",
        "OldValue": safe_value(normalized.get("oldvalue")) or "Unspecified",
        "NewValue": safe_value(normalized.get("newvalue")) or "Unspecified",
        "ChangedBy": safe_value(normalized.get("changedby")) or "Unspecified",
        "Risk": safe_value(normalized.get("risk")) or "Unspecified",
        "Year": safe_value(normalized.get("year")) or "Unspecified",
        "Quantity": safe_value(normalized.get("quantity")) or "Unspecified",
        "MonthName": safe_value(normalized.get("monthname")) or "Unspecified",
    }


def parse_audit_trail_rows(df: pl.DataFrame) -> list[dict]:
    rows = []
    for row in df.to_dicts():
        normalized = normalize_audit_row(row)
        if normalized and any(normalized.values()):
            rows.append(normalized)
    return rows


def save_audit_trail_rows(rows: list[dict], source_file: str):
    with get_db_connection() as conn:
        conn.execute("DELETE FROM audit_trail_records")
        conn.executemany(
            """INSERT INTO audit_trail_records
               (process, control, status, owner, department, remarks,
                vendor_no, vendor_name, field_changed, field_description,
                indicator, old_value, new_value, changed_by, risk,
                year, quantity, month_name, source_file)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                (
                    row.get("process", ""), row.get("control", ""),
                    row.get("status", ""), row.get("owner", ""),
                    row.get("department", ""), row.get("remarks", ""),
                    row.get("VendorNo", ""), row.get("VendorName", ""),
                    row.get("FieldChanged", ""), row.get("FieldDescription", ""),
                    row.get("Indicator", ""), row.get("OldValue", ""),
                    row.get("NewValue", ""), row.get("ChangedBy", ""),
                    row.get("Risk", ""), row.get("Year", ""),
                    row.get("Quantity", ""), row.get("MonthName", ""),
                    source_file,
                )
                for row in rows
            ],
        )
        conn.commit()


def get_audit_trail_rows() -> list[dict]:
    default_path = os.path.join(os.path.dirname(__file__), "audittrailmasterdata.xlsx")
    if os.path.exists(default_path):
        try:
            df = pl.read_excel(default_path, infer_schema_length=0)
            rows = parse_audit_trail_rows(df)
            if rows:
                save_audit_trail_rows(rows, os.path.basename(default_path))
                return rows
        except Exception as exc:
            print("Error reading audit trail workbook:", exc)

    try:
        with get_db_connection() as conn:
            cursor = conn.execute(
                """SELECT process, control, status, owner, department, remarks,
                          vendor_no, vendor_name, field_changed, field_description,
                          indicator, old_value, new_value, changed_by, risk,
                          year, quantity, month_name
                   FROM audit_trail_records ORDER BY id"""
            )
            db_rows = cursor.fetchall()
            if db_rows:
                return [
                    {
                        "Process": r["process"] or "",
                        "Control": r["control"] or "",
                        "Status": r["status"] or "",
                        "Owner": r["owner"] or "",
                        "Department": r["department"] or "",
                        "Remarks": r["remarks"] or "",
                        "VendorNo": r["vendor_no"] or "",
                        "VendorName": r["vendor_name"] or "",
                        "FieldChanged": r["field_changed"] or "",
                        "FieldDescription": r["field_description"] or "",
                        "Indicator": r["indicator"] or "",
                        "OldValue": r["old_value"] or "",
                        "NewValue": r["new_value"] or "",
                        "ChangedBy": r["changed_by"] or "",
                        "Risk": r["risk"] or "",
                        "Year": r["year"] or "",
                        "Quantity": r["quantity"] or "",
                        "MonthName": r["month_name"] or "",
                    }
                    for r in db_rows
                ]
    except Exception as exc:
        print("Error reading audit trail rows:", exc)

    return []


def build_audit_trail_payload(rows: list[dict]) -> dict:
    normalized_rows = [r for row in rows if (r := normalize_audit_row(row))]

    from collections import Counter

    vendor_groups: dict[str, dict] = {}
    for row in normalized_rows:
        vendor_name = (row.get("VendorName") or "").strip()
        if "hdfc" in vendor_name.lower():
            vendor_key = "HDFC"
        elif "axis" in vendor_name.lower():
            vendor_key = "Axis"
        elif "qatar" in vendor_name.lower():
            vendor_key = "Qatar"
        else:
            vendor_key = "Other"

        if vendor_key not in vendor_groups:
            vendor_groups[vendor_key] = {
                "vendorName": vendor_key,
                "banklCount": 0, "financialServicesOutsourcingCount": 0,
                "panNumberCount": 0, "servicesCount": 0, "grandTotal": 0,
            }
        group = vendor_groups[vendor_key]
        field_changed = (row.get("FieldChanged") or "").strip().lower()
        if field_changed == "bankl":
            group["banklCount"] += 1
        if field_changed == "financial services outsourcing":
            group["financialServicesOutsourcingCount"] += 1
        if field_changed == "pan number":
            group["panNumberCount"] += 1
        if field_changed == "services":
            group["servicesCount"] += 1
        group["grandTotal"] = (
            group["banklCount"] + group["financialServicesOutsourcingCount"]
            + group["panNumberCount"] + group["servicesCount"]
        )

    field_description_groups: dict[str, dict] = {}
    for row in normalized_rows:
        field_desc = (row.get("FieldDescription") or "").strip()
        if not field_desc or field_desc == "Unspecified":
            field_desc = (row.get("FieldChanged") or "").strip() or "Unspecified"
        if field_desc not in field_description_groups:
            field_description_groups[field_desc] = {
                "fieldDescription": field_desc,
                "highRiskCount": 0, "lowRiskCount": 0, "grandTotal": 0,
            }
        group = field_description_groups[field_desc]
        risk = (row.get("Risk") or "").strip().lower()
        if risk == "high":
            group["highRiskCount"] += 1
        else:
            group["lowRiskCount"] += 1
        group["grandTotal"] = group["highRiskCount"] + group["lowRiskCount"]

    return {
        "rows": normalized_rows,
        "vendorSummaryTable": [vendor_groups[k] for k in ["HDFC", "Axis", "Qatar"] if k in vendor_groups],
        "fieldDescriptionSummaryTable": [field_description_groups[k] for k in sorted(field_description_groups)],
        "summary": {
            "total_rows": len(normalized_rows),
            "status_count": dict(Counter(row["Status"] for row in normalized_rows)),
            "owner_count": dict(Counter(row["Owner"] for row in normalized_rows)),
        },
        "filters": {
            "year": sorted({row["Year"] for row in normalized_rows if row.get("Year")}),
            "quantity": sorted({row["Quantity"] for row in normalized_rows if row.get("Quantity")}),
            "monthName": sorted({row["MonthName"] for row in normalized_rows if row.get("MonthName")}),
        },
    }


def get_hygiene_remarks() -> dict:
    try:
        return load_hygiene_remarks_encrypted()
    except Exception as e:
        print("Error reading hygiene_remarks_encrypted:", e)
        return {}


# ---------------------------------------------------------------------------
# SQLite load helpers (replaces pd.read_sql_query)
# ---------------------------------------------------------------------------

def _sqlite_table_to_records(conn, table: str) -> list[dict]:
    cursor = conn.execute(f"SELECT * FROM {table}")
    columns = [d[0] for d in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def load_from_sqlite():
    if not os.path.exists(DB_PATH):
        return None

    snapshot = load_purchase_snapshot()
    if snapshot is None:
        return None
    purchase, hygiene = snapshot
    if not purchase:
        return None

    with get_db_connection() as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required_tables = {"po", "grn", "bank", "blocked_vendors", "gst_check", "disc_check"}
        if not required_tables.issubset(tables):
            return None

        po = _sqlite_table_to_records(conn, "po")
        grn = _sqlite_table_to_records(conn, "grn")
        bank = _sqlite_table_to_records(conn, "bank")
        blocked_vendors = _sqlite_table_to_records(conn, "blocked_vendors")
        gst_check = _sqlite_table_to_records(conn, "gst_check")
        disc_check = _sqlite_table_to_records(conn, "disc_check")

    companies = sorted({r.get("COMP_NM") for r in purchase if r.get("COMP_NM")})
    db_states = {r.get("COMP_STATE") for r in purchase if r.get("COMP_STATE") and r.get("COMP_STATE") != "Unknown"}
    states = sorted(list(set(PROMINENT_REGIONS + list(db_states))))
    products = sorted({r.get("PROD_NM") for r in purchase if r.get("PROD_NM")})
    customers = sorted({r.get("CUST_NM") for r in purchase if r.get("CUST_NM")})

    return {
        "purchase": purchase, "po": po, "grn": grn, "bank": bank,
        "blocked_vendors": blocked_vendors,
        "multi_tax": hygiene.get("multi_tax", []),
        "dup_customers": hygiene.get("dup_customers", []),
        "prod_name_issues": hygiene.get("prod_name_issues", []),
        "prod_gst_issues": hygiene.get("prod_gst_issues", []),
        "prod_code_check": hygiene.get("prod_code_check", []),
        "gst_check": gst_check, "disc_check": disc_check,
        "companies": companies, "states": states, "products": products,
        "customers": customers, "months": ALL_MONTHS,
    }


def persist_sqlite_tables(po_data, grn_data, bank_data, blocked_vendors, gst_check, disc_check):
    with get_db_connection() as conn:
        # po
        conn.execute("DROP TABLE IF EXISTS po")
        conn.execute("CREATE TABLE po (PO_NO TEXT, INVOICE_NO TEXT, COMP_NM TEXT, CUST_NM TEXT, AMT REAL, MONTH TEXT, YEAR INTEGER)")
        conn.executemany("INSERT INTO po VALUES (?,?,?,?,?,?,?)",
                         [(r["PO_NO"], r["INVOICE_NO"], r["COMP_NM"], r["CUST_NM"], r["AMT"], r["MONTH"], r["YEAR"]) for r in po_data])

        # grn
        conn.execute("DROP TABLE IF EXISTS grn")
        conn.execute("CREATE TABLE grn (GRN_NO TEXT, INVOICE_NO TEXT, COMP_NM TEXT, CUST_NM TEXT, AMT REAL)")
        conn.executemany("INSERT INTO grn VALUES (?,?,?,?,?)",
                         [(r["GRN_NO"], r["INVOICE_NO"], r["COMP_NM"], r["CUST_NM"], r["AMT"]) for r in grn_data])

        # bank
        conn.execute("DROP TABLE IF EXISTS bank")
        conn.execute("CREATE TABLE bank (BANK TEXT, INVOICE_NO TEXT, COMP_NM TEXT, PAYMENT_DAYS INTEGER, AMT REAL)")
        conn.executemany("INSERT INTO bank VALUES (?,?,?,?,?)",
                         [(r["BANK"], r["INVOICE_NO"], r["COMP_NM"], r["PAYMENT_DAYS"], r["AMT"]) for r in bank_data])

        # blocked_vendors
        conn.execute("DROP TABLE IF EXISTS blocked_vendors")
        conn.execute("CREATE TABLE blocked_vendors (VENDOR TEXT, REASON TEXT, INV_NO TEXT, AMT REAL)")
        conn.executemany("INSERT INTO blocked_vendors VALUES (?,?,?,?)",
                         [(r["VENDOR"], r["REASON"], r["INV_NO"], r["AMT"]) for r in blocked_vendors])

        # gst_check
        conn.execute("DROP TABLE IF EXISTS gst_check")
        conn.execute("CREATE TABLE gst_check (INVOICE_NO TEXT, INVOICE_AMT REAL, GST_RATE REAL, GST_AMT REAL, EXPECTED_GST REAL, DIFF REAL, STATUS TEXT)")
        conn.executemany("INSERT INTO gst_check VALUES (?,?,?,?,?,?,?)",
                         [(r["INVOICE_NO"], r["INVOICE_AMT"], r["GST_RATE"], r["GST_AMT"], r["EXPECTED_GST"], r["DIFF"], r["STATUS"]) for r in gst_check])

        # disc_check
        conn.execute("DROP TABLE IF EXISTS disc_check")
        conn.execute("CREATE TABLE disc_check (INVOICE_NO TEXT, INVOICE_AMT REAL, DISCOUNT REAL, CALC_DISCOUNT REAL, DISC_DIFF REAL, STATUS TEXT)")
        conn.executemany("INSERT INTO disc_check VALUES (?,?,?,?,?,?)",
                         [(r["INVOICE_NO"], r["INVOICE_AMT"], r["DISCOUNT"], r["CALC_DISCOUNT"], r["DISC_DIFF"], r["STATUS"]) for r in disc_check])

        conn.commit()


# ---------------------------------------------------------------------------
# Excel streaming parser (unchanged — intentional low-level XML approach)
# ---------------------------------------------------------------------------

def _col_letter_to_index(ref: str) -> int:
    letters = RE_COL.match(ref)
    if not letters:
        return 0
    col = letters.group(1)
    idx = 0
    for ch in col:
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1


def _extract_shared_strings(z) -> list[str]:
    try:
        with z.open("xl/sharedStrings.xml") as f:
            strings = []
            current = []
            for event, elem in iterparse(f, events=("start", "end")):
                if event == "start" and elem.tag == XML_NS + "si":
                    current = []
                elif event == "end" and elem.tag == XML_NS + "t":
                    current.append(elem.text or "")
                    elem.clear()
                elif event == "end" and elem.tag == XML_NS + "si":
                    strings.append("".join(current))
                    elem.clear()
            return strings
    except KeyError:
        return []


def _find_sheet_path(z) -> str:
    if "xl/worksheets/sheet1.xml" in z.namelist():
        return "xl/worksheets/sheet1.xml"
    for name in z.namelist():
        if name.startswith("xl/worksheets/") and name.endswith(".xml"):
            return name
    raise FileNotFoundError("No worksheet XML found in XLSX archive")


# ---------------------------------------------------------------------------
# Date parsing (Polars version — replaces parse_excel_dates with pd)
# ---------------------------------------------------------------------------

def _parse_excel_serial_date(value: str):
    """Convert an Excel serial date string to a Python date, or return None."""
    try:
        serial = float(value)
        # Excel serial: days since 1899-12-30
        from datetime import date, timedelta
        return date(1899, 12, 30) + timedelta(days=int(serial))
    except (ValueError, TypeError, OverflowError):
        return None


def _parse_date_value(value: str):
    """Parse a cell value that may be an Excel serial or a text date string."""
    if not value or value.strip() == "":
        return None
    stripped = value.strip()
    # Try serial first
    result = _parse_excel_serial_date(stripped)
    if result:
        return result
    # Try common text formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(stripped.split()[0], fmt).date()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Main data loading (Polars)
# ---------------------------------------------------------------------------

def load_excel_data() -> dict:
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Excel source not found: {DATA_PATH}")

    # --- low-level XML streaming parse (kept as-is for performance) ---
    with zipfile.ZipFile(DATA_PATH, "r") as z:
        shared_strings = _extract_shared_strings(z)
        sheet_path = _find_sheet_path(z)
        rows = []
        header = []
        with z.open(sheet_path) as f:
            row_idx = 0
            for event, elem in iterparse(f, events=("start", "end")):
                if event == "end" and elem.tag == XML_NS + "row":
                    row_cells: dict[int, str] = {}
                    for c in elem.findall(XML_NS + "c"):
                        ref = c.get("r", "")
                        idx = _col_letter_to_index(ref)
                        value = ""
                        if c.get("t") == "s":
                            v = c.find(XML_NS + "v")
                            if v is not None and v.text is not None:
                                value = shared_strings[int(v.text)]
                        elif c.get("t") == "inlineStr":
                            value = "".join(t.text or "" for t in c.findall("./" + XML_NS + "t"))
                        else:
                            v = c.find(XML_NS + "v")
                            value = v.text if v is not None and v.text is not None else ""
                        row_cells[idx] = value
                    max_idx = max(row_cells.keys()) if row_cells else -1
                    row_values = [row_cells.get(i, "") for i in range(max_idx + 1)]
                    if row_idx == 0:
                        header = [str(v).strip().lower() if v else "" for v in row_values]
                    else:
                        rows.append(row_values)
                    row_idx += 1
                    elem.clear()

    selected_columns = [i for i, name in enumerate(header) if name in USE_COLUMNS]
    selected_headers = [header[i] for i in selected_columns]
    selected_rows = [
        {selected_headers[i]: (row_values[idx] if idx < len(row_values) else "")
         for i, idx in enumerate(selected_columns)}
        for row_values in rows
    ]

    # --- build Polars DataFrame ---
    df = pl.DataFrame(selected_rows, schema={h: pl.Utf8 for h in selected_headers})
    df = df.rename({c: c.strip().lower() for c in df.columns})

    # String columns — ensure Utf8 and strip
    text_cols = ["bill no", "store code", "store name", "ordering channel", "source",
                 "region", "product code", "product name"]
    for col in text_cols:
        if col not in df.columns:
            df = df.with_columns(pl.lit("").alias(col))
        else:
            df = df.with_columns(pl.col(col).cast(pl.Utf8).str.strip_chars().fill_null(""))

    # Numeric columns
    numeric_cols = [
        "product cgst rate", "product sgst rate", "product cgst amount", "product sgst amount",
        "net sale", "gross sale", "item price", "quantity",
        "marketing discount amount", "loyalty discount amount",
    ]
    for col in numeric_cols:
        if col not in df.columns:
            df = df.with_columns(pl.lit(0.0).alias(col))
        else:
            df = df.with_columns(
                pl.col(col).cast(pl.Utf8).str.strip_chars()
                .cast(pl.Float64, strict=False).fill_null(0.0).alias(col)
            )

    # Scale money columns
    money_cols = ["product cgst amount", "product sgst amount", "net sale", "gross sale",
                  "item price", "marketing discount amount", "loyalty discount amount"]
    df = df.with_columns([
        (pl.col(c) * DEMO_AMOUNT_SCALE).alias(c) for c in money_cols
    ])

    # Parse dates
    date_col = "bill date time" if "bill date time" in df.columns else "business day date"
    fallback_col = "business day date" if "business day date" in df.columns else date_col

    parsed_dates = [_parse_date_value(v) for v in df[date_col].to_list()]
    parsed_fallback = [_parse_date_value(v) for v in df[fallback_col].to_list()]

    months = []
    years = []
    for d in parsed_dates:
        if d:
            months.append(d.strftime("%B"))
            years.append(d.year)
        else:
            months.append("Unknown")
            years.append(0)

    df = df.with_columns([
        pl.Series("MONTH", months, dtype=pl.Utf8),
        pl.Series("YEAR", years, dtype=pl.Int64),
    ])

    # Derived columns
    df = df.with_columns([
        (pl.col("product cgst rate") + pl.col("product sgst rate")).alias("GST_RATE"),
        pl.col("net sale").alias("INVOICE_AMT"),
        (pl.col("product cgst amount") + pl.col("product sgst amount")).alias("GST_AMT"),
        pl.col("gross sale").alias("TOTAL_AMT"),
        (pl.col("marketing discount amount") + pl.col("loyalty discount amount")).alias("DISCOUNT"),
        (pl.col("item price") * pl.col("quantity") - pl.col("net sale")).alias("CALC_DISCOUNT"),
        pl.col("store name").str.replace("^$", "Unknown Store").alias("COMP_NM"),
        pl.col("region").str.replace("^$", "Unknown").alias("COMP_STATE"),
        pl.col("ordering channel").str.replace("^$", "Unknown").alias("CUST_NM"),
        pl.col("source").str.replace("^$", "Unknown").alias("CUST_STATE"),
        pl.col("product name").str.replace("^$", "Unknown Product").alias("PROD_NM"),
        pl.col("product code").str.replace("^$", "Unknown").alias("PROD_CODE"),
    ])
    df = df.with_columns(
        (pl.col("DISCOUNT") - pl.col("CALC_DISCOUNT")).alias("DISC_DIFF"),
    )

    # TAX_DESC
    tax_desc = [
        f"{round(cgst, 2)}% CGST, {round(sgst, 2)}% SGST"
        for cgst, sgst in zip(
            df["product cgst rate"].to_list(),
            df["product sgst rate"].to_list(),
        )
    ]
    df = df.with_columns(pl.Series("TAX_DESC", tax_desc, dtype=pl.Utf8))

    # purchase_frame — select + rename
    purchase_frame = df.select([
        pl.col("bill no").alias("INVOICE_NO"),
        "COMP_NM", "COMP_STATE", "PROD_NM", "PROD_CODE",
        "CUST_NM", "CUST_STATE", "MONTH",
        pl.col("YEAR").cast(pl.Int64),
        "GST_RATE", "TAX_DESC", "INVOICE_AMT", "GST_AMT",
        "TOTAL_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF",
    ])

    text_purchase_cols = ["INVOICE_NO", "COMP_NM", "COMP_STATE", "PROD_NM",
                          "PROD_CODE", "CUST_NM", "CUST_STATE", "MONTH", "TAX_DESC"]
    purchase_frame = purchase_frame.with_columns([
        pl.col(c).cast(pl.Utf8).str.strip_chars().fill_null("") for c in text_purchase_cols
    ])
    num_purchase_cols = ["GST_RATE", "INVOICE_AMT", "GST_AMT", "TOTAL_AMT",
                         "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF"]
    purchase_frame = purchase_frame.with_columns([
        pl.col(c).fill_null(0.0).round(2) for c in num_purchase_cols
    ])

    purchase_data = purchase_frame.to_dicts()

    companies = sorted(df["COMP_NM"].drop_nulls().unique().to_list())
    excel_states = [s for s in df["COMP_STATE"].drop_nulls().unique().to_list() if s and s != "Unknown"]
    states = sorted(list(set(PROMINENT_REGIONS + excel_states)))
    products = sorted(df["PROD_NM"].drop_nulls().unique().to_list())
    customers = sorted(df["CUST_NM"].drop_nulls().unique().to_list())

    # --- PO / GRN / Bank generation ---
    invoice_agg = (
        df.group_by("bill no").agg([
            pl.col("COMP_NM").first(),
            pl.col("CUST_NM").first(),
            pl.col("INVOICE_AMT").sum(),
            pl.col("MONTH").first(),
            pl.col("YEAR").first(),
        ])
    )

    po_data = []
    grn_data = []
    bank_data = []

    for idx, row in enumerate(invoice_agg.to_dicts()):
        inv = safe_text(row["bill no"])
        comp = safe_text(row["COMP_NM"])
        cust = safe_text(row["CUST_NM"])
        amt = round(float(row["INVOICE_AMT"] or 0), 2)
        po_data.append({
            "PO_NO": rand_po(), "INVOICE_NO": inv, "COMP_NM": comp,
            "CUST_NM": cust, "AMT": amt,
            "MONTH": safe_text(row["MONTH"]), "YEAR": int(row["YEAR"] or 0),
        })
        if idx % 5 != 0:
            grn_data.append({
                "GRN_NO": rand_grn(), "INVOICE_NO": inv, "COMP_NM": comp,
                "CUST_NM": cust, "AMT": round(amt * random.uniform(0.95, 1.05), 2),
            })
        if idx % 4 != 0:
            bank_data.append({
                "BANK": rand_bank(), "INVOICE_NO": inv, "COMP_NM": comp,
                "PAYMENT_DAYS": 15 + (idx * 7) % 90,
                "AMT": round(amt * random.uniform(0.96, 1.04), 2),
            })

    orphan_grn_companies = companies[:3] if companies else ["Unknown Vendor"]
    for n, comp in enumerate(orphan_grn_companies, start=1):
        grn_data.append({
            "GRN_NO": rand_grn(), "INVOICE_NO": f"ORPHAN-INV-{300 + n}",
            "COMP_NM": comp, "CUST_NM": comp,
            "AMT": round(random.uniform(20000, 280000), 2),
        })

    # --- blocked vendors ---
    vendor_stats = (
        df.group_by("COMP_NM").agg([
            pl.col("DISCOUNT").sum().alias("DISCOUNT_SUM"),
            pl.col("INVOICE_AMT").sum().alias("INVOICE_AMT_SUM"),
        ])
        .with_columns(
            (pl.col("DISCOUNT_SUM") / pl.col("INVOICE_AMT_SUM").replace(0, None)).fill_null(0).alias("RATIO")
        )
        .sort("RATIO", descending=True)
        .head(4)
    )

    blocked_vendors = []
    for row in vendor_stats.to_dicts():
        comp = safe_text(row["COMP_NM"])
        if not comp:
            continue
        inv_rows = df.filter(pl.col("COMP_NM") == comp)["bill no"]
        invoice_no = safe_text(inv_rows[0]) if len(inv_rows) > 0 else ""
        blocked_vendors.append({
            "VENDOR": comp, "REASON": "High discount ratio / unusual pricing",
            "INV_NO": invoice_no, "AMT": round(float(row["INVOICE_AMT_SUM"]), 2),
        })

    # --- hygiene checks ---
    multi_tax = []
    for prod_code, group in df.group_by("PROD_CODE"):
        rates = sorted({round(r, 2) for r in group["GST_RATE"].to_list() if r is not None})
        descs = sorted({safe_text(d) for d in group["TAX_DESC"].to_list() if safe_text(d)})
        if len(rates) > 1 or len(descs) > 1:
            multi_tax.append({
                "GST_RATE": ", ".join(str(int(r)) if r == int(r) else str(r) for r in rates),
                "TAX_DESC": ", ".join(descs), "COUNT": len(group),
            })

    dup_customers = []
    for name, group in df.group_by("COMP_NM"):
        codes = sorted({safe_text(c) for c in group["store code"].to_list() if safe_text(c)})
        if len(codes) > 1:
            dup_customers.append({"CUST_NM": name, "CUST_CD": ", ".join(codes[:3]), "COUNT": len(group)})

    prod_name_issues = []
    for name, group in df.group_by("PROD_NM"):
        codes = sorted({safe_text(c) for c in group["PROD_CODE"].to_list() if safe_text(c)})
        if len(codes) > 1:
            prod_name_issues.append({"PROD_NM": name, "PROD_CODE": ", ".join(codes[:3]), "COUNT": len(group)})

    prod_gst_issues = []
    for name, group in df.group_by("PROD_NM"):
        rates = sorted({round(r, 2) for r in group["GST_RATE"].to_list() if r is not None})
        if len(rates) > 1:
            prod_gst_issues.append({
                "PROD_NM": name,
                "GST_RATE": ", ".join(str(int(r)) if r == int(r) else str(r) for r in rates),
                "COUNT": len(group),
            })

    prod_code_check = []
    for code, group in df.group_by("PROD_CODE"):
        names = sorted({safe_text(n) for n in group["PROD_NM"].to_list() if safe_text(n)})
        if not safe_text(code):
            prod_code_check.append({"PROD_CODE": "Unknown", "STATUS": "Missing code"})
        elif len(names) > 1:
            prod_code_check.append({"PROD_CODE": code, "STATUS": "Multiple products"})

    # --- GST check ---
    gst_frame = purchase_frame.select(["INVOICE_NO", "INVOICE_AMT", "GST_RATE", "GST_AMT"])
    gst_frame = gst_frame.with_columns([
        ((pl.col("INVOICE_AMT") * pl.col("GST_RATE") / 100).round(2)).alias("EXPECTED_GST"),
    ])
    gst_frame = gst_frame.with_columns([
        ((pl.col("GST_AMT") - pl.col("EXPECTED_GST")).round(2)).alias("DIFF"),
    ])
    gst_frame = gst_frame.with_columns([
        pl.when(pl.col("DIFF").abs() < 1).then(pl.lit("OK")).otherwise(pl.lit("Error")).alias("STATUS"),
    ])
    gst_check = gst_frame.to_dicts()

    # --- Discount check ---
    disc_frame = purchase_frame.select(["INVOICE_NO", "INVOICE_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF"])
    disc_frame = disc_frame.with_columns([
        pl.when(pl.col("DISC_DIFF").abs() < 1).then(pl.lit("OK")).otherwise(pl.lit("Error")).alias("STATUS"),
    ])
    disc_check = disc_frame.to_dicts()

    persist_sqlite_tables(
        po_data=po_data, grn_data=grn_data, bank_data=bank_data,
        blocked_vendors=blocked_vendors, gst_check=gst_check, disc_check=disc_check,
    )

    save_purchase_snapshot(
        purchase_data,
        {
            "dup_customers": dup_customers, "multi_tax": multi_tax,
            "prod_name_issues": prod_name_issues, "prod_gst_issues": prod_gst_issues,
            "prod_code_check": prod_code_check,
        },
    )

    return {
        "purchase": purchase_data, "po": po_data, "grn": grn_data, "bank": bank_data,
        "blocked_vendors": blocked_vendors, "multi_tax": multi_tax,
        "dup_customers": dup_customers, "prod_name_issues": prod_name_issues,
        "prod_gst_issues": prod_gst_issues, "prod_code_check": prod_code_check,
        "gst_check": gst_check, "disc_check": disc_check,
        "companies": companies, "states": states, "products": products,
        "customers": customers, "months": ALL_MONTHS,
    }


DATA = None


def ensure_data_loaded():
    global DATA
    if DATA is None:
        DATA = load_from_sqlite() or load_excel_data()
    return DATA


def _dashboard_payload(payload: dict) -> dict:
    purchase_list = payload["purchase"]
    if purchase_list:
        pf = pl.DataFrame(purchase_list)
        dimensions = ["COMP_NM", "COMP_STATE", "PROD_NM", "CUST_NM", "CUST_STATE", "MONTH", "YEAR"]
        measures = ["INVOICE_AMT", "GST_AMT", "TOTAL_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF"]
        # cast measures to Float64 in case they came back as mixed types
        pf = pf.with_columns([pl.col(c).cast(pl.Float64, strict=False).fill_null(0.0) for c in measures])
        dashboard_rows = (
            pf.group_by(dimensions)
            .agg([pl.col(c).sum().round(2).alias(c) for c in measures])
            .with_columns([
                pl.lit("Aggregated purchase data").alias("INVOICE_NO"),
                pl.lit(0.0).alias("GST_RATE"),
                pl.lit("").alias("TAX_DESC"),
            ])
        )
        purchase_rows = dashboard_rows.to_dicts()
    else:
        purchase_rows = []

    def limited(name, limit=500):
        return payload.get(name, [])[:limit]

    return {
        **payload,
        "purchase_raw": payload["purchase"],
        "purchase": purchase_rows,
        "po": limited("po", 1000),
        "grn": limited("grn", 1000),
        "bank": limited("bank", 1000),
        "blocked_vendors": limited("blocked_vendors"),
        "multi_tax": limited("multi_tax"),
        "dup_customers": limited("dup_customers"),
        "prod_name_issues": limited("prod_name_issues"),
        "prod_gst_issues": limited("prod_gst_issues"),
        "prod_code_check": limited("prod_code_check"),
        "gst_check": limited("gst_check"),
        "disc_check": limited("disc_check"),
        "companies": payload.get("companies", [])[:500],
        "states": payload.get("states", [])[:500],
        "products": payload.get("products", [])[:500],
        "customers": payload.get("customers", [])[:500],
        "months": payload.get("months", []),
    }


# ---------------------------------------------------------------------------
# LARS integration
# ---------------------------------------------------------------------------

LARS_API_URL = "http://45.248.67.66/LARS_Demo_bank/ImportObservationApi.asmx/AddObservations"
LARS_OBS_VIEW_URL = "http://45.248.67.66/LARS_Demo_bank/ObsevationRequestView.aspx"
LARS_USERNAME = "admin"
LARS_PASSWORD = "admin@123"
LARS_COMPANY_ID = 1
LARS_EMP_ID = "P0005"
LARS_REPORT_NO = "2025 - 2026-0023"


def format_lars_date(val) -> str:
    if not val:
        return ""
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("nan", "none", "null", "nat"):
        return ""
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d-%b-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            clean_str = val_str.split()[0] if " " in val_str and fmt != "%Y-%m-%d %H:%M:%S" else val_str
            return datetime.strptime(clean_str, fmt).strftime("%d-%b-%Y")
        except Exception:
            continue
    return val_str


def send_observation_to_lars(data: dict) -> dict:
    raw_target_na = str(data.get("TargetDateNotApplicable", "") or "").strip().lower()
    target_date_na = "Yes" if raw_target_na in ("true", "yes", "1") else "No"
    target_date = "" if target_date_na == "Yes" else format_lars_date(data.get("TargetDate", ""))

    raw_repeat = str(data.get("RepeatObservation", "") or "").strip().lower()
    repeat_val = "Repeat" if raw_repeat in ("repeat", "yes", "true", "1") else "New"

    lars_category = str(data.get("Category") or data.get("category") or "").strip()
    if not lars_category or lars_category.lower() not in ("market risk",):
        lars_category = "Market Risk"

    lars_sbu = str(data.get("SBU", "") or "").strip()
    if lars_sbu.lower() != "corporate":
        lars_sbu = "Corporate"

    obs_type = str(data.get("ObservationType", "") or "").strip()
    if not obs_type or obs_type.lower() in ("compliance", "process defect"):
        obs_type = "Critical"

    risk_type = str(data.get("RiskType", "") or "High").strip() or "High"

    auditee_id = str(data.get("Auditee", "") or "").strip()
    if (not auditee_id or " " in auditee_id or "@" in auditee_id
            or auditee_id.lower() in ("rahul mehta", "rahul", "1002", "1001",
                                       "sneha kulkarni", "sneha", "pooja shah", "amit verma")):
        auditee_id = "Amey"

    raw_company_id = data.get("CompanyID") or data.get("lars_company_id")
    try:
        lars_company_id = int(raw_company_id) if raw_company_id not in (None, "") else LARS_COMPANY_ID
    except Exception:
        lars_company_id = LARS_COMPANY_ID

    lars_emp_id = str(data.get("EmpId") or data.get("lars_emp_id") or LARS_EMP_ID).strip()
    lars_report_no = str(data.get("ReportNo") or data.get("lars_report_no") or LARS_REPORT_NO).strip()

    payload = {
        "request": {
            "CompanyID": lars_company_id,
            "EmpId": lars_emp_id,
            "ReportNo": lars_report_no,
            "Rows": [
                {
                    "ObservationTitle": str(data.get("ObservationTitle", "") or "").strip(),
                    "SBU": lars_sbu,
                    "Category": lars_category,
                    "ObservationType": obs_type,
                    "RiskType": risk_type,
                    "RepeatObservation": repeat_val,
                    "ObservationDescription": str(data.get("ObservationDescription", "") or "").strip(),
                    "ShortObservation": str(data.get("ShortObservation", "") or "").strip(),
                    "Recommendation_1": str(data.get("Recommendation", "") or "").strip(),
                    "Auditee_1": auditee_id,
                    "Corrective_ActionPlan_1": str(data.get("CorrectiveActionPlan", "") or "").strip(),
                    "Preventive_ActionPlan_1": str(data.get("PreventiveActionPlan", "") or "").strip(),
                    "Target_Date_Not_Applicable_1": target_date_na,
                    "Target_Date_1": target_date,
                }
            ],
        }
    }

    headers = {
        "Content-Type": "application/json",
        "username": LARS_USERNAME,
        "passwd": LARS_PASSWORD,
    }

    print(f"DEBUG: Calling LARS API at {LARS_API_URL}")
    print(f"DEBUG: Payload = {json.dumps(payload, indent=2)}")

    response = None
    for attempt in range(2):
        try:
            response = requests.post(LARS_API_URL, json=payload, headers=headers, timeout=30)
            break
        except requests.exceptions.Timeout as to_err:
            if attempt == 0:
                print("LARS API connect timed out (30s), retrying once...")
                time.sleep(1)
                continue
            raise to_err

    print(f"DEBUG: HTTP Status = {response.status_code}")
    response.raise_for_status()

    if not response.text or not response.text.strip():
        raise ValueError(f"LARS API returned an empty response (HTTP {response.status_code})")

    try:
        res_data = response.json()
    except json.JSONDecodeError:
        preview = response.text.strip()[:200]
        raise ValueError(f"LARS API returned non-JSON response (HTTP {response.status_code}): {preview}")

    print("RAW LARS RESPONSE:", res_data)

    d = res_data.get("d") if isinstance(res_data.get("d"), dict) else res_data
    if isinstance(d, dict):
        if d.get("success") is False:
            raise ValueError(f"LARS API error: {d.get('message') or d.get('error') or str(d)}")
        if str(d.get("status", "")).lower() in ("fail", "failed", "error"):
            raise ValueError(f"LARS API error: {d.get('remark') or d.get('message') or str(d)}")

    def find_response_value(value, names):
        if isinstance(value, dict):
            for key, item in value.items():
                if str(key).lower() in names and item not in (None, ""):
                    return item
                found = find_response_value(item, names)
                if found not in (None, ""):
                    return found
        elif isinstance(value, list):
            for item in value:
                found = find_response_value(item, names)
                if found not in (None, ""):
                    return found
        return None

    plan_id = find_response_value(res_data, {"planid", "plan_id"})
    observ_req_id = find_response_value(res_data, {"observreqid", "observ_req_id"})

    if not plan_id or not observ_req_id:
        msg = f": {res_data['message']}" if isinstance(res_data, dict) and "message" in res_data else ""
        raise ValueError(f"LARS API did not return planid or ObservReqID{msg}. Response: {json.dumps(res_data)[:200]}")

    lars_url = None
    try:
        imported = d.get("importedObservations") or []
        if imported and isinstance(imported, list):
            lars_url = imported[0].get("url") or None
    except Exception:
        lars_url = None

    return {"raw_response": res_data, "planid": plan_id, "ObservReqID": observ_req_id, "lars_url": lars_url}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    if not session.get("user_id"):
        return redirect("/login")
    return render_template("index.html")


@app.route("/api/data")
def get_data():
    payload = _dashboard_payload(ensure_data_loaded())
    po_data = payload["po"]
    grn_data = payload["grn"]
    bank_data = payload["bank"]

    po_inv_nos = {p["INVOICE_NO"] for p in po_data}
    grn_inv_nos = {g["INVOICE_NO"] for g in grn_data}

    grn_without_inv = [g for g in grn_data if g["INVOICE_NO"] not in po_inv_nos][:15]
    open_po = [p for p in po_data if p["INVOICE_NO"] not in grn_inv_nos][:15]

    bank_accounts_by_vendor: dict[str, set] = {}
    for b in bank_data:
        bank_accounts_by_vendor.setdefault(b["COMP_NM"], set()).add(b["BANK"])
    bank_summary = [{"COMP_NM": k, "BANK_COUNT": len(v), "BANKS": list(v)} for k, v in bank_accounts_by_vendor.items()]

    avg_pay_days: dict[str, list] = {}
    for b in bank_data:
        avg_pay_days.setdefault(b["COMP_NM"], []).append(b["PAYMENT_DAYS"])
    pay_summary = [{"COMP_NM": k, "AVG_DAYS": round(sum(v) / len(v), 1), "COUNT": len(v)} for k, v in avg_pay_days.items()]

    all_inv = sorted(set(list(po_inv_nos) + list(grn_inv_nos) + [b["INVOICE_NO"] for b in bank_data]))[:45]
    comparison = []
    for inv in all_inv:
        po = next((p for p in po_data if p["INVOICE_NO"] == inv), None)
        grn = next((g for g in grn_data if g["INVOICE_NO"] == inv), None)
        bank = next((b for b in bank_data if b["INVOICE_NO"] == inv), None)
        comparison.append({
            "INVOICE_NO": inv,
            "COMP_NM": po["COMP_NM"] if po else (grn["COMP_NM"] if grn else (bank["COMP_NM"] if bank else "-")),
            "PO_NO": po["PO_NO"] if po else "Missing",
            "PO_AMT": po["AMT"] if po else 0,
            "GRN_NO": grn["GRN_NO"] if grn else "Missing",
            "GRN_AMT": grn["AMT"] if grn else 0,
            "BANK": bank["BANK"] if bank else "Missing",
            "BANK_AMT": bank["AMT"] if bank else 0,
            "MATCH": "✓ Match" if (grn and bank) else ("⚠ Partial" if (grn or bank) else "✗ Missing"),
        })

    return jsonify({
        **payload,
        "hygiene_remarks": get_hygiene_remarks(),
        "comparison": comparison,
        "grn_without_inv": grn_without_inv,
        "open_po": open_po,
        "bank_summary": bank_summary,
        "pay_summary": pay_summary,
    })


@app.route("/api/audit-trail", methods=["GET"])
def get_audit_trail_data():
    rows = get_audit_trail_rows()
    return jsonify(build_audit_trail_payload(rows))


@app.route("/api/audit-trail/upload", methods=["POST"])
def upload_audit_trail_file():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"success": False, "error": "No file uploaded"}), 400

    filename = secure_filename(uploaded.filename)
    if not filename.lower().endswith((".xlsx", ".xls")):
        return jsonify({"success": False, "error": "Please upload an Excel file (.xlsx or .xls)"}), 400

    temp_fd, temp_path = tempfile.mkstemp(suffix=os.path.splitext(filename)[1])
    os.close(temp_fd)
    try:
        uploaded.save(temp_path)
        df = pl.read_excel(temp_path, infer_schema_length=0)
        rows = parse_audit_trail_rows(df)
        save_audit_trail_rows(rows, filename)
        return jsonify({"success": True, "rows": len(rows), "file": filename})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ── OBSERVATIONS ENDPOINTS ──────────────────────────────────────

@app.route("/api/observations", methods=["GET"])
def get_observations():
    category = request.args.get("category", "").strip()
    try:
        with get_db_connection() as conn:
            if category:
                rows = conn.execute(
                    "SELECT * FROM observations WHERE category = ? ORDER BY id DESC", (category,)
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM observations ORDER BY id DESC").fetchall()
            return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/observations", methods=["POST"])
def save_observation():
    data = request.get_json(silent=True) or {}
    obs_id = data.get("id")

    fields = [
        "category", "table_name", "entity_key", "ObservationTitle", "ObservationSubProcess",
        "RepeatObservation", "ObservationType", "RiskType", "Department", "SBU",
        "FollowUpFrequency", "ShareWith", "ObservationDescription", "ShortObservation",
        "RootCause", "ImpactConcern", "FinancialImplication", "Auditee", "OtherAuditee",
        "Escalator1", "Escalator2", "Escalator3", "Recommendation",
        "CorrectiveActionPlan", "PreventiveActionPlan", "ShortActionPlan",
        "TargetDateNotApplicable", "TargetDate", "RevisedTargetDate",
        "PercentageCompletedAuditee", "PercentageCompletedAuditor",
        "ClosureDate", "ClosureReason", "FromDate", "ToDate",
        "CompanyID", "EmpId", "ReportNo",
    ]
    vals = [str(data.get(f, "") or "").strip() for f in fields]

    try:
        with get_db_connection() as conn:
            if obs_id:
                set_clause = ", ".join([f"{f} = ?" for f in fields])
                conn.execute(
                    f"UPDATE observations SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (*vals, obs_id),
                )
                saved_obs_id = obs_id
            else:
                cols = ", ".join(fields)
                placeholders = ", ".join(["?"] * len(fields))
                cursor = conn.execute(f"INSERT INTO observations ({cols}) VALUES ({placeholders})", vals)
                saved_obs_id = cursor.lastrowid
            conn.commit()

        lars_status = "not_sent"
        lars_ids = {}
        try:
            lars_res = send_observation_to_lars(data)
            plan_id = lars_res.get("planid")
            observ_req_id = lars_res.get("ObservReqID")
            lars_url = lars_res.get("lars_url")
            lars_ids = {"planid": plan_id, "ObservReqID": observ_req_id, "lars_url": lars_url}
            if plan_id and observ_req_id:
                lars_status = "success"
                with get_db_connection() as conn:
                    conn.execute(
                        "UPDATE observations SET lars_observ_req_id = ?, lars_plan_id = ?, lars_url = ? WHERE id = ?",
                        (str(observ_req_id), str(plan_id), lars_url, saved_obs_id),
                    )
                    conn.commit()
            else:
                lars_status = "failed: Missing planid or ObservReqID from LARS"
        except Exception as lars_err:
            print("LARS API Sync Warning:", str(lars_err))
            lars_status = f"failed: {str(lars_err)}"

        return jsonify({"success": True, "lars_sync": lars_status, "lars_data": lars_ids})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/observations/delete", methods=["POST"])
def delete_observation():
    data = request.get_json(silent=True) or {}
    obs_id = data.get("id")
    if not obs_id:
        return jsonify({"success": False, "error": "Missing ID"}), 400
    try:
        with get_db_connection() as conn:
            conn.execute("DELETE FROM observations WHERE id = ?", (obs_id,))
            conn.commit()
            return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/hygiene/remark", methods=["POST"])
def save_hygiene_remark():
    data = request.get_json(silent=True) or {}
    issue_id = data.get("issue_id")
    category = data.get("category", "")
    entity_key = data.get("entity_key", "")
    remark = data.get("remark", "")
    action = data.get("action", "save")

    if not issue_id:
        return jsonify({"success": False, "error": "Missing issue_id"}), 400

    try:
        if action == "delete":
            delete_hygiene_remark_encrypted(issue_id)
        else:
            save_hygiene_remark_encrypted(issue_id, category, entity_key, remark)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/observations/upload", methods=["POST"])
def upload_observation_file():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"success": False, "error": "No file uploaded"}), 400

    filename = secure_filename(uploaded.filename)
    if not filename.lower().endswith((".xlsx", ".xls")):
        return jsonify({"success": False, "error": "Please upload an Excel file (.xlsx or .xls)"}), 400

    temp_fd, temp_path = tempfile.mkstemp(suffix=os.path.splitext(filename)[1])
    os.close(temp_fd)
    try:
        uploaded.save(temp_path)
        df = pl.read_excel(temp_path, infer_schema_length=0)
        df = normalize_observation_headers(df)

        # Auto-fill LARS fields if missing
        if "CompanyID" not in df.columns:
            df = df.with_columns(pl.lit(str(LARS_COMPANY_ID)).alias("CompanyID"))
        if "EmpId" not in df.columns:
            df = df.with_columns(pl.lit(LARS_EMP_ID).alias("EmpId"))
        if "ReportNo" not in df.columns:
            df = df.with_columns(pl.lit(LARS_REPORT_NO).alias("ReportNo"))

        missing_headers = [field for field in ALL_FIELDS if field not in df.columns]
        if missing_headers:
            return jsonify({"success": False, "error": f"Missing required columns: {', '.join(missing_headers)}"}), 400

        cat_series = df["category"].to_list() if "category" in df.columns else []
        categories_in_file = sorted({safe_value(v) for v in cat_series if safe_value(v) in VALID_CATEGORIES})

        inserted = skipped = ignored_blank = 0

        with get_db_connection() as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            for category_name in categories_in_file:
                conn.execute("DELETE FROM observations WHERE category = ?", (category_name,))

            for row_num, row in enumerate(df.to_dicts()):
                if row_is_completely_empty(row):
                    ignored_blank += 1
                    continue

                category = safe_value(row.get("category"))
                if category not in VALID_CATEGORIES:
                    skipped += 1
                    continue

                entity_key = safe_value(row.get("entity_key"))
                if not entity_key:
                    entity_key = make_entity_key(
                        safe_value(row.get("ObservationTitle")),
                        safe_value(row.get("table_name")),
                        row_num + 2,
                    )

                values = [
                    entity_key if field == "entity_key" else safe_value(row.get(field))
                    for field in ALL_FIELDS
                ]
                columns = ", ".join(ALL_FIELDS)
                placeholders = ", ".join(["?"] * len(ALL_FIELDS))
                conn.execute(f"INSERT INTO observations ({columns}) VALUES ({placeholders})", values)
                inserted += 1

            conn.commit()

        return jsonify({"success": True, "inserted": inserted, "skipped": skipped, "ignored_blank": ignored_blank})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ── Document OCR / KYC extraction ───────────────────────────────

@app.route("/data-extraction")
def data_extraction_page():
    return render_template("pages/data_extraction.html")


@app.route("/api/extract-kyc", methods=["POST"])
def extract_kyc():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded"}), 400

    records = []
    for file in files:
        filename = file.filename
        ext = filename.lower().split(".")[-1]
        try:
            if ext in ("jpg", "jpeg", "png"):
                img = Image.open(file.stream)
                text = pytesseract.image_to_string(img, lang="eng")
            elif ext == "pdf":
                file_bytes = file.read()
                pages = convert_from_bytes(file_bytes, dpi=300)
                text = "".join(pytesseract.image_to_string(p, lang="eng") for p in pages)
            else:
                continue

            t_upper = text.upper()
            if "AADHAAR" in t_upper or "UIDAI" in t_upper:
                doc_type = "Aadhaar Card"
                match = re.search(r"\b\d{4}\s\d{4}\s\d{4}\b", text)
                doc_number = match.group().replace(" ", "") if match else ""
            elif "INCOME TAX DEPARTMENT" in t_upper or "PERMANENT ACCOUNT NUMBER" in t_upper:
                doc_type = "PAN Card"
                match = re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", text)
                doc_number = match.group() if match else ""
            else:
                doc_type = "Unknown"
                doc_number = ""

            records.append({
                "File Name": filename, "Document Type": doc_type,
                "Document Number": doc_number, "Person Name": "",
            })
        except Exception as e:
            records.append({"File Name": filename, "Document Type": "Error",
                            "Document Number": "", "Person Name": str(e)})

    output = io.BytesIO()
    pl.DataFrame(records).write_excel(output)
    output.seek(0)
    return send_file(
        output,
        download_name="id_extracted_data.xlsx",
        as_attachment=True,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# ── Document tampering detection ─────────────────────────────────

FORENSICS_PROMPT = """You are an elite digital document forensics system tasked with analyzing an image for sophisticated tampering.
Perform an exhaustive pixel-level and semantic analysis based on standard forensic criteria.

CRITICAL VISUAL ANALYSIS DIRECTION:
1. FONT TEXTURE AND SOFTNESS COMPARISON: Real documents captured via scans or cameras exhibit a uniform edge softness/fuzziness across both labels and their corresponding values. Closely inspect fields like names, designations, and dates. If a text label (e.g., 'Date of Birth:') looks soft or compressed, but its associated value (e.g., the numerical date) is perfectly crisp, bold, or uses a high-contrast modern digital font, flag this as a critical digital overlay anomaly.
2. COMPRESSION AND RESAMPLING MISMATCHES: Look for individual words or blocks of text (such as specific job designations or specific numeric fields) that appear visually sharper, heavier in weight, or display brighter compression auras than the baseline template text surrounding them.
3. GEOGRAPHIC & JURISDICTIONAL LOGIC: Cross-reference the administrative locations. If an issuing authority belongs to one specific district (e.g., Goalpara), but the deployment data or personal address explicitly places them in a non-overlapping district (e.g., Udalguri), flag this as an impossible administrative contradiction.

Provide your forensic report in this exact schema:
- IDENTIFIED DOCUMENT: [Type of document]
- COMPREHENSIVE VERDICT: [FAILED / TAMPERED or PASSED / AUTHENTIC]
- FRAUD RISK CONFIDENCE (0-100%): [Score]
- DETECTED VISUAL ANOMALIES: [Clearly point out any font edge softness mismatches, sharp digital overlays, or suspicious text boldness gaps compared to their labels]
- DETECTED TEXTUAL ANOMALIES: [Detail any geographic, chronological, or logical contradictions]
"""


@app.route("/analyze", methods=["POST"])
def analyze():
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded."}), 400
    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "No image file selected."}), 400
    if client is None:
        return jsonify({"error": "Server is not configured with a Gemini API key."}), 503

    image_bytes = file.read()
    mime_type = file.mimetype or "image/png"
    try:
        response = client.models.generate_content(
            model=GEN_MODEL,
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), FORENSICS_PROMPT],
        )
        return jsonify({"report": response.text})
    except Exception as e:
        return jsonify({"error": f"Pipeline execution failure: {e}"}), 500


# ── KYC / PAN verification ───────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload():
    f = request.files.get("file")
    if f is None:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pl.read_excel(f, infer_schema_length=0)
    except Exception:
        return jsonify({"error": "Unable to read Excel file"}), 400

    pan_col = None
    for c in df.columns:
        if c.lower() in ("pan", "pan_number", "pan no", "pan_no"):
            pan_col = c
            break
    if pan_col is None:
        pan_col = df.columns[0]

    results = []
    for pan in df[pan_col].drop_nulls().cast(pl.Utf8).to_list():
        pan = pan.strip()
        try:
            resp = api.verify_pan_kyc(pan)
            if isinstance(resp, dict):
                data = resp.get("data") or resp.get("Data") or {}
                if data and "pan" not in data:
                    data["pan"] = pan
                results.append(data if data else {"pan": pan, "error": "no data"})
            else:
                results.append({"pan": pan, "error": "no response"})
        except Exception as e:
            results.append({"pan": pan, "error": str(e)})

    return jsonify({"results": results})


@app.route("/download_excel", methods=["POST"])
def download_excel():
    payload = request.get_json() or {}
    rows = payload.get("rows") or []
    if not rows:
        return jsonify({"error": "no rows provided"}), 400

    output = io.BytesIO()
    pl.DataFrame(rows).write_excel(output)
    output.seek(0)
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="pan_results.xlsx",
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)