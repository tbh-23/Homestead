#!/usr/bin/env node
// Local CI/CD runner (`npm run ci` / `npm run ci:quick`).
//
// Runs the entire GitHub Actions pipeline locally on this machine with zero
// required environment variables and zero cloud runner usage:
//   1. Taxonomy cache & SHA-256 integrity verification (`taxonomy:check`)
//   2. Build + unit & isolation test suite (`CI=1 npm test`)
//   3. Dead-code, copy & AI-status checks (`npm run check`)
//   4. Dockerfile non-root contract check (plus live container smoke test when
//      the local Docker daemon is running)
//   5. Playwright end-to-end suite (`npm run e2e`, skipped with `--quick`)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '../src/js/schema.js';
import { ensureTaxonomyCache } from '../tests/e2e/support/taxonomy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const rawArgs = process.argv.slice(2);
const quick = rawArgs.includes('--quick');
const noDocker = rawArgs.includes('--no-docker');
const e2eArgs = rawArgs.filter((a) => a !== '--quick' && a !== '--no-docker');

function run(cmd, args, envOverrides = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, CI: '1', ...envOverrides },
    stdio: 'inherit',
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

export async function verifyDockerfileContract(dockerfilePath = join(root, 'Dockerfile')) {
  const text = await readFile(dockerfilePath, 'utf8');
  assert.match(text, /^USER\s+node\s*$/m, 'Dockerfile must drop privileges to USER node');
  assert.match(text, /chown\s+node:node\s+\/data/, 'Dockerfile must grant node ownership of /data');
  assert.match(text, /chmod\s+-R\s+a\+rX\s+\/app/, 'Dockerfile must make /app readable by node');
  assert.match(text, /^EXPOSE\s+4173\s*$/m, 'Dockerfile must expose port 4173');
}

function dockerRunning() {
  const res = spawnSync('docker', ['info'], { cwd: root, stdio: 'ignore' });
  return res.status === 0;
}

function runDockerSmokeTest() {
  console.log('\n[ci] Docker daemon detected — building and smoke-testing harrington:ci container...');
  const script = `
    set -eu
    cleanup() {
      docker rm -f harrington-ci >/dev/null 2>&1 || true
      docker volume rm harrington-ci-data >/dev/null 2>&1 || true
    }
    trap cleanup EXIT
    cleanup
    docker build -t harrington:ci .
    test "$(docker image inspect -f '{{.Config.User}}' harrington:ci)" = node
    test "$(docker run --rm harrington:ci id -u)" = 1000
    test "$(docker run --rm harrington:ci id -un)" = node
    test "$(docker run --rm harrington:ci stat -c %U /data)" = node
    docker volume create harrington-ci-data >/dev/null
    docker run -d --name harrington-ci -p 127.0.0.1:4173:4173 -v harrington-ci-data:/data harrington:ci >/dev/null
    for i in $(seq 1 30); do
      curl -sf http://127.0.0.1:4173/api/health >/dev/null && break
      sleep 1
    done
    test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/api/health)" = 200
    for path in / /js/app.js /css/tailwind.css; do
      test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:4173$path")" = 200
    done
    test "$(docker exec harrington-ci id -u)" = 1000
    status=$(curl -s -o /dev/null -w '%{http_code}' -X PUT http://127.0.0.1:4173/api/state \
      -H 'Content-Type: application/json' -H 'If-Match: "v0"' \
      --data '{"schemaVersion":${SCHEMA_VERSION},"students":[{"id":"student-1","name":"Sample Learner","birthYear":2018}],"activeStudentId":"student-1","progress":{}}')
    test "$status" = 204
    docker exec harrington-ci test -s /data/family-state.json
  `;
  run('sh', ['-c', script]);
}

async function main() {
  console.log('[ci] 1/5 Ensuring pinned taxonomy cache...');
  await ensureTaxonomyCache({ log: console.log });
  run('npm', ['run', 'taxonomy:check']);

  console.log('\n[ci] 2/5 Running build, unit and isolation tests (CI=1)...');
  run('npm', ['test']);

  console.log('\n[ci] 3/5 Running dead-code, copy and AI-status checks...');
  run('npm', ['run', 'check']);

  console.log('\n[ci] 4/5 Checking Dockerfile non-root security contract...');
  await verifyDockerfileContract();
  if (!noDocker && dockerRunning()) {
    runDockerSmokeTest();
  } else {
    console.log('[ci] Dockerfile static contract verified (local Docker daemon not running; container smoke test skipped).');
  }

  if (quick) {
    console.log('\n[ci] 5/5 Skipped E2E suite (--quick). All fast CI gates passed.');
    return;
  }

  console.log('\n[ci] 5/5 Running Playwright E2E suite...');
  run('npm', ['run', 'e2e', ...(e2eArgs.length ? ['--', ...e2eArgs] : [])]);
  console.log('\n[ci] All local CI gates passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
