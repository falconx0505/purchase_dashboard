# Project Overview

- **Name:** Purchase & Audit Intelligence Dashboard
- **Description:** A Flask-based internal audit tool that ingests retail purchase/transaction data (Excel), runs data hygiene checks, flags financial anomalies, and syncs structured audit observations to an external audit management system (LARS). Includes an in-app AI assistant ("Genie") and standalone ML anomaly detection accessible via a dedicated SPA page.
- **Goal:** Automate and centralize purchase data auditing — from data quality checks to formal observation management — for internal audit teams in an enterprise/banking context.

> **⚠️ Demo → Product Transition Note:**
> This project is actively transitioning from a demo to a production product. Several areas mix real product-grade code with demo scaffolding:
> - Purchase amounts use the raw values from `60rowdata.xlsx` (the `DEMO_AMOUNT_SCALE` multiplier has been **removed** from the current codebase).
> - PO/GRN numbers (`PO-XXXX`, `GRN-XXX`) are **randomly generated** — not sourced from a real ERP.
> - Some orphan GRN entries are **hardcoded** to populate exception tables for demo purposes.
> - The LARS API integration (`send_observation_to_lars`) is **real and live** (targeting `http://45.248.67.66/...`), already pushing data to a connected LARS server.
> - The PostgreSQL encrypted store and auth system are **production-grade** features.
> - The IT Controls, HR & Payroll, Loan, and KYC modules render entirely from **frontend-only demo constants** in `main.js` — no backend endpoint exists for their data yet.
> - OCR/KYC extraction and document tampering detection routes have been **removed** from `app.py`; the relevant HTML sections remain in `index.html` but are not wired to any backend.

---

# Features

1. **Purchase Data Dashboard** — Visualizes invoice/GST/discount data with multi-dimensional filtering (company, region, product, month, year).
2. **Purchase Data Hygiene Checks** — Flags: multiple tax rates per product, duplicate customer codes, product name/code mismatches, and GST/discount calculation errors. Supports encrypted remarks per issue.
3. **PO / GRN / Bank Reconciliation** — Compares Purchase Orders, Goods Receipt Notes, and bank payments per invoice; surfaces mismatches and open POs.
4. **Audit Trail Viewer** — Loads vendor master change logs (Excel upload or bundled `audittrailmasterdata.xlsx`), grouped by vendor/field type/risk level.
5. **Observations Management** — Full CRUD for audit observations (linked to Purchase hygiene findings, IT Controls, HR & Payroll finding categories). Supports Excel bulk upload. Syncs each saved observation to LARS via REST API.
6. **LARS Integration** — Pushes saved observations to an external audit management system with field mapping/normalization and returns `planid` + `ObservReqID`.
7. **Anomaly Journey (ML)** — Dedicated SPA page (`page-anomaly-journey`); user walks through an animated journey before landing on anomaly detection config/results. Backed by the same ML pipeline (Isolation Forest + LOF via sklearn).
8. **Genie AI Assistant** — Floating action button visible on all pages; opens a chat popup. Currently a frontend-only placeholder (not wired to a backend LLM endpoint).
9. **IT Controls Module** — Renders IT control tables and cards from frontend demo constants. No backend endpoint.
10. **HR & Payroll Module** — Renders HR/Payroll tables and cards from frontend demo constants. No backend endpoint.
11. **Loan Repayment Module** — Renders loan repayment schedule and variance tables from frontend demo constants. No backend endpoint.
12. **KYC / PAN Module** — Renders KYC tables from frontend demo constants. No backend endpoint.
13. **User Authentication** — Session-based login/signup with bcrypt-hashed passwords stored in PostgreSQL.

---

# Architecture

## Frontend
- **Templates:** Jinja2 HTML (`templates/index.html`, `login.html`, `signup.html`)
  - `pages/` sub-folder **no longer exists** — all SPA pages are embedded directly inside `index.html`.
