import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { isLoopbackAddress } from '../lib/loopback.mjs';
import { plainHttpPublicHost, readStoredAiSettings, resolveAiSettings } from '../lib/ai-provider.mjs';
import { seedFixtureTaxonomy } from './support/fixture-taxonomy.mjs';
import { waitForOutput } from './support/wait-for-output.mjs';
import { AI_CAPABILITIES, parseCapabilities } from '../src/js/ai-capabilities.js';
import { APP_CSP } from '../src/js/figures/contract.js';
import { SCHEMA_VERSION, formatCopyName } from '../src/js/schema.js';

const repoRoot = new URL('..', import.meta.url);
let child;
let dataDir;
let baseUrl;
let serverLog = ''; // everything the main server prints after it starts

async function startServer() {
  dataDir = await mkdtemp(join(tmpdir(), 'harrington-test-'));
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dataDir,
      // A parent's shell may export the deployment settings; tests choose their own.
      HARRINGTON_ACCESS_TOKEN: '',
      HARRINGTON_PUBLISHED_HOST: '',
      HARRINGTON_ALLOWED_HOSTS: '',
      HARRINGTON_BACKUP_DIR: join(dataDir, 'backups'),
      HARRINGTON_AI_BASE_URL: '',
      HARRINGTON_AI_MODEL: '',
      HARRINGTON_AI_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); serverLog += chunk.toString(); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${output}`));
    });
  });
}

describe('self-hosted Harrington server', { concurrency: false }, () => {
before(startServer);
after(async () => {
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('serves Harrington and reports self-hosted health', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    mode: 'self-hosted',
    host: 'loopback',
    authEnabled: false,
    aiConfigured: false,
    aiSource: 'none',
    aiCapabilities: [],
    notesOptInCount: 0,
    redaction: 'server+client',
    taxonomyCached: false,
    taxonomy: 'not-downloaded',
    taxonomyRevision: null,
    stateVersion: 0,
    stateBytes: 0,
    backupAgeDays: null,
  });

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Harrington/);
});

test('serves a figure page with a policy that allows no network and always sandboxes it (HAR-34)', async () => {
  const figure = await fetch(`${baseUrl}/figures/mt_B3W5EfimJw.html`);
  assert.equal(figure.status, 200);
  assert.match(figure.headers.get('content-type'), /^text\/html/);
  const csp = figure.headers.get('content-security-policy');
  for (const directive of ["default-src 'none'", "script-src 'unsafe-inline'", "frame-ancestors 'self'", 'sandbox allow-scripts']) {
    assert.ok(csp.split('; ').includes(directive), `${directive} in ${csp}`);
  }
  assert.doesNotMatch(csp, /connect-src|allow-same-origin/);
  // The policy follows the file, not the spelling of the URL: these reach the same page.
  for (const variant of ['/figures//mt_B3W5EfimJw.html', '/figures/%2Fmt_B3W5EfimJw.html', '/figures/./mt_B3W5EfimJw.html', '/js/../figures/mt_B3W5EfimJw.html', '/FIGURES/../figures/mt_B3W5EfimJw.html']) {
    const res = await fetch(`${baseUrl}${variant}`);
    assert.equal(res.status, 200, variant);
    assert.equal(res.headers.get('content-security-policy'), csp, variant);
  }
  // The app's pages lock scripts, styles, connections, framing and referrer leakage (HAR-51).
  const home = await fetch(baseUrl);
  assert.equal(home.headers.get('content-security-policy'), APP_CSP);
  assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
  const indexRes = await fetch(`${baseUrl}/index.html`);
  assert.equal(indexRes.headers.get('content-security-policy'), APP_CSP);
  assert.equal(indexRes.headers.get('referrer-policy'), 'no-referrer');
  const scriptRes = await fetch(`${baseUrl}/js/app.js`);
  assert.equal(scriptRes.headers.get('content-security-policy'), null);
  assert.equal(scriptRes.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await fetch(`${baseUrl}/api/health`)).headers.get('referrer-policy'), 'no-referrer');
  assert.equal(figure.headers.get('referrer-policy'), 'no-referrer');
});

test('lists every figure page in src/figures/ with the title and hint it carries (HAR-34)', async () => {
  const res = await fetch(`${baseUrl}/api/figures`);
  assert.equal(res.status, 200);
  const { figures } = await res.json();
  const files = (await readdir(new URL('../src/figures/', import.meta.url))).filter((n) => n.endsWith('.html'));
  assert.deepEqual(figures.map((f) => `${f.id}.html`), files.sort());
  const cart = figures.find((f) => f.id === 'mt_B3W5EfimJw');
  assert.equal(cart.title, 'Toy cart');
  assert.match(cart.hint, /^Push the cart/);
  assert.equal((await fetch(`${baseUrl}/api/figures`, { method: 'POST' })).status, 405);
});

test('lists a page dropped into src/figures/ at once, and skips one that breaks the contract (HAR-34)', async () => {
  // Its own server in a temporary checkout (server.mjs, lib and src/js linked, its own src/figures/),
  // so the repository's figures folder is never touched while other test files read it.
  const root = await mkdtemp(join(tmpdir(), 'harrington-figures-'));
  const figures = join(root, 'src', 'figures');
  await mkdir(figures, { recursive: true });
  await writeFile(join(root, 'server.mjs'), await readFile(new URL('../server.mjs', import.meta.url)));
  await symlink(fileURLToPath(new URL('../src/js', import.meta.url)), join(root, 'src', 'js'));
  await symlink(fileURLToPath(new URL('../lib', import.meta.url)), join(root, 'lib'));
  const page = await readFile(new URL('../src/figures/mt_B3W5EfimJw.html', import.meta.url), 'utf8');
  await writeFile(join(figures, 'mt_zzDropInBroken.html'), page.replace('</body>', '<a href="https://example.org">more</a></body>'));
  await writeFile(join(figures, 'mt_zzDropInTooBig.html'), page.replace('</body>', `<!-- ${'x'.repeat(100 * 1024)} --></body>`));
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, HARRINGTON_HOST: '127.0.0.1', HARRINGTON_PORT: '0', HARRINGTON_DATA_DIR: join(root, 'data'),
      HARRINGTON_ACCESS_TOKEN: '', HARRINGTON_PUBLISHED_HOST: '', HARRINGTON_ALLOWED_HOSTS: '', HARRINGTON_AI_BASE_URL: '', HARRINGTON_AI_MODEL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stderr.on('data', (chunk) => { log += chunk.toString(); });
  try {
    const url = await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('server did not start')), 5000);
      let out = '';
      server.stdout.on('data', (chunk) => { out += chunk.toString(); const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(timer); done(m[0]); } });
    });
    const list = async () => (await (await fetch(`${url}/api/figures`)).json()).figures;
    assert.deepEqual(await list(), []);
    assert.match(await waitForOutput(() => log, /mt_zzDropInBroken/), /Figure mt_zzDropInBroken\.html is not shown: it has an http\(s\) URL/);
    assert.match(await waitForOutput(() => log, /mt_zzDropInTooBig/), /Figure mt_zzDropInTooBig\.html is not shown: it is \d+ bytes \(the limit is 102400\)/);
    // A good page dropped in while the server runs is listed on the next request.
    await writeFile(join(figures, 'mt_zzDropInGood.html'), page.replace('<title>Toy cart</title>', '<title>Dropped in</title>'));
    const [good] = await list();
    assert.equal(good.id, 'mt_zzDropInGood');
    assert.equal(good.title, 'Dropped in');
    assert.match(good.hint, /^Push the cart/);
  } finally {
    server.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  }
});

test('health reports the age in days of the newest archive in HARRINGTON_BACKUP_DIR', async () => {
  // The server was started with HARRINGTON_BACKUP_DIR pointing here, not at the repo's backups/.
  const backups = join(dataDir, 'backups');
  const ageOf = async () => (await (await fetch(`${baseUrl}/api/health`)).json()).backupAgeDays;
  await mkdir(backups, { recursive: true });
  assert.equal(await ageOf(), null, 'an empty folder has no backup');

  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000 - 60_000);
  const archive = async (name, days) => {
    await writeFile(join(backups, name), 'x');
    await utimes(join(backups, name), daysAgo(days), daysAgo(days));
  };
  await archive('harrington-old.tar.gz', 12);
  assert.equal(await ageOf(), 12);
  await archive('harrington-newer.tar.gz', 3);
  await archive('notes.txt', 0); // not a backup archive
  assert.equal(await ageOf(), 3);
  await rm(backups, { recursive: true, force: true });
  assert.equal(await ageOf(), null);
});

test('health still answers when the backup folder cannot be read', async () => {
  const backups = join(dataDir, 'backups');
  const health = async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.doesNotMatch(JSON.stringify(body), /backups/, 'no path in the health answer');
    return body.backupAgeDays;
  };
  // A symlink loop (ELOOP).
  await symlink('backups', backups);
  assert.equal(await health(), null);
  await rm(backups, { force: true });
  // A file where the folder should be (ENOTDIR).
  await writeFile(backups, 'not a folder');
  assert.equal(await health(), null);
  await rm(backups, { force: true });
  // One log line for the first unreadable folder, naming the error code, never the path.
  const lines = (await waitForOutput(() => serverLog, /Cannot read the backup folder/)).split('\n').filter((line) => line.includes('Cannot read the backup folder'));
  assert.equal(lines.length, 1, serverLog);
  assert.match(lines[0], /\(ELOOP\)/);
  assert.ok(!serverLog.includes(dataDir), 'the log names no path');
});

function putState(value, ifMatch, url = baseUrl) {
  const headers = { 'Content-Type': 'application/json' };
  if (ifMatch !== undefined) headers['If-Match'] = ifMatch;
  return fetch(`${url}/api/state`, { method: 'PUT', headers, body: JSON.stringify(value) });
}

function withoutMeta({ version: _version, updatedAt: _updatedAt, writeId: _writeId, ...rest }) {
  return rest;
}

test('persists versioned family state on the Harrington server', async () => {
  const empty = await fetch(`${baseUrl}/api/state`);
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get('etag'), '"v0"');
  // A new document is at the current data format (src/js/schema.js).
  assert.deepEqual(await empty.json(), { schemaVersion: SCHEMA_VERSION, version: 0 });

  const state = {
    students: [{ id: 'student-1', name: 'Sample Learner', birthYear: 2018 }],
    activeStudentId: 'student-1',
    progress: { 'student-1': { counting: { status: 'learning' } } },
  };

  const saved = await putState(state, '"v0"');
  assert.equal(saved.status, 204);
  assert.equal(saved.headers.get('etag'), '"v1"');

  const loaded = await fetch(`${baseUrl}/api/state`);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get('etag'), '"v1"');
  const body = await loaded.json();
  assert.equal(body.version, 1);
  assert.equal(typeof body.updatedAt, 'number');
  assert.deepEqual(withoutMeta(body), state);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8')), body);

  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.equal(health.stateVersion, 1);
  assert.equal(health.stateBytes, (await readFile(join(dataDir, 'family-state.json'))).length);
});

test('rejects a stale or missing If-Match without writing', async () => {
  const current = await (await fetch(`${baseUrl}/api/state`)).json();
  const before = await readFile(join(dataDir, 'family-state.json'), 'utf8');

  const stale = await putState({ students: [] }, `"v${current.version - 1}"`);
  assert.equal(stale.status, 412);
  assert.equal(stale.headers.get('etag'), `"v${current.version}"`);
  assert.deepEqual(await stale.json(), current);

  const missing = await putState({ students: [] });
  assert.equal(missing.status, 428);

  const malformed = await putState({ students: [] }, 'yesterday');
  assert.equal(malformed.status, 400);

  assert.equal(await readFile(join(dataDir, 'family-state.json'), 'utf8'), before);
});

test('lets only one of several concurrent writers with the same version succeed', async () => {
  const { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  const snapshots = Array.from({ length: 12 }, (_, index) => ({
    students: [{ id: `student-${index}`, name: `Learner ${index}`, birthYear: 2010 + index }],
    activeStudentId: `student-${index}`,
    progress: { [`student-${index}`]: { counting: { status: 'learning', sequence: index } } },
  }));

  const responses = await Promise.all(snapshots.map((snapshot) => putState(snapshot, `"v${version}"`)));
  const statuses = responses.map((response) => response.status);
  assert.equal(statuses.filter((status) => status === 204).length, 1, `statuses: ${statuses}`);
  assert.equal(statuses.filter((status) => status === 412).length, snapshots.length - 1);

  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  const saved = JSON.parse(await readFile(join(dataDir, 'family-state.json'), 'utf8'));
  assert.equal(loaded.version, version + 1);
  assert.ok(snapshots.some((snapshot) => isDeepStrictEqual(withoutMeta(loaded), snapshot)));
  assert.deepEqual(saved, loaded);
  for (const response of responses.filter((r) => r.status === 412)) {
    assert.equal((await response.json()).version >= version, true);
  }
});

test('accepts an unload beacon with the version in the body', async () => {
  const { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  const beacon = { students: [{ id: 'b', name: 'Beacon Learner', birthYear: 2019 }], activeStudentId: 'b' };

  const stale = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...beacon, version: version + 5 }),
  });
  assert.equal(stale.status, 412);

  const noVersion = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(beacon),
  });
  assert.equal(noVersion.status, 428);

  const sent = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...beacon, version }),
  });
  assert.equal(sent.status, 204);
  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(loaded.version, version + 1);
  assert.deepEqual(withoutMeta(loaded), beacon);
});

test('rejects cross-site and non-JSON state writes without touching the file', async () => {
  const before = await readFile(join(dataDir, 'family-state.json'), 'utf8');
  const { version } = JSON.parse(before);

  // An HTML form can POST text/plain cross-site without a preflight.
  const form = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ students: [], version, x: '=' }),
  });
  assert.equal(form.status, 415);

  for (const site of ['cross-site', 'same-site']) {
    const beacon = await fetch(`${baseUrl}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': site },
      body: JSON.stringify({ students: [], version }),
    });
    assert.equal(beacon.status, 403);
    const put = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"v${version}"`, 'Sec-Fetch-Site': site },
      body: JSON.stringify({ students: [] }),
    });
    assert.equal(put.status, 403);
  }

  assert.equal(await readFile(join(dataDir, 'family-state.json'), 'utf8'), before);
});

test('stores a client writeId and returns it on reads and conflicts', async () => {
  const { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  const state = { students: [{ id: 'w', name: 'Write Id Learner', birthYear: 2019 }], activeStudentId: 'w' };

  const sameOrigin = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"v${version}"`, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ ...state, writeId: 'tab-a-1' }),
  });
  assert.equal(sameOrigin.status, 204);
  const loaded = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(loaded.writeId, 'tab-a-1');

  const stale = await putState({ ...state, writeId: 'tab-b-1' }, `"v${version}"`);
  assert.equal(stale.status, 412);
  assert.equal((await stale.json()).writeId, 'tab-a-1');

  // Echoing the stored id back (read, modify, write) does not claim it.
  const echoed = await putState({ ...loaded, students: [], activeStudentId: null }, `"v${loaded.version}"`);
  assert.equal(echoed.status, 204);
  const afterEcho = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(afterEcho.writeId, undefined);

  // Ids that are not short strings are not stored.
  assert.equal((await putState({ ...state, writeId: 'x'.repeat(65) }, `"v${afterEcho.version}"`)).status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/state`)).json()).writeId, undefined);
});

test('refuses a save the app could not render (422) or a data format it does not know (409)', async () => {
  const current = async () => (await fetch(`${baseUrl}/api/state`)).json();
  const before = await current();
  const tag = `"v${before.version}"`;
  const learner = { id: 'v1', name: 'Valid Learner', birthYear: 2019 };
  for (const [body, error] of [
    [{ students: [{ ...learner, id: 'constructor' }] }, 'The learner “Valid Learner” in the file has an id that is not 1 to 64 letters, digits, "-" or "_".'],
    [{ students: [learner], records: { v1: [{ id: 'r', type: '<img src=x onerror=alert(1)>' }] } }, 'A record for Valid Learner in the file (records item 1) has a type other than observation, question, discussion, assessment, recording, note.'],
    [{ students: [learner], tests: { v1: [{ pct: '<b>' }] } }, 'A test result for Valid Learner in the file (tests item 1) has a score outside 0 to 100%.'],
    [{ students: [learner], game: { v1: { xp: '<b>' } } }, 'Valid Learner\'s XP is not a number of zero or more.'],
    [{ students: 'nope' }, 'The file has no learner list.'],
    [{ schemaVersion: 'one', students: [] }, 'schemaVersion must be a whole number'],
    [{ schemaVersion: SCHEMA_VERSION, students: [learner], settings: { parentPin: '2468' } }, 'The file keeps the child-view PIN in plain text, which this data format does not allow.'],
    [{ students: [learner], settings: { parentPinHash: 'X'.repeat(64), parentPinSalt: 'a'.repeat(32) } }, 'The file\'s child-view PIN hash is not 64 lowercase hex characters.'],
  ]) {
    const response = await putState(body, tag);
    assert.equal(response.status, 422, error);
    assert.deepEqual(await response.json(), { error });
  }
  // The unload beacon path is checked the same way.
  const beacon = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ students: [{ ...learner, id: '__proto__' }], version: before.version }),
  });
  assert.equal(beacon.status, 422);

  // AI questions can carry fractional points: a fractional score saves.
  const fractional = await putState({ students: [learner], tests: { v1: [{ id: 't', score: 2.5, total: 3.5, pct: 71, passed: false }] } }, tag);
  assert.equal(fractional.status, 204);
  const afterFractional = await current();
  const tag2 = `"v${afterFractional.version}"`;

  const newer = await putState({ schemaVersion: SCHEMA_VERSION + 1, students: [] }, tag2);
  assert.equal(newer.status, 409);
  assert.match((await newer.json()).error, new RegExp(`reads family data up to format ${SCHEMA_VERSION}; the save is format ${SCHEMA_VERSION + 1}`));

  // Once the stored document is at the current format, an older save is refused.
  assert.equal((await putState({ schemaVersion: SCHEMA_VERSION, students: [learner] }, tag2)).status, 204);
  const stored = await current();
  const older = await putState({ students: [learner] }, `"v${stored.version}"`);
  assert.equal(older.status, 409);
  assert.match((await older.json()).error, new RegExp(`family data is format ${SCHEMA_VERSION}; this save is format 0`));
  assert.deepEqual(await current(), stored, 'nothing refused was written');
  // Leave the store as later tests expect: back to a document without the field.
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify({ ...before, version: stored.version }));
});

test('rejects >64 KB unknown top-level fields (422) and drops orphan/prototype per-learner keys on save (HAR-56)', async () => {
  const current = async () => (await fetch(`${baseUrl}/api/state`)).json();
  const before = await current();
  const learner = { id: 's_g11', name: 'G11 Learner', birthYear: 2018 };

  // >64 KB smuggled unknown top-level field is rejected with 422.
  const tooLarge = await putState({ students: [learner], smuggled: 'x'.repeat(70 * 1024) }, `"v${before.version}"`);
  assert.equal(tooLarge.status, 422);
  assert.deepEqual(await tooLarge.json(), { error: 'The file\'s unrecognised fields are larger than 64 KB.' });

  // <=64 KB unknown top-level field is kept (forward compat), while __proto__ and orphan learner keys are dropped.
  const payloadText = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    students: [learner],
    activeStudentId: 's_g11',
    futureNote: 'kept',
    records: {
      __proto__: [{ id: 'r_p', type: 'note', note: 'smuggled' }],
      not_a_learner: [{ id: 'r_o', type: 'note', note: 'orphan' }],
      s_g11: [{ id: 'r_1', type: 'note', note: 'real' }],
    },
    progress: {
      not_a_learner: { counting: { status: 'mastered' } },
      s_g11: { counting: { status: 'learning' } },
    },
  });
  const saved = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"v${before.version}"` },
    body: payloadText,
  });
  assert.equal(saved.status, 204);

  const stored = await current();
  assert.equal(stored.futureNote, 'kept');
  assert.deepEqual(Object.keys(stored.records), ['s_g11']);
  assert.deepEqual(Object.keys(stored.progress), ['s_g11']);

  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify({ ...before, version: stored.version }));
});

