// Tensor Street Newsroom — the admin app (/admin).
import { $, $$, esc, api, SECTIONS, sectionById, timeAgo, fmtDate, mediaHtml, LOGO_MARK, logoHtml, toast, ICON } from './site.js';
import { renderMarkdown } from './md.js';
import { FORMATS, STYLES, renderCard, caption } from './social-render.js';

const root = $('#admin-root');
const I = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  posts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>',
  wire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>',
  ig: ICON.instagram,
  mail: ICON.mail,
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  site: ICON.ext,
};

const post = (path, body, method = 'POST') => api(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), timeout: 60000 });
const spinner = '<span class="spin"></span>';

// ── Auth ─────────────────────────────────────────────────────────────────
async function boot() {
  const s = await api('/api/admin/session').catch(() => ({ authed: false }));
  if (!s.authed) return renderLogin(s);
  renderShell();
  window.addEventListener('hashchange', route);
  route();
}

function renderLogin(s) {
  root.innerHTML = `<div class="login"><form class="login-card" id="login">
    ${logoHtml()}
    <h1>Newsroom sign in</h1><p>Publish articles, draft with AI, and make social posts.</p>
    ${s.locked ? `<div class="note warn">The newsroom is locked until you set an <code>ADMIN_PASSWORD</code> environment variable in Vercel (Settings → Environment Variables), then redeploy.</div>` : `
    <div class="field"><label for="pw">Password</label><input class="in" id="pw" type="password" autocomplete="current-password" required autofocus></div>
    ${s.devPassword ? '<p style="margin:10px 0 0;font-size:12.5px">Local dev password: <code>tensor</code></p>' : ''}
    <button class="btn btn-primary" style="width:100%;margin-top:16px;height:44px">Sign in</button><div class="err" id="err"></div>`}
    <p style="margin:18px 0 0;text-align:center;font-size:13px"><a href="/" style="color:var(--muted)">← Back to site</a></p>
  </form></div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = spinner;
    try {
      await post('/api/admin/login', { password: $('#pw').value });
      location.reload();
    } catch (err) {
      $('#err').textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  };
}

// ── Shell ────────────────────────────────────────────────────────────────
const NAV = [
  ['dashboard', 'Dashboard', I.dash],
  ['posts', 'Articles', I.posts],
  ['new', 'Write', I.pen],
  ['newsroom', 'Newsroom wire', I.wire],
  ['studio', 'Social studio', I.ig],
  ['instagram', 'Instagram autopilot', ICON.spark],
  ['newsletter', 'Newsletter', I.mail],
  ['setup', 'Setup & status', I.gear],
];

function renderShell() {
  root.innerHTML = `<div class="adm">
    <aside class="adm-side" id="side">${logoHtml()}
      <div class="grp">Newsroom</div>${NAV.slice(0, 4).map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${i}${l}</a>`).join('')}
      <div class="grp">Grow</div>${NAV.slice(4).map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${i}${l}</a>`).join('')}
      <div class="foot"><a href="/" target="_blank">${I.site}View site</a><button class="lnk" id="logout">${I.out}Sign out</button></div>
    </aside>
    <div class="adm-main"><div class="adm-top"><div style="display:flex;align-items:center;gap:10px"><button class="icon-btn adm-menu" id="menu">${ICON.menu}</button><h1 id="title"></h1></div><div class="acts" id="top-acts"></div></div><div class="adm-body" id="view"></div></div>
  </div>`;
  $('#logout').onclick = async () => {
    await post('/api/admin/logout', {});
    location.reload();
  };
  $('#menu').onclick = () => $('#side').classList.toggle('open');
}

function setHeader(title, acts = '') {
  $('#title').textContent = title;
  $('#top-acts').innerHTML = acts;
  document.title = `${title} · Newsroom`;
}

function route() {
  const [, k = 'dashboard', arg] = location.hash.split('/');
  $$('.adm-side a[data-k]').forEach((a) => (a.dataset.k === k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#side').classList.remove('open');
  window.scrollTo(0, 0);
  const view = $('#view');
  view.innerHTML = `<div class="sk sk-title" style="width:30%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div>`;
  ({ dashboard, posts: postsView, new: () => editor(null), edit: () => editor(decodeURIComponent(arg || '')), newsroom, studio, instagram, newsletter, setup }[k] || dashboard)(view, arg);
}

let statusCache;
const getStatus = (force) => (!force && statusCache) || (statusCache = api('/api/admin/status', { timeout: 30000 }));

