import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildFirebase } from '../scripts/build-firebase.mjs';
import { FIREBASE_CONFIG, activeFirebaseConfig } from '../src/js/firebase-config.js';
import {
  clearFirebaseSession,
  encodeLessonKey,
  ensureFirebaseSession,
  firebaseChat,
  firebaseLoadState,
  firebaseRewriteStaticUrl,
  firebaseSaveState,
  fromFirestoreFields,
  fromFirestoreValue,
  getFirebaseSession,
  installFirebaseFetchWrapper,
  promptFirebaseSignIn,
  signInWithGooglePopup,
  signInWithIdp,
  signInWithPassword,
  toFirestoreFields,
  toFirestoreValue,
} from '../src/js/firebase-backend.js';
import { SCHEMA_VERSION } from '../src/js/schema.js';

const repoRoot = new URL('..', import.meta.url);
const TEST_INVITED_EMAIL = 'invited-parent@example.test';
const TEST_INVITED_EMAIL_HASH = createHash('sha256').update(TEST_INVITED_EMAIL, 'utf8').digest('hex');
const OWNER_EMAIL_HASH = '3630ac935b7662b92f7637f6ca90495fd5fe6d1fb563ae61e4a143d7c4b43edf';
const TEST_CFG = {
  apiKey: 'test-api-key',
  authDomain: 'harrington-test.firebaseapp.com',
  projectId: 'harrington-test',
  storageBucket: 'harrington-test.firebasestorage.app',
  appId: '1:123:web:abc',
  allowedEmailHashes: [TEST_INVITED_EMAIL_HASH],
  idToken: 'test-id-token',
};

