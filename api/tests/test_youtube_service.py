import pytest
from types import SimpleNamespace
from unittest.mock import patch

from api.app.services.youtube import YouTubeService

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