- **Styling:** Single Vanilla CSS file: `static/css/style.css`. Separate per-feature CSS files (`anomaly_detection.css`, `kyc_extraction.css`, `tampering_check.css`) have been **removed**.
- **JavaScript:** Single monolithic file: `static/js/main.js` (~1,893 lines).
  - `demo_data.js` **no longer exists** as a separate file. All constants (IT Controls, HR & Payroll, Loan, KYC tables) have been merged into `main.js`.
  - No separate `anomaly_detection.js`, `kyc_extraction.js`, `tampering_check.js` files.
- External CDN dependencies loaded in `index.html`:
  - `chart.js@4.4.0` — bar/pie/line charts
  - `xlsx@0.18.5` — client-side Excel parsing
  - `tesseract.js@5` — client-side OCR (frontend only)
  - `plotly-latest` — scatter/advanced charts
- All data is loaded via AJAX (`fetch`) calls to Flask JSON endpoints; the page renders client-side.

## Backend
- **Framework:** Flask (Python), running on `127.0.0.1:5000`
- **Main App:** `app.py` — monolithic entry point with all purchase/audit/hygiene/observation routes. **Uses Polars throughout** (pandas fully removed from `app.py`).
- **Blueprints:**
  - `auth.py` — Login/signup/logout/me routes (Blueprint: `auth_bp`)
- **No `anomalies_blueprint.py` or `api.py`** — these files are not present in the current project root.

## Databases
- **SQLite (`data.db`):** Stores purchase-derived tables (`po`, `grn`, `bank`, `blocked_vendors`, `gst_check`, `disc_check`), audit trail records, hygiene remarks (plaintext fallback), and observations. Written via native `sqlite3.executemany` — no pandas/ORM dependency.
- **PostgreSQL (`audit_tool` DB):** Stores users (auth), and encrypted purchase snapshots + hygiene findings. Uses `pgcrypto` extension for symmetric encryption (`pgp_sym_encrypt/decrypt`). Also stores encrypted hygiene remarks (`hygiene_remarks_encrypted` table).

## External Services

| Service | Purpose |
|---|---|
| **LARS API** (`http://45.248.67.66/LARS_Demo_bank/...`) | Pushes audit observations; returns `planid` + `ObservReqID` |

> **Note:** Google Gemini (anomaly summaries, document tampering), Tesseract OCR (backend), MicroVista KYC API, and sklearn anomaly models are referenced in `requirements.txt` but their backend routes are **not currently wired in `app.py`**. The `models/` and `utils/` directories may still exist on disk but are not imported in the running app.

---

# Data Flow

## Purchase Dashboard Flow
1. On startup, `ensure_data_loaded()` checks if a PostgreSQL encrypted snapshot exists.
2. If not, `load_excel_data()` parses `60rowdata.xlsx` via low-level XML streaming (`zipfile + iterparse`), builds a **Polars DataFrame**, applies column normalization, and derives hygiene issue lists + synthetic PO/GRN/bank records.
3. All structured tables are persisted to **SQLite** via `sqlite3.executemany`; purchase rows + hygiene findings are **encrypted and stored in PostgreSQL**.
4. The `/api/data` endpoint loads from SQLite / PostgreSQL, assembles a JSON payload (with `_dashboard_payload()` aggregation), and sends it to the frontend.
5. The frontend (`main.js`) renders charts, tables, and filter controls from this payload.

## Observation → LARS Flow
1. User opens an issue card, fills out observation fields in a modal form, clicks Save.
2. Frontend POSTs to `/api/observations`.
3. Backend saves the record to SQLite `observations` table.
4. Immediately calls `send_observation_to_lars()`, which maps fields to LARS JSON schema and POSTs to the LARS ASMX endpoint.
5. LARS returns `planid` + `ObservReqID`; these are stored back in the `observations` row.
6. Response includes `lars_sync` status so the frontend can show success/failure.

## Observation Bulk Upload Flow
1. User navigates to `page-upload-observation`, uploads an Excel file.
2. Frontend POSTs the file to `/api/observations/upload`.
3. Backend reads with Polars, normalizes headers via `normalize_observation_headers()`, validates categories against `VALID_CATEGORIES`, and bulk-inserts valid rows (replacing existing rows for the same category first).

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

