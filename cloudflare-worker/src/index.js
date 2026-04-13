/**
 * TimeStitch Transcript Worker
 *
 * Fetches YouTube transcripts from Cloudflare's edge IPs, bypassing
 * YouTube's datacenter IP blocks that affect Vercel/Railway/AWS etc.
 *
 * GET /transcript?video_id=<VIDEO_ID>&preferred_langs=en,hi
 * Returns: { language_code, language_label, is_generated, segments }
 */

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") return json({ status: "ok" });

    if (url.pathname === "/debug") {
      const videoId = url.searchParams.get("video_id") ?? "dQw4w9WgXcQ";
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: BROWSER_HEADERS });
      const body = await res.text();
      return json({
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body_length: body.length,
        body_preview: body.slice(0, 300),
      });
    }

    if (url.pathname === "/debug-headers") {
      const videoId = url.searchParams.get("video_id") ?? "dQw4w9WgXcQ";
      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const HEADER_SETS = {
        "1_bare": {},
        "2_useragent_only": {
          "User-Agent": BROWSER_HEADERS["User-Agent"],
        },
        "3_browser_headers": BROWSER_HEADERS,
        "4_browser_plus_referer": {
          ...BROWSER_HEADERS,
          "Referer": "https://www.youtube.com/",
        },
        "5_full": {
          ...BROWSER_HEADERS,
          "Referer": "https://www.youtube.com/",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1",
        },
      };

      // Run all fetches in parallel
      const results = await Promise.all(
        Object.entries(HEADER_SETS).map(async ([label, headers]) => {
          const res = await fetch(ytUrl, { headers });
          const body = await res.text();
          return [label, {
            status: res.status,
            has_player_response: body.includes("ytInitialPlayerResponse"),
            has_captions: body.includes("captionTracks"),
            body_length: body.length,
          }];
        })
      );

      const watchResults = Object.fromEntries(results);

      // If any watch page fetch succeeded, try fetching the caption URL
      const firstSuccess = results.find(([, r]) => r.status === 200 && r.has_captions);
      let captionResult = null;

      if (firstSuccess) {
        const [successLabel, ] = firstSuccess;
        const headers = HEADER_SETS[successLabel];
        const watchRes = await fetch(ytUrl, { headers });
        const html = await watchRes.text();
        const cookies = (watchRes.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");

        const marker = "ytInitialPlayerResponse = ";
        const markerIdx = html.indexOf(marker);
        let depth = 0, i = markerIdx + marker.length;
        for (; i < html.length; i++) {
          if (html[i] === "{") depth++;
          else if (html[i] === "}") { if (--depth === 0) break; }
        }
        const playerData = JSON.parse(html.slice(markerIdx + marker.length, i + 1));
        const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        const track = tracks?.[0];

        if (track) {
          const capRes = await fetch(track.baseUrl, {
            headers: { ...BROWSER_HEADERS, "Referer": ytUrl, ...(cookies ? { "Cookie": cookies } : {}) },
          });
          const capBody = await capRes.text();
          captionResult = {
            status: capRes.status,
            body_length: capBody.length,
            looks_like_xml: capBody.trim().startsWith("<"),
          };
        }
      }

      return json({
        video_id: videoId,
        conclusion: firstSuccess
          ? `Watch page succeeded with header set "${firstSuccess[0]}". See caption_fetch for step 2 result.`
          : "All watch page fetches failed — likely an IP-level block, not fingerprinting.",
        watch_page_tests: watchResults,
        caption_fetch: captionResult,
      });
    }

    if (url.pathname !== "/transcript") return json({ error: "Not found" }, 404);

    const videoId = url.searchParams.get("video_id");
    if (!videoId) return json({ error: "video_id query param is required" }, 400);

    try {
      const preferredLangs = parsePreferredLangs(url.searchParams.get("preferred_langs"));
      const transcript = await fetchTranscript(videoId, preferredLangs);
      return json(transcript);
    } catch (e) {
      return json({ error: e.message }, e.status ?? 500);
    }
  },
};

function normalizeLanguageCode(languageCode) {
  return (languageCode ?? "").toLowerCase().split("-")[0];
}

function parsePreferredLangs(raw) {
  const requested = (raw ?? "")
    .split(",")
    .map(lang => normalizeLanguageCode(lang.trim()))
    .filter(Boolean);

  for (const fallback of ["en", "hi"]) {
    if (!requested.includes(fallback)) requested.push(fallback);
  }

  return requested;
}

function pickTrack(tracks, preferredLangs) {
  for (const lang of preferredLangs) {
    const manual = tracks.find(track => normalizeLanguageCode(track.languageCode) === lang && track.kind !== "asr");
    if (manual) return manual;

    const generated = tracks.find(track => normalizeLanguageCode(track.languageCode) === lang);
    if (generated) return generated;
  }

  return null;
}

async function fetchTranscript(videoId, preferredLangs = ["en", "hi"]) {
  // Step 1 — Fetch the YouTube watch page.
  // This gives us the signed caption track URLs embedded in ytInitialPlayerResponse.
  // Cloudflare's HTTP client has a browser-like TLS fingerprint, so this isn't blocked.
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: BROWSER_HEADERS,
  });

  if (!watchRes.ok) throw httpError(watchRes.status, `Watch page fetch failed: ${watchRes.status}`);

  // Capture session cookies — required for the subsequent timedtext fetch
  const cookies = (watchRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(";")[0])
    .join("; ");

  const html = await watchRes.text();

  // Step 2 — Extract ytInitialPlayerResponse from the HTML.
  // YouTube embeds the full player config as a JS variable in the page.
  // We walk forward matching braces to safely extract the JSON without regex.
  const marker = "ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) throw httpError(500, "ytInitialPlayerResponse not found in watch page");

  let depth = 0, i = markerIdx + marker.length;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { if (--depth === 0) break; }
  }

  const playerData = JSON.parse(html.slice(markerIdx + marker.length, i + 1));
  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks?.length) throw httpError(404, "No captions available for this video");

  const track = pickTrack(tracks, preferredLangs);
  if (!track) throw httpError(404, "No supported captions available for this video");

  // Step 4 — Fetch the caption XML.
  // The baseUrl is a signed timedtext URL. We include cookies from the watch page
  // and the Referer header to satisfy YouTube's same-origin expectations.
  const captionRes = await fetch(track.baseUrl, {
    headers: {
      ...BROWSER_HEADERS,
      "Referer": `https://www.youtube.com/watch?v=${videoId}`,
      ...(cookies ? { "Cookie": cookies } : {}),
    },
  });

  if (!captionRes.ok) throw httpError(captionRes.status, `Caption fetch failed: ${captionRes.status}`);

  const xml = await captionRes.text();
  if (!xml.trim()) throw httpError(500, "Caption response was empty");

  // Step 5 — Parse XML into [{text, start, duration}].
  // The timedtext XML format: <text start="1.23" dur="2.00">Hello world</text>
  const segments = [];
  const re = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const text = m[3]
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n/g, " ")
      .trim();
    if (text) segments.push({ text, start: parseFloat(m[1]), duration: parseFloat(m[2]) });
  }

  const languageCode = normalizeLanguageCode(track.languageCode);
  return {
    language_code: languageCode,
    language_label: track.name?.simpleText ?? (languageCode === "hi" ? "Hindi" : languageCode === "en" ? "English" : track.languageCode),
    is_generated: track.kind === "asr",
    segments,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
