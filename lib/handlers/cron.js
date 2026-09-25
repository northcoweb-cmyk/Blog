import { json, noStore, siteOrigin } from '../http.js';
import { getNews } from '../news.js';
import { getBrief, draftArticle } from '../brief.js';
import { llmProvider } from '../llm.js';
import { canWrite, saveEdition, getEdition, listPosts, savePost } from '../content.js';
import { newsletterEnabled, createEmail, briefToMarkdown } from '../newsletter.js';
import { SITE } from '../site.js';

/**
 * The daily job (Vercel Cron, see vercel.json). Each step is independent and
 * idempotent, so a failure in one never blocks the others.
 *  1. Refresh the wire and write the day's brief
 *  2. Archive it as a dated edition (needs GitHub connected)
 *  3. Draft the newsletter email in Buttondown
 *  4. Auto-draft articles on the top stories (needs AI + GitHub)
 */
export async function runDaily({ origin }) {
  const report = { startedAt: new Date().toISOString(), steps: {} };
  const step = async (name, fn) => {
    try {
      report.steps[name] = (await fn()) ?? 'ok';
    } catch (e) {
      report.steps[name] = `error: ${e.message}`;
    }
  };

  const news = await getNews({ force: true });
  const brief = await getBrief();
  report.steps.news = `${news.count} stories from ${news.sources.filter((s) => s.ok).length}/${news.sources.length} sources`;
  report.steps.brief = brief.ai ? 'AI-written' : 'standard';

  await Promise.all([
    step('archive', async () => {
      if (!canWrite()) return 'skipped (connect GitHub to keep an archive)';
      if (await getEdition(brief.date)) return 'already archived';
      await saveEdition({
        date: brief.date,
        title: brief.title,
        intro: brief.intro,
        ai: brief.ai,
        items: brief.items,
        top: news.stories.slice(0, 24).map(({ id, title, url, sig, source, section, image, date, summary }) => ({ id, title, url, sig, source, section, image, date, summary })),
        generatedAt: new Date().toISOString(),
      });
      return 'saved';
    }),
    step('newsletter', async () => {
      if (!newsletterEnabled()) return 'skipped (BUTTONDOWN_API_KEY not set)';
      const out = await createEmail({ subject: `${brief.title}: ${brief.items[0]?.headline || brief.items[0]?.title || SITE.name}`.slice(0, 150), body: briefToMarkdown(brief, origin, SITE.name) });
      return out.status === 'draft' ? 'draft created in Buttondown' : 'sent';
    }),
    step('autoDrafts', async () => {
      const n = Math.max(0, Math.min(5, Number(process.env.AUTO_DRAFT_COUNT ?? 2)));
      if (!n) return 'off';
      if (!llmProvider()) return 'skipped (no AI key)';
      if (!canWrite()) return 'skipped (connect GitHub)';
      const existing = new Set((await listPosts({ includeDrafts: true })).map((p) => p.sourceStory?.url).filter(Boolean));
      // Prefer launches and big multi-source stories — the ones readers want explained.
      const picks = news.stories
        .filter((s) => !existing.has(s.url) && s.summary)
        .map((s) => ({ s, w: s.rank * (s.section === 'models' ? 1.5 : 1) * (1 + Math.log2(s.coverage || 1)) }))
        .sort((a, b) => b.w - a.w)
        .map(({ s }) => s)
        .slice(0, n);
      const publish = process.env.AUTO_PUBLISH === 'true';
      const results = await Promise.all(
        picks.map(async (s) => {
          try {
            const d = await draftArticle(s);
            const post = await savePost({
              title: d.title || s.title,
              dek: d.dek || '',
              body: d.body || '',
              tags: Array.isArray(d.tags) ? d.tags : s.tags,
              section: s.section,
              cover: s.image ? { url: s.image, alt: s.title, credit: s.source } : null,
              sourceStory: { title: s.title, url: s.url, source: s.source },
              status: publish ? 'published' : 'draft',
              aiAssisted: true,
              author: 'Tensor Street Desk',
            });
            return `${publish ? 'published' : 'drafted'}: ${post.title}`;
          } catch (e) {
            return `failed: ${s.title} (${e.message})`;
          }
        }),
      );
      return results.length ? results : 'nothing new to draft';
    }),
  ]);

  report.finishedAt = new Date().toISOString();
  return report;
}

export const cronRoutes = {
  async daily(req, res) {
    noStore(res);
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || '';
    const fromVercelCron = /vercel-cron/i.test(req.headers['user-agent'] || '');
    if (secret ? auth !== `Bearer ${secret}` : !fromVercelCron) return json(res, 401, { error: 'Unauthorized' });
    json(res, 200, await runDaily({ origin: siteOrigin(req) }));
  },
};