`category`, `table_name`, `entity_key`, `ObservationTitle`, `ObservationSubProcess`, `RepeatObservation`, `ObservationType`, `RiskType`, `Department`, `SBU`, `FollowUpFrequency`, `ShareWith`, `ObservationDescription`, `ShortObservation`, `RootCause`, `ImpactConcern`, `FinancialImplication`, `Auditee`, `OtherAuditee`, `Escalator1`, `Escalator2`, `Escalator3`, `Recommendation`, `CorrectiveActionPlan`, `PreventiveActionPlan`, `ShortActionPlan`, `TargetDateNotApplicable`, `TargetDate`, `RevisedTargetDate`, `PercentageCompletedAuditee`, `PercentageCompletedAuditor`, `ClosureDate`, `ClosureReason`, `FromDate`, `ToDate`, `CompanyID`, `EmpId`, `ReportNo`, `lars_observ_req_id`, `lars_plan_id`, `lars_url`.

### `audit_trail_records`
`process`, `control`, `status`, `owner`, `department`, `remarks`, `vendor_no`, `vendor_name`, `field_changed`, `field_description`, `indicator`, `old_value`, `new_value`, `changed_by`, `risk`, `year`, `quantity`, `month_name`, `source_file`, `created_at`.

### `hygiene_remarks` (SQLite local fallback)
`issue_id` (PK), `category`, `entity_key`, `remark`, `updated_at`.
> This table exists for schema init but remarks are primarily stored **encrypted in PostgreSQL** via `db_encrypted_store.py`.

### `po` / `grn` / `bank` / `blocked_vendors` / `gst_check` / `disc_check`
Synthetically generated from Excel parse; stored as flat tables with invoice-level records. Written via `sqlite3.executemany` with explicit `DROP + CREATE` per load cycle. Demo data only.

---

# Folder Structure

```
purchase_dashboard/
├── app.py                      # Main Flask app — all active routes, data loading, LARS integration (Polars, no pandas)
├── auth.py                     # Auth Blueprint — login/signup/logout/me (uses PostgreSQL)
├── db_postgres.py              # PostgreSQL connection pool + users table init
├── db_encrypted_store.py       # Encrypted Postgres CRUD for purchase data + hygiene remarks
├── seed_observation.py         # One-off script to seed observation test data
├── 60rowdata.xlsx              # Demo source dataset (60 retail transactions)
├── audittrailmasterdata.xlsx   # Bundled vendor master change log (demo audit trail data)
├── data.db                     # SQLite database (local runtime store)
├── requirements.txt            # Python dependencies
├── .env                        # Environment variables (PG credentials, API keys)
│
├── templates/
│   ├── index.html              # Single-page app shell — ALL pages embedded here. Loads main.js.
│   ├── login.html              # Login page
│   └── signup.html             # Signup page
│
├── static/
│   ├── css/
│   │   └── style.css           # All dashboard styles (single file)
│   └── js/
│       └── main.js             # ALL chart/table rendering, page logic, demo constants, observations (~1,893 lines)
│
└── tests/
    └── test_audit_trail.py     # Audit trail unit tests
```

> **Note:** `models/`, `utils/`, `exports/` directories and files like `anomalies_blueprint.py`, `api.py`, `demo_data.js` may exist on disk from earlier iterations but are **not imported or used by the running application**.

---

# SPA Pages (in `index.html`)

| Page ID | Label | Description |
|---|---|---|
| `page-home` | Dashboard | Main KPI cards, charts (pie, bar, monthly stacked), module summary tiles |
| `page-anomaly-journey` | Anomaly Journey | Animated ML anomaly detection walkthrough page |
| `page-welcome` | Dashboard | Welcome / module selector grid |
| `page-filters` | Filters | Filter controls (company, state, product, customer, month) |
| `page-hygiene` | Purchase hygiene | Hygiene check tables with remarks |
| `page-po-summary` | PO vs invoice vs GRN vs bank | PO/GRN/Bank reconciliation table + open POs |
| `page-po-detail` | PO detail | Detailed per-invoice PO view |
| `page-purchase` | Purchase analytics | Full purchase data table + charts |
| `page-ai-dashboard` | AI dashboard | AI-powered chart/insight view |
| `page-formula` | Calculation check | GST & discount calculation error tables |
| `page-po-split` | PO Split | PO split / variance views |
| `page-observations` | Observations | CRUD observation list + modal form; LARS sync |
| `page-addition` | Additional modules | IT Controls, HR & Payroll, Loan, KYC sub-modules |
| `page-upload-observation` | Observation import | Excel bulk upload for observations |