test('round-trips an export through import', async () => {
  const family = {
    students: [{ id: 's1', name: 'Sample One', birthYear: 2017 }, { id: 's2', name: 'Sample Two', birthYear: 2020 }],
    activeStudentId: 's1',
    progress: { s1: { counting: { status: 'mastered', updatedAt: 1 } } },
    records: { s1: [{ id: 'r1', topicId: 'counting', type: 'note', title: 'Counted shells' }], s2: [] },
    tests: { s1: [{ id: 't1', subject: 'Mathematics', pct: 100, passed: true }] },
    notifications: [],
    graphView: 'list',
  };
  let { version } = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal((await putState(family, `"v${version}"`)).status, 204);

  // Export: the full document plus exportedAt and taxonomyVersion (added by the client).
  const exported = { ...(await (await fetch(`${baseUrl}/api/state`)).json()), exportedAt: new Date().toISOString(), taxonomyVersion: 'v1' };
  const exportedText = JSON.stringify(exported, null, 2);

  // Something else overwrites the family data.
  version = exported.version;
  assert.equal((await putState({ students: [] }, `"v${version}"`)).status, 204);

  // Import: parse the file, drop export metadata, save with the current If-Match.
  const { version: _v, updatedAt: _u, exportedAt: _e, taxonomyVersion: _t, ...data } = JSON.parse(exportedText);
  const current = await fetch(`${baseUrl}/api/state`);
  const imported = await putState(data, current.headers.get('etag'));
  assert.equal(imported.status, 204);

  const restored = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(restored.version, version + 2);
  assert.deepEqual(withoutMeta(restored), family);
});

test('migrates a legacy state document without a version as version 0', async () => {
  const legacy = { students: [{ id: 'old', name: 'Legacy Learner', birthYear: 2016 }], activeStudentId: 'old' };
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify(legacy));

  const loaded = await fetch(`${baseUrl}/api/state`);
  assert.equal(loaded.headers.get('etag'), '"v0"');
  assert.deepEqual(await loaded.json(), { ...legacy, version: 0 });
  assert.equal((await putState(legacy, '"v1"')).status, 412);
  assert.equal((await putState(legacy, '"v0"')).status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/state`)).json()).version, 1);
});

test('the first save in a newer format keeps the stored document as family-state.format-N.json, once', async () => {
  const copy = join(dataDir, formatCopyName(2));
  await rm(copy, { force: true });
  const older = { schemaVersion: 2, version: 40, students: [{ id: 'k1', name: 'Kept Learner', birthYear: 2018 }], records: { k1: [{ id: 'r', type: 'note', note: 'the whole note' }] } };
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify(older));
  const repaired = { ...older, schemaVersion: SCHEMA_VERSION, records: { k1: [{ id: 'r', type: 'note', note: 'the whole' }] } };
  assert.equal((await putState(repaired, '"v40"')).status, 204);
  assert.deepEqual(JSON.parse(await readFile(copy, 'utf8')), older, 'the copy is the document as stored');
  // A save in the same format writes no copy; a later upgrade from format 2
  // again keeps the first copy.
  assert.equal((await putState(repaired, '"v41"')).status, 204);
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify({ ...older, version: 50, students: [] }));
  assert.equal((await putState({ ...repaired, version: 50 }, '"v50"')).status, 204);
  assert.deepEqual(JSON.parse(await readFile(copy, 'utf8')), older);
});

test('the kept copy of a format 1 document leaves out its plain child-view PIN', async () => {
  const copy = join(dataDir, formatCopyName(1));
  await rm(copy, { force: true });
  const older = { schemaVersion: 1, version: 60, students: [{ id: 'p1', name: 'Pin Learner', birthYear: 2018 }], settings: { parentPin: '2468', calendar: { homeDays: [1, 2] } } };
  await writeFile(join(dataDir, 'family-state.json'), JSON.stringify(older));
  const upgraded = { ...older, schemaVersion: SCHEMA_VERSION, settings: { parentPinHash: 'a'.repeat(64), parentPinSalt: 'b'.repeat(32), calendar: { homeDays: [1, 2] } } };
  assert.equal((await putState(upgraded, '"v60"')).status, 204);
  const kept = JSON.parse(await readFile(copy, 'utf8'));
  assert.equal('parentPin' in kept.settings, false);
  assert.deepEqual(kept.settings, { calendar: { homeDays: [1, 2] } });
  assert.doesNotMatch(await readFile(copy, 'utf8'), /2468/);
});

test('persists lesson cache entries and recordings', async () => {
  const lesson = { title: 'Counting outdoors', activities: ['Gather ten leaves'] };
  const lessonId = encodeURIComponent('number/counting');
  const savedLesson = await fetch(`${baseUrl}/api/lessons/${lessonId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lesson),
  });
  assert.equal(savedLesson.status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/lessons/${lessonId}`)).json(), lesson);

  const topicLesson = { objective: 'count to five', duration: '20 minutes' };
  const topicKey = encodeURIComponent('topic:count-to-5');
  assert.equal((await fetch(`${baseUrl}/api/lessons/${topicKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topicLesson),
  })).status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/lessons/${topicKey}`)).json(), topicLesson);

  const audio = new Uint8Array([1, 2, 3, 4]);
  const savedAudio = await fetch(`${baseUrl}/api/audio/recording-1.webm`, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/webm' },
    body: audio,
  });
  assert.equal(savedAudio.status, 204);
  const loadedAudio = await fetch(`${baseUrl}/api/audio/recording-1.webm`);
  assert.equal(loadedAudio.headers.get('content-type'), 'audio/webm');
  assert.equal(loadedAudio.headers.get('content-security-policy'), 'sandbox');
  assert.equal(loadedAudio.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(loadedAudio.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(loadedAudio.headers.get('x-frame-options'), 'DENY');
  assert.equal(loadedAudio.headers.get('content-disposition'), null);
  assert.deepEqual(new Uint8Array(await loadedAudio.arrayBuffer()), audio);
  assert.equal((await fetch(`${baseUrl}/api/audio/recording-1.webm`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${baseUrl}/api/audio/recording-1.webm`)).status, 404);
});

