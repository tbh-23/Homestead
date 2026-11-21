// Fetches the Marble taxonomy once into tests/e2e/.cache/taxonomy (git-ignored)
// so every e2e run after the first starts its servers without the network.
//
// The specs assume one exact curriculum (fixed counts and topic ids), so the
// suite downloads the commit pinned in lib/taxonomy-pin.mjs, the same pin the
// server uses, and checks every file against the SHA-256 recorded there. To
// move to a newer taxonomy, follow docs/CURRICULUM.md. The cache directory and
// the CI cache key both follow the revision.
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TAXONOMY_PIN, sha256Hex } from '../../../lib/taxonomy-pin.mjs';

export const TAXONOMY_FILES = Object.keys(TAXONOMY_PIN.files);
export const TAXONOMY_REVISION = TAXONOMY_PIN.revision;
// raw.githubusercontent.com: jsDelivr is blocked on some networks, including
// the sandbox this suite was written in.
export const GITHUB_RAW_UPSTREAM = TAXONOMY_PIN.upstream;
export const CACHE_DIR = fileURLToPath(new URL(`../.cache/taxonomy-${TAXONOMY_REVISION.slice(0, 12)}/`, import.meta.url));
export const USER_CACHE_DIR = join(homedir(), '.cache', 'harrington', `taxonomy-${TAXONOMY_REVISION.slice(0, 12)}`);
const REPO_TAXONOMY_DIR = fileURLToPath(new URL('../../../data/private/taxonomy/', import.meta.url));

export function localSeedDirs() {
  return [
    process.env.HARRINGTON_TAXONOMY_DIR,
    REPO_TAXONOMY_DIR,
    USER_CACHE_DIR,
  ].filter(Boolean);
}

// The upstream the app server should use: an explicit HARRINGTON_TAXONOMY_UPSTREAM
// wins, then the pinned one.
export async function detectUpstream() {
  return process.env.HARRINGTON_TAXONOMY_UPSTREAM || GITHUB_RAW_UPSTREAM;
}

async function exists(path) {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

async function verifiedLocalSeed(name) {
  const expected = TAXONOMY_PIN.files[name];
  for (const dir of localSeedDirs()) {
    const candidate = join(dir, name);
    if (!(await exists(candidate))) continue;
    try {
      const body = await readFile(candidate);
      if ((await sha256Hex(body)) === expected) return { path: candidate, body };
    } catch {
      // Try next candidate directory.
    }
  }
  return null;
}

export async function cacheIsComplete() {
  for (const name of TAXONOMY_FILES) {
    if (!(await exists(join(CACHE_DIR, name)))) return false;
  }
  return true;
}

// Download any missing file (or seed it from a verified local taxonomy cache)
// and check its hash. A cached file that does not match the pin (a
// half-written or tampered copy) is removed and fetched again. Two launchers
// can call this at once, so each writes to its own temp file and renames it
// into place.
export async function ensureTaxonomyCache({ log = () => {} } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(USER_CACHE_DIR, { recursive: true }).catch(() => {});
  for (const name of TAXONOMY_FILES) {
    const target = join(CACHE_DIR, name);
    if ((await exists(target)) && (await sha256Hex(await readFile(target))) !== TAXONOMY_PIN.files[name]) {
      log(`Cached taxonomy ${name} does not match the pin; fetching it again`);
      await rm(target, { force: true });
    }
    if (!(await exists(target))) {
      const seed = await verifiedLocalSeed(name);
      if (seed) {
        const tmp = `${target}.${process.pid}.tmp`;
        await writeFile(tmp, seed.body);
        await rename(tmp, target);
        await copyFile(target, join(USER_CACHE_DIR, name)).catch(() => {});
      }
    } else {
      const userTarget = join(USER_CACHE_DIR, name);
      if (!(await exists(userTarget))) await copyFile(target, userTarget).catch(() => {});
    }
  }
  if (await cacheIsComplete()) return { upstream: null, downloaded: [] };
  const upstream = await detectUpstream();
  const downloaded = [];
  for (const name of TAXONOMY_FILES) {
    const target = join(CACHE_DIR, name);
    if (await exists(target)) continue;
    log(`Downloading taxonomy ${name} from ${upstream}`);
    const res = await fetch(`${upstream}/${name}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Could not download ${name} from ${upstream} (${res.status})`);
    const body = Buffer.from(await res.arrayBuffer());
    const actual = await sha256Hex(body);
    if (actual !== TAXONOMY_PIN.files[name]) {
      throw new Error(`Taxonomy ${name} from ${upstream} has SHA-256 ${actual}, expected ${TAXONOMY_PIN.files[name]} (lib/taxonomy-pin.mjs)`);
    }
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, target);
    await copyFile(target, join(USER_CACHE_DIR, name)).catch(() => {});
    downloaded.push(name);
  }
  return { upstream, downloaded };
}