const scratchDirs = [];
after(async () => {
  clearFirebaseSession();
  delete globalThis.__HARRINGTON_FIREBASE_CONFIG__;
  for (const dir of scratchDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

test('firebase-config defaults to null in repository and honours overrides', () => {
  assert.equal(FIREBASE_CONFIG, null);
  assert.equal(activeFirebaseConfig(), null);
  assert.deepEqual(activeFirebaseConfig(TEST_CFG), TEST_CFG);
  globalThis.__HARRINGTON_FIREBASE_CONFIG__ = TEST_CFG;
  try {
    assert.deepEqual(activeFirebaseConfig(), TEST_CFG);
  } finally {
    delete globalThis.__HARRINGTON_FIREBASE_CONFIG__;
  }
  assert.equal(activeFirebaseConfig(), null);
});

test('Firestore value conversion round-trips a complete family state document', () => {
  assert.deepEqual(toFirestoreValue(null), { nullValue: null });
  assert.deepEqual(toFirestoreValue(true), { booleanValue: true });
  assert.deepEqual(toFirestoreValue(42), { integerValue: '42' });
  assert.deepEqual(toFirestoreValue(3.5), { doubleValue: 3.5 });
  assert.deepEqual(toFirestoreValue('hello'), { stringValue: 'hello' });
  assert.deepEqual(fromFirestoreValue({ mapValue: {} }), {});
  assert.deepEqual(fromFirestoreValue({ arrayValue: {} }), []);

  const familyDoc = {
    schemaVersion: SCHEMA_VERSION,
    version: 4,
    updatedAt: 1763790000000,
    writeId: 'w_abc123',
    activeStudentId: 's1',
    graphView: 'atlas',
    students: [
      {
        id: 's1',
        name: 'Rowan Sample',
        birthYear: 2018,
        birthMonth: 6,
        color: '#3f6b3b',
        curriculum: { id: 'acara-v9', year: '1' },
      },
    ],
    progress: {
      s1: {
        mt_count_1: { status: 'mastered', updatedAt: 1763780000000 },
      },
    },
    records: {
      s1: [
        {
          id: 'r1',
          type: 'observation',
          topicId: 'mt_count_1',
          topicName: 'Counting to 20',
          title: 'Counted shells on the beach',
          note: 'Counted accurately up to 20.',
          rating: 5,
          createdAt: 1763785000000,
          duration: 12.5,
        },
      ],
    },
    reading: {
      s1: {
        graphemes: ['s', 'a', 't', 'p', 'i', 'n'],
        tricky: ['the', 'to'],
        clusters: false,
        sequence: 'letters-and-sounds',
        prefs: { nameOnCover: true, layout: 'booklet' },
        library: [
          {
            id: 'book-1',
            savedAt: 1763789000000,
            book: {
              title: 'Sam Sat',
              graphemes: ['s', 'a', 't'],
              tricky: ['the'],
              cover: [{ kind: 'sun', x: 50, y: 20, scale: 1.25, tilt: 0 }],
              pages: [{ text: 'Sam sat at the mat.', scene: [] }],
            },
          },
        ],
      },
    },
    settings: {
      calendar: { homeDays: [1, 2, 3, 4], breaks: [] },
    },
    dismissedAlerts: null,
    skippedUndefined: undefined,
  };

  const fields = toFirestoreFields(familyDoc);
  assert.equal('skippedUndefined' in fields, false);
  assert.deepEqual(fields.version, { integerValue: '4' });
  assert.deepEqual(fields.dismissedAlerts, { nullValue: null });

  const decoded = fromFirestoreFields(fields);
  const { skippedUndefined: _ignored, ...expected } = familyDoc;
  assert.deepEqual(decoded, expected);
});

test('firebaseSaveState implements compare-and-swap (0 -> 1, 412 conflict, 422 validation)', async () => {
  const store = {
    exists: false,
    updateTime: null,
    doc: null,
  };

  const mockFetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (url.includes('/families/default') && method === 'GET') {
      if (!store.exists) return { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND' } }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'projects/harrington-test/databases/(default)/documents/families/default',
          fields: toFirestoreFields(store.doc),
          updateTime: store.updateTime,
        }),
      };
    }
    if (url.includes('/families/default') && method === 'PATCH') {
      const parsedUrl = new URL(url);
      if (parsedUrl.searchParams.get('currentDocument.exists') === 'false' && store.exists) {
        return { ok: false, status: 409, json: async () => ({ error: { status: 'ALREADY_EXISTS' } }) };
      }
      const expectedTime = parsedUrl.searchParams.get('currentDocument.updateTime');
      if (expectedTime && expectedTime !== store.updateTime) {
        return { ok: false, status: 412, json: async () => ({ error: { status: 'FAILED_PRECONDITION' } }) };
      }
      const payload = JSON.parse(options.body);
      store.exists = true;
      store.doc = fromFirestoreFields(payload.fields);
      store.updateTime = `2026-11-22T06:00:0${store.doc.version}Z`;
      return {
        ok: true,
        status: 200,
        json: async () => ({ fields: payload.fields, updateTime: store.updateTime }),
      };
    }
    throw new Error(`Unexpected URL: ${method} ${url}`);
  };

  // Initial load on empty Firestore returns version 0.
  const initial = await firebaseLoadState(TEST_CFG, mockFetch);
  assert.equal(initial.version, 0);
  assert.deepEqual(initial.students, []);

  // Invalid document throws 422 before writing.
  await assert.rejects(
    () => firebaseSaveState(JSON.stringify({ schemaVersion: SCHEMA_VERSION, students: [{ id: 's1', name: '   ' }] }), 0, TEST_CFG, mockFetch),
    (err) => err.status === 422,
  );
  assert.equal(store.exists, false);

  // Version 0 -> Version 1 succeeds.
  const validDoc = {
    schemaVersion: SCHEMA_VERSION,
    students: [{ id: 's1', name: 'Rowan Sample', birthYear: 2018 }],
    activeStudentId: 's1',
    progress: {},
  };
  const v1 = await firebaseSaveState(JSON.stringify({ ...validDoc, writeId: 'w_1' }), 0, TEST_CFG, mockFetch);
  assert.equal(v1, 1);
  assert.equal(store.doc.version, 1);
  assert.equal(store.doc.writeId, 'w_1');

  // Stale version 0 throws 412 with current server document.
  await assert.rejects(
    () => firebaseSaveState(JSON.stringify({ ...validDoc, writeId: 'w_stale' }), 0, TEST_CFG, mockFetch),
    (err) => err.status === 412 && err.body?.version === 1 && err.body?.writeId === 'w_1',
  );
});

