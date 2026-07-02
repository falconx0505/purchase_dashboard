from flask import Flask, render_template, jsonify
import random

app = Flask(__name__)
random.seed(42)

COMPANIES = ["Reliance Industries", "Tata Consultancy", "Infosys Ltd", "Wipro Ltd", "HCL Technologies"]
STATES = ["Maharashtra", "Karnataka", "Tamil Nadu", "Telangana", "Gujarat", "Delhi", "Rajasthan"]
PRODUCTS = ["Steel Plates", "Copper Wire", "Circuit Boards", "Hydraulic Pumps", "Safety Valves", "PVC Pipes", "Rubber Seals", "Aluminium Rods", "Fiber Cables", "Industrial Fans"]
CUSTOMERS = ["Alpha Corp", "Beta Industries", "Gamma Traders", "Delta Supplies", "Epsilon Works", "Zeta Manufacturing", "Eta Logistics", "Theta Exports"]
MONTHS = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"]
GST_RATES = [5, 12, 18, 28]
TAX_DESCS = ["CGST, SGST", "IGST", "CGST, SGST (Special)", "IGST (Special)"]
YEARS = [2023, 2024]
BUCKETS = ["0-30", "31-60", "61-90", "91-180", "180+"]

def rand_inv():
    return f"INV-{random.randint(10000,99999)}"

def rand_po():
    return f"PO-{random.randint(1000,9999)}"

def rand_grn():
    return f"GRN-{random.randint(100,999)}"

def rand_bank():
    banks = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak Bank"]
    return random.choice(banks)

# ── Main Purchase Invoice data ──────────────────────────────────────────────
purchase_data = []
for i in range(280):
    comp = random.choice(COMPANIES)
    state = random.choice(STATES)
    prod = random.choice(PRODUCTS)
    cust = random.choice(CUSTOMERS)
    month = random.choice(MONTHS)
    year = random.choice(YEARS)
    gst_rate = random.choice(GST_RATES)
    inv_amt = round(random.uniform(15000, 850000), 2)
    gst_amt = round(inv_amt * gst_rate / 100, 2)
    total = round(inv_amt + gst_amt, 2)
    disc = round(random.uniform(0, inv_amt * 0.1), 2)
    calc_disc = round(random.uniform(0, inv_amt * 0.1), 2)
    purchase_data.append({
        "INVOICE_NO": rand_inv(),
        "COMP_NM": comp, "COMP_STATE": state,
        "PROD_NM": prod, "PROD_CODE": f"P-{random.randint(100,999)}",
        "CUST_NM": cust, "CUST_STATE": random.choice(STATES),
        "MONTH": month, "YEAR": year,
        "GST_RATE": gst_rate,
        "TAX_DESC": random.choice(TAX_DESCS),
        "INVOICE_AMT": inv_amt, "GST_AMT": gst_amt, "TOTAL_AMT": total,
        "DISCOUNT": disc, "CALC_DISCOUNT": calc_disc,
        "DISC_DIFF": round(disc - calc_disc, 2)
    })

# ── PO / GRN / Bank data ────────────────────────────────────────────────────
po_data = []
grn_data = []
bank_data = []
for i in range(180):
    inv = rand_inv()
    comp = random.choice(COMPANIES)
    cust = random.choice(CUSTOMERS)
    amt = round(random.uniform(20000, 600000), 2)
    po_data.append({"PO_NO": rand_po(), "INVOICE_NO": inv, "COMP_NM": comp, "CUST_NM": cust, "AMT": amt, "MONTH": random.choice(MONTHS), "YEAR": random.choice(YEARS)})
    if random.random() > 0.15:
        grn_data.append({"GRN_NO": rand_grn(), "INVOICE_NO": inv, "COMP_NM": comp, "CUST_NM": cust, "AMT": round(amt * random.uniform(0.9, 1.05), 2)})
    if random.random() > 0.2:
        bank_data.append({"BANK": rand_bank(), "INVOICE_NO": inv, "COMP_NM": comp, "PAYMENT_DAYS": random.randint(1, 120), "AMT": round(amt * random.uniform(0.98, 1.02), 2)})

# ── Blocked vendors ──────────────────────────────────────────────────────────
blocked_vendors = [
    {"VENDOR": "Shady Supplies Pvt Ltd", "REASON": "Blacklisted by Compliance", "INV_NO": rand_inv(), "AMT": 145000},
    {"VENDOR": "Ghost Traders Co", "REASON": "Duplicate GST Number", "INV_NO": rand_inv(), "AMT": 89000},
    {"VENDOR": "Phantom Goods Ltd", "REASON": "Deregistered Entity", "INV_NO": rand_inv(), "AMT": 210000},
    {"VENDOR": "Fake Parts Inc", "REASON": "Court Order – Freeze", "INV_NO": rand_inv(), "AMT": 56000},
]

