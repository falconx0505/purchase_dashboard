# Project Overview

- **Name:** Purchase & Audit Intelligence Dashboard
- **Description:** A Flask-based internal audit tool that ingests retail purchase/transaction data (Excel), runs data hygiene checks, flags financial anomalies, and syncs structured audit observations to an external audit management system (LARS). Also includes standalone modules for AI-powered anomaly detection, document OCR/KYC extraction, and document tampering detection.
- **Goal:** Automate and centralize purchase data auditing — from data quality checks to formal observation management — for internal audit teams in an enterprise/banking context.

> **⚠️ Demo → Product Transition Note:**
> This project is actively transitioning from a demo to a production product. Several areas mix real product-grade code with demo scaffolding:
> - Purchase amounts are **synthetically scaled** (`DEMO_AMOUNT_SCALE = 850`) on top of a 60-row demo dataset (`60rowdata.xlsx`).
> - PO/GRN numbers (`PO-XXXX`, `GRN-XXX`) are **randomly generated** — not sourced from a real ERP.
> - Some orphan GRN entries are **hardcoded** to populate exception tables for demo purposes.
> - The LARS API integration (`send_observation_to_lars`) is **real and live** (targeting `http://45.248.67.66/...`), already pushing data to a connected LARS server.
> - The PostgreSQL encrypted store, auth system, KYC extraction, and anomaly detection module are **production-grade** features being built out.

---

# Features

1. **Purchase Data Dashboard** — Visualizes invoice/GST/discount data with multi-dimensional filtering (company, region, product, month, year).
2. **Purchase Data Hygiene Checks** — Flags: multiple tax rates per product, duplicate customer codes, product name/code mismatches, and GST/discount calculation errors.
3. **PO / GRN / Bank Reconciliation** — Compares Purchase Orders, Goods Receipt Notes, and bank payments per invoice; surfaces mismatches and open POs.
4. **Audit Trail Viewer** — Loads vendor master change logs (Excel upload or bundled `audittrailmasterdata.xlsx`), groups by vendor/field type/risk level.
5. **Observations Management** — Full CRUD for audit observations (linked to IT Controls, HR & Payroll, and Purchase hygiene finding categories). Syncs each saved observation to LARS via REST API.
6. **LARS Integration** — Pushes saved observations to an external audit management system with field mapping/normalization and returns `planid` + `ObservReqID`.
7. **Anomaly Detection (ML)** — User-uploadable CSV/Excel; supports AUTO/FIXED/SEMI_FIXED modes using Isolation Forest + Local Outlier Factor (sklearn). Generates AI-written summaries via Gemini.
8. **Document OCR / KYC Extraction** — Uploads scanned Aadhaar/PAN card images or PDFs; extracts document type and number using Tesseract OCR; exports to Excel.
9. **Document Tampering Detection** — Sends uploaded document images to Gemini 2.5 Flash with a forensics-grade prompt for pixel-level and semantic tamper analysis.
10. **PAN KYC Verification** — Batch-verifies PAN numbers from Excel via a third-party KYC API (`kycapi.microvistatech.com`).
11. **User Authentication** — Session-based login/signup with bcrypt-hashed passwords stored in PostgreSQL.

---

# Architecture

## Frontend
- **Templates:** Jinja2 HTML (`templates/index.html`, `login.html`, `signup.html`, `pages/anomaly_detection.html`, `pages/data_extraction.html`)
- **Styling:** Vanilla CSS (`static/css/style.css`, `anomaly_detection.css`, `kyc_extraction.css`, `tampering_check.css`)
- **JavaScript:** Vanilla JS split across:
  - `static/js/demo_data.js` — all static/hardcoded demo constants (IT Controls, HR & Payroll, Loan, KYC, Loan tables). Must load **before** `main.js`.
  - `static/js/main.js` (~3,400 lines after modularisation) — all chart/table rendering, API calls, page logic. References constants defined in `demo_data.js`.
  - `static/js/anomaly_detection.js`, `kyc_extraction.js`, `tampering_check.js` — feature-specific JS.