Sub-pages rendered dynamically within the `page-addition` shell (not top-level pages):
- IT Controls cards/tables — rendered by `renderItControls()` in `main.js`
- HR & Payroll — rendered by `renderHrPayroll()`
- Loan Repayment — rendered by `renderLoanRepayment()`
- KYC module — rendered within `renderAddition()`

---

# Core Logic

## Data Loading & Caching (`app.py`)
- `load_excel_data()` — Streams `60rowdata.xlsx` via low-level XML parsing (`zipfile + iterparse`). Builds a **Polars DataFrame** from the parsed rows. Applies column normalization, numeric coercion. Derives hygiene issue lists and synthetic PO/GRN/bank records via Polars `group_by`. Persists everything to SQLite + PostgreSQL.
- `ensure_data_loaded()` — Singleton pattern: tries PostgreSQL snapshot first, falls back to Excel parse. Result cached in global `DATA` variable.
- `load_from_sqlite()` — Checks for required SQLite tables and loads structured data via native `sqlite3` cursor → list of dicts. Calls `load_purchase_snapshot()` for encrypted purchase rows from Postgres.
- `persist_sqlite_tables()` — Writes all six derived tables to SQLite using explicit `DROP TABLE / CREATE TABLE / executemany` — no pandas.
- `_sqlite_table_to_records()` — Helper: reads any SQLite table into a list of dicts using cursor + `description`.
- `_dashboard_payload()` — Groups purchase rows by all dimension columns via Polars `group_by().agg()`, limiting large lists to 500–1000 records per field before sending to frontend.

## Flask Routes (`app.py`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Serve `index.html` (redirects to `/login` if not authenticated) |
| GET | `/api/data` | Returns full dashboard payload (purchase data, hygiene, PO/GRN/bank, comparison, remarks) |
| GET | `/api/observations` | List observations (optional `?category=` filter) |
| POST | `/api/observations` | Create or update an observation; auto-syncs to LARS |
| POST | `/api/observations/delete` | Delete an observation by `id` |
| POST | `/api/hygiene/remark` | Save or delete an encrypted hygiene remark |
| POST | `/api/observations/upload` | Bulk upload observations from Excel file |

Auth routes (from `auth.py` Blueprint):

| Method | Route | Purpose |
|---|---|---|
| GET | `/login` | Render login page |
| GET | `/signup` | Render signup page |
| POST | `/api/login` | Authenticate user, set session |
| POST | `/api/signup` | Register new user |
| POST | `/api/logout` | Clear session |
| GET | `/api/me` | Return current logged-in user info |

## Pandas → Polars Migration (completed in `app.py`)
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

## JS Architecture (`main.js` only)
All JavaScript is in a single `main.js` file (~1,893 lines). Key global state:

- `RAW` — raw API payload from `/api/data`
- `F` — active filters `{ company, state, product, customer, month }`
- `CHARTS` — Chart.js instance registry (keyed by canvas ID); `destroyChart(id)` prevents duplicate canvas errors
- `currentObsCategory` — tracks which category the Observations page is showing
- `HOME_MONTHLY_SPLIT` — cached monthly split data for the Home "Monthly Error Trend" chart
- `GENIE_PAGES` — list of page IDs where the Genie FAB is explicitly shown (currently set to show on **all** pages regardless)

Page navigation via `goTo(pageId)` hides all `.page` elements and shows the target. `renderCurrentPage(pageId)` dispatches to the right render function.

**Frontend-only demo constants** (defined in `main.js`):
- `IT_EMPLOYEES`, `IT_TABLES` (6 IT control card definitions)
- `CONTROL_INVENTORY`, `CONTROL_INVENTORY_REGIONS`, `CONTROL_INVENTORY_EMAILS`
- `HR_EMPLOYEES`, `HR_TABLES` (5 HR & Payroll card definitions)
- `LOAN_TYPE_OPTIONS`, `LOAN_LOCATION_OPTIONS`, `LOAN_META`
- `LOAN_CALC_ROWS`, `LOAN_BANK_ROWS`, `LOAN_DIFF_ROWS`
- `KYC_TABLES`, `LOAN_TABLES`

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

