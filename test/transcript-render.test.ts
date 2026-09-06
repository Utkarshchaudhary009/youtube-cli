import { describe, expect, test } from "bun:test";
import { renderPlain, renderTimestamped } from "../src/commands/transcript.ts";

const longSegs = [
  { text: "This is the first line of the transcript", offset: 0, duration: 1000 },
  { text: "and here comes more text to push us", offset: 1000, duration: 1000 },
  { text: "over the line width boundary", offset: 2000, duration: 1000 },
];

describe("renderTimestamped", () => {
  test("stamps lines with their first cue time", () => {
    const out = renderTimestamped([
      { text: "hello", offset: 430, duration: 500 },
      { text: "world", offset: 930, duration: 500 },
    ]);
    expect(out).toBe("[0:00] hello world");
  });

  test("wraps long text into multiple lines", () => {
    const out = renderTimestamped(longSegs);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[0:00\] This is the first line/);
    expect(lines[1]).toMatch(/^\[0:02\] over the line width boundary/);
  });

  test("handles hours in timestamps", () => {
    const out = renderTimestamped([{ text: "deep", offset: 3_600_000, duration: 500 }]);
    expect(out).toBe("[1:00:00] deep");
  });
});

describe("renderPlain", () => {
  test("no timestamps, wrapped text", () => {
    const out = renderPlain(longSegs);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(out).not.toContain("[0:00]");
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(90);
  });

  test("drops consecutive duplicate cues", () => {
    const out = renderPlain([
      { text: "repeat", offset: 0, duration: 1 },
      { text: "repeat", offset: 1, duration: 1 },
      { text: "done", offset: 2, duration: 1 },
    ]);
    expect(out).toBe("repeat done");
  });
});
