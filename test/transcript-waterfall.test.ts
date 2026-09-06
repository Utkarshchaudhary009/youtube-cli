import { describe, expect, test } from "bun:test";
import { CliError } from "../src/lib/errors.ts";
import { fetchTranscript } from "../src/transcript/waterfall.ts";
import type { TranscriptProvider } from "../src/transcript/types.ts";

function fakeProvider(name: string, behavior: () => Promise<any>): TranscriptProvider {
  return { name, fetch: behavior };
}

const segments = [
  { text: "hello", offset: 0, duration: 500 },
  { text: "world", offset: 500, duration: 500 },
];

describe("fetchTranscript waterfall", () => {
  test("first success wins", async () => {
    const providers = [
      fakeProvider("a", () => Promise.resolve({ segments })),
      fakeProvider("b", () => Promise.reject(new Error("should not be called"))),
    ];
    const { result, attempts } = await fetchTranscript("abc12345678", "en", providers);
    expect(result.provider).toBe("a");
    expect(result.lang).toBe("en");
    expect(result.fullText).toBe("hello world");
    expect(attempts).toEqual([]);
  });

  test("provider-reported lang overrides requested lang", async () => {
    const providers = [fakeProvider("a", () => Promise.resolve({ segments, lang: "en-US" }))];
    const { result } = await fetchTranscript("abc12345678", "en", providers);
    expect(result.lang).toBe("en-US");
  });

  test("falls through failures in order", async () => {
    const providers = [
      fakeProvider("a", () => Promise.reject(new Error("HTTP 503"))),
      fakeProvider("b", () => Promise.resolve({ segments: [] })),
      fakeProvider("c", () => Promise.resolve({ segments })),
    ];
    const { result, attempts } = await fetchTranscript("abc12345678", "en", providers);
    expect(result.provider).toBe("c");
    expect(attempts).toEqual([
      { provider: "a", error: "HTTP 503" },
      { provider: "b", error: "empty transcript" },
    ]);
  });

  test("throws CliError listing all providers with reasons when everything fails", async () => {
    const providers = [
      fakeProvider("a", () => Promise.reject(new Error("HTTP 403"))),
      fakeProvider("b", () => Promise.reject(new Error("timeout"))),
    ];
    try {
      await fetchTranscript("abc12345678", "en", providers);
      throw new Error("expected fetchTranscript to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      const cliErr = err as CliError;
      expect(cliErr.code).toBe("NO_TRANSCRIPT");
      expect(cliErr.message).toContain("a (HTTP 403)");
      expect(cliErr.message).toContain("b (timeout)");
    }
  });
});
