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
    console.log(`\n### ${name}\n  ${res.status} ${res.headers.get('content-type')} len=${text.length}\n  ${text.replace(/\s+/g, ' ').slice(0, 240)}`);
  } catch (e) {
    console.log(`\n### ${name}\n  ERROR ${String(e).slice(0, 120)}`);
  }
}
const post = (url, body, headers) => ({ method: 'POST', body: JSON.stringify(body), headers });

// downsub variants
await t('downsub GET ?url=', 'https://get-info.downsub.com/?url=' + encodeURIComponent(WATCH), {});
await t('downsub GET ?v=', 'https://get-info.downsub.com/?v=' + VID, {});
await t('downsub POST url+lang', 'https://get-info.downsub.com/', post({ url: WATCH, language: '' }, { origin: 'https://downsub.com', referer: 'https://downsub.com/', 'x-requested-with': 'XMLHttpRequest' }));
await t('downsub POST {url,platform}', 'https://get-info.downsub.com/', post({ url: WATCH, platform: 'youtube' }, { origin: 'https://downsub.com' }));
// transcriptube variants
await t('transcriptube {videoId: full url}', 'https://transcriptube.com/api/transcript', post({ videoId: WATCH, platform: 'yt' }, { origin: 'https://transcriptube.com' }));
await t('transcriptube {link}', 'https://transcriptube.com/api/transcript', post({ link: WATCH, platform: 'yt' }, { origin: 'https://transcriptube.com' }));
await t('transcriptube {video_id}', 'https://transcriptube.com/api/transcript', post({ video_id: VID, platform: 'yt' }, { origin: 'https://transcriptube.com' }));
// new sites
await t('turboscribe page', 'https://turboscribe.ai/youtube-transcript', {});
await t('filmot retry', 'https://filmot.com/', {});
await t('recapio retry', 'https://recapio.com/', {});
await t('ytscribe', 'https://ytscribe.org/', {});
// anthiago inline script grep
const page = await (await fetch('https://anthiago.com/transcript/', { headers: { 'user-agent': UA } })).text();
for (const m of page.matchAll(/["'`](https?:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9_\-./]*(?:transcript|api|subtitle)[a-zA-Z0-9_\-./?=&]*)["'`]/gi)) {
  if (!/anthiago\.com\/transcript|schema|social/.test(m[1])) console.log(`anthiago str: ${m[1]}`);
}
for (const m of page.matchAll(/["'`](\/(?:api|wp-json|get|transcript\/api)[a-zA-Z0-9_\-./?=&]*)["'`]/g)) console.log(`anthiago rel: ${m[1]}`);
const svelte = [...page.matchAll(/<script type="module"[^>]*>([\s\S]{0,400}?)<\/script>/g)].map((m) => m[1]).join('\n---\n');
console.log(`\nanthiago inline module scripts (${page.length}b page):\n${svelte.slice(0, 1200)}`);
