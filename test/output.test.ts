import { describe, expect, test } from "bun:test";
import { CliError, formatError } from "../src/lib/errors.ts";
import { formatTimestamp, table } from "../src/lib/output.ts";

describe("formatTimestamp", () => {
  test("minutes and seconds", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(43)).toBe("0:43");
    expect(formatTimestamp(2120)).toBe("35:20");
  });

  test("hours", () => {
    expect(formatTimestamp(3675)).toBe("1:01:15");
  });

  test("clamps negatives", () => {
    expect(formatTimestamp(-5)).toBe("0:00");
  });
});

describe("table", () => {
  test("aligns columns with headers", () => {
    const out = table(
      [
        ["id1", "Title A"],
        ["longer-id", "Title B"],
      ],
      ["ID", "TITLE"],
    );
    const lines = out.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("ID         TITLE");
    expect(lines[1]).toBe("---------  -------");
    expect(lines[2]!.startsWith("id1        Title A")).toBe(true);
    expect(lines[3]!.startsWith("longer-id  Title B")).toBe(true);
  });

  test("no headers leaves last column ragged", () => {
    const out = table([["a", "long text"], ["bb", "x"]]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("a   long text");
    expect(lines[1]).toBe("bb  x");
  });
});

describe("formatError", () => {
  test("CliError human", () => {
    expect(formatError(new CliError("NO_TRANSCRIPT", "No transcript available."), false)).toBe(
      "error: No transcript available.",
    );
  });

  test("CliError json", () => {
    const out = JSON.parse(formatError(new CliError("NO_TRANSCRIPT", "No transcript available."), true));
    expect(out).toEqual({ error: { code: "NO_TRANSCRIPT", message: "No transcript available." } });
  });

  test("unknown error", () => {
    expect(formatError("boom", false)).toBe("error: boom");
  });
});
