import { PROVIDER_TIMEOUT_MS, watchUrl } from "./http.ts";
import { collapse, parseJson3, parseVtt } from "./parse.ts";
import type { ProviderFetch, TranscriptProvider, TranscriptSegment } from "./types.ts";

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function normalizeSegments(raw: Array<{ text?: unknown; offset?: unknown; duration?: unknown }>): TranscriptSegment[] {
  return raw
    .map((t) => ({
      text: collapse(String(t.text ?? "")),
      offset: Number(t.offset) || 0,
      duration: Number(t.duration) || 0,
    }))
    .filter((t) => t.text.length > 0);
}

/** Provider 1: yttools.co undocumented GET API. */
export function yttoolsProvider(fetchImpl: FetchImpl = fetch): TranscriptProvider {
  return {
    name: "yttools",
    async fetch(videoId, lang) {
      const url = `https://yttools.co/api/transcript?url=${encodeURIComponent(watchUrl(videoId))}&lang=${encodeURIComponent(lang)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        transcript?: Array<{ text?: unknown; offset?: unknown; duration?: unknown; lang?: unknown }>;
      };
      if (!Array.isArray(data.transcript) || data.transcript.length === 0) throw new Error("no transcript in response");
      // yttools silently ignores an unsupported lang; if the cues report a
      // different language, fail so the waterfall can try a provider that
      // actually selects tracks.
      const cue = data.transcript.find((t) => t.lang != null);
      const servedLang = cue ? String(cue.lang) : undefined;
      if (servedLang && !servedLang.toLowerCase().startsWith(lang.toLowerCase())) {
        throw new Error(`lang mismatch (requested ${lang}, got ${servedLang})`);
      }
      return { segments: normalizeSegments(data.transcript), lang: servedLang };
    },
  };
}

/** Provider 2: youtube-transcript.ai subtitle track API (VTT/json3). */
export function ytaProvider(fetchImpl: FetchImpl = fetch): TranscriptProvider {
  return {
    name: "youtube-transcript.ai",
    async fetch(videoId, lang) {
      const res = await fetchImpl(`https://youtube-transcript.ai/api/subtitles?v=${encodeURIComponent(videoId)}`, {
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        subtitles?: Array<{ langCode?: string; vttContent?: string; vttUrl?: string; json3Url?: string }>;
      };
      const tracks = Array.isArray(data.subtitles) ? data.subtitles : [];
      if (tracks.length === 0) throw new Error("no caption tracks in response");
      const track = tracks.find((t) => (t.langCode ?? "").toLowerCase().startsWith(lang.toLowerCase())) ?? tracks[0]!;

      let segments: TranscriptSegment[];
      if (track.vttContent) {
        segments = parseVtt(track.vttContent);
      } else if (track.json3Url) {
        const json3Res = await fetchImpl(track.json3Url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
        if (!json3Res.ok) throw new Error(`HTTP ${json3Res.status} fetching json3 track`);
        segments = parseJson3(await json3Res.text());
      } else if (track.vttUrl) {
        const vttRes = await fetchImpl(track.vttUrl, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
        if (!vttRes.ok) throw new Error(`HTTP ${vttRes.status} fetching vtt track`);
        segments = parseVtt(await vttRes.text());
      } else {
        throw new Error("caption track has no content");
      }
      return { segments, lang: track.langCode };
    },
  };
}

/** Provider 3: kome.ai POST API — plain text only (no timestamps). */
export function komeProvider(fetchImpl: FetchImpl = fetch): TranscriptProvider {
  return {
    name: "kome",
    async fetch(videoId) {
      const res = await fetchImpl("https://kome.ai/api/transcript", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://kome.ai" },
        body: JSON.stringify({ video_id: watchUrl(videoId), format: true }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { transcript?: unknown };
      const text = collapse(String(data.transcript ?? ""));
      // kome answers HTTP 200 with an apology sentence when a video has no
      // transcript; that must not be mistaken for transcript content.
      if (!text) throw new Error("no transcript in response");
      if (/transcripts?\s+(are|is|were)\s+not\s+available|transcripts?\s+aren'?t\s+available|no\s+transcript\s+available|unable\s+to\s+retrieve/i.test(text)) {
        throw new Error("video has no transcript (provider apology)");
      }
      return { segments: [{ text, offset: 0, duration: 0 }] };
    },
  };
}

/**
 * Provider 4: supadata.ai documented API (100 free requests/month, Whisper
 * AI fallback for caption-less videos). Only used when SUPADATA_API_KEY is
 * set; otherwise the provider reports itself unavailable.
 */
export function supadataProvider(fetchImpl: FetchImpl = fetch, apiKey = process.env["SUPADATA_API_KEY"]): TranscriptProvider {
  return {
    name: "supadata",
    async fetch(videoId, lang) {
      if (!apiKey) throw new Error("SUPADATA_API_KEY not set (skipped)");
      const url =
        `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(watchUrl(videoId))}` +
        (lang ? `&lang=${encodeURIComponent(lang)}` : "");
      const res = await fetchImpl(url, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        content?: string;
        lang?: string;
        transcriptWithTimestamps?: Array<{ text?: string; offset?: number; duration?: number }>;
      };
      const timed = Array.isArray(data.transcriptWithTimestamps) ? data.transcriptWithTimestamps : [];
      if (timed.length > 0) {
        const segments = normalizeSegments(timed);
        if (segments.length === 0) throw new Error("empty transcript");
        return { segments, lang: data.lang };
      }
      const text = collapse(String(data.content ?? ""));
      if (!text) throw new Error("no transcript in response");
      return { segments: [{ text, offset: 0, duration: 0 }], lang: data.lang };
    },
  };
}

export function defaultProviders(): TranscriptProvider[] {
  return [yttoolsProvider(), ytaProvider(), komeProvider(), supadataProvider()];
}
