 
import os
import re
import sqlite3
import pandas as pd
 
# ── SETTINGS — change these two if needed ──────────────────────
EXCEL_PATH = os.path.join(os.path.dirname(__file__), "observations_seed_template_updated.xlsx")
DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")
 
VALID_CATEGORIES = {"multi_tax", "prod_gst", "dup_cust", "prod_name", "prod_code"}
 
# Every column the observations table actually has (excluding id/updated_at,
# which the database fills in on its own). Your Excel headers must match
# these names exactly.
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
 
 
def normalize_observation_headers(df):
    """Map spaced header names like 'From Date' to DB field names like 'FromDate'."""
    canonical_map = {re.sub(r"[^a-zA-Z0-9]+", "", str(name)).lower(): name for name in ALL_FIELDS}
    renamed = {}
    for original in df.columns:
        key = re.sub(r"[^a-zA-Z0-9]+", "", str(original)).lower()
        if key in canonical_map:
            renamed[original] = canonical_map[key]
    if renamed:
        df = df.rename(columns=renamed)
    return df


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
 
 
def main():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: Excel file not found at: {EXCEL_PATH}")
        print("   Put your Excel file there, or update EXCEL_PATH at the top of this script.")
        return
 
    if not os.path.exists(DB_PATH):
        print(f"Error: data.db not found at: {DB_PATH}")
        print("   Make sure this script sits in the same folder as app.py / data.db.")
        return
 
    df = pd.read_excel(EXCEL_PATH, dtype=str)  # read everything as text, keep it simple
    df.columns = [str(c).strip() for c in df.columns]
    df = normalize_observation_headers(df)

    missing_headers = [f for f in ALL_FIELDS if f not in df.columns]
    if missing_headers:
        print("Warning: these expected columns were not found in your Excel file "
              "(they'll just be left blank for every row):")
        for h in missing_headers:
            print(f"   - {h}")
        print()
 
    inserted = 0
    skipped = 0
    ignored_blank = 0
 
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
 
    for row_num, row in df.iterrows():
        excel_row_number = row_num + 2  # +2 = account for header row + 0-index
 
        # A completely blank row (e.g. a stray empty line at the bottom of the
        # sheet) isn't an error — just quietly ignore it, no warning needed.
        if row_is_completely_empty(row):
            ignored_blank += 1
            continue
 
        category = safe_value(row.get("category"))
        if category not in VALID_CATEGORIES:
            print(f"Row {excel_row_number}: skipped - 'category' is '{category or '(blank)'}', "
                  f"must be one of {sorted(VALID_CATEGORIES)}")
            skipped += 1
            continue
 
        table_name = safe_value(row.get("table_name"))
        title = safe_value(row.get("ObservationTitle"))
 
        entity_key = safe_value(row.get("entity_key"))
        if not entity_key:
            entity_key = make_entity_key(title, table_name, excel_row_number)
 
        values = []
        for field in ALL_FIELDS:
            if field == "entity_key":
                values.append(entity_key)
            else:
                values.append(safe_value(row.get(field)))
 
        placeholders = ", ".join(["?"] * len(ALL_FIELDS))
        columns = ", ".join(ALL_FIELDS)
        conn.execute(
            f"INSERT INTO observations ({columns}) VALUES ({placeholders})",
            values,
        )
        inserted += 1
 
    conn.commit()
    conn.close()
 
    print("-" * 50)
    print(f"Done. Inserted: {inserted}   Skipped: {skipped}   "
          f"Blank rows ignored: {ignored_blank}   Total rows in Excel: {len(df)}")
    print("You can now open the app, click an 'Observation' button, and the table")
    print("should show these rows pre-filled - click Edit to review/adjust and save.")
 
 
if __name__ == "__main__":
    main()