import { describe, expect, test } from "bun:test";
import { buildFullText, dedupeSegments, parseJson3, parseVtt } from "../src/transcript/parse.ts";

describe("parseVtt", () => {
  test("parses basic cues", () => {
    const vtt = `WEBVTT

00:00:00.430 --> 00:00:02.120
Never gonna give you up

00:00:02.120 --> 00:00:04.000
Never gonna <i>let you down</i>
`;
    expect(parseVtt(vtt)).toEqual([
      { text: "Never gonna give you up", offset: 430, duration: 1690 },
      { text: "Never gonna let you down", offset: 2120, duration: 1880 },
    ]);
  });

  test("handles hours and comma milliseconds", () => {
    const vtt = `WEBVTT

01:00:00,500 --> 01:00:02,000
later cue
`;
    expect(parseVtt(vtt)).toEqual([{ text: "later cue", offset: 3_600_500, duration: 1500 }]);
  });

  test("skips NOTE blocks and cue identifiers", () => {
    const vtt = `WEBVTT

NOTE this is a note

intro-cue
00:00:01.000 --> 00:00:02.000
hello
`;
    expect(parseVtt(vtt)).toEqual([{ text: "hello", offset: 1000, duration: 1000 }]);
  });

  test("empty input", () => {
    expect(parseVtt("")).toEqual([]);
  });
});

describe("parseJson3", () => {
  test("parses events with segs", () => {
    const json = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "\n" }, { utf8: "Hello " }, { utf8: "world" }] },
        { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "Next" }] },
        { aAppend: 1, segs: [{ utf8: "\n" }] },
      ],
    });
    expect(parseJson3(json)).toEqual([
      { text: "Hello world", offset: 1000, duration: 2000 },
      { text: "Next", offset: 4000, duration: 1000 },
    ]);
  });

  test("throws on invalid json", () => {
    expect(() => parseJson3("not json")).toThrow("invalid json3");
  });
});

describe("dedupeSegments", () => {
  test("removes consecutive duplicates", () => {
    const segs = [
      { text: "a", offset: 0, duration: 1 },
      { text: "a", offset: 1, duration: 1 },
      { text: "b", offset: 2, duration: 1 },
      { text: "a", offset: 3, duration: 1 },
    ];
    expect(dedupeSegments(segs)).toEqual([
      { text: "a", offset: 0, duration: 1 },
      { text: "b", offset: 2, duration: 1 },
      { text: "a", offset: 3, duration: 1 },
    ]);
  });
});

describe("buildFullText", () => {
  test("joins and normalizes whitespace", () => {
    expect(buildFullText([{ text: " hello ", offset: 0, duration: 0 }, { text: "world", offset: 1, duration: 0 }])).toBe(
      "hello world",
    );
  });
});
