import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyDockerfileContract } from '../scripts/ci-local.mjs';
import { resolveChromiumExecutable } from './e2e/support/chromium.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('resolveChromiumExecutable prefers explicit E2E_CHROMIUM, then default, then newest cached headless_shell', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harrington-chromium-'));
  try {
    const older = join(dir, 'chromium_headless_shell-1208', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
    const newer = join(dir, 'chromium_headless_shell-1254', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
    await mkdir(join(dir, 'chromium_headless_shell-1208', 'chrome-headless-shell-mac-arm64'), { recursive: true });
    await mkdir(join(dir, 'chromium_headless_shell-1254', 'chrome-headless-shell-mac-arm64'), { recursive: true });
    await writeFile(older, '#!/bin/sh\n');
    await writeFile(newer, '#!/bin/sh\n');

    assert.equal(
      resolveChromiumExecutable({ envPath: '/custom/chrome', defaultPath: older, cacheRoots: [dir] }),
      '/custom/chrome',
    );
    assert.equal(
      resolveChromiumExecutable({ envPath: '', defaultPath: older, cacheRoots: [dir] }),
      undefined,
    );
    assert.equal(
      resolveChromiumExecutable({ envPath: '', defaultPath: join(dir, 'missing-binary'), cacheRoots: [dir] }),
      newer,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verifyDockerfileContract enforces non-root USER node and /data ownership', async () => {
  await verifyDockerfileContract(join(repoRoot, 'Dockerfile'));
  const dir = await mkdtemp(join(tmpdir(), 'harrington-dockerfile-'));
  try {
    const bad = join(dir, 'Dockerfile');
    await writeFile(bad, 'FROM node:22-alpine\nEXPOSE 4173\n');
    await assert.rejects(() => verifyDockerfileContract(bad), /USER node/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('every self-hosted GitHub Actions workflow job guards against external fork pull requests', async () => {
  for (const rel of ['.github/workflows/test.yml', '.github/workflows/e2e.yml']) {
    const text = await readFile(join(repoRoot, rel), 'utf8');
    const selfHostedCount = (text.match(/runs-on:\s*\[self-hosted/g) || []).length;
    const guardCount = (text.match(/github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/g) || []).length;
    assert.ok(selfHostedCount >= 1, `${rel} should target self-hosted runner`);
    assert.equal(guardCount, selfHostedCount, `${rel} must guard every self-hosted job against fork pull requests`);
  }
});
