# youtube-cli — Implementation Plan

Single source of truth for implementation. One phase per feature; each phase is independently implementable and verifiable. Runtime: **Bun** (TypeScript). YouTube connectivity: **`youtubei.js`** (npm). Reference clone for API docs only: `reference/youtube.js` (never imported, never committed).

## Conventions (all phases)

- Binary name: `yt`. All commands accept `--json` for deterministic machine-readable output.
- Output rules: humans get clean, scannable tables/sections; `--json` gets stable, minimal schemas. No decoration in JSON mode. Progress/spinners only on stderr.
- Input: every video-taking command accepts a raw video ID or any YouTube URL form (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`); parsing lives in one shared util.
- Errors: one line, actionable (`No transcript available for this video (no captions found). Tried: yttools, yta-transcript.ai, kome, youtubei`). Exit code 1. `--json` errors are `{"error": {"code": ..., "message": ...}}`.
- Exit codes: 0 success, 1 failure, 2 usage error.
- Network calls: 15s timeout per provider; providers fail fast and independently.

## Phase 0 — Foundation (scaffold)

Deliverables:

- Bun project: `package.json` (bin: `yt`, entry `src/main.ts`), `tsconfig.json`, `.gitignore` (includes `reference/`), `README.md` stub.
- `src/lib/args.ts` — tiny argument parser (positional args + `--flag`, `--flag value`, boolean `--no-x`); no heavyweight framework.
- `src/lib/output.ts` — `printJson()` and human formatters (table/section helpers).
- `src/lib/errors.ts` — `CliError { code, message }` + top-level catch that formats per output mode.
- `src/lib/video-id.ts` — `parseVideoId(input): string | null` and `parsePlaylistId(input)` covering all URL forms.
- `src/main.ts` — command registry + `yt --help` / `yt --version`.
- Tests for args parser, video-id parser, output, error formatting (`bun test`).

## Phase 1 — `yt transcript <url|id>` (core feature)

Provider waterfall (verified in `probe/REPORT.md`, re-tested 2026-09-06). Each provider normalizes to the shared schema; first success wins; every failure is reported to stderr with `--verbose`.

1. `yttools.co` — `GET /api/transcript?url=<watch url>&lang=<lang>` → `{transcript: [{text, offset(ms), duration(ms), lang}]}`. A reported-language mismatch with `--lang` counts as failure (falls through).
2. `youtube-transcript.ai` — `GET /api/subtitles?v=<id>` → caption tracks with `vttContent`/`vttUrl`/`json3Url` (parse VTT/json3). Selects the requested language track, else the first available.
3. `kome.ai` — `POST /api/transcript` `{video_id: <full url>, format: true}` with `origin: https://kome.ai` → `{transcript: "<plain text>"}` (no timestamps; offset/duration zero). Its "transcripts aren't available" apology responses must be rejected, not emitted as content.
4. `supadata.ai` (optional) — `GET /v1/youtube/transcript?url=...` with `x-api-key` from `SUPADATA_API_KEY`; Whisper AI fallback for caption-less videos. Skipped when the key is unset.

Note: a native InnerTube provider (youtubei.js `getTranscript()`) was evaluated and **dropped**: the `/youtubei/v1/get_transcript` endpoint is gated and returns HTTP 400 from server IPs (verified 2026-09-06; upstream issue LuanRT/YouTube.js#1099), and direct `timedtext` fetches return empty bodies. If upstream fixes it, it can be added back as a provider.

CLI surface:

- `yt transcript <url|id> [--lang <code>] [--json] [--plain] [--out <file>] [--last <n>] [--verbose]`
- Default human output: timestamped lines `[m:ss] text` (group consecutive cues into readable lines).
- Language is best-effort: `--lang` is passed to providers that support track selection; when the requested language is unavailable, the first available track is returned instead of failing. Providers that report the served track's language override the requested value in output.
- `--plain`: no timestamps, deduplicated text (good for LLM ingestion).
- `--verbose`: provider failure reasons on stderr (useful for debugging the waterfall).
- JSON: `{"videoId", "lang", "provider", "segments": [{"text", "offset" (ms), "duration" (ms)}], "fullText"}`.
- `--last n`: only the final n seconds of the video (offset ≥ duration - n). Providers without timestamps (plain-text) return the full text regardless.
- Module: `src/transcript/` — `providers.ts` (one factory per provider), `parse.ts` (VTT/json3/dedupe), `waterfall.ts`, `types.ts`, `http.ts`. All providers implement `interface TranscriptProvider`.

Tests: VTT/json3 parsing, provider response normalization (fixture files), waterfall ordering & fallback on failure, CLI flag handling. E2E: run against a known captioned video (`dQw4w9WgXcQ`) and a video with no captions.

## Phase 2 — `yt video <url|id>`

Metadata via `youtubei.js` `getInfo()`: title, channel (+id, handle, subscribers), duration, view count, likes (if present), upload date, description, keywords, chapters, thumbnails, live/shorts flags, category. Native caption track list (languages, auto-generated?) — complements Phase 1 without fetching transcript bodies.

- `yt video <url|id> [--json] [--no-desc]`
- Human output: header block (title, channel, stats) + optional description.
- JSON: flat object with stable field names.

## Phase 3 — `yt search <query>`

Via `youtubei.js` `search()` (`Search` feed) + `getSearchSuggestions()`.

- `yt search <query> [--type video|channel|playlist|movie] [--order relevance|date|views|rating] [--duration short|long] [--limit n] [--json] [--continue]`
- Default limit 10; `--continue` fetches next page for the last query (continuation token cached in memory for the session).
- JSON: `{"query", "items": [{"type", "videoId"/"channelId"/"playlistId", "title", "channel", "duration", "views", "published"}]}`.

## Phase 4 — `yt comments <url|id>`

Via `getComments()` (`Comments` feed).

- `yt comments <url|id> [--limit n] [--sort top|newest] [--replies] [--author <name>] [--json]`
- JSON per comment: `{"id", "author", "authorId", "text", "likes", "published", "replyCount", "replies": [...]}`.
- Human: compact `author · likes · time` + text, replies indented.

## Phase 5 — `yt playlist` and `yt channel`

- `yt playlist <id|url> [--limit n] [--json]` — title, owner, video count, items (videoId, title, duration) via `getPlaylist()`.
- `yt channel <handle|url|id> [--tab videos|shorts|streams|about] [--limit n] [--json]` — channel info + latest items via `getChannel()`.

## Phase 6 — `yt related <url|id>` and `yt suggest <query>`

- `yt related <url|id> [--limit n] [--json]` — watch-next feed from `getInfo()`.
- `yt suggest <query> [--json]` — search autocomplete via `getSearchSuggestions()`.

## Phase 7 — `yt music <subcommand>`

YouTube Music via the `Music2` sub-client: `yt music search <q> [--filter songs|videos|albums|artists|playlists]`, `yt music album <id>`, `yt music artist <id>`, `yt music playlist <id>`.

## Phase 8 — `yt formats` / `yt download <url|id>`

- `yt formats <url|id> [--json]` — combined + adaptive formats (itag, container, quality, bitrate, fps, size) via `getStreamingData()`.
- `yt download <url|id> [--quality 1080p|720p|best] [--audio-only] [--out <file>]` — stream via `download()` with progress on stderr.

## Phase 9 — Auth & signed-in features

- `yt auth login` (OAuth device flow via `OAuth2`), `yt auth status`, `yt auth logout`. Tokens cached in OS user config dir.
- Unlocks: `yt history`, `yt subscriptions`, `yt notifications`, `yt playlists` (own, editable via `PlaylistManager`), like/subscribe via `InteractionManager`.

## Phase 10 — `yt chat <url|id>` (live)

Live chat stream via `LiveChat`: `yt chat <url|id> [--duration 30s] [--author <name>] [--json]` — prints chat events as they arrive; `--json` emits one event per line (NDJSON).

## Phase 11 — `yt shorts` / `yt hashtag`

- `yt shorts <url|id>` — shorts metadata via `getShortsVideoInfo()`.
- `yt hashtag <tag> [--limit n]` — feed via `getHashtag()`.

## Phase order & rule

Phases are sequential but independently shippable. Per AGENT.md: update this plan first when requirements change → implement → tests → review agent → e2e → branch + PR → bot review.
