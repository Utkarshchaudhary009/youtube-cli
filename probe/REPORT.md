# Internal APIs of YouTube Transcription Websites

Discovered by static analysis (page HTML + JS bundles) and live probing with test video `dQw4w9WgXcQ`.
Scripts: `probe.mjs` (parallel crawler), `verify*.mjs` (endpoint tests), `deep.mjs` (bundle context grep).
Raw outputs: `probe_out.txt`, `probe2_out.txt`, `deep_out.txt`, `report.json`, `report2.json`.

## Status legend
- ✅ VERIFIED — responded with transcript data during testing
- 🟡 LIVE but gated — endpoint confirmed, requires cookie/token/signature
- 🔵 CONFIRMED-FROM-CODE — read from the site's own JS, not fully tested

---

## 1. kome.ai  ✅ VERIFIED (works with no auth)
- `POST https://kome.ai/api/transcript`  body: `{"video_id": "<full youtube url>", "format": true}` → `{"transcript": "..."}`
- Related internal: `POST /api/transcript/send`, `POST /api/user/status`, `POST /api/user`, `POST /api/auth`, `POST /api/extension/revoke`, `POST /api/transcript/checkout`, `POST /api/user/checkout`

## 2. you-tldr.com  ✅ VERIFIED
- `GET https://www.you-tldr.com/api/default-transcript?videoId=<id>` → `{"response":[{start,duration,text},...]}` (serves demo/cached data; ignores unknown ids)
- `POST /api/ingestions` — real per-video processing (Pro-gated)
- `GET /api/transcript-jobs/<id>/payload`, `GET /api/recent-activity/<id>/payload`, `POST /api/summarize-full`, `GET /api/me`, `POST /api/broadcast`
- Per-video transcripts also server-rendered at `/transcript/<videoId>` (public HTML)

## 3. youtubetranscript.com  ✅ VERIFIED (endpoint live, upstream blocked)
- `GET https://youtubetranscript.com/?server_vid2=<videoId>` → XML `<transcript><text start=... dur=...>...</text></transcript>`
- Page also proxies `https://video.google.com/timedtext?type=track&v=<id>&lang=en`

## 4. downsub.com  🟡 LIVE, needs their encryption step
- `POST https://get-info.downsub.com/` body `{url, data: <urlEncrypt-encoded url>}` — app computes `data` via internal `$encode(urlEncrypt, url)`; plain requests get `{"error":"Video ID is required"}`
- Alternate backends in code: `https://get.downsub.com/` (VUE_APP_API_URL), `https://subtitle.downsub.com/` (download builder)
- Download builder: `https://subtitle.downsub.com/{srt|vtt|txt}/{...}?url=<track url>&type=vtt|txt|raw&defaultLanguage=<code>`
- Pro features go to `member.downsub.com` with API key

## 5. transcriptube.com  🔵 CONFIRMED-FROM-CODE
- `POST https://transcriptube.com/api/transcript` body `{videoId, platform: "yt" | "sf"}` `credentials:"same-origin"` (server replied with structured error `bad_link` to my test — likely session/cookie dependent)
- Follow-up endpoints in same bundle: AI summary call (`/api/pr...` truncated) and transcript file download with `filename` (`transcript_<id>.srt/.txt`), free-tier download flag `freeDownload`

## 6. anthiago.com  🔵 CONFIRMED-FROM-CODE (origin returned 522 during test)
- `GET https://www.anthiago.com/<apiEndPoint>?get_video=<url>&codeL=<lang>&status=<0|1>` with `credentials: include`
- `apiEndPoint` ∈ `transcript | desgrabador | transkrip | trascrittore | transcripteur` (language variants)
- Counter endpoint: `GET <base>/count-desgrabador`
- Frontend: `_astro/Desgrabador.B090jstw.js` (Astro/Svelte)

## 7. notegpt.io  🟡 LIVE, login required
- `GET https://notegpt.io/api/v2/video-transcript?platform=youtube&video_id=<id>` → `{"code":164003,"message":"login expired"}` without cookie
- ~30 more internal v2 endpoints in bundle: `/api/v2/ai-chat`, `/api/v2/ai-chat/details`, `/api/v2/share`, `/api/v2/share/details`, `/api/v2/share-link`, `/api/v2/notes/*` (add-video, add-video-notes, list-notes, list-notes-v2, get-video-by-id, update, delete-note, move-note, folders CRUD), `/api/v2/plan-quota`, `/api/v2/user/quota-usage`, `/api/v2/payments/*`, `/api/v1/userinfo`, `/api/v1/ai-tab/get-prod-config`, `/api/_nuxt_icon`

## 8. youtube-transcript.io  🟡 LIVE, token + bot check
- `POST https://www.youtube-transcript.io/api/transcripts` body `{"ids":["<videoId>",...]}` → 401 without token
- `POST /api/transcripts/v2` (second version), plus `/api/stripe/recentSubscriptions`
- Declared in page HTML: `window.pRoutes = [{"path":"/api/transcripts","method":"POST"},{"path":"/api/transcripts/v2","method":"POST"}]` + bot-detection bootstrap script

