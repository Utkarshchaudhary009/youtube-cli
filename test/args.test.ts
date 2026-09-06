import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/lib/args.ts";

describe("parseArgs", () => {
  test("collects positionals", () => {
    const r = parseArgs(["a", "b", "c"]);
    expect(r.positionals).toEqual(["a", "b", "c"]);
    expect(r.flags).toEqual({});
  });

  test("boolean flag declared in booleanFlags", () => {
    const r = parseArgs(["--json", "x"], ["json"]);
    expect(r.flags["json"]).toBe(true);
    expect(r.positionals).toEqual(["x"]);
  });

  test("boolean flag followed by positional does not swallow it", () => {
    const r = parseArgs(["--plain", "file.txt"], ["plain"]);
    expect(r.flags["plain"]).toBe(true);
    expect(r.positionals).toEqual(["file.txt"]);
  });

  test("string flag consumes next token", () => {
    const r = parseArgs(["--lang", "es", "id123"]);
    expect(r.flags["lang"]).toBe("es");
    expect(r.positionals).toEqual(["id123"]);
  });

  test("string flag with = value", () => {
    const r = parseArgs(["--lang=de"]);
    expect(r.flags["lang"]).toBe("de");
  });

  test("boolean flag with = value stays a string", () => {
    const r = parseArgs(["--json=false"], ["json"]);
    expect(r.flags["json"]).toBe("false");
  });

  test("trailing string flag without value becomes true", () => {
    const r = parseArgs(["--out"]);
    expect(r.flags["out"]).toBe(true);
  });

  test("string flag before another flag becomes true", () => {
    const r = parseArgs(["--out", "--json"]);
    expect(r.flags["out"]).toBe(true);
    expect(r.flags["json"]).toBe(true);
  });

  test("-- ends flag parsing", () => {
    const r = parseArgs(["--json", "--", "--weird", "x"], ["json"]);
    expect(r.flags["json"]).toBe(true);
    expect(r.positionals).toEqual(["--weird", "x"]);
  });

  test("empty argv", () => {
    const r = parseArgs([]);
    expect(r.positionals).toEqual([]);
    expect(r.flags).toEqual({});
  });
});