- All data is loaded via AJAX (`fetch`) calls to Flask JSON endpoints; the page renders client-side.

## Backend
- **Framework:** Flask (Python), running on `127.0.0.1:5000`
- **Main App:** `app.py` — monolithic entry point with all purchase/audit/hygiene/OCR routes. **Now uses Polars throughout** (pandas fully removed).
- **Blueprints:**
  - `anomalies_blueprint.py` — ML anomaly detection routes mounted at `/anomalies`
  - `auth.py` — Login/signup/logout/me routes
- **Models (ML):**
  - `models/anomaly_detector.py` — `AnomalyDetector` class (Isolation Forest + LOF)
  - `models/gemini_explainer.py` — `GeminiExplainer` class (wraps Gemini API for anomaly summaries)
  - `models/dashboard_generator.py` — `DashboardGenerator` (Gemini-based chart config generation — WIP, not wired to any route)
- **Utils:**
  - `utils/data_loader.py` — Polars-based file loader with auto header detection for anomaly detection uploads
  - `utils/data_processor.py` — Builds entity-level DataFrames for anomaly detection grouping
  - `utils/suggestions.py` — Column analysis and grouping suggestions

## Databases
- **SQLite (`data.db`):** Stores purchase-derived tables (`po`, `grn`, `bank`, `blocked_vendors`, `gst_check`, `disc_check`), audit trail records, and observations. Written via native `sqlite3.executemany` — no pandas/ORM dependency.
- **PostgreSQL (`audit_tool` DB):** Stores users (auth), and encrypted purchase snapshots + hygiene findings. Uses `pgcrypto` extension for symmetric encryption (`pgp_sym_encrypt/decrypt`).

## External Services

| Service | Purpose |
|---|---|
| **Google Gemini 2.5 Flash** | Document tampering forensics, anomaly summary insights |
| **LARS API** (`http://45.248.67.66/LARS_Demo_bank/...`) | Pushes audit observations; returns `planid` + `ObservReqID` |
| **MicroVista KYC API** (`kycapi.microvistatech.com`) | PAN card verification |
| **Tesseract OCR** (local binary) | Extracts text from Aadhaar/PAN card images and PDFs |

---

# Data Flow

## Purchase Dashboard Flow
1. On startup, `ensure_data_loaded()` checks if a PostgreSQL encrypted snapshot exists.
2. If not, `load_excel_data()` parses `60rowdata.xlsx` via low-level XML streaming (`zipfile + iterparse`), builds a **Polars DataFrame**, applies column normalization, scales amounts by `DEMO_AMOUNT_SCALE=850`, and derives hygiene issue lists + synthetic PO/GRN/bank records.
3. All structured tables are persisted to **SQLite** via `sqlite3.executemany`; purchase rows + hygiene findings are **encrypted and stored in PostgreSQL**.
4. The `/api/data` endpoint loads from SQLite (via native cursor) / PostgreSQL, assembles a JSON payload, and sends it to the frontend.
5. The frontend (`main.js`) renders charts, tables, and filter controls from this payload.

## Observation → LARS Flow
1. User opens an issue card, fills out observation fields in a modal form, clicks Save.
2. Frontend POSTs to `/api/observations`.
3. Backend saves the record to SQLite `observations` table.
4. Immediately calls `send_observation_to_lars()`, which maps fields to LARS JSON schema and POSTs to the LARS ASMX endpoint.
5. LARS returns `planid` + `ObservReqID`; these are stored back in the `observations` row.
6. Response includes `lars_sync` status so the frontend can show success/failure.

## Anomaly Detection Flow
1. User navigates to `/anomalies`, uploads CSV/Excel.
2. `/anomalies/upload` loads the file with Polars, validates it, stores in in-memory `DATA_STORE` keyed by UUID session.
3. User configures grouping column, feature columns, and mode (AUTO/FIXED/SEMI_FIXED).
4. `/anomalies/analyze` runs `build_entity_dataframe()` + `AnomalyDetector.detect_anomalies()`.
5. If Gemini is configured, `GeminiExplainer.generate_summary_insights()` is called for narrative summaries.
6. Results (anomalies list, chart data, stats) are returned as JSON to the frontend.

