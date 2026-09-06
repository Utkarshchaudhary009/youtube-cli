import { registerCommand } from "./registry.ts";
import { CliError } from "../lib/errors.ts";
import { parseVideoId } from "../lib/video-id.ts";
import { parseArgs } from "../lib/args.ts";
import { printJson, formatTimestamp } from "../lib/output.ts";
import { fetchTranscript, type ProviderAttempt } from "../transcript/waterfall.ts";
import { dedupeSegments } from "../transcript/parse.ts";
import type { TranscriptResult, TranscriptSegment } from "../transcript/types.ts";

const LINE_WIDTH = 90;

/** Groups cue texts into readable lines; each line is stamped with its first cue. */
export function renderTimestamped(segments: TranscriptSegment[]): string {
  const lines: string[] = [];
  let buffer = "";
  let bufferOffset = 0;

  const flush = () => {
    if (buffer) lines.push(`[${formatTimestamp(bufferOffset / 1000)}] ${buffer}`);
    buffer = "";
  };

  for (const seg of segments) {
    if (buffer && (buffer + " " + seg.text).length > LINE_WIDTH) {
      flush();
    }
    if (!buffer) bufferOffset = seg.offset;
    buffer = buffer ? `${buffer} ${seg.text}` : seg.text;
  }
  flush();
  return lines.join("\n");
}

/** Flowing plain text without timestamps; consecutive duplicate cues removed. */
export function renderPlain(segments: TranscriptSegment[]): string {
  const text = dedupeSegments(segments)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > LINE_WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Keeps only segments from the final `seconds` of the video. */
export function applyLastFilter(segments: TranscriptSegment[], seconds: number): TranscriptSegment[] {
  if (segments.length === 0) return segments;
  const videoEnd = Math.max(...segments.map((s) => s.offset + s.duration));
  const cutoff = videoEnd - seconds * 1000;
  return segments.filter((s) => s.offset >= cutoff);
}

function fullTextOf(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prints provider failure reasons to stderr (visible only with --verbose). */
function reportAttempts(attempts: ProviderAttempt[]): void {
  for (const attempt of attempts) {
    console.error(`  provider ${attempt.provider} failed: ${attempt.error}`);
  }
}

export async function runTranscript(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv, ["json", "plain", "help", "verbose"]);
  const [input] = parsed.positionals;
  if (!input) throw new CliError("USAGE", "Usage: yt transcript <url|id> [--lang <code>] [--plain] [--json] [--out <file>] [--last <seconds>]", 2);

  const videoId = parseVideoId(input);
  if (!videoId) throw new CliError("BAD_INPUT", `"${input}" is not a YouTube video ID or URL.`, 2);

  const langFlag = parsed.flags["lang"];
  if (langFlag === true) throw new CliError("USAGE", "--lang expects a language code (e.g. --lang es).", 2);
  const lang = typeof langFlag === "string" ? langFlag : "en";

  const json = parsed.flags["json"] === true;
  const plain = parsed.flags["plain"] === true;
  const verbose = parsed.flags["verbose"] === true;

  let lastSeconds: number | null = null;
  const lastFlag = parsed.flags["last"];
  if (lastFlag !== undefined) {
    if (lastFlag === true) throw new CliError("USAGE", "--last expects a number of seconds (e.g. --last 30).", 2);
    lastSeconds = Number(lastFlag);
    if (!Number.isFinite(lastSeconds) || lastSeconds <= 0) {
      throw new CliError("USAGE", "--last expects a positive number of seconds.", 2);
    }
  }

  const outFile = parsed.flags["out"];
  if (outFile === true) throw new CliError("USAGE", "--out expects a file path (e.g. --out transcript.txt).", 2);

  const { result, attempts } = await fetchTranscript(videoId, lang);
  if (verbose) reportAttempts(attempts);

  const segments = lastSeconds !== null ? applyLastFilter(result.segments, lastSeconds) : result.segments;
  const output: TranscriptResult = { ...result, segments, fullText: fullTextOf(segments) };

  if (typeof outFile === "string") {
    const content = json ? JSON.stringify(output, null, 2) : plain ? renderPlain(segments) : renderTimestamped(segments);
    await Bun.write(outFile, content.endsWith("\n") ? content : content + "\n");
    if (!json) console.error(`Wrote transcript to ${outFile}`);
    return;
  }

  if (json) {
    printJson(output);
    return;
  }
  if (!plain) console.error(`Transcript for ${videoId} via ${result.provider} (${result.lang})`);
  console.log(plain ? renderPlain(segments) : renderTimestamped(segments));
}

registerCommand("transcript", {
  description: "Fetch the transcript/captions for a video",
  usage: "yt transcript <url|id> [--lang <code>] [--plain] [--json] [--out <file>] [--last <seconds>] [--verbose]",
  run: runTranscript,
});
