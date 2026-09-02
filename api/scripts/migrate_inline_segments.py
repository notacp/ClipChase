#!/usr/bin/env python3
"""One-time migration: move transcript segments inline.

Segments used to live in `transcript_segments`, an FTS5 virtual table whose
columns were all UNINDEXED. Since c8ff4b2 removed the FTS pre-filter, nothing
issued a MATCH query against it, so every lookup filtered UNINDEXED columns
with no usable index — a full scan of every segment ever stored, on both the
read path and the DELETE that preceded each write. Cost grew with the corpus,
so each indexed video made the next index write more expensive.

Segments now live as a JSON array on the `indexed_transcripts` row, keyed by
the primary key the lookup already used. Cloudflare D1 bills per row touched
and explicitly not per byte, so one fat row costs 1 read where ~1,000 thin
ones cost 1,000.

Run ORDER MATTERS:

    1. Run this script (adds a column; old code ignores it, so this is safe
       to run against the currently-deployed API).
    2. Deploy the new code.
    3. Once traffic looks healthy, run with --drop-old to reclaim the space.

Old segment rows are NOT copied. Reading them is the expensive operation this
migration exists to eliminate, and the index is a cache of YouTube transcripts
that repopulates as people search.

    python api/scripts/migrate_inline_segments.py            # add the column
    python api/scripts/migrate_inline_segments.py --drop-old # reclaim space
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

# Load the same .env the API uses, so this targets the same database the
# running service does. Without it the service falls back to a local sqlite
# file and the migration silently does nothing to production.
try:
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env", override=True)
except ImportError:  # pragma: no cover - dotenv ships with the API deps
    pass

from api.app.services.transcript_index import (  # noqa: E402
    TranscriptIndexService,
    _remote_backend,
)

ADD_COLUMN = "ALTER TABLE indexed_transcripts ADD COLUMN segments TEXT NOT NULL DEFAULT '[]'"
DROP_OLD = "DROP TABLE IF EXISTS transcript_segments"


def _run(conn, statement: str) -> str:
    """Execute one DDL statement and flush it, returning a status string.

    The remote adapters queue writes, so commit() is what actually sends the
    statement and therefore what raises.
    """
    try:
        conn.execute(statement)
        conn.commit()
        return "applied"
    except Exception as exc:  # noqa: BLE001 - inspected below
        message = str(exc).lower()
        if "duplicate column" in message:
            return "already applied"
        if "no such table" in message:
            return "nothing to do"
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--drop-old",
        action="store_true",
        help="drop the obsolete transcript_segments table (run only after the new code is live)",
    )
    args = parser.parse_args()

    # Say out loud which database is about to be altered. A migration that
    # silently hits a local sqlite file looks identical to one that worked.
    backend = _remote_backend() or "local sqlite"
    print(f"target backend: {backend}")

    service = TranscriptIndexService()
    conn = service._connect()  # noqa: SLF001 - migration is an insider
    try:
        print(f"add segments column: {_run(conn, ADD_COLUMN)}")
        if args.drop_old:
            print(f"drop transcript_segments: {_run(conn, DROP_OLD)}")
        else:
            print("drop transcript_segments: skipped (pass --drop-old once the new code is live)")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