## 9. tactiq.io  🟡 LIVE, Firebase App Check
- `POST https://tactiq-apps-prod.tactiq.io/transcript` body `{"videoUrl":"https://www.youtube.com/watch?v=<id>","langCode":"en"}` → 401 "Missing App Check token" (integrity token minted client-side via Firebase)

## 10. transcriptapi.com / tubetotext.com (same engine)  🟡 API-key service, fully documented in page
- `GET https://transcriptapi.com/api/v2/youtube/transcript?video_url=<id|url>&format=json`
- `GET .../api/v2/youtube/search?q=<q>&type=video&limit=5`
- `GET .../api/v2/youtube/channel/search?channel=@TED&q=AI&limit=10`
- `GET .../api/v2/youtube/channel/videos?channel=@TED`
- `GET .../api/v2/youtube/channel/latest?channel=@TED`
- `GET .../api/v2/youtube/playlist/videos?playlist=<id>`
- `https://transcriptapi.com/mcp` (Model Context Protocol server)
- `tubetotext.com/api/v2/youtube/transcript?video_url=<id>&format=json` → 401 `{"error":"missing API key"}`

## 11. tubeonai.com  🔵 CONFIRMED-FROM-CODE (WP plugin + app)
- `POST https://app.tubeonai.com/api/summarize` body `{video_url}` (500 on unauthenticated test)
- `GET https://app.tubeonai.com/api/translate/<lang>`
- `POST https://web.tubeonai.com/api/text-to-pdf`

## 12. youtubetotranscript.com  🟡 Cloudflare-gated
- `GET https://youtubetotranscript.com/transcript?youtube_url=<url>` (server-rendered transcript page; 403 "Just a moment" to curl)
- `POST /api/content/note`
- Sister product: transcriptapi.com (see #10)

## 13. summarize.tech  🟡 deployment paused at test time
- `GET https://www.summarize.tech/www.youtube.com/watch?v=<id>` → server-rendered AI summary (503 DEPLOYMENT_PAUSED now)

## 14. filmot.com  🟡 key-required subtitle search API
- `GET https://filmot.com/api/getvideos?id=<id>` → 401 without key
- Site search uses csrf-token protected forms

## 15. recapio.com  🔵 Next.js app, API calls live in lazy chunks (not in first 30 bundles) — not extracted

## From handover file (`youtube_transcript_handover_summary.md`) — re-verified 2026-09-06
- ✅ **yttools.co** — `GET https://yttools.co/api/transcript?url=<full url>&lang=<opt>` → JSON `{transcript:[{text,duration,offset,lang}], videoId}`. No auth. Working.
- ✅ **youtube-transcript.ai** — `GET /api/subtitles?v=<id>` → video metadata + caption track list with `vttUrl`/`json3Url`; `GET /transcript/<id>.txt?lang=<code>` → clean markdown transcript. No auth. Both working.
- ✅ **yttranscript.ai** — `POST /api/transcript` `{videoId}` → `{transcript[], fullText, videoTitle, availableLangs}`. Working; ~3 free requests/month per client.
- 🟡 **supadata.ai** — `GET https://api.supadata.ai/v1/youtube/transcript?url=` with `x-api-key` (100 free/month; Whisper fallback). 401 without key.
- ⚠️ **Invidious instances** — `GET {instance}/api/v1/captions/{videoId}?lang=` — at re-test both `yewtu.be` and `invidious.nerdvpn.de` returned bot-check/app HTML instead of JSON. Instance availability rotates; treat as unstable.
- ❌ **ytranscript.com** `POST /api/transcript` → 405 (method/shape changed since handover); handover noted Turnstile protection.
- Note: handover's claim that kome.ai is 404 conflicts with this report — kome works when called with `origin: https://kome.ai` and the full watch URL in `video_id`.

## Others found but blocked/empty
- eightify.app, glasp.co, turboscribe.ai → Cloudflare 403 to non-browser clients
- savesubs.com → heavily obfuscated bundle, endpoints not extracted statically
- ytscribe.org → DNS/TLS failure

---

## How these were found (method)
1. Parallel crawl of ~25 tool pages (Node, `Promise` pool of 12) collecting HTML.
2. Extract `<script src>` + string-referenced `.js` bundles; download all (~370 bundles).
3. Regex over HTML/JS: absolute URLs, `"/api..."` strings, `fetch(...)` / `axios...` call sites, `window.pRoutes`, `VUE_APP_*` env config, `apiEndPoint` patterns.
4. Live-fire each candidate with a real video id and record status/snippet.

## Better methods (recommended next steps)
- **DevTools network capture** (browseros/chrome-devtools skill): load each site, filter XHR/Fetch — this gives exact headers, tokens (App Check JWTs, downsub's `urlEncrypt` scheme), cookies. Static analysis cannot get these.
- **GitHub search** for `"<service> api"` — downsub/tactiq/anthiago scrapers exist publicly with working token logic.
- Check `/robots.txt`, `/openapi.json`, `/swagger`, `/docs` — transcriptapi.com openly documents its whole API.
- Next.js sites: read `window.__next_f` flight data; Nuxt sites: `_payload.json` (NoteGPT's SSR payload contains pre-rendered data).
- Gate notes: Firebase App Check (tactiq) and downsub's encrypted payload are the two hard ones; cookie-based gates (NoteGPT) just need a logged-in session cookie.
