import { describe, expect, test } from "bun:test";

// Spawning `bun run` is slow on Windows; give these tests room.
const SPAWN_TIMEOUT = 20_000;

describe("main entry", () => {
  test("unknown command exits 1 with actionable message", () => {
    const proc = Bun.spawnSync(["bun", "run", "src/main.ts", "frobnicate"], { cwd: import.meta.dir + "/.." });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain("Unknown command: frobnicate");
    expect(proc.stderr.toString()).toContain("yt help");
  }, SPAWN_TIMEOUT);

  test("--version prints version", () => {
    const proc = Bun.spawnSync(["bun", "run", "src/main.ts", "--version"], { cwd: import.meta.dir + "/.." });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+$/);
  }, SPAWN_TIMEOUT);

  test("--help lists commands", () => {
    const proc = Bun.spawnSync(["bun", "run", "src/main.ts", "--help"], { cwd: import.meta.dir + "/.." });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("Usage: yt <command>");
  }, SPAWN_TIMEOUT);
});
