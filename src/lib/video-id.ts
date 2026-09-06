/** Extracts an 11-char video ID from a raw ID or any common YouTube URL form. */
export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/, // youtube.com/watch?v=...
    /youtu\.be\/([a-zA-Z0-9_-]{11})/, // youtu.be/...
    /\/shorts\/([a-zA-Z0-9_-]{11})/, // /shorts/...
    /\/embed\/([a-zA-Z0-9_-]{11})/, // /embed/...
    /\/live\/([a-zA-Z0-9_-]{11})/, // /live/...
    /\/v\/([a-zA-Z0-9_-]{11})/, // /v/...
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1]!;
  }
  return null;
}

/** Extracts a playlist ID from a raw ID or a URL with a `list=` parameter. */
export function parsePlaylistId(input: string): string | null {
  const raw = input.trim();
  const fromUrl = raw.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1]!;
  if (/^[a-zA-Z0-9_-]{12,}$/.test(raw) && /^(PL|UU|LL|FL|OLAK5uy_|RD|TL)/.test(raw)) return raw;
  return null;
}
