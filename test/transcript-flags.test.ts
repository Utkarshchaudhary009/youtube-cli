import { describe, expect, test } from "bun:test";
import { applyLastFilter, runTranscript } from "../src/commands/transcript.ts";

describe("applyLastFilter", () => {
  const segs = [
    { text: "early", offset: 0, duration: 1000 },
    { text: "mid", offset: 50_000, duration: 1000 },
    { text: "late", offset: 118_000, duration: 2000 },
  ];

  test("keeps only the final window", () => {
    expect(applyLastFilter(segs, 10)).toEqual([{ text: "late", offset: 118_000, duration: 2000 }]);
  });

  test("large window keeps everything", () => {
    expect(applyLastFilter(segs, 1000)).toEqual(segs);
  });

  test("timestamp-less providers (single zero segment) keep full text", () => {
    const single = [{ text: "all of it", offset: 0, duration: 0 }];
    expect(applyLastFilter(single, 5)).toEqual(single);
  });
});

describe("runTranscript usage errors (no network involved)", () => {
  test("missing input", async () => {
    expect(runTranscript([])).rejects.toMatchObject({ code: "USAGE", exitCode: 2 });
  });

  test("bad video id", async () => {
    expect(runTranscript(["definitely not a video"])).rejects.toMatchObject({ code: "BAD_INPUT", exitCode: 2 });
  });

  test("--lang without value", async () => {
    expect(runTranscript(["dQw4w9WgXcQ", "--lang", "--plain"])).rejects.toMatchObject({ code: "USAGE", exitCode: 2 });
  });

  test("--last without value", async () => {
    expect(runTranscript(["dQw4w9WgXcQ", "--last"])).rejects.toMatchObject({ code: "USAGE", exitCode: 2 });
  });

  test("--last with non-numeric value", async () => {
    expect(runTranscript(["dQw4w9WgXcQ", "--last", "abc"])).rejects.toMatchObject({ code: "USAGE", exitCode: 2 });
  });

  test("--out without value", async () => {
    // --out followed by --json never receives a filename
    expect(runTranscript(["dQw4w9WgXcQ", "--out", "--json"])).rejects.toMatchObject({ code: "USAGE", exitCode: 2 });
  });
});