## Document Tampering Flow
1. User uploads document image to `/analyze`.
2. Image bytes are sent to Gemini 2.5 Flash with a forensics prompt (`FORENSICS_PROMPT`).
3. Gemini returns a structured text report (verdict, confidence, anomalies detected).
4. Report is returned as JSON and rendered in the frontend.

---

# Database Schema

## PostgreSQL

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | Auto-increment |
| `name` | VARCHAR(120) | |
| `email` | VARCHAR(255) | Unique |
| `password_hash` | VARCHAR(255) | bcrypt |
| `role` | VARCHAR(50) | Default: `'auditor'` |
| `created_at` | TIMESTAMP | |

### `purchase_raw_encrypted`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `row_index` | INTEGER | Order of original row |
| `encrypted_data` | BYTEA | `pgp_sym_encrypt(json_row, key)` |
| `loaded_at` | TIMESTAMP | |

### `hygiene_findings_encrypted`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `category` | VARCHAR(50) | e.g. `dup_customers`, `multi_tax` |
| `row_index` | INTEGER | |
| `encrypted_data` | BYTEA | Encrypted JSON row |
| `loaded_at` | TIMESTAMP | |

### `hygiene_remarks_encrypted`
| Column | Type | Notes |
|---|---|---|
| `issue_id` | VARCHAR(255) PK | Composite key string |
| `category` | VARCHAR(50) | |
| `entity_key` | VARCHAR(255) | |
| `encrypted_remark` | BYTEA | User's remark, encrypted |
| `updated_at` | TIMESTAMP | |

## SQLite (`data.db`)

### `observations`
Stores structured audit observations with full lifecycle fields:
`category`, `table_name`, `entity_key`, `ObservationTitle`, `ObservationSubProcess`, `RepeatObservation`, `ObservationType`, `RiskType`, `Department`, `SBU`, `FollowUpFrequency`, `ShareWith`, `ObservationDescription`, `ShortObservation`, `RootCause`, `ImpactConcern`, `FinancialImplication`, `Auditee`, `OtherAuditee`, `Escalator1-3`, `Recommendation`, `CorrectiveActionPlan`, `PreventiveActionPlan`, `ShortActionPlan`, `TargetDate`, `RevisedTargetDate`, `PercentageCompletedAuditee/Auditor`, `ClosureDate`, `FromDate`, `ToDate`, `CompanyID`, `EmpId`, `ReportNo`, `lars_observ_req_id`, `lars_plan_id`, `lars_url`.

### `audit_trail_records`
`process`, `control`, `status`, `owner`, `department`, `remarks`, `vendor_no`, `vendor_name`, `field_changed`, `field_description`, `indicator`, `old_value`, `new_value`, `changed_by`, `risk`, `year`, `quantity`, `month_name`, `source_file`, `created_at`.

### `po` / `grn` / `bank` / `blocked_vendors` / `gst_check` / `disc_check`
Synthetically generated from Excel parse; stored as flat tables with invoice-level records. Written via `sqlite3.executemany` with explicit `DROP + CREATE` per load cycle. Demo data only — will be replaced with real ERP data in production.

---

# Folder Structure

