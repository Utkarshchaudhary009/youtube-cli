/**
 * Minimal argument parser.
 *
 * Rules:
 * - Tokens not starting with `--` are positionals (in order).
 * - `--flag=value` sets flag `flag` to `value` (never boolean).
 * - `--flag` where `flag` is in `booleanFlags` is `true`.
 * - Any other `--flag` consumes the next token as its value; if there is no
 *   next token (or the next token starts with `--`), it is treated as `true`.
 * - A lone `--` ends flag parsing; everything after is positional.
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[], booleanFlags: Iterable<string> = []): ParsedArgs {
  const bools = new Set(booleanFlags);
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  let flagsEnded = false;
  while (i < argv.length) {
    const token = argv[i]!;
    if (!flagsEnded && token === "--") {
      flagsEnded = true;
      i++;
      continue;
    }
    if (!flagsEnded && token.startsWith("--") && token.length > 2) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        const name = token.slice(2, eq);
        flags[name] = token.slice(eq + 1);
      } else {
        const name = token.slice(2);
        const next = argv[i + 1];
        if (bools.has(name) || next === undefined || next.startsWith("--")) {
          flags[name] = true;
        } else {
          flags[name] = next;
          i++;
        }
      }
      i++;
      continue;
    }
    positionals.push(token);
    i++;
  }

  return { positionals, flags };
}
