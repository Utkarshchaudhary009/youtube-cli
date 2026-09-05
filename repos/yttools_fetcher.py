#!/usr/bin/env python3
"""
yttools.co transcript fetcher.

yttools.co is a public Next.js app with a /api/transcript endpoint.
It uses its own IP pool and is not aggressively rate-limited.

API: GET /api/transcript?url=<youtube_url>
Returns: { transcript: [{text, duration, offset, lang}, ...], videoId: "..." }
"""
from __future__ import annotations
import json
import ssl
import time
import urllib.parse
import urllib.request

try:
    _ctx = ssl.create_default_context()
    _ctx.check_hostname = False
    _ctx.verify_mode = ssl.CERT_NONE
except Exception:
    _ctx = None


def _http_get_json(url: str, timeout: float = 20.0) -> dict:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
        return json.loads(r.read())


def fetch_yttools(video_id: str, lang: str = "en", timeout: float = 20.0) -> tuple[str, str, float, list[str]]:
    """Returns (kind, text_or_error, duration, techniques)."""
    t0 = time.time()
    try:
        url = f"https://yttools.co/api/transcript?url={urllib.parse.quote(f'https://www.youtube.com/watch?v={video_id}', safe='')}"
        data = _http_get_json(url, timeout=timeout)
        segments = data.get("transcript", [])
        if not segments:
            return ("error", "yttools: no segments returned",
                    time.time() - t0, ["yttools.co"])
        # prefer requested language
        chosen = [s for s in segments if s.get("lang", "").lower().startswith(lang.lower())]
        if not chosen:
            chosen = segments
        text = " ".join(s.get("text", "").strip() for s in chosen)
        text = " ".join(text.split())  # squeeze whitespace
        if not text:
            return ("error", "yttools: empty after join",
                    time.time() - t0, ["yttools.co"])
        return ("text", f"<<yttools.co:{data.get('videoId', video_id)}>>\n{text}",
                time.time() - t0, ["yttools.co", f"lang={lang}", f"n_segments={len(chosen)}"])
    except Exception as e:
        return ("error", f"yttools: {type(e).__name__}: {e}",
                time.time() - t0, ["yttools.co"])


if __name__ == "__main__":
    for vid in ["dQw4w9WgXcQ", "jNQXAC9IVRw", "9bZkp7q19f0", "kJQP7kiw5Fk", "YQHsXMglC9A"]:
        kind, payload, dur, techs = fetch_yttools(vid)
        if kind == "text":
            print(f"{vid}: OK ({len(payload)} chars, {dur:.1f}s)  preview={payload[:100]!r}")
        else:
            print(f"{vid}: ERR {payload[:100]}")
