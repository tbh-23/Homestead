// Fast security baseline guards (HAR-36): enforces every automatable practice
// from docs/security/PRACTICES.md without requiring a build step.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TAXONOMY_PIN } from '../lib/taxonomy-pin.mjs';
import {
  DOCUMENT_KEYS,
  LEARNER_KEYS,
  MAX_UNKNOWN_BYTES,
  MAX_UNKNOWN_FIELDS,
  stripOrphanLearnerKeys,
  unknownTopLevelFields,
  validateDocument,
} from '../src/js/document.js';
import { APP_CSP } from '../src/js/figures/contract.js';
import { SCHEMA_VERSION } from '../src/js/schema.js';

const repoRootUrl = new URL('..', import.meta.url);
const repoRoot = fileURLToPath(repoRootUrl);
const readRepo = (rel) => readFile(new URL(rel, repoRootUrl), 'utf8');

const FAKE_TOKEN = 'harrington-fake-tok-998877665544';
const FAKE_KEY = 'sk-fake-key-112233445566';
const WRONG_TOKEN = 'wrong-fake-attempt-9988776655';

const ALLOWED_EXTERNAL_HOSTS = new Set([
  // Local loopback, Docker and documented example hosts
  '127.0.0.1',
  'localhost',
  'harrington.local',
  'host.docker.internal',
  '192.168.x.x',
  // Marble curriculum upstream, repository, curriculum standards and licences
  'raw.githubusercontent.com',
  'api.github.com',
  'github.com',
  'creativecommons.org',
  'www.australiancurriculum.edu.au',
  // Supervised learning resource search links (src/js/resources.js)
  'www.khanacademy.org',
  'www.bbc.co.uk',
  'en.wikipedia.org',
  'www.youtube.com',
  // SVG namespace & Tailwind CSS licence header
  'www.w3.org',
  'tailwindcss.com',
  // Firebase Auth / Firestore / Storage & Gemini OpenAI-compatible endpoint
  'generativelanguage.googleapis.com',
  'securetoken.googleapis.com',
  'identitytoolkit.googleapis.com',
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
]);

async function walkFiles(dir, relPrefix, excludePrefixes = []) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (excludePrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full, rel, excludePrefixes));
    else out.push(rel);
  }
  return out;
}

