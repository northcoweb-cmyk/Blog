import { $, esc, api, initChrome, rowStory, deskRow } from './site.js';

initChrome({ active: 'search' });
const q = new URLSearchParams(location.search).get('q') || '';
$('#q').value = q;
if (!q) $('#q').focus();

async function run() {
  const out = $('#results');
  if (!q.trim()) {
    out.innerHTML = `<div class="empty">Search every story on the live wire and every article from the desk.</div>`;
    return;
  }
  document.title = `${q} · Search · Tensor Street`;
  out.innerHTML = `<div class="sk sk-title" style="width:40%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div>`;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const [news, posts] = await Promise.all([api(`/api/news?q=${encodeURIComponent(q)}&limit=60`).catch(() => ({ stories: [] })), api('/api/posts?limit=100').catch(() => ({ posts: [] }))]);
  const desk = posts.posts.filter((p) => terms.every((t) => `${p.title} ${p.dek} ${(p.tags || []).join(' ')}`.toLowerCase().includes(t)));
  const total = news.stories.length + desk.length;
  out.innerHTML = `<p class="meta" style="margin:0 0 18px">${total} result${total === 1 ? '' : 's'} for <strong style="color:var(--ink)">“${esc(q)}”</strong></p>
    <div class="grid"><div class="col-8"><div class="panel panel-pad">${news.stories.length ? news.stories.map((s) => rowStory(s, { big: true })).join('') : '<div class="empty" style="border:0">No stories on the live wire match that yet.</div>'}</div></div>
    <aside class="col-4">${desk.length ? `<div class="panel panel-pad"><div class="sec-head"><h2><span class="bar"></span>From the Desk</h2></div>${desk.map(deskRow).join('')}</div>` : ''}</aside></div>`;
}
run();