test('firebaseChat redacts learner names and strips stored parent notes unless opted in on analysis/review', async () => {
  const familyDoc = {
    schemaVersion: SCHEMA_VERSION,
    version: 2,
    updatedAt: 1763790000000,
    students: [{ id: 's1', name: 'Zebulon Quixote', birthYear: 2017 }],
    records: {
      s1: [
        {
          id: 'r1',
          type: 'discussion',
          title: 'Place value chat',
          note: 'Zebulon struggled with carrying tens today in column addition.',
        },
      ],
    },
  };
  const aiDoc = {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    apiKey: 'secret-gemini-key',
    capabilities: ['lesson', 'analysis', 'review'],
    updatedAt: 1763790000000,
  };
  const sentBodies = [];

  const mockFetch = async (url, options = {}) => {
    if (url.includes('/families/default/settings/ai')) {
      return { ok: true, status: 200, json: async () => ({ fields: toFirestoreFields(aiDoc) }) };
    }
    if (url.includes('/families/default')) {
      return { ok: true, status: 200, json: async () => ({ fields: toFirestoreFields(familyDoc), updateTime: 't1' }) };
    }
    if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions') {
      sentBodies.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Great progress.' } }] }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const prompt = 'Check on Zebulon Quixote. Note: Zebulon struggled with carrying tens today in column addition.';

  // 1. Default (includeNotes: false) on analysis strips note and redacts name.
  await firebaseChat([{ role: 'user', content: prompt }], 'analysis', { includeNotes: false }, TEST_CFG, mockFetch);
  assert.doesNotMatch(sentBodies[0].messages[0].content, /Zebulon/i);
  assert.match(sentBodies[0].messages[0].content, /the child/);
  assert.match(sentBodies[0].messages[0].content, /\[note removed\]/);
  assert.doesNotMatch(sentBodies[0].messages[0].content, /carrying tens/);

  // 2. includeNotes: true on analysis keeps the note (still redacting the name).
  await firebaseChat([{ role: 'user', content: prompt }], 'analysis', { includeNotes: true }, TEST_CFG, mockFetch);
  assert.doesNotMatch(sentBodies[1].messages[0].content, /Zebulon/i);
  assert.match(sentBodies[1].messages[0].content, /the child/);
  assert.match(sentBodies[1].messages[0].content, /carrying tens/);

  // 3. includeNotes: true on lesson STILL strips the note (only analysis and review allow notes).
  await firebaseChat([{ role: 'user', content: prompt }], 'lesson', { includeNotes: true }, TEST_CFG, mockFetch);
  assert.doesNotMatch(sentBodies[2].messages[0].content, /Zebulon/i);
  assert.match(sentBodies[2].messages[0].content, /\[note removed\]/);
  assert.doesNotMatch(sentBodies[2].messages[0].content, /carrying tens/);
});

test('auth helpers, key encoding, and static URL rewrites behave consistently', async () => {
  assert.equal(encodeLessonKey('topic:mt_123'), Buffer.from('topic:mt_123', 'utf8').toString('base64url'));
  assert.equal(firebaseRewriteStaticUrl('/api/figures'), '/api/figures.json');
  assert.equal(firebaseRewriteStaticUrl('/api/taxonomy/research'), '/api/taxonomy/research.json');
  assert.equal(firebaseRewriteStaticUrl('/api/taxonomy/research/mt_abc123'), '/api/taxonomy/research/mt_abc123.json');
  assert.equal(firebaseRewriteStaticUrl('/api/taxonomy/research/mt_abc123.json'), '/api/taxonomy/research/mt_abc123.json');
  assert.equal(firebaseRewriteStaticUrl('/api/taxonomy/topics.json'), '/api/taxonomy/topics.json');
  assert.equal(installFirebaseFetchWrapper(null), false);

  clearFirebaseSession();
  assert.equal(getFirebaseSession(), null);

  const authFetch = async (url, options = {}) => {
    if (url.includes('signInWithPassword') || url.includes('signInWithIdp')) {
      const body = options.body ? JSON.parse(options.body) : {};
      const email = body.email || TEST_INVITED_EMAIL;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          idToken: 'tok-1',
          refreshToken: 'ref-1',
          email,
          emailVerified: true,
          expiresIn: '3600',
        }),
      };
    }
    throw new Error(`Unexpected auth URL: ${url}`);
  };

  const { idToken: _omit, ...noTokenCfg } = TEST_CFG;
  const pwSession = await signInWithPassword(TEST_INVITED_EMAIL, 'pass', noTokenCfg, authFetch);
  assert.equal(pwSession.idToken, 'tok-1');
  assert.equal((await ensureFirebaseSession(noTokenCfg, authFetch)).idToken, 'tok-1');

  // Uninvited accounts are rejected with 403 even if Firebase Auth returns a token.
  clearFirebaseSession();
  await assert.rejects(
    () => signInWithPassword('stranger@example.test', 'pass', noTokenCfg, authFetch),
    (err) => err.status === 403 && /invite-only beta allowlist/i.test(err.message),
  );

  clearFirebaseSession();
  const idpSession = await signInWithIdp('google-id-token', noTokenCfg, authFetch, 'http://localhost');
  assert.equal(idpSession.email, TEST_INVITED_EMAIL);

  clearFirebaseSession();
  await assert.rejects(() => signInWithGooglePopup(noTokenCfg, authFetch), /popup sign-in/i);
  await assert.rejects(() => promptFirebaseSignIn(noTokenCfg, authFetch), /sign in is required/i);
});

