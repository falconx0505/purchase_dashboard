# pyrefly: ignore [missing-import]
import os
import random
import re
import sqlite3
import tempfile
import zipfile
from xml.etree.ElementTree import iterparse
from flask import Flask, render_template, jsonify, request
from werkzeug.utils import secure_filename
import pandas as pd

VALID_CATEGORIES = {
    # Purchase Data Hygiene categories (original module)
    "multi_tax", "prod_gst", "dup_cust", "prod_name", "prod_code",
    # ── IT CONTROLS MODULE — observation categories for the 6 IT Controls cards
    "itc_access_lwd", "itc_inactive_90", "itc_pwd_stale",
    "itc_after_hours", "itc_failed_login", "itc_above_limit",
    # ── HR AND PAYROLL MODULE — observation categories for the 6 HR & Payroll cards
    "hr_dup_bank", "hr_dup_pan_aadhaar", "hr_missing_ids",
    "hr_missing_master", "hr_same_pan",
}

# Every column the observations table actually has (excluding id/updated_at,
# which the database fills in on its own). Excel headers for the Upload
# feature must match these names exactly.
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
]


def safe_value(value):
    """Turn blank/NaN Excel cells into empty string, everything else into text."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def make_entity_key(title, table_name, row_num):
    """Build a fallback unique reference when entity_key is left blank."""
    base = title or table_name or f"row-{row_num}"
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", base).strip("_").lower()
    return slug or f"row-{row_num}"


def row_is_completely_empty(row):
    """True if every mapped field in this Excel row is blank (e.g. a stray blank line)."""
    return all(safe_value(row.get(field)) == "" for field in ALL_FIELDS)


app = Flask(__name__)
random.seed(42)

# Disable static-file caching in dev so the browser always loads the latest
# main.js / style.css (relevant for the IT Controls / HR and Payroll work,
# since a cached old main.js would otherwise hide those pages after edits).
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["TEMPLATES_AUTO_RELOAD"] = True

# File and Database Paths
DATA_PATH = os.path.join(os.path.dirname(__file__), "60rowdata .xlsx")
DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

ALL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MONTH_ORDER = ALL_MONTHS
PROMINENT_REGIONS = ["Bangalore", "Mumbai", "Delhi NCR", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad"]
BANKS = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak Bank"]

USE_COLUMNS = {
    "bill no", "store code", "store name", "ordering channel", "source", "region",
    "product code", "product name", "product cgst rate", "product sgst rate",
    "product cgst amount", "product sgst amount", "net sale", "gross sale",
    "item price", "quantity", "marketing discount amount", "loyalty discount amount",
    "bill date time", "business day date"
}
XML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RE_COL = re.compile(r"([A-Z]+)")

def rand_po():
    return f"PO-{random.randint(1000, 9999)}"

def rand_grn():
    return f"GRN-{random.randint(100, 999)}"

def rand_bank():
    return random.choice(BANKS)

def safe_text(value, default=""):
    if pd.isna(value):
        return default
    return str(value).strip()

def normalize_columns(columns):
    return [str(c).strip().lower() for c in columns]

def parse_excel_dates(values):
    raw = values.astype(str).str.strip()
    serial = pd.to_numeric(raw, errors="coerce")
    parsed = pd.to_datetime(serial, unit="D", origin="1899-12-30", errors="coerce")
    text_rows = serial.isna() & raw.ne("")
    if text_rows.any():
        parsed.loc[text_rows] = pd.to_datetime(raw.loc[text_rows], format="mixed", errors="coerce")
    return parsed

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
    CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        table_name TEXT,
        entity_key TEXT,
        ObservationTitle TEXT,
        ObservationSubProcess TEXT,
        RepeatObservation TEXT,
        ObservationType TEXT,
        RiskType TEXT,
        Department TEXT,
        SBU TEXT,
        FollowUpFrequency TEXT,
        ShareWith TEXT,
        ObservationDescription TEXT,
        ShortObservation TEXT,
        RootCause TEXT,
        ImpactConcern TEXT,
        FinancialImplication TEXT,
        Auditee TEXT,
        OtherAuditee TEXT,
        Escalator1 TEXT,
        Escalator2 TEXT,
        Escalator3 TEXT,
        Recommendation TEXT,
        CorrectiveActionPlan TEXT,
        PreventiveActionPlan TEXT,
        ShortActionPlan TEXT,
        TargetDateNotApplicable BOOLEAN,
        TargetDate DATE,
        RevisedTargetDate DATE,
        PercentageCompletedAuditee DECIMAL(5,2),
        PercentageCompletedAuditor DECIMAL(5,2),
        ClosureDate DATE,
        ClosureReason TEXT,
        FromDate DATE,
        ToDate DATE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db_schema(conn)
    return conn


def normalize_observation_headers(df):
    canonical_map = {re.sub(r"[^a-zA-Z0-9]+", "", str(name)).lower(): name for name in ALL_FIELDS}
    renamed = {}
    for original in df.columns:
        key = re.sub(r"[^a-zA-Z0-9]+", "", str(original)).lower()
        if key in canonical_map:
            renamed[original] = canonical_map[key]
    if renamed:
        df = df.rename(columns=renamed)
    return df

def get_hygiene_remarks():
    if not os.path.exists(DB_PATH):
        return {}
    try:
        with get_db_connection() as conn:
            rows = conn.execute("SELECT issue_id, remark FROM hygiene_remarks").fetchall()
            return {row["issue_id"]: row["remark"] or "" for row in rows}
    except Exception as e:
        print("Error reading hygiene_remarks:", e)
        return {}

def load_from_sqlite():
    if not os.path.exists(DB_PATH):
        return None

    with get_db_connection() as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required_tables = {
            "purchases", "po", "grn", "bank", "blocked_vendors", "multi_tax",
            "dup_customers", "prod_name_issues", "prod_gst_issues",
            "prod_code_check", "gst_check", "disc_check"
        }
        if not required_tables.issubset(tables):
            return None

        purchase_df = pd.read_sql_query("SELECT * FROM purchases", conn)
        if purchase_df.empty:
            return None

        purchase = purchase_df.rename(columns={
            "invoice_no": "INVOICE_NO", "comp_nm": "COMP_NM", "comp_state": "COMP_STATE",
            "prod_nm": "PROD_NM", "prod_code": "PROD_CODE", "cust_nm": "CUST_NM",
            "cust_state": "CUST_STATE", "month": "MONTH", "year": "YEAR",
            "gst_rate": "GST_RATE", "tax_desc": "TAX_DESC", "invoice_amt": "INVOICE_AMT",
            "gst_amt": "GST_AMT", "total_amt": "TOTAL_AMT", "discount": "DISCOUNT",
            "calc_discount": "CALC_DISCOUNT", "disc_diff": "DISC_DIFF",
        }).to_dict(orient="records")

        po = pd.read_sql_query("SELECT * FROM po", conn).to_dict(orient="records")
        grn = pd.read_sql_query("SELECT * FROM grn", conn).to_dict(orient="records")
        bank = pd.read_sql_query("SELECT * FROM bank", conn).to_dict(orient="records")
        blocked_vendors = pd.read_sql_query("SELECT * FROM blocked_vendors", conn).to_dict(orient="records")
        multi_tax = pd.read_sql_query("SELECT * FROM multi_tax", conn).to_dict(orient="records")
        dup_customers = pd.read_sql_query("SELECT * FROM dup_customers", conn).to_dict(orient="records")
        prod_name_issues = pd.read_sql_query("SELECT * FROM prod_name_issues", conn).to_dict(orient="records")
        prod_gst_issues = pd.read_sql_query("SELECT * FROM prod_gst_issues", conn).to_dict(orient="records")
        prod_code_check = pd.read_sql_query("SELECT * FROM prod_code_check", conn).to_dict(orient="records")
        gst_check = pd.read_sql_query("SELECT * FROM gst_check", conn).to_dict(orient="records")
        disc_check = pd.read_sql_query("SELECT * FROM disc_check", conn).to_dict(orient="records")

        companies = sorted({r.get("COMP_NM") for r in purchase if r.get("COMP_NM")})
        db_states = {r.get("COMP_STATE") for r in purchase if r.get("COMP_STATE") and r.get("COMP_STATE") != "Unknown"}
        states = sorted(list(set(PROMINENT_REGIONS + list(db_states))))
        products = sorted({r.get("PROD_NM") for r in purchase if r.get("PROD_NM")})
        customers = sorted({r.get("CUST_NM") for r in purchase if r.get("CUST_NM")})
        months = ALL_MONTHS

        return {
            "purchase": purchase, "po": po, "grn": grn, "bank": bank,
            "blocked_vendors": blocked_vendors, "multi_tax": multi_tax,
            "dup_customers": dup_customers, "prod_name_issues": prod_name_issues,
            "prod_gst_issues": prod_gst_issues, "prod_code_check": prod_code_check,
            "gst_check": gst_check, "disc_check": disc_check,
            "companies": companies, "states": states, "products": products,
            "customers": customers, "months": months,
        }

def persist_sqlite_tables(df, po_data, grn_data, bank_data, blocked_vendors,
                          multi_tax, dup_customers, prod_name_issues,
                          prod_gst_issues, prod_code_check, gst_check, disc_check):
    db_df = df.rename(columns={
        "bill no": "invoice_no", "store code": "store_code", "store name": "store_name",
        "ordering channel": "ordering_channel", "product code": "product_code",
        "product name": "product_name", "product cgst rate": "product_cgst_rate",
        "product sgst rate": "product_sgst_rate", "product cgst amount": "product_cgst_amount",
        "product sgst amount": "product_sgst_amount", "net sale": "net_sale",
        "gross sale": "gross_sale", "item price": "item_price",
        "marketing discount amount": "marketing_discount_amount",
        "loyalty discount amount": "loyalty_discount_amount",
        "bill date time": "bill_date_time", "business day date": "business_day_date",
        "COMP_NM": "comp_nm", "COMP_STATE": "comp_state", "CUST_NM": "cust_nm",
        "CUST_STATE": "cust_state", "PROD_NM": "prod_nm", "PROD_CODE": "prod_code",
        "MONTH": "month", "YEAR": "year", "GST_RATE": "gst_rate", "TAX_DESC": "tax_desc",
        "INVOICE_AMT": "invoice_amt", "GST_AMT": "gst_amt", "TOTAL_AMT": "total_amt",
        "DISCOUNT": "discount", "CALC_DISCOUNT": "calc_discount", "DISC_DIFF": "disc_diff",
    })
    if "bill_date_time" in db_df.columns:
        db_df["bill_date_time"] = pd.to_datetime(db_df["bill_date_time"], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")
    if "business_day_date" in db_df.columns:
        db_df["business_day_date"] = pd.to_datetime(db_df["business_day_date"], errors="coerce").dt.strftime("%Y-%m-%d")

    table_columns = {
        "po": ["PO_NO", "INVOICE_NO", "COMP_NM", "CUST_NM", "AMT", "MONTH", "YEAR"],
        "grn": ["GRN_NO", "INVOICE_NO", "COMP_NM", "CUST_NM", "AMT"],
        "bank": ["BANK", "INVOICE_NO", "COMP_NM", "PAYMENT_DAYS", "AMT"],
        "blocked_vendors": ["VENDOR", "REASON", "INV_NO", "AMT"],
        "multi_tax": ["GST_RATE", "TAX_DESC", "COUNT"],
        "dup_customers": ["CUST_NM", "CUST_CD", "COUNT"],
        "prod_name_issues": ["PROD_NM", "PROD_CODE", "COUNT"],
        "prod_gst_issues": ["PROD_NM", "GST_RATE", "COUNT"],
        "prod_code_check": ["PROD_CODE", "STATUS"],
        "gst_check": ["INVOICE_NO", "INVOICE_AMT", "GST_RATE", "GST_AMT", "EXPECTED_GST", "DIFF", "STATUS"],
        "disc_check": ["INVOICE_NO", "INVOICE_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF", "STATUS"],
    }

    def write_table(conn, name, rows):
        pd.DataFrame(rows, columns=table_columns[name]).to_sql(name, conn, if_exists="replace", index=False)

    with get_db_connection() as conn:
        db_df.to_sql("purchases", conn, if_exists="replace", index=False)
        write_table(conn, "po", po_data)
        write_table(conn, "grn", grn_data)
        write_table(conn, "bank", bank_data)
        write_table(conn, "blocked_vendors", blocked_vendors)
        write_table(conn, "multi_tax", multi_tax)
        write_table(conn, "dup_customers", dup_customers)
        write_table(conn, "prod_name_issues", prod_name_issues)
        write_table(conn, "prod_gst_issues", prod_gst_issues)
        write_table(conn, "prod_code_check", prod_code_check)
        write_table(conn, "gst_check", gst_check)
        write_table(conn, "disc_check", disc_check)

def _col_letter_to_index(ref):
    letters = RE_COL.match(ref)
    if not letters:
        return 0
    col = letters.group(1)
    idx = 0
    for ch in col:
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1

def _extract_shared_strings(z):
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

def _find_sheet_path(z):
    if "xl/worksheets/sheet1.xml" in z.namelist():
        return "xl/worksheets/sheet1.xml"
    for name in z.namelist():
        if name.startswith("xl/worksheets/") and name.endswith(".xml"):
            return name
    raise FileNotFoundError("No worksheet XML found in XLSX archive")

def load_excel_data():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Excel source not found: {DATA_PATH}")

    with zipfile.ZipFile(DATA_PATH, "r") as z:
        shared_strings = _extract_shared_strings(z)
        sheet_path = _find_sheet_path(z)
        rows = []
        header = []
        with z.open(sheet_path) as f:
            row_idx = 0
            for event, elem in iterparse(f, events=("start", "end")):
                if event == "end" and elem.tag == XML_NS + "row":
                    row_cells = {}
                    for c in elem.findall(XML_NS + "c"):
                        ref = c.get("r", "")
                        idx = _col_letter_to_index(ref)
                        value = ""
                        if c.get("t") == "s":
                            v = c.find(XML_NS + "v")
                            if v is not None and v.text is not None:
                                value = shared_strings[int(v.text)]
                        elif c.get("t") == "inlineStr":
                            value = "".join(t.text or "" for t in c.findall('.//' + XML_NS + "t"))
                        else:
                            v = c.find(XML_NS + "v")
                            value = v.text if v is not None and v.text is not None else ""
                        row_cells[idx] = value
                    max_idx = max(row_cells.keys()) if row_cells else -1
                    row_values = [row_cells.get(i, "") for i in range(max_idx + 1)]
                    if row_idx == 0:
                        header = [str(v).strip().lower() if v is not None else "" for v in row_values]
                    else:
                        rows.append(row_values)
                    row_idx += 1
                    elem.clear()
        
        selected_rows = []
        selected_columns = [i for i, name in enumerate(header) if name in USE_COLUMNS]
        selected_headers = [header[i] for i in selected_columns]
        for row_values in rows:
            selected_rows.append({
                selected_headers[i]: row_values[idx] if idx < len(row_values) else ""
                for i, idx in enumerate(selected_columns)
            })

    df = pd.DataFrame(selected_rows)
    df.columns = normalize_columns(df.columns)

    for col in ["bill no", "store code", "store name", "ordering channel", "source", "region", "product code", "product name"]:
        df[col] = df.get(col, "").astype(str).fillna("").str.strip()

    numeric_columns = [
        "product cgst rate", "product sgst rate", "product cgst amount", "product sgst amount",
        "net sale", "gross sale", "item price", "quantity", "marketing discount amount", "loyalty discount amount"
    ]
    for col in numeric_columns:
        df[col] = pd.to_numeric(df.get(col, 0), errors="coerce").fillna(0.0)

    df["bill date time"] = parse_excel_dates(df.get("bill date time", df.get("business day date")))
    df["business day date"] = parse_excel_dates(df.get("business day date", df["bill date time"]))

    df["MONTH"] = df["business day date"].dt.strftime("%B").fillna("Unknown")
    df["YEAR"] = df["business day date"].dt.year.fillna(0).astype(int)

    df["GST_RATE"] = df["product cgst rate"] + df["product sgst rate"]
    df["TAX_DESC"] = df["product cgst rate"].map(lambda v: f"{round(v, 2)}% CGST") + ", " + df["product sgst rate"].map(lambda v: f"{round(v, 2)}% SGST")
    df["INVOICE_AMT"] = df["net sale"]
    df["GST_AMT"] = df["product cgst amount"] + df["product sgst amount"]
    df["TOTAL_AMT"] = df["gross sale"]
    df["DISCOUNT"] = df["marketing discount amount"] + df["loyalty discount amount"]
    df["CALC_DISCOUNT"] = (df["item price"] * df["quantity"]) - df["net sale"]
    df["DISC_DIFF"] = df["DISCOUNT"] - df["CALC_DISCOUNT"]
    df["COMP_NM"] = df["store name"].replace("", "Unknown Store")
    df["COMP_STATE"] = df["region"].replace("", "Unknown")
    df["CUST_NM"] = df["ordering channel"].replace("", "Unknown")
    df["CUST_STATE"] = df["source"].replace("", "Unknown")
    df["PROD_NM"] = df["product name"].replace("", "Unknown Product")
    df["PROD_CODE"] = df["product code"].replace("", "Unknown")

    purchase_columns = {
        "bill no": "INVOICE_NO", "COMP_NM": "COMP_NM", "COMP_STATE": "COMP_STATE",
        "PROD_NM": "PROD_NM", "PROD_CODE": "PROD_CODE", "CUST_NM": "CUST_NM",
        "CUST_STATE": "CUST_STATE", "MONTH": "MONTH", "YEAR": "YEAR",
        "GST_RATE": "GST_RATE", "TAX_DESC": "TAX_DESC", "INVOICE_AMT": "INVOICE_AMT",
        "GST_AMT": "GST_AMT", "TOTAL_AMT": "TOTAL_AMT", "DISCOUNT": "DISCOUNT",
        "CALC_DISCOUNT": "CALC_DISCOUNT", "DISC_DIFF": "DISC_DIFF",
    }
    purchase_frame = df[list(purchase_columns)].rename(columns=purchase_columns).copy()
    text_columns = ["INVOICE_NO", "COMP_NM", "COMP_STATE", "PROD_NM", "PROD_CODE", "CUST_NM", "CUST_STATE", "MONTH", "TAX_DESC"]
    purchase_frame[text_columns] = purchase_frame[text_columns].fillna("").astype(str).apply(lambda col: col.str.strip())
    purchase_frame["YEAR"] = purchase_frame["YEAR"].fillna(0).astype(int)
    number_columns = ["GST_RATE", "INVOICE_AMT", "GST_AMT", "TOTAL_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF"]
    purchase_frame[number_columns] = purchase_frame[number_columns].fillna(0).astype(float).round(2)
    purchase_data = purchase_frame.to_dict(orient="records")

    companies = sorted(df["COMP_NM"].dropna().astype(str).unique())
    excel_states = [s for s in df["COMP_STATE"].dropna().astype(str).unique() if s and s != "Unknown"]
    states = sorted(list(set(PROMINENT_REGIONS + excel_states)))
    products = sorted(df["PROD_NM"].dropna().astype(str).unique())
    customers = sorted(df["CUST_NM"].dropna().astype(str).unique())
    months = ALL_MONTHS

    po_data = []
    grn_data = []
    bank_data = []
    invoice_rows = df.groupby("bill no", sort=False, as_index=False).agg(
        COMP_NM=("COMP_NM", "first"), CUST_NM=("CUST_NM", "first"),
        INVOICE_AMT=("INVOICE_AMT", "sum"), MONTH=("MONTH", "first"), YEAR=("YEAR", "first"),
    )
    for idx, row in enumerate(invoice_rows.itertuples(index=False)):
        inv = row[0]
        comp = safe_text(row.COMP_NM)
        cust = safe_text(row.CUST_NM)
        amt = round(float(row.INVOICE_AMT), 2)
        po_data.append({
            "PO_NO": rand_po(), "INVOICE_NO": safe_text(inv), "COMP_NM": comp,
            "CUST_NM": cust, "AMT": amt, "MONTH": safe_text(row.MONTH), "YEAR": int(row.YEAR or 0),
        })
        if idx % 5 != 0:
            grn_data.append({
                "GRN_NO": rand_grn(), "INVOICE_NO": safe_text(inv), "COMP_NM": comp,
                "CUST_NM": cust, "AMT": round(amt * random.uniform(0.95, 1.05), 2),
            })
        if idx % 4 != 0:
            bank_data.append({
                "BANK": rand_bank(), "INVOICE_NO": safe_text(inv), "COMP_NM": comp,
                "PAYMENT_DAYS": 15 + (idx * 7) % 90, "AMT": round(amt * random.uniform(0.96, 1.04), 2),
            })

    vendor_stats = df.groupby("COMP_NM").agg({"DISCOUNT": "sum", "INVOICE_AMT": "sum"}).reset_index()
    vendor_stats["RATIO"] = vendor_stats.apply(lambda row: row["DISCOUNT"] / row["INVOICE_AMT"] if row["INVOICE_AMT"] else 0, axis=1)
    blocked_vendors = []
    for _, row in vendor_stats.sort_values("RATIO", ascending=False).head(4).iterrows():
        comp = safe_text(row["COMP_NM"])
        if not comp:
            continue
        invoice_no = df[df["COMP_NM"] == comp]["bill no"].iloc[0]
        blocked_vendors.append({
            "VENDOR": comp, "REASON": "High discount ratio / unusual pricing",
            "INV_NO": safe_text(invoice_no), "AMT": round(row["INVOICE_AMT"], 2),
        })

    multi_tax = []
    for prod_code, group in df.groupby("PROD_CODE"):
        rates = sorted({round(r, 2) for r in group["GST_RATE"] if not pd.isna(r)})
        descs = sorted({safe_text(desc) for desc in group["TAX_DESC"] if safe_text(desc)})
        if len(rates) > 1 or len(descs) > 1:
            multi_tax.append({
                "GST_RATE": ", ".join(str(int(r)) if r == int(r) else str(r) for r in rates),
                "TAX_DESC": ", ".join(descs), "COUNT": len(group),
            })

    dup_customers = []
    for name, group in df.groupby("COMP_NM"):
        codes = sorted({safe_text(code) for code in group["store code"] if safe_text(code)})
        if len(codes) > 1:
            dup_customers.append({"CUST_NM": name, "CUST_CD": ", ".join(codes[:3]), "COUNT": len(group)})

    prod_name_issues = []
    for name, group in df.groupby("PROD_NM"):
        codes = sorted({safe_text(code) for code in group["PROD_CODE"] if safe_text(code)})
        if len(codes) > 1:
            prod_name_issues.append({"PROD_NM": name, "PROD_CODE": ", ".join(codes[:3]), "COUNT": len(group)})

    prod_gst_issues = []
    for name, group in df.groupby("PROD_NM"):
        rates = sorted({round(r, 2) for r in group["GST_RATE"] if not pd.isna(r)})
        if len(rates) > 1:
            prod_gst_issues.append({
                "PROD_NM": name, "GST_RATE": ", ".join(str(int(r)) if r == int(r) else str(r) for r in rates),
                "COUNT": len(group),
            })

    prod_code_check = []
    for code, group in df.groupby("PROD_CODE"):
        names = sorted({safe_text(name) for name in group["PROD_NM"] if safe_text(name)})
        if not safe_text(code):
            prod_code_check.append({"PROD_CODE": "Unknown", "STATUS": "Missing code"})
        elif len(names) > 1:
            prod_code_check.append({"PROD_CODE": code, "STATUS": "Multiple products"})

    gst_frame = purchase_frame[["INVOICE_NO", "INVOICE_AMT", "GST_RATE", "GST_AMT"]].copy()
    gst_frame["EXPECTED_GST"] = (gst_frame["INVOICE_AMT"] * gst_frame["GST_RATE"] / 100).round(2)
    gst_frame["DIFF"] = (gst_frame["GST_AMT"] - gst_frame["EXPECTED_GST"]).round(2)
    gst_frame["STATUS"] = gst_frame["DIFF"].abs().lt(1).map({True: "OK", False: "Error"})
    gst_check = gst_frame.to_dict(orient="records")

    disc_frame = purchase_frame[["INVOICE_NO", "INVOICE_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF"]].copy()
    disc_frame["STATUS"] = disc_frame["DISC_DIFF"].abs().lt(1).map({True: "OK", False: "Error"})
    disc_check = disc_frame.to_dict(orient="records")

    persist_sqlite_tables(
        df=df, po_data=po_data, grn_data=grn_data, bank_data=bank_data,
        blocked_vendors=blocked_vendors, multi_tax=multi_tax, dup_customers=dup_customers,
        prod_name_issues=prod_name_issues, prod_gst_issues=prod_gst_issues,
        prod_code_check=prod_code_check, gst_check=gst_check, disc_check=disc_check,
    )

    return {
        "purchase": purchase_data, "po": po_data, "grn": grn_data, "bank": bank_data,
        "blocked_vendors": blocked_vendors, "multi_tax": multi_tax,
        "dup_customers": dup_customers, "prod_name_issues": prod_name_issues,
        "prod_gst_issues": prod_gst_issues, "prod_code_check": prod_code_check,
        "gst_check": gst_check, "disc_check": disc_check,
        "companies": companies, "states": states, "products": products,
        "customers": customers, "months": months,
    }

DATA = None

def ensure_data_loaded():
    global DATA
    if DATA is None:
        DATA = load_from_sqlite() or load_excel_data()
    return DATA

def _dashboard_payload(payload):
    purchase = pd.DataFrame(payload["purchase"])
    if not purchase.empty:
        dimensions = ["COMP_NM", "COMP_STATE", "PROD_NM", "CUST_NM", "CUST_STATE", "MONTH", "YEAR"]
        measures = ["INVOICE_AMT", "GST_AMT", "TOTAL_AMT", "DISCOUNT", "CALC_DISCOUNT", "DISC_DIFF"]
        dashboard_rows = purchase.groupby(dimensions, dropna=False, as_index=False)[measures].sum().round(2)
        dashboard_rows["INVOICE_NO"] = "Aggregated purchase data"
        dashboard_rows["GST_RATE"] = 0
        dashboard_rows["TAX_DESC"] = ""
        purchase_rows = dashboard_rows.to_dict(orient="records")
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

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data")
def get_data():
    payload = _dashboard_payload(ensure_data_loaded())
    po_data = payload["po"]
    grn_data = payload["grn"]
    bank_data = payload["bank"]

    po_inv_nos = set(p["INVOICE_NO"] for p in po_data)
    grn_inv_nos = set(g["INVOICE_NO"] for g in grn_data)

    grn_without_inv = [g for g in grn_data if g["INVOICE_NO"] not in po_inv_nos][:15]
    open_po = [p for p in po_data if p["INVOICE_NO"] not in grn_inv_nos][:15]

    bank_accounts_by_vendor = {}
    for b in bank_data:
        comp = b["COMP_NM"]
        if comp not in bank_accounts_by_vendor:
            bank_accounts_by_vendor[comp] = set()
        bank_accounts_by_vendor[comp].add(b["BANK"])
    bank_summary = [{"COMP_NM": k, "BANK_COUNT": len(v), "BANKS": list(v)} for k, v in bank_accounts_by_vendor.items()]

    avg_pay_days = {}
    for b in bank_data:
        comp = b["COMP_NM"]
        if comp not in avg_pay_days:
            avg_pay_days[comp] = []
        avg_pay_days[comp].append(b["PAYMENT_DAYS"])
    pay_summary = [{"COMP_NM": k, "AVG_DAYS": round(sum(v)/len(v), 1), "COUNT": len(v)} for k, v in avg_pay_days.items()]

    comparison = []
    all_inv = sorted(set(list(po_inv_nos) + list(grn_inv_nos) + [b["INVOICE_NO"] for b in bank_data]))[:45]
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

# ── OBSERVATIONS ENDPOINTS ──────────────────────────────────────
@app.route("/api/observations", methods=["GET"])
def get_observations():
    category = request.args.get("category", "").strip()
    try:
        with get_db_connection() as conn:
            if category:
                rows = conn.execute("SELECT * FROM observations WHERE category = ? ORDER BY id DESC", (category,)).fetchall()
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
        "ClosureDate", "ClosureReason", "FromDate", "ToDate"
    ]
    vals = [str(data.get(f, "") or "").strip() for f in fields]

    try:
        with get_db_connection() as conn:
            if obs_id:
                set_clause = ", ".join([f"{f} = ?" for f in fields])
                conn.execute(f"UPDATE observations SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (*vals, obs_id))
            else:
                cols = ", ".join(fields)
                placeholders = ", ".join(["?"] * len(fields))
                conn.execute(f"INSERT INTO observations ({cols}) VALUES ({placeholders})", vals)
            conn.commit()
            return jsonify({"success": True})
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
        with get_db_connection() as conn:
            if action == "delete":
                conn.execute("DELETE FROM hygiene_remarks WHERE issue_id = ?", (issue_id,))
            else:
                conn.execute("""
                    INSERT INTO hygiene_remarks (issue_id, category, entity_key, remark, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(issue_id) DO UPDATE SET
                    remark=excluded.remark, updated_at=CURRENT_TIMESTAMP
                """, (issue_id, category, entity_key, remark))
            conn.commit()
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
        df = pd.read_excel(temp_path, dtype=str)
        df.columns = [str(c).strip() for c in df.columns]
        df = normalize_observation_headers(df)

        missing_headers = [field for field in ALL_FIELDS if field not in df.columns]
        if missing_headers:
            return jsonify({"success": False, "error": f"Missing required columns: {', '.join(missing_headers)}"}), 400

        categories_in_file = sorted({safe_value(value) for value in df.get("category", []).dropna().tolist() if safe_value(value) in VALID_CATEGORIES})

        inserted = 0
        skipped = 0
        ignored_blank = 0

        with get_db_connection() as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            for category_name in categories_in_file:
                conn.execute("DELETE FROM observations WHERE category = ?", (category_name,))

            for row_num, row in df.iterrows():
                if row_is_completely_empty(row):
                    ignored_blank += 1
                    continue

                category = safe_value(row.get("category"))
                if category not in VALID_CATEGORIES:
                    skipped += 1
                    continue

                entity_key = safe_value(row.get("entity_key"))
                if not entity_key:
                    entity_key = make_entity_key(safe_value(row.get("ObservationTitle")), safe_value(row.get("table_name")), row_num + 2)

                values = []
                for field in ALL_FIELDS:
                    if field == "entity_key":
                        values.append(entity_key)
                    else:
                        values.append(safe_value(row.get(field)))

                columns = ", ".join(ALL_FIELDS)
                placeholders = ", ".join(["?"] * len(ALL_FIELDS))
                conn.execute(
                    f"INSERT INTO observations ({columns}) VALUES ({placeholders})",
                    values,
                )
                inserted += 1

            conn.commit()

        return jsonify({
            "success": True,
            "inserted": inserted,
            "skipped": skipped,
            "ignored_blank": ignored_blank,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)