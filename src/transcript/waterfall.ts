import { CliError } from "../lib/errors.ts";
import { buildFullText, dedupeSegments } from "./parse.ts";
import { defaultProviders } from "./providers.ts";
import type { TranscriptProvider, TranscriptResult } from "./types.ts";

export interface ProviderAttempt {
  provider: string;
  error: string;
}

/**
 * Tries each provider in order and returns the first successful transcript.
 * Throws a CliError listing every provider's failure reason when all fail.
 */
export async function fetchTranscript(
  videoId: string,
  lang: string,
  providers: TranscriptProvider[] = defaultProviders(),
): Promise<{ result: TranscriptResult; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];

  for (const provider of providers) {
    try {
      const { segments, lang: servedLang } = await provider.fetch(videoId, lang);
      if (segments.length === 0) throw new Error("empty transcript");
      return {
        result: {
          videoId,
          lang: servedLang ?? lang,
          provider: provider.name,
          segments,
          fullText: buildFullText(dedupeSegments(segments)),
        },
        attempts,
      };
    } catch (err) {
      attempts.push({ provider: provider.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const tried = providers.map((p) => {
    const attempt = attempts.find((a) => a.provider === p.name);
    return attempt ? `${p.name} (${attempt.error})` : p.name;
  });
  throw new CliError(
    "NO_TRANSCRIPT",
    `No transcript available for ${videoId}. The video may have no captions. Tried: ${tried.join(", ")}.`,
  );
}
