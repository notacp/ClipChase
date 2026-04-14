import pytest
from types import SimpleNamespace
from unittest.mock import patch

from api.app.services.youtube import (
    YouTubeService,
    _romanized_forms_similar,
    _cross_script_phonetic_match,
)

ENGLISH_TRANSCRIPT = [
    {"start": 1.0, "duration": 2.5, "text": "Welcome to the video"},
    {"start": 4.0, "duration": 1.5, "text": "Today we will discuss python"},
    {"start": 6.0, "duration": 3.0, "text": "Python is a great programming language"},
    {"start": 10.0, "duration": 2.0, "text": "Thanks for watching"},
]

HINDI_TRANSCRIPT = [
    {"start": 1.0, "duration": 2.0, "text": "यह हिंदी का परिचय है"},
    {"start": 4.0, "duration": 2.0, "text": "मुझे पानी चाहिए"},
    {"start": 8.0, "duration": 2.0, "text": "फिर मिलते हैं"},
]

MIXED_HINDI_TRANSCRIPT = [
    {"start": 1.0, "duration": 2.0, "text": "हम एक स्टार्टअप बना रहे हैं"},
]

INVEST_HINDI_TRANSCRIPT = [
    {"start": 1.0, "duration": 2.0, "text": "हमने क्लाइंट्स को इन्वेस्ट नहीं किया"},
]


def test_search_in_transcript_finds_single_english_match():
    service = YouTubeService(api_key="fake-key")
    matches = service.search_in_transcript(ENGLISH_TRANSCRIPT, ["welcome"], transcript_language="en")

    assert len(matches) == 1
    assert matches[0]["start"] == 1.0
    assert matches[0]["text"] == "Welcome to the video"
    assert matches[0]["context_before"] == ""
    assert matches[0]["context_after"] == "Today we will discuss python"


def test_search_in_transcript_finds_multiple_english_matches_case_insensitively():
    service = YouTubeService(api_key="fake-key")
    matches = service.search_in_transcript(ENGLISH_TRANSCRIPT, ["PYTHON"], transcript_language="en")

    assert len(matches) == 2
    assert matches[0]["text"] == "Today we will discuss python"
    assert matches[0]["context_before"] == "Welcome to the video"
    assert matches[0]["context_after"] == "Python is a great programming language"


def test_search_in_transcript_avoids_false_positive_for_latin_words():
    service = YouTubeService(api_key="fake-key")
    transcript = [{"start": 0, "duration": 1, "text": "That sounds incredible"}]

    matches = service.search_in_transcript(transcript, ["CRED"], transcript_language="en")

    assert matches == []


def test_search_in_transcript_matches_hindi_words_with_combining_marks():
    service = YouTubeService(api_key="fake-key")

    matches = service.search_in_transcript(HINDI_TRANSCRIPT, ["हिंदी", "पानी"], transcript_language="hi")

    assert len(matches) == 2
    assert matches[0]["text"] == "यह हिंदी का परिचय है"
    assert matches[1]["text"] == "मुझे पानी चाहिए"


def test_search_in_transcript_matches_english_query_against_devanagari_caption():
    service = YouTubeService(api_key="fake-key")

    matches = service.search_in_transcript(MIXED_HINDI_TRANSCRIPT, ["startup"], transcript_language="hi")

    assert len(matches) == 1
    assert matches[0]["text"] == "हम एक स्टार्टअप बना रहे हैं"


def test_search_in_transcript_matches_invest_against_hindi_caption():
    service = YouTubeService(api_key="fake-key")

    matches = service.search_in_transcript(INVEST_HINDI_TRANSCRIPT, ["Invest"], transcript_language="hi")

    assert len(matches) == 1
    assert matches[0]["text"] == "हमने क्लाइंट्स को इन्वेस्ट नहीं किया"


def test_expand_search_terms_for_transcript_adds_hindi_candidate_for_invest():
    service = YouTubeService(api_key="fake-key")

    expanded = service.expand_search_terms_for_transcript(["Invest"], INVEST_HINDI_TRANSCRIPT, transcript_language="hi")

    assert expanded == ["Invest", "इन्वेस्ट"]


def test_expand_search_terms_for_transcript_adds_hindi_candidate_for_finology():
    service = YouTubeService(api_key="fake-key")
    transcript = [{"start": 0, "duration": 2, "text": "तो फिनोलॉजी 30 में आपका पोर्टफोलियो बने"}]

    expanded = service.expand_search_terms_for_transcript(["Finology"], transcript, transcript_language="hi")

    assert expanded == ["Finology", "फिनोलॉजी"]


def test_search_in_transcript_matches_devanagari_query_against_english_caption():
    service = YouTubeService(api_key="fake-key")
    transcript = [{"start": 0, "duration": 2, "text": "We are building a startup"}]

    matches = service.search_in_transcript(transcript, ["स्टार्टअप"], transcript_language="en")

    assert len(matches) == 1
    assert matches[0]["text"] == "We are building a startup"


def test_select_local_transcript_prefers_query_language_then_manual_track():
    service = YouTubeService(api_key="fake-key")
    transcripts = [
        SimpleNamespace(language_code="hi", is_generated=True),
        SimpleNamespace(language_code="en", is_generated=False),
        SimpleNamespace(language_code="hi", is_generated=False),
    ]

    selected = service._select_local_transcript(transcripts, ["hi", "en"])

    assert selected.language_code == "hi"
    assert selected.is_generated is False


