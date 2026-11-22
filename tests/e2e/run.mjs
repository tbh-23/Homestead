#!/usr/bin/env node
// `npm run e2e` and `npm run e2e:ui-docs` both come through here so the
// recordings post-step runs even when tests fail, and the exit code is
// Playwright's.
//
//   node tests/e2e/run.mjs [--refresh-docs] [any playwright test args]
//
// --refresh-docs wipes docs/e2e/screenshots and docs/e2e/recordings first and
// records a video of every test (E2E_VIDEO=all), not just the walkthroughs.
import { spawnSync } from 'node:child_process';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRecordings } from './collect-recordings.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const shotsDir = join(root, 'docs', 'e2e', 'screenshots');
const args = process.argv.slice(2);
const refresh = args.includes('--refresh-docs');
const passThrough = args.filter((a) => a !== '--refresh-docs');

const env = { ...process.env };
if (refresh) {
  await rm(shotsDir, { recursive: true, force: true });
  env.E2E_VIDEO = 'all';
}

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
const runnerCmd = process.platform === 'darwin' ? 'caffeinate' : bin;
const runnerArgs = process.platform === 'darwin' ? ['-i', bin, 'test', ...passThrough] : ['test', ...passThrough];
const result = spawnSync(runnerCmd, runnerArgs, { cwd: root, env, stdio: 'inherit' });

const copied = await collectRecordings({ clean: true });

async function folderStats(dir) {
  let files = 0; let bytes = 0;
  async function walk(d) {
    let entries = [];
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { files += 1; bytes += (await stat(p)).size; }
    }
  }
  await walk(dir);
  return { files, mb: (bytes / 1048576).toFixed(2) };
}
const shots = await folderStats(shotsDir);
console.log(`\ne2e: ${shots.files} screenshot(s), ${shots.mb} MB in docs/e2e/screenshots; ${copied.length} recording(s) in docs/e2e/recordings`);
console.log('e2e: HTML report in playwright-report/ (npx playwright show-report)');
process.exit(result.status ?? 1);
