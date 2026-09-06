import { describe, expect, test } from "bun:test";
import { komeProvider, supadataProvider, ytaProvider, yttoolsProvider } from "../src/transcript/providers.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("yttools provider", () => {
  test("normalizes transcript array", async () => {
    let requested = "";
    const provider = yttoolsProvider((async (url: any) => {
      requested = url;
      return jsonResponse({
        transcript: [
          { text: "  hello ", offset: 430, duration: 2120, lang: "en" },
          { text: "   ", offset: 100, duration: 50 },
        ],
        videoId: "dQw4w9WgXcQ",
      });
    }));
    const { segments, lang } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([{ text: "hello", offset: 430, duration: 2120 }]);
    expect(lang).toBe("en");
    expect(requested).toContain("https://yttools.co/api/transcript?url=");
    expect(requested).toContain(encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  });

  test("HTTP failure throws", async () => {
    const provider = yttoolsProvider((async () => new Response("nope", { status: 503 })));
    expect(provider.fetch("dQw4w9WgXcQ", "en")).rejects.toThrow("HTTP 503");
  });

  test("reports lang mismatch as failure so waterfall can continue", async () => {
    const provider = yttoolsProvider((async () =>
      jsonResponse({
        transcript: [{ text: "hello", offset: 0, duration: 10, lang: "en" }],
      })));
    expect(provider.fetch("dQw4w9WgXcQ", "es")).rejects.toThrow("lang mismatch");
  });

  test("accepts requested lang when cues report a matching variant", async () => {
    const provider = yttoolsProvider((async () =>
      jsonResponse({
        transcript: [{ text: "hola", offset: 0, duration: 10, lang: "es-419" }],
      })));
    const { segments, lang } = await provider.fetch("dQw4w9WgXcQ", "es");
    expect(segments).toEqual([{ text: "hola", offset: 0, duration: 10 }]);
    expect(lang).toBe("es-419");
  });
});

describe("youtube-transcript.ai provider", () => {
  test("prefers requested lang, parses vttContent, reports langCode", async () => {
    const provider = ytaProvider((async () =>
      jsonResponse({
        subtitles: [
          { langCode: "de", vttContent: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhallo\n" },
          { langCode: "en", vttContent: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n" },
        ],
      })));
    const { segments, lang } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([{ text: "hello", offset: 1000, duration: 1000 }]);
    expect(lang).toBe("en");
  });

  test("falls back to first track", async () => {
    const provider = ytaProvider((async () =>
      jsonResponse({ subtitles: [{ langCode: "es", vttContent: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhola\n" }] })));
    const { segments, lang } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([{ text: "hola", offset: 1000, duration: 1000 }]);
    expect(lang).toBe("es");
  });

  test("fetches json3Url when no inline content", async () => {
    const provider = ytaProvider((async (url: any) => {
      if (String(url).includes("/api/subtitles")) {
        return jsonResponse({ subtitles: [{ langCode: "en", json3Url: "https://cdn.example/x.json3" }] });
      }
      return new Response(
        JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 100, segs: [{ utf8: "hi" }] }] }),
        { status: 200 },
      );
    }));
    const { segments } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([{ text: "hi", offset: 0, duration: 100 }]);
  });

  test("no tracks throws", async () => {
    const provider = ytaProvider((async () => jsonResponse({ subtitles: [] })));
    expect(provider.fetch("dQw4w9WgXcQ", "en")).rejects.toThrow("no caption tracks");
  });
});

describe("kome provider", () => {
  test("posts full watch url and wraps plain text", async () => {
    let captured: any = {};
    const provider = komeProvider((async (_url: any, init?: any) => {
      captured = { url: _url, init };
      return jsonResponse({ transcript: "  never gonna give you up  " });
    }));
    const { segments } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([{ text: "never gonna give you up", offset: 0, duration: 0 }]);
    expect(captured.init.method).toBe("POST");
    expect(JSON.parse(captured.init.body).video_id).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(captured.init.headers.origin).toBe("https://kome.ai");
  });

  test("rejects the no-transcript apology instead of emitting it as content", async () => {
    const provider = komeProvider((async () =>
      jsonResponse({
        transcript:
          "Transcripts aren't available for this video. The publisher may have restricted access to them on YouTube.",
      })));
    expect(provider.fetch("dQw4w9WgXcQ", "en")).rejects.toThrow("no transcript");
  });

  test("empty transcript text throws", async () => {
    const provider = komeProvider((async () => jsonResponse({ transcript: "   " })));
    expect(provider.fetch("dQw4w9WgXcQ", "en")).rejects.toThrow("no transcript in response");
  });
});

describe("supadata provider", () => {
  test("skips itself when no API key is set", async () => {
    const provider = supadataProvider(undefined, undefined);
    expect(provider.fetch("dQw4w9WgXcQ", "en")).rejects.toThrow("SUPADATA_API_KEY not set");
  });

  test("uses timed transcript when available", async () => {
    let captured: any = {};
    const provider = supadataProvider((async (url: any, init?: any) => {
      captured = { url, init };
      return jsonResponse({
        lang: "en",
        content: "ignored",
        transcriptWithTimestamps: [
          { text: "hello", offset: 0, duration: 500 },
          { text: "world", offset: 500, duration: 500 },
        ],
      });
    }), "test-key");
    const { segments, lang } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([
      { text: "hello", offset: 0, duration: 500 },
      { text: "world", offset: 500, duration: 500 },
    ]);
    expect(lang).toBe("en");
    expect(captured.init.headers["x-api-key"]).toBe("test-key");
    expect(captured.url).toContain(encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  });

  test("falls back to plain content as a single segment", async () => {
    const provider = supadataProvider((async () => jsonResponse({ lang: "en", content: "one long transcript" })), "test-key");
    const { segments } = await provider.fetch("dQw4w9WgXcQ", "en");
    expect(segments).toEqual([{ text: "one long transcript", offset: 0, duration: 0 }]);
  });
});
