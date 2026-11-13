import { $, esc, api, initChrome, photoCard, storyHref, postHref, sectionById, timeAgo, markTerms, mediaHtml } from './site.js';

initChrome({ active: 'search' });
const input = $('#q');
const out = $('#results');
let q = new URLSearchParams(location.search).get('q') || '';
input.value = q;
if (!q) input.focus();

const row = (href, item, title, sub, sum) => `<a class="row-story big" href="${href}"><div><span class="chip">${esc(sub)}</span><h3>${markTerms(title, q)}</h3>${sum ? `<p class="sum">${markTerms(sum, q)}</p>` : ''}</div>${mediaHtml(item)}</a>`;

async function run() {
  if (!q.trim()) {
    out.innerHTML = `<div class="empty">Search every story on the live wire and every Kelvane Club article. Try a company, a model, a person or a ticker.</div>`;
    document.title = 'Search | Kelvane Club';
    return;
  }
  document.title = `${q} | Search | Kelvane Club`;
  out.innerHTML = `<div class="sk sk-title" style="width:40%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div>`;
  let r;
  try {
    r = await api(`/api/search?q=${encodeURIComponent(q)}`);
  } catch {
    out.innerHTML = `<div class="empty">Search is reconnecting. <button class="btn btn-sm" id="retry">Try again</button></div>`;
    $('#retry').onclick = run;
    return;
  }
  const total = r.stories.length + r.posts.length;
  const top = r.stories.filter((s) => s.image).slice(0, 3);
  const rest = r.stories.filter((s) => !top.includes(s));
  out.innerHTML = `<p class="meta" style="margin:0 0 20px">${total} result${total === 1 ? '' : 's'} for <strong style="color:var(--ink)">“${esc(q)}”</strong></p>
    ${r.topics.length ? `<div class="sr-topic" style="margin-bottom:26px">${r.topics.map((t) => `<a href="/topic/${esc(t.slug)}">${esc(t.name)}</a>`).join('')}</div>` : ''}
    ${total ? '' : `<div class="empty">Nothing matches “${esc(q)}” on the live wire right now. Try a shorter search, like a company name.</div>`}
    ${r.posts.length ? `<section style="margin-bottom:36px"><div class="sec-head"><h2><span class="bar"></span>From the Kelvane Club desk</h2></div><div class="panel panel-pad">${r.posts.map((p) => row(postHref(p), { ...p, id: p.slug, image: p.cover?.url }, p.title, `Kelvane Club Desk · ${timeAgo(p.publishedAt)}`, p.dek)).join('')}</div></section>` : ''}
    ${top.length >= 3 ? `<div class="cards-3" style="margin-bottom:28px">${top.map(photoCard).join('')}</div>` : ''}
    ${(top.length >= 3 ? rest : r.stories).length ? `<div class="panel panel-pad">${(top.length >= 3 ? rest : r.stories).map((s) => row(storyHref(s), s, s.title, `${sectionById(s.section).name} · ${timeAgo(s.date)}`, s.summary)).join('')}</div>` : ''}`;
}

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  q = input.value.trim();
  history.replaceState(null, '', q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  run();
});
run();