// ── Dashboard ────────────────────────────────────────────────────────────
async function dashboard(view) {
  setHeader('Dashboard', `<a class="btn btn-brand btn-sm" href="#/new">${I.pen} Write article</a>`);
  const [st, { posts }] = await Promise.all([getStatus(true), api('/api/admin/posts')]);
  const pub = posts.filter((p) => p.status === 'published').length;
  const okSources = st.news.sources.filter((s) => s.ok).length;
  const checks = setupChecks(st);
  const done = checks.filter((c) => c.state === 'ok').length;
  view.innerHTML = `
    <div class="stats">
      <div class="panel stat"><div class="k">Stories on the wire</div><div class="v">${st.news.stories ?? 0}</div><div class="s">Refreshed ${timeAgo(st.news.generatedAt).toLowerCase()}</div></div>
      <div class="panel stat"><div class="k">News sources online</div><div class="v">${okSources}<span style="color:var(--faint);font-size:18px">/${st.news.sources.length}</span></div><div class="s">${okSources === st.news.sources.length ? 'All feeds healthy' : 'Some feeds are down, that’s normal'}</div></div>
      <div class="panel stat"><div class="k">Published articles</div><div class="v">${pub}</div><div class="s">${posts.length - pub} draft${posts.length - pub === 1 ? '' : 's'}</div></div>
      <div class="panel stat"><div class="k">Setup</div><div class="v">${done}<span style="color:var(--faint);font-size:18px">/${checks.length}</span></div><div class="s"><a href="#/setup" style="color:var(--brand)">Finish setup →</a></div></div>
    </div>
    <div class="grid">
      <div class="col-8 panel panel-pad"><div class="sec-head"><h2>Recent articles</h2><a class="more" href="#/posts">All articles ${ICON.arrow}</a></div>${postsTable(posts.slice(0, 6))}</div>
      <div class="col-4 stack">
        <div class="panel panel-pad"><div class="sec-head"><h2>Quick actions</h2></div><div style="display:grid;gap:8px">
          <a class="btn" href="#/newsroom">${I.wire} Turn a headline into an article</a>
          <a class="btn" href="#/studio">${I.ig} Make an Instagram post</a>
          <button class="btn" id="run-daily">${ICON.spark} Run the daily job now</button>
        </div><pre class="code" id="daily-out" style="display:none;margin-top:12px"></pre></div>
        <div class="panel panel-pad"><div class="sec-head"><h2>Setup</h2></div>${checks.map((c) => `<div style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13.5px"><span class="st ${c.state}" style="width:20px;height:20px;font-size:11px;border-radius:50%;display:grid;place-items:center;flex:none">${c.state === 'ok' ? '✓' : c.state === 'warn' ? '!' : '·'}</span>${esc(c.title)}</div>`).join('')}</div>
      </div>
    </div>`;
  $('#run-daily').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.innerHTML = `${spinner} Running…`;
    try {
      const r = await post('/api/admin/run-daily', {});
      $('#daily-out').style.display = 'block';
      $('#daily-out').textContent = JSON.stringify(r.steps, null, 2);
      toast('Daily job finished');
    } catch (err) {
      toast(err.message);
    } finally {
      b.disabled = false;
      b.innerHTML = `${ICON.spark} Run the daily job now`;
    }
  };
}

function postsTable(posts) {
  if (!posts.length) return `<div class="empty">No articles yet. <a href="#/new" style="color:var(--brand)">Write your first one</a> or <a href="#/newsroom" style="color:var(--brand)">start from a headline</a>.</div>`;
  return `<table class="tbl"><thead><tr><th>Title</th><th class="hide-sm">Desk</th><th>Status</th><th class="hide-sm">Updated</th><th></th></tr></thead><tbody>${posts
    .map((p) => {
      const scheduled = p.status === 'published' && Date.parse(p.publishedAt) > Date.now();
      return `<tr><td class="ttl"><a href="#/edit/${encodeURIComponent(p.slug)}">${esc(p.title)}</a><small>${esc(p.author)}${p.aiAssisted ? ' · AI-assisted' : ''}</small></td><td class="hide-sm">${esc(sectionById(p.section).name)}</td><td><span class="status ${scheduled ? 'scheduled' : p.status}">${scheduled ? 'Scheduled' : p.status}</span></td><td class="hide-sm" style="color:var(--muted)">${timeAgo(p.updatedAt)}</td>
      <td><div class="acts"><a class="btn btn-sm" href="#/edit/${encodeURIComponent(p.slug)}">Edit</a>${p.status === 'published' ? `<a class="btn btn-sm btn-ghost" href="/p/${encodeURIComponent(p.slug)}" target="_blank">View</a>` : ''}</div></td></tr>`;
    })
    .join('')}</tbody></table>`;
}

async function postsView(view) {
  setHeader('Articles', `<a class="btn btn-brand btn-sm" href="#/new">${I.pen} New article</a>`);
  const { posts, writable } = await api('/api/admin/posts');
  view.innerHTML = `${writable ? '' : readonlyNote()}<div class="panel panel-pad">${postsTable(posts)}</div>`;
}

const readonlyNote = () => `<div class="note warn" style="margin-bottom:18px">Publishing is off until GitHub is connected. It takes about 3 minutes. See <a href="#/setup" style="text-decoration:underline">Setup</a>.</div>`;

// ── Editor ───────────────────────────────────────────────────────────────
async function editor(view, slug) {
  view = $('#view');
  let p = { title: '', dek: '', body: '', section: 'ai', tags: [], author: '', cover: null, featured: false, status: 'draft' };
  const pending = sessionStorage.getItem('ts-draft');
  if (slug) {
    try {
      p = (await api(`/api/admin/posts?slug=${encodeURIComponent(slug)}`)).post;
    } catch {
      view.innerHTML = `<div class="empty">Article not found.</div>`;
      return;
    }
  } else if (pending) {
    p = { ...p, ...JSON.parse(pending) };
    sessionStorage.removeItem('ts-draft');
  }
  const isNew = !slug;
  setHeader(isNew ? 'New article' : 'Edit article', `<button class="btn btn-sm btn-ghost" id="preview-btn">Preview</button><button class="btn btn-sm" id="save-draft">Save draft</button><button class="btn btn-sm btn-brand" id="publish">${p.status === 'published' ? 'Update' : 'Publish'}</button>`);
  const pubLocal = p.publishedAt ? new Date(Date.parse(p.publishedAt) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  view.innerHTML = `<div class="editor">
    <div style="display:flex;flex-direction:column;gap:14px">
      <input class="in title" id="f-title" placeholder="Headline" value="${esc(p.title)}">
      <textarea class="ta" id="f-dek" rows="2" placeholder="Subheadline: one sentence that makes people want to read">${esc(p.dek)}</textarea>
      <div class="split" id="split">
        <div><div class="toolbar" id="tb">
          <button data-md="## " title="Heading">H2</button><button data-md="### " title="Subheading">H3</button><button data-wrap="**" title="Bold"><b>B</b></button><button data-wrap="*" title="Italic"><i>I</i></button>
          <button data-link title="Link">Link</button><button data-md="> " title="Quote">Quote</button><button data-md="- " title="List">List</button><button data-img title="Upload image">Image</button><button data-embed title="YouTube embed">Video</button>
          <span style="flex:1"></span><button id="toggle-prev">Hide preview</button></div>
          <textarea class="ta body" id="f-body" placeholder="Write in Markdown. ## for headings, **bold**, [links](https://…)">${esc(p.body)}</textarea></div>
        <div class="preview-pane" id="prev"><div class="prose"></div></div>
      </div>
      <div class="meta" id="wc"></div>
    </div>
    <div class="side">
      <div class="panel panel-pad" style="display:grid;gap:14px">
        <div class="field"><label>Cover image</label><div class="cover-drop" id="cover-drop">${p.cover?.url ? `<img src="${esc(p.cover.url)}" alt="">` : ''}<div>${p.cover?.url ? 'Click or drop to replace' : 'Click or drop an image<br><span style="font-size:12px">JPG, PNG or WebP. Resized automatically.</span>'}</div></div><input type="file" id="cover-file" accept="image/*" hidden>
        ${p.cover?.url ? '<button class="btn btn-sm btn-ghost" id="cover-rm" style="align-self:flex-start">Remove cover</button>' : ''}</div>
        <div class="row2"><div class="field"><label>Caption / alt</label><input class="in" id="f-alt" value="${esc(p.cover?.alt || '')}"></div><div class="field"><label>Credit</label><input class="in" id="f-credit" value="${esc(p.cover?.credit || '')}"></div></div>
      </div>
      <div class="panel panel-pad" style="display:grid;gap:14px">
        <div class="field"><label>Desk</label><select class="sel" id="f-section">${SECTIONS.map((s) => `<option value="${s.id}"${s.id === p.section ? ' selected' : ''}>${esc(s.long)}</option>`).join('')}</select></div>
        <div class="field"><label>Tags</label><input class="in" id="f-tags" value="${esc((p.tags || []).join(', '))}" placeholder="OpenAI, Chips, Jobs"><span class="hint">Comma separated</span></div>
        <div class="field"><label>Author</label><input class="in" id="f-author" value="${esc(p.author || '')}" placeholder="Tensor Street Desk"></div>
        <div class="field"><label>URL slug</label><input class="in" id="f-slug" value="${esc(p.slug || '')}" placeholder="auto from headline"></div>
        <div class="field"><label>Publish date</label><input class="in" type="datetime-local" id="f-date" value="${pubLocal}"><span class="hint">Leave empty for “now”. A future date schedules it.</span></div>
        <label class="switch">Feature on homepage<input type="checkbox" id="f-featured"${p.featured ? ' checked' : ''}></label>
      </div>
      ${p.sourceStory?.url ? `<div class="panel panel-pad" style="font-size:13px"><div style="color:var(--muted);margin-bottom:4px">Based on</div><a href="${esc(p.sourceStory.url)}" target="_blank" style="font-weight:600">${esc(p.sourceStory.title)}</a><div style="color:var(--muted)">${esc(p.sourceStory.source || '')}</div></div>` : ''}
      ${p.aiAssisted ? '<div class="note">This draft was written with AI. Check every fact against the source before publishing. Published AI-assisted posts are labeled for readers.</div>' : ''}
      ${!isNew ? '<button class="btn" id="del" style="color:var(--down)">Delete article</button>' : ''}
    </div></div>`;

  const body = $('#f-body');
  let cover = p.cover;
  let coverUpload = null;
  const prev = () => {
    $('#prev .prose').innerHTML = renderMarkdown(body.value) || '<p style="color:var(--faint)">Preview appears here.</p>';
    const words = body.value.split(/\s+/).filter(Boolean).length;
    $('#wc').textContent = `${words} words · ${Math.max(1, Math.round(words / 230))} min read`;
  };
  body.addEventListener('input', prev);
  prev();
  $('#toggle-prev').onclick = (e) => {
    const on = $('#prev').style.display !== 'none';
    $('#prev').style.display = on ? 'none' : '';
    $('#split').style.gridTemplateColumns = on ? '1fr' : '';
    e.target.textContent = on ? 'Show preview' : 'Hide preview';
  };

  // Toolbar
  const insert = (before, after = '', placeholder = '') => {
    const s = body.selectionStart;
    const e = body.selectionEnd;
    const sel = body.value.slice(s, e) || placeholder;
    body.setRangeText(before + sel + after, s, e, 'end');
    body.focus();
    prev();
  };
  $('#tb').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || b.id === 'toggle-prev') return;
    e.preventDefault();
    if (b.dataset.md) {
      const s = body.value.lastIndexOf('\n', body.selectionStart - 1) + 1;
      body.setRangeText(b.dataset.md, s, s, 'end');
      body.focus();
      prev();
    } else if (b.dataset.wrap) insert(b.dataset.wrap, b.dataset.wrap, 'text');
    else if (b.hasAttribute('data-link')) {
      const url = prompt('Link URL', 'https://');
      if (url) insert('[', `](${url})`, 'link text');
    } else if (b.hasAttribute('data-embed')) {
      const url = prompt('YouTube URL');
      if (url) insert(`\n{{embed:${url}}}\n`);
    } else if (b.hasAttribute('data-img')) {
      const f = await pickFile();
      if (!f) return;
      toast('Uploading image…');
      try {
        const img = await resizeImage(f);
        const { url } = await post('/api/admin/upload', img);
        insert(`\n![${f.name.replace(/\.[^.]+$/, '')}](${url} "Caption")\n`);
        toast('Image added');
      } catch (err) {
        toast(err.message);
      }
    }
  });

  // Cover
  const drop = $('#cover-drop');
  const setCoverFile = async (f) => {
    if (!f?.type.startsWith('image/')) return;
    coverUpload = await resizeImage(f);
    drop.innerHTML = `<img src="${coverUpload.data}" alt=""><div>Will upload on save</div>`;
  };
  drop.onclick = () => $('#cover-file').click();
  $('#cover-file').onchange = (e) => setCoverFile(e.target.files[0]);
  drop.ondragover = (e) => (e.preventDefault(), drop.classList.add('drag'));
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    setCoverFile(e.dataTransfer.files[0]);
  };
  $('#cover-rm')?.addEventListener('click', () => {
    cover = null;
    coverUpload = null;
    drop.innerHTML = '<div>Click or drop an image</div>';
  });

  const collect = (status) => {
    const d = $('#f-date').value;
    return {
      originalSlug: p.slug || undefined,
      slug: $('#f-slug').value.trim() || undefined,
      title: $('#f-title').value.trim(),
      dek: $('#f-dek').value.trim(),
      body: body.value,
      section: $('#f-section').value,
      tags: $('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      author: $('#f-author').value.trim(),
      featured: $('#f-featured').checked,
      cover: cover || coverUpload ? { url: cover?.url || '', alt: $('#f-alt').value, credit: $('#f-credit').value } : null,
      publishedAt: d ? new Date(d).toISOString() : undefined,
      status,
      sourceStory: p.sourceStory,
      aiAssisted: p.aiAssisted,
    };
  };

  const save = async (status, btn) => {
    const data = collect(status);
    if (!data.title) return toast('Add a headline first');
    if (status === 'published' && data.body.trim().length < 40) return toast('Write a little more before publishing');
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = spinner;
    try {
      const { post: saved } = await post('/api/admin/posts', { post: data, image: coverUpload });
      toast(status === 'published' ? 'Published. It’s live within a minute.' : 'Draft saved');
      statusCache = null;
      if (saved.slug !== p.slug || !slug) location.hash = `#/edit/${encodeURIComponent(saved.slug)}`;
      else route();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = label;
    }
  };
  $('#save-draft').onclick = (e) => save('draft', e.currentTarget);
  $('#publish').onclick = (e) => save('published', e.currentTarget);
  $('#preview-btn').onclick = () => {
    const d = collect(p.status);
    if (coverUpload) d.cover = { ...(d.cover || {}), url: coverUpload.data };
    d.publishedAt ||= new Date().toISOString();
    d.author ||= 'Tensor Street Desk';
    sessionStorage.setItem('ts-preview', JSON.stringify(d));
    window.open('/post?preview=1', '_blank');
  };
  $('#del')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${p.title}”? This can’t be undone from here (it stays in your GitHub history).`)) return;
    try {
      await api(`/api/admin/posts?slug=${encodeURIComponent(p.slug)}`, { method: 'DELETE' });
      toast('Deleted');
      location.hash = '#/posts';
    } catch (err) {
      toast(err.message);
    }
  });
}

function pickFile() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.onchange = () => resolve(i.files[0]);
    i.click();
  });
}

/** Shrink big photos in the browser before upload (keeps uploads fast and under Vercel's 4.5 MB limit). */
async function resizeImage(file, max = 1800) {
  if (file.type === 'image/gif') {
    if (file.size > 3_000_000) throw new Error('GIF too large (max 3 MB)');
    return { data: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }), type: 'image/gif' };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let data = c.toDataURL('image/webp', 0.86);
  let type = 'image/webp';
  if (!data.startsWith('data:image/webp')) {
    data = c.toDataURL('image/jpeg', 0.86);
    type = 'image/jpeg';
  }
  return { data, type };
}

// ── Newsroom wire ────────────────────────────────────────────────────────
async function newsroom(view) {
  setHeader('Newsroom wire');
  const [news, st] = await Promise.all([api('/api/news?limit=120'), getStatus()]);
  const ai = !!st.ai.provider;
  let filter = 'all';
  const draw = () => {
    const list = news.stories.filter((s) => filter === 'all' || s.section === filter);
    view.innerHTML = `${ai ? '' : `<div class="note" style="margin-bottom:16px">Tip: add a free <code>GEMINI_API_KEY</code> (or an <code>OPENAI_API_KEY</code>) and the “Draft with AI” button will write a first draft of any story for you. <a href="#/setup" style="text-decoration:underline">How</a></div>`}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><div class="tabs">${[{ id: 'all', name: 'All' }, ...SECTIONS].map((s) => `<button aria-selected="${s.id === filter}" data-f="${s.id}">${esc(s.name)}</button>`).join('')}</div><span class="meta">${list.length} stories · updated ${timeAgo(news.generatedAt).toLowerCase()}</span></div>
      <div class="panel panel-pad">${list
        .map(
          (s) => `<div class="wire-item" data-id="${s.id}">${mediaHtml(s)}<div><span class="chip" data-sec="${s.section}">${esc(sectionById(s.section).name)}</span>${s.breaking ? ' <span class="pill live">Breaking</span>' : ''}<h4><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></h4><div class="meta"><span class="src">${esc(s.source)}</span><span class="sep"></span>${timeAgo(s.date)}${s.coverage > 1 ? `<span class="sep"></span>${s.coverage} sources` : ''}</div></div>
          <div class="acts">${ai ? `<button class="btn btn-sm btn-brand" data-act="ai">${ICON.spark} Draft with AI</button>` : ''}<button class="btn btn-sm" data-act="write">Write about this</button><button class="btn btn-sm btn-ghost" data-act="social">Social post</button></div></div>`,
        )
        .join('') || '<div class="empty">Nothing here right now.</div>'}</div>`;
  };
  draw();
  view.addEventListener('click', async (e) => {
    const tab = e.target.closest('.tabs button');
    if (tab) {
      filter = tab.dataset.f;
      return draw();
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = news.stories.find((x) => x.id === b.closest('.wire-item').dataset.id);
    if (b.dataset.act === 'write') {
      sessionStorage.setItem('ts-draft', JSON.stringify({ title: s.title, dek: '', body: `${s.summary ? `${s.summary}\n\n` : ''}## Why it matters\n\n\n\n## The details\n\n- \n\nSource: [${s.source}](${s.url})\n`, section: s.section, tags: s.tags, cover: s.image ? { url: s.image, alt: s.title, credit: s.source } : null, sourceStory: { title: s.title, url: s.url, source: s.source } }));
      location.hash = '#/new';
    } else if (b.dataset.act === 'social') {
      sessionStorage.setItem('ts-social', s.id);
      location.hash = '#/studio';
    } else if (b.dataset.act === 'ai') {
      const label = b.innerHTML;
      b.disabled = true;
      b.innerHTML = `${spinner} Writing…`;
      try {
        const { draft } = await post('/api/admin/draft', { id: s.id, u: s.url, s: s.sig });
        sessionStorage.setItem('ts-draft', JSON.stringify(draft));
        location.hash = '#/new';
      } catch (err) {
        toast(err.message);
        b.disabled = false;
        b.innerHTML = label;
      }
    }
  });
}

