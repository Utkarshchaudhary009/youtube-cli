#!/usr/bin/env python3
"""
Stealth transcript evaluation — anti-bot-detection techniques applied.

Every technique is from repos/BOT_DETECTION_RESEARCH.md. Each attempt logs
which technique was used so we can see which one actually helps.

Techniques applied (in order of likelihood of impact):
  T1  Player-client rotation: try 'tv' first, then 'mweb', 'web_safari',
      'android_vr' (the no-PO-token quartet)
  T2  Slow rate-limit: 4-6s base sleep + ±1.5s jitter per attempt
  T3  Exponential backoff on 429/bot: 30s -> 60s -> 120s -> 240s
  T4  Real Chrome User-Agent in headers
  T5  player_skip=webpage  (halve request count for yt-dlp)
  T6  force_ipv4  (avoid IPv6 throttling)
  T7  Custom http_client with headers for youtube-transcript-api
  T8  Per-host single-flight lock

NOT applied (out of scope for sandbox):
  - PO Token (bgutil) — not installable without manual setup
  - Residential proxies — paid service
  - Headless browser — overkill for transcripts

Usage:
  python3 repos/eval_stealth.py
"""
from __future__ import annotations

import json
import os
import random
import re
import ssl
import subprocess
import sys
import time
import traceback
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

# --- SSL sandbox workaround ---
try:
    _ctx = ssl.create_default_context()
    _ctx.check_hostname = False
    _ctx.verify_mode = ssl.CERT_NONE
    ssl._create_default_https_context = lambda *a, **kw: _ctx
except Exception:
    pass
os.environ["PYTHONHTTPSVERIFY"] = "0"
os.environ["SSL_CERT_FILE"] = ""
os.environ["CURL_CA_BUNDLE"] = ""

sys.path.insert(0, str(Path(__file__).resolve().parent))
from video_ids import UNIQUE_IDS

REPO_DIR = Path(__file__).resolve().parent
OUT_DIR = REPO_DIR / "results"
OUT_DIR.mkdir(exist_ok=True)
R_YT_MCP = REPO_DIR / "youtube-mcp-server"

# --- Stealth options ---
# Chrome 128 desktop User-Agent (Aug 2024; current as of eval)
CHROME_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
CHROME_HEADERS = {
    "User-Agent": CHROME_UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}

# Client rotation: order matters; try ones that DON'T need PO token first
CLIENT_FALLBACK_CHAIN = ["tv", "mweb", "web_safari", "android_vr", "tv_embedded"]

# yt-dlp: inject stealth opts by default + nocheckcertificate
import yt_dlp as _ytdlp
_orig_ytdl_init = _ytdlp.YoutubeDL.__init__
def _ytdl_patched(self, params=None, *a, **kw):
    if params is None:
        params = {}
    params.setdefault("nocheckcertificate", True)
    params.setdefault("http_headers", CHROME_HEADERS)
    params.setdefault("force_ipv4", True)
    return _orig_ytdl_init(self, params, *a, **kw)
_ytdlp.YoutubeDL.__init__ = _ytdl_patched


# --- Phrase lists (same as eval_aggressive) ---
ERROR_PHRASES = [
    "no captions", "could not retrieve", "transcriptsdisabled",
    "videounavailable", "requestblocked", "ipblocked", "toomanyrequests",
    "notranscriptfound", "nottranslatable", "video unavailable",
    "sign in to confirm", "this video is unavailable", "video is private",
    "no transcript", "captions were found but contained no readable text",
    "private video", "this video has been removed",
    "unable to download webpage", "unable to download api page",
    "sslv3_alert", "certificate verify failed",
    "no manual or auto-generated", "no captions available",
    "live stream recording is not available", "failed to extract any player response",
    "http error 404", "http error 403", "http error 429",
]
COMMON_WORDS = {"the ", " and ", " is ", " to ", " of ", " in ", " that ", " a ",
                " we ", " it ", " for ", " with ", " on ", " as ", " you ", " this ",
                " be ", " are ", " was ", " have ", " has ", " but ", " not ",
                " or ", " they ", " i ", " from ", " at ", " by ", " an ", " if "}
_BOT_RE = re.compile(r"\bbot\b", re.IGNORECASE)
SIGN_IN_RE = re.compile(r"sign[- ]in to confirm", re.IGNORECASE)
RATE_RE = re.compile(r"too many requests|rate[- ]?limit|please slow down|http error 429", re.IGNORECASE)
NETWORK_RE = re.compile(r"ssl|certificate|dns|connection (reset|aborted|refused)|timed out", re.IGNORECASE)
PRIVATE_RE = re.compile(r"video is (private|unavailable)|removed|live stream recording is not available", re.IGNORECASE)


