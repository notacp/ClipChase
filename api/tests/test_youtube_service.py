import pytest
from unittest.mock import MagicMock, patch

from api.app.services import youtube as youtube_module
from api.app.services.youtube import (
    YouTubeService,
    _romanized_forms_similar,
    _cross_script_phonetic_match,
    _phonetic_key,
    _collapse_long_vowels,
    _drop_trailing_schwa,
)
from api.app.services.transcript_index import _build_search_text

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


def test_search_in_transcript_matches_compound_word_split_in_transcript():
    service = YouTubeService(api_key="fake-key")
    transcript = [{"start": 0, "duration": 2, "text": "we use post hog for analytics"}]

    matches = service.search_in_transcript(transcript, ["PostHog"], transcript_language="en")

    assert len(matches) == 1
    assert matches[0]["text"] == "we use post hog for analytics"


def test_search_in_transcript_rejects_partial_compound_match():
    service = YouTubeService(api_key="fake-key")
    transcript = [{"start": 0, "duration": 2, "text": "thank you tuber for watching"}]

    matches = service.search_in_transcript(transcript, ["youtube"], transcript_language="en")

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


def test_romanized_forms_similar_rejects_lekin_for_lemon():
    # लेकिन ("but") romanizes to "lekina", prefix "lekin" — edit distance 2 from "lemon"
    # Short-word threshold (≤6 chars) allows max 1 edit, so this must be rejected.
    assert _romanized_forms_similar("lemon", "lekina") is False


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


# ---------------------------------------------------------------------------
# Phonetic key helpers — collapse long vowels + drop trailing schwa
# ---------------------------------------------------------------------------

def test_collapse_long_vowels_collapses_doubled_vowels():
    assert _collapse_long_vowels("staartaapa") == "startapa"
    assert _collapse_long_vowels("seee") == "se"
    assert _collapse_long_vowels("loop") == "lop"


def test_collapse_long_vowels_leaves_single_vowels_alone():
    assert _collapse_long_vowels("startup") == "startup"
    assert _collapse_long_vowels("hello") == "hello"


def test_drop_trailing_schwa_drops_after_stop_consonants():
    assert _drop_trailing_schwa("startapa") == "startap"
    assert _drop_trailing_schwa("nama") == "nam"


def test_drop_trailing_schwa_does_not_drop_after_y():
    # Hindi -ya endings (kiya, maya, gaya) keep their final a.
    assert _drop_trailing_schwa("kiya") == "kiya"
    assert _drop_trailing_schwa("maya") == "maya"
    assert _drop_trailing_schwa("gaya") == "gaya"


def test_drop_trailing_schwa_only_acts_on_word_end():
    assert _drop_trailing_schwa("namaste") == "namaste"
    assert _drop_trailing_schwa("kar") == "kar"


def test_phonetic_key_brings_loanword_and_devanagari_closer():
    en = _phonetic_key("startup")
    hi = _phonetic_key("स्टार्टअप")
    # They are not literally equal, but close enough for fuzzy match.
    assert _romanized_forms_similar(en, hi) or _romanized_forms_similar(hi, en)


def test_phonetic_key_namaste_round_trip():
    assert _phonetic_key("namaste") == _phonetic_key("नमस्ते")


# ---------------------------------------------------------------------------
# Sliding-window phrase matching
# ---------------------------------------------------------------------------

def test_phrase_match_within_single_segment():
    service = YouTubeService(api_key="fake-key")
    transcript = [
        {"start": 0.0, "duration": 1.0, "text": "machine learning is fun"},
    ]
    matches = service.search_in_transcript(transcript, ["machine learning"], "en")
    assert len(matches) == 1
    assert matches[0]["start"] == 0.0


def test_phrase_match_across_two_segments_anchors_at_phrase_head():
    service = YouTubeService(api_key="fake-key")
    transcript = [
        {"start": 0.0, "duration": 1.0, "text": "this is a"},
        {"start": 1.0, "duration": 1.0, "text": "machine"},
        {"start": 2.0, "duration": 1.0, "text": "learning"},
        {"start": 3.0, "duration": 1.0, "text": "tutorial"},
    ]
    matches = service.search_in_transcript(transcript, ["machine learning"], "en")
    assert len(matches) == 1
    # End-of-run anchor: timestamp lands on the segment containing the start
    # of the phrase, not on the leading filler.
    assert matches[0]["start"] == 1.0
    assert matches[0]["text"] == "machine"


