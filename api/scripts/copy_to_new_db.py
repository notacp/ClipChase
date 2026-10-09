#!/usr/bin/env python3
"""One-time copy of the index into a fresh D1 database, compressing segments.

Oct 2026: the original database hit the free plan's 500 MB cap and D1 then
refused every write, including UPDATEs that would have shrunk rows, so the
data could not be compressed in place. This copies schema + all rows into a
new database (its own 500 MB allowance), compressing legacy raw-JSON
segments on the way. The source is only read, never modified.

    python api/scripts/copy_to_new_db.py <target_database_id>

Then point CF_D1_DATABASE_ID at the target and redeploy.
"""
from __future__ import annotations

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_ROOT / ".env")
load_dotenv(_ROOT / ".env.local")

from api.app.services.transcript_index import (  # noqa: E402
    _SEGMENTS_PREFIX,
    decode_segments,
    encode_segments,
)

ACCOUNT = os.environ["CF_ACCOUNT_ID"]
SOURCE = os.environ["CF_D1_DATABASE_ID"]
HEADERS = {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"}
client = httpx.Client(timeout=120)


def q(db: str, sql: str, params: list | None = None) -> list[dict]:
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{db}/query"
    for attempt in range(4):
        r = client.post(url, headers=HEADERS, json={"sql": sql, "params": params or []})
        try:
            body = r.json()
        except ValueError:
            body = {"errors": [r.text[:200]]}
        if body.get("success"):
            return body["result"][0]["results"]
        if attempt == 3:
            raise RuntimeError(f"{body.get('errors')} :: {sql[:80]}")


def copy_simple(target: str, table: str, cols: list[str]) -> int:
    rows = q(SOURCE, f"SELECT {', '.join(cols)} FROM {table}")
    # D1 caps bound parameters at 100 per query.
    per = max(1, 100 // len(cols))
    for i in range(0, len(rows), per):
        chunk = rows[i : i + per]
        values = ", ".join(["(" + ", ".join(["?"] * len(cols)) + ")"] * len(chunk))
        params = [r[c] for r in chunk for c in cols]
        q(target, f"INSERT OR IGNORE INTO {table} ({', '.join(cols)}) VALUES {values}", params)
    return len(rows)


T_COLS = ["video_id", "language_code", "language_label", "is_generated", "segment_count", "indexed_at", "segments"]


def copy_transcript(target: str, row: dict) -> tuple[int, int]:
    seg = row["segments"]
    if seg and seg != "[]" and not seg.startswith(_SEGMENTS_PREFIX):
        enc = encode_segments(seg)
        if decode_segments(enc) != json.loads(seg):
            raise RuntimeError(f"round-trip mismatch {row['video_id']}")
    else:
        enc = seg
    q(
        target,
        f"INSERT OR IGNORE INTO indexed_transcripts ({', '.join(T_COLS)}) VALUES ({', '.join(['?'] * len(T_COLS))})",
        [row[c] if c != "segments" else enc for c in T_COLS],
    )
    return len(seg or ""), len(enc or "")


def main() -> None:
    target = sys.argv[1]
    if target == SOURCE:
        sys.exit("target must differ from the source database")

    # Exact schema (tables + indexes) from the source, skipping internals.
    schema = q(SOURCE, "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END")
    for s in schema:
        q(target, s["sql"].replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1).replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1))
    print("schema:", [s["name"] for s in schema], flush=True)

    print("channels:", copy_simple(target, "indexed_channels", ["channel_id", "source_url", "indexed_at"]), flush=True)
    print("videos:", copy_simple(target, "indexed_videos", ["video_id", "channel_id", "title", "published_at", "thumbnail", "indexed_at"]), flush=True)

    last, done, before, after = 0, 0, 0, 0
    with ThreadPoolExecutor(6) as pool:
        while True:
            rows = q(SOURCE, f"SELECT rowid, {', '.join(T_COLS)} FROM indexed_transcripts WHERE rowid > ? ORDER BY rowid LIMIT 12", [last])
            if not rows:
                break
            last = rows[-1]["rowid"]
            for b, a in pool.map(lambda r: copy_transcript(target, r), rows):
                before += b
                after += a
                done += 1
            if done % 240 < 12:
                print(f"transcripts={done} {before/1e6:.0f}MB -> {after/1e6:.0f}MB", flush=True)
    print(f"transcripts={done} {before/1e6:.0f}MB -> {after/1e6:.0f}MB (done)", flush=True)


if __name__ == "__main__":
    main()