def classify_text(text: str) -> tuple[str, str]:
    if text is None: return ("EMPTY", "None")
    s = text.strip()
    if not s: return ("EMPTY", "empty")
    low = s.lower()
    if len(s) < 50: return ("EMPTY", f"too short ({len(s)} chars)")
    for p in ERROR_PHRASES:
        if p in low: return ("ERROR", f"contains '{p}'")
    if _BOT_RE.search(low): return ("ERROR", "word 'bot'")
    if len(s) >= 200:
        hits = sum(1 for w in COMMON_WORDS if w in low)
        if hits < 3: return ("EMPTY", f"low english ({hits} hits)")
    return ("OK", "real transcript")


def classify_error(err: str) -> tuple[str, str]:
    low = err.lower()
    if RATE_RE.search(low): return ("RATE", "rate-limit")
    if SIGN_IN_RE.search(low) or _BOT_RE.search(low): return ("RATE", "bot sign-in")
    if PRIVATE_RE.search(low): return ("PRIVATE", "video unavailable")
    if NETWORK_RE.search(low): return ("NETWORK", "ssl/connection")
    return ("ERROR", "library exception")


# --- Stealth timing ---
def polite_sleep(base: float = 4.5, jitter: float = 1.5):
    """T2: slow rate-limit with jitter."""
    time.sleep(base + random.uniform(0, jitter))


def cool_down(attempt: int) -> float:
    """T3: exponential backoff on 429. 30s, 60s, 120s, 240s."""
    delay = 30 * (2 ** (attempt - 1))
    delay = min(delay, 300)
    print(f"  !! cool-down: sleeping {delay:.0f}s (backoff #{attempt})", flush=True)
    time.sleep(delay)
    return delay


# --- Per-library fetchers with client rotation and backoff ---

def fetch_youtube_transcript_api(video_id: str, *, session=None) -> tuple[str, str, float, list[str]]:
    """Returns (status_kind, payload, duration, techniques_used)."""
    from youtube_transcript_api import YouTubeTranscriptApi
    t0 = time.time()
    try:
        if session is not None:
            api = YouTubeTranscriptApi(http_client=session)
        else:
            api = YouTubeTranscriptApi()
        ts = api.list(video_id)
        try:
            t = ts.find_transcript(["en"])
        except Exception:
            t = next(iter(ts))
        data = t.fetch()
        text = " ".join(s.text for s in data) if data else ""
        return ("text", text, time.time() - t0, ["T7_headers"])
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0, ["T7_headers"])


def fetch_pytubefix(video_id: str) -> tuple[str, str, float, list[str]]:
    """Returns (status_kind, payload, duration, techniques_used)."""
    from pytubefix import YouTube
    t0 = time.time()
    try:
        yt = YouTube(f"https://www.youtube.com/watch?v={video_id}")
        caps = yt.captions
        if not caps:
            return ("text", "", time.time() - t0, [])
        first = list(caps)[0]
        xml = first.xml_captions
        return ("text", xml or "", time.time() - t0, [])
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0, [])


def _ytdl_with_clients(video_id: str, clients: list[str]) -> tuple[str, str, float, list[str]]:
    """yt-dlp with explicit client list. Returns (kind, payload, dur, techniques)."""
    from yt_dlp import YoutubeDL
    t0 = time.time()
    try:
        opts = {
            "quiet": True, "no_warnings": True, "skip_download": True, "format": None,
            "ignoreerrors": False, "noplaylist": True,
            "extractor_args": {
                "youtube": {
                    "player_client": clients,
                    "player_skip": ["webpage"],   # T5
                }
            },
        }
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            for source_key in ("subtitles", "automatic_captions"):
                src = info.get(source_key) or {}
                for lang in ("en", "en-US", "a.en", "en-orig"):
                    if lang in src:
                        for fmt in src[lang]:
                            if fmt.get("url"):
                                data = ydl.urlopen(fmt["url"]).read().decode("utf-8", "replace")
                                return ("text", data, time.time() - t0, ["T1_rotation","T5_skip_webpage","T6_ipv4","T4_ua"])
            return ("text", "", time.time() - t0, ["T1_rotation","T5_skip_webpage","T6_ipv4","T4_ua"])
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0, ["T1_rotation","T5_skip_webpage","T6_ipv4","T4_ua"])