# ── Data hygiene seeded anomalies ────────────────────────────────────────────
# Multiple tax codes
multi_tax = [
    {"GST_RATE": "17, 18", "TAX_DESC": "CGST, SGST", "COUNT": 142},
    {"GST_RATE": "17, 18", "TAX_DESC": "IGST", "COUNT": 38},
    {"GST_RATE": "5, 12", "TAX_DESC": "CGST, SGST", "COUNT": 95},
    {"GST_RATE": "5, 12", "TAX_DESC": "CGST, SGST (Special)", "COUNT": 12},
]
# Duplicate customers
dup_customers = [
    {"CUST_NM": "Alpha Corp, Alpa Corp", "CUST_CD": "C-001", "COUNT": 3},
   
    {"CUST_NM": "Beta Industries, bettaa Industries", "CUST_CD": "C-002", "COUNT": 2},
  
    {"CUST_NM": "Gamma Traders, gaama Traders", "CUST_CD": "C-003", "COUNT": 4},
   
]
# Product name issues
prod_name_issues = [
    {"PROD_NM": "Steel Plates", "PROD_CODE": "P-101, P-201", "COUNT": 21},
    {"PROD_NM": "Copper Wire", "PROD_CODE": "P-102, P-305", "COUNT": 24},
    {"PROD_NM": "Hydraulic Pumps", "PROD_CODE": "P-301, P-401", "COUNT": 17},
]
# Same product multiple GST
prod_gst_issues = [
    {"PROD_NM": "Hydraulic Pumps", "GST_RATE": "12, 18", "COUNT": 21},
    {"PROD_NM": "Safety Valves", "GST_RATE": "18, 28", "COUNT": 24},
    {"PROD_NM": "Aluminium Rods", "GST_RATE": "5, 12", "COUNT": 12},
]
# Product code check (missing)
prod_code_check = [
    {"PROD_CODE": "P-999", "STATUS": "Not in Master"},
    {"PROD_CODE": "P-888", "STATUS": "Not in Master"},
    {"PROD_CODE": "P-777", "STATUS": "Not in Master"},
]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data")
def get_data():
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

    # PO vs Invoice vs GRN vs Bank comparison
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

    # Formula check – GST rate check
    gst_check = []
    for row in purchase_data[:60]:
        expected_gst = round(row["INVOICE_AMT"] * row["GST_RATE"] / 100, 2)
        diff = round(row["GST_AMT"] - expected_gst, 2)
        gst_check.append({
            "INVOICE_NO": row["INVOICE_NO"],
            "INVOICE_AMT": row["INVOICE_AMT"],
            "GST_RATE": row["GST_RATE"],
            "GST_AMT": row["GST_AMT"],
            "EXPECTED_GST": expected_gst,
            "DIFF": diff,
            "STATUS": "OK" if abs(diff) < 1 else "Error"
        })

    # Discount difference
    disc_check = []
    for row in purchase_data[:50]:
        disc_check.append({
            "INVOICE_NO": row["INVOICE_NO"],
            "INVOICE_AMT": row["INVOICE_AMT"],
            "DISCOUNT": row["DISCOUNT"],
            "CALC_DISCOUNT": row["CALC_DISCOUNT"],
            "DISC_DIFF": row["DISC_DIFF"],
            "STATUS": "OK" if abs(row["DISC_DIFF"]) < 100 else "Error"
        })

    return jsonify({
        "purchase": purchase_data,
        "po": po_data,
        "grn": grn_data,
        "bank": bank_data,
        "blocked_vendors": blocked_vendors,
        "comparison": comparison,
        "grn_without_inv": grn_without_inv,
        "open_po": open_po,
        "bank_summary": bank_summary,
        "pay_summary": pay_summary,
        "multi_tax": multi_tax,
        "dup_customers": dup_customers,
        "prod_name_issues": prod_name_issues,
        "prod_gst_issues": prod_gst_issues,
        "prod_code_check": prod_code_check,
        "gst_check": gst_check,
        "disc_check": disc_check,
        "companies": COMPANIES,
        "states": STATES,
        "products": PRODUCTS,
        "customers": CUSTOMERS,
        "months": MONTHS,
    })

if __name__ == "__main__":
    app.run(debug=True, port=5050)