```
purchase_dashboard/
├── app.py                      # Main Flask app — core routes, data loading, LARS integration (Polars, no pandas)
├── auth.py                     # Auth Blueprint — login/signup/logout/me
├── anomalies_blueprint.py      # Anomaly Detection Blueprint (/anomalies/*)
├── api.py                      # PAN KYC verification via MicroVista API
├── db_postgres.py              # PostgreSQL connection + users table init
├── db_encrypted_store.py       # Encrypted Postgres CRUD for purchase data + remarks
├── seed_observation.py         # One-off script to seed observation test data
├── 60rowdata.xlsx              # Demo source dataset (60 retail transactions)
├── audittrailmasterdata.xlsx   # Bundled vendor master change log (demo audit trail data)
├── data.db                     # SQLite database (local runtime store)
├── requirements.txt            # Python dependencies
├── .env                        # Environment variables (PG credentials, API keys)
│
├── models/
│   ├── anomaly_detector.py     # AnomalyDetector — Isolation Forest + LOF
│   ├── gemini_explainer.py     # GeminiExplainer — AI narrative summaries
│   └── dashboard_generator.py  # DashboardGenerator — Gemini chart config (WIP)
│
├── utils/
│   ├── data_loader.py          # Polars file loader with auto header detection
│   ├── data_processor.py       # Entity DataFrame builder for anomaly detection
│   └── suggestions.py         # Column suggestions for anomaly config UI
│
├── templates/
│   ├── index.html              # Main dashboard SPA shell — loads demo_data.js THEN main.js
│   ├── login.html              # Login page
│   ├── signup.html             # Signup page
│   └── pages/
│       ├── anomaly_detection.html   # Anomaly detection tool page
│       └── data_extraction.html     # KYC document extraction page
│
├── static/
│   ├── css/
│   │   ├── style.css           # Main dashboard styles
│   │   ├── anomaly_detection.css
│   │   ├── kyc_extraction.css
│   │   └── tampering_check.css
│   └── js/
│       ├── demo_data.js        # ALL static demo constants (IT/HR/Loan/KYC tables). Loads first.
│       ├── main.js             # All chart/table rendering and page logic. References demo_data.js constants.
│       ├── anomaly_detection.js
│       ├── kyc_extraction.js
│       └── tampering_check.js
│
├── exports/                    # Report generation (CSV/Excel for anomaly results)
└── tests/
    └── test_audit_trail.py     # Audit trail unit tests
```

---

# Core Logic

## Data Loading & Caching (`app.py`)
- `load_excel_data()` — Streams `60rowdata.xlsx` via low-level XML parsing (`zipfile + iterparse`). Builds a **Polars DataFrame** from the parsed rows. Applies column normalization, numeric coercion, and the `DEMO_AMOUNT_SCALE` multiplier using Polars expressions. Derives hygiene issue lists and synthetic PO/GRN/bank records via Polars `group_by`. Persists everything to SQLite (via `executemany`) + PostgreSQL.
- `ensure_data_loaded()` — Singleton pattern: tries PostgreSQL snapshot first, falls back to Excel parse. Result cached in global `DATA` variable.
- `load_from_sqlite()` — Checks for required SQLite tables and loads structured data via native `sqlite3` cursor → list of dicts (no pandas). Calls `load_purchase_snapshot()` for encrypted purchase rows from Postgres.
- `persist_sqlite_tables()` — Writes all six derived tables to SQLite using explicit `DROP TABLE / CREATE TABLE / executemany` — no pandas `.to_sql()`.
- `_sqlite_table_to_records()` — Helper that reads any SQLite table into a list of dicts using cursor + `description`. Replaces all `pd.read_sql_query()` calls.

## Pandas → Polars Migration (completed)
All `pandas` usage has been removed from `app.py`. Key replacements:

| Was (pandas) | Now (Polars / stdlib) |
|---|---|
| `pd.DataFrame(rows)` | `pl.DataFrame(rows)` |
| `pd.read_excel(path, dtype=str)` | `pl.read_excel(path, infer_schema_length=0)` |
| `pd.read_sql_query(...)` | `_sqlite_table_to_records(conn, table)` |
| `df.to_sql(name, conn, ...)` | `conn.executemany(INSERT ...)` |
| `pd.to_numeric(..., errors='coerce')` | `pl.col(c).cast(pl.Float64, strict=False)` |
| `pd.isna(v)` | `_is_na(v)` helper using `math.isnan` |
| `parse_excel_dates(series)` | `_parse_date_value(str)` using `datetime.strptime` |
| `df.groupby(...).agg(...)` | `pl.DataFrame.group_by(...).agg(...)` |
| `df.to_dict(orient='records')` | `pl.DataFrame.to_dicts()` |
| `pd.DataFrame(rows).to_excel(...)` | `pl.DataFrame(rows).write_excel(output)` |
| `normalize_observation_headers(df)` | Polars `df.rename(rename_map)` |

