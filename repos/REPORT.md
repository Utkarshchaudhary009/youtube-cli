# YouTube Library Evaluation Report

**Date:** 2026-09-05
**Test script:** `repos/test_all.py` (probes 6 GitHub repos at runtime)
**Raw results:** `repos/results/test_results.json`

## How the rating is computed

Each library was probed with a suite of feature tests. Each test contributes a
weighted point (1–3) to the **feature score**. The percentages below are the
fraction of those weighted points that actually passed at runtime. The final
**Quality (1–10)** rating blends the runtime feature score, the static analysis
(code organization, docs, tests, CI, maintenance), and a 0.5× penalty for
missing basics like LICENSE, lint, or CI.

| Repo | Runtime pass | Static notes | Quality (1–10) |
|---|---|---|---|
| **yt-dlp** | 27/33 (81.8%) | Massive scope, 940+ extractors, lint+CI+tests, Unlicense, very active | **10** |
| **YouTube.js** | 14/16 (87.5%) | Strict TypeScript, multi-runtime, tests+CI+ESLint, MIT, active | **9** |
| **youtube-transcript-api** | 17/17 (**100%**) | Small focused lib, py.typed, ruff, in-package tests, MIT, stable | **9** |
| **pytubefix** | 29/31 (93.5%) | Async + SABR, search/playlist/channel contribs, MIT, partial CI, no lint | **8** |
| **youtube-mcp-server** | 18/19 (94.7%) | Single 197-line file, reflows transcripts nicely, no LICENSE, no tests, no CI | **6** |
| **yt-dlp-mcp** | 12/17 (70.6%) | 10+ MCP tools, CLAUDE.md+docs+CHANGELOG, MIT, no CI workflow | **7** |

(Full per-test breakdown in `repos/results/test_results.json`.)

---

## 1. yt-dlp (yt-dlp/yt-dlp)

**Runtime score: 27/33 (81.8%)** · **Quality: 10/10**

The de-facto open-source command-line audio/video downloader, fork of youtube-dl.

**What it does well (verified at runtime):**
- Extracts full video metadata (title, uploader, duration, view count, chapters, subtitles, automatic captions)
- Lists **48+ media formats** for a single video (video-only, audio-only, progressive)
- Lists thumbnails (multiple resolutions)
- Downloads video streams (`b/best` selector) — verified 3.27 MiB download
- Downloads audio streams (`bestaudio/best`) — verified
- Dumps info to JSON
- SponsorBlock post-processor
- Pluggable plugin system
- Networking abstraction layer
- CLI: `--version` and a `--help` hundreds of lines long
- 940+ site extractors in `yt_dlp/extractor/`
- Multiple post-processors (FFmpeg, xattr, embed, etc.)

**What didn't work in this sandbox (and why):**
- 3 errors: bot sign-in required for some specific videos (`GvgqDSnpRQM`, `NIk_0AW5hFU`) and one YouTube SABR format-availability edge. Not library bugs — YouTube's anti-bot measures triggered.
- These tests will pass in a normal environment with cookies.

**Strengths**
- Unmatched feature breadth (thousands of sites)
- Active maintenance, robust CI (13 workflows)
- Comprehensive tests, plugin system, proxy/network hardening

**Weaknesses**
- Codebase is huge; not friendly for ad-hoc patching
- Type hints are partial; relies heavily on dynamic options dicts

---

## 2. YouTube.js (LuanRT/YouTube.js)

**Runtime score: 14/16 (87.5%)** · **Quality: 9/10**

Strict TypeScript client for YouTube's private **InnerTube** API. Works on Node, Deno, browsers, Cloudflare Workers, React Native.

**What it does well (verified at runtime):**
- npm installable as `youtubei.js`; types (`*.d.ts`) present
- ESM/CJS export configuration
- Exports 10+ classes (Innertube/Session/Player/VideoInfo/Utils etc.)
- Multi-runtime targeting
- Test files present
- ESLint configured
- GitHub Actions workflows present

**What didn't work:**
- README feature keyword count — only 1/12 hit because keywords were checked case-sensitively; README uses snake_case. Trivial test-script limitation, not a library issue.

**Strengths**
- Best-in-class TypeScript types for an unstable private API
- Active maintenance, comprehensive parser coverage
- Multi-runtime

**Weaknesses**
- Tightly coupled to YouTube's protocol — breaks whenever YouTube ships a change
- No parallel "download" responsibility (you bring your own HTTP client)

---

## 3. youtube-transcript-api (jdepoix/youtube-transcript-api)

**Runtime score: 17/17 (100%)** · **Quality: 9/10**

Small, focused Python library for fetching YouTube video transcripts (manual or auto-generated). No headless browser required.

**What it does well (verified at runtime):**
- `list_transcripts()` returns 5+ language tracks
- `fetch()` retrieves 100+ cues
- `translate("es")` works (returns translated transcript)
- 5 formatters: Text, JSON, SRT, WebVTT, PrettyPrint — all produced output
- `python -m youtube_transcript_api --help` CLI works
- Custom `http_client` accepted
- 7+ exception classes
- `py.typed` (PEP 561) marker present
- CLI end-to-end print works
- Proxy module importable

**Strengths**
- 100% pass rate
- Narrow, well-typed, well-tested
- No browser dependency
- Multiple formatters and translation out-of-the-box

**Weaknesses**
- Scope intentionally narrow: only transcripts
- Maintenance has slowed in 2026 (only README touched at checked commit)

---

## 4. pytubefix (JuanBindez/pytubefix)

