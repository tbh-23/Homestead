// Resolves a working Chromium executable for Playwright without requiring
// E2E_CHROMIUM when the local Playwright cache holds a newer or older
// chromium_headless_shell / chromium build than the pinned @playwright/test.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const RELATIVE_BINARIES = [
  ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
  ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
  ['chrome-mac', 'headless_shell'],
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ['chrome-linux', 'headless_shell'],
  ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-linux', 'chrome'],
];

export function playwrightCacheRoots() {
  return [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
    join(homedir(), '.cache', 'ms-playwright'),
  ].filter(Boolean);
}

export function resolveChromiumExecutable({
  envPath = process.env.E2E_CHROMIUM,
  defaultPath = null,
  cacheRoots = playwrightCacheRoots(),
} = {}) {
  if (envPath) return envPath;
  let builtin = defaultPath;
  if (builtin === null) {
    try { builtin = chromium.executablePath(); } catch { builtin = ''; }
  }
  if (builtin && existsSync(builtin)) return undefined;

  for (const root of cacheRoots) {
    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^chromium(_headless_shell)?-\d+$/.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => {
          // Prefer headless_shell over full chromium, and higher revision numbers first.
          const aHeadless = a.startsWith('chromium_headless_shell-') ? 1 : 0;
          const bHeadless = b.startsWith('chromium_headless_shell-') ? 1 : 0;
          if (aHeadless !== bHeadless) return bHeadless - aHeadless;
          const aRev = Number(a.split('-').pop()) || 0;
          const bRev = Number(b.split('-').pop()) || 0;
          return bRev - aRev;
        });
    } catch {
      continue;
    }
    for (const folder of entries) {
      for (const rel of RELATIVE_BINARIES) {
        const candidate = join(root, folder, ...rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}
