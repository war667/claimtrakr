#!/usr/bin/env python3
"""
Show ClaimTrakr database table sizes.
Usage: python3 dbsize.py
Runs inside the VPS via: docker compose exec db psql ... or directly if DB env vars are set.

Typical usage on VPS:
  python3 dbsize.py
"""
import os
import subprocess
import sys


def get_env():
    """Read POSTGRES_* vars from .env file if not already in environment."""
    env = {}
    for key in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
        env[key] = os.environ.get(key, "")

    if not all(env.values()):
        env_file = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, _, v = line.partition("=")
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k in env and not env[k]:
                            env[k] = v
    return env


TABLE_SQL = """
SELECT
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total,
    pg_size_pretty(pg_relation_size(relid)) AS data,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS indexes,
    to_char(reltuples::bigint, 'FM999,999,999') AS est_rows
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
"""

DB_SQL = """
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_total;
"""

BLOAT_SQL = """
SELECT
    schemaname, tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total,
    n_dead_tup AS dead_rows,
    n_live_tup AS live_rows
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC
LIMIT 10;
"""


def run_psql(sql, env):
    cmd = [
        "docker", "compose", "exec", "-T", "db",
        "psql",
        "-U", env["POSTGRES_USER"],
        "-d", env["POSTGRES_DB"],
        "-c", sql,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr.strip()}", file=sys.stderr)
        return None
    return result.stdout.strip()


def main():
    env = get_env()
    if not env["POSTGRES_USER"]:
        print("Could not determine POSTGRES_USER. Set env vars or ensure .env exists.")
        sys.exit(1)

    print("\n  ClaimTrakr — Database Size Report")
    print("  " + "=" * 60)

    db_out = run_psql(DB_SQL, env)
    if db_out:
        for line in db_out.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("-") and "db_total" not in stripped and "row" not in stripped:
                print(f"\n  Total database size: {stripped}\n")

    table_out = run_psql(TABLE_SQL, env)
    if table_out:
        col_w = [30, 10, 10, 10, 16]
        headers = ["Table", "Total", "Data", "Indexes", "Est. Rows"]
        header_line = "  " + "  ".join(h.ljust(col_w[i]) for i, h in enumerate(headers))
        print(header_line)
        print("  " + "-" * (sum(col_w) + len(col_w) * 2))

        for line in table_out.splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) == 5 and parts[0] not in ("table_name", ""):
                row = "  " + "  ".join(parts[i].ljust(col_w[i]) for i in range(5))
                print(row)

    bloat_out = run_psql(BLOAT_SQL, env)
    if bloat_out and "0 rows" not in bloat_out:
        has_bloat = any("|" in line for line in bloat_out.splitlines()
                        if line.strip() and "schemaname" not in line and "---" not in line and "row" not in line)
        if has_bloat:
            print("\n  Tables with significant dead rows (consider VACUUM):")
            print("  " + "-" * 60)
            for line in bloat_out.splitlines():
                parts = [p.strip() for p in line.split("|")]
                if len(parts) == 5 and parts[1] not in ("tablename", ""):
                    print(f"  {parts[1]:<30} dead={int(parts[3]):>10,}  live={int(parts[4]):>10,}")

    print()


if __name__ == "__main__":
    main()
