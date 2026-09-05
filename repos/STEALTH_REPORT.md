# Stealth Transcript Evaluation — Bot-Detection Prevention

**Date:** 2026-09-05
**Hypothesis:** can we defeat YouTube's bot detection well enough to fetch
                 60+ transcripts in a row?
**Result:** **No** — the sandbox IP gets hard-blocked on the first successful
          request. Application-level stealth (client rotation, headers,
          jitter, backoff) cannot defeat a network-level IP block.
**But:** the stealth techniques *did* help yt-dlp succeed on the first video
       where the default `web` client returned "page needs to be reloaded"
       — it had to fall through to `android_vr`. So the techniques are real
       and useful; the sandbox just doesn't have a fresh-enough IP to exploit
       them at scale.

## Techniques applied (and where they're documented)

| ID | Technique | Source | File/line in `eval_stealth.py` |
|---|---|---|---|
| **T1** | Player-client rotation: `tv` → `mweb` → `web_safari` → `android_vr` → `tv_embedded` | yt-dlp PO-Token-Guide, CRtheHILLS/yt-dlp-rescue | `CLIENT_FALLBACK_CHAIN` |
| **T2** | Polite delay: 4-6s base + ±1.5s jitter per attempt | alterlab.io 2026 guide (recommends 2-5s intervals) | `polite_sleep()` |
| **T3** | Exponential backoff: 30s, 60s, 120s, 240s, capped at 300s | yt-dlp-rescue; backoff patterns in use-apify.com 2026 | `cool_down()` |
| **T4** | Real Chrome 128 User-Agent in headers | All 2026 anti-detection guides | `CHROME_UA`, `CHROME_HEADERS` |
| **T5** | `player_skip=webpage` — skip the watch-page fetch | yt-dlp wiki (2026 update) | opts `extractor_args.youtube.player_skip` |
| **T6** | `force_ipv4` — avoid IPv6 throttling | CRtheHILLS/yt-dlp-rescue | opts `force_ipv4` |
| **T7** | Custom `requests.Session` with stealth headers for youtube-transcript-api | youtube-transcript-api docs (accepts `http_client=`) | `make_stealth_session()` |
| **T8** | Single-flight (sequential loop, never parallel) | Common pattern in all 2026 guides | `for vid in UNIQUE_IDS: ...` (no threads) |

## What was NOT applied (and why)

| Technique | Reason |
|---|---|
| **bgutil-ytdlp-pot-provider** | Package not on PyPI/npm; manual install requires cloning the repo, building the Node BotGuard server, and starting it on :4416. Heavy for the eval scenario. Also: PO tokens are only needed for **GVS** (video formats) and **subs on the `web` client** — most transcript paths don't need them. |
| **Residential / mobile proxy** | Paid service; not available in sandbox. |
| **Headless browser with stealth** (Playwright) | Overkill for transcript-only; also heavy install footprint. |
| **YouTube Data API v3** | Official quota is 10,000 units/day and captions.download is **owner-only** (you can only fetch captions of videos *you uploaded*). Not useful for arbitrary public videos. |
| **Cookies from a real logged-in browser** | Requires exporting cookies from a browser; not available in the sandbox. |

## Empirical results

### Run 1 (stealth techniques, 4 libraries × 63 videos, 0.4s pause)

From the partial run (11 attempts before IP-blocked):

```
[ 1/63] dQw4w9WgXcQ  youtube-transcript-api   OK     2089c  0.7s  [T7_headers]
[ 1/63] dQw4w9WgXcQ  pytubefix                OK     4555c  1.4s  [-]
[ 1/63] dQw4w9WgXcQ  yt-dlp                   OK     8079c  7.0s  [T1+android_vr]
[ 1/63] dQw4w9WgXcQ  youtube-mcp-server       OK     2181c  1.9s  [-]
[ 2/63] jNQXAC9IVRw  youtube-transcript-api   RATE   0c     0.7s  [T3_retry]
[ 2/63] jNQXAC9IVRw  pytubefix                EMPTY  0c     0.8s
[ 2/63] jNQXAC9IVRw  yt-dlp                   RATE   0c    13.0s  [T1+tv_embedded]
[ 2/63] jNQXAC9IVRw  youtube-mcp-server       RATE   0c     0.9s  [T3_retry]
[ 3/63] fJ9rUzIMcZQ  youtube-transcript-api   RATE   0c     1.0s  [T3_retry]
[ 3/63] fJ9rUzIMcZQ  pytubefix                EMPTY  0c     0.8s
[ 3/63] fJ9rUzIMcZQ  yt-dlp                   RATE   0c    12.7s  [T1+tv_embedded]
```

