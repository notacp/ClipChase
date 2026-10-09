#!/usr/bin/env python3
"""One-time migration: compress legacy raw-JSON segments in place.

Oct 2026: the D1 database hit the free plan's 500 MB cap (534 MB, 452 MB of
it raw segment JSON) and every index write started failing. New writes are
now stored as zlib+base64 ("z1:" prefix, ~2.8x smaller); this rewrites the
existing rows the same way.

ORDER MATTERS: deploy the API that reads both formats BEFORE running this.
The old reader can't parse "z1:" rows and would treat them as unreadable,
so indexed videos would silently stop matching.

Each row is verified (decode(encode(x)) == x) before it is written, and the
UPDATE is guarded on the row still being raw, so a concurrent re-index can't
be clobbered. Re-runnable: already-compressed rows are skipped.

    python api/scripts/compress_segments.py --limit 1   # try one row
    python api/scripts/compress_segments.py             # everything
"""
from __future__ import annotations

import argparse
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

URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}"
    f"/d1/database/{os.environ['CF_D1_DATABASE_ID']}/query"
)
HEADERS = {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"}
client = httpx.Client(timeout=60)


def q(sql: str, params: list | None = None) -> list[dict]:
    r = client.post(URL, headers=HEADERS, json={"sql": sql, "params": params or []})
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(body.get("errors"))
    return body["result"][0]["results"]


def convert(row: dict) -> tuple[int, int]:
    raw = row["segments"]
    enc = encode_segments(raw)
    if decode_segments(enc) != json.loads(raw):
        raise RuntimeError(f"round-trip mismatch rowid={row['rowid']}")
    # Guard: only overwrite if the row is still exactly what we read.
    q(
        "UPDATE indexed_transcripts SET segments = ? WHERE rowid = ? AND substr(segments, 1, 3) != ?",
        [enc, row["rowid"], _SEGMENTS_PREFIX],
    )
    return len(raw), len(enc)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="stop after N rows (0 = all)")
    ap.add_argument("--batch", type=int, default=10)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    last, done, before, after = 0, 0, 0, 0
    with ThreadPoolExecutor(args.workers) as pool:
        while True:
            rows = q(
                "SELECT rowid, segments FROM indexed_transcripts WHERE rowid > ? ORDER BY rowid LIMIT ?",
                [last, args.batch],
            )
            if not rows:
                break
            last = rows[-1]["rowid"]
            todo = [r for r in rows if r["segments"] and not r["segments"].startswith(_SEGMENTS_PREFIX) and r["segments"] != "[]"]
            if args.limit:
                todo = todo[: max(0, args.limit - done)]
            for b, a in pool.map(convert, todo):
                before += b
                after += a
                done += 1
            print(f"rowid<={last} converted={done} {before/1e6:.1f}MB -> {after/1e6:.1f}MB", flush=True)
            if args.limit and done >= args.limit:
                break


if __name__ == "__main__":
    main()
