/** Prints a value as pretty JSON on stdout (the machine-readable output mode). */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** Formats seconds as [m:ss] (or [h:mm:ss] past one hour). */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Pads each cell left-aligned; last column is left unpadded. */
export function table(rows: string[][], headers?: string[]): string {
  const all = headers ? [headers, ...rows] : rows;
  const width = all.length > 0 ? Math.max(...all.map((r) => r.length)) : 0;
  const colWidths: number[] = [];
  for (let c = 0; c < width; c++) {
    if (c === width - 1 && !headers) {
      colWidths.push(0);
      continue;
    }
    colWidths.push(Math.max(0, ...all.map((r) => (r[c] ?? "").length)));
  }
  const lines = all.map((r) =>
    r
      .map((cell, c) => {
        const w = colWidths[c]!;
        return c === r.length - 1 || w === 0 ? cell : cell.padEnd(w);
      })
      .join("  ")
      .trimEnd(),
  );
  if (headers && lines.length > 1) lines.splice(1, 0, colWidths.map((w) => "-".repeat(w)).join("  "));
  return lines.join("\n");
}
