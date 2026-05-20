"""
Fixture-based integration test for Option B.

Exercises the exact server-side functions that were blocking non-en/hi:
- _normalize_preferred_languages (was filtering fr/es/pt out)
- search_in_transcript with fr/es/pt language codes
- expand_search_terms_for_transcript pass-through for non-hi

If these return matches, the live YouTube path will too once the IP block
lifts. The fetch layer was never broken for those languages — only the
acceptance gate was.
"""
import sys
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.app.services.youtube import (
    YouTubeService,
    SUPPORTED_TRANSCRIPT_LANGUAGES,
    language_label_for_code,
)

service = YouTubeService(api_key="fake-not-used-for-match")


FRENCH_WILOO = [
    {"start": 0.0, "duration": 3.0, "text": "Salut tout le monde et bienvenue"},
    {"start": 3.0, "duration": 3.0, "text": "Aujourd'hui on parle de Zidane et de la France"},
    {"start": 6.0, "duration": 3.0, "text": "Le replay du match était incroyable"},
    {"start": 9.0, "duration": 3.0, "text": "Merci d'avoir regardé"},
]

SPANISH_LUISITO = [
    {"start": 0.0, "duration": 3.0, "text": "Hola qué tal amigos"},
    {"start": 3.0, "duration": 3.0, "text": "Estamos aquí en México disfrutando"},
    {"start": 6.0, "duration": 3.0, "text": "El juego de fútbol fue intenso"},
]

PORTUGUESE_FELIPE = [
    {"start": 0.0, "duration": 3.0, "text": "E aí pessoal beleza"},
    {"start": 3.0, "duration": 3.0, "text": "Hoje vamos falar sobre o Brasil"},
    {"start": 6.0, "duration": 3.0, "text": "O amor verdadeiro está em todos"},
]


CASES = [
    ("French — Wiloo fixture", FRENCH_WILOO, "fr", ["france", "zidane", "replay"]),
    ("Spanish — Luisito fixture", SPANISH_LUISITO, "es", ["mexico", "juego", "futbol"]),
    ("Portuguese — Felipe fixture", PORTUGUESE_FELIPE, "pt", ["brasil", "amor"]),
]


FAILURES: List[str] = []


def assert_eq(label, got, want):
    mark = "PASS" if got == want else "FAIL"
    print(f"  [{mark}] {label}: got={got!r} want={want!r}")
    if got != want:
        FAILURES.append(label)
    return got == want


def main():
    print("=== Tuple membership ===")
    for code in ("en", "hi", "fr", "es", "pt"):
        assert_eq(f"{code} in SUPPORTED_TRANSCRIPT_LANGUAGES", code in SUPPORTED_TRANSCRIPT_LANGUAGES, True)

    print("\n=== language_label_for_code ===")
    assert_eq("fr label", language_label_for_code("fr"), "French")
    assert_eq("es label", language_label_for_code("es"), "Spanish")
    assert_eq("pt label", language_label_for_code("pt"), "Portuguese")

    print("\n=== _normalize_preferred_languages keeps fr/es/pt ===")
    got = service._normalize_preferred_languages(["fr"])
    print(f"  request=['fr'] -> {got}")
    assert_eq("'fr' survives filter", "fr" in got, True)

    print("\n=== Match keyword in non-en/hi transcripts ===")
    for label, segments, lang, keywords in CASES:
        print(f"\n  {label} (lang={lang})")
        for kw in keywords:
            matches = service.search_in_transcript(segments, [kw], transcript_language=lang)
            assert_eq(f"{label!r} keyword={kw!r}", len(matches) > 0, True)

    print("\n=== Verify diacritic / case agnosticism ===")
    diacritic = service.search_in_transcript(
        [{"start": 0, "duration": 2, "text": "C'est la France!"}],
        ["France"],
        transcript_language="fr",
    )
    assert_eq("'France' in 'C'est la France!'", len(diacritic) > 0, True)

    if FAILURES:
        print(f"\n=== FAIL ({len(FAILURES)}) ===")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print("\n=== ALL PASS ===")


if __name__ == "__main__":
    main()
