import { $, esc, api, initChrome, mediaHtml, deskCard, sectionById, fmtDate, shareButtons, signupHtml, wireSignups, ICON } from './site.js';
import { renderMarkdown } from './md.js';

const root = $('#post');

async function main() {
  let post = window.__POST__;
  const slug = location.pathname.split('/').filter(Boolean)[1];
  const preview = new URLSearchParams(location.search).get('preview');
  // Preview mode (from the admin editor) or a page served without server rendering.
  if (preview) {
    try {
      post = JSON.parse(sessionStorage.getItem('ts-preview') || 'null');
      if (post) post.html = renderMarkdown(post.body || '');
    } catch {}
  } else if (post === undefined && slug) {
    try {
      post = (await api(`/api/posts?slug=${encodeURIComponent(slug)}`)).post;
    } catch {
      post = null;
    }
  }
  initChrome({ active: post?.section });
  if (!post) {
    root.innerHTML = `<div class="page-head" style="border:0;text-align:center;padding:60px 0"><h1 style="font-size:36px">We couldn’t find that article.</h1><p style="margin:0 auto 20px">It may have been moved or unpublished.</p><a class="btn btn-primary" href="/">Back to the front page</a></div>`;
    return;
  }
  const sec = sectionById(post.section);
  if (!preview) document.title = `${post.title} · Tensor Street`;
  const initials = (post.author || 'TS').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  root.innerHTML = `
    ${preview ? '<div class="pill brand" style="margin-bottom:16px">Preview · not published</div>' : ''}
    <div class="crumbs"><a href="/">Home</a> / <a href="/section/${esc(post.section)}">${esc(sec.long)}</a></div>
    <header class="article-head" style="margin-top:18px"><span class="chip solid" data-sec="desk">From the Desk · ${esc(sec.name)}</span><h1>${esc(post.title)}</h1>${post.dek ? `<p class="dek">${esc(post.dek)}</p>` : ''}</header>
    <div class="byline"><div class="avatar" aria-hidden="true">${esc(initials)}</div><div><div class="who">${esc(post.author)}</div><div class="when">${fmtDate(post.publishedAt || post.updatedAt)} · ${post.readingTime || 3} min read</div></div><div class="share">${shareButtons(location.origin + '/p/' + post.slug, post.title)}</div></div>
    ${post.cover?.url ? `<figure class="article-figure">${mediaHtml({ ...post, id: post.slug })}${post.cover.credit || post.cover.alt ? `<figcaption>${esc(post.cover.alt || '')}${post.cover.credit ? ` <span style="opacity:.75">Image: ${esc(post.cover.credit)}</span>` : ''}</figcaption>` : ''}</figure>` : ''}
    <div class="prose">${post.html || renderMarkdown(post.body || '')}</div>
    ${post.sourceStory?.url ? `<div class="readout" style="margin-top:36px"><div><div class="t">Original reporting</div><div class="s">${esc(post.sourceStory.source || 'Source')}</div></div><a class="btn" href="${esc(post.sourceStory.url)}" target="_blank" rel="noopener">Read the source ${ICON.ext}</a></div>` : ''}
    ${post.aiAssisted ? `<div class="ai-note" style="margin-top:20px">${ICON.spark.replace('<svg', '<svg width="15" height="15" style="flex:none;margin-top:2px"')}<span>This article was drafted with the help of AI and reviewed by the Tensor Street desk.</span></div>` : ''}
    ${post.tags?.length ? `<div class="tags" style="margin:28px 0">${post.tags.map((t) => `<a href="/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : '<div style="height:28px"></div>'}
    <div id="subscribe">${signupHtml()}</div>`;
  wireSignups(root);

  try {
    const { posts } = await api('/api/posts?limit=7');
    const more = posts.filter((p) => p.slug !== post.slug).slice(0, 3);
    if (more.length) $('#more').innerHTML = `<div class="sec-head"><h2><span class="bar"></span>More from the Desk</h2></div><div class="cards-3">${more.map(deskCard).join('')}</div>`;
  } catch {}
}

main();