function getWithHost(port, hostHeader, path = '/api/health') {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers: { Host: hostHeader } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('zero runtime dependencies in package.json', async () => {
  const pkg = JSON.parse(await readRepo('package.json'));
  assert.ok(
    !('dependencies' in pkg) || Object.keys(pkg.dependencies).length === 0,
    'package.json must not declare runtime dependencies',
  );
});

test('outbound URL hosts in server, lib and src stay on the explicit allowlist', async () => {
  const targets = [
    'server.mjs',
    ...(await walkFiles(join(repoRoot, 'lib'), 'lib')),
    ...(await walkFiles(join(repoRoot, 'src'), 'src', ['src/vendor', 'src/docs'])),
  ];

  const urlRe = /https?:\/\/([^\s"'`<>)}\]\\/,;?:*]+)/gi;
  const unexpected = [];
  for (const rel of targets) {
    const text = await readRepo(rel);
    if (rel === 'src/index.html') {
      assert.doesNotMatch(text, /https?:\/\//i, 'src/index.html must not reference external URLs');
    }
    for (const match of text.matchAll(urlRe)) {
      const host = match[1].toLowerCase();
      if (host.startsWith('${')) continue; // template literal like http://${shownHost}:${actualPort}
      if (!ALLOWED_EXTERNAL_HOSTS.has(host)) unexpected.push(`${rel}: ${match[0]}`);
    }
  }
  assert.deepEqual(unexpected, [], `Unexpected external hosts found:\n${unexpected.join('\n')}`);
});

test('server.mjs write routes are inventoried behind refuseCrossSite() and the /api/* cookie gate', async () => {
  const serverSrc = await readRepo('server.mjs');

  const apiStart = serverSrc.indexOf('async function handleApi(req, res, url)');
  const apiEnd = serverSrc.indexOf('async function serveStatic(req, res, url)');
  assert.ok(apiStart !== -1 && apiEnd > apiStart);
  const handleApiBody = serverSrc.slice(apiStart, apiEnd);

  // Cookie gate must sit right after /api/health and before every other /api/* route.
  const healthPos = handleApiBody.indexOf("url.pathname === '/api/health'");
  const gatePos = handleApiBody.indexOf("url.pathname.startsWith('/api/') && !isSignedIn(req)");
  const statePos = handleApiBody.indexOf("url.pathname === '/api/state'");
  assert.ok(healthPos !== -1 && gatePos > healthPos && statePos > gatePos, 'cookie gate must precede all /api/* routes except /api/health');

  // Every state-changing handler in server.mjs must invoke refuseCrossSite().
  const guardedFns = [
    ['handleStateWrite', /refuseCrossSite\(req,\s*res,\s*\{\s*json:\s*true/],
    ['handleAiChat', /refuseCrossSite\(req,\s*res,\s*\{\s*json:\s*true/],
  ];
  for (const [fnName, pattern] of guardedFns) {
    const idx = serverSrc.indexOf(`async function ${fnName}(`);
    assert.ok(idx !== -1, `missing ${fnName}`);
    const slice = serverSrc.slice(idx, idx + 700);
    assert.match(slice, pattern, `${fnName} must guard with ${pattern}`);
  }

  // AI settings write methods must check both refuseRemote and refuseCrossSite.
  const aiSettingsIdx = serverSrc.indexOf('async function handleAiSettings(');
  assert.ok(aiSettingsIdx !== -1);
  const aiSettingsBody = serverSrc.slice(aiSettingsIdx, aiSettingsIdx + 1200);
  assert.match(aiSettingsBody, /if \(req\.method !== 'POST'\) return false;\s*if \(refuseRemote\(req, res\) \|\| refuseCrossSite\(req, res\)\)/);
  assert.match(aiSettingsBody, /if \(req\.method === 'PUT'\) \{\s*if \(refuseRemote\(req, res\) \|\| refuseCrossSite\(req, res, \{ json: true \}\)\)/);
  assert.match(aiSettingsBody, /if \(req\.method === 'DELETE'\) \{\s*if \(refuseRemote\(req, res\) \|\| refuseCrossSite\(req, res\)\)/);

  // Lessons PUT and Audio PUT/DELETE inside handleApi must invoke refuseCrossSite.
  const lessonsSlice = handleApiBody.slice(handleApiBody.indexOf("routeKey(url.pathname, '/api/lessons/')"));
  assert.match(lessonsSlice, /if \(req\.method === 'PUT'\) \{\s*if \(refuseCrossSite\(req, res, \{\s*json: true/);
  const audioSlice = handleApiBody.slice(handleApiBody.indexOf("routeKey(url.pathname, '/api/audio/')"));
  assert.match(audioSlice, /if \(req\.method === 'PUT'\) \{\s*if \(refuseCrossSite\(req, res, \{\s*json: false/);
  assert.match(audioSlice, /if \(req\.method === 'DELETE'\) \{\s*if \(refuseCrossSite\(req, res, \{\s*json: false/);

  // Inventory every literal PUT/POST/DELETE occurrence in server.mjs so no unguarded write route slips in.
  const lines = serverSrc.split('\n');
  const writeMatches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/\b(?:PUT|POST|DELETE)\b/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
      writeMatches.push(`${i + 1}: ${lines[i].trim()}`);
    }
  }
  const allowedContexts = [
    "req.method === 'PUT' || req.method === 'POST'",
    "req.method === 'POST'",
    "req.method !== 'POST'",
    "req.method === 'PUT'",
    "req.method === 'DELETE'",
    "['GET', 'HEAD', 'POST'].includes(req.method)",
  ];
  for (const hit of writeMatches) {
    assert.ok(
      allowedContexts.some((ctx) => hit.includes(ctx)),
      `Unexpected PUT/POST/DELETE route expression in server.mjs (${hit}) — update write-route inventory`,
    );
  }
});

test('scripts/backup.mjs excludes secrets.json and restricts permissions', async () => {
  const backupSrc = await readRepo('scripts/backup.mjs');
  assert.match(backupSrc, /--exclude=\$\{base\}\/secrets\.json/);
  assert.match(backupSrc, /--exclude=\$\{base\}\/secrets\.json\.\*\.tmp/);
  assert.match(backupSrc, /mode:\s*0o700/);
  assert.match(backupSrc, /chmodSync\(archive,\s*0o600\)/);
});

test('Firebase rules and client bundle contain zero PII emails and enforce email_verified + default deny', async () => {
  const files = [
    'firestore.rules',
    'storage.rules',
    'firebase.json',
    'scripts/build-firebase.mjs',
    'src/js/firebase-backend.js',
    'src/js/firebase-config.js',
  ];
  const contents = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readRepo(f)])));

  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  for (const [label, text] of Object.entries(contents)) {
    assert.doesNotMatch(text, /@gmail\.com/i, `${label} must not contain a @gmail.com address`);
    assert.doesNotMatch(text, emailPattern, `${label} must not contain any plaintext email address`);
  }

  assert.match(contents['firestore.rules'], /request\.auth\.token\.email_verified == true/);
  assert.match(
    contents['firestore.rules'],
    /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}\s*\}\s*\}\s*$/,
    'firestore.rules must end with a default-deny catch-all rule',
  );

  assert.match(contents['storage.rules'], /request\.auth\.token\.email_verified == true/);
  assert.match(
    contents['storage.rules'],
    /match \/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;\s*\}\s*\}\s*\}\s*$/,
    'storage.rules must end with a default-deny catch-all rule',
  );
});

test('DOCUMENT_KEYS, validateDocument() and firestore.rules stay in parity', async () => {
  const [docSrc, rulesSrc] = await Promise.all([
    readRepo('src/js/document.js'),
    readRepo('firestore.rules'),
  ]);

  const rulesStart = rulesSrc.indexOf('function isValidFamilyState(data)');
  const rulesEnd = rulesSrc.indexOf('function isValidLesson(');
  assert.ok(rulesStart !== -1 && rulesEnd > rulesStart);
  const familyRuleBody = rulesSrc.slice(rulesStart, rulesEnd);

  // Every DOCUMENT_KEYS entry must be known to document.js and accepted by firestore.rules.
  const allDocKeysObj = Object.fromEntries(DOCUMENT_KEYS.map((k) => [k, {}]));
  assert.deepEqual(unknownTopLevelFields(allDocKeysObj), []);
  for (const key of DOCUMENT_KEYS) {
    assert.match(docSrc, new RegExp(`'${key}'`), `document.js must declare ${key}`);
    assert.match(familyRuleBody, new RegExp(`\\b${key}\\b`), `firestore.rules isValidFamilyState() must handle ${key}`);
  }

  // Every LEARNER_KEYS entry must reject non-object shapes and strip orphan/__proto__ keys.
  const baseValid = { schemaVersion: SCHEMA_VERSION, students: [{ id: 's1', name: 'Rowan Sample' }] };
  for (const key of LEARNER_KEYS) {
    const bad = validateDocument({ ...baseValid, [key]: 123 });
    assert.equal(typeof bad, 'string', `validateDocument() must reject non-object ${key}`);
    const { doc, dropped } = stripOrphanLearnerKeys({
      ...baseValid,
      [key]: { __proto__: {}, orphan: {}, s1: {} },
    });
    assert.equal(dropped, 1);
    assert.deepEqual(Object.keys(doc[key]), ['s1']);
  }

  // Unknown-field count/byte caps in document.js & firestore.rules.
  const tooMany = { ...baseValid };
  for (let i = 0; i <= MAX_UNKNOWN_FIELDS; i += 1) tooMany[`extra_${i}`] = 1;
  assert.match(validateDocument(tooMany), /unrecognised top-level fields/);
  assert.match(
    validateDocument({ ...baseValid, extra_big: 'a'.repeat(MAX_UNKNOWN_BYTES + 10) }),
    /larger than 64 KB/,
  );
  assert.match(familyRuleBody, /data\.keys\(\)\.size\(\)\s*<=\s*40/);
});

test('every AI call and prompt builder in src/js/ai.js goes through ask() or askJson()', async () => {
  const aiSrc = await readRepo('src/js/ai.js');
  const chatCalls = [...aiSrc.matchAll(/backend\.chat\s*\(/g)];
  assert.equal(chatCalls.length, 2, 'backend.chat() may only be called inside ask() and askJson()');

  const askIdx = aiSrc.indexOf('async function ask(');
  const askJsonIdx = aiSrc.indexOf('async function askJson(');
  assert.ok(askIdx !== -1 && askJsonIdx !== -1);
  for (const match of chatCalls) {
    const insideAsk = match.index > askIdx && match.index < askIdx + 220;
    const insideAskJson = match.index > askJsonIdx && match.index < askJsonIdx + 220;
    assert.ok(insideAsk || insideAskJson, 'backend.chat() call found outside ask()/askJson()');
  }

  // Every exported ai* helper and verifyTest must invoke ask() or askJson().
  const exportedFns = [...aiSrc.matchAll(/export\s+(?:async\s+)?function\s+(ai\w+|verifyTest)\s*\(/g)];
  assert.ok(exportedFns.length >= 10);
  for (const match of exportedFns) {
    const fnName = match[1];
    const start = match.index;
    const nextExport = aiSrc.indexOf('\nexport ', start + 1);
    const body = aiSrc.slice(start, nextExport === -1 ? aiSrc.length : nextExport);
    assert.match(body, /\bask(?:Json)?\s*\(/, `${fnName} must route through ask() or askJson()`);
  }

  // No other browser module under src/js/ may call backend.chat directly.
  const jsFiles = await walkFiles(join(repoRoot, 'src/js'), 'src/js');
  for (const rel of jsFiles) {
    if (rel === 'src/js/ai.js' || rel === 'src/js/backend.js') continue;
    const text = await readRepo(rel);
    assert.doesNotMatch(text, /\bbackend\.chat\s*\(/, `${rel} must not call backend.chat() directly`);
  }
});

test('Dockerfile drops privileges to non-root user and taxonomy pin uses immutable SHA-256 hashes', async () => {
  const dockerfile = await readRepo('Dockerfile');
  assert.match(dockerfile, /^USER\s+node\s*$/m);

  assert.match(TAXONOMY_PIN.revision, /^[0-9a-f]{40}$/);
  assert.ok(TAXONOMY_PIN.upstream.includes(TAXONOMY_PIN.revision));
  assert.doesNotMatch(TAXONOMY_PIN.upstream, /@main|@master|\/main\/|\/master\//);
  for (const [name, digest] of Object.entries(TAXONOMY_PIN.files)) {
    assert.match(digest, /^[0-9a-f]{64}$/, `${name} must pin a 64-char SHA-256 hex digest`);
  }
});

describe('runtime security baseline with planted fake secrets', { concurrency: false }, () => {
  let tmpDir;
  let dataDir;
  let backupDir;
  let child;
  let baseUrl;
  let serverLogs = '';
  const observedResponses = [];

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'harrington-sec-base-'));
    dataDir = join(tmpDir, 'data');
    backupDir = join(tmpDir, 'backups');
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HARRINGTON_HOST: '127.0.0.1',
        HARRINGTON_PORT: '0',
        HARRINGTON_DATA_DIR: dataDir,
        HARRINGTON_BACKUP_DIR: backupDir,
        HARRINGTON_ACCESS_TOKEN: FAKE_TOKEN,
        HARRINGTON_AI_API_KEY: FAKE_KEY,
        HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:1/v1',
        HARRINGTON_AI_MODEL: 'fake-model',
        HARRINGTON_PUBLISHED_HOST: '',
        HARRINGTON_ALLOWED_HOSTS: '',
        HARRINGTON_LOGIN_BACKOFF_BASE_MS: '50',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    baseUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
      let out = '';
      child.stdout.on('data', (chunk) => {
        const str = chunk.toString();
        out += str;
        serverLogs += str;
        const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${m[1]}`);
        }
      });
      child.stderr.on('data', (chunk) => {
        const str = chunk.toString();
        out += str;
        serverLogs += str;
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited with ${code}: ${out}`));
      });
    });
  });

  after(async () => {
    child?.kill('SIGTERM');
    if (child && child.exitCode === null) {
      await new Promise((resolve) => child.once('exit', resolve));
    }
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  async function recordFetch(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, options);
    const text = await res.text();
    const headerStr = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
    observedResponses.push(`${path} -> ${res.status}\n${headerStr}\n${text}`);
    return { status: res.status, headers: res.headers, text };
  }

  test('enforces cookie gate, cross-site write guard, headers, Host allowlist, proxy hygiene and zero secret leaks', async () => {
    // 1. Security headers on app page & signed-out health.
    const home = await recordFetch('/');
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('content-security-policy'), APP_CSP);
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN');

    const healthOut = await recordFetch('/api/health');
    assert.equal(healthOut.status, 200);
    assert.equal(healthOut.headers.get('referrer-policy'), 'no-referrer');

    // 2. Host allowlist refuses foreign Host on loopback (421).
    const port = Number(new URL(baseUrl).port);
    const rebind = await getWithHost(port, 'rebind.attacker.test');
    assert.equal(rebind.status, 421);

    // 3. Login form + valid sign-in + X-Forwarded-Proto safe-direction Secure cookie.
    assert.equal((await recordFetch('/login')).status, 200);
    const loginRes = await recordFetch('/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-Proto': 'https',
      },
      body: new URLSearchParams({ token: FAKE_TOKEN }).toString(),
    });
    assert.equal(loginRes.status, 303);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /; Secure/);
    const cookie = setCookie.split(';')[0];

    // 4. Every state-changing /api/* route enforces 401 without cookie and 403 on cross-site Sec-Fetch-Site.
    const writeRoutes = [
      ['PUT', '/api/state', '{"schemaVersion":3,"students":[]}'],
      ['POST', '/api/state', '{"schemaVersion":3,"students":[],"version":0}'],
      ['PUT', '/api/lessons/topic%3Amt_1', '{"ok":true}'],
      ['PUT', '/api/audio/rec_1', 'bytes'],
      ['DELETE', '/api/audio/rec_1'],
      ['POST', '/api/ai', '{"messages":[{"role":"user","content":"hi"}],"capability":"lesson"}'],
      ['PUT', '/api/settings/ai', '{"model":"fake-model"}'],
      ['DELETE', '/api/settings/ai'],
      ['POST', '/api/settings/ai/test'],
    ];
    for (const [method, path, body] of writeRoutes) {
      const unauth = await recordFetch(path, {
        method,
        headers: { 'Sec-Fetch-Site': 'same-origin', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body,
      });
      assert.equal(unauth.status, 401, `${method} ${path} must require cookie (got ${unauth.status})`);

      const crossSite = await recordFetch(path, {
        method,
        headers: {
          Cookie: cookie,
          'Sec-Fetch-Site': 'cross-site',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      });
      assert.equal(crossSite.status, 403, `${method} ${path} must refuse cross-site Sec-Fetch-Site (got ${crossSite.status})`);
    }

    // 5. Save family state + AI secrets.json, check signed-in health, settings, AI failure path, and file modes.
    const healthIn = await recordFetch('/api/health', { headers: { Cookie: cookie } });
    assert.equal(healthIn.status, 200);
    const statePut = await recordFetch('/api/state', {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
        'If-Match': '"v0"',
      },
      body: JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        students: [{ id: 's1', name: 'Rowan Sample', birthYear: 2018 }],
        activeStudentId: 's1',
      }),
    });
    assert.equal(statePut.status, 204);
    assert.equal((await recordFetch('/api/state', { headers: { Cookie: cookie } })).status, 200);

    const aiPut = await recordFetch('/api/settings/ai', {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({
        baseUrl: 'http://127.0.0.1:1/v1',
        model: 'fake-model',
        apiKey: FAKE_KEY,
      }),
    });
    assert.equal(aiPut.status, 200);
    const aiGet = await recordFetch('/api/settings/ai', { headers: { Cookie: cookie } });
    assert.equal(aiGet.status, 200);
    assert.equal(JSON.parse(aiGet.text).hasApiKey, true);

    await recordFetch('/api/settings/ai/test', {
      method: 'POST',
      headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
    });
    await recordFetch('/api/ai', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], capability: 'lesson' }),
    });

    // Check 0700 data dir and 0600 file modes.
    assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(dataDir, 'family-state.json'))).mode & 0o777, 0o600);
    assert.equal((await stat(join(dataDir, 'secrets.json'))).mode & 0o777, 0o600);

    // 6. Backup archive excludes secrets.json and carries mode 0600.
    const backupRun = spawnSync(process.execPath, ['scripts/backup.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, HARRINGTON_DATA_DIR: dataDir, HARRINGTON_BACKUP_DIR: backupDir },
      encoding: 'utf8',
    });
    assert.equal(backupRun.status, 0, backupRun.stderr);
    const archives = await readdir(backupDir);
    assert.equal(archives.length, 1);
    const archivePath = join(backupDir, archives[0]);
    assert.equal((await stat(archivePath)).mode & 0o777, 0o600);
    const listed = spawnSync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
    assert.equal(listed.status, 0);
    assert.match(listed.stdout, /family-state\.json/);
    assert.doesNotMatch(listed.stdout, /secrets\.json/);
    const extracted = spawnSync('tar', ['-xOzf', archivePath], { encoding: 'utf8' });
    assert.equal(extracted.status, 0);
    assert.equal(extracted.stdout.includes(FAKE_TOKEN), false, 'backup archive must not contain access token');
    assert.equal(extracted.stdout.includes(FAKE_KEY), false, 'backup archive must not contain AI API key');

    // 7. /login throttling ignores spoofed X-Forwarded-For and never logs submitted tokens.
    for (let i = 1; i <= 5; i += 1) {
      const bad = await recordFetch('/login', {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Forwarded-For': `198.51.100.${i}`,
        },
        body: new URLSearchParams({ token: WRONG_TOKEN }).toString(),
      });
      assert.equal(bad.status, 401);
    }
    const throttled = await recordFetch('/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-For': '203.0.113.99',
      },
      body: new URLSearchParams({ token: FAKE_TOKEN }).toString(),
    });
    assert.equal(throttled.status, 429);
    assert.ok(throttled.headers.get('retry-after'));

    // Give stderr a brief moment to flush the login warning lines, then sweep everything.
    await new Promise((r) => setTimeout(r, 50));
    assert.match(serverLogs, /Sign-in refused for 127\.0\.0\.1: throttled \(429/);

    const allTexts = [serverLogs, backupRun.stdout, backupRun.stderr, ...observedResponses];
    for (const secret of [FAKE_TOKEN, FAKE_KEY, WRONG_TOKEN]) {
      for (const blob of allTexts) {
        assert.equal(blob.includes(secret), false, `Secret "${secret}" leaked into server output or HTTP response`);
      }
    }
  });
});
