#!/usr/bin/env python3
"""
Multi-service transcript eval: yttools.co + collabpals.com + henglyrepo.

Tests 2 known-working services plus henglyrepo for completeness. Uses the
curated 24 captioned videos for clean scoring.
"""
from __future__ import annotations

import json
import os
import random
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

try:
    _ctx = ssl.create_default_context()
    _ctx.check_hostname = False
    _ctx.verify_mode = ssl.CERT_NONE
    ssl._create_default_https_context = lambda *a, **kw: _ctx
except Exception:
    pass
os.environ["PYTHONHTTPSVERIFY"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_stealth import classify_text, classify_error

REPO_DIR = Path(__file__).resolve().parent
OUT_DIR = REPO_DIR / "results"
OUT_DIR.mkdir(exist_ok=True)

CURATED = json.loads((OUT_DIR / "curated_videos.json").read_text())
CAPTIONED_IDS = CURATED["curated_ids_with_captions"]


def _post_json(url, payload, timeout=15, headers_extra=None):
    headers = {"User-Agent": "Mozilla/5.0 Chrome/128", "Accept": "application/json",
               "Content-Type": "application/json"}
    if headers_extra:
        headers.update(headers_extra)
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
            return r.read(), r.status
    except urllib.error.HTTPError as e:
        return e.read() if hasattr(e, "read") else b"", e.code
    except Exception as e:
        return b"", -1


def _get(url, timeout=15, headers_extra=None):
    headers = {"User-Agent": "Mozilla/5.0 Chrome/128", "Accept": "application/json"}
    if headers_extra:
        headers.update(headers_extra)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
            return r.read(), r.status
    except urllib.error.HTTPError as e:
        return e.read() if hasattr(e, "read") else b"", e.code
    except Exception as e:
        return b"", -1


def fetch_yttools(video_id):
    """yttools.co: GET with url= query param."""
    t0 = time.time()
    url = f"https://yttools.co/api/transcript?url={urllib.parse.quote(f'https://www.youtube.com/watch?v={video_id}', safe='')}"
    body, status = _get(url, timeout=10)
    dur = time.time() - t0
    if status == 200:
        d = json.loads(body)
        segs = d.get("transcript", [])
        if segs:
            text = " ".join(s.get("text", "").strip() for s in segs)
            text = " ".join(text.split())
            return ("text", f"<<yttools.co>>\n{text}", dur, len(segs))
    return ("error", f"yttools: {status}", dur, 0)


def fetch_collabpals(video_id):
    """collabpals.com: POST JSON to /api/tools/fetch-transcript."""
    t0 = time.time()
    url = "https://www.collabpals.com/api/tools/fetch-transcript"
    payload = {"url": f"https://www.youtube.com/watch?v={video_id}"}
    body, status = _post_json(url, payload, timeout=15, headers_extra={
        "Referer": "https://www.collabpals.com/tools/youtube-transcript-generator",
        "Origin": "https://www.collabpals.com",
    })
    dur = time.time() - t0
    if status == 200:
        d = json.loads(body)
        if d.get("success") and d.get("data", {}).get("transcript"):
            t_data = d["data"]["transcript"]
            text = " ".join(s.get("text", "").strip() for s in t_data)
            text = " ".join(text.split())
            return ("text", f"<<collabpals.com:{d['data'].get('videoId', video_id)}>>\n{text}", dur, len(t_data))
        return ("error", f"collabpals: success={d.get('success')} msg={d.get('message','')[:100]}", dur, 0)
    return ("error", f"collabpals: HTTP {status}", dur, 0)


def fetch_henglyrepo(video_id):
    """henglyrepo (Vercel demo): POST JSON to /api/transcript."""
    t0 = time.time()
    url = "https://youtube-transcript-green.vercel.app/api/transcript"
    payload = {"videoUrl": f"https://www.youtube.com/watch?v={video_id}", "format": "json"}
    body, status = _post_json(url, payload, timeout=10)
    dur = time.time() - t0
    if status == 200:
        d = json.loads(body)
        if d.get("success") and d.get("data"):
            t_data = json.loads(d["data"])
            text = " ".join(s.get("text", "").replace("&#39;", "'") for s in t_data)
            text = " ".join(text.split())
            return ("text", f"<<henglyrepo.vercel.app:{d.get('videoId',video_id)}>>\n{text}", dur, len(t_data))
    return ("error", f"henglyrepo: {status}", dur, 0)


SERVICES = [
    ("yttools.co", fetch_yttools),
    ("collabpals.com", fetch_collabpals),
    ("henglyrepo.vercel.app", fetch_henglyrepo),
]


@dataclass
class Attempt:
    video_id: str
    service: str
    status: str
    duration_s: float
    text_len: int
    preview: str
    error: str
    n_segments: int


def main():
    n = len(CAPTIONED_IDS)
    print(f"MULTI-SERVICE EVAL: {n} captioned videos × {len(SERVICES)} services\n")
    started = time.time()
    attempts = []
    per_video = {}
    stats = {name: {"ok":0,"empty":0,"error":0,"total_chars":0,"total_s":0.0,"first_ok_at":None}
             for name, _ in SERVICES}

    for i, vid in enumerate(CAPTIONED_IDS, 1):
        per_video[vid] = {}
        for name, fn in SERVICES:
            t0 = time.time()
            try:
                kind, payload, dur, n_segs = fn(vid)
            except Exception as e:
                kind, payload, dur, n_segs = "error", f"{type(e).__name__}: {e}", time.time() - t0, 0
            elapsed = dur

            if kind == "text":
                status, reason = classify_text(payload)
                text, err = payload, ""
            else:
                status, reason = classify_error(payload)
                text, err = "", payload

            a = Attempt(
                video_id=vid, service=name, status=status, duration_s=round(elapsed, 2),
                text_len=len(text), preview=text[:120].replace("\n", " "),
                error=err[:200], n_segments=n_segs,
            )
            attempts.append(a)
            per_video[vid][name] = {
                "status": status, "reason": reason, "text_len": len(text),
                "duration_s": round(elapsed, 2), "n_segments": n_segs,
            }
            s = stats[name]
            s["total_s"] += elapsed
            s["total_chars"] += len(text)
            if status == "OK":
                s["ok"] += 1
                if s["first_ok_at"] is None: s["first_ok_at"] = vid
            elif status == "EMPTY": s["empty"] += 1
            else: s["error"] += 1
            print(f"  [{i:>2}/{n}] {vid} {name:<22} {status:<8} {len(text):>6}c "
                  f"({n_segs:>3} segs) {elapsed:5.1f}s", flush=True)
            time.sleep(0.4 + random.uniform(0, 0.4))

    print("\n" + "=" * 86)
    print(f"{'Service':<25} {'OK':>4} {'Empty':>6} {'Err':>4}   Score  Avg chars  Avg time")
    print("-" * 86)
    for name, _ in SERVICES:
        s = stats[name]
        non_env = s["ok"] + s["empty"] + s["error"]
        # OK + EMPTY = successful fetch
        succ = s["ok"] + s["empty"]
        score = 100 * succ / non_env if non_env else 0
        # also a "pure OK" score
        pure_score = 100 * s["ok"] / non_env if non_env else 0
        s["score_succ"] = round(score, 1)
        s["score_pure"] = round(pure_score, 1)
        s["avg_chars"] = round(s["total_chars"] / max(1, succ))
        s["avg_time"] = round(s["total_s"] / max(1, succ), 2)
        print(f"{name:<25} {s['ok']:>4} {s['empty']:>6} {s['error']:>4}   "
              f"{score:5.1f}%  {s['avg_chars']:>8}  {s['avg_time']:>6.2f}s")
    print("=" * 86)
    total_atts = sum(s["ok"]+s["empty"]+s["error"] for s in stats.values())
    total_succ = sum(s["ok"]+s["empty"] for s in stats.values())
    print(f"\nTotal: {total_succ}/{total_atts} successful fetches "
          f"({100*total_succ/total_atts:.1f}%) across {len(SERVICES)} services × {n} videos")

    out = {
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "duration_s": round(time.time() - started, 1),
        "n_videos": n,
        "services": [n for n, _ in SERVICES],
        "service_stats": stats,
        "per_video": per_video,
        "attempts": [a.__dict__ for a in attempts],
    }
    out_file = OUT_DIR / "multi_service_eval.json"
    out_file.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nWrote {out_file}")


if __name__ == "__main__":
    main()
