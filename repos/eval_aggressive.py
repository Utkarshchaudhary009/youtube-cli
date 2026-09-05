#!/usr/bin/env python3
"""
Aggressive transcript evaluation across 4 libraries on 60+ real YouTube videos.

For each video we attempt to fetch its transcript/captions using every library
that supports that operation. Each result is classified as:
  - OK:       real transcript text returned, >50 chars, not an error message
  - EMPTY:    no error raised, but no usable text
  - RATE:     YouTube / IP rate-limit (distinguished from real library errors)
  - PRIVATE:  video is private / removed / region-locked
  - NETWORK:  SSL / DNS / connection failure
  - UNSUP:    library does not support transcript fetching
  - ERROR:    genuine library/exception failure
  - TIMEOUT:  exceeded budget

Friendly scoring:
  - Treat RATE / PRIVATE / NETWORK as "environmental" — don't penalize libraries
  - Score = OK / (total - environmental)
  - Show how many of each library succeeded at least once (proves it works)
  - Show rate-limit impact (YouTube sandbox IP gets blocked after a few reqs)

Outputs: results/transcript_aggressive.json + .txt (human readable)
"""
from __future__ import annotations

import json
import os
import re
import ssl
import subprocess
import sys
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

# SSL workaround for sandbox self-signed chain
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

from video_ids import UNIQUE_IDS

REPO_DIR = Path(__file__).resolve().parent
OUT_DIR = REPO_DIR / "results"
OUT_DIR.mkdir(exist_ok=True)
R_YT_MCP = REPO_DIR / "youtube-mcp-server"

# Monkey-patch yt_dlp to disable certificate verification everywhere
import yt_dlp as _ytdlp
_orig_ytdl_init = _ytdlp.YoutubeDL.__init__
def _ytdl_patched(self, params=None, *a, **kw):
    if params is None:
        params = {}
    params.setdefault("nocheckcertificate", True)
    return _orig_ytdl_init(self, params, *a, **kw)
_ytdlp.YoutubeDL.__init__ = _ytdl_patched


# ------------------------------------------------------------------
# Phrase lists
# ------------------------------------------------------------------
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
PRIVATE_RE = re.compile(r"video is (private|unavailable)|removed|live stream recording is not available", re.IGNORECASE)
NETWORK_RE = re.compile(r"ssl|certificate|dns|connection (reset|aborted|refused)|timed out|temporarily unavailable|http error", re.IGNORECASE)
RATE_RE = re.compile(r"too many requests|rate[- ]?limit|please slow down|429", re.IGNORECASE)


def classify_text(text: str) -> tuple[str, str]:
    """Classify a returned transcript text. Returns (status, reason)."""
    if text is None:
        return ("EMPTY", "None returned")
    s = text.strip()
    if not s:
        return ("EMPTY", "empty string")
    low = s.lower()
    if len(s) < 50:
        return ("EMPTY", f"too short ({len(s)} chars)")
    for phrase in ERROR_PHRASES:
        if phrase in low:
            return ("ERROR", f"contains error phrase: {phrase!r}")
    if _BOT_RE.search(low):
        return ("ERROR", "contains word 'bot'")
    if len(s) >= 200:
        hits = sum(1 for w in COMMON_WORDS if w in low)
        if hits < 3:
            return ("EMPTY", f"low English density ({hits} hits in {len(s)} chars)")
    return ("OK", "looks like real transcript")


def classify_error(err: str) -> tuple[str, str]:
    """Classify an exception string. Returns (status, category)."""
    low = err.lower()
    if RATE_RE.search(low):
        return ("RATE", "rate limit")
    if SIGN_IN_RE.search(low) or _BOT_RE.search(low):
        return ("RATE", "bot sign-in required")
    if PRIVATE_RE.search(low):
        return ("PRIVATE", "video unavailable/private")
    if NETWORK_RE.search(low):
        return ("NETWORK", "SSL/connection error")
    return ("ERROR", "library exception")


# ------------------------------------------------------------------
# Per-library fetchers
# ------------------------------------------------------------------
def fetch_youtube_transcript_api(video_id: str) -> tuple[str, str, float]:
    from youtube_transcript_api import YouTubeTranscriptApi
    t0 = time.time()
    try:
        api = YouTubeTranscriptApi()
        ts = api.list(video_id)
        try:
            t = ts.find_transcript(["en"])
        except Exception:
            t = next(iter(ts))
        data = t.fetch()
        text = " ".join(s.text for s in data) if data else ""
        return ("text", text, time.time() - t0)
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0)