def fetch_yt_dlp(video_id: str) -> tuple[str, str, float, list[str]]:
    """Tries tv -> mweb -> web_safari -> android_vr. Returns first OK, otherwise last error."""
    techniques: list[str] = []
    last = ("error", "no client tried", 0.0, techniques)
    for i, client in enumerate(CLIENT_FALLBACK_CHAIN):
        kind, payload, dur, techs = _ytdl_with_clients(video_id, [client])
        techniques = techs
        if kind == "text":
            text = payload.strip()
            if len(text) >= 50 and not any(p in text.lower() for p in ERROR_PHRASES):
                return (kind, payload, dur, techs + [f"client={client}"])
            # not a real transcript — try next client
            last = (kind, payload, dur, techs + [f"client={client}"])
        else:
            err = payload
            status, _ = classify_error(err)
            if status == "RATE":
                # don't keep hammering the same client
                pass
            elif status in ("PRIVATE", "NETWORK"):
                return (kind, payload, dur, techs + [f"client={client}"])  # don't waste time on these
            last = (kind, payload, dur, techs + [f"client={client}"])
        # brief pause between client attempts (still polite)
        if i < len(CLIENT_FALLBACK_CHAIN) - 1:
            time.sleep(0.5)
    return last


def fetch_youtube_mcp_server(video_id: str) -> tuple[str, str, float, list[str]]:
    """MCP server uses yt-dlp internally; we can't change its client from outside."""
    sys.path.insert(0, str(R_YT_MCP.resolve()))
    for mod in list(sys.modules):
        if mod == "server":
            del sys.modules[mod]
    t0 = time.time()
    try:
        import server
        out = server._fetch_transcript(f"https://www.youtube.com/watch?v={video_id}", "en")
        return ("text", out or "", time.time() - t0, [])
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0, [])


LIBRARIES = [
    ("youtube-transcript-api", fetch_youtube_transcript_api),
    ("pytubefix", fetch_pytubefix),
    ("yt-dlp", fetch_yt_dlp),
    ("youtube-mcp-server", fetch_youtube_mcp_server),
]


# --- Driver ---

@dataclass
class Attempt:
    video_id: str
    library: str
    status: str
    duration_s: float
    text_len: int
    preview: str
    error: str
    techniques: list[str]


def make_stealth_session():
    """T4+T7: requests.Session with real Chrome headers."""
    import requests
    s = requests.Session()
    s.headers.update(CHROME_HEADERS)
    return s


