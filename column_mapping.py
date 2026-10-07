# Internal column names — fixed across the entire application.
# These are the VALUE side of every mapping dict below.

OUR_COLUMNS = [
    "our_company_name", "location_1", "location_2", "location_3", "location_4",
    "invoice_number", "business_day_date", "date_2", "date_3", "date_4",
    "customer_code", "customer_name",
    "customer_location_1", "customer_location_2", "customer_location_3",
    "purchase_manage1", "purchase_manage2",
    "product_code",
    "product_name_1", "product_name_2", "product_name_3", "product_name_4",
    "quantity", "item_price", "unit_of_measurement", "pack_size",
    "gross_sale", "discount_rate", "discount_amount",
    "discount_rate_1", "discount_amount_1",
    "net_sale",
    "product_cgst_amount", "product_sgst_amount", "product_igst_amount",
    "other_tax_1", "other_tax_2", "other_tax_3",
    "invoice_amount",
    "tax_rate_1", "tax_rate_2", "tax_rate_3", "tax_rate_4", "tax_rate_5",
    "tax_code", "tax_description",
]

# Per-client column mappings
#   KEY   = client's Excel column header  (matched case-insensitively at runtime)
#   VALUE = our internal column name      (from OUR_COLUMNS above)

CLIENT_COLUMN_MAP = {

    # ------------------------------------------------------------------
    # DEFAULT — Excel headers already match our internal names exactly.
    # Use when the upload file uses our standard headers.
    # ------------------------------------------------------------------
    "default": {
        "our_company_name":     "our_company_name",
        "location_1":           "location_1",
        "location_2":           "location_2",
        "location_3":           "location_3",
        "location_4":           "location_4",
        "invoice_number":       "invoice_number",
        "business_day_date":    "business_day_date",
        "date_2":               "date_2",
        "date_3":               "date_3",
        "date_4":               "date_4",
        "customer_code":        "customer_code",
        "customer_name":        "customer_name",
        "customer_location_1":  "customer_location_1",
        "customer_location_2":  "customer_location_2",
        "customer_location_3":  "customer_location_3",
        "purchase_manage1":     "purchase_manage1",
        "purchase_manage2":     "purchase_manage2",
        "product_code":         "product_code",
        "product_name_1":       "product_name_1",
        "product_name_2":       "product_name_2",
        "product_name_3":       "product_name_3",
        "product_name_4":       "product_name_4",
        "quantity":             "quantity",
        "item_price":           "item_price",
        "unit_of_measurement":  "unit_of_measurement",
        "pack_size":            "pack_size",
        "gross_sale":           "gross_sale",
        "discount_rate":        "discount_rate",
        "discount_amount":      "discount_amount",
        "discount_rate_1":      "discount_rate_1",
        "discount_amount_1":    "discount_amount_1",
        "net_sale":             "net_sale",
        "product_cgst_amount":  "product_cgst_amount",
        "product_sgst_amount":  "product_sgst_amount",
        "product_igst_amount":  "product_igst_amount",
        "other_tax_1":          "other_tax_1",
        "other_tax_2":          "other_tax_2",
        "other_tax_3":          "other_tax_3",
        "invoice_amount":       "invoice_amount",
        "tax_rate_1":           "tax_rate_1",
        "tax_rate_2":           "tax_rate_2",
        "tax_rate_3":           "tax_rate_3",
        "tax_rate_4":           "tax_rate_4",
        "tax_rate_5":           "tax_rate_5",
        "tax_code":             "tax_code",
        "tax_description":      "tax_description",
    },

    # Only the columns that exist in their file are listed here.
    # Extra columns in their file are automatically ignored.

    "alpha_retail": {
        # client header       : our internal name
        "comp_name":          "our_company_name",
        "branch":             "location_1",
        "sub_branch":         "location_2",
        "zone":               "location_3",
        "territory":          "location_4",
        "bill_no":            "invoice_number",
        "txn_date":           "business_day_date",
        "party_cde":          "customer_code",
        "party_name":         "customer_name",
        "party_city":         "customer_location_1",
        "party_state":        "customer_location_2",
        "mgr1":               "purchase_manage1",
        "mgr2":               "purchase_manage2",
        "item_code":          "product_code",
        "item_desc":          "product_name_1",
        "item_variant":       "product_name_2",
        "pcs":                "quantity",
        "mrp":                "item_price",
        "uom":                "unit_of_measurement",
        "case_size":          "pack_size",
        "gross_value":        "gross_sale",
        "disc_pct":           "discount_rate",
        "disc_amt":           "discount_amount",
        "net_value":          "net_sale",
        "cgst_amt":           "product_cgst_amount",
        "sgst_amt":           "product_sgst_amount",
        "igst_amt":           "product_igst_amount",
        "total_bill":         "invoice_amount",
        "gst_rate":           "tax_rate_1",
        "hsn_code":           "tax_code",
        "gst_desc":           "tax_description",
    },

}

# ACTIVE CLIENT SETTING
# Change this ONE LINE to switch which client's mapping is applied.
ACTIVE_CLIENT = "alpha_retail"

# Public helpers — imported by app.py

def get_active_column_map() -> dict:
    """
    Returns the column-mapping dict for the currently active client.
    Falls back to 'default' if the active client key is not found.
    """
    mapping = CLIENT_COLUMN_MAP.get(ACTIVE_CLIENT)
    if not mapping:
        print(f"[column_mapping] WARNING: client '{ACTIVE_CLIENT}' not found, using 'default'.")
        mapping = CLIENT_COLUMN_MAP["default"]
    return mapping


def apply_column_mapping(df) -> object:
    import polars as pl

    mapping = get_active_column_map()

    # Build lookup keyed by normalised (lower + stripped) client header
    normalised_map = {k.strip().lower(): v for k, v in mapping.items()}

    rename_dict = {}
    for col in df.columns:
        internal_name = normalised_map.get(col.strip().lower())
        if internal_name:
            rename_dict[col] = internal_name

    if rename_dict:
        df = df.rename(rename_dict)

    # Keep ONLY the successfully mapped internal columns
    keep_cols = [v for v in rename_dict.values() if v in df.columns]
    if keep_cols:
        df = df.select(keep_cols)

    return df
