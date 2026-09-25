// Storage for your own articles, uploaded images and daily edition archives.
// • With GITHUB_TOKEN → reads/writes the GitHub repo live (works on Vercel).
// • Without it       → reads the files bundled with the deployment, and in local
//                      dev writes straight to ./content on disk.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubConfig, ghRead, ghCommit } from './github.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'content/posts/index.json';

export function storageMode() {
  if (githubConfig().enabled) return 'github';
  return process.env.VERCEL ? 'readonly' : 'local';
}

export const canWrite = () => storageMode() !== 'readonly';

async function readFile(rel) {
  if (storageMode() === 'github') return ghRead(rel);
  try {
    return await fs.readFile(path.join(ROOT, rel));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function readJsonFile(rel, fallback) {
  const buf = await readFile(rel);
  if (!buf) return fallback;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return fallback;
  }
}

/** files: [{ path, content: Buffer|string|null }] */
async function writeFiles(files, message) {
  const mode = storageMode();
  if (mode === 'github') return ghCommit(files, message);
  if (mode === 'readonly') {
    const err = new Error('Publishing needs GitHub connected. Add GITHUB_TOKEN in Vercel → Settings → Environment Variables, then redeploy.');
    err.status = 503;
    throw err;
  }
  for (const f of files) {
    const abs = path.join(ROOT, f.path);
    if (f.content == null) await fs.rm(abs, { force: true });
    else {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, f.content);
    }
  }
  return 'local';
}

/** Generic JSON storage for small settings files under content/. */
export const readData = (rel, fallback) => readJsonFile(rel, fallback);
export const writeData = (rel, data, message) => writeFiles([{ path: rel, content: JSON.stringify(data, null, 2) + '\n' }], message);

// ── Posts ────────────────────────────────────────────────────────────────

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function summarize(post) {
  const { body, ...rest } = post;
  return { ...rest, readingTime: readingTime(body) };
}

export function readingTime(body = '') {
  return Math.max(1, Math.round(String(body).split(/\s+/).filter(Boolean).length / 230));
}

export async function listPosts({ includeDrafts = false } = {}) {
  const index = await readJsonFile(INDEX, []);
  const now = Date.now();
  return index
    .filter((p) => includeDrafts || (p.status === 'published' && Date.parse(p.publishedAt || 0) <= now))
    .sort((a, b) => Date.parse(b.publishedAt || b.updatedAt || 0) - Date.parse(a.publishedAt || a.updatedAt || 0));
}

export async function getPost(slug, { includeDrafts = false } = {}) {
  if (!SAFE_SLUG.test(slug || '')) return null;
  const post = await readJsonFile(`content/posts/${slug}.json`, null);
  if (!post) return null;
  if (!includeDrafts && (post.status !== 'published' || Date.parse(post.publishedAt || 0) > Date.now())) return null;
  return { ...post, readingTime: readingTime(post.body) };
}

const clip = (v, n) => String(v ?? '').slice(0, n);