`pandas` remains a transitive dependency via `openpyxl` (used by Polars `write_excel`) but is not imported or used directly in `app.py`.

## JS Modularisation (completed)
`main.js` was split into two files:

- **`demo_data.js`** — owns all static hardcoded constants:
  - `IT_EMPLOYEES`, `IT_TABLES` (6 IT control card definitions)
  - `CONTROL_INVENTORY`, `CONTROL_INVENTORY_REGIONS`, `CONTROL_INVENTORY_EMAILS`
  - `HR_EMPLOYEES`, `HR_TABLES` (5 HR & Payroll card definitions)
  - `LOAN_TYPE_OPTIONS`, `LOAN_LOCATION_OPTIONS`
  - `LOAN_CALC_ROWS`, `LOAN_BANK_ROWS`, `LOAN_DIFF_ROWS` (loan repayment schedule data)
  - `KYC_TABLES`, `LOAN_TABLES`
- **`main.js`** — all duplicate `const` declarations removed (~986 lines); now only contains functions and logic. `LOAN_META` (borrower-specific metadata) intentionally kept in `main.js` as it is not demo table data.

**Critical load order** in `index.html` (was broken, now fixed):
```html
<script src=".../demo_data.js"></script>   <!-- constants defined first -->
<script src=".../main.js?v=6"></script>    <!-- functions reference them -->
```

**Data fixes made to `demo_data.js`** during modularisation:
- `LOAN_TYPE_OPTIONS`: changed `'Car Loan'` → `'Vehicle Loan'` and added `'Education Loan'` to match `LOAN_META` borrower data and the full dropdown.
- `LOAN_LOCATION_OPTIONS`: shortened from 8 cities to 5 (`Bangalore, Mumbai, Delhi, Chennai, Pune`) to match `LOAN_META` borrower locations (`'Delhi'` not `'Delhi NCR'`).
- `LOAN_BANK_ROWS` Pranjali month 6 interest (`3000`) confirmed intentional — it is the planted variance that `LOAN_DIFF_ROWS[85]` flags with `[null, 464, ...]`.

**Bug fixed in `main.js`**: Top-level `document.getElementById('chart-scatter-risk').getContext('2d')` executed unconditionally on script load. When `#chart-scatter-risk` is absent from the current page, this threw a `TypeError` that **halted all subsequent JS**, blanking every chart on every page. Fixed by wrapping in a null guard:
```js
const _scatterEl = document.getElementById('chart-scatter-risk');
if (_scatterEl) { const ctxScatter = _scatterEl.getContext('2d'); new Chart(ctxScatter, { ... }); }
```

## Hygiene Checks

| Check | Logic |
|---|---|
| `multi_tax` | Products with more than one unique GST rate across invoices |
| `dup_customers` | Store names mapped to multiple store codes |
| `prod_name_issues` | Product names mapped to multiple product codes |
| `prod_gst_issues` | Product names with varying GST rates |
| `prod_code_check` | Product codes mapped to multiple product names, or missing codes |
| `gst_check` | `GST_AMT` vs. `INVOICE_AMT x GST_RATE/100`; flagged if diff > 1 |
| `disc_check` | Actual discount vs. calculated `(item_price x qty) - net_sale`; flagged if diff > 1 |

## Observation Sync to LARS (`send_observation_to_lars`)
- Maps local field names to LARS API schema with strict value normalization (e.g., `SBU` always `"Corporate"`, `ObservationType` maps `"Compliance"` to `"Critical"`, `Auditee` validates against known LARS user IDs).
- Makes a POST with HTTP Basic auth headers; retries once on timeout.
- Extracts `planid` and `ObservReqID` from deeply nested response using recursive `find_response_value()`.