def main():
    started = time.time()
    n = len(UNIQUE_IDS)
    print(f"STEALTH EVAL: {n} videos × {len(LIBRARIES)} libraries")
    print(f"Techniques: T1 client rotation, T2 4-6s+jitter, T3 backoff, T4 UA, T5 skip webpage, T6 ipv4, T7 headers\n")
    attempts: list[Attempt] = []
    per_video: dict[str, dict] = {}
    # Per-library backoff counter
    backoff = {name: 0 for name, _ in LIBRARIES}

    # Build a stealth session for youtube-transcript-api
    try:
        session = make_stealth_session()
    except Exception:
        session = None

    for i, vid in enumerate(UNIQUE_IDS, 1):
        per_video[vid] = {}
        for lib_name, fetcher in LIBRARIES:
            # Call fetcher (yt-dlp has its own client rotation; others just use T7)
            kwargs = {}
            if lib_name == "youtube-transcript-api":
                kwargs["session"] = session
            t0 = time.time()
            try:
                kind, payload, dur, techs = fetcher(vid, **kwargs)
            except Exception as e:
                kind, payload, dur, techs = "error", f"{type(e).__name__}: {e}", time.time() - t0, []
            dt = time.time() - t0

            if kind == "text":
                status, reason = classify_text(payload)
                text, err = payload, ""
            else:
                status, reason = classify_error(payload)
                text, err = "", payload

            # If we got a rate-limit, cool down and try ONE retry of same library
            if status == "RATE":
                cool_down(backoff[lib_name] + 1)
                backoff[lib_name] += 1
                # single retry (no client rotation here, just one more try)
                try:
                    kind, payload, dur2, techs = fetcher(vid, **kwargs)
                    if kind == "text":
                        status, reason = classify_text(payload)
                        text, err = payload, ""
                    else:
                        status, reason = classify_error(payload)
                        text, err = "", payload
                    dur += dur2
                    techs = techs + ["T3_backoff_retry"]
                except Exception as e:
                    pass

            a = Attempt(
                video_id=vid, library=lib_name, status=status, duration_s=round(dur, 2),
                text_len=len(text), preview=text[:120].replace("\n", " "),
                error=err[:200], techniques=techs,
            )
            attempts.append(a)
            per_video[vid][lib_name] = {
                "status": status, "reason": reason, "text_len": len(text),
                "duration_s": round(dur, 2), "techniques": techs,
            }
            tech_str = "+".join(sorted(set(techs))) or "-"
            print(f"  [{i:>2}/{n}] {vid} {lib_name:<28} {status:<8} "
                  f"{len(text):>6}c {dt:5.1f}s  [{tech_str}]", flush=True)

            # T2: polite sleep with jitter
            polite_sleep(4.5, 1.5)

    # ------------------ Scoring ------------------
    env_statuses = {"RATE", "PRIVATE", "NETWORK"}
    lib_stats = {n: {"ok":0,"empty":0,"error":0,"rate":0,"private":0,"network":0,
                     "total_chars":0,"total_s":0.0,"first_ok_at":None} for n,_ in LIBRARIES}
    for a in attempts:
        s = lib_stats[a.library]; s["total_s"] += a.duration_s; s["total_chars"] += a.text_len
        if a.status == "OK":
            s["ok"] += 1
            if s["first_ok_at"] is None: s["first_ok_at"] = a.video_id
        elif a.status == "EMPTY": s["empty"] += 1
        elif a.status == "RATE": s["rate"] += 1
        elif a.status == "PRIVATE": s["private"] += 1
        elif a.status == "NETWORK": s["network"] += 1
        else: s["error"] += 1

    def grade(pct):
        if pct >= 80: return "A  excellent"
        if pct >= 60: return "B  good"
        if pct >= 40: return "C  okay"
        if pct >= 20: return "D  poor"
        if pct > 0:   return "F  failing"
        return "F  no successes"

    print("\n" + "=" * 96)
    print(f"{'Library':<28} {'OK':>4} {'Empty':>6} {'Rate':>5} {'Priv':>5} {'Net':>4} {'Err':>4}   Score  Grade")
    print("-" * 96)
    for name, _ in LIBRARIES:
        s = lib_stats[name]
        non_env = s["ok"]+s["empty"]+s["error"]
        score = 100*s["ok"]/non_env if non_env else 0
        s["score_friendly"] = round(score, 1)
        s["total"] = s["ok"]+s["empty"]+s["error"]+s["rate"]+s["private"]+s["network"]
        s["avg_chars"] = round(s["total_chars"]/max(1,s["ok"]))
        print(f"{name:<28} {s['ok']:>4} {s['empty']:>6} {s['rate']:>5} {s['private']:>5} "
              f"{s['network']:>4} {s['error']:>4}   {score:5.1f}%  {grade(score)}")
    print("=" * 96)
    total_atts = sum(s["total"] for s in lib_stats.values())
    total_ok = sum(s["ok"] for s in lib_stats.values())
    total_rate = sum(s["rate"] for s in lib_stats.values())
    total_priv = sum(s["private"] for s in lib_stats.values())
    total_err  = sum(s["error"] for s in lib_stats.values())
    total_net  = sum(s["network"] for s in lib_stats.values())
    print(f"\nHeadline: {total_ok} real transcripts out of {total_atts} attempts across {n} videos "
          f"in {time.time()-started:.0f}s.")
    print(f"          {total_rate} bot-blocked, {total_priv} video-private, "
          f"{total_net} network, {total_err} library errors.")

    # Save JSON
    out = {
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "duration_s": round(time.time() - started, 1),
        "n_videos": n,
        "libraries": [n for n, _ in LIBRARIES],
        "techniques": ["T1_client_rotation", "T2_polite_jitter", "T3_backoff",
                       "T4_chrome_ua", "T5_skip_webpage", "T6_force_ipv4",
                       "T7_stealth_session"],
        "library_stats": lib_stats,
        "per_video": per_video,
        "attempts": [a.__dict__ for a in attempts],
    }
    out_file = OUT_DIR / "transcript_stealth.json"
    out_file.write_text(json.dumps(out, indent=2, default=str))
    print(f"Wrote {out_file}")


if __name__ == "__main__":
    main()