test('refuses cross-site and non-JSON writes across AI, lessons, recordings and state (HAR-50)', async () => {
  const lessonUrl = `${baseUrl}/api/lessons/${encodeURIComponent('topic:guard-test')}`;
  const audioUrl = `${baseUrl}/api/audio/${encodeURIComponent('guard-test.webm')}`;

  // Seed one recording so we verify DELETE does not delete it on a cross-site request.
  assert.equal((await fetch(audioUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/webm' },
    body: new Uint8Array([1, 2, 3]),
  })).status, 204);

  // PUT /api/state also rejects non-JSON Content-Type with 415.
  const stateNonJson = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain', 'If-Match': '"v0"' },
    body: JSON.stringify({ students: [] }),
  });
  assert.equal(stateNonJson.status, 415);

  // Lesson writes require same-origin (or none) and application/json.
  assert.equal((await fetch(lessonUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ objective: 'blocked' }),
  })).status, 403);
  assert.equal((await fetch(lessonUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ objective: 'blocked' }),
  })).status, 415);
  assert.equal((await fetch(lessonUrl)).status, 404);

  // Recording writes and deletes reject cross-site requests.
  assert.equal((await fetch(`${baseUrl}/api/audio/cross-site.webm`, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/webm', 'Sec-Fetch-Site': 'cross-site' },
    body: new Uint8Array([9, 9]),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/audio/cross-site.webm`)).status, 404);

  assert.equal((await fetch(audioUrl, {
    method: 'DELETE',
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  })).status, 403);
  assert.equal((await fetch(audioUrl)).status, 200);
  assert.equal((await fetch(audioUrl, { method: 'DELETE' })).status, 204);

  // POST /api/ai checks Sec-Fetch-Site and Content-Type before reading the body or calling the provider.
  let providerCalls = 0;
  const upstream = createServer(async (req, res) => {
    providerCalls += 1;
    await readRequestBody(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  await listen(upstream);
  const aiServer = await spawnHarrington({
    HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
    HARRINGTON_AI_MODEL: 'llama3.2',
  });
  try {
    const crossSite = await fetch(`${aiServer.url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'explain' }),
    });
    assert.equal(crossSite.status, 403);
    const plainText = await fetch(`${aiServer.url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'explain' }),
    });
    assert.equal(plainText.status, 415);
    assert.equal(providerCalls, 0);
  } finally {
    await aiServer.stop();
    upstream.close();
  }
});

test('hardens /api/audio/ uploads and legacy sidecars against stored script execution (HAR-47)', async () => {
  const metaPath = (key) => join(dataDir, 'audio', `${Buffer.from(key, 'utf8').toString('base64url')}.meta.json`);
  const binPath = (key) => join(dataDir, 'audio', `${Buffer.from(key, 'utf8').toString('base64url')}.bin`);
  const scriptPayload = '<script>document.title="LEAK"</script>';

  // Hostile Content-Types on PUT are normalised to application/octet-stream on disk
  // and served back only as sandboxed attachments.
  for (const [key, contentType, expectedDisposition] of [
    ['evil', 'text/html', 'attachment; filename="evil.bin"'],
    ['trap.html', 'text/html; charset=utf-8', 'attachment; filename="trap.bin"'],
    ['vector.svg', 'image/svg+xml', 'attachment; filename="vector.bin"'],
    ['script.js', 'application/javascript', 'attachment; filename="script.bin"'],
    ['movie.webm', 'video/webm', 'attachment; filename="movie.bin"'],
    ['odd"name.html', 'text/html', 'attachment; filename="odd-name.bin"'],
  ]) {
    const encoded = encodeURIComponent(key);
    const put = await fetch(`${baseUrl}/api/audio/${encoded}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: scriptPayload,
    });
    assert.equal(put.status, 204, key);
    assert.deepEqual(JSON.parse(await readFile(metaPath(key), 'utf8')), { contentType: 'application/octet-stream' });

    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(`${baseUrl}/api/audio/${encoded}`, { method });
      assert.equal(res.status, 200, `${method} ${key}`);
      assert.equal(res.headers.get('content-type'), 'application/octet-stream');
      assert.equal(res.headers.get('content-disposition'), expectedDisposition);
      assert.equal(res.headers.get('content-security-policy'), 'sandbox');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      if (method === 'GET') assert.equal(await res.text(), scriptPayload);
    }
    assert.equal((await fetch(`${baseUrl}/api/audio/${encoded}`, { method: 'DELETE' })).status, 204);
  }

  // Missing Content-Type on PUT also stores and serves as application/octet-stream.
  assert.equal((await fetch(`${baseUrl}/api/audio/no-type`, { method: 'PUT', body: new Uint8Array([9, 8, 7]) })).status, 204);
  const noType = await fetch(`${baseUrl}/api/audio/no-type`);
  assert.equal(noType.headers.get('content-type'), 'application/octet-stream');
  assert.equal(noType.headers.get('content-disposition'), 'attachment; filename="no-type.bin"');
  await fetch(`${baseUrl}/api/audio/no-type`, { method: 'DELETE' });

  // A pre-existing or restored sidecar on disk with text/html, image/svg+xml,
  // or corrupt JSON is still downgraded on GET and HEAD.
  await mkdir(join(dataDir, 'audio'), { recursive: true });
  for (const [key, rawMeta] of [
    ['restored-html', '{"contentType":"text/html"}\n'],
    ['restored-svg', '{"contentType":"image/svg+xml"}\n'],
    ['restored-corrupt', '{not-json'],
  ]) {
    await writeFile(binPath(key), scriptPayload);
    await writeFile(metaPath(key), rawMeta);
    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(`${baseUrl}/api/audio/${key}`, { method });
      assert.equal(res.status, 200, `${method} ${key}`);
      assert.equal(res.headers.get('content-type'), 'application/octet-stream');
      assert.equal(res.headers.get('content-disposition'), `attachment; filename="${key}.bin"`);
      assert.equal(res.headers.get('content-security-policy'), 'sandbox');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    }
    await fetch(`${baseUrl}/api/audio/${key}`, { method: 'DELETE' });
  }

  // Legitimate browser audio MIME types (including codec parameters) are stored
  // normalised to their clean essence type and served inline with sandbox headers.
  for (const [sent, expected] of [
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['AUDIO/MP4; codecs="mp4a.40.2"', 'audio/mp4'],
    ['audio/ogg; codecs=opus', 'audio/ogg'],
    ['audio/mpeg', 'audio/mpeg'],
    ['audio/wav', 'audio/wav'],
    ['audio/wave', 'audio/wave'],
    ['audio/x-wav', 'audio/x-wav'],
    ['audio/aac', 'audio/aac'],
    ['audio/x-m4a', 'audio/x-m4a'],
    ['audio/flac', 'audio/flac'],
  ]) {
    const key = `good-${expected.slice('audio/'.length)}`;
    const put = await fetch(`${baseUrl}/api/audio/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': sent },
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
    });
    assert.equal(put.status, 204, sent);
    assert.deepEqual(JSON.parse(await readFile(metaPath(key), 'utf8')), { contentType: expected });
    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(`${baseUrl}/api/audio/${key}`, { method });
      assert.equal(res.status, 200, `${method} ${sent}`);
      assert.equal(res.headers.get('content-type'), expected);
      assert.equal(res.headers.get('content-disposition'), null);
      assert.equal(res.headers.get('content-security-policy'), 'sandbox');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    }
    await fetch(`${baseUrl}/api/audio/${key}`, { method: 'DELETE' });
  }
});

test('lists saved lesson keys and times by prefix, without content', async () => {
  const put = (key, value) => fetch(`${baseUrl}/api/lessons/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  const list = async (prefix) => fetch(`${baseUrl}/api/lessons?prefix=${encodeURIComponent(prefix)}`);
  for (const key of ['topic:list-a', 'print:list-a', 'recall:list-a', 'act:list-a:game:Hop']) {
    assert.equal((await put(key, { secret: 'content stays on its own route' })).status, 204);
  }
  // Something in the directory that is not a cache entry is ignored.
  await writeFile(join(dataDir, 'lessons', 'stray.json.123.tmp'), '{}');

  const topics = await list('topic:');
  assert.equal(topics.status, 200);
  assert.match(topics.headers.get('content-type'), /application\/json/);
  assert.equal(topics.headers.get('cache-control'), 'no-store');
  const body = await topics.json();
  assert.deepEqual(Object.keys(body), ['lessons']);
  const keys = body.lessons.map(e => e.key);
  assert.ok(keys.includes('topic:list-a'));
  assert.ok(keys.includes('topic:count-to-5'), 'entries saved by earlier tests');
  assert.ok(keys.every(k => k.startsWith('topic:')));
  for (const entry of body.lessons) {
    assert.deepEqual(Object.keys(entry).sort(), ['key', 'savedAt']);
    assert.ok(Number.isInteger(entry.savedAt) && entry.savedAt > 0);
  }
  assert.ok(body.lessons.every((e, i, all) => i === 0 || all[i - 1].savedAt >= e.savedAt), 'newest first');
  assert.ok(!JSON.stringify(body).includes('content stays'), 'no content in the listing');

  assert.deepEqual((await (await list('print:')).json()).lessons.map(e => e.key), ['print:list-a']);
  assert.deepEqual((await (await list('recall:')).json()).lessons.map(e => e.key), ['recall:list-a']);

  for (const bad of ['act:', 'topic', '', '../']) {
    const res = await list(bad);
    assert.equal(res.status, 400, `prefix ${JSON.stringify(bad)}`);
    assert.deepEqual(await res.json(), { error: 'prefix must be one of topic:, print: or recall:' });
  }
  assert.equal((await fetch(`${baseUrl}/api/lessons`)).status, 400, 'no prefix');
  const post = await fetch(`${baseUrl}/api/lessons?prefix=topic:`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
});

test('caps the saved lessons listing at the newest 200 and clamps limit', async () => {
  const put = (key) => fetch(`${baseUrl}/api/lessons/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objective: key }),
  });
  for (let i = 0; i < 210; i++) assert.equal((await put(`recall:cap-${i}`)).status, 204);
  await new Promise(resolve => setTimeout(resolve, 25)); // a later mtime than every entry above
  assert.equal((await put('recall:cap-newest')).status, 204);
  const list = async (query) => fetch(`${baseUrl}/api/lessons?prefix=recall:${query}`);

  const all = (await (await list('')).json()).lessons;
  assert.equal(all.length, 200, 'bounded without a limit');
  assert.equal(all[0].key, 'recall:cap-newest', 'newest first');
  assert.ok(all.every((e, i) => i === 0 || all[i - 1].savedAt >= e.savedAt), 'ordered by saved time');

  assert.deepEqual((await (await list('&limit=3')).json()).lessons, all.slice(0, 3));
  assert.equal((await (await list('&limit=5000')).json()).lessons.length, 200, 'a larger limit is clamped');
  assert.equal((await (await list('&limit=0')).json()).lessons.length, 1, 'a limit below 1 is clamped');
  for (const bad of ['-1', 'ten', '2.5', '']) {
    const res = await list(`&limit=${bad}`);
    assert.equal(res.status, 400, `limit ${JSON.stringify(bad)}`);
    assert.deepEqual(await res.json(), { error: 'limit must be a whole number' });
  }
});

test('rejects invalid writes and leaves AI disabled by default', async () => {
  const invalid = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"' },
    body: '[]',
  });
  assert.equal(invalid.status, 400);

  const tooLarge = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': '"v1"' },
    body: JSON.stringify({ notes: 'x'.repeat(5 * 1024 * 1024) }),
  });
  assert.equal(tooLarge.status, 413);

  const ai = await fetch(`${baseUrl}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(ai.status, 503);
  assert.match((await ai.json()).error, /not configured/i);
});

test('rejects an unknown taxonomy file name; health reports a stand-in topics.json as outdated', async () => {
  const unknown = await fetch(`${baseUrl}/api/taxonomy/secret.json`);
  assert.equal(unknown.status, 404);

  const payload = { topics: [{ id: 'count-to-5', name: 'Count to 5' }] };
  await mkdir(join(dataDir, 'taxonomy'), { recursive: true });
  await writeFile(join(dataDir, 'taxonomy', 'topics.json'), JSON.stringify(payload));

  // A stand-in file is not the pinned revision: health says so, with no
  // revision. (Fetching it would download the pin; tests/taxonomy-pin.test.mjs
  // covers that without the network.)
  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.equal(health.taxonomyCached, true);
  assert.equal(health.taxonomy, 'outdated');
  assert.equal(health.taxonomyRevision, null);
});
});

test('fetches an allowlisted taxonomy file from upstream and caches it on disk', async () => {
  const fixture = { topics: [{ id: 'count-to-5', name: 'Count to 5' }] };
  let upstreamHits = 0;
  let standardsHits = 0;
  const upstream = createServer((req, res) => {
    if (req.url === '/curriculum-standards.json') standardsHits += 1;
    if (req.url === '/topics.json') {
      upstreamHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fixture));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const isolatedDir = await mkdtemp(join(tmpdir(), 'harrington-taxonomy-'));
  const isolated = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: isolatedDir,
      // A parent's shell may export the deployment settings; tests choose their own.
      HARRINGTON_ACCESS_TOKEN: '',
      HARRINGTON_PUBLISHED_HOST: '',
      HARRINGTON_ALLOWED_HOSTS: '',
      HARRINGTON_TAXONOMY_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const isolatedUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('taxonomy server did not start')), 5000);
      let output = '';
      isolated.stdout.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
      isolated.stderr.on('data', (chunk) => { output += chunk.toString(); });
      isolated.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`taxonomy server exited with ${code}: ${output}`));
      });
    });

    const first = await fetch(`${isolatedUrl}/api/taxonomy/topics.json`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), fixture);
    assert.equal(upstreamHits, 1);
    // A custom upstream caches in its own folder, never next to the pinned files.
    const [customDir] = (await readdir(join(isolatedDir, 'taxonomy'))).filter((name) => name.startsWith('custom-'));
    assert.match(customDir, /^custom-[0-9a-f]{12}$/);
    assert.deepEqual(JSON.parse(await readFile(join(isolatedDir, 'taxonomy', customDir, 'topics.json'), 'utf8')), fixture);
    await assert.rejects(stat(join(isolatedDir, 'taxonomy', 'topics.json')), { code: 'ENOENT' });

    const second = await fetch(`${isolatedUrl}/api/taxonomy/topics.json`);
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), fixture);
    assert.equal(upstreamHits, 1);

    const missing = await fetch(`${isolatedUrl}/api/taxonomy/manifest.json`);
    assert.equal(missing.status, 502);

    // The optional standards file: a failed download is remembered, so the
    // next page load is answered at once without asking the upstream again.
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await fetch(`${isolatedUrl}/api/taxonomy/standards/acara-v9.json`)).status, 502);
    }
    assert.equal(standardsHits, 1);
    // The memory is keyed by the cached source file: once a usable file is in
    // place (here, by hand), the list is served at once, not in five minutes.
    await writeFile(join(isolatedDir, 'taxonomy', customDir, 'curriculum-standards.json'), JSON.stringify({ curricula: [{ slug: 'acara-v9', topics: [
      { key: 'acara-v9:AC9M2N01', code: 'AC9M2N01', data: { title: 'order numbers', strand: 'Number', learningArea: 'Mathematics', subject: 'Mathematics', yearLevels: ['2'] } },
    ] }] }));
    const fixed = await fetch(`${isolatedUrl}/api/taxonomy/standards/acara-v9.json`);
    assert.equal(fixed.status, 200);
    assert.equal((await fixed.json()).standards[0].code, 'AC9M2N01');
    assert.equal(standardsHits, 1);
    // A custom upstream is not checked against the pin.
    assert.equal((await (await fetch(`${isolatedUrl}/api/health`)).json()).taxonomy, 'unchecked');
  } finally {
    isolated.kill('SIGTERM');
    await new Promise((resolve) => isolated.once('exit', resolve));
    upstream.close();
    await rm(isolatedDir, { recursive: true, force: true });
  }
});

