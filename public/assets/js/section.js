import { $, esc, api, cachedApi, initChrome, leadCard, rowStory, storyCard, deskRow, SECTIONS, sectionById } from './site.js';

const id = location.pathname.split('/').filter(Boolean)[1] || 'ai';
const sec = SECTIONS.find((s) => s.id === id);
initChrome({ active: id });

const head = $('#page-head');
if (!sec) {
  head.innerHTML = `<h1>Desk not found</h1><p><a href="/">Back to the front page</a></p>`;
} else {
  document.title = `${sec.long} · Tensor Street`;
  head.dataset.sec = sec.id;
  head.innerHTML = `<div class="crumbs"><a href="/">Home</a> / <span>${esc(sec.long)}</span></div><span class="chip solid" style="margin-top:16px">${esc(sec.name)} desk</span><h1>${esc(sec.long)}</h1><p>${esc(sec.blurb)}</p>`;
  $('#other-desks').innerHTML = SECTIONS.filter((s) => s.id !== id)
    .map((s) => `<a href="/section/${s.id}">${esc(s.long)}</a>`)
    .join('');
  load();
}

async function load() {
  try {
    const news = await cachedApi(`/api/news?section=${id}&limit=80`);
    const list = news.stories;
    $('#sec-count').textContent = `${list.length} stories · updated live`;
    if (!list.length) {
      $('#sec-top').innerHTML = `<div class="col-12 empty">No ${esc(sec.name)} stories on the wire right now. Check back soon.</div>`;
      $('#sec-list').innerHTML = '';
      return;
    }
    const lead = list.find((s) => s.image) || list[0];
    const rest = list.filter((s) => s !== lead);
    $('#sec-top').innerHTML = `<div class="col-8">${leadCard(lead)}</div><div class="col-4 stack">${rest.slice(0, 2).map((s) => storyCard(s, { summary: false })).join('')}</div>`;
    const remaining = rest.slice(2);
    $('#sec-list').innerHTML = remaining.length ? remaining.map((s) => rowStory(s, { big: true })).join('') : '<div class="empty">That’s everything on this desk for now.</div>';
  } catch {
    $('#sec-top').innerHTML = `<div class="col-12 empty">The wire is reconnecting. Refresh in a moment.</div>`;
  }
  try {
    const { posts } = await api(`/api/posts?section=${id}&limit=5`);
    if (posts.length) $('#sec-desk').innerHTML = `<div class="panel panel-pad"><div class="sec-head"><h2><span class="bar"></span>From the Desk</h2></div>${posts.map(deskRow).join('')}</div>`;
  } catch {}
}
