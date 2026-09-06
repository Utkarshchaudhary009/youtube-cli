const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const VID = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${VID}`;

async function t(name, url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: '*/*', 'content-type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const text = await res.text();
    console.log(`\n### ${name}\n  ${res.status} ${res.headers.get('content-type')} len=${text.length}\n  ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
  } catch (e) {
    console.log(`\n### ${name}\n  ERROR ${String(e).slice(0, 120)}`);
  }
}

const post = (url, body, headers) => ({ method: 'POST', body: JSON.stringify(body), headers });

// downsub payload shape guesses
await t('downsub get-info {url}', 'https://get-info.downsub.com/', post({ url: WATCH }, { origin: 'https://downsub.com', referer: 'https://downsub.com/' }));
await t('downsub get-info {videoId}', 'https://get-info.downsub.com/', post({ videoId: VID }, { origin: 'https://downsub.com' }));
await t('downsub get-info {id}', 'https://get-info.downsub.com/', post({ id: VID }, { origin: 'https://downsub.com' }));
await t('downsub get-info {data:{url}}', 'https://get-info.downsub.com/', post({ data: { url: WATCH } }, { origin: 'https://downsub.com' }));
await t('downsub get.downsub.com', 'https://get.downsub.com/', post({ url: WATCH }, { origin: 'https://downsub.com' }));
await t('downsub subtitle srt builder', 'https://subtitle.downsub.com/srt/?url=' + encodeURIComponent(WATCH), {});
// transcriptube
await t('transcriptube POST /api/transcript', 'https://transcriptube.com/api/transcript', post({ videoId: VID, platform: 'yt' }, { origin: 'https://transcriptube.com', referer: 'https://transcriptube.com/' }));
// you-tldr on a processed public video
await t('you-tldr default-transcript videoId=Unzc731iCUY', 'https://www.you-tldr.com/api/default-transcript?videoId=Unzc731iCUY', {});
await t('you-tldr transcript page', 'https://www.you-tldr.com/transcript/Unzc731iCUY', {});
// anthiago: grep page for fetch endpoint
const page = await (await fetch('https://anthiago.com/transcript/', { headers: { 'user-agent': UA } })).text();
const bundleUrls = [...page.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], 'https://anthiago.com').href);
for (const u of bundleUrls) {
  const js = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
  for (const m of js.matchAll(/fetch\(([^)]{0,160})/g)) console.log(`\n### anthiago bundle ${u.split('/').pop()}\n  fetch(${m[1].slice(0, 150)}`);
  for (const m of js.matchAll(/["'`](\/(?:api|transcript|get|des)[a-zA-Z0-9_\-/?=.&]*)["'`]/g)) console.log(`  str: ${m[1]}`);
}