test('derives the trimmed Australian Curriculum list, never serves the whole standards file, and follows a replaced source', async () => {
  const curriculum = (title) => ({
    note: 'test',
    curricula: [
      { slug: 'ccss-math', topics: [{ key: 'ccss-math:K.CC.1', code: 'K.CC.1', data: { title: 'Count to 100' } }] },
      { slug: 'acara-v9', name: 'Australian Curriculum', version: 'v9', sourceUrl: 'https://v9.australiancurriculum.edu.au/', topics: [
        { key: 'acara-v9:AC9M2N01', code: 'AC9M2N01', data: { title, description: title, strand: 'Number', subject: 'Mathematics', learningArea: 'Mathematics', yearLevels: ['2'], taxonomy: { grade: 'Year 2' } } },
      ] },
    ],
  });
  const dir = await mkdtemp(join(tmpdir(), 'harrington-standards-'));
  const env = await seedFixtureTaxonomy(dir, { 'curriculum-standards.json': curriculum('order numbers') });
  const server = await spawnHarrington(env, { dir });
  try {
    assert.equal((await fetch(`${server.url}/api/taxonomy/curriculum-standards.json`)).status, 404);
    const trimmed = await fetch(`${server.url}/api/taxonomy/standards/acara-v9.json`);
    assert.equal(trimmed.status, 200);
    assert.deepEqual(await trimmed.json(), {
      curriculum: { id: 'acara-v9', name: 'Australian Curriculum', version: 'v9', sourceUrl: 'https://v9.australiancurriculum.edu.au/' },
      standards: [{ code: 'AC9M2N01', title: 'order numbers', strand: 'Number', learningArea: 'Mathematics', subject: 'Mathematics', yearLevels: ['2'] }],
    });
    assert.equal((await fetch(`${server.url}/api/taxonomy/standards/ccss-math.json`)).status, 404);

    // The derived list is kept per source hash: a replaced file is trimmed again.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await seedFixtureTaxonomy(dir, { 'curriculum-standards.json': curriculum('order numbers to 1000') });
    const again = await (await fetch(`${server.url}/api/taxonomy/standards/acara-v9.json`)).json();
    assert.equal(again.standards[0].title, 'order numbers to 1000');
  } finally {
    await server.stop();
  }
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function spawnHarrington(extraEnv = {}, { dir: existingDir = null } = {}) {
  const dir = existingDir || await mkdtemp(join(tmpdir(), 'harrington-ai-'));
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARRINGTON_HOST: '127.0.0.1',
      HARRINGTON_PORT: '0',
      HARRINGTON_DATA_DIR: dir,
      // A parent's shell may export the deployment settings; tests choose their own.
      HARRINGTON_ACCESS_TOKEN: '',
      HARRINGTON_PUBLISHED_HOST: '',
      HARRINGTON_ALLOWED_HOSTS: '',
      HARRINGTON_AI_BASE_URL: '',
      HARRINGTON_AI_MODEL: '',
      HARRINGTON_AI_API_KEY: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI test server did not start')), 5000);
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
      // Any bind address; the tests always connect over loopback. The access
      // token line is the last startup line, so the whole log is in by then.
      const match = output.match(/listening at http:\/\/\S+:(\d+)/);
      if (match && /Access token is/.test(output)) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`AI test server exited with ${code}: ${output}`));
    });
  }).catch(async (error) => {
    await rm(dir, { recursive: true, force: true });
    throw error;
  });
  return {
    url,
    dir,
    output: () => output,
    async stop() {
      proc.kill('SIGTERM');
      await new Promise((resolve) => proc.once('exit', resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('OpenAI-compatible AI adapter', { concurrency: false }, () => {
  test('reports aiConfigured only when base URL and model are both set', async () => {
    const incomplete = await spawnHarrington({ HARRINGTON_AI_MODEL: 'llama3.2' });
    try {
      const health = await (await fetch(`${incomplete.url}/api/health`)).json();
      assert.equal(health.aiConfigured, false);
      const ai = await fetch(`${incomplete.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o-mini' }),
      });
      assert.equal(ai.status, 503);
    } finally {
      await incomplete.stop();
    }

    const urlOnly = await spawnHarrington({ HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1' });
    try {
      assert.equal((await (await fetch(`${urlOnly.url}/api/health`)).json()).aiConfigured, false);
    } finally {
      await urlOnly.stop();
    }
  });

  test('forwards chat completions to the configured model and returns { content }', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      const body = JSON.parse(await readRequestBody(req));
      captured.push({
        url: req.url,
        method: req.method,
        authorization: req.headers.authorization || null,
        body,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: '{"objective":"count to five"}' } }],
      }));
    });
    await listen(upstream);
    const port = upstream.address().port;
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${port}/v1/`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      HARRINGTON_AI_API_KEY: 'test-family-key',
    });

    try {
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.equal(health.aiConfigured, true);

      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Write a lesson' }],
          capability: 'lesson',
          model: 'gpt-4o-mini',
        }),
      });
      assert.equal(ai.status, 200);
      assert.deepEqual(await ai.json(), { content: '{"objective":"count to five"}' });

      assert.equal(captured.length, 1);
      assert.equal(captured[0].method, 'POST');
      assert.equal(captured[0].url, '/v1/chat/completions');
      assert.equal(captured[0].authorization, 'Bearer test-family-key');
      assert.equal(captured[0].body.model, 'llama3.2');
      assert.deepEqual(captured[0].body.messages, [{ role: 'user', content: 'Write a lesson' }]);
      assert.notEqual(captured[0].body.model, 'gpt-4o-mini');

      const aliases = ['small', 'strong', 'gpt-4o', 'gpt-4o-mini'];
      for (const model of aliases) {
        const response = await fetch(`${harrington.url}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: model }],
            capability: 'explain',
            model,
          }),
        });
        assert.equal(response.status, 200);
      }
      assert.ok(captured.slice(1).every((entry) => entry.body.model === 'llama3.2'));
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('replaces every learner name in the family document before forwarding', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });
    const ask = async (messages) => {
      const response = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, capability: 'lesson' }),
      });
      assert.equal(response.status, 200);
      return captured.at(-1).messages;
    };

    try {
      // No family document yet: messages pass through unchanged.
      assert.deepEqual(await ask([{ role: 'user', content: 'Mary Jane counted' }]), [{ role: 'user', content: 'Mary Jane counted' }]);

      // The variants from tests/ai.test.mjs, plus short parts.
      const students = ['Mary-Jane Smith', "Mia O'Neil", 'Zoë Park', 'José Ruiz', 'An Nguyen', 'Leo Little']
        .map((name, i) => ({ id: `s${i}`, name }));
      const put = await fetch(`${harrington.url}/api/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"v0"' },
        body: JSON.stringify({ students }),
      });
      assert.equal(put.status, 204);

      for (const [said, expected] of [
        ['Say it again, Mary Jane.', 'Say it again, the child.'],
        ['MaryJane and mary-jane', 'the child and the child'],
        ['Mary, then Jane.', 'the child, then the child.'],
        ['And Zoe? Zoe Park: nine!', 'And the child? the child: nine!'],
        ['Thank you Jose.', 'Thank you the child.'],
        ['Zoe\u0308 waved.', 'the child waved.'],
        ['Zoë’s café', 'the child’s café'],
        ['and O’Neil too. Mia O’Neil laughed', 'and the child too. the child laughed'],
        ["Mia O'Neil's turn", "the child's turn"],
        ['ONeil', 'the child'],
        ['He said an apple; An and AN came', 'He said an apple; the child and the child came'],
        ['leo and LEO, little Leo', 'the child and the child, the child the child'],
        ['Ask the Leo', 'Ask the child'],
      ]) {
        const [message] = await ask([{ role: 'user', content: said }]);
        assert.equal(message.content, expected, said);
      }

      // Every message is redacted, and only { role, content } is forwarded.
      const forwarded = await ask([
        { role: 'system', content: 'You help Zoe Park.', name: 'José' },
        { role: 'user', content: 'José and Leo' },
        { role: 'assistant', content: 'Hello Mia' },
      ]);
      assert.deepEqual(forwarded, [
        { role: 'system', content: 'You help the child.' },
        { role: 'user', content: 'the child and the child' },
        { role: 'assistant', content: 'Hello the child' },
      ]);
      assert.doesNotMatch(JSON.stringify(captured.slice(1)).normalize('NFD').replace(/\p{M}/gu, ''), /\b(mary|jane|zoe|jose|o.?neil|smith|ruiz|nguyen|leo|little)\b/i);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('refuses messages that are not { role, content: string } with 400', async () => {
    let forwarded = 0;
    const upstream = createServer(async (req, res) => {
      forwarded += 1;
      await readRequestBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });
    try {
      for (const [message, error] of [
        [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }, 'Message 1 content must be a string'],
        [{ role: 'user', content: { text: 'hi' } }, 'Message 1 content must be a string'],
        [{ role: 'user', content: null }, 'Message 1 content must be a string'],
        [{ role: 'assistant', content: '', tool_calls: [{ id: 't', type: 'function' }] }, 'Message 1 has tool_calls, which Harrington does not send'],
        [{ role: 'tool', content: 'x' }, 'Message 1 has a role other than system, user or assistant'],
        ['hi', 'Message 1 is not an object'],
      ]) {
        const response = await fetch(`${harrington.url}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [message], capability: 'lesson' }),
        });
        assert.equal(response.status, 400, error);
        assert.deepEqual(await response.json(), { error });
      }
      assert.equal(forwarded, 0);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('removes stored parent notes unless the request says the parent opted in', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });
    const note = 'Zebulon got stuck carrying the one.\nHe   counted on his fingers twice before he trusted the answer.';
    // One long line, and lines whose 300-character cut falls mid-line.
    const longLine = `Zebulon ${'worked through the place value chart slowly and carefully, '.repeat(40)}end.`;
    const longLines = Array.from({ length: 12 }, (_, i) => `Line ${i}: Zebulon sorted the counters into tens and ones again.`).join('\n');
    const redacted = (text) => text.replaceAll('Zebulon', 'the child');
    // Padded with spaces: the progress review cuts the note as stored, a
    // discussion trims it first, so each cut needs its own pattern.
    const padded = `   ${longLine.replace('Zebulon', 'Zebulon padded')}   `;
    const ask = async (content, extra = {}) => {
      const response = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content }], capability: 'analysis', ...extra }),
      });
      assert.equal(response.status, 200);
      return captured.at(-1).messages[0].content;
    };
    try {
      const put = await fetch(`${harrington.url}/api/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"v0"' },
        body: JSON.stringify({ students: [{ id: 's1', name: 'Zebulon Quixote' }], records: { s1: [
          { id: 'r1', type: 'observation', note, title: 'Carrying' },
          { id: 'r2', type: 'observation', note: longLine, title: 'Long' },
          { id: 'r3', type: 'observation', note: longLines, title: 'Lines' },
          { id: 'r4', type: 'observation', note: 'Fractions', title: 'Short' },
          { id: 'r5', type: 'observation', note: padded, title: 'Padded' },
        ] } }),
      });
      assert.equal(put.status, 204);
      // As the browser sends it: the name already redacted, whitespace reflowed.
      const sent = 'the child got stuck carrying the one. He counted on his fingers twice before he trusted the answer.';
      assert.equal(await ask(`Notes: ${sent} Advise.`), 'Notes: [note removed] Advise.');
      // A line of 20+ characters on its own, cut short by the browser's limit, is removed too.
      assert.equal(await ask('Notes: He counted on his fingers twice before he trusted the answer.'), 'Notes: [note removed]');
      // Opted in: the note goes as sent, for the analysis and the progress review only.
      assert.equal(await ask(`Notes: ${sent}`, { includeNotes: true }), `Notes: ${sent}`);
      assert.equal(await ask(`Notes: ${sent}`, { includeNotes: true, capability: 'review' }), `Notes: ${sent}`);
      for (const capability of ['lesson', 'explain']) {
        assert.equal(await ask(`Notes: ${sent}`, { includeNotes: true, capability }), 'Notes: [note removed]', capability);
      }
      // Anything else is untouched.
      assert.equal(await ask('Count to five with the child.'), 'Count to five with the child.');

      // Cut where the browser cuts: the progress review's 300 characters and a
      // discussion's 1500, of a single long line and of lines cut mid-line.
      for (const [text, cut] of [[longLine, 300], [longLine, 1500], [longLines, 300]]) {
        const sentNote = redacted(text).slice(0, cut);
        assert.equal((await ask(`- [observation] Count to 5: ${sentNote}`)).trimEnd(), '- [observation] Count to 5: [note removed]', `${cut} of ${text.slice(0, 20)}`);
      }
      for (const [sentNote, how] of [[redacted(padded).slice(0, 300), 'as stored, 300'], [redacted(padded.trim()).slice(0, 1500), 'trimmed, 1500']]) {
        assert.equal((await ask(`- [observation] Count to 5: ${sentNote}`)).replace(/\s+/g, ' ').trim(), '- [observation] Count to 5: [note removed]', `padded note, ${how}`);
      }
      // A one-word note is also topic text: it is not matched on its own.
      assert.equal(await ask('Write a lesson on Fractions for age 7. Subject: Fractions'), 'Write a lesson on Fractions for age 7. Subject: Fractions');

      // Only the boolean true opts in.
      for (const includeNotes of ['true', 1, 'yes', {}]) {
        assert.equal(await ask(`Notes: ${sent}`, { includeNotes }), 'Notes: [note removed]', JSON.stringify(includeNotes));
      }
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('counts note opt-ins only for analysis and review in signed-in /api/health (HAR-54)', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const TOKEN = 'test-family-token-0123456789';
    const harrington = await spawnHarrington({
      HARRINGTON_ACCESS_TOKEN: TOKEN,
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });
    try {
      const signedOutHealth = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.equal('notesOptInCount' in signedOutHealth, false);

      const login = await fetch(`${harrington.url}/login?token=${encodeURIComponent(TOKEN)}`, { redirect: 'manual' });
      const cookie = login.headers.get('set-cookie').split(';')[0];
      const headers = { 'Content-Type': 'application/json', Cookie: cookie };

      assert.equal((await fetch(`${harrington.url}/api/state`, {
        method: 'PUT',
        headers: { ...headers, 'If-Match': '"v0"' },
        body: JSON.stringify({
          students: [{ id: 's1', name: 'Zebulon Quixote' }],
          records: { s1: [{ id: 'r1', type: 'observation', note: 'Zebulon counted ten shells slowly by hand.' }] },
        }),
      })).status, 204);

      const healthCount = async () => (await (await fetch(`${harrington.url}/api/health`, { headers: { Cookie: cookie } })).json()).notesOptInCount;
      assert.equal(await healthCount(), 0);

      const noteText = 'the child counted ten shells slowly by hand.';
      const ask = (capability, includeNotes) => fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: [{ role: 'user', content: `Notes: ${noteText}` }], capability, includeNotes }),
      });

      assert.equal((await ask('lesson', true)).status, 200);
      assert.equal(captured.at(-1).messages[0].content, 'Notes: [note removed]');
      assert.equal(await healthCount(), 0);

      assert.equal((await ask('analysis', true)).status, 200);
      assert.equal(captured.at(-1).messages[0].content, `Notes: ${noteText}`);
      assert.equal(await healthCount(), 1);

      assert.equal((await ask('review', true)).status, 200);
      assert.equal(captured.at(-1).messages[0].content, `Notes: ${noteText}`);
      assert.equal(await healthCount(), 2);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('accepts a request with no model field and uses HARRINGTON_AI_MODEL', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });

    try {
      // What the browser sends since HAR-26: the messages and their capability.
      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Explain counting' }], capability: 'explain' }),
      });
      assert.equal(ai.status, 200);
      assert.deepEqual(await ai.json(), { content: 'ok' });
      assert.equal(captured.length, 1);
      assert.equal(captured[0].model, 'llama3.2');
      assert.deepEqual(captured[0].messages, [{ role: 'user', content: 'Explain counting' }]);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('keeps provider failures fail-closed without leaking secrets', async () => {
    const secret = 'sk-secret-SHOULD-NOT-LEAK';
    const upstream = createServer(async (req, res) => {
      await readRequestBody(req);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Invalid API key ${secret}` } }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      HARRINGTON_AI_API_KEY: secret,
    });

    try {
      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'lesson', model: 'small' }),
      });
      assert.equal(ai.status, 502);
      const body = await ai.json();
      assert.match(body.error, /failed/i);
      assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));
      assert.doesNotMatch(body.error, /sk-/);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('times out a hung provider with 504', async () => {
    const upstream = createServer(() => {});
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      HARRINGTON_AI_TIMEOUT_MS: '150',
    });

    try {
      const ai = await fetch(`${harrington.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'lesson' }),
      });
      assert.equal(ai.status, 504);
      assert.match((await ai.json()).error, /timed out/i);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });
  test('HARRINGTON_AI_CAPABILITIES allows only the listed capabilities and health reports them', async () => {
    const captured = [];
    const upstream = createServer(async (req, res) => {
      captured.push(JSON.parse(await readRequestBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"objective":"ok"}' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
      // The plural a family is likely to type, plus a name that is not a capability.
      HARRINGTON_AI_CAPABILITIES: ' lessons , telepathy ',
    });
    const post = (body) => fetch(`${harrington.url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const messages = [{ role: 'user', content: 'hi' }];

    try {
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.equal(health.aiConfigured, true);
      assert.deepEqual(health.aiCapabilities, ['lesson']);

      // Allowed.
      const allowed = await post({ messages, capability: 'lesson' });
      assert.equal(allowed.status, 200);
      assert.deepEqual(await allowed.json(), { content: '{"objective":"ok"}' });

      // Denied, with a message the browser reads as "not switched on".
      const denied = await post({ messages, capability: 'test' });
      assert.equal(denied.status, 403);
      const deniedBody = await denied.json();
      assert.match(deniedBody.error, /"test" AI capability is not switched on/);
      assert.equal(deniedBody.capability, 'test');

      // A missing, unknown or non-string capability is never trusted.
      for (const body of [{ messages }, { messages, capability: 'telepathy' }, { messages, capability: ['lesson'] }, { messages, capability: '' }]) {
        const response = await post(body);
        assert.equal(response.status, 403, JSON.stringify(body));
        assert.match((await response.json()).error, /must name a known capability/);
      }

      // Only the allowed request reached the provider, and without the capability field.
      assert.equal(captured.length, 1);
      assert.deepEqual(Object.keys(captured[0]).sort(), ['messages', 'model']);
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('every capability is on by default, and none without a provider', async () => {
    const upstream = createServer(async (req, res) => {
      await readRequestBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    await listen(upstream);
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
      HARRINGTON_AI_MODEL: 'llama3.2',
    });
    try {
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.deepEqual(health.aiCapabilities, [...AI_CAPABILITIES]);
      for (const capability of AI_CAPABILITIES) {
        const response = await fetch(`${harrington.url}/api/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability }),
        });
        assert.equal(response.status, 200, capability);
      }
    } finally {
      await harrington.stop();
      upstream.close();
    }

    // The list alone switches nothing on: no provider, no capabilities, still 503.
    const noProvider = await spawnHarrington({ HARRINGTON_AI_CAPABILITIES: 'lesson' });
    try {
      const health = await (await fetch(`${noProvider.url}/api/health`)).json();
      assert.equal(health.aiConfigured, false);
      assert.deepEqual(health.aiCapabilities, []);
      const response = await fetch(`${noProvider.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'lesson' }),
      });
      assert.equal(response.status, 503);
    } finally {
      await noProvider.stop();
    }
  });
});

test('parseCapabilities reads a comma list, plural spellings and "all"', () => {
  assert.deepEqual(parseCapabilities(undefined).enabled, [...AI_CAPABILITIES]);
  assert.deepEqual(parseCapabilities('  ').enabled, [...AI_CAPABILITIES]);
  assert.deepEqual(parseCapabilities('ALL').enabled, [...AI_CAPABILITIES]);
  assert.deepEqual(parseCapabilities('lessons'), { enabled: ['lesson'], unknown: [] });
  assert.deepEqual(parseCapabilities('recall, Lesson,,quizzes'), { enabled: ['lesson', 'recall', 'quiz'], unknown: [] });
  assert.deepEqual(parseCapabilities('nothing-real'), { enabled: [], unknown: ['nothing-real'] });
});

describe('AI provider settings saved in the app', { concurrency: false }, () => {
  const KEY = 'sk-test-ABCDEFGH-family-key-9z8y';
  const json = (method, body, headers = {}) => ({
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // An OpenAI-compatible stub that records what it receives.
  async function provider(answer = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  }) {
    const seen = [];
    const server = createServer(async (req, res) => {
      seen.push({ url: req.url, authorization: req.headers.authorization || null, body: JSON.parse(await readRequestBody(req)) });
      answer(req, res);
    });
    await listen(server);
    return { seen, base: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
  }

  test('save, read masked, use, and remove: stored values win over the environment', async () => {
    const upstream = await provider();
    const harrington = await spawnHarrington({
      HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1',
      HARRINGTON_AI_MODEL: 'env-model',
      HARRINGTON_AI_API_KEY: 'env-key-0000-wxyz',
    });
    const secrets = join(harrington.dir, 'secrets.json');
    try {
      // Environment only: source "env", the key only as a hint.
      let settings = await (await fetch(`${harrington.url}/api/settings/ai`)).json();
      assert.deepEqual(
        { baseUrl: settings.baseUrl, model: settings.model, hasApiKey: settings.hasApiKey, apiKeyHint: settings.apiKeyHint, source: settings.source },
        { baseUrl: 'http://127.0.0.1:9/v1', model: 'env-model', hasApiKey: true, apiKeyHint: 'wxyz', source: { baseUrl: 'env', model: 'env', apiKey: 'env', timeoutMs: 'none', capabilities: 'none' } },
      );
      assert.ok(!JSON.stringify(settings).includes('env-key-0000'));
      assert.deepEqual(settings.presets.map((p) => p.id), ['ollama', 'gemini', 'custom']);
      assert.equal((await (await fetch(`${harrington.url}/api/health`)).json()).aiSource, 'env');

      // Save from the app: the URL is trimmed and loses its trailing slashes.
      const saved = await fetch(`${harrington.url}/api/settings/ai`, json('PUT', {
        baseUrl: `  ${upstream.base}// `, model: ' saved-model ', apiKey: ` ${KEY} `, capabilities: ['recall', 'lesson'], timeoutMs: 20_000,
      }));
      assert.equal(saved.status, 200);
      const savedText = await saved.text();
      assert.ok(!savedText.includes(KEY), 'the key is never returned');
      settings = JSON.parse(savedText);
      assert.equal(settings.baseUrl, upstream.base);
      assert.equal(settings.model, 'saved-model');
      assert.equal(settings.apiKeyHint, '9z8y');
      assert.deepEqual(settings.capabilities, ['lesson', 'recall']);
      assert.equal(settings.timeoutMs, 20_000);
      assert.deepEqual(settings.source, { baseUrl: 'app', model: 'app', apiKey: 'app', timeoutMs: 'app', capabilities: 'app' });

      // Owner-only, atomic, and in the documented shape.
      assert.equal((await stat(secrets)).mode & 0o777, 0o600);
      assert.deepEqual((await readdir(harrington.dir)).filter((name) => name.includes('.tmp')), []);
      const doc = JSON.parse(await readFile(secrets, 'utf8'));
      assert.equal(doc.schemaVersion, 1);
      assert.equal(doc.ai.apiKey, KEY);
      assert.ok(Number.isInteger(doc.ai.updatedAt));
      // Never inside the family document.
      assert.ok(!JSON.stringify(await (await fetch(`${harrington.url}/api/state`)).json()).includes(KEY));

      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.deepEqual([health.aiConfigured, health.aiSource, health.aiCapabilities], [true, 'app', ['lesson', 'recall']]);
      assert.ok(!JSON.stringify(health).includes(upstream.base) && !JSON.stringify(health).includes('saved-model'), 'health carries no URL or model');

      // /api/ai now uses the saved provider, key and capabilities, with no restart.
      const chat = (capability) => fetch(`${harrington.url}/api/ai`, json('POST', { messages: [{ role: 'user', content: 'hi' }], capability }));
      assert.equal((await chat('lesson')).status, 200);
      assert.equal((await chat('explain')).status, 403);
      assert.equal(upstream.seen.length, 1);
      assert.equal(upstream.seen[0].authorization, `Bearer ${KEY}`);
      assert.equal(upstream.seen[0].body.model, 'saved-model');

      // apiKey omitted keeps it; "" removes it and the environment's applies again.
      settings = await (await fetch(`${harrington.url}/api/settings/ai`, json('PUT', { model: 'other-model' }))).json();
      assert.deepEqual([settings.model, settings.apiKeyHint, settings.source.apiKey], ['other-model', '9z8y', 'app']);
      settings = await (await fetch(`${harrington.url}/api/settings/ai`, json('PUT', { apiKey: '' }))).json();
      assert.deepEqual([settings.apiKeyHint, settings.source.apiKey], ['wxyz', 'env']);

      // DELETE removes the file; the environment resumes.
      settings = await (await fetch(`${harrington.url}/api/settings/ai`, { method: 'DELETE' })).json();
      assert.deepEqual([settings.baseUrl, settings.model, settings.source.baseUrl], ['http://127.0.0.1:9/v1', 'env-model', 'env']);
      await assert.rejects(stat(secrets), { code: 'ENOENT' });
      assert.equal((await fetch(`${harrington.url}/api/settings/ai`, { method: 'DELETE' })).status, 200, 'deleting twice is fine');

      assert.ok(!harrington.output().includes(KEY), 'the key is never logged');
    } finally {
      await harrington.stop();
      upstream.close();
    }
  });

  test('PUT validates every field and changes nothing on a bad request', async () => {
    const harrington = await spawnHarrington();
    const put = (body, headers) => fetch(`${harrington.url}/api/settings/ai`, json('PUT', body, headers));
    try {
      assert.equal((await put({ baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2' })).status, 200);
      const before = await readFile(join(harrington.dir, 'secrets.json'), 'utf8');
      const bad = [
        { baseUrl: 'ftp://example.test/v1' },
        { baseUrl: 'not a url' },
        { baseUrl: 42 },
        { baseUrl: 'https://user:pass@example.test/v1' },
        { model: '' , baseUrl: 'http://127.0.0.1:11434/v1' },
        { model: 'x'.repeat(201) },
        { apiKey: 'k'.repeat(513) },
        { apiKey: 'has a space' },
        { apiKey: 7 },
        { timeoutMs: 0 },
        { timeoutMs: 1.5 },
        { timeoutMs: '1000' },
        { capabilities: ['telepathy'] },
        { capabilities: 'lesson' },
        { endpoint: 'http://x' },
      ];
      for (const body of bad) {
        const response = await put(body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.ok((await response.json()).error);
      }
      assert.equal((await put({ model: 'x' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
      const plain = await fetch(`${harrington.url}/api/settings/ai`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{"model":"x"}' });
      assert.equal(plain.status, 415);
      assert.equal((await fetch(`${harrington.url}/api/settings/ai`, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.equal(await readFile(join(harrington.dir, 'secrets.json'), 'utf8'), before);

      // A 512-character key and an empty capability list are fine; null clears.
      assert.equal((await put({ apiKey: 'k'.repeat(512), capabilities: [] })).status, 200);
      const health = await (await fetch(`${harrington.url}/api/health`)).json();
      assert.deepEqual([health.aiConfigured, health.aiCapabilities], [true, []]);
      const cleared = await (await put({ capabilities: null, apiKey: null })).json();
      assert.equal(cleared.capabilities.length, AI_CAPABILITIES.length);
      assert.equal(cleared.hasApiKey, false);
      // A short key has no hint.
      assert.equal((await (await put({ apiKey: 'abc12' })).json()).apiKeyHint, null);
    } finally {
      await harrington.stop();
    }
  });

  test('the connection test sends no learner data and never echoes the key or the provider body', async () => {
    const upstream = await provider((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }));
    });
    const harrington = await spawnHarrington();
    const testIt = () => fetch(`${harrington.url}/api/settings/ai/test`, { method: 'POST' });
    try {
      assert.deepEqual(await (await testIt()).json(), { ok: false, latencyMs: 0, error: 'not configured' });

      await fetch(`${harrington.url}/api/settings/ai`, json('PUT', { baseUrl: upstream.base, model: 'm', apiKey: KEY }));
      const response = await testIt();
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.ok(!text.includes(KEY) && !text.includes('Incorrect'), text);
      const result = JSON.parse(text);
      assert.deepEqual({ ...result, latencyMs: typeof result.latencyMs }, { ok: false, status: 401, error: 'provider error', latencyMs: 'number' });
      assert.deepEqual(upstream.seen[0].body, { model: 'm', messages: [{ role: 'user', content: 'Reply with the single word OK.' }] });
      assert.equal((await fetch(`${harrington.url}/api/settings/ai/test`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.ok(!harrington.output().includes(KEY), 'the key is never logged');
    } finally {
      await harrington.stop();
      upstream.close();
    }

    const working = await provider();
    const ok = await spawnHarrington({ HARRINGTON_AI_BASE_URL: working.base, HARRINGTON_AI_MODEL: 'm' });
    try {
      const result = await (await fetch(`${ok.url}/api/settings/ai/test`, { method: 'POST' })).json();
      assert.equal(result.ok, true);
      assert.ok(Number.isInteger(result.latencyMs));
    } finally {
      await ok.stop();
      working.close();
    }
  });

  test('an unreadable secrets file acts as empty and is logged once without its content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'harrington-ai-'));
    await writeFile(join(dir, 'secrets.json'), '{ "ai": { "apiKey": "MARKER-should-not-print" ');
    const harrington = await spawnHarrington({ HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1', HARRINGTON_AI_MODEL: 'env-model' }, { dir });
    try {
      for (let i = 0; i < 3; i += 1) {
        const settings = await (await fetch(`${harrington.url}/api/settings/ai`)).json();
        assert.deepEqual([settings.model, settings.source.model, settings.hasApiKey], ['env-model', 'env', false]);
      }
      assert.equal((await waitForOutput(harrington.output, /is not valid JSON/)).match(/is not valid JSON/g)?.length, 1);
      assert.ok(!harrington.output().includes('MARKER'));
    } finally {
      await harrington.stop();
    }
  });
});

test('npm run backup leaves secrets.json out of the archive', async () => {
  const work = await mkdtemp(join(tmpdir(), 'harrington-backup-'));
  try {
    const dataDir = join(work, 'private');
    await mkdir(join(dataDir, 'lessons'), { recursive: true });
    await writeFile(join(dataDir, 'family-state.json'), '{"version":1}');
    await writeFile(join(dataDir, 'lessons', 'a.json'), '{}');
    await writeFile(join(dataDir, 'secrets.json'), '{"schemaVersion":1,"ai":{"apiKey":"sk-backup-test"}}');
    const run = spawnSync(process.execPath, ['scripts/backup.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, HARRINGTON_DATA_DIR: dataDir, HARRINGTON_BACKUP_DIR: join(work, 'backups') },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    const [archive] = await readdir(join(work, 'backups'));
    const listing = spawnSync('tar', ['-tzf', join(work, 'backups', archive)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    assert.ok(listing.some((name) => name.endsWith('private/family-state.json')), listing.join('\n'));
    assert.ok(listing.some((name) => name.endsWith('private/lessons/a.json')));
    assert.ok(!listing.some((name) => name.includes('secrets.json')), listing.join('\n'));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('creates private data folders (0700) and files/backups (0600) (HAR-52)', async () => {
  const work = await mkdtemp(join(tmpdir(), 'harrington-perms-'));
  const isolatedDataDir = join(work, 'private');
  const isolatedBackupDir = join(work, 'backups');
  const server = await spawnHarrington({ HARRINGTON_BACKUP_DIR: isolatedBackupDir }, { dir: isolatedDataDir });
  try {
    const modeOf = async (targetPath) => (await stat(targetPath)).mode & 0o777;
    assert.equal(await modeOf(isolatedDataDir), 0o700);

    assert.equal((await fetch(`${server.url}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"v0"' },
      body: JSON.stringify({ students: [{ id: 's1', name: 'Sample Learner', birthYear: 2018 }] }),
    })).status, 204);
    assert.equal(await modeOf(join(isolatedDataDir, 'family-state.json')), 0o600);

    const lessonKey = 'topic:perms-check';
    assert.equal((await fetch(`${server.url}/api/lessons/${encodeURIComponent(lessonKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective: 'count' }),
    })).status, 204);
    assert.equal(await modeOf(join(isolatedDataDir, 'lessons')), 0o700);
    assert.equal(await modeOf(join(isolatedDataDir, 'lessons', `${Buffer.from(lessonKey, 'utf8').toString('base64url')}.json`)), 0o600);

    const audioKey = 'perms-recording.webm';
    assert.equal((await fetch(`${server.url}/api/audio/${encodeURIComponent(audioKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/webm' },
      body: new Uint8Array([1, 2, 3, 4]),
    })).status, 204);
    assert.equal(await modeOf(join(isolatedDataDir, 'audio')), 0o700);
    const audioEncoded = Buffer.from(audioKey, 'utf8').toString('base64url');
    assert.equal(await modeOf(join(isolatedDataDir, 'audio', `${audioEncoded}.bin`)), 0o600);
    assert.equal(await modeOf(join(isolatedDataDir, 'audio', `${audioEncoded}.meta.json`)), 0o600);

    const backupRun = spawnSync(process.execPath, ['scripts/backup.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, HARRINGTON_DATA_DIR: isolatedDataDir, HARRINGTON_BACKUP_DIR: isolatedBackupDir },
      encoding: 'utf8',
    });
    assert.equal(backupRun.status, 0, backupRun.stderr);
    assert.equal(await modeOf(isolatedBackupDir), 0o700);
    const [archive] = await readdir(isolatedBackupDir);
    assert.equal(await modeOf(join(isolatedBackupDir, archive)), 0o600);
  } finally {
    await server.stop();
    await rm(work, { recursive: true, force: true });
  }
});

test('refuses plain http:// AI base URLs on public hosts while allowing local and private networks (HAR-59)', async () => {
  for (const refused of [
    'http://203.0.113.10/v1',
    'http://8.8.8.8/v1',
    'http://api.openai.com/v1',
    'http://ai.example-cloud.com/v1',
  ]) {
    assert.equal(plainHttpPublicHost(refused), true, `${refused} should be refused`);
  }

  for (const allowed of [
    'http://127.0.0.1:11434/v1',
    'http://localhost:11434/v1',
    'http://[::1]:11434/v1',
    'http://host.docker.internal:11434/v1',
    'http://ollama:11434/v1',
    'http://10.0.0.5:11434/v1',
    'http://172.20.0.2:11434/v1',
    'http://192.168.1.50:11434/v1',
    'http://100.90.1.2:11434/v1',
    'http://[fd00::1]:11434/v1',
    'http://mac-mini.local:11434/v1',
    'https://203.0.113.10/v1',
    'https://generativelanguage.googleapis.com/v1beta/openai',
  ]) {
    assert.equal(plainHttpPublicHost(allowed), false, `${allowed} should be allowed`);
  }

  // PUT /api/settings/ai refuses plain http:// on a public host with 400.
  const appServer = await spawnHarrington();
  try {
    for (const badUrl of ['http://203.0.113.10/v1', 'http://api.openai.com/v1']) {
      const res = await fetch(`${appServer.url}/api/settings/ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: badUrl, model: 'gpt-4o' }),
      });
      assert.equal(res.status, 400, badUrl);
      assert.deepEqual(await res.json(), { error: 'Use https:// for an AI provider outside your computer or home network' });
    }
    // Private network and https:// public hosts are accepted.
    for (const goodUrl of ['http://192.168.1.50:11434/v1', 'https://203.0.113.10/v1']) {
      const res = await fetch(`${appServer.url}/api/settings/ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: goodUrl, model: 'm' }),
      });
      assert.equal(res.status, 200, goodUrl);
    }
  } finally {
    await appServer.stop();
  }

  // HARRINGTON_AI_BASE_URL with plain http:// on a public host fails closed.
  const envPublic = await spawnHarrington({
    HARRINGTON_AI_BASE_URL: 'http://203.0.113.10/v1',
    HARRINGTON_AI_MODEL: 'gpt-4o',
    HARRINGTON_AI_API_KEY: 'sk-should-never-leave',
  });
  try {
    const health = await (await fetch(`${envPublic.url}/api/health`)).json();
    assert.equal(health.aiConfigured, false);
    const ai = await fetch(`${envPublic.url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'explain' }),
    });
    assert.equal(ai.status, 503);
    const log = await waitForOutput(envPublic.output, /plain http:\/\//);
    assert.equal(log.match(/plain http:\/\//g)?.length, 1);
  } finally {
    await envPublic.stop();
  }

  // Hand-edited secrets.json with plain http:// on a public host also fails closed and warns once.
  const dir = await mkdtemp(join(tmpdir(), 'harrington-public-http-'));
  await writeFile(join(dir, 'secrets.json'), JSON.stringify({
    schemaVersion: 1,
    ai: { baseUrl: 'http://api.openai.com/v1', model: 'gpt-4o', apiKey: 'sk-hand-edited' },
  }));
  const storedPublic = await spawnHarrington({}, { dir });
  try {
    for (let i = 0; i < 2; i += 1) {
      const health = await (await fetch(`${storedPublic.url}/api/health`)).json();
      assert.equal(health.aiConfigured, false);
    }
    const ai = await fetch(`${storedPublic.url}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], capability: 'explain' }),
    });
    assert.equal(ai.status, 503);
    const log = await waitForOutput(storedPublic.output, /plain http:\/\//);
    assert.equal(log.match(/Stored AI settings .* uses plain http:\/\//g)?.length, 1);
    assert.ok(!log.includes('sk-hand-edited'));
  } finally {
    await storedPublic.stop();
  }

  // Direct readStoredAiSettings / resolveAiSettings unit checks.
  const resolved = resolveAiSettings({ baseUrl: 'http://203.0.113.10/v1', model: 'm' }, {});
  assert.equal(resolved.configured, false);
  assert.equal(resolved.baseUrl, '');
  const tempSecrets = await mkdtemp(join(tmpdir(), 'harrington-secrets-read-'));
  try {
    const file = join(tempSecrets, 'secrets.json');
    await writeFile(file, JSON.stringify({ ai: { baseUrl: 'http://api.openai.com/v1', model: 'm' } }));
    const problems = [];
    const read = await readStoredAiSettings(file, (why) => problems.push(why));
    assert.equal(read.baseUrl, undefined);
    assert.equal(problems.length, 1);
  } finally {
    await rm(tempSecrets, { recursive: true, force: true });
  }
});

test('isLoopbackAddress accepts only this computer', () => {
  for (const address of ['127.0.0.1', '127.8.9.10', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::FFFF:127.0.0.2']) {
    assert.equal(isLoopbackAddress(address), true, address);
  }
  for (const address of ['192.168.1.20', '10.0.0.1', '100.64.0.7', '::ffff:192.168.1.20', 'fe80::1', '::', '0.0.0.0', '128.0.0.1', '', undefined, null, '127.0.0.1.evil']) {
    assert.equal(isLoopbackAddress(address), false, String(address));
  }
});

describe('AI provider settings from another device', { concurrency: false }, () => {
  // Another device on the network: this computer's own non-loopback address.
  const lanAddress = Object.values(networkInterfaces()).flat()
    .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;

  test('without an access token, a server shared on the network refuses every change, from any address', { skip: !lanAddress && 'no non-loopback IPv4 interface here' }, async () => {
    const harrington = await spawnHarrington({ HARRINGTON_HOST: '0.0.0.0' });
    const port = new URL(harrington.url).port;
    const remote = `http://${lanAddress}:${port}`;
    const local = `http://127.0.0.1:${port}`;
    const put = (base, headers = {}) => fetch(`${base}/api/settings/ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ baseUrl: 'http://attacker.test/v1', model: 'm' }),
    });
    try {
      // Reading stays allowed (it never carries the key) and says it is read-only here.
      const view = await (await fetch(`${remote}/api/settings/ai`)).json();
      assert.equal(view.canChange, false);

      const LOCAL_ONLY = 'AI provider settings can only be changed from a signed-in device once an access token is set, or, while Harrington is not shared with other devices, from the computer running it';
      for (const response of [
        await put(remote),
        // A forged header changes nothing: the socket address decides.
        await put(remote, { 'X-Forwarded-For': '127.0.0.1' }),
        await fetch(`${remote}/api/settings/ai`, { method: 'DELETE' }),
        await fetch(`${remote}/api/settings/ai/test`, { method: 'POST' }),
      ]) {
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: LOCAL_ONLY });
      }
      await assert.rejects(stat(join(harrington.dir, 'secrets.json')), { code: 'ENOENT' });

      // Bound beyond loopback, the server is shared: this computer needs the
      // token too, since a proxy on it would look the same.
      assert.equal((await put(local)).status, 403);
      assert.equal((await (await fetch(`${local}/api/settings/ai`)).json()).canChange, false);
      await assert.rejects(stat(join(harrington.dir, 'secrets.json')), { code: 'ENOENT' });
    } finally {
      await harrington.stop();
    }
  });
  // Behind tailscale serve or Caddy (DEPLOYMENT.md options 1 and 2) every
  // family device reaches Harrington from 127.0.0.1, so a shared server
  // needs the token for settings even from loopback.
  test('a shared server behind a reverse proxy needs the access token, even from 127.0.0.1', async () => {
    const LOCAL_ONLY = 'AI provider settings can only be changed from a signed-in device once an access token is set, or, while Harrington is not shared with other devices, from the computer running it';
    const put = (base, headers = {}) => fetch(`${base}/api/settings/ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ baseUrl: 'http://attacker.test/v1', model: 'm' }),
    });
    const proxied = await spawnHarrington({ HARRINGTON_PUBLISHED_HOST: 'family-host.example-tailnet.ts.net' });
    try {
      assert.equal((await (await fetch(`${proxied.url}/api/settings/ai`)).json()).canChange, false);
      for (const response of [
        await put(proxied.url),
        await fetch(`${proxied.url}/api/settings/ai`, { method: 'DELETE' }),
        await fetch(`${proxied.url}/api/settings/ai/test`, { method: 'POST' }),
      ]) {
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: LOCAL_ONLY });
      }
      await assert.rejects(stat(join(proxied.dir, 'secrets.json')), { code: 'ENOENT' });
    } finally {
      await proxied.stop();
    }

    // Shared and signed in: the token is what lets a device save.
    const TOKEN = 'family-proxy-token-0123456789ab';
    const withToken = await spawnHarrington({ HARRINGTON_PUBLISHED_HOST: 'family-host.example-tailnet.ts.net', HARRINGTON_ACCESS_TOKEN: TOKEN });
    try {
      const login = await fetch(`${withToken.url}/login?token=${encodeURIComponent(TOKEN)}`, { redirect: 'manual' });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      assert.equal((await put(withToken.url, { Cookie: cookie })).status, 200);
    } finally {
      await withToken.stop();
    }

    // DNS rebinding (THREAT-MODEL.md G1, HAR-46): a foreign Host is refused
    // with 421 before any route runs, and even an extra allowed name or a
    // non-loopback IP literal in Host on an unshared server cannot change AI
    // settings.
    const rebound = await spawnHarrington({ HARRINGTON_ALLOWED_HOSTS: 'alias.home.arpa' });
    try {
      const port = new URL(rebound.url).port;
      const write = { baseUrl: 'http://attacker.test/v1', model: 'm' };
      assert.equal((await sendWithHost(port, 'rebind.attacker.test', { body: write })).status, 421);
      assert.equal((await sendWithHost(port, `rebind.attacker.test:${port}`, { method: 'DELETE' })).status, 421);
      assert.equal((await sendWithHost(port, 'rebind.attacker.test', { method: 'POST', path: '/api/settings/ai/test' })).status, 421);
      assert.equal((await sendWithHost(port, 'rebind.attacker.test', { method: 'GET' })).status, 421);
      for (const nonLocalHost of [`alias.home.arpa:${port}`, `192.168.1.20:${port}`]) {
        const refused = await sendWithHost(port, nonLocalHost, { body: write });
        assert.equal(refused.status, 403, nonLocalHost);
        assert.deepEqual(refused.json(), { error: LOCAL_ONLY });
        assert.equal((await sendWithHost(port, nonLocalHost, { method: 'DELETE' })).status, 403);
        assert.equal((await sendWithHost(port, nonLocalHost, { method: 'POST', path: '/api/settings/ai/test' })).status, 403);
        assert.equal((await sendWithHost(port, nonLocalHost, { method: 'GET' })).json().canChange, false);
      }
      await assert.rejects(stat(join(rebound.dir, 'secrets.json')), { code: 'ENOENT' });
      for (const name of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) {
        assert.equal((await sendWithHost(port, name, { body: write })).status, 200, name);
      }
    } finally {
      await rebound.stop();
    }

    // Not known to be shared, but the request came through a proxy: refused.
    // Without the proxy's headers, the computer itself can still save.
    const local = await spawnHarrington();
    try {
      for (const header of ['X-Forwarded-For', 'Forwarded', 'X-Forwarded-Host', 'X-Real-IP']) {
        const response = await put(local.url, { [header]: header === 'Forwarded' ? 'for=100.64.0.7' : '100.64.0.7' });
        assert.equal(response.status, 403, header);
      }
      await assert.rejects(stat(join(local.dir, 'secrets.json')), { code: 'ENOENT' });
      assert.equal((await put(local.url)).status, 200);
    } finally {
      await local.stop();
    }
  });
  test('with an access token, a signed-in device elsewhere can change the provider and others get 401', { skip: !lanAddress && 'no non-loopback IPv4 interface here' }, async () => {
    const TOKEN = 'family-settings-token-0123456789';
    const harrington = await spawnHarrington({ HARRINGTON_HOST: '0.0.0.0', HARRINGTON_ACCESS_TOKEN: TOKEN });
    const remote = `http://${lanAddress}:${new URL(harrington.url).port}`;
    const put = (headers = {}) => fetch(`${remote}/api/settings/ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', model: 'm' }),
    });
    try {
      // Not signed in: the sign-in gate answers before the settings routes,
      // and health says nothing about AI.
      assert.equal((await put()).status, 401);
      assert.equal((await fetch(`${remote}/api/settings/ai/test`, { method: 'POST' })).status, 401);
      const unsigned = await (await fetch(`${remote}/api/health`)).json();
      assert.equal(unsigned.signedIn, false);
      assert.deepEqual(['aiConfigured', 'aiSource', 'aiCapabilities'].filter((k) => k in unsigned), []);

      const login = await fetch(`${remote}/login?token=${encodeURIComponent(TOKEN)}`, { redirect: 'manual' });
      assert.equal(login.status, 303);
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      assert.match(cookie, /^harrington_session=/);

      const view = await (await fetch(`${remote}/api/settings/ai`, { headers: { Cookie: cookie } })).json();
      assert.equal(view.canChange, true);
      assert.equal((await put({ Cookie: cookie })).status, 200);
      const health = await (await fetch(`${remote}/api/health`, { headers: { Cookie: cookie } })).json();
      assert.deepEqual([health.aiConfigured, health.aiSource], [true, 'app']);
    } finally {
      await harrington.stop();
    }
  });
});

// HAR-25 restructures /api/health; whatever its shape, a configured provider
// must still show as aiConfigured, or every AI control quietly turns off.
test('health reports aiConfigured, aiSource and aiCapabilities when a provider is configured', async () => {
  const fromEnv = await spawnHarrington({ HARRINGTON_AI_BASE_URL: 'http://127.0.0.1:9/v1', HARRINGTON_AI_MODEL: 'm', HARRINGTON_AI_CAPABILITIES: 'lesson' });
  try {
    const health = await (await fetch(`${fromEnv.url}/api/health`)).json();
    assert.equal(health.aiConfigured, true);
    assert.equal(health.aiSource, 'env');
    assert.deepEqual(health.aiCapabilities, ['lesson']);

    await fetch(`${fromEnv.url}/api/settings/ai`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: 'http://127.0.0.1:8/v1', model: 'n' }) });
    const after = await (await fetch(`${fromEnv.url}/api/health`)).json();
    assert.equal(after.aiConfigured, true);
    assert.equal(after.aiSource, 'app');
  } finally {
    await fromEnv.stop();
  }
});

describe('access token and bind address', { concurrency: false }, () => {
  const TOKEN = 'test-family-token-0123456789';

  function loginCookie(response) {
    const header = response.headers.get('set-cookie') || '';
    return header.split(';')[0];
  }

  test('without a token every route stays open and health says so', async () => {
    const open = await spawnHarrington();
    try {
      const health = await (await fetch(`${open.url}/api/health`)).json();
      assert.equal(health.host, 'loopback');
      assert.equal(health.authEnabled, false);
      assert.equal('signedIn' in health, false);
      assert.equal((await fetch(`${open.url}/api/state`)).status, 200);
      const login = await fetch(`${open.url}/login?token=anything`, { redirect: 'manual' });
      assert.equal(login.status, 303);
      assert.equal(login.headers.get('set-cookie'), null);
    } finally {
      await open.stop();
    }
  });

  test('with a token /api/* needs the cookie and static assets stay open', async () => {
    const guarded = await spawnHarrington({ HARRINGTON_ACCESS_TOKEN: TOKEN });
    try {
      const health = await (await fetch(`${guarded.url}/api/health`)).json();
      assert.deepEqual(health, { ok: true, mode: 'self-hosted', host: 'loopback', authEnabled: true, signedIn: false });

      const denied = await fetch(`${guarded.url}/api/state`);
      assert.equal(denied.status, 401);
      assert.match(denied.headers.get('content-type'), /text\/html/);
      assert.match(await denied.text(), /href="\/login"/);

      const wrong = await fetch(`${guarded.url}/api/state`, { headers: { Cookie: 'harrington_session=forged' } });
      assert.equal(wrong.status, 401);
      const put = await fetch(`${guarded.url}/api/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"v0"' },
        body: JSON.stringify({ students: [] }),
      });
      assert.equal(put.status, 401);
      assert.equal((await fetch(`${guarded.url}/api/taxonomy/topics.json`)).status, 401);
      assert.equal((await fetch(`${guarded.url}/api/figures`)).status, 401);
      // The sign-in gate runs before the document checks and the AI guard:
      // a body they would refuse (422, 409, 400) still gets 401 when signed out.
      const invalid = await fetch(`${guarded.url}/api/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"v0"' },
        body: JSON.stringify({ schemaVersion: 99, students: 'nope' }),
      });
      assert.equal(invalid.status, 401);
      const ai = await fetch(`${guarded.url}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'tool', content: {} }] }),
      });
      assert.equal(ai.status, 401);

      const page = await fetch(guarded.url);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>Harrington/);
      assert.equal((await fetch(`${guarded.url}/js/app.js`)).status, 200);
    } finally {
      await guarded.stop();
    }
  });

  test('login sets an HttpOnly SameSite=Strict cookie only for the right token', async () => {
    const guarded = await spawnHarrington({ HARRINGTON_ACCESS_TOKEN: TOKEN });
    try {
      for (const query of ['?token=', '?token=wrong-token-0123456789', `?token=${TOKEN}x`, `?token=${TOKEN.slice(0, -1)}`]) {
        const failed = await fetch(`${guarded.url}/login${query}`, { redirect: 'manual' });
        assert.equal(failed.status, 401, `login${query} should fail`);
        assert.equal(failed.headers.get('set-cookie'), null);
        assert.match(await failed.text(), /did not work/);
        assert.equal(failed.headers.get('location'), null);
      }

      const ok = await fetch(`${guarded.url}/login?token=${encodeURIComponent(TOKEN)}`, { redirect: 'manual' });
      assert.equal(ok.status, 303);
      assert.equal(ok.headers.get('location'), '/');
      const setCookie = ok.headers.get('set-cookie');
      assert.match(setCookie, /^harrington_session=[\w-]+;/);
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /SameSite=Strict/);
      assert.doesNotMatch(setCookie, /Secure/);
      assert.equal(setCookie.includes(TOKEN), false, 'the cookie must not carry the token itself');

      const proxied = await fetch(`${guarded.url}/login?token=${encodeURIComponent(TOKEN)}`, {
        redirect: 'manual',
        headers: { 'X-Forwarded-Proto': 'https' },
      });
      assert.match(proxied.headers.get('set-cookie'), /; Secure/);

      const cookie = loginCookie(ok);
      const health = await (await fetch(`${guarded.url}/api/health`, { headers: { Cookie: cookie } })).json();
      assert.equal(health.signedIn, true);
      assert.equal(health.stateVersion, 0);
      const state = await fetch(`${guarded.url}/api/state`, { headers: { Cookie: `other=1; ${cookie}` } });
      assert.equal(state.status, 200);
    } finally {
      await guarded.stop();
    }
  });

  test('the unload beacon saves with the cookie and is refused without it', async () => {
    const guarded = await spawnHarrington({ HARRINGTON_ACCESS_TOKEN: TOKEN });
    try {
      const login = await fetch(`${guarded.url}/login?token=${encodeURIComponent(TOKEN)}`, { redirect: 'manual' });
      const cookie = loginCookie(login);
      const beacon = { students: [{ id: 'b', name: 'Beacon Learner', birthYear: 2019 }], activeStudentId: 'b', version: 0 };

      const anonymous = await fetch(`${guarded.url}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify(beacon),
      });
      assert.equal(anonymous.status, 401);

      const sent = await fetch(`${guarded.url}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', Cookie: cookie },
        body: JSON.stringify(beacon),
      });
      assert.equal(sent.status, 204);
      const loaded = await (await fetch(`${guarded.url}/api/state`, { headers: { Cookie: cookie } })).json();
      assert.equal(loaded.version, 1);
      assert.equal(loaded.students[0].name, 'Beacon Learner');
    } finally {
      await guarded.stop();
    }
  });

  test('a non-loopback bind is reported and bad settings stop the server', async () => {
    const shared = await spawnHarrington({ HARRINGTON_HOST: '0.0.0.0' });
    try {
      const port = new URL(shared.url).port;
      const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
      assert.equal(health.host, 'network');
      assert.match(shared.output(), /Bind address 0\.0\.0\.0 is not loopback/);
      assert.match(shared.output(), /anyone who can reach this server can read and change family data/);
    } finally {
      await shared.stop();
    }

    const container = await spawnHarrington({ HARRINGTON_HOST: '0.0.0.0', HARRINGTON_PUBLISHED_HOST: '127.0.0.1' });
    try {
      const port = new URL(container.url).port;
      assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).host, 'loopback');
      // The bind still reaches beyond this computer; the log must not say otherwise.
      assert.match(container.output(), /Bind address 0\.0\.0\.0 is not loopback/);
      assert.match(container.output(), /Published address 127\.0\.0\.1 is loopback/);
      assert.match(container.output(), /anyone who can reach this server/);
      assert.doesNotMatch(container.output(), /only this computer can connect/);
    } finally {
      await container.stop();
    }

    for (const env of [{ HARRINGTON_HOST: 'not a host!' }, { HARRINGTON_PUBLISHED_HOST: 'http://x' }, { HARRINGTON_ALLOWED_HOSTS: 'ok.example, bad host' }, { HARRINGTON_ACCESS_TOKEN: 'short' }]) {
      await assert.rejects(spawnHarrington(env), /exited with 1/);
    }
  });
});

// fetch() always sends the real Host header, so these requests go through
// node:http to send the name a browser would after DNS rebinding.
function getWithHost(port, hostHeader, path = '/api/health') {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers: { Host: hostHeader } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text: async () => body }));
    });
    req.on('error', reject);
    req.end();
  });
}

