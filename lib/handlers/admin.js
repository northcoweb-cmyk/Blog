import { checkPassword, setSession, clearSession, isAdmin, requireAdmin, adminPassword } from '../auth.js';
import { json, getQuery, readJson, verify, sign, noStore, siteOrigin } from '../http.js';
import { listPosts, getPost, savePost, deletePost, uploadImage, storageMode } from '../content.js';
import { ghStatus, githubConfig } from '../github.js';
import { getNews } from '../news.js';
import { getMarkets } from '../markets.js';
import { getBrief, draftArticle } from '../brief.js';
import { llmProvider } from '../llm.js';
import { newsletterEnabled, createEmail, briefToMarkdown } from '../newsletter.js';
import { runDaily } from './cron.js';
import { SITE } from '../site.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const adminRoutes = {
  async login(req, res) {
    noStore(res);
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    if (!adminPassword()) return json(res, 503, { error: 'Admin is locked. Add an ADMIN_PASSWORD environment variable in Vercel → Settings → Environment Variables, then redeploy.' });
    const { password } = await readJson(req).catch(() => ({}));
    if (!checkPassword(password)) {
      await wait(700); // slow down guessing
      return json(res, 401, { error: 'Wrong password.' });
    }
    setSession(req, res);
    json(res, 200, { ok: true });
  },

  async logout(req, res) {
    noStore(res);
    clearSession(res);
    json(res, 200, { ok: true });
  },

  async session(req, res) {
    noStore(res);
    if (!isAdmin(req)) return json(res, 200, { authed: false, locked: !adminPassword(), devPassword: !process.env.VERCEL && !process.env.ADMIN_PASSWORD });
    json(res, 200, { authed: true });
  },

  async status(req, res) {
    if (!requireAdmin(req, res)) return;
    const [gh, news, markets] = await Promise.all([ghStatus(), getNews().catch((e) => ({ error: e.message, sources: [] })), getMarkets().catch(() => ({ ok: false }))]);
    json(res, 200, {
      storage: { mode: storageMode(), github: gh },
      ai: { provider: llmProvider() },
      newsletter: { enabled: newsletterEnabled(), autosend: process.env.NEWSLETTER_AUTOSEND === 'true' },
      cron: { secret: !!process.env.CRON_SECRET, autoDrafts: Number(process.env.AUTO_DRAFT_COUNT ?? 2), autoPublish: process.env.AUTO_PUBLISH === 'true' },
      markets: { ok: markets.ok, provider: markets.provider, errors: markets.errors },
      news: { generatedAt: news.generatedAt, stories: news.count, sources: news.sources },
      site: { ...SITE, origin: siteOrigin(req), repo: githubConfig().repo, branch: githubConfig().branch },
    });
  },

  // GET list | GET ?slug= | POST save | DELETE ?slug=
  async posts(req, res) {
    if (!requireAdmin(req, res)) return;
    const q = getQuery(req);
    try {
      if (req.method === 'GET') {
        if (q.slug) {
          const post = await getPost(q.slug, { includeDrafts: true });
          return post ? json(res, 200, { post }) : json(res, 404, { error: 'Not found' });
        }
        return json(res, 200, { posts: await listPosts({ includeDrafts: true }), writable: storageMode() !== 'readonly' });
      }
      if (req.method === 'POST') {
        const body = await readJson(req);
        const post = await savePost(body.post || {}, { image: body.image });
        return json(res, 200, { post });
      }
      if (req.method === 'DELETE') {
        await deletePost(q.slug);
        return json(res, 200, { ok: true });
      }
      json(res, 405, { error: 'Method not allowed' });
    } catch (e) {
      json(res, e.status || 500, { error: e.message });
    }
  },

  async upload(req, res) {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readJson(req);
      json(res, 200, await uploadImage(body));
    } catch (e) {
      json(res, e.status || 500, { error: e.message });
    }
  },

  // POST { id } or { u, s } (+ notes) → AI draft for the editor
  async draft(req, res) {
    if (!requireAdmin(req, res)) return;
    if (!llmProvider()) return json(res, 503, { error: 'Connect a free AI key (GEMINI_API_KEY) to draft with AI.' });
    const body = await readJson(req).catch(() => ({}));
    const news = await getNews();
    const story = news.stories.find((s) => s.id === body.id) || (body.u && verify(body.u, body.s) ? news.stories.find((s) => s.url === body.u) : null);
    if (!story) return json(res, 404, { error: 'Story not found in the current feed. Refresh and try again.' });
    try {
      const d = await draftArticle(story, String(body.notes || '').slice(0, 1000));
      json(res, 200, {
        draft: {
          title: d.title || story.title,
          dek: d.dek || '',
          body: d.body || '',
          tags: Array.isArray(d.tags) ? d.tags : story.tags,
          section: story.section,
          cover: story.image ? { url: story.image, alt: story.title, credit: story.source } : null,
          sourceStory: { title: story.title, url: story.url, source: story.source },
          aiAssisted: true,
        },
      });
    } catch (e) {
      json(res, 502, { error: `AI draft failed: ${e.message}` });
    }
  },

  async newsletter(req, res) {
    if (!requireAdmin(req, res)) return;
    const brief = await getBrief();
    const md = briefToMarkdown(brief, siteOrigin(req), SITE.name);
    if (req.method === 'GET') return json(res, 200, { subject: `${SITE.name} · ${brief.title}: ${brief.items[0]?.headline || brief.items[0]?.title || ''}`.slice(0, 150), markdown: md, brief });
    try {
      const out = await createEmail({ subject: `${brief.title}: ${brief.items[0]?.headline || brief.items[0]?.title || SITE.name}`.slice(0, 150), body: md });
      json(res, 200, { ok: true, status: out.status });
    } catch (e) {
      json(res, 502, { error: e.message });
    }
  },

  // Signs an image URL so the Social Studio can draw it through /api/img.
  async sign(req, res) {
    if (!requireAdmin(req, res)) return;
    const { u } = getQuery(req);
    if (!u || !/^https?:\/\//.test(u)) return json(res, 400, { error: 'Bad URL' });
    json(res, 200, { sig: sign(u) });
  },

  // Instagram autopilot: GET status | POST { action: save-token | settings | post-next | post-image | disconnect }
  async instagram(req, res) {
    if (!requireAdmin(req, res)) return;
    const igx = await import('../instagram.js');
    const origin = siteOrigin(req);
    try {
      if (req.method === 'GET') {
        const [status, pack] = await Promise.all([igx.autopilotStatus({ origin }), igx.dailyPack({ origin }).catch(() => [])]);
        return json(res, 200, { ...status, pack });
      }
      const body = await readJson(req);
      if (body.action === 'save-token') {
        const me = await igx.saveToken(body.token);
        return json(res, 200, { ok: true, username: me.username });
      }
      if (body.action === 'disconnect') {
        await igx.disconnect();
        return json(res, 200, { ok: true });
      }
      if (body.action === 'settings') {
        const next = {};
        if ('enabled' in body) next.enabled = !!body.enabled;
        if (body.perDay) next.perDay = Math.max(1, Math.min(25, Number(body.perDay)));
        if (body.startHour != null) next.startHour = Math.max(0, Math.min(23, Number(body.startHour)));
        if (body.endHour != null) next.endHour = Math.max(1, Math.min(24, Number(body.endHour)));
        if (next.startHour != null && next.endHour != null && next.endHour <= next.startHour) return json(res, 400, { error: 'End hour must be after start hour.' });
        await igx.saveSettings(next, 'Update Instagram autopilot settings');
        return json(res, 200, { ok: true });
      }
      if (body.action === 'post-next') return json(res, 200, await igx.runAutopilot({ origin, force: true }));
      if (body.action === 'post-image') {
        // From the Social Studio: an image already uploaded to /media on this site.
        const url = String(body.imageUrl || '');
        if (!/^\/media\/[\w/.-]+\.jpe?g$/i.test(url)) return json(res, 400, { error: 'Bad image' });
        const { token } = await igx.getToken();
        if (!token) return json(res, 400, { error: 'Connect Instagram first (Admin → Instagram).' });
        const me = await igx.getMe(token);
        const out = await igx.publishImage(token, me.id, origin + url, String(body.caption || '').slice(0, 2200));
        return json(res, 200, { ok: true, ...out });
      }
      json(res, 400, { error: 'Unknown action' });
    } catch (e) {
      json(res, e.status || 500, { error: e.message });
    }
  },

  async 'run-daily'(req, res) {
    if (!requireAdmin(req, res)) return;
    const report = await runDaily({ origin: siteOrigin(req) });
    json(res, 200, report);
  },
};
