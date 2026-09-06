import type { TranscriptSegment } from "./types.ts";

/** Collapses all whitespace runs into single spaces and trims. */
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Parses WebVTT cue text into segments. Ignores WEBVTT header, NOTE blocks,
 * styling/region blocks, and cue settings.
 */
export function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = vtt.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line.includes("-->")) continue;
    const cue = parseTimingLine(line);
    if (!cue) continue;

    // Collect the cue payload lines that follow (identifier lines never
    // contain "-->", so they are skipped naturally).
    const textLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() !== "" && !lines[j]!.includes("-->")) {
      textLines.push(lines[j]!.trim());
      j++;
    }
    i = j;

    const text = collapse(textLines.join(" ").replace(/<[^>]+>/g, ""));
    if (text) segments.push({ text, offset: cue.startMs, duration: Math.max(0, cue.endMs - cue.startMs) });
  }
  return segments;
}

function parseTimingLine(line: string): { startMs: number; endMs: number } | null {
  const match = line.match(
    /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{3})/,
  );
  if (!match) return null;
  const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
  return {
    startMs: toMs(h1, m1!, s1!, ms1!),
    endMs: toMs(h2, m2!, s2!, ms2!),
  };
}

function toMs(h: string | undefined, m: string, s: string, ms: string): number {
  return (Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms);
}

/**
 * Parses YouTube's json3 caption format:
 * `{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }`
 */
export function parseJson3(json: string): TranscriptSegment[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("invalid json3 caption payload");
  }
  const events = (data as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> })
    .events;
  if (!Array.isArray(events)) return [];

  const segments: TranscriptSegment[] = [];
  for (const event of events) {
    if (typeof event.tStartMs !== "number" || !event.segs) continue;
    const text = collapse(event.segs.map((s) => s.utf8 ?? "").join(""));
    if (!text) continue;
    segments.push({
      text,
      offset: event.tStartMs,
      duration: typeof event.dDurationMs === "number" ? event.dDurationMs : 0,
    });
  }
  return segments;
}

/** Removes consecutive duplicate cues (common in auto-generated captions). */
export function dedupeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    if (out.length > 0 && out[out.length - 1]!.text === seg.text) continue;
    out.push(seg);
  }
  return out;
}

/** Joins segment texts into one whitespace-normalized string. */
export function buildFullText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
