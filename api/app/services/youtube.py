import html
import re
import unicodedata
from typing import Any, Dict, List, Optional

from googleapiclient.discovery import build
from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled, YouTubeTranscriptApi

YOUTUBE_API_SERVICE_NAME = "youtube"
YOUTUBE_API_VERSION = "v3"
SUPPORTED_TRANSCRIPT_LANGUAGES = ("en", "hi")
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
DEVANAGARI_TOKEN_RE = re.compile(r"[\u0900-\u097F]+")
LATIN_WORD_RE = re.compile(r"[A-Za-z0-9]")
LATIN_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")
MIXED_TOKEN_RE = re.compile(r"[A-Za-z0-9]+|[\u0900-\u097F]+")
DEVANAGARI_VIRAMA = "्"

DEVANAGARI_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "f", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "ळ": "l", "क़": "k", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f",
}

DEVANAGARI_INDEPENDENT_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
}

DEVANAGARI_MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
}


def normalize_language_code(language_code: Optional[str]) -> str:
    code = (language_code or "").strip().lower()
    if not code:
        return ""
    return code.split("-", 1)[0]


def language_label_for_code(language_code: str, fallback: Optional[str] = None) -> str:
    labels = {
        "en": "English",
        "hi": "Hindi",
    }
    return labels.get(language_code, fallback or language_code.upper() or "Unknown")


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", html.unescape(text or ""))
    normalized = normalized.replace("\u200c", "").replace("\u200d", "")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _is_devanagari_text(text: str) -> bool:
    return bool(DEVANAGARI_RE.search(text or ""))


def _contains_latin_text(text: str) -> bool:
    return bool(LATIN_WORD_RE.search(text or ""))


def _romanize_devanagari(text: str) -> str:
    normalized = _normalize_text(text)
    output: List[str] = []
    i = 0

    while i < len(normalized):
        char = normalized[i]

        if char in DEVANAGARI_INDEPENDENT_VOWELS:
            output.append(DEVANAGARI_INDEPENDENT_VOWELS[char])
            i += 1
            continue

        if char in DEVANAGARI_CONSONANTS:
            base = DEVANAGARI_CONSONANTS[char]
            next_char = normalized[i + 1] if i + 1 < len(normalized) else ""

            if next_char in DEVANAGARI_MATRAS:
                output.append(base + DEVANAGARI_MATRAS[next_char])
                i += 2
                continue

            if next_char == DEVANAGARI_VIRAMA:
                output.append(base)
                i += 2
                continue

            output.append(base + "a")
            i += 1
            continue

        if char == "ं" or char == "ँ":
            output.append("n")
        elif char == "ः":
            output.append("h")
        else:
            output.append(char)
        i += 1

    return "".join(output)


def _cross_script_phonetic_match(text: str, keyword: str) -> bool:
    text_has_devanagari    = _is_devanagari_text(text)
    keyword_has_latin      = _contains_latin_text(keyword)
    text_has_latin         = _contains_latin_text(text)
    keyword_has_devanagari = _is_devanagari_text(keyword)

    if keyword_has_latin and text_has_devanagari:
        for token in DEVANAGARI_TOKEN_RE.findall(_normalize_text(text)):
            if _romanized_forms_similar(keyword, _romanize_devanagari(token)):
                return True
        return False

    if keyword_has_devanagari and text_has_latin:
        romanized_kw = _romanize_devanagari(keyword)
        for token in LATIN_TOKEN_RE.findall(_normalize_text(text)):
            # Args swapped: token is the "keyword", romanized_kw is the "token".
            # Devanagari romanizations are longer than their Latin originals, so
            # the min-length guard (len(tok) >= 0.9*len(kw)) must see the longer
            # form as tok and the shorter Latin word as kw.
            if _romanized_forms_similar(token, romanized_kw):
                return True
        return False

    return False