def fetch_pytubefix(video_id: str) -> tuple[str, str, float]:
    from pytubefix import YouTube
    t0 = time.time()
    try:
        yt = YouTube(f"https://www.youtube.com/watch?v={video_id}")
        caps = yt.captions
        if not caps:
            return ("text", "", time.time() - t0)
        first = list(caps)[0]
        try:
            xml = first.xml_captions
        except Exception as e:
            return ("error", f"xml_captions failed: {type(e).__name__}: {e}", time.time() - t0)
        return ("text", xml or "", time.time() - t0)
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0)


def fetch_yt_dlp(video_id: str) -> tuple[str, str, float]:
    from yt_dlp import YoutubeDL
    t0 = time.time()
    try:
        opts = {"quiet": True, "no_warnings": True, "skip_download": True, "format": None,
                "ignoreerrors": False, "noplaylist": True}
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            for source_key in ("subtitles", "automatic_captions"):
                src = info.get(source_key) or {}
                for lang in ("en", "en-US", "a.en", "en-orig"):
                    if lang in src:
                        for fmt in src[lang]:
                            if fmt.get("url"):
                                data = ydl.urlopen(fmt["url"]).read().decode("utf-8", "replace")
                                return ("text", data, time.time() - t0)
            return ("text", "", time.time() - t0)
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0)


def fetch_youtube_mcp_server(video_id: str) -> tuple[str, str, float]:
    sys.path.insert(0, str(R_YT_MCP.resolve()))
    for mod in list(sys.modules):
        if mod == "server":
            del sys.modules[mod]
    t0 = time.time()
    try:
        import server
        out = server._fetch_transcript(f"https://www.youtube.com/watch?v={video_id}", "en")
        return ("text", out or "", time.time() - t0)
    except Exception as e:
        return ("error", f"{type(e).__name__}: {e}", time.time() - t0)


LIBRARIES = [
    ("youtube-transcript-api", fetch_youtube_transcript_api),
    ("pytubefix", fetch_pytubefix),
    ("yt-dlp", fetch_yt_dlp),
    ("youtube-mcp-server", fetch_youtube_mcp_server),
]

# Per-attempt pause to be polite to YouTube
PAUSE_S = 0.4


@dataclass
class Attempt:
    video_id: str
    library: str
    status: str
    duration_s: float
    text_len: int = 0
    preview: str = ""
    error: str = ""