/** Create or update a post. `input.originalSlug` renames. Returns the saved post. */
export async function savePost(input, { image } = {}) {
  const index = await readJsonFile(INDEX, []);
  const now = new Date().toISOString();
  const originalSlug = input.originalSlug && SAFE_SLUG.test(input.originalSlug) ? input.originalSlug : null;
  const existing = originalSlug ? await readJsonFile(`content/posts/${originalSlug}.json`, null) : null;

  let slug = slugify(input.slug || input.title);
  if (slug !== originalSlug) {
    let n = 2;
    const base = slug;
    while (index.some((p) => p.slug === slug)) slug = `${base}-${n++}`;
  }

  const files = [];
  let cover = input.cover && typeof input.cover === 'object' ? { url: clip(input.cover.url, 500), alt: clip(input.cover.alt, 200), credit: clip(input.cover.credit, 200) } : null;
  if (image?.data) {
    const up = uploadFile(image);
    files.push(up.file);
    cover = { ...(cover || {}), url: up.url };
  }
  if (cover && !cover.url) cover = null;

  const status = input.status === 'published' ? 'published' : 'draft';
  const post = {
    slug,
    title: clip(input.title, 200).trim() || 'Untitled',
    dek: clip(input.dek, 400).trim(),
    body: clip(input.body, 120_000),
    section: clip(input.section || 'ai', 30),
    tags: Array.isArray(input.tags) ? input.tags.map((t) => clip(t, 40).trim()).filter(Boolean).slice(0, 8) : [],
    author: clip(input.author || process.env.DEFAULT_AUTHOR || 'Tensor Street Desk', 80),
    cover,
    featured: !!input.featured,
    status,
    sourceStory: input.sourceStory && typeof input.sourceStory === 'object' ? { title: clip(input.sourceStory.title, 300), url: clip(input.sourceStory.url, 800), source: clip(input.sourceStory.source, 100) } : undefined,
    aiAssisted: !!input.aiAssisted,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    publishedAt: status === 'published' ? input.publishedAt || existing?.publishedAt || now : input.publishedAt || existing?.publishedAt || null,
  };

  const nextIndex = index.filter((p) => p.slug !== originalSlug && p.slug !== slug);
  nextIndex.push(summarize(post));
  nextIndex.sort((a, b) => Date.parse(b.publishedAt || b.updatedAt) - Date.parse(a.publishedAt || a.updatedAt));

  files.push({ path: `content/posts/${slug}.json`, content: JSON.stringify(post, null, 2) + '\n' });
  if (originalSlug && originalSlug !== slug) files.push({ path: `content/posts/${originalSlug}.json`, content: null });
  files.push({ path: INDEX, content: JSON.stringify(nextIndex, null, 2) + '\n' });

  await writeFiles(files, `${status === 'published' ? 'Publish' : 'Save draft'}: ${post.title}`);
  return { ...post, readingTime: readingTime(post.body) };
}

export async function deletePost(slug) {
  if (!SAFE_SLUG.test(slug || '')) throw Object.assign(new Error('Bad slug'), { status: 400 });
  const index = await readJsonFile(INDEX, []);
  const post = index.find((p) => p.slug === slug);
  await writeFiles(
    [
      { path: `content/posts/${slug}.json`, content: null },
      { path: INDEX, content: JSON.stringify(index.filter((p) => p.slug !== slug), null, 2) + '\n' },
    ],
    `Delete: ${post?.title || slug}`,
  );
}

// ── Media ────────────────────────────────────────────────────────────────

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
export const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));

/** image: { data: base64 or dataURL, type } → { url, file } */
function uploadFile(image) {
  let { data, type } = image;
  const m = String(data).match(/^data:([^;]+);base64,(.*)$/);
  if (m) {
    type = m[1];
    data = m[2];
  }
  const ext = MIME_EXT[type];
  if (!ext) throw Object.assign(new Error('Unsupported image type. Use JPG, PNG, WebP, GIF or AVIF.'), { status: 400 });
  const buf = Buffer.from(data, 'base64');
  if (buf.length > 4_000_000) throw Object.assign(new Error('Image too large (max 4 MB after compression).'), { status: 413 });
  const d = new Date();
  const name = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return { url: `/media/${name}`, file: { path: `content/uploads/${name}`, content: buf } };
}

export async function uploadImage(image) {
  const up = uploadFile(image);
  await writeFiles([up.file], `Upload image ${up.url}`);
  return { url: up.url };
}

export async function readMedia(rel) {
  if (!/^[a-z0-9/_.-]+$/i.test(rel) || rel.includes('..')) return null;
  const ext = rel.split('.').pop().toLowerCase();
  const type = EXT_MIME[ext];
  if (!type) return null;
  const buf = await readFile(`content/uploads/${rel}`);
  return buf ? { buf, type } : null;
}

// ── Daily editions (archive) ─────────────────────────────────────────────

export async function saveEdition(edition) {
  const idx = await readJsonFile('content/editions/index.json', []);
  const next = [{ date: edition.date, title: edition.title, headline: edition.items?.[0]?.title || '', count: edition.items?.length || 0 }, ...idx.filter((e) => e.date !== edition.date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 400);
  await writeFiles(
    [
      { path: `content/editions/${edition.date}.json`, content: JSON.stringify(edition, null, 2) + '\n' },
      { path: 'content/editions/index.json', content: JSON.stringify(next, null, 2) + '\n' },
    ],
    `Archive edition ${edition.date}`,
  );
}

export const listEditions = () => readJsonFile('content/editions/index.json', []);

export async function getEdition(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  return readJsonFile(`content/editions/${date}.json`, null);
}
