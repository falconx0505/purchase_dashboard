import os
import psycopg2
import psycopg2.extras

# Reads the PG_* values you added to .env (app.py's load_env_file already
# puts them into os.environ before this module is imported).
PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = os.getenv("PG_PORT", "5433")
PG_DB = os.getenv("PG_DB", "audit_tool")
PG_USER = os.getenv("PG_USER", "audit_app")
PG_PASSWORD = os.getenv("PG_PASSWORD", "")


def get_pg_connection():
    """Open a new Postgres connection. Rows come back as dicts."""
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def init_users_table():
    """Create the users table if it doesn't exist yet. Safe to call every startup."""
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) NOT NULL DEFAULT 'auditor',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        conn.commit()
    finally:
        conn.close()