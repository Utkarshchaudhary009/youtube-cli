// Verify candidate internal endpoints against a real video. Prints status + snippet.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const VID = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${VID}`;

const tests = [
  { name: 'kome.ai POST /api/transcript', method: 'POST', url: 'https://kome.ai/api/transcript',
    headers: { 'content-type': 'application/json', origin: 'https://kome.ai', referer: 'https://kome.ai/tools/youtube-transcript-generator' },
    body: { video_id: WATCH, format: true } },
  { name: 'tubetotext GET /api/v2/youtube/transcript', method: 'GET',
    url: `https://tubetotext.com/api/v2/youtube/transcript?video_url=${VID}&format=json`,
    headers: { origin: 'https://tubetotext.com', referer: 'https://tubetotext.com/' } },
  { name: 'tactiq POST tactiq-apps-prod /transcript', method: 'POST', url: 'https://tactiq-apps-prod.tactiq.io/transcript',
    headers: { 'content-type': 'application/json', origin: 'https://tactiq.io', referer: 'https://tactiq.io/' },
    body: { videoUrl: WATCH, langCode: 'en' } },
  { name: 'notegpt GET /api/v2/video-transcript', method: 'GET',
    url: `https://notegpt.io/api/v2/video-transcript?platform=youtube&video_id=${VID}`,
    headers: { referer: 'https://notegpt.io/youtube-transcript-generator' } },
  { name: 'youtube-transcript.io POST /api/transcripts', method: 'POST', url: 'https://www.youtube-transcript.io/api/transcripts',
    headers: { 'content-type': 'application/json', origin: 'https://www.youtube-transcript.io' },
    body: { ids: [VID] } },
  { name: 'youtubetranscript.com GET ?server_vid2', method: 'GET',
    url: `https://youtubetranscript.com/?server_vid2=${VID}`, headers: { referer: 'https://youtubetranscript.com/' } },
  { name: 'youtubetotranscript.com GET /transcript', method: 'GET',
    url: `https://youtubetotranscript.com/transcript?youtube_url=${encodeURIComponent(WATCH)}`,
    headers: { referer: 'https://youtubetotranscript.com/' } },
  { name: 'downsub POST get-info.downsub.com', method: 'POST', url: 'https://get-info.downsub.com/',
    headers: { 'content-type': 'application/json', origin: 'https://downsub.com', referer: 'https://downsub.com/' },
    body: { url: WATCH } },
  { name: 'summarize.tech GET summary page', method: 'GET',
    url: `https://www.summarize.tech/www.youtube.com/watch?v=${VID}`, headers: {} },
  { name: 'you-tldr GET /api/default-transcript', method: 'GET',
    url: `https://www.you-tldr.com/api/default-transcript?videoId=${VID}`,
    headers: { referer: 'https://www.you-tldr.com/' } },
  { name: 'you-tldr GET /api/default-transcript?v', method: 'GET',
    url: `https://www.you-tldr.com/api/default-transcript?v=${VID}`,
    headers: { referer: 'https://www.you-tldr.com/' } },
  { name: 'tubeonai POST /api/summarize', method: 'POST', url: 'https://app.tubeonai.com/api/summarize',
    headers: { 'content-type': 'application/json', origin: 'https://tubeonai.com', referer: 'https://tubeonai.com/' },
    body: { video_url: WATCH } },
  { name: 'google timedtext direct', method: 'GET',
    url: `https://video.google.com/timedtext?type=track&v=${VID}&lang=en`, headers: {} },
  { name: 'anthiago GET /transcript page probe', method: 'GET',
    url: 'https://anthiago.com/transcript/', headers: {} },
];

for (const t of tests) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const res = await fetch(t.url, {
      method: t.method,
      headers: { 'user-agent': UA, accept: '*/*', ...(t.headers || {}) },
      body: t.body ? JSON.stringify(t.body) : undefined,
      signal: ac.signal,
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    const snippet = text.replace(/\s+/g, ' ').slice(0, 260);
    const hit = /transcript|caption|"\d+:\d+"|<transcript|segments|text/i.test(text.slice(0, 4000));
    console.log(`\n### ${t.name}\n  status=${res.status} ct=${ct} len=${text.length} likely=${hit}\n  ${snippet}`);
  } catch (e) {
    console.log(`\n### ${t.name}\n  ERROR ${String(e).slice(0, 140)}`);
  } finally {
    clearTimeout(timer);
  }
}