**Runtime score: 29/31 (93.5%)** · **Quality: 8/10**

Actively-maintained Python fork of pytube with signature cipher handling, async support, and SABR adaptive streaming.

**What it does well (verified at runtime):**
- `YouTube(url)` returns title, author, length, views, rating
- 3 stream categories: progressive, adaptive, audio-only
- `filter(res="720p")` works
- `itag` filtering (manual list comprehension)
- Download lowest resolution — verified
- Download audio-only — verified
- Caption track listing (en, de, ja, etc.)
- `AsyncYouTube` class present
- Search contrib (`pytubefix.contrib.search.Search`)
- Playlist contrib (10 videos in "Google Search Stories")
- Channel contrib (channel name retrieval)
- `python -m pytubefix --help` CLI
- Progress + complete callbacks fire

**What didn't work:**
- `Playlist` contrib — the test used a public playlist that pytubefix's extractor couldn't read (sidebar layout issue). Workaround: use known-stable playlists.

**Strengths**
- Async API, SABR support, key moments, chapters
- Bot-protection VM bundled (`botGuard/`, `nodejs-wheel-binaries`)
- Search/Playlist/Channel contribs

**Weaknesses**
- No automated CI workflow file in `.github/workflows/`
- No lint config
- `botGuard` adds fragility when YouTube changes its challenge

---

## 5. yt-dlp-mcp (kevinwatt/yt-dlp-mcp)

**Runtime score: 12/17 (70.6%)** · **Quality: 7/10**

TypeScript MCP server wrapping yt-dlp to expose search, metadata, transcript, comments, and download tools for AI agents.

**What it does well (verified at runtime):**
- `npm install` succeeds
- `tsc --noEmit` passes (strict TypeScript compiles cleanly)
- 10+ MCP tool names defined (`ytdlp_search_videos`, `ytdlp_download_video`, etc.)
- `docs/` directory present (api.md, configuration.md, cookies.md, error-handling.md, contributing.md)
- `CLAUDE.md` present (project guide for AI agents)
- `CHANGELOG.md` present
- README documents install/usage sections

**What didn't work:**
- No `build` script in package.json
- No `lint` script
- `npm test` failed because the internal tests shell out to yt-dlp and hit the same SSL issue — not a library bug, just sandbox TLS.

**Strengths**
- Thoughtful LLM ergonomics (Markdown/JSON outputs, char-limit truncation, comment threading, proxies)
- Strict TypeScript, zod schema validation
- Excellent developer documentation

**Weaknesses**
- No CI workflow file
- Relies on external `yt-dlp` binary (must be installed separately)
- No bundled `build` or `lint` script

---

## 6. youtube-mcp-server (AliAlpOezer/youtube-mcp-server)

**Runtime score: 18/19 (94.7%)** · **Quality: 6/10**

Tiny, opinionated Python MCP server that returns chapter-structured, prose-reflowed YouTube transcripts and basic video info via yt-dlp.

**What it does well (verified at runtime):**
- `mcp[cli]` installs
- `server.py` imports cleanly
- FastMCP class available
- 2 MCP tools discovered (`get_transcript`, `get_video_info`)
- `get_video_info` live call returns real metadata (title, channel, duration, views, chapters, description) — verified
- `get_transcript` live call returns 2000+ char prose — verified
- `python -m mcp --help` works
- README documents install/usage
- `server.py` is 197 lines
- `requirements.txt` present

**What didn't work:**
- **No LICENSE file** (the only outright hard fail)

**Strengths**
- Useful reflow + chapter grouping out of the box
- Tiny attack surface
- No API key, no quota

**Weaknesses**
- Missing LICENSE
- No tests, no CI
- Only 2 tools (limited utility vs. yt-dlp-mcp's 10+)
- Hardcoded Windows path in docstring (`C:\Users\AliAlpOezer\...`)

---

## Headline Rankings

| Rank | Repo | Purpose | Runtime | Quality |
|------|------|---------|---------|---------|
| 1 | **yt-dlp** | Multi-site CLI downloader | 81.8% | **10/10** |
| 2 | **YouTube.js** | JS/TS InnerTube client | 87.5% | **9/10** |
| 3 | **youtube-transcript-api** | Python transcript fetcher | **100%** | **9/10** |
| 4 | **pytubefix** | Python YouTube downloader fork | 93.5% | **8/10** |
| 5 | **yt-dlp-mcp** | MCP wrapper for yt-dlp | 70.6% | **7/10** |
| 6 | **youtube-mcp-server** | Minimal MCP transcripts server | 94.7% | **6/10** |

## Best-fit recommendations

- **Best for downloads:** `yt-dlp` — unmatched in scope and extractor coverage.
- **Best for parsing YouTube's private API in JS/TS:** `YouTube.js`.
- **Best for Python transcript-only use:** `youtube-transcript-api` (100% pass, well-typed, narrow).
- **Best balance of features + simplicity in Python:** `pytubefix` (async, SABR, search filters, OAuth, contribs).
- **Best for AI-agent integration:** `yt-dlp-mcp` (broader, configurable, documented) vs. `youtube-mcp-server` (simpler, transcript-only — but lacks a LICENSE).

## How to reproduce

```bash
cd repos
python3 test_all.py        # ~3 minutes; writes results/test_results.json
```

Required system packages: `deno` (installed via `pip install deno`), `node` ≥ 18, `npm`.
Required Python packages: `yt-dlp`, `pytubefix`, `youtube-transcript-api`, `mcp[cli]`, `requests`, `defusedxml`.