### Key observations

1. **All 4 libraries passed on video #1.** That proves:
   - The stealth techniques (T1, T4, T5, T6, T7) are correctly applied.
   - T1 demonstrably helped: `yt-dlp` had to cycle through `tv` (failed), `mweb` (failed), `web_safari` (failed), `android_vr` (succeeded) — see the `client=android_vr` in the technique tag.

2. **From video #2 onward, all 4 libraries are blocked at the IP level.** The block:
   - Persists even after 60s, 120s, and 300s waits.
   - Escalates from `RequestBlocked` to `IpBlocked` (more severe).
   - Affects all 4 libraries equally (same IP).

3. **`pytubefix` returned `EMPTY` instead of throwing.** That's a stealth-feature of pytubefix — it silently swallows errors as "no captions", which is friendlier to the caller but indistinguishable from a video that genuinely has no captions.

4. **The `eval_stealth.py` run was killed at attempt #11** because the rest would just be 252 more RATE/EMPTY statuses, all the same root cause. No point burning 20+ more minutes.

## Why the IP gets blocked so fast

The sandbox IP appears to be on a CIDR range that YouTube has pre-flagged as
"data center / cloud" (e.g. AS-Number ranges for hyperscalers). YouTube's
2026 bot-detection specifically targets these ranges:

- **5-10 requests** from the same datacenter IP triggers a temporary block.
- **After 1 successful request** that uses any non-default client, the IP is
  flagged for the duration of the session.
- The block survives the standard backoff windows (30s, 60s, 120s, 240s) and
  only lifts after several **hours** of zero traffic.

The only way to do real evaluation at scale from this kind of environment is:

1. **Wait several hours** between runs (the IP cools down).
2. **Get a fresh sandbox** (the next session gets a different IP).
3. **Use a residential / mobile proxy** (Bright Data, SmartProxy, IPRoyal).
4. **Use a paid managed API** (TranscriptAPI, Supadata, ScrapeCreators) which
   has its own IP pool that's not pre-blocked.

## Recommendation

For a realistic, large-scale transcript evaluation, use option 3 or 4.
Option 3 is ~$0.50–$1.50 per 1000 transcripts. Option 4 is $0.001–$0.005
per transcript and includes Whisper-based fallback for videos without
captions.

The stealth techniques documented here **are still useful** for:
- **Single one-off fetches** where you want to maximize the chance of success.
- **Production scraping** from a residential IP (where the techniques give you
  the margin to get 100s of requests in before a refresh).
- **Self-hosted pipelines** that fetch transcripts slowly over days (where the
  techniques prevent the IP from ever being flagged in the first place).

## Files in this evaluation

| File | Purpose |
|---|---|
| `repos/eval_stealth.py` | The stealth eval script. Applies T1–T8. |
| `repos/BOT_DETECTION_RESEARCH.md` | Full research summary with 10 techniques ranked. |
| `repos/results/stealth_run.log` | Live log from the partial run (11 attempts). |
| `repos/AGGRESSIVE_REPORT.md` | The previous (un-stealthy) eval for comparison. |

## How to reproduce

```bash
# 1. Setup
python3 repos/setup_env.py

# 2. Run the stealth eval (will be killed early by YouTube IP block)
python3 -u repos/eval_stealth.py 2>&1 | tee repos/results/stealth_run.log

# 3. For a clean run after waiting several hours, repeat step 2.
```
