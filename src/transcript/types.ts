export interface TranscriptSegment {
  /** Cue text, whitespace-collapsed. */
  text: string;
  /** Start time in milliseconds. */
  offset: number;
  /** Duration in milliseconds (0 when the provider does not report timing). */
  duration: number;
}

export interface TranscriptResult {
  videoId: string;
  /** Requested language; may differ from what the provider actually served. */
  lang: string;
  /** Name of the provider that succeeded. */
  provider: string;
  segments: TranscriptSegment[];
  fullText: string;
}

export interface ProviderFetch {
  segments: TranscriptSegment[];
  /** Language actually served, when the provider reports it. */
  lang?: string;
}

export interface TranscriptProvider {
  name: string;
  fetch(videoId: string, lang: string): Promise<ProviderFetch>;
}