def human_script_variants(keyword: str) -> List[str]:
    normalized = _normalize_text(keyword)
    variants = [normalized] if normalized else []

    if _is_devanagari_text(normalized):
        romanized = _romanize_devanagari(normalized)
        if romanized:
            variants.append(romanized)

    deduped: List[str] = []
    seen = set()
    for variant in variants:
        key = variant.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(variant)
    return deduped


def _dedupe_terms(terms: List[str]) -> List[str]:
    deduped: List[str] = []
    seen = set()
    for term in terms:
        normalized = _normalize_text(term)
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def _limited_edit_distance(left: str, right: str, max_distance: int) -> Optional[int]:
    if abs(len(left) - len(right)) > max_distance:
        return None

    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        row_min = current[0]
        for j, right_char in enumerate(right, start=1):
            insert_cost = current[j - 1] + 1
            delete_cost = previous[j] + 1
            replace_cost = previous[j - 1] + (left_char != right_char)
            value = min(insert_cost, delete_cost, replace_cost)
            current.append(value)
            row_min = min(row_min, value)
        if row_min > max_distance:
            return None
        previous = current

    distance = previous[-1]
    return distance if distance <= max_distance else None


def _romanized_forms_similar(latin_keyword: str, romanized_token: str, threshold: float = 0.45) -> bool:
    """
    True if romanized_token is a plausible phonetic borrowing of latin_keyword.

    Uses prefix-anchored comparison: the token may carry a suffix not in the
    keyword (e.g. Hindi "-shana" for the English "-tion" ending), so we compare
    the keyword against the first len(keyword) characters of the token.

    Guards:
    - First chars must match (quick reject).
    - Token must be at least max(4, 0.9 * len(keyword)) chars to prevent short
      tokens from passing via prefix truncation alone (e.g. rejects "milate" for
      "meditate": 6 < max(4,7)).
    - Normalized edit distance (edit_dist / len(keyword)) must be <= threshold.
      Note: max_dist uses int() truncation, so the effective ratio is at most
      `threshold` but may be slightly lower for short keywords.

    Threshold 0.45 for keywords >6 chars: for "startup" (len 7), allows int(7*0.45)=3
    edits, accepting "startup"→"staartaapa" (distance 3). For keywords ≤6 chars the
    threshold drops to 0.25 (max 1 edit), preventing short native Hindi words from
    false-matching short English keywords (e.g. "lekina" must not match "lemon").
    """
    if not latin_keyword or not romanized_token:
        return False

    kw = latin_keyword.casefold()
    tok = romanized_token.casefold()

    if kw[0] != tok[0]:
        return False

    if len(tok) < max(4, int(len(kw) * 0.9)):
        return False

    cmp_len = len(kw)
    tok_prefix = tok[:cmp_len]
    effective_threshold = threshold if cmp_len > 6 else min(threshold, 0.25)
    max_dist = max(1, int(cmp_len * effective_threshold))

    return _limited_edit_distance(kw, tok_prefix, max_dist) is not None


def _extract_devanagari_tokens(transcript: List[Dict[str, Any]]) -> List[str]:
    tokens: List[str] = []
    seen = set()

    for segment in transcript:
        for token in DEVANAGARI_TOKEN_RE.findall(_normalize_text(segment.get("text", ""))):
            if len(token) < 3:
                continue
            if token in seen:
                continue
            seen.add(token)
            tokens.append(token)

    return tokens