## Valid Observation Categories (`VALID_CATEGORIES` in `app.py`)
The set currently is: `{"multi_tax", "prod_gst", "dup_cust", "prod_name", "prod_code"}`.

> Warning: This set is smaller than the labels used in `BREADCRUMB_LABELS` and observation UI — observations for IT Controls (`itc_*`) and HR (`hr_*`) categories are handled on the frontend only and filtered client-side using `currentObsCategory` prefix matching. They are saved to SQLite under their respective category strings but LARS sync is attempted for all.

## Observation Sync to LARS (`send_observation_to_lars`)
- Maps local field names to LARS API schema with strict value normalization (e.g., `SBU` always `"Corporate"`, `ObservationType` maps `"Compliance"` to `"Critical"`, `Auditee` validates against known LARS user IDs, falls back to `"Amey"`).
- Makes a POST with HTTP Basic auth headers (hardcoded `admin/admin@123`); retries once on timeout.
- Extracts `planid` and `ObservReqID` from deeply nested response using recursive `find_response_value()`.
- `TargetDateNotApplicable`: if `"Yes"`, `TargetDate` is sent as empty string to LARS.

## Encrypted Storage (`db_encrypted_store.py`)
- Uses PostgreSQL's `pgcrypto` extension with symmetric key encryption (`pgp_sym_encrypt` / `pgp_sym_decrypt`).
- Entire purchase rows and hygiene finding rows are serialized to JSON, encrypted per row, and stored as `BYTEA`.
- Remarks are upserted individually (not bulk-replaced) on each Save action.
- Encryption key loaded from `DB_ENCRYPTION_KEY` env var — app refuses to operate without it.

---

# Assumptions

1. **Dataset is demo-scale:** The primary data source (`60rowdata.xlsx`) has 60 rows of retail point-of-sale data. The `DEMO_AMOUNT_SCALE` multiplier has been removed — amounts are used as-is from the source file.
2. **PO/GRN numbers are synthetic:** Generated randomly via `rand_po()` / `rand_grn()` at parse time using `random.seed(42)` for reproducibility. Not from any ERP system.
3. **Orphan GRN records are hardcoded:** Dummy "GRN without Purchase Invoice" entries may be injected to demonstrate the exceptions table — purely demo scaffolding.
4. **LARS API is live but uses demo credentials:** The target LARS server is a demo/bank environment (`LARS_Demo_bank`). Hardcoded credentials (`admin/admin@123`) and fixed `Auditee = "Amey"` suggest controlled demo access, not a multi-tenant production setup.
5. **Single-user data model for purchase data:** The `DATA` global variable is process-wide. There is no per-user data isolation for the purchase dashboard — all logged-in users see the same data snapshot.
6. **PostgreSQL on localhost:** The `.env` configures Postgres at `localhost:5433` (non-standard port), suggesting a locally installed instance rather than a managed cloud DB.
7. **IT Controls, HR/Payroll, Loan, KYC modules use frontend-only demo data:** These modules render entirely from constants in `main.js`. No backend endpoint exists for their data. When real data is available, replace the relevant constant with an API call.
8. **Genie AI chat is a frontend placeholder:** The floating chat button UI is fully implemented but `handleGenieChatSend()` is a stub — not wired to any backend or LLM API.
9. **Anomaly detection and document OCR/tampering routes are removed from `app.py`:** The corresponding HTML page sections may still exist in `index.html` and dependencies are listed in `requirements.txt`, but no active Flask endpoints serve these features in the current build.
10. **Single JS file:** All frontend logic, constants, and rendering functions live in `main.js`. There is no module bundler or ES module setup — all code runs in global scope in the browser.
11. **Script load order:** `main.js` is the only script loaded from `static/js/`. It depends on Chart.js, xlsx.js, Tesseract.js, and Plotly being loaded from CDN first (as declared in `index.html`).