// ── Social studio (Instagram posts) ──────────────────────────────────────

async function studio(view) {
  setHeader('Social studio', `<button class="btn btn-sm" id="copy-cap">Copy caption</button><button class="btn btn-sm" id="dl">Download PNG</button><button class="btn btn-sm btn-brand" id="post-ig">${ICON.instagram.replace('<svg', '<svg width="15" height="15"')} Post to Instagram</button>`);
  const [news, postsRes] = await Promise.all([api('/api/news?limit=60'), api('/api/admin/posts')]);
  const items = [
    ...postsRes.posts.filter((p) => p.status === 'published').map((p) => ({ kind: 'post', id: 'p:' + p.slug, title: p.title, summary: p.dek, image: p.cover?.url, section: p.section, source: 'From the Desk' })),
    ...news.stories.map((s) => ({ kind: 'wire', id: s.id, title: s.title, summary: s.summary, image: s.image, fallbackImage: s.fallbackImage, section: s.section, source: s.source })),
  ];
  const want = sessionStorage.getItem('ts-social');
  sessionStorage.removeItem('ts-social');
  const state = { item: items.find((i) => i.id === want) || items[0], fmt: 'post', style: 'photo', headline: '', kicker: '', customImg: null, focus: 'center' };
  if (!state.item) {
    view.innerHTML = '<div class="empty">No stories available yet.</div>';
    return;
  }
  state.headline = state.item.title;
  view.innerHTML = `<div class="studio">
    <div class="stack" style="gap:16px">
      <div class="panel panel-pad" style="display:grid;gap:14px">
        <div class="field"><label>Format</label><div class="swatches" id="fmt">${Object.entries(FORMATS).map(([k, v]) => `<button data-v="${k}">${v[2]}</button>`).join('')}</div></div>
        <div class="field"><label>Style</label><div class="swatches" id="sty">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div></div>
        <div class="field"><label>Headline on the image</label><textarea class="ta" id="hl" rows="3">${esc(state.headline)}</textarea><span class="hint">Shorter is stronger: aim for under 12 words.</span></div>
        <div class="field"><label>Kicker</label><input class="in" id="kick" placeholder="e.g. JUST IN, BY THE NUMBERS" value=""></div>
      </div>
      <div class="panel panel-pad" style="display:grid;gap:12px">
        <div class="field"><label>Photo</label><div class="hint" id="photo-status" style="font-size:13px">Loading the article photo…</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" id="up-photo">Upload my own photo</button><button class="btn btn-sm btn-ghost" id="reset-photo" hidden>Use the article photo</button></div>
        <input type="file" id="photo-file" accept="image/*" hidden>
        <div class="field"><label>Photo position</label><div class="swatches" id="focus"><button data-v="top">Top</button><button data-v="center">Center</button><button data-v="bottom">Bottom</button></div><span class="hint">Move the photo up or down so faces and logos aren’t cut off.</span></div>
      </div>
      <div class="panel panel-pad"><div class="field"><label>Pick a story</label><div class="pick-list" id="pick">${items.map((i) => `<button data-id="${esc(i.id)}">${esc(i.title)}<small>${esc(i.source)} · ${esc(sectionById(i.section).name)}</small></button>`).join('')}</div></div></div>
    </div>
    <div class="stack" style="gap:16px"><canvas id="cv"></canvas>
      <div class="panel panel-pad"><div class="field"><label>Caption</label><textarea class="ta" id="cap" rows="9"></textarea></div></div></div>
  </div>`;

  const cv = $('#cv');
  const sync = () => {
    $$('#fmt button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === state.fmt));
    $$('#sty button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === state.style));
    $$('#pick button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === state.item.id));
    $$('#focus button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === state.focus));
    $('#reset-photo').hidden = !state.customImg;
    $('#cap').value = caption(state.item, state.headline);
    draw(cv, state);
  };
  $('#fmt').onclick = (e) => e.target.closest('button') && ((state.fmt = e.target.closest('button').dataset.v), sync());
  $('#sty').onclick = (e) => e.target.closest('button') && ((state.style = e.target.closest('button').dataset.v), sync());
  $('#pick').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.item = items.find((i) => i.id === b.dataset.id);
    state.headline = state.item.title;
    state.customImg = null;
    $('#hl').value = state.headline;
    sync();
  };
  $('#focus').onclick = (e) => e.target.closest('button') && ((state.focus = e.target.closest('button').dataset.v), sync());
  $('#up-photo').onclick = () => $('#photo-file').click();
  $('#photo-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    // Local file → data URL, so the canvas can always export it.
    const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
      state.customImg = img;
      sync();
    } catch {
      toast('That file isn’t an image we can read. Try a JPG or PNG.');
    }
    e.target.value = '';
  };
  $('#reset-photo').onclick = () => ((state.customImg = null), sync());
  $('#hl').oninput = (e) => ((state.headline = e.target.value), draw(cv, state));
  $('#kick').oninput = (e) => ((state.kicker = e.target.value), draw(cv, state));
  $('#dl').onclick = () => {
    try {
      const a = document.createElement('a');
      a.download = `tensorstreet-${state.fmt}-${Date.now()}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
    } catch {
      toast('This photo can’t be exported. Pick another story or style.');
    }
  };
  $('#post-ig').onclick = async (e) => {
    if (state.fmt === 'story') return toast('Instagram feed posts must be 4:5 or square. Switch the format first.');
    if (!confirm('Post this image and caption to Instagram now?')) return;
    const b = e.currentTarget;
    const label = b.innerHTML;
    b.disabled = true;
    b.innerHTML = `${spinner} Posting…`;
    try {
      let data;
      try {
        data = cv.toDataURL('image/jpeg', 0.92);
      } catch {
        throw new Error('This photo can’t be exported. Upload your own photo or pick another story.');
      }
      const { url } = await post('/api/admin/upload', { data, type: 'image/jpeg' });
      const r = await post('/api/admin/instagram', { action: 'post-image', imageUrl: url, caption: $('#cap').value });
      toast('Posted to Instagram!');
      if (r.permalink) window.open(r.permalink, '_blank');
    } catch (err) {
      toast(err.message);
    } finally {
      b.disabled = false;
      b.innerHTML = label;
    }
  };
  $('#copy-cap').onclick = async () => {
    await navigator.clipboard.writeText($('#cap').value);
    toast('Caption copied');
  };
  sync();
}


const imgCache = new Map();
async function loadCanvasImage(url) {
  if (!url) return null;
  if (imgCache.has(url)) return imgCache.get(url);
  const p = (async () => {
    let src = url;
    if (/^https?:/.test(url) && !url.startsWith(location.origin)) {
      const { sig } = await api(`/api/admin/sign?u=${encodeURIComponent(url)}`);
      src = `/api/img?u=${encodeURIComponent(url)}&s=${sig}`;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    return img;
  })().catch(() => null);
  imgCache.set(url, p);
  return p;
}

let drawToken = 0;
async function draw(cv, st) {
  const token = ++drawToken;
  const [W, H] = FORMATS[st.fmt];
  await Promise.all([document.fonts.load('700 80px Geist'), document.fonts.load('500 30px "Geist Mono"'), document.fonts.load('italic 400 60px Newsreader')]).catch(() => {});
  // Photo: your upload → the article's photo → the topic photo → none.
  let img = st.customImg;
  let from = 'your photo';
  if (!img) {
    img = await loadCanvasImage(st.item.image);
    from = st.item.kind === 'post' ? 'the article’s cover photo' : `the article photo (${st.item.source})`;
  }
  if (!img && st.item.fallbackImage) {
    img = await loadCanvasImage(st.item.fallbackImage);
    from = 'a topic photo (the article’s own photo couldn’t be loaded)';
  }
  if (token !== drawToken) return;
  const status = $('#photo-status');
  if (status) status.textContent = img ? `Using ${from}.` : 'No photo available for this story. Upload your own, or try the Ink style.';
  cv.width = W;
  cv.height = H;
  renderCard(cv.getContext('2d'), { ...st, img });
}

// ── Instagram autopilot ──────────────────────────────────────────────────
async function instagram(view) {
  setHeader('Instagram autopilot');
  const st = await api('/api/admin/instagram', { timeout: 60000 });
  const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}</option>`).join('');
  const steps = `<ol style="margin:0;padding-left:18px;display:grid;gap:8px;font-size:14px;color:var(--ink-2)">
      <li>In the Instagram app: <b>Settings → Account type and tools → Switch to professional account</b> → pick <b>Creator</b> (or Business). Category: <i>News &amp; Media Website</i>.</li>
      <li>Go to <a href="https://developers.facebook.com/apps/creation/" target="_blank" style="color:var(--brand)">developers.facebook.com → Create app</a>. Use case: <b>Manage messaging &amp; content on Instagram</b>. App type: Business. Name it “Tensor Street”.</li>
      <li>In the app: <b>Instagram → API setup with Instagram login</b>. Under <b>Generate access tokens</b> click <b>Add account</b> and log in as <b>@tensorstreet</b>. Allow content publishing.</li>
      <li>Click <b>Generate token</b> next to @tensorstreet, copy it (it starts with <code>IG</code>) and paste it below.</li>
    </ol>`;
  if (!st.connected) {
    view.innerHTML = `<div class="grid"><div class="col-8 stack">
      ${st.error ? `<div class="note warn">The saved token didn’t work: ${esc(st.error)}. Paste a fresh one below.</div>` : ''}
      <div class="panel panel-pad"><div class="sec-head"><h2>Connect @tensorstreet</h2></div>${steps}
        <div class="field" style="margin-top:18px"><label>Instagram access token</label><input class="in" id="ig-token" placeholder="IGAA…" autocomplete="off"></div>
        <button class="btn btn-brand" id="ig-save" style="margin-top:12px">Connect Instagram</button>
        ${st.canSave ? '' : '<p class="meta" style="margin-top:10px">Saving needs GitHub connected (GITHUB_TOKEN). You can also add the token in Vercel as <code>INSTAGRAM_ACCESS_TOKEN</code>.</p>'}</div>
    </div><div class="col-4"><div class="panel panel-pad"><div class="sec-head"><h2>What it does</h2></div><p style="margin:0;font-size:14px;color:var(--ink-2)">Posts the day’s biggest AI stories to Instagram automatically, using the same designs as the Social studio, with the article photo, headline and a caption crediting the source. It never posts the same story twice, and spreads posts evenly through the day.</p></div></div></div>`;
    $('#ig-save').onclick = async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.innerHTML = spinner;
      try {
        const r = await post('/api/admin/instagram', { action: 'save-token', token: $('#ig-token').value });
        toast(`Connected as @${r.username}`);
        route();
      } catch (err) {
        toast(err.message);
        b.disabled = false;
        b.textContent = 'Connect Instagram';
      }
    };
    return;
  }
  const s = st.settings;
  view.innerHTML = `<div class="grid">
    <div class="col-8 stack">
      ${st.cronSecret ? '' : '<div class="note warn">Add a <code>CRON_SECRET</code> variable in Vercel so the hourly timer can run the autopilot.</div>'}
      <div class="panel panel-pad"><div class="sec-head"><h2>Next up</h2><span class="meta">What the autopilot will post next</span></div>
        <div class="cards-3">${st.queue.map((q) => `<div class="story"><div class="media" style="aspect-ratio:4/5"><img src="${esc(q.card)}" alt="" loading="lazy"></div><h3 style="font-size:14px">${esc(q.title)}</h3><div class="meta"><span class="src">${esc(q.source)}</span></div></div>`).join('') || '<div class="empty">No new stories to post right now.</div>'}</div></div>
      <div class="panel panel-pad"><div class="sec-head"><h2>Recent posts</h2><a class="more" href="https://instagram.com/${esc(st.username)}" target="_blank">Open Instagram ${ICON.arrow}</a></div>
        <div class="cards-4">${(st.recent || []).map((m) => `<a class="story" href="${esc(m.permalink)}" target="_blank"><div class="media r11">${m.media_url || m.thumbnail_url ? `<img src="${esc(m.media_url || m.thumbnail_url)}" alt="" loading="lazy">` : ''}</div><div class="meta">${timeAgo(m.timestamp)}</div></a>`).join('') || '<div class="empty">No posts yet.</div>'}</div></div>
    </div>
    <div class="col-4 stack">
      <div class="panel panel-pad" style="display:grid;gap:14px">
        <div style="display:flex;align-items:center;gap:10px"><span class="st ok" style="width:24px;height:24px;border-radius:50%;display:grid;place-items:center">✓</span><div><b>@${esc(st.username)}</b><div class="meta">${esc(st.accountType || '')} account connected</div></div></div>
        <label class="switch">Autopilot<input type="checkbox" id="ig-on"${s.enabled ? ' checked' : ''}></label>
        <div class="field"><label>Posts per day</label><select class="sel" id="ig-per">${[3, 4, 5, 6, 7, 8, 10, 12].map((n) => `<option${n === s.perDay ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="row2"><div class="field"><label>First post</label><select class="sel" id="ig-start">${hours(s.startHour)}</select></div><div class="field"><label>Stop by</label><select class="sel" id="ig-end">${hours(s.endHour)}</select></div></div>
        <span class="hint">Times are ${esc(st.timezone)}. Posts are spread evenly between these hours.</span>
        <button class="btn btn-primary" id="ig-settings">Save settings</button>
        <button class="btn" id="ig-now">${ICON.spark} Post the next story now</button>
        <pre class="code" id="ig-out" style="display:none"></pre>
      </div>
      <div class="panel panel-pad" style="font-size:13.5px;color:var(--ink-2)">${st.tokenExpires ? `Token renews itself automatically (next expiry ${fmtDate(st.tokenExpires)}).` : 'Token is set in Vercel (INSTAGRAM_ACCESS_TOKEN). It lasts 60 days: paste it here instead so it renews itself automatically.'}
        <div style="margin-top:10px"><button class="btn btn-sm btn-ghost" id="ig-disc" style="color:var(--down)">Disconnect</button></div></div>
    </div></div>`;
  $('#ig-settings').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await post('/api/admin/instagram', { action: 'settings', enabled: $('#ig-on').checked, perDay: Number($('#ig-per').value), startHour: Number($('#ig-start').value), endHour: Number($('#ig-end').value) });
      toast($('#ig-on').checked ? 'Autopilot is on' : 'Settings saved (autopilot off)');
    } catch (err) {
      toast(err.message);
    }
    b.disabled = false;
  };
  $('#ig-now').onclick = async (e) => {
    if (!confirm('Post the next story to Instagram now?')) return;
    const b = e.currentTarget;
    b.disabled = true;
    b.innerHTML = `${spinner} Posting…`;
    try {
      const r = await post('/api/admin/instagram', { action: 'post-next' });
      $('#ig-out').style.display = 'block';
      $('#ig-out').textContent = r.posted ? `Posted: ${r.story}\n${r.permalink || ''}` : r.reason;
      toast(r.posted ? 'Posted to Instagram!' : r.reason);
    } catch (err) {
      toast(err.message);
    }
    b.disabled = false;
    b.innerHTML = `${ICON.spark} Post the next story now`;
  };
  $('#ig-disc').onclick = async () => {
    if (!confirm('Disconnect Instagram? Autopilot will stop.')) return;
    await post('/api/admin/instagram', { action: 'disconnect' }).catch((err) => toast(err.message));
    route();
  };
}

// ── Newsletter ───────────────────────────────────────────────────────────
async function newsletter(view) {
  setHeader('Newsletter');
  const [n, st] = await Promise.all([api('/api/admin/newsletter', { timeout: 60000 }), getStatus()]);
  view.innerHTML = `<div class="grid"><div class="col-8 panel panel-pad"><div class="sec-head"><h2>Today’s email: ${esc(n.brief.title)}</h2></div>
      <div class="field" style="margin-bottom:12px"><label>Subject</label><input class="in" value="${esc(n.subject)}" readonly></div>
      <div class="preview-pane" style="max-height:none"><div class="prose">${renderMarkdown(n.markdown)}</div></div></div>
    <div class="col-4 stack"><div class="panel panel-pad" style="display:grid;gap:12px">
      ${st.newsletter.enabled
        ? `<p style="margin:0;font-size:14px">Every morning the daily job creates this email in Buttondown as a <strong>${st.newsletter.autosend ? 'sent email' : 'draft'}</strong>. You can also push it now.</p><button class="btn btn-brand" id="push">${I.mail} Create in Buttondown</button><a class="btn" href="https://buttondown.com/emails" target="_blank">Open Buttondown ${ICON.ext}</a>`
        : `<div class="note">Connect Buttondown (free up to 100 subscribers) to collect emails and send this brief automatically. <a href="#/setup" style="text-decoration:underline">Setup</a></div>`}
      <button class="btn" id="copy-md">Copy as Markdown</button></div></div></div>`;
  $('#copy-md').onclick = async () => (await navigator.clipboard.writeText(n.markdown), toast('Copied'));
  $('#push')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.innerHTML = spinner;
    try {
      const r = await post('/api/admin/newsletter', {});
      toast(r.status === 'draft' ? 'Draft created in Buttondown' : 'Sent!');
    } catch (err) {
      toast(err.message);
    }
    b.disabled = false;
    b.innerHTML = `${I.mail} Create in Buttondown`;
  });
}

// ── Setup ────────────────────────────────────────────────────────────────
function setupChecks(st) {
  const gh = st.storage.github;
  return [
    { title: 'Admin password', state: 'ok', body: 'You’re signed in. Change it any time with the <code>ADMIN_PASSWORD</code> variable.' },
    {
      title: 'Publishing (GitHub)',
      state: gh.ok ? 'ok' : st.storage.mode === 'local' ? 'warn' : 'no',
      body: gh.ok
        ? `Connected to <code>${esc(gh.repo)}</code> on branch <code>${esc(gh.branch)}</code>. Articles and images are saved to the repo with full history.`
        : `${st.storage.mode === 'local' ? 'Running locally: posts save to your computer’s <code>content/</code> folder. ' : ''}To publish from the live site:<ol><li>Go to <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">GitHub → Fine-grained tokens</a>.</li><li>Repository access: <strong>Only select repositories</strong> → your blog repo. Permissions → <strong>Contents: Read and write</strong>.</li><li>In Vercel → Project → Settings → Environment Variables add <code>GITHUB_TOKEN</code> = the token.${gh.repo ? '' : ' Also add <code>GITHUB_REPO</code> = <code>owner/repo</code>.'}</li><li>Redeploy.</li></ol>${gh.reason ? `<p style="margin-top:6px;color:var(--down)">${esc(gh.reason)}</p>` : ''}`,
    },
    {
      title: 'AI writing (free)',
      state: st.ai.provider ? 'ok' : 'no',
      body: st.ai.provider
        ? `Using <strong>${esc(st.ai.provider)}</strong>. Stories get “Why it matters” notes, The Brief is AI-written, and you can draft articles from any headline.`
        : `Optional but recommended. <ol><li>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a>.</li><li>Add <code>GEMINI_API_KEY</code> in Vercel → Environment Variables and redeploy.</li></ol>Prefer another provider? <code>GROQ_API_KEY</code> (free), <code>OPENAI_API_KEY</code> (paid per use) or <code>ANTHROPIC_API_KEY</code> (paid) also work.`,
    },
    {
      title: 'Email newsletter',
      state: st.newsletter.enabled ? 'ok' : 'no',
      body: st.newsletter.enabled
        ? `Buttondown connected. Signups go straight to your list; the daily job ${st.newsletter.autosend ? 'sends' : 'drafts'} the morning email.`
        : `Optional. <ol><li>Create a free account at <a href="https://buttondown.com" target="_blank">buttondown.com</a>.</li><li>Copy your API key from Settings → API.</li><li>Add <code>BUTTONDOWN_API_KEY</code> in Vercel and redeploy.</li></ol>Until then, signup boxes point readers to Instagram and RSS.`,
    },
    {
      title: 'Daily automation',
      state: st.cron.secret ? 'ok' : 'warn',
      body: `Runs every morning at 6am ET (set in <code>vercel.json</code>): archives the edition, drafts the newsletter, and writes ${st.cron.autoDrafts} AI draft${st.cron.autoDrafts === 1 ? '' : 's'} on the top stories (${st.cron.autoPublish ? 'auto-published' : 'saved as drafts for you to review'}). ${st.cron.secret ? '' : 'Add a <code>CRON_SECRET</code> variable (any long random text) so only Vercel can trigger it.'}`,
    },
    {
      title: 'Market data',
      state: st.markets.ok ? 'ok' : 'warn',
      body: st.markets.ok ? `Live via ${esc(st.markets.provider)}.` : `The free Yahoo feed didn’t answer. It usually recovers on its own. For a backup, add a free <a href="https://finnhub.io/register" target="_blank">Finnhub</a> key as <code>FINNHUB_API_KEY</code>.`,
    },
  ];
}

async function setup(view) {
  setHeader('Setup & status');
  const st = await getStatus(true);
  const checks = setupChecks(st);
  view.innerHTML = `<div class="grid"><div class="col-8 stack">
      <div class="panel panel-pad">${checks.map((c) => `<div class="check"><span class="st ${c.state}">${c.state === 'ok' ? '✓' : c.state === 'warn' ? '!' : '·'}</span><div><h4>${esc(c.title)}</h4><p>${c.body}</p></div><span></span></div>`).join('')}</div>
      <div class="panel panel-pad"><div class="sec-head"><h2>News sources</h2><span class="meta">${st.news.sources.filter((s) => s.ok).length}/${st.news.sources.length} online</span></div>
      <table class="tbl"><thead><tr><th>Source</th><th class="hide-sm">Desk</th><th>Stories</th><th>Status</th></tr></thead><tbody>${st.news.sources
        .map((s) => `<tr><td class="ttl">${esc(s.name)}<small>${esc(s.id)}</small></td><td class="hide-sm">${esc(sectionById(s.section).name)}</td><td class="num">${s.items}</td><td>${s.ok ? '<span class="status published">Online</span>' : `<span class="status draft" title="${esc(s.error || '')}">Offline</span>`}</td></tr>`)
        .join('')}</tbody></table><p class="meta" style="margin-top:12px">Add or remove feeds in <code>lib/sources.js</code>. A few sources being offline at any moment is normal.</p></div>
    </div>
    <div class="col-4 stack"><div class="panel panel-pad"><div class="sec-head"><h2>Your site</h2></div><div style="display:grid;gap:8px;font-size:14px">
      <div><span style="color:var(--muted)">Address</span><br><a href="${esc(st.site.origin)}" target="_blank" style="font-weight:600">${esc(st.site.origin)}</a></div>
      <div><span style="color:var(--muted)">Storage</span><br><strong>${{ github: 'GitHub (live)', local: 'Local files (dev)', readonly: 'Read-only: connect GitHub' }[st.storage.mode]}</strong></div>
      <div><span style="color:var(--muted)">Instagram</span><br><strong>@${esc(st.site.instagram)}</strong></div>
      <div><span style="color:var(--muted)">Health check</span><br><a href="/api/health" target="_blank" style="color:var(--brand)">/api/health</a></div></div></div>
      <div class="panel panel-pad"><div class="sec-head"><h2>Brand kit</h2></div><p style="margin:0 0 12px;font-size:14px;color:var(--muted)">Logos, colors, profile picture and templates.</p><a class="btn" href="/brand" target="_blank">Open brand kit ${ICON.ext}</a></div>
    </div></div>`;
}

boot();
