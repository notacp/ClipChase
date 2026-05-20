"""
Smoke test: fetch transcripts for popular non-en/hi channels, search a known
keyword, confirm we get matches.

Run: .test_venv/bin/python3 scripts/test_langs.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

from api.app.services.youtube import YouTubeService  # noqa: E402

API_KEY = os.environ["YT_API_KEY"]
service = YouTubeService(API_KEY)


CASES = [
    # (label, channel handle/id, keyword expected to appear, default n videos)
    ("French — Wiloo", "UCIJZA6SJ3JjvuOZgYPYOHnA", "france", 8),
    ("French — HugoDecrypte", "@HugoDecrypte", "macron", 8),
    ("Spanish — Luisito Comunica", "@LuisitoComunicaa", "mexico", 8),
    ("Spanish — elrubiusOMG", "@elrubiusOMG", "juego", 8),
    ("Portuguese — Felipe Neto", "@felipeneto", "brasil", 8),
    ("Portuguese — Whindersson", "@whinderssonnunes", "amor", 8),
]


def run_case(label, channel_ref, keyword, n):
    print(f"\n=== {label} | keyword={keyword!r} ===")
    channel_id = service.resolve_channel_id(channel_ref)
    if not channel_id:
        print(f"  ! could not resolve channel {channel_ref!r}")
        return
    playlist_id = service.fetch_uploads_playlist_id(channel_id)
    videos = service.fetch_videos(playlist_id, max_videos=n, exclude_shorts=True)

    fetched, with_segs, with_hits = 0, 0, 0
    languages_seen = {}
    for v in videos:
        vid = v["id"]
        tx = service.get_transcript(vid, preferred_languages=["en", "hi", "fr", "es", "pt"])
        fetched += 1
        if not tx or not tx.get("segments"):
            continue
        with_segs += 1
        lang = tx.get("language_code") or "?"
        languages_seen[lang] = languages_seen.get(lang, 0) + 1
        matches = service.search_in_transcript(
            tx["segments"],
            [keyword],
            transcript_language=lang,
        )
        if matches:
            with_hits += 1

    print(
        f"  videos_scanned={fetched} videos_with_transcript={with_segs} "
        f"videos_with_hits={with_hits} langs={languages_seen}"
    )


if __name__ == "__main__":
    for case in CASES:
        try:
            run_case(*case)
        except Exception as e:
            print(f"  ! ERROR: {e}")