def test_phrase_match_absent_returns_no_results():
    service = YouTubeService(api_key="fake-key")
    transcript = [
        {"start": 0.0, "duration": 1.0, "text": "machine"},
        {"start": 1.0, "duration": 1.0, "text": "is awesome"},
    ]
    matches = service.search_in_transcript(transcript, ["machine learning"], "en")
    assert matches == []


def test_single_and_phrase_keywords_emit_distinct_anchors():
    service = YouTubeService(api_key="fake-key")
    transcript = [
        {"start": 0.0, "duration": 1.0, "text": "cursor rocks"},
        {"start": 1.0, "duration": 1.0, "text": "and machine"},
        {"start": 2.0, "duration": 1.0, "text": "learning is great"},
    ]
    matches = service.search_in_transcript(
        transcript, ["cursor", "machine learning"], "en"
    )
    starts = sorted(m["start"] for m in matches)
    assert starts == [0.0, 1.0]


def test_phrase_match_does_not_duplicate_for_overlapping_windows():
    service = YouTubeService(api_key="fake-key")
    # "machine learning" appears once but window [0..2] and [1..2] both contain it.
    transcript = [
        {"start": 0.0, "duration": 1.0, "text": "intro"},
        {"start": 1.0, "duration": 1.0, "text": "machine learning"},
        {"start": 2.0, "duration": 1.0, "text": "outro"},
    ]
    matches = service.search_in_transcript(transcript, ["machine learning"], "en")
    assert len(matches) == 1
    assert matches[0]["start"] == 1.0


# ---------------------------------------------------------------------------
# _build_search_text — index-side script bridging
# ---------------------------------------------------------------------------

def test_build_search_text_emits_phonetic_key_for_latin_loanword():
    text = _build_search_text("we built a startup")
    # Original normalized text included plus its phonetic key.
    assert "startup" in text


def test_build_search_text_emits_romanized_and_key_for_devanagari():
    text = _build_search_text("मेरा स्टार्टअप बड़ा है")
    # Romanized form ("staartaapa") and phonetic key ("startap") are both present.
    assert "staartaapa" in text
    assert "startap" in text


def test_build_search_text_returns_normalized_when_no_additions():
    text = _build_search_text("the quick brown fox")
    # All-Latin tokens with no doubled vowels and no trailing schwa: keys equal
    # original tokens, so additions just duplicate them — that's acceptable.
    assert text.startswith("the quick brown fox")


# ---------------------------------------------------------------------------
# resolve_channel_id — handle / URL / username / canonical-ID resolution
# ---------------------------------------------------------------------------

@pytest.fixture
def resolver_service():
    """YouTubeService with a fully mocked self.youtube client.

    Builds a fake googleapiclient resource so each strategy can be inspected
    independently (forHandle vs forUsername vs search.list).
    """
    youtube_module._RESOLVE_NAME_CACHE.clear()
    with patch.object(youtube_module, "build"):
        service = YouTubeService(api_key="fake-key")

    channels_resource = MagicMock()
    search_resource = MagicMock()
    service.youtube = MagicMock()
    service.youtube.channels.return_value = channels_resource
    service.youtube.search.return_value = search_resource

    return service, channels_resource, search_resource


def _channels_list_mock(channels_resource, items, *, raises: Exception | None = None):
    """Configure the next .list() call on channels() to return `items` (or raise)."""
    call = MagicMock()
    if raises is not None:
        call.execute.side_effect = raises
    else:
        call.execute.return_value = {"items": items}
    channels_resource.list.return_value = call
    return call


def _search_list_mock(search_resource, items, *, raises: Exception | None = None):
    call = MagicMock()
    if raises is not None:
        call.execute.side_effect = raises
    else:
        call.execute.return_value = {"items": items}
    search_resource.list.return_value = call
    return call


def test_resolve_channel_id_short_circuits_canonical_uc_id(resolver_service):
    service, channels_resource, search_resource = resolver_service

    result = service.resolve_channel_id("UC1234567890123456789012")

    assert result == "UC1234567890123456789012"
    # Canonical IDs must never trigger any API call.
    channels_resource.list.assert_not_called()
    search_resource.list.assert_not_called()


def test_resolve_channel_id_uses_for_handle_for_at_prefixed_input(resolver_service):
    service, channels_resource, _ = resolver_service
    _channels_list_mock(channels_resource, [{"id": "UCabcdefghijklmnopqrstuv"}])

    result = service.resolve_channel_id("@itz_fizy")

    assert result == "UCabcdefghijklmnopqrstuv"
    channels_resource.list.assert_called_once_with(part="id", forHandle="@itz_fizy")