test('build-firebase.mjs generates static figures, taxonomy, standards, research, and config', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'harrington-fb-dist-'));
  scratchDirs.push(tempRoot);
  const distDir = join(tempRoot, 'dist');

  const result = await buildFirebase({
    distDir,
    log: () => {},
    env: {
      HARRINGTON_FIREBASE_CONFIG: JSON.stringify({
        apiKey: 'demo-key',
        authDomain: 'demo.firebaseapp.com',
        projectId: 'demo-proj',
        storageBucket: 'demo.firebasestorage.app',
        appId: '1:1:web:1',
      }),
    },
  });

  assert.ok(result.figureCount > 0);
  assert.ok(result.researchCount > 0);
  assert.equal(result.configured, true);

  for (const rel of [
    'index.html',
    'api/figures.json',
    'api/taxonomy/topics.json',
    'api/taxonomy/dependencies.json',
    'api/taxonomy/clusters.json',
    'api/taxonomy/manifest.json',
    'api/taxonomy/standards/acara-v9.json',
    'api/taxonomy/research.json',
    'js/firebase-config.js',
  ]) {
    assert.equal(existsSync(join(distDir, rel)), true, `Missing ${rel} in built dist/`);
  }

  const researchIndex = JSON.parse(await readFile(join(distDir, 'api/taxonomy/research.json'), 'utf8'));
  assert.ok(Array.isArray(researchIndex.topicIds) && researchIndex.topicIds.length > 0);
  assert.equal(existsSync(join(distDir, `api/taxonomy/research/${researchIndex.topicIds[0]}.json`)), true);

  const builtConfig = await readFile(join(distDir, 'js/firebase-config.js'), 'utf8');
  assert.match(builtConfig, /"projectId": "demo-proj"/);
  assert.match(builtConfig, /export function activeFirebaseConfig/);
});

test('firestore.rules, storage.rules, and client sign-in modal enforce SHA-256 invite-only allowlist without exposing plaintext email', async () => {
  const [firestoreRules, storageRules, firebaseBackendSrc, buildFirebaseSrc, firebaseJson] = await Promise.all([
    readFile(new URL('firestore.rules', repoRoot), 'utf8'),
    readFile(new URL('storage.rules', repoRoot), 'utf8'),
    readFile(new URL('src/js/firebase-backend.js', repoRoot), 'utf8'),
    readFile(new URL('scripts/build-firebase.mjs', repoRoot), 'utf8'),
    readFile(new URL('firebase.json', repoRoot), 'utf8'),
  ]);

  assert.match(firestoreRules, /request\.auth\.token\.email_verified == true/);
  assert.match(firestoreRules, new RegExp(OWNER_EMAIL_HASH));
  assert.match(firestoreRules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);

  assert.match(storageRules, /request\.auth\.token\.email_verified == true/);
  assert.match(storageRules, new RegExp(OWNER_EMAIL_HASH));
  assert.match(storageRules, /match \/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;/);

  // Sign-in modal must display "Invite-only beta period" and keep the email input empty by default.
  assert.match(firebaseBackendSrc, /Invite-only beta period/);
  assert.match(firebaseBackendSrc, /<input name="email" type="email" required value="" placeholder="Email address"/);

  // Never leak any plaintext gmail address across rules, client bundles, or build scripts.
  for (const [label, content] of [
    ['firestore.rules', firestoreRules],
    ['storage.rules', storageRules],
    ['src/js/firebase-backend.js', firebaseBackendSrc],
    ['scripts/build-firebase.mjs', buildFirebaseSrc],
    ['firebase.json', firebaseJson],
  ]) {
    assert.doesNotMatch(content, /@gmail\.com/i, `${label} must not contain a plaintext Gmail address`);
  }
});
