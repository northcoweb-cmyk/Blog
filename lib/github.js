// GitHub as a free, versioned database. Posts and images are committed to the
// repo under /content, and read back live through the API — so publishing is
// instant and every edit has history. Needs one env var: GITHUB_TOKEN
// (fine-grained token with "Contents: Read and write" on this repo).

import { fetchWithTimeout } from './http.js';

export function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo =
    process.env.GITHUB_REPO ||
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : '');
  const branch = process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main';
  return { enabled: !!(token && repo), token, repo, branch };
}

async function gh(path, { method = 'GET', body, raw = false, timeout = 12000 } = {}) {
  const { token, repo } = githubConfig();
  const url = path.startsWith('https://') ? path : `https://api.github.com/repos/${repo}${path}`;
  const res = await fetchWithTimeout(url, {
    method,
    timeout,
    headers: {
      authorization: `Bearer ${token}`,
      accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

/** Read a file from the repo. Returns Buffer, or null if it doesn't exist. */
export async function ghRead(path) {
  const { branch } = githubConfig();
  const res = await gh(`/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, { raw: true });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read ${path}: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  return Buffer.from(await res.arrayBuffer());
}

/** List a directory. Returns [{ name, path, type, sha, size }] */
export async function ghList(path) {
  const { branch } = githubConfig();
  const res = await gh(`/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list ${path}: ${res.status}`);
  const j = await res.json();
  return Array.isArray(j) ? j : [];
}

/**
 * Commit several file changes atomically.
 * files: [{ path, content: Buffer|string|null }]  (null = delete)
 */
export async function ghCommit(files, message) {
  const { branch } = githubConfig();
  for (let attempt = 0; attempt < 3; attempt++) {
    const refRes = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
    if (!refRes.ok) throw new Error(`GitHub: branch "${branch}" not found (${refRes.status}). Set GITHUB_BRANCH.`);
    const headSha = (await refRes.json()).object.sha;
    const commitRes = await gh(`/git/commits/${headSha}`);
    const baseTree = (await commitRes.json()).tree.sha;

    const tree = [];
    for (const f of files) {
      if (f.content == null) {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const buf = Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content), 'utf8');
      const blobRes = await gh('/git/blobs', { method: 'POST', body: { content: buf.toString('base64'), encoding: 'base64' }, timeout: 30000 });
      if (!blobRes.ok) throw new Error(`GitHub blob: ${blobRes.status} ${await blobRes.text()}`.slice(0, 300));
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: (await blobRes.json()).sha });
    }

    const treeRes = await gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree } });
    if (!treeRes.ok) {
      const t = await treeRes.text();
      // Deleting a path that doesn't exist fails — retry without those entries.
      if (treeRes.status === 422 && files.some((f) => f.content == null)) {
        files = files.filter((f) => f.content != null);
        if (!files.length) return null;
        continue;
      }
      throw new Error(`GitHub tree: ${treeRes.status} ${t}`.slice(0, 300));
    }
    const newTree = (await treeRes.json()).sha;
    const newCommitRes = await gh('/git/commits', { method: 'POST', body: { message, tree: newTree, parents: [headSha] } });
    if (!newCommitRes.ok) throw new Error(`GitHub commit: ${newCommitRes.status}`);
    const newCommit = (await newCommitRes.json()).sha;
    const upd = await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: newCommit, force: false } });
    if (upd.ok) return newCommit;
    if (upd.status !== 422) throw new Error(`GitHub ref update: ${upd.status}`);
    // 422 = someone else committed in between; loop and rebuild on the new head.
  }
  throw new Error('GitHub: could not commit after 3 attempts (concurrent edits?)');
}

/** Quick connectivity check for the admin status panel. */
export async function ghStatus() {
  const cfg = githubConfig();
  if (!cfg.enabled) return { ok: false, reason: cfg.token ? 'GITHUB_REPO not set' : 'GITHUB_TOKEN not set', repo: cfg.repo, branch: cfg.branch };
  try {
    const res = await gh('');
    if (!res.ok) return { ok: false, reason: `GitHub returned ${res.status} — check the token has access to ${cfg.repo}`, repo: cfg.repo, branch: cfg.branch };
    const j = await res.json();
    const canPush = j?.permissions?.push;
    return { ok: canPush !== false, reason: canPush === false ? 'Token is read-only — it needs Contents: Read and write' : undefined, repo: cfg.repo, branch: cfg.branch, private: j.private };
  } catch (e) {
    return { ok: false, reason: e.message, repo: cfg.repo, branch: cfg.branch };
  }
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