def test_proxy_wiring():
    service = YouTubeService(api_key="fake", proxy_url="http://mock-proxy:8080")
    session = service._get_http_client()

    assert session.proxies["http"] == "http://mock-proxy:8080"
    assert session.proxies["https"] == "http://mock-proxy:8080"
    assert "User-Agent" in session.headers


def test_block_detection_logic():
    service = YouTubeService(api_key="fake")

    with patch.object(service, "_list_transcripts", side_effect=Exception("YouTube is blocking requests from your IP...")):
        with pytest.raises(Exception):
            service.get_transcript("fake-video-id", preferred_languages=["en", "hi"])

        assert service.block_detected is True


# ---------------------------------------------------------------------------
# _romanized_forms_similar unit tests
# All romanized values below are the real output of _romanize_devanagari():
#   मेडिटेट  -> "mediteta"
#   मेडिटेशन -> "mediteshana"
#   माइंडसेट -> "maaindaseta"
#   मेंटालिटी -> "mentaalitii"
#   मोस्टेंट  -> "mostenta"
# ---------------------------------------------------------------------------

def test_romanized_forms_similar_matches_direct_borrowing():
    # "mediteta" is मेडिटेट — a direct phonetic copy of "meditate"
    assert _romanized_forms_similar("meditate", "mediteta") is True


def test_romanized_forms_similar_matches_suffixed_borrowing():
    # "mediteshana" is मेडिटेशन — "-tion" becomes "-shana" suffix
    assert _romanized_forms_similar("meditate", "mediteshana") is True


def test_romanized_forms_similar_rejects_short_token():
    # len("med")=3 < max(4, int(8*0.9)=7) → rejected by the length guard
    assert _romanized_forms_similar("meditate", "med") is False


def test_romanized_forms_similar_rejects_milate_for_meditate():
    # "milate" (_romanize_devanagari("मिलते") = "meet/see") — 6 chars < min 7
    # edit_dist=3 would match at 0.45 threshold, but length guard rejects it first
    assert _romanized_forms_similar("meditate", "milate") is False


def test_romanized_forms_similar_rejects_first_char_mismatch():
    assert _romanized_forms_similar("meditate", "think") is False


def test_romanized_forms_similar_rejects_semantically_related_but_phonetically_different():
    assert _romanized_forms_similar("meditate", "maaindaseta") is False   # माइंडसेट
    assert _romanized_forms_similar("meditate", "mentaalitii") is False   # मेंटालिटी
    assert _romanized_forms_similar("meditate", "mostenta") is False      # मोस्टेंट


# ---------------------------------------------------------------------------
# expand_search_terms_for_transcript — false positive regression tests
# ---------------------------------------------------------------------------

MEDITATE_HINDI_TRANSCRIPT = [
    {"start": 0.0, "duration": 3.0, "text": "माइंडसेट और मेंटालिटी बहुत जरूरी है"},
    {"start": 3.0, "duration": 2.0, "text": "मोस्टेंट से सीखें"},
    {"start": 5.0, "duration": 2.0, "text": "फिर मिलते हैं"},
]


def test_expand_does_not_add_mindset_or_mentality_for_meditate():
    # Current buggy code adds माइंडसेट/मेंटालिटी because skeleton "mndst"/"mntlt"
    # is within edit distance 2 of "mdtt". This test must fail before the fix.
    service = YouTubeService(api_key="fake-key")
    expanded = service.expand_search_terms_for_transcript(
        ["meditate"], MEDITATE_HINDI_TRANSCRIPT, transcript_language="hi"
    )
    assert expanded == ["meditate"]


def test_expand_adds_direct_devanagari_borrowing_for_meditate():
    # "मेडिटेट" romanizes to "mediteta" — distance 2 from "meditate" → should be added
    service = YouTubeService(api_key="fake-key")
    transcript = [{"start": 0, "duration": 2, "text": "रोज मेडिटेट करो"}]
    expanded = service.expand_search_terms_for_transcript(
        ["meditate"], transcript, transcript_language="hi"
    )
    assert "मेडिटेट" in expanded


# ---------------------------------------------------------------------------
# _cross_script_phonetic_match — behaviour tests (regression + correctness)
# These are written before the refactor so they pin what must stay true.
# ---------------------------------------------------------------------------

def test_cross_script_match_latin_keyword_matches_devanagari_borrowing():
    # "मेडिटेट" is a phonetic copy of "meditate" — must match
    assert _cross_script_phonetic_match("रोज मेडिटेट करो", "meditate") is True


def test_cross_script_match_latin_keyword_rejects_unrelated_devanagari():
    # "माइंडसेट" (mindset) shares no phonetic similarity with "meditate"
    assert _cross_script_phonetic_match("माइंडसेट जरूरी है", "meditate") is False


def test_cross_script_match_devanagari_keyword_matches_latin_text():
    # Reverse direction: Hindi keyword "स्टार्टअप" vs English caption
    assert _cross_script_phonetic_match("We are building a startup", "स्टार्टअप") is True
