// Structure-preserving deploy of the static site to Puter hosting.
//
// Why this exists instead of `puter site deploy` (@heyputer/cli): the CLI's
// batch upload flattens the tree — src/js/views/dashboard.js lands at /dashboard.js —
// so index.html loads but every nested module 404s. This writes each file to its
// full nested path with createMissingParents, which Puter preserves correctly
// (verified against the live FS API before this was written).
//
// Zero-downtime: files are uploaded into a fresh release-<stamp> directory, and
// the subdomain is only re-pointed once every upload has succeeded. Old releases
// are pruned afterward so storage stays bounded.
//
// Env:
//   PUTER_AUTH_TOKEN  (required)  account token; in CI it comes from a GH secret
//   PUTER_SUBDOMAIN   (default "homestead")
//   DEPLOY_SRC        (default "src")   local directory to deploy
//   KEEP_RELEASES     (default "3")     how many release dirs to retain

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '@heyputer/puter.js/src/init.cjs';

const TOKEN = process.env.PUTER_AUTH_TOKEN;
const SUBDOMAIN = process.env.PUTER_SUBDOMAIN || 'homestead';
const SRC = process.env.DEPLOY_SRC || 'src';
const KEEP = Math.max(1, parseInt(process.env.KEEP_RELEASES || '3', 10));
// Keep parallel uploads modest: Puter rate-limits concurrent FS writes and
// returns "Too many concurrent requests" when too many run at once (this bit us
// once the file count grew). Override with DEPLOY_CONCURRENCY if needed.
const CONCURRENCY = Math.max(1, parseInt(process.env.DEPLOY_CONCURRENCY || '3', 10));
const MAX_RETRIES = Math.max(0, parseInt(process.env.DEPLOY_MAX_RETRIES || '5', 10));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry a write on transient failures (rate limits / network blips) with
// exponential backoff + jitter. Rethrows after MAX_RETRIES so the deploy still
// fails loudly rather than shipping a partial release.
async function withRetry(label, fn) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message ?? err);
      const transient = /concurrent|rate|timeout|429|ECONN|network|temporarily|try again/i.test(msg);
      if (attempt >= MAX_RETRIES || !transient) throw err;
      const delay = Math.round(400 * 2 ** attempt + Math.random() * 300);
      attempt++;
      console.log(`  retry ${attempt}/${MAX_RETRIES} for ${label} after "${msg}" (waiting ${delay}ms)`);
      await sleep(delay);
    }
  }
}

if (!TOKEN) {
  console.error('PUTER_AUTH_TOKEN is not set. Aborting before any Puter calls.');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.resolve(repoRoot, SRC);
if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

// Collect every file under srcDir as { rel, abs }, rel using POSIX separators.
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) {
      out.push({ rel: path.relative(srcDir, abs).split(path.sep).join('/'), abs });
    }
  }
  return out;
}

async function pool(items, size, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const puter = init(TOKEN);

  const user = await puter.auth.getUser();
  const home = user.home_directory || `/${user.username}`;
  const base = `${home}/Sites/${SUBDOMAIN}`;
  const stamp = Date.now();
  const release = `${base}/release-${stamp}`;

  const files = walk(srcDir);
  if (files.length === 0) {
    console.error(`No files found under ${srcDir}. Refusing to deploy an empty site.`);
    process.exit(1);
  }

  console.log(`Deploying ${files.length} file(s) from ${SRC}/ to ${release}`);

  await pool(files, CONCURRENCY, async (f) => {
    const buf = fs.readFileSync(f.abs);
    // File([buffer], name) is the Node-compatible payload this SDK accepts; the
    // explicit nested `path` (not the file name) determines where it lands.
    const data = new File([buf], path.posix.basename(f.rel));
    await withRetry(f.rel, () => puter.fs.write(`${release}/${f.rel}`, data, {
      overwrite: true,
      createMissingParents: true,
    }));
    console.log(`  uploaded ${f.rel}`);
  });

  // Flip the subdomain to the new release (create it if it somehow doesn't exist).
  try {
    await withRetry('hosting.update', () => puter.hosting.update(SUBDOMAIN, release));
  } catch (err) {
    console.log(`hosting.update failed (${err?.message ?? err}); trying hosting.create...`);
    await withRetry('hosting.create', () => puter.hosting.create(SUBDOMAIN, release));
  }
  console.log(`Subdomain "${SUBDOMAIN}" now serving ${release}`);

  // Prune old releases (best effort — the site is already live on the new one).
  try {
    const entries = await puter.fs.readdir(base);
    const oldReleases = entries
      .filter((e) => e.is_dir && /^release-\d+$/.test(e.name))
      .map((e) => ({ name: e.name, stamp: parseInt(e.name.slice('release-'.length), 10) }))
      .sort((a, b) => b.stamp - a.stamp)
      .slice(KEEP);
    for (const r of oldReleases) {
      await puter.fs.delete(`${base}/${r.name}`, { recursive: true });
      console.log(`  pruned old release ${r.name}`);
    }
  } catch (err) {
    console.log(`Prune step skipped: ${err?.message ?? err}`);
  }

  console.log(`Done. Live at https://${SUBDOMAIN}.puter.site`);
}

// Exit explicitly on success: the puter.js SDK keeps a handle open (socket/
// timer), so the process won't terminate on its own — without this the CI step
// hangs after the deploy finishes until it hits the job timeout.
main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Deploy failed:', err?.stack || err?.message || err);
  process.exit(1);
});