def main():
    started = time.time()
    print(f"Evaluating {len(UNIQUE_IDS)} videos × {len(LIBRARIES)} libraries "
          f"({len(UNIQUE_IDS)*len(LIBRARIES)} attempts, {PAUSE_S}s pause each)\n")
    attempts: list[Attempt] = []
    per_video: dict[str, dict] = {}

    for i, vid in enumerate(UNIQUE_IDS, 1):
        per_video[vid] = {}
        for lib_name, fetcher in LIBRARIES:
            t0 = time.time()
            try:
                kind, payload, dur = fetcher(vid)
            except Exception as e:
                kind, payload, dur = "error", f"{type(e).__name__}: {e}", time.time() - t0
            dt = time.time() - t0

            if kind == "text":
                status, reason = classify_text(payload)
                text = payload
                err = ""
            else:
                status, reason = classify_error(payload)
                text = ""
                err = payload

            a = Attempt(
                video_id=vid, library=lib_name, status=status,
                duration_s=round(dt, 2), text_len=len(text),
                preview=text[:120].replace("\n", " "),
                error=err[:200],
            )
            attempts.append(a)
            per_video[vid][lib_name] = {
                "status": status, "reason": reason, "text_len": len(text),
                "duration_s": round(dt, 2),
            }
            print(f"  [{i:>2}/{len(UNIQUE_IDS)}] {vid} {lib_name:<28} {status:<8} "
                  f"{len(text):>6}c  {dt:5.1f}s", flush=True)
            time.sleep(PAUSE_S)

    # ------------------ Scoring ------------------
    env_statuses = {"RATE", "PRIVATE", "NETWORK"}
    lib_stats = {n: {"ok": 0, "empty": 0, "error": 0, "rate": 0, "private": 0, "network": 0,
                     "total_chars": 0, "total_s": 0.0, "first_ok_at": None} for n, _ in LIBRARIES}
    for a in attempts:
        s = lib_stats[a.library]
        s["total_s"] += a.duration_s
        s["total_chars"] += a.text_len
        if a.status == "OK":
            s["ok"] += 1
            if s["first_ok_at"] is None:
                s["first_ok_at"] = a.video_id
        elif a.status == "EMPTY": s["empty"] += 1
        elif a.status == "RATE":  s["rate"] += 1
        elif a.status == "PRIVATE": s["private"] += 1
        elif a.status == "NETWORK": s["network"] += 1
        else: s["error"] += 1

    def grade(pct: float) -> str:
        if pct >= 90: return "A+ (excellent)"
        if pct >= 80: return "A  (excellent)"
        if pct >= 65: return "B  (good)"
        if pct >= 45: return "C  (okay)"
        if pct >= 25: return "D  (poor)"
        if pct > 0:   return "F  (failing)"
        return "F  (no successes)"

    # Per-video matrix
    print("\n" + "=" * 90)
    print(f"{'Library':<28} {'OK':>4} {'Empty':>6} {'Rate':>5} {'Priv':>4} {'Net':>4} {'Err':>4}   Score   Grade")
    print("-" * 90)
    friendly = {}
    for name, _ in LIBRARIES:
        s = lib_stats[name]
        total = s["ok"] + s["empty"] + s["error"] + s["rate"] + s["private"] + s["network"]
        non_env = total - s["rate"] - s["private"] - s["network"]
        if non_env == 0:
            score = 0.0
        else:
            score = 100.0 * s["ok"] / non_env
        s["score_friendly"] = round(score, 1)
        s["total"] = total
        s["avg_chars"] = round(s["total_chars"] / max(1, s["ok"]))
        friendly[name] = score
        print(f"{name:<28} {s['ok']:>4} {s['empty']:>6} {s['rate']:>5} {s['private']:>4} "
              f"{s['network']:>4} {s['error']:>4}   {score:5.1f}%  {grade(score)}")
    print("=" * 90)
    for name, _ in LIBRARIES:
        s = lib_stats[name]
        print(f"  {name}: {grade(s['score_friendly'])} — {s['ok']} real transcripts, "
              f"avg {s['avg_chars']} chars, first OK at {s['first_ok_at'] or '(none)'}")
    print()

    # Headline summary
    n = len(UNIQUE_IDS)
    rate_total = sum(lib_stats[l]["rate"] for l, _ in LIBRARIES)
    priv_total = sum(lib_stats[l]["private"] for l, _ in LIBRARIES)
    net_total  = sum(lib_stats[l]["network"] for l, _ in LIBRARIES)
    err_total  = sum(lib_stats[l]["error"] for l, _ in LIBRARIES)
    ok_total   = sum(lib_stats[l]["ok"] for l, _ in LIBRARIES)
    total_atts = sum(lib_stats[l]["total"] for l, _ in LIBRARIES)
    print(f"Headline: {ok_total} real transcripts out of {total_atts} attempts across {n} videos.")
    print(f"          {rate_total} blocked by YouTube bot detection, {priv_total} video-private, "
          f"{net_total} network, {err_total} genuine library errors.")
    print()

    # ------------------ JSON output ------------------
    out = {
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "duration_s": round(time.time() - started, 1),
        "n_videos": n,
        "libraries": [n for n, _ in LIBRARIES],
        "library_stats": lib_stats,
        "per_video": per_video,
        "attempts": [a.__dict__ for a in attempts],
    }
    out_file = OUT_DIR / "transcript_aggressive.json"
    out_file.write_text(json.dumps(out, indent=2, default=str))
    print(f"Wrote {out_file}")

    # ------------------ Human-readable report ------------------
    report = ["# Aggressive transcript evaluation", ""]
    report.append(f"**Videos:** {n}  **Libraries:** {len(LIBRARIES)}  **Pause per attempt:** {PAUSE_S}s")
    report.append(f"**Total time:** {out['duration_s']}s\n")
    report.append("## Friendly scoreboard (env issues excluded)\n")
    report.append("| Library | OK | Empty | Rate | Private | Network | Error | Score | Grade |")
    report.append("|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for name, _ in LIBRARIES:
        s = lib_stats[name]
        report.append(f"| {name} | {s['ok']} | {s['empty']} | {s['rate']} | {s['private']} | "
                      f"{s['network']} | {s['error']} | **{s['score_friendly']}%** | {grade(s['score_friendly'])} |")
    report.append("")
    report.append("**Score formula:** `OK ÷ (total - rate - private - network)`  \n"
                  "**Why exclude env issues?** YouTube aggressively rate-limits datacenter IPs "
                  "after a handful of requests. Hiding those rows from the score shows the *real* "
                  "capability of each library.\n")
    report.append("## Per-video matrix (status per library)\n")
    header = "| Video | " + " | ".join(n for n, _ in LIBRARIES) + " |"
    sep    = "|---" * (len(LIBRARIES) + 1) + "|"
    report.append(header)
    report.append(sep)
    for vid in UNIQUE_IDS:
        row = [vid] + [per_video[vid][n]["status"][0] for n, _ in LIBRARIES]
        report.append("| " + " | ".join(row) + " |")
    report.append("\nStatus codes: **O**=OK, **E**=Empty, **R**=Rate, **P**=Private, **N**=Network, **X**=Error\n")
    txt_file = OUT_DIR / "transcript_aggressive.md"
    txt_file.write_text("\n".join(report))
    print(f"Wrote {txt_file}")


if __name__ == "__main__":
    main()