def _keyword_matches(text: str, keyword: str, language_code: str) -> bool:
    normalized_text = _normalize_text(text)
    normalized_keyword = _normalize_text(keyword)
    if not normalized_text or not normalized_keyword:
        return False

    if (language_code == "hi" or _is_devanagari_text(normalized_keyword)) and normalized_keyword in normalized_text:
        return True

    if LATIN_WORD_RE.search(normalized_keyword):
        escaped = re.escape(normalized_keyword.casefold())
        lowered_text = normalized_text.casefold()
        if bool(re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", lowered_text)):
            return True

    if _cross_script_phonetic_match(normalized_text, normalized_keyword):
        return True

    if normalized_keyword.casefold() in normalized_text.casefold():
        return True

    # Compound-word fallback: "PostHog" matches "post hog" in transcripts
    if len(normalized_keyword) >= 5:
        kw_lower = normalized_keyword.casefold()
        words = normalized_text.casefold().split()
        for i in range(len(words)):
            for window in range(2, 4):
                if i + window > len(words):
                    break
                if "".join(words[i : i + window]) == kw_lower:
                    return True

    return False


def _segment_to_raw_data(segments: Any) -> List[Dict[str, Any]]:
    if hasattr(segments, "to_raw_data"):
        return segments.to_raw_data()
    if isinstance(segments, list):
        return segments
    return list(segments)


class YouTubeService:
    def __init__(self, api_key: str, proxy_url: Optional[str] = None, worker_url: Optional[str] = None):
        self.api_key = api_key
        self.proxy_url = proxy_url.strip() if proxy_url and proxy_url.strip() else None
        self.worker_url = worker_url.rstrip("/") if worker_url and worker_url.strip() else None
        self.youtube = build(YOUTUBE_API_SERVICE_NAME, YOUTUBE_API_VERSION, developerKey=api_key)
        self.block_detected = False
        self.proxy_error_detected = False
        self.worker_failures = 0

    def _get_http_client(self) -> Any:
        import random
        import requests

        session = requests.Session()
        session.trust_env = False

        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        ]
        session.headers.update({
            "User-Agent": random.choice(user_agents),
            "Accept-Language": "en-US,en;q=0.9",
        })

        if self.proxy_url:
            print("DEBUG: Configuring HTTP Client with Proxy")
            session.proxies = {
                "http": self.proxy_url,
                "https": self.proxy_url,
            }

        return session

    def resolve_channel_id(self, channel_url_or_id: str) -> Optional[str]:
        if not channel_url_or_id:
            return None

        if re.match(r"^UC[a-zA-Z0-9_-]{22}$", channel_url_or_id):
            return channel_url_or_id

        match = re.search(r"youtube\.com/channel/(UC[a-zA-Z0-9_-]{22})", channel_url_or_id)
        if match:
            return match.group(1)

        match = re.search(r"(?:youtube\.com/)?@([a-zA-Z0-9_.-]+)", channel_url_or_id)
        if match:
            return self._resolve_name_to_channel_id(match.group(1))

        match = re.search(r"youtube\.com/(?:c|user)/([a-zA-Z0-9_.-]+)", channel_url_or_id)
        if match:
            return self._resolve_name_to_channel_id(match.group(1))

        return self._resolve_name_to_channel_id(channel_url_or_id)

    def _resolve_name_to_channel_id(self, name_or_handle: str) -> Optional[str]:
        try:
            print(f"DEBUG: Resolving '{name_or_handle}' to Channel ID via search...")
            search_response = self.youtube.search().list(
                part="snippet",
                q=name_or_handle,
                type="channel",
                maxResults=1,
            ).execute()

            if search_response.get("items"):
                channel_id = search_response["items"][0]["snippet"]["channelId"]
                print(f"DEBUG: Resolved to {channel_id}")
                return channel_id
            print(f"DEBUG: No channel found for '{name_or_handle}'")
            return None
        except Exception as e:
            print(f"DEBUG: Error resolving channel name: {str(e)}")
            return None

    def fetch_uploads_playlist_id(self, channel_id: str) -> str:
        response = self.youtube.channels().list(
            part="contentDetails",
            id=channel_id,
        ).execute()

        if not response.get("items"):
            raise ValueError(f"No channel found with ID: {channel_id}")

        return response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    def fetch_videos(self, playlist_id: str, max_videos: int = 50, exclude_shorts: bool = False) -> List[Dict[str, Any]]:
        videos = []
        next_page_token = None

        while len(videos) < max_videos:
            response = self.youtube.playlistItems().list(
                part="contentDetails,snippet",
                playlistId=playlist_id,
                maxResults=min(50, max_videos - len(videos)),
                pageToken=next_page_token,
            ).execute()

            for item in response.get("items", []):
                snippet = item.get("snippet", {})
                content_details = item.get("contentDetails", {})
                videos.append({
                    "id": content_details.get("videoId"),
                    "title": snippet.get("title"),
                    "publishedAt": snippet.get("publishedAt"),
                    "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url"),
                })

            next_page_token = response.get("nextPageToken")
            if not next_page_token:
                break

        if exclude_shorts and videos:
            videos = self._filter_out_shorts(videos)

        return videos

    def _filter_out_shorts(self, videos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        video_ids = [v["id"] for v in videos if v["id"]]

        durations = {}
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i:i + 50]
            response = self.youtube.videos().list(
                part="contentDetails",
                id=",".join(batch),
            ).execute()
            for item in response.get("items", []):
                duration_str = item.get("contentDetails", {}).get("duration", "PT0S")
                total_seconds = 0
                for value, unit in re.findall(r"(\d+)([HMSD])", duration_str):
                    if unit == "H":
                        total_seconds += int(value) * 3600
                    elif unit == "M":
                        total_seconds += int(value) * 60
                    elif unit == "S":
                        total_seconds += int(value)
                durations[item["id"]] = total_seconds

        filtered = [v for v in videos if durations.get(v["id"], 61) > 60]
        print(f"DEBUG: Filtered out {len(videos) - len(filtered)} Shorts (≤60s) from {len(videos)} videos")
        return filtered

    def get_transcript(self, video_id: str, preferred_languages: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        languages = self._normalize_preferred_languages(preferred_languages)
        if self.worker_url:
            return self._get_transcript_from_worker(video_id, languages)
        return self._get_transcript_from_api(video_id, languages)

    def _normalize_preferred_languages(self, preferred_languages: Optional[List[str]]) -> List[str]:
        languages = [normalize_language_code(code) for code in (preferred_languages or [])]
        languages = [code for code in languages if code in SUPPORTED_TRANSCRIPT_LANGUAGES]
        for code in SUPPORTED_TRANSCRIPT_LANGUAGES:
            if code not in languages:
                languages.append(code)
        return languages

    def _get_transcript_from_worker(self, video_id: str, preferred_languages: List[str]) -> Optional[Dict[str, Any]]:
        import requests as req

        url = f"{self.worker_url}/transcript"
        try:
            print(f"DEBUG: Fetching transcript via Worker for {video_id} ({preferred_languages})")
            response = req.get(
                url,
                params={"video_id": video_id, "preferred_langs": ",".join(preferred_languages)},
                timeout=30,
            )
            if response.status_code == 200:
                return response.json()
            if response.status_code == 404:
                return None
            error = response.json().get("error", f"Worker returned {response.status_code}")
            print(f"DEBUG ERROR: Worker error for {video_id}: {error}")
            raise Exception(error)
        except Exception as e:
            self.worker_failures += 1
            print(f"DEBUG ERROR: Worker request failed for {video_id}: {e}")
            raise

    def _get_transcript_from_api(self, video_id: str, preferred_languages: List[str]) -> Optional[Dict[str, Any]]:
        try:
            http_client = self._get_http_client()
            ytt_api = YouTubeTranscriptApi(http_client=http_client)
            transcript_list = self._list_transcripts(ytt_api, video_id)
            transcript = self._select_local_transcript(transcript_list, preferred_languages)
            if not transcript:
                return None

            segments = _segment_to_raw_data(transcript.fetch())
            language_code = normalize_language_code(getattr(transcript, "language_code", ""))
            return {
                "language_code": language_code,
                "language_label": language_label_for_code(language_code, getattr(transcript, "language", None)),
                "is_generated": bool(getattr(transcript, "is_generated", False)),
                "segments": segments,
            }
        except (TranscriptsDisabled, NoTranscriptFound) as e:
            print(f"DEBUG: Transcript API error for {video_id}: {type(e).__name__}")
            return None
        except Exception as e:
            error_msg = str(e)
            error_msg_lower = error_msg.lower()

            if (
                "blocking requests from your ip" in error_msg_lower
                or "blocked" in error_msg_lower
                or "429" in error_msg_lower
                or "too many requests" in error_msg_lower
            ):
                print(
                    f"DEBUG ERROR: YouTube blocked transcript request for {video_id}. "
                    f"proxy_configured={bool(self.proxy_url)}"
                )
                self.block_detected = True
            elif (
                "proxy" in error_msg_lower
                or "407" in error_msg_lower
                or "tunnel connection failed" in error_msg_lower
                or "cannot connect to proxy" in error_msg_lower
                or "proxyerror" in error_msg_lower
            ):
                print(
                    f"DEBUG ERROR: Proxy failure while fetching transcript for {video_id}: {error_msg}"
                )
                self.proxy_error_detected = True
            else:
                print(f"DEBUG ERROR: Unexpected error fetching transcript for {video_id}: {error_msg}")
            raise

    def _list_transcripts(self, ytt_api: Any, video_id: str) -> Any:
        if hasattr(ytt_api, "list"):
            return ytt_api.list(video_id)
        if hasattr(ytt_api, "list_transcripts"):
            return ytt_api.list_transcripts(video_id)
        if hasattr(YouTubeTranscriptApi, "list_transcripts"):
            return YouTubeTranscriptApi.list_transcripts(video_id)
        raise RuntimeError("youtube-transcript-api does not support listing transcripts in this environment")

    def _select_local_transcript(self, transcript_list: Any, preferred_languages: List[str]) -> Optional[Any]:
        transcripts = list(transcript_list)
        for language in preferred_languages:
            manual = next(
                (
                    transcript for transcript in transcripts
                    if normalize_language_code(getattr(transcript, "language_code", "")) == language
                    and not bool(getattr(transcript, "is_generated", False))
                ),
                None,
            )
            if manual:
                return manual

            generated = next(
                (
                    transcript for transcript in transcripts
                    if normalize_language_code(getattr(transcript, "language_code", "")) == language
                ),
                None,
            )
            if generated:
                return generated
        return None

    def expand_search_terms_for_transcript(
        self,
        keywords: List[str],
        transcript: List[Dict[str, Any]],
        transcript_language: str,
    ) -> List[str]:
        base_terms = _dedupe_terms(keywords)
        if transcript_language != "hi":
            return base_terms

        transcript_tokens = _extract_devanagari_tokens(transcript)
        if not transcript_tokens:
            return base_terms

        additions: List[str] = []
        for keyword in base_terms:
            if _is_devanagari_text(keyword) or not _contains_latin_text(keyword):
                continue

            for token in transcript_tokens:
                if _romanized_forms_similar(keyword, _romanize_devanagari(token)):
                    additions.append(token)

        return _dedupe_terms(base_terms + additions)

    def search_in_transcript(
        self,
        transcript: List[Dict[str, Any]],
        keywords: List[str],
        transcript_language: str,
    ) -> List[Dict[str, Any]]:
        usable_keywords = [_normalize_text(keyword) for keyword in keywords if _normalize_text(keyword)]
        seen_starts = set()
        matches = []

        for i, segment in enumerate(transcript):
            if any(_keyword_matches(segment["text"], keyword, transcript_language) for keyword in usable_keywords):
                if segment["start"] in seen_starts:
                    continue
                seen_starts.add(segment["start"])
                matches.append({
                    "start": segment["start"],
                    "text": segment["text"],
                    "context_before": transcript[i - 1]["text"] if i > 0 else "",
                    "context_after": transcript[i + 1]["text"] if i < len(transcript) - 1 else "",
                })
        return matches