// The same for a write or custom request: method, JSON body and extra headers.
function sendWithHost(port, hostHeader, { method = 'PUT', path = '/api/settings/ai', body = null, headers: extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: hostHeader, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra };
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text: () => text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

function rawHttpStatus(port, rawRequest) {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: '127.0.0.1', port }, () => socket.end(rawRequest));
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { response += chunk; });
    socket.on('end', () => {
      const match = response.match(/^HTTP\/1\.[01] (\d{3})\b/);
      resolve(match ? Number.parseInt(match[1], 10) : 0);
    });
    socket.on('error', reject);
  });
}

describe('sign-in form and host names', { concurrency: false }, () => {
  const TOKEN = 'test-family-token-0123456789';

  function postLogin(url, token, headers = {}) {
    return fetch(`${url}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({ token }).toString(),
    });
  }

  test('GET /login shows a password form and POST signs in with the same check', async () => {
    const guarded = await spawnHarrington({ HARRINGTON_ACCESS_TOKEN: TOKEN });
    try {
      const form = await fetch(`${guarded.url}/login`);
      assert.equal(form.status, 200);
      const html = await form.text();
      assert.match(html, /<form method="post" action="\/login">/);
      assert.match(html, /type="password"/);

      for (const token of ['', 'wrong-token-0123456789', `${TOKEN}x`, TOKEN.slice(0, -1)]) {
        const failed = await postLogin(guarded.url, token);
        assert.equal(failed.status, 401, `POST with ${JSON.stringify(token)} should fail`);
        assert.equal(failed.headers.get('set-cookie'), null);
      }
      assert.equal((await postLogin(guarded.url, ` ${TOKEN}\n`)).status, 303, 'a pasted token is trimmed');
      const noBody = await fetch(`${guarded.url}/login`, { method: 'POST', redirect: 'manual' });
      assert.equal(noBody.status, 401);
      const oversized = await postLogin(guarded.url, `${TOKEN}${' '.repeat(5000)}`);
      assert.equal(oversized.status, 413);
      assert.equal(oversized.headers.get('set-cookie'), null);

      const ok = await postLogin(guarded.url, TOKEN);
      assert.equal(ok.status, 303);
      assert.equal(ok.headers.get('location'), '/');
      const setCookie = ok.headers.get('set-cookie');
      assert.match(setCookie, /HttpOnly; SameSite=Strict/);
      assert.doesNotMatch(setCookie, /Secure/);
      assert.match((await postLogin(guarded.url, TOKEN, { 'X-Forwarded-Proto': 'https' })).headers.get('set-cookie'), /; Secure/);
      const cookie = setCookie.split(';')[0];
      assert.equal(await fetch(`${guarded.url}/api/state`, { headers: { Cookie: cookie } }).then((r) => r.status), 200);
    } finally {
      await guarded.stop();
    }
  });

  test('refuses weak access tokens at startup without echoing the token (HAR-48)', async () => {
    for (const weak of [
      'short',
      'Ab1!cD2@eF3#gH4$iJ5%k', // 21 chars (< 22)
      'paste-your-token-here', // 21 chars
      'a'.repeat(24), // single character class (lowercase)
      'A'.repeat(24), // single character class (uppercase)
      '1'.repeat(24), // single character class (digits)
      '!'.repeat(24), // single character class (symbols)
      'alllowercasewordsphrase', // 23 chars, single class
      'a1'.repeat(12), // 24 chars, 2 classes, but only 2 distinct characters
      'Aa1!'.repeat(6), // 24 chars, 4 classes, but only 4 distinct characters
      'abc123def456 ghi789jkl012', // internal space
    ]) {
      const run = spawnSync(process.execPath, ['server.mjs'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          HARRINGTON_HOST: '127.0.0.1',
          HARRINGTON_PORT: '0',
          HARRINGTON_ACCESS_TOKEN: weak,
          HARRINGTON_PUBLISHED_HOST: '',
          HARRINGTON_ALLOWED_HOSTS: '',
        },
        encoding: 'utf8',
      });
      assert.equal(run.status, 1, `weak token ${JSON.stringify(weak)} should exit 1`);
      assert.match(run.stderr, /HARRINGTON_ACCESS_TOKEN/);
      assert.match(run.stderr, /docs\/DEPLOYMENT\.md/);
      assert.equal(run.stderr.includes(weak), false, 'stderr must never print the token');
    }

    // Valid 22+ char base64url and hex tokens start cleanly.
    for (const strong of ['Ab1_cD2-eF3_gH4-iJ5_kL', '0123456789abcdef0123456789abcdef']) {
      const server = await spawnHarrington({ HARRINGTON_ACCESS_TOKEN: strong });
      try {
        assert.equal((await (await fetch(`${server.url}/api/health`)).json()).authEnabled, true);
      } finally {
        await server.stop();
      }
    }
  });

  test('throttles /login after 5 failures with exponential backoff and logs the source address only (HAR-48)', async () => {
    // Default 1s base window: 5 wrong attempts return 401, the 6th immediately returns 429 with Retry-After: 1.
    const defaultServer = await spawnHarrington({ HARRINGTON_ACCESS_TOKEN: TOKEN });
    try {
      // Plain GET /login renders the sign-in page without counting against the address.
      for (let i = 0; i < 8; i += 1) {
        assert.equal((await fetch(`${defaultServer.url}/login`)).status, 200);
      }
      assert.doesNotMatch(defaultServer.output(), /Sign-in refused/);

      for (let i = 1; i <= 5; i += 1) {
        const res = i % 2 === 1
          ? await postLogin(defaultServer.url, `LEAK_MARKER_${i}\nFAKE_LOG_LINE`)
          : await fetch(`${defaultServer.url}/login?token=${encodeURIComponent(`LEAK_MARKER_${i}\r\nFAKE_LOG_LINE`)}`, { redirect: 'manual' });
        assert.equal(res.status, 401, `attempt ${i}`);
      }

      // Immediately locked out: even the right token and a spoofed X-Forwarded-For get 429.
      const lockedRight = await postLogin(defaultServer.url, TOKEN, { 'X-Forwarded-For': '203.0.113.77' });
      assert.equal(lockedRight.status, 429);
      assert.equal(lockedRight.headers.get('retry-after'), '1');
      assert.equal(lockedRight.headers.get('set-cookie'), null);
      assert.match(await lockedRight.text(), /Too many sign-in attempts/);

      const lockedLink = await fetch(`${defaultServer.url}/login?token=${encodeURIComponent(TOKEN)}`, {
        redirect: 'manual',
        headers: { 'X-Forwarded-For': '198.51.100.9' },
      });
      assert.equal(lockedLink.status, 429);
      assert.equal(lockedLink.headers.get('retry-after'), '1');

      // Plain GET /login (no token parameter) still shows the form during cooldown.
      assert.equal((await fetch(`${defaultServer.url}/login`)).status, 200);

      const log = await waitForOutput(defaultServer.output, /throttled \(429, failures=5/);
      const failureLines = log.split('\n').filter((line) => line.includes('Sign-in refused'));
      assert.equal(failureLines.length, 7, log);
      for (let i = 1; i <= 5; i += 1) {
        assert.match(failureLines[i - 1], new RegExp(`Sign-in refused for 127\\.0\\.0\\.1: unauthorised \\(401, failures=${i}\\)$`));
      }
      assert.match(failureLines[5], /Sign-in refused for 127\.0\.0\.1: throttled \(429, failures=5, retryAfter=1s\)$/);
      assert.ok(!log.includes('LEAK_MARKER') && !log.includes('FAKE_LOG_LINE') && !log.includes(TOKEN), 'submitted and expected tokens are never logged');
    } finally {
      await defaultServer.stop();
    }

    // Fast base window (50 ms): verify cooldown expiry, exponential doubling, and counter reset on success.
    const fastServer = await spawnHarrington({
      HARRINGTON_ACCESS_TOKEN: TOKEN,
      HARRINGTON_LOGIN_BACKOFF_BASE_MS: '50',
    });
    try {
      for (let i = 0; i < 5; i += 1) {
        assert.equal((await postLogin(fastServer.url, 'wrong-guess')).status, 401);
      }
      assert.equal((await postLogin(fastServer.url, TOKEN)).status, 429, 'locked during first 50 ms window');

      // Wait past the 50 ms window, then fail a 6th time -> doubles to 100 ms.
      await new Promise((resolve) => setTimeout(resolve, 65));
      assert.equal((await postLogin(fastServer.url, 'wrong-guess-6')).status, 401, '6th wrong guess after cooldown');
      assert.equal((await postLogin(fastServer.url, TOKEN)).status, 429, 'locked immediately in doubled 100 ms window');
      await new Promise((resolve) => setTimeout(resolve, 55));
      assert.equal((await postLogin(fastServer.url, TOKEN)).status, 429, 'still locked halfway through doubled 100 ms window');

      // Once the 100 ms window elapses, the right token succeeds and clears the failure counter.
      await new Promise((resolve) => setTimeout(resolve, 65));
      const ok = await postLogin(fastServer.url, TOKEN);
      assert.equal(ok.status, 303);
      assert.match(ok.headers.get('set-cookie') || '', /^harrington_session=/);

      // Counter was cleared: one wrong attempt gets 401 and the next right attempt works straight away.
      assert.equal((await postLogin(fastServer.url, 'wrong-after-reset')).status, 401);
      assert.equal((await postLogin(fastServer.url, TOKEN)).status, 303);
    } finally {
      await fastServer.stop();
    }
  });

  test('a loopback server refuses foreign and malformed Host headers with 421 or 400 (HAR-46)', async () => {
    const local = await spawnHarrington();
    try {
      const port = new URL(local.url).port;
      for (const hostHeader of ['rebind.attacker.test', `rebind.attacker.test:${port}`, 'attacker.example']) {
        for (const path of ['/', '/login', '/api/health', '/api/state']) {
          const refused = await getWithHost(port, hostHeader, path);
          assert.equal(refused.status, 421, `${hostHeader}${path} should be refused`);
          assert.match(await refused.text(), /HARRINGTON_ALLOWED_HOSTS/);
        }
        const putRefused = await sendWithHost(port, hostHeader, {
          method: 'PUT',
          path: '/api/state',
          headers: { 'If-Match': '"v0"', 'Sec-Fetch-Site': 'same-origin' },
          body: { students: [{ id: 's1', name: 'Rebound', birthYear: 2018 }] },
        });
        assert.equal(putRefused.status, 421, `PUT /api/state with ${hostHeader}`);
      }
      await assert.rejects(stat(join(local.dir, 'family-state.json')), { code: 'ENOENT' });

      for (const malformed of [
        '::1', '[localhost]', `[localhost]:${port}`, `[127.0.0.1]:${port}`,
        'localhost:0', 'localhost:99999', `127.0.0.1.:${port}`, `attacker.test@localhost:${port}`,
      ]) {
        const refused = await getWithHost(port, malformed, '/api/health');
        assert.ok(refused.status === 400 || refused.status === 421, `Host ${JSON.stringify(malformed)} got ${refused.status}`);
      }
      for (const raw of [
        'GET /api/health HTTP/1.0\r\n\r\n',
        'GET /api/health HTTP/1.1\r\nConnection: close\r\n\r\n',
        'GET /api/health HTTP/1.1\r\nHost: \r\nConnection: close\r\n\r\n',
        `GET /api/health HTTP/1.1\r\nHost: localhost:${port}\r\nHost: rebind.attacker.test\r\nConnection: close\r\n\r\n`,
      ]) {
        const status = await rawHttpStatus(port, raw);
        assert.ok(status === 400 || status === 421, `raw request got ${status}: ${JSON.stringify(raw)}`);
      }

      for (const allowed of [`localhost:${port}`, 'localhost', `LOCALHOST.:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, '[::1]']) {
        assert.equal((await getWithHost(port, allowed, '/api/health')).status, 200, `${allowed} should be allowed`);
        assert.equal((await getWithHost(port, allowed, '/api/state')).status, 200, `${allowed} /api/state should be allowed`);
      }
    } finally {
      await local.stop();
    }

    const withAllowed = await spawnHarrington({ HARRINGTON_ALLOWED_HOSTS: 'family-mac.local' });
    try {
      const port = new URL(withAllowed.url).port;
      assert.equal((await getWithHost(port, `family-mac.local:${port}`, '/api/health')).status, 200);
      assert.equal((await getWithHost(port, `family-mac.local:${port}`, '/api/state')).status, 200);
      assert.equal((await getWithHost(port, 'rebind.attacker.test', '/api/state')).status, 421);
    } finally {
      await withAllowed.stop();
    }
  });

  test('a shared server answers only to the family\'s host names and IP addresses', async () => {
    const sharedServer = await spawnHarrington({
      HARRINGTON_HOST: '0.0.0.0',
      HARRINGTON_PUBLISHED_HOST: 'family-host.example.ts.net',
      HARRINGTON_ALLOWED_HOSTS: 'family-host, harrington.home.arpa',
    });
    try {
      const port = new URL(sharedServer.url).port;
      const get = (hostHeader, path) => getWithHost(port, hostHeader, path);
      for (const name of [
        `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `192.168.1.20:${port}`,
        'family-host.example.ts.net', 'FAMILY-HOST.example.ts.net.', `family-host:${port}`, 'harrington.home.arpa',
      ]) {
        assert.equal((await get(name)).status, 200, `${name} should be allowed`);
      }
      for (const name of [
        'attacker.example', `attacker.example:${port}`, 'family-host.example.ts.net.attacker.example',
        'evil-family-host.example.ts.net', 'other.example.ts.net',
      ]) {
        for (const path of ['/api/health', '/', '/login']) {
          const refused = await get(name, path);
          assert.equal(refused.status, 421, `${name}${path} should be refused`);
          assert.match(await refused.text(), /HARRINGTON_ALLOWED_HOSTS/);
        }
      }
    } finally {
      await sharedServer.stop();
    }
  });

  test('a loopback bind behind a published mesh name counts as shared', async () => {
    // The Tailscale serve setup: Harrington on 127.0.0.1, devices on the .ts.net name.
    const meshed = await spawnHarrington({ HARRINGTON_HOST: '127.0.0.1', HARRINGTON_PUBLISHED_HOST: 'family-host.example.ts.net' });
    try {
      const port = new URL(meshed.url).port;
      assert.equal((await (await fetch(`${meshed.url}/api/health`)).json()).host, 'network');
      assert.equal((await getWithHost(port, 'family-host.example.ts.net')).status, 200);
      assert.equal((await getWithHost(port, 'attacker.example')).status, 421);
      assert.match(meshed.output(), /anyone who can reach this server/);
    } finally {
      await meshed.stop();
    }
  });

  test('the Docker default (0.0.0.0 bind, loopback published) still refuses other names', async () => {
    const container = await spawnHarrington({ HARRINGTON_HOST: '0.0.0.0', HARRINGTON_PUBLISHED_HOST: '127.0.0.1' });
    try {
      const port = new URL(container.url).port;
      for (const name of [`127.0.0.1:${port}`, `localhost:${port}`]) {
        assert.equal((await getWithHost(port, name)).status, 200, `${name} should be allowed`);
      }
      assert.equal((await getWithHost(port, 'attacker.example')).status, 421);
    } finally {
      await container.stop();
    }
  });
});