def test_resolve_channel_id_strips_url_then_uses_for_handle(resolver_service):
    service, channels_resource, _ = resolver_service
    _channels_list_mock(channels_resource, [{"id": "UCxxxxxxxxxxxxxxxxxxxxxx"}])

    result = service.resolve_channel_id("https://www.youtube.com/@LolcowLive")

    assert result == "UCxxxxxxxxxxxxxxxxxxxxxx"
    channels_resource.list.assert_called_once_with(part="id", forHandle="@LolcowLive")


def test_resolve_channel_id_bare_name_prepends_at_for_handle_lookup(resolver_service):
    service, channels_resource, _ = resolver_service
    _channels_list_mock(channels_resource, [{"id": "UCyyyyyyyyyyyyyyyyyyyyyy"}])

    result = service.resolve_channel_id("veritasium")

    assert result == "UCyyyyyyyyyyyyyyyyyyyyyy"
    # Bare names get an "@" prepended for the forHandle attempt.
    channels_resource.list.assert_called_once_with(part="id", forHandle="@veritasium")


def test_resolve_channel_id_falls_back_to_for_username_when_handle_misses(resolver_service):
    service, channels_resource, _ = resolver_service

    # First call (forHandle) returns nothing; second call (forUsername) hits.
    handle_call = MagicMock()
    handle_call.execute.return_value = {"items": []}
    username_call = MagicMock()
    username_call.execute.return_value = {"items": [{"id": "UCzzzzzzzzzzzzzzzzzzzzzz"}]}
    channels_resource.list.side_effect = [handle_call, username_call]

    result = service.resolve_channel_id("LegacyVanityName")

    assert result == "UCzzzzzzzzzzzzzzzzzzzzzz"
    kwargs_seen = [c.kwargs for c in channels_resource.list.call_args_list]
    assert kwargs_seen == [
        {"part": "id", "forHandle": "@LegacyVanityName"},
        {"part": "id", "forUsername": "LegacyVanityName"},
    ]


def test_resolve_channel_id_falls_through_to_search_when_handle_and_username_miss(resolver_service):
    service, channels_resource, search_resource = resolver_service

    miss = MagicMock()
    miss.execute.return_value = {"items": []}
    channels_resource.list.return_value = miss
    _search_list_mock(
        search_resource,
        [{"snippet": {"channelId": "UCsearchhitsearchhitsea"}}],
    )

    result = service.resolve_channel_id("lolcowlive")

    assert result == "UCsearchhitsearchhitsea"
    # Both channels.list strategies attempted before search fallback.
    assert channels_resource.list.call_count == 2
    search_resource.list.assert_called_once_with(
        part="snippet", q="lolcowlive", type="channel", maxResults=1,
    )


def test_resolve_channel_id_returns_none_when_all_strategies_fail(resolver_service):
    service, channels_resource, search_resource = resolver_service
    miss = MagicMock()
    miss.execute.return_value = {"items": []}
    channels_resource.list.return_value = miss
    _search_list_mock(search_resource, [])

    result = service.resolve_channel_id("totally-nonexistent-channel-xyz")

    assert result is None


def test_resolve_channel_id_swallows_api_exceptions_and_continues(resolver_service):
    service, channels_resource, search_resource = resolver_service

    # forHandle raises (e.g. transient YT API error); forUsername succeeds.
    handle_call = MagicMock()
    handle_call.execute.side_effect = RuntimeError("quota exceeded")
    username_call = MagicMock()
    username_call.execute.return_value = {"items": [{"id": "UCrecoveryrecoveryrec123"}]}
    channels_resource.list.side_effect = [handle_call, username_call]

    result = service.resolve_channel_id("@recoverable")

    assert result == "UCrecoveryrecoveryrec123"
    search_resource.list.assert_not_called()


def test_resolve_channel_id_caches_resolved_handle(resolver_service):
    service, channels_resource, _ = resolver_service
    _channels_list_mock(channels_resource, [{"id": "UCcachedcachedcachedcach"}])

    first = service.resolve_channel_id("@cached_handle")
    second = service.resolve_channel_id("@cached_handle")

    assert first == "UCcachedcachedcachedcach"
    assert first == second
    # Cache hit on second call — no additional API request.
    assert channels_resource.list.call_count == 1


def test_resolve_channel_id_strips_channel_id_url_without_api_call(resolver_service):
    service, channels_resource, search_resource = resolver_service

    result = service.resolve_channel_id(
        "https://www.youtube.com/channel/UC1234567890123456789012"
    )

    assert result == "UC1234567890123456789012"
    channels_resource.list.assert_not_called()
    search_resource.list.assert_not_called()
