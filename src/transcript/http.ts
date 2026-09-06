export const PROVIDER_TIMEOUT_MS = 15_000;

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