## ML Anomaly Detection (`models/anomaly_detector.py`)
- **Isolation Forest** — unsupervised outlier detection; contamination adjusts with dataset size.
- **LOF (Local Outlier Factor)** — density-based; n_neighbors scales proportionally to sample count.
- Both scores are combined into a `STRONG_ANOMALY` boolean flag (both models agree = anomaly).
- `StandardScaler` + `SimpleImputer(median)` applied before model fitting.
- Modes: `AUTO` (auto-selects grouping columns), `FIXED` (manual groupby + sum/frequency cols), `SEMI_FIXED` (groupby + extra numeric cols).

## Encrypted Storage (`db_encrypted_store.py`)
- Uses PostgreSQL's `pgcrypto` extension with symmetric key encryption (`pgp_sym_encrypt` / `pgp_sym_decrypt`).
- Entire purchase rows and hygiene finding rows are serialized to JSON, encrypted per row, and stored as `BYTEA`.
- Remarks are upserted individually (not bulk-replaced) on each Save action.
- Encryption key loaded from `DB_ENCRYPTION_KEY` env var — app refuses to operate without it.

---

# AI/ML

| Component | Model/API | Usage |
|---|---|---|
| **Anomaly Detection** | sklearn Isolation Forest + LOF | Detects statistically abnormal entities in user-uploaded datasets |
| **Anomaly Summaries** | Google Gemini 2.5 Flash (`gemini_explainer.py`) | Generates plain-English narrative summaries of detected anomalies |
| **Document Tampering** | Google Gemini 2.5 Flash (multimodal) | Forensic pixel-level + semantic analysis of uploaded document images |
| **Dashboard Config** (WIP) | Google Gemini 2.5 Flash (`dashboard_generator.py`) | Interprets natural language prompts to generate chart configurations |
| **KYC OCR** | Tesseract OCR + pdf2image | Extracts text from Aadhaar/PAN images/PDFs; regex parses doc number |
| **PAN Verification** | MicroVista KYC REST API | Validates PAN against government records via third-party API |

---

# Assumptions

1. **Dataset is demo-scale:** The primary data source (`60rowdata.xlsx`) has 60 rows of retail point-of-sale data. The `DEMO_AMOUNT_SCALE = 850` multiplier inflates amounts to a realistic crore-level total for demo presentation. This will be replaced with real ERP data in production.
2. **PO/GRN numbers are synthetic:** Generated randomly via `rand_po()` / `rand_grn()` at parse time using `random.seed(42)` for reproducibility. Not from any ERP system.
3. **Orphan GRN records are hardcoded:** 3 dummy "GRN without Purchase Invoice" entries are injected to demonstrate the exceptions table — purely demo scaffolding.
4. **LARS API is live but uses demo credentials:** The target LARS server is a demo/bank environment (`LARS_Demo_bank`). Hardcoded credentials (`admin/admin@123`) and fixed `Auditee = "Amey"` suggest controlled demo access, not a multi-tenant production setup.
5. **Single-user data model for purchase data:** The `DATA` global variable is process-wide. There is no per-user data isolation for the purchase dashboard — all logged-in users see the same data snapshot.
6. **PostgreSQL on localhost:** The `.env` configures Postgres at `localhost:5433` (non-standard port), suggesting a locally installed instance rather than a managed cloud DB.
7. **IT Controls and HR/Payroll modules use frontend-only demo data:** These modules render entirely from constants in `demo_data.js`. No backend endpoint exists for their data yet. When real data is available, the relevant constant in `demo_data.js` should be deleted and replaced with an API call in `main.js`.
8. **`dashboard_generator.py` is a work-in-progress:** The `DashboardGenerator` class is defined and references Gemini, but is not wired to any route in `app.py` or `anomalies_blueprint.py`.
9. **Tesseract OCR path:** Auto-detected via `shutil.which('tesseract')` with a Windows fallback path. OCR quality depends on local Tesseract installation and document scan quality.
10. **`demo_data.js` must always load before `main.js`:** `main.js` references constants defined in `demo_data.js` at function call time. The load order in `index.html` enforces this. When a module goes production, delete its data block from `demo_data.js` and add the API call in `main.js` — no other file needs to change.