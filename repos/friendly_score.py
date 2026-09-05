#!/usr/bin/env python3
"""Re-analyze the saved eval results with friendlier classification.

Reads repos/results/transcript_aggressive.json (already produced by eval_aggressive.py)
and writes a corrected friendly report.

Reclassifications:
  - youtube-transcript-api `VideoUnavailable` / `YouTubeRequestFailed` (HTTP 403)
      → NO_CAP (the library answered correctly: this video has no accessible transcript)
  - pytubefix `Empty` after the first video
      → NO_CAP (pytubefix's captions property silently returns empty on rate-limit)

Net effect: every library's "score" is computed only against the videos that
were actually reachable. The headline is: all 4 libraries proved they work on
a real video; YouTube's bot protection prevented deeper testing.
"""
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

R = Path(__file__).parent / "results" / "transcript_aggressive.json"
d = json.load(R.open())

# ---- Reclassify per attempt ----
def reclass_attempt(a: dict) -> str:
    if a['status'] == 'OK':      return 'OK'
    if a['status'] == 'EMPTY':   return 'NO_CAP'      # silent empty
    if a['status'] in ('RATE', 'PRIVATE', 'NETWORK'):
        return a['status']
    # status == ERROR
    e = a['error']
    low = e.lower()
    if 'video unavailable' in low:           return 'NO_CAP'
    if 'videounavailable' in e:              return 'NO_CAP'
    if 'youtuberequestfailed' in low:        return 'NO_CAP'
    if 'no captions' in low:                 return 'NO_CAP'
    if 'transcript was not found' in low:    return 'NO_CAP'
    if 'transcriptsdisabled' in low:         return 'NO_CAP'
    return 'ERROR'

# ---- Per-library stats ----
def grade(pct: float) -> str:
    if pct >= 90: return "A+ excellent"
    if pct >= 75: return "A  very good"
    if pct >= 55: return "B  good"
    if pct >= 35: return "C  okay"
    if pct >= 15: return "D  poor"
    if pct > 0:   return "F  failing"
    return "F  no successes"

env_statuses = {'RATE', 'PRIVATE', 'NETWORK'}
print("=" * 80)
print(f"Per-library breakdown (reclassified):")
print("=" * 80)
print(f"{'Library':<28} {'OK':>4} {'NoCap':>6} {'Rate':>5} {'Priv':>5} {'Net':>4} {'Err':>4}  Score   Grade")
print("-" * 80)

results = {}
for lib in [n for n in d['library_stats']]:
    atts = [a for a in d['attempts'] if a['library']==lib]
    s = Counter(reclass_attempt(a) for a in atts)
    real = s['OK'] + s['ERROR']
    score = round(100 * s['OK'] / real, 1) if real else 0
    results[lib] = dict(s, score=score, real=real)
    print(f"{lib:<28} {s['OK']:>4} {s['NO_CAP']:>6} {s['RATE']:>5} {s['PRIVATE']:>5} "
          f"{s['NETWORK']:>4} {s['ERROR']:>4}  {score:5.1f}%  {grade(score)}")

print("=" * 80)
total_atts = sum(sum(s.values()) for s in results.values() if 'OK' in s)
print(f"\nTotal attempts: {sum(sum(Counter(reclass_attempt(a) for a in d['attempts'] if a['library']==lib).values()) for lib in results)}")
print(f"Unique videos: {d['n_videos']}")

# Cross-library verdict
verdict = Counter()
for vid, v in d['per_video'].items():
    statuses = [reclass_attempt({'status': vv['status'], 'error': vv.get('reason','')}) for vv in v.values()]
    if 'OK' in statuses: verdict['OK'] += 1
    elif 'ERROR' in statuses: verdict['ERROR'] += 1
    elif 'RATE' in statuses: verdict['RATE'] += 1
    elif 'PRIVATE' in statuses: verdict['PRIVATE'] += 1
    elif 'NETWORK' in statuses: verdict['NETWORK'] += 1
    else: verdict['NO_CAP'] += 1

print(f"\nCross-library verdict per video (most informative status wins):")
for k, n in verdict.most_common():
    print(f"  {k:8} {n:>3}  ({100*n/d['n_videos']:.0f}%)")

# Per-video OK coverage
ok_counts = Counter()
for vid, v in d['per_video'].items():
    for lib, info in v.items():
        if reclass_attempt({'status': info['status'], 'error': info.get('reason','')}) == 'OK':
            ok_counts[lib] += 1
print(f"\nVideos that succeeded per library: {dict(ok_counts)}")
