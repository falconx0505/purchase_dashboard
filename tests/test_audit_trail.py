import os
import sqlite3
import sys
import tempfile
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import app as app_module


def test_ensure_audit_trail_schema_adds_required_columns(tmp_path):
    db_file = tmp_path / "audit.db"
    conn = sqlite3.connect(db_file)
    conn.execute("""
    CREATE TABLE audit_trail_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process TEXT,
        control TEXT,
        status TEXT,
        owner TEXT,
        department TEXT,
        remarks TEXT,
        source_file TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()

    app_module.ensure_audit_trail_schema(conn)
    conn.commit()

    columns = {row[1] for row in conn.execute("PRAGMA table_info(audit_trail_records)")}
    assert {"vendor_no", "year", "quantity", "month_name", "field_description"}.issubset(columns)
    conn.close()


def test_build_audit_trail_grouped_payload():
    rows = [
        {"Process": "Procurement", "Control": "PO Approval", "Status": "Open", "Owner": "A", "Year": "2024-25", "Quantity": "10", "MonthName": "January", "VendorNo": "V001", "VendorName": "HDFC Bank Limited", "FieldChanged": "BANKL", "FieldDescription": "Bank Key", "Indicator": "Updated", "OldValue": "100", "NewValue": "120", "ChangedBy": "John", "Risk": "High"},
        {"Process": "Procurement", "Control": "PO Approval", "Status": "Closed", "Owner": "A", "Year": "2024-25", "Quantity": "20", "MonthName": "January", "VendorNo": "V001", "VendorName": "axis bank", "FieldChanged": "PAN Number", "FieldDescription": "PAN Number", "Indicator": "Updated", "OldValue": "100", "NewValue": "140", "ChangedBy": "Jane", "Risk": "High"},
        {"Process": "Finance", "Control": "Invoice Match", "Status": "Open", "Owner": "B", "Year": "2025-26", "Quantity": "30", "MonthName": "March", "VendorNo": "V002", "VendorName": "qatar bank", "FieldChanged": "Services", "FieldDescription": "Services", "Indicator": "Added", "OldValue": "", "NewValue": "2025-03-01", "ChangedBy": "Mike", "Risk": "Low"},
        {"Process": "Finance", "Control": "Invoice Match", "Status": "Open", "Owner": "B", "Year": "2025-26", "Quantity": "40", "MonthName": "March", "VendorNo": "V002", "VendorName": "HDFC Bank Limited", "FieldChanged": "Financial Services Outsourcing", "FieldDescription": "Services 2", "Indicator": "Added", "OldValue": "", "NewValue": "2025-03-01", "ChangedBy": "Mike", "Risk": "Low"},
    ]

    grouped = app_module.build_audit_trail_payload(rows)

    assert grouped["summary"]["total_rows"] == 4
    assert grouped["summary"]["status_count"]["Open"] == 3
    assert grouped["vendorSummaryTable"][0]["vendorName"] == "HDFC"
    assert grouped["vendorSummaryTable"][0]["banklCount"] == 1
    assert grouped["vendorSummaryTable"][0]["financialServicesOutsourcingCount"] == 1
    assert grouped["vendorSummaryTable"][0]["grandTotal"] == 2
    assert grouped["fieldDescriptionSummaryTable"][0]["fieldDescription"] == "Bank Key"
    assert grouped["fieldDescriptionSummaryTable"][0]["highRiskCount"] == 1
    assert grouped["fieldDescriptionSummaryTable"][0]["grandTotal"] == 1
    assert grouped["filters"]["year"] == ["2024-25", "2025-26"]
    assert grouped["filters"]["quantity"] == ["10", "20", "30", "40"]
    assert grouped["filters"]["monthName"] == ["January", "March"]

