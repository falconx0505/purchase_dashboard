import json
import os

from db_postgres import get_pg_connection

ENCRYPTION_KEY = os.getenv("DB_ENCRYPTION_KEY", "")


def _require_key():
    if not ENCRYPTION_KEY:
        raise RuntimeError(
            "DB_ENCRYPTION_KEY is not set in .env — add it before using the encrypted store."
        )


def init_encrypted_tables():
    """Create the two encrypted tables if they don't exist yet. Safe to call every startup.
    Assumes the pgcrypto extension has already been created (see Step 1 — needs a superuser)."""
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS purchase_raw_encrypted (
                    id SERIAL PRIMARY KEY,
                    row_index INTEGER NOT NULL,
                    encrypted_data BYTEA NOT NULL,
                    loaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS hygiene_findings_encrypted (
                    id SERIAL PRIMARY KEY,
                    category VARCHAR(50) NOT NULL,
                    row_index INTEGER NOT NULL,
                    encrypted_data BYTEA NOT NULL,
                    loaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS hygiene_remarks_encrypted (
                    issue_id VARCHAR(255) PRIMARY KEY,
                    category VARCHAR(50) NOT NULL,
                    entity_key VARCHAR(255) NOT NULL,
                    encrypted_remark BYTEA NOT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        conn.commit()
    finally:
        conn.close()


def save_purchase_snapshot(purchase_rows, hygiene):
    """
    Encrypts and stores a fresh snapshot, replacing whatever was there before.

    purchase_rows: list[dict] — DATA["purchase"], the parsed original spreadsheet rows.
    hygiene: dict[str, list[dict]] — e.g.
        {
            "dup_customers": [...], "multi_tax": [...], "prod_name_issues": [...],
            "prod_gst_issues": [...], "prod_code_check": [...],
        }

    Meant to run once per fresh Excel parse (i.e. inside load_excel_data()), not on
    every request — encrypting every row on every page view would be needlessly slow.
    """
    _require_key()
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE purchase_raw_encrypted")
            for idx, row in enumerate(purchase_rows):
                cur.execute(
                    "INSERT INTO purchase_raw_encrypted (row_index, encrypted_data) "
                    "VALUES (%s, pgp_sym_encrypt(%s, %s))",
                    (idx, json.dumps(row, default=str), ENCRYPTION_KEY),
                )

            cur.execute("TRUNCATE hygiene_findings_encrypted")
            for category, records in hygiene.items():
                for idx, row in enumerate(records):
                    cur.execute(
                        "INSERT INTO hygiene_findings_encrypted (category, row_index, encrypted_data) "
                        "VALUES (%s, %s, pgp_sym_encrypt(%s, %s))",
                        (category, idx, json.dumps(row, default=str), ENCRYPTION_KEY),
                    )
        conn.commit()
    finally:
        conn.close()


def load_purchase_snapshot():
    """
    Decrypts and returns the stored snapshot as (purchase_rows, hygiene), or None if
    nothing has been saved yet. Not currently called by the live app — this exists so
    you can verify the round trip (see Step 5) before we wire it into the real data path.
    """
    _require_key()
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM purchase_raw_encrypted")
            if cur.fetchone()["n"] == 0:
                return None

            cur.execute(
                "SELECT row_index, pgp_sym_decrypt(encrypted_data, %s) AS decrypted "
                "FROM purchase_raw_encrypted ORDER BY row_index",
                (ENCRYPTION_KEY,),
            )
            purchase_rows = [json.loads(r["decrypted"]) for r in cur.fetchall()]

            cur.execute(
                "SELECT category, row_index, pgp_sym_decrypt(encrypted_data, %s) AS decrypted "
                "FROM hygiene_findings_encrypted ORDER BY category, row_index",
                (ENCRYPTION_KEY,),
            )
            hygiene = {}
            for r in cur.fetchall():
                hygiene.setdefault(r["category"], []).append(json.loads(r["decrypted"]))
    finally:
        conn.close()

    return purchase_rows, hygiene


def save_hygiene_remark_encrypted(issue_id, category, entity_key, remark):
    """Insert or update one remark, encrypted. Called on every Save click —
    unlike save_purchase_snapshot, this is a single-row upsert, not a bulk rewrite."""
    _require_key()
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hygiene_remarks_encrypted (issue_id, category, entity_key, encrypted_remark, updated_at)
                VALUES (%s, %s, %s, pgp_sym_encrypt(%s, %s), CURRENT_TIMESTAMP)
                ON CONFLICT (issue_id) DO UPDATE SET
                    category = EXCLUDED.category,
                    entity_key = EXCLUDED.entity_key,
                    encrypted_remark = EXCLUDED.encrypted_remark,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (issue_id, category, entity_key, remark, ENCRYPTION_KEY),
            )
        conn.commit()
    finally:
        conn.close()


def delete_hygiene_remark_encrypted(issue_id):
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM hygiene_remarks_encrypted WHERE issue_id = %s", (issue_id,))
        conn.commit()
    finally:
        conn.close()


def load_hygiene_remarks_encrypted():
    """Returns {issue_id: remark_text} for every saved remark, decrypted."""
    _require_key()
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT issue_id, pgp_sym_decrypt(encrypted_remark, %s) AS decrypted "
                "FROM hygiene_remarks_encrypted",
                (ENCRYPTION_KEY,),
            )
            return {r["issue_id"]: r["decrypted"] for r in cur.fetchall()}
    finally:
        conn.close()