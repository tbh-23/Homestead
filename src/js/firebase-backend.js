// Zero-dependency Firebase REST adapter for Harrington (Firebase Hosting +
// Firebase Authentication + Cloud Firestore + Cloud Storage + Gemini AI).
// Activated only when activeFirebaseConfig() returns a non-null config;
// local self-hosted mode (`node server.mjs`) never triggers these paths.
import { AI_CAPABILITIES, capabilityOffMessage } from './ai-capabilities.js';
import { validateDocument } from './document.js';
import { activeFirebaseConfig } from './firebase-config.js';
import { redactNames } from './redact.js';
import { SCHEMA_VERSION, schemaVersionOf } from './schema.js';
import { el, esc, openModal } from './ui.js';

const AUTH_STORAGE_KEY = 'harrington:firebaseAuth';
const DEFAULT_ALLOWED_EMAILS = ['simonguerin@gmail.com'];
const DEFAULT_AI_TIMEOUT_MS = 180_000;
const MAX_TIMEOUT_MS = 3_600_000;
const MAX_API_KEY = 512;
const MAX_MODEL = 200;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const SAFE_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/flac',
]);

const AI_PRESETS = [
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', cloud: true },
  { id: 'custom', label: 'OpenAI-compatible (custom)', baseUrl: '', model: '', cloud: false },
];
const AI_SETTING_FIELDS = ['baseUrl', 'model', 'apiKey', 'timeoutMs', 'capabilities'];
const AI_ROLES = new Set(['system', 'user', 'assistant']);
const NOTE_CAPABILITIES = new Set(['analysis', 'review']);
const NOTE_REMOVED = '[note removed]';
const NOTE_MIN = 20;
const NOTE_CUTS = [300, 1500];

const FETCH_WRAPPED = Symbol('harringtonFirebaseFetchWrapped');

// ---- Firestore Value Conversion ----

export function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    if (Number.isSafeInteger(value)) return { integerValue: String(Object.is(value, -0) ? 0 : value) };
    return { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => (item === undefined ? { nullValue: null } : toFirestoreValue(item))),
      },
    };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { nullValue: null };
}

export function toFirestoreFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}

export function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return String(value.stringValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue?.fields || {});
  return null;
}

export function fromFirestoreFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const entries = [];
  for (const [key, val] of Object.entries(fields)) {
    entries.push([key, fromFirestoreValue(val)]);
  }
  return Object.fromEntries(entries);
}

// ---- Key Encoding & Static URL Rewriting ----

export function encodeLessonKey(key) {
  const bytes = new TextEncoder().encode(String(key ?? ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function firebaseRewriteStaticUrl(url) {
  const raw = String(url ?? '');
  if (!raw.startsWith('/api/')) return raw;
  const qIndex = raw.indexOf('?');
  const hIndex = raw.indexOf('#');
  const cut = [qIndex, hIndex].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? raw.length;
  const path = raw.slice(0, cut);
  const suffix = raw.slice(cut);
  if (path === '/api/figures') return `/api/figures.json${suffix}`;
  if (path === '/api/taxonomy/research') return `/api/taxonomy/research.json${suffix}`;
  if (path.startsWith('/api/taxonomy/research/') && !path.endsWith('.json')) {
    return `${path}.json${suffix}`;
  }
  return raw;
}

export function installFirebaseFetchWrapper(cfgOverride = null) {
  const cfg = activeFirebaseConfig(cfgOverride);
  if (!cfg || typeof window === 'undefined' || typeof window.fetch !== 'function') return false;
  if (window.fetch[FETCH_WRAPPED]) return true;
  const nativeFetch = window.fetch.bind(window);
  const wrapped = (input, init) => {
    if (typeof input === 'string') {
      const rewritten = firebaseRewriteStaticUrl(input);
      if (rewritten !== input) return nativeFetch(rewritten, init);
    } else if (input instanceof URL && input.origin === window.location.origin) {
      const rewritten = firebaseRewriteStaticUrl(`${input.pathname}${input.search}${input.hash}`);
      if (rewritten !== `${input.pathname}${input.search}${input.hash}`) {
        return nativeFetch(new URL(rewritten, input.origin).toString(), init);
      }
    }
    return nativeFetch(input, init);
  };
  wrapped[FETCH_WRAPPED] = true;
  window.fetch = wrapped;
  return true;
}

// Automatically install the static fetch wrapper only when Firebase Hosting config is active.
if (activeFirebaseConfig()) {
  installFirebaseFetchWrapper();
}

// ---- Firebase Authentication ----

const memoryStorage = new Map();

function readStorage(key) {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage.getItem(key);
  } catch {}
  return memoryStorage.get(key) ?? null;
}

function writeStorage(key, value) {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      if (value === null) globalThis.localStorage.removeItem(key);
      else globalThis.localStorage.setItem(key, value);
      return;
    }
  } catch {}
  if (value === null) memoryStorage.delete(key);
  else memoryStorage.set(key, value);
}

function allowedEmailSet(cfg) {
  const list = Array.isArray(cfg?.allowedEmails) && cfg.allowedEmails.length
    ? cfg.allowedEmails
    : DEFAULT_ALLOWED_EMAILS;
  return new Set(list.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean));
}

function assertAllowedEmail(email, cfg, emailVerified = true) {
  const normalised = String(email || '').trim().toLowerCase();
  if (!normalised || !allowedEmailSet(cfg).has(normalised)) {
    throw Object.assign(new Error('This Google account is not on the family allowlist for Harrington.'), { status: 403 });
  }
  if (emailVerified === false) {
    throw Object.assign(new Error('Please use a verified email address to sign in to Harrington.'), { status: 403 });
  }
  return normalised;
}

export function getFirebaseSession() {
  const raw = readStorage(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.idToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFirebaseSession() {
  writeStorage(AUTH_STORAGE_KEY, null);
}

function saveFirebaseSession(session) {
  writeStorage(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function refreshFirebaseToken(session, cfg, fetchImpl = globalThis.fetch) {
  if (!session?.refreshToken || !cfg?.apiKey) return null;
  const response = await fetchImpl(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
    },
  );
  if (!response.ok) {
    clearFirebaseSession();
    return null;
  }
  const data = await response.json();
  if (!data?.id_token) {
    clearFirebaseSession();
    return null;
  }
  const next = {
    idToken: data.id_token,
    refreshToken: data.refresh_token || session.refreshToken,
    email: session.email || null,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return saveFirebaseSession(next);
}

export async function signInWithPassword(email, password, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  if (!cfg?.apiKey) throw Object.assign(new Error('Firebase configuration is missing an API key.'), { status: 500 });
  const response = await fetchImpl(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || ''), returnSecureToken: true }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.idToken) {
    const code = data?.error?.message || 'Sign-in failed';
    throw Object.assign(new Error(`Could not sign in (${code}).`), { status: response.status || 401 });
  }
  const verifiedEmail = assertAllowedEmail(data.email || email, cfg, true);
  return saveFirebaseSession({
    idToken: data.idToken,
    refreshToken: data.refreshToken || null,
    email: verifiedEmail,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  });
}

export async function signInWithIdp(googleIdToken, cfgOverride = null, fetchImpl = globalThis.fetch, requestUri = null) {
  const cfg = activeFirebaseConfig(cfgOverride);
  if (!cfg?.apiKey) throw Object.assign(new Error('Firebase configuration is missing an API key.'), { status: 500 });
  const origin = requestUri || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const postBody = googleIdToken.includes('=')
    ? googleIdToken
    : `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`;
  const response = await fetchImpl(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(cfg.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody,
        requestUri: origin,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.idToken) {
    const code = data?.error?.message || 'Google sign-in failed';
    throw Object.assign(new Error(`Google sign-in failed (${code}).`), { status: response.status || 401 });
  }
  const verifiedEmail = assertAllowedEmail(data.email, cfg, data.emailVerified !== false);
  return saveFirebaseSession({
    idToken: data.idToken,
    refreshToken: data.refreshToken || null,
    email: verifiedEmail,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  });
}

export async function signInWithGooglePopup(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  if (!cfg?.apiKey) throw Object.assign(new Error('Firebase configuration is missing an API key.'), { status: 500 });
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    throw Object.assign(new Error('Popup sign-in is only available in a browser window.'), { status: 400 });
  }
  const continueUri = `${window.location.origin}/`;
  const uriRes = await fetchImpl(
    `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(cfg.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'google.com', continueUri }),
    },
  );
  const uriData = await uriRes.json().catch(() => ({}));
  if (!uriRes.ok || !uriData?.authUri) {
    throw Object.assign(new Error('Could not start Google sign-in.'), { status: uriRes.status || 500 });
  }
  const popup = window.open(uriData.authUri, 'harrington_firebase_auth', 'width=500,height=640');
  if (!popup) {
    throw Object.assign(new Error('The sign-in popup was blocked by the browser. Allow popups or sign in below.'), { status: 400 });
  }
  const callbackUrl = await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(Object.assign(new Error('Sign-in was cancelled.'), { status: 401 }));
          return;
        }
        if (popup.location && popup.location.origin === window.location.origin) {
          const href = popup.location.href;
          if (href.includes('code=') || href.includes('id_token=') || href.includes('error=')) {
            clearInterval(timer);
            popup.close();
            resolve(href);
          }
        }
      } catch {
        // Cross-origin while on accounts.google.com; keep polling.
      }
    }, 200);
  });
  return signInWithIdp(
    `providerId=google.com`,
    cfg,
    fetchImpl,
    callbackUrl,
  );
}

let pendingSignIn = null;

export function promptFirebaseSignIn(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  if (typeof document === 'undefined' || !document.getElementById('modal-root')) {
    return Promise.reject(Object.assign(new Error('Sign in is required to access family data.'), { status: 401, body: null }));
  }
  const allowed = [...allowedEmailSet(cfg)].join(', ');
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const body = el(`
      <div class="p-6 space-y-4">
        <div>
          <h2 class="font-display text-xl font-600">Sign in to Harrington</h2>
          <p class="text-sm text-ink-soft mt-1">Sign in with your allowlisted family account (${esc(allowed)}) to load and save family data.</p>
        </div>
        <div id="fb-auth-err" class="hidden rounded-lg bg-[#a4473a]/10 border border-[#a4473a]/30 px-3 py-2 text-sm text-[#a4473a]"></div>
        <button id="fb-google" type="button" class="w-full px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors">Sign in with Google</button>
        <form id="fb-pw-form" class="space-y-3 pt-2 border-t border-paper-line">
          <p class="text-xs font-medium text-ink-faint uppercase tracking-wide">Or email &amp; password</p>
          <input name="email" type="email" required value="${esc([...allowedEmailSet(cfg)][0] || '')}" placeholder="Email address" class="w-full px-3.5 py-2 rounded-lg border border-paper-line bg-paper text-sm" />
          <input name="password" type="password" required placeholder="Password" class="w-full px-3.5 py-2 rounded-lg border border-paper-line bg-paper text-sm" />
          <button type="submit" class="w-full px-4 py-2 rounded-xl border border-paper-line bg-paper hover:border-brand/40 text-sm font-medium">Sign in with email</button>
        </form>
        <details class="text-xs text-ink-soft">
          <summary class="cursor-pointer font-medium">Paste a Google ID token</summary>
          <form id="fb-token-form" class="mt-2 space-y-2">
            <textarea name="token" rows="2" placeholder="Paste Google ID token" class="w-full px-3 py-2 rounded-lg border border-paper-line bg-paper text-xs"></textarea>
            <button type="submit" class="px-3 py-1.5 rounded-lg border border-paper-line bg-paper text-xs font-medium">Use token</button>
          </form>
        </details>
      </div>
    `);
    const errBox = body.querySelector('#fb-auth-err');
    const showError = (err) => {
      errBox.textContent = err?.message || 'Sign-in failed';
      errBox.classList.remove('hidden');
    };
    const modal = openModal(body, {
      beforeClose: () => {
        finish(reject, Object.assign(new Error('Sign-in is required to open Harrington.'), { status: 401, body: null }));
        return true;
      },
    });
    const succeed = (session) => {
      settled = true;
      modal.close();
      resolve(session);
    };
    body.querySelector('#fb-google').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      errBox.classList.add('hidden');
      try {
        succeed(await signInWithGooglePopup(cfg, fetchImpl));
      } catch (err) {
        btn.disabled = false;
        showError(err);
      }
    };
    body.querySelector('#fb-pw-form').onsubmit = async (e) => {
      e.preventDefault();
      errBox.classList.add('hidden');
      const fd = new FormData(e.target);
      try {
        succeed(await signInWithPassword(fd.get('email'), fd.get('password'), cfg, fetchImpl));
      } catch (err) {
        showError(err);
      }
    };
    body.querySelector('#fb-token-form').onsubmit = async (e) => {
      e.preventDefault();
      errBox.classList.add('hidden');
      const token = String(new FormData(e.target).get('token') || '').trim();
      if (!token) return;
      try {
        succeed(await signInWithIdp(token, cfg, fetchImpl));
      } catch (err) {
        showError(err);
      }
    };
  });
}

export async function ensureFirebaseSession(cfgOverride = null, fetchImpl = globalThis.fetch, { forceRefresh = false } = {}) {
  const cfg = activeFirebaseConfig(cfgOverride);
  if (!cfg) throw Object.assign(new Error('Firebase is not configured.'), { status: 500 });
  if (cfg.idToken && !forceRefresh) {
    return { idToken: cfg.idToken, refreshToken: cfg.refreshToken || null, email: cfg.email || DEFAULT_ALLOWED_EMAILS[0], expiresAt: Date.now() + 3600_000 };
  }
  const existing = getFirebaseSession();
  if (existing?.idToken) {
    if (existing.email) assertAllowedEmail(existing.email, cfg, true);
    const needsRefresh = forceRefresh || (existing.expiresAt && existing.expiresAt - Date.now() <= TOKEN_REFRESH_MARGIN_MS);
    if (!needsRefresh) return existing;
    if (existing.refreshToken) {
      const refreshed = await refreshFirebaseToken(existing, cfg, fetchImpl);
      if (refreshed) return refreshed;
    } else if (!forceRefresh) {
      return existing;
    }
  }
  if (!pendingSignIn) {
    pendingSignIn = promptFirebaseSignIn(cfg, fetchImpl).finally(() => {
      pendingSignIn = null;
    });
  }
  return pendingSignIn;
}

async function authedFetch(url, options, cfg, fetchImpl = globalThis.fetch) {
  let session = await ensureFirebaseSession(cfg, fetchImpl);
  const runWith = (token) => fetchImpl(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  let response = await runWith(session.idToken);
  if (response.status === 401 && session.refreshToken && !cfg?.idToken) {
    session = await ensureFirebaseSession(cfg, fetchImpl, { forceRefresh: true });
    response = await runWith(session.idToken);
  }
  return response;
}

// ---- Firestore REST Paths & Error Helpers ----

function firestoreDocUrl(cfg, relativePath) {
  const clean = String(relativePath || '').replace(/^\/+/, '');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/${clean}`;
}

async function readErrorBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function httpError(message, status, body = null) {
  return Object.assign(new Error(message), { status, body });
}

// ---- Family State (/families/default) ----

async function readFamilyDocumentRaw(cfg, fetchImpl = globalThis.fetch) {
  const response = await authedFetch(firestoreDocUrl(cfg, 'families/default'), { method: 'GET' }, cfg, fetchImpl);
  if (response.status === 404) {
    return {
      exists: false,
      updateTime: null,
      doc: { schemaVersion: SCHEMA_VERSION, version: 0, students: [] },
    };
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not load family data (${response.status})`, response.status, body);
  }
  const payload = await response.json();
  const decoded = fromFirestoreFields(payload?.fields || {});
  const version = Number.isSafeInteger(decoded.version) && decoded.version >= 0 ? decoded.version : 0;
  return {
    exists: true,
    updateTime: payload?.updateTime || null,
    doc: { schemaVersion: SCHEMA_VERSION, ...decoded, version },
  };
}

export async function firebaseLoadState(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const { doc } = await readFamilyDocumentRaw(cfg, fetchImpl);
  return doc;
}

export async function firebaseSaveState(bodyText, expectedVersion, cfgOverride = null, fetchImpl = globalThis.fetch, { keepalive = false } = {}) {
  const cfg = activeFirebaseConfig(cfgOverride);
  let data;
  try {
    data = typeof bodyText === 'string' ? JSON.parse(bodyText) : bodyText;
  } catch {
    throw httpError('Request body must be valid JSON', 400);
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw httpError('Request body must be a JSON object', 400);
  }

  const { version: _v, updatedAt: _u, writeId, ...doc } = data;
  const schema = schemaVersionOf(doc);
  if (schema === null) {
    throw httpError('schemaVersion must be a whole number', 422, { error: 'schemaVersion must be a whole number' });
  }
  if (schema > SCHEMA_VERSION) {
    const msg = `This version of Harrington reads family data up to format ${SCHEMA_VERSION}; the save is format ${schema}.`;
    throw httpError(msg, 409, { error: msg });
  }
  const problem = validateDocument(doc);
  if (problem) {
    throw httpError(problem, 422, { error: problem });
  }

  const currentState = await readFamilyDocumentRaw(cfg, fetchImpl);
  const currentVersion = currentState.doc.version || 0;
  if (currentVersion !== expectedVersion) {
    throw httpError('Family data changed on another device', 412, currentState.doc);
  }

  const storedSchema = currentState.exists ? (schemaVersionOf(currentState.doc) ?? 0) : 0;
  if (schema < storedSchema) {
    const msg = `The family data is format ${storedSchema}; this save is format ${schema}. Reload Harrington.`;
    throw httpError(msg, 409, { error: msg });
  }

  const fresh = typeof writeId === 'string' && writeId.length > 0 && writeId.length <= 64 && writeId !== currentState.doc.writeId;
  const next = {
    ...doc,
    schemaVersion: schema >= 1 ? schema : SCHEMA_VERSION,
    version: expectedVersion + 1,
    updatedAt: Date.now(),
    ...(fresh ? { writeId } : {}),
  };

  const precondition = currentState.exists
    ? (currentState.updateTime
      ? `currentDocument.updateTime=${encodeURIComponent(currentState.updateTime)}`
      : 'currentDocument.exists=true')
    : 'currentDocument.exists=false';

  const patchUrl = `${firestoreDocUrl(cfg, 'families/default')}?${precondition}`;
  const response = await authedFetch(
    patchUrl,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(next) }),
      ...(keepalive ? { keepalive: true } : {}),
    },
    cfg,
    fetchImpl,
  );

  if (response.status === 409 || response.status === 412) {
    const latest = await readFamilyDocumentRaw(cfg, fetchImpl).catch(() => currentState);
    throw httpError('Family data changed on another device', 412, latest.doc);
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    if (response.status === 400 && body?.error?.status === 'FAILED_PRECONDITION') {
      const latest = await readFamilyDocumentRaw(cfg, fetchImpl).catch(() => currentState);
      throw httpError('Family data changed on another device', 412, latest.doc);
    }
    throw httpError(body?.error?.message || `Could not save family data (${response.status})`, response.status, body);
  }

  return next.version;
}

export function firebaseBeaconState() {
  // navigator.sendBeacon cannot carry Firebase Authorization headers; modern
  // browsers use fetch(..., { keepalive: true }) through firebaseSaveState.
  return false;
}

// ---- Lesson Cache (/families/default/lessons/{encodedKey}) ----

export async function firebaseLoadLesson(id, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const docId = encodeLessonKey(id);
  const response = await authedFetch(
    firestoreDocUrl(cfg, `families/default/lessons/${encodeURIComponent(docId)}`),
    { method: 'GET' },
    cfg,
    fetchImpl,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw httpError(`Could not load lesson (${response.status})`, response.status);
  const payload = await response.json();
  const decoded = fromFirestoreFields(payload?.fields || {});
  return decoded.payload ?? null;
}

export async function firebaseSaveLesson(id, value, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const docId = encodeLessonKey(id);
  const doc = { key: String(id), payload: value, updatedAt: Date.now() };
  const response = await authedFetch(
    firestoreDocUrl(cfg, `families/default/lessons/${encodeURIComponent(docId)}`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(doc) }),
    },
    cfg,
    fetchImpl,
  );
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not save lesson (${response.status})`, response.status, body);
  }
}

export async function firebaseListLessons(prefix, limit = 200, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const capped = Math.min(200, Math.max(1, Number.isInteger(limit) ? limit : 200));
  const response = await authedFetch(
    `${firestoreDocUrl(cfg, 'families/default/lessons')}?pageSize=200`,
    { method: 'GET' },
    cfg,
    fetchImpl,
  );
  if (response.status === 404) return [];
  if (!response.ok) throw httpError(`Could not list lessons (${response.status})`, response.status);
  const data = await response.json();
  const entries = (Array.isArray(data?.documents) ? data.documents : [])
    .map((doc) => fromFirestoreFields(doc?.fields || {}))
    .filter((entry) => typeof entry.key === 'string' && entry.key.startsWith(prefix))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.key.localeCompare(b.key))
    .slice(0, capped);
  return entries.map((entry) => ({ key: entry.key, savedAt: entry.updatedAt || 0 }));
}

// ---- Cloud Storage Voice Recordings (/families/default/audio/{encodedKey}) ----

function safeAudioType(raw) {
  if (typeof raw !== 'string') return null;
  const essence = raw.split(';', 1)[0].trim().toLowerCase();
  return SAFE_AUDIO_TYPES.has(essence) ? essence : null;
}

function storageObjectPath(name) {
  const encoded = encodeLessonKey(name);
  if (!encoded || encoded.length > 500) {
    throw httpError('Invalid recording identifier', 400);
  }
  return `families/default/audio/${encoded}`;
}

export async function firebaseSaveAudio(name, blob, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const contentType = safeAudioType(blob?.type);
  if (!contentType) {
    throw httpError('Unsupported audio format for Cloud Storage upload.', 415);
  }
  const objectName = storageObjectPath(name);
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(cfg.storageBucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await authedFetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: blob,
    },
    cfg,
    fetchImpl,
  );
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not save recording (${response.status})`, response.status, body);
  }
  return name;
}

export async function firebaseLoadAudio(name, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const objectName = storageObjectPath(name);
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(cfg.storageBucket)}/o/${encodeURIComponent(objectName)}?alt=media`;
  const response = await authedFetch(url, { method: 'GET' }, cfg, fetchImpl);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not load recording (${response.status})`, response.status, body);
  }
  return response.blob();
}

export async function firebaseDeleteAudio(name, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const objectName = storageObjectPath(name);
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(cfg.storageBucket)}/o/${encodeURIComponent(objectName)}`;
  const response = await authedFetch(url, { method: 'DELETE' }, cfg, fetchImpl);
  if (response.status === 404) return;
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not delete recording (${response.status})`, response.status, body);
  }
}

// ---- AI Settings (/families/default/settings/ai) & Redacted AI Chat ----

function plainHttpPublicHost(baseUrl) {
  let url;
  try {
    url = new URL(String(baseUrl || '').trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '[::1]';
}

function validTimeout(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_TIMEOUT_MS ? value : null;
}

function knownCapabilities(value) {
  return Array.isArray(value) ? AI_CAPABILITIES.filter((c) => value.includes(c)) : null;
}

function settingError(message) {
  return httpError(message, 400, { error: message });
}

function applyAiSettingsPatch(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw settingError('AI settings must be a JSON object');
  }
  const unknown = Object.keys(patch).filter((key) => !AI_SETTING_FIELDS.includes(key));
  if (unknown.length) throw settingError(`Unknown AI setting: ${unknown.join(', ')}`);
  const next = { ...current };
  const cleared = (value) => value === null || value === '' || (typeof value === 'string' && !value.trim());

  if ('baseUrl' in patch) {
    if (cleared(patch.baseUrl)) delete next.baseUrl;
    else {
      let url;
      try { url = new URL(String(patch.baseUrl).trim()); } catch { url = null; }
      if (typeof patch.baseUrl !== 'string' || !url || !['http:', 'https:'].includes(url.protocol)) {
        throw settingError('The base URL must be an http:// or https:// address');
      }
      if (url.username || url.password) throw settingError('Put the API key in its own field, not in the base URL');
      const trimmed = patch.baseUrl.trim().replace(/\/+$/, '');
      if (plainHttpPublicHost(trimmed)) {
        throw settingError('Use https:// for an AI provider outside your computer or home network');
      }
      next.baseUrl = trimmed;
    }
  }
  if ('model' in patch) {
    if (cleared(patch.model)) delete next.model;
    else if (typeof patch.model !== 'string' || patch.model.trim().length > MAX_MODEL || /[\u0000-\u001f]/.test(patch.model)) {
      throw settingError('The model must be a short name such as the one the provider lists');
    } else {
      next.model = patch.model.trim();
    }
  }
  if ('apiKey' in patch) {
    if (cleared(patch.apiKey)) delete next.apiKey;
    else if (typeof patch.apiKey !== 'string' || patch.apiKey.trim().length > MAX_API_KEY || /[\u0000-\u001f\s]/.test(patch.apiKey.trim())) {
      throw settingError(`The API key must be at most ${MAX_API_KEY} characters, without spaces`);
    } else {
      next.apiKey = patch.apiKey.trim();
    }
  }
  if ('timeoutMs' in patch) {
    if (patch.timeoutMs === null || patch.timeoutMs === undefined) delete next.timeoutMs;
    else if (!validTimeout(patch.timeoutMs)) throw settingError(`The timeout must be a whole number of milliseconds up to ${MAX_TIMEOUT_MS}`);
    else next.timeoutMs = patch.timeoutMs;
  }
  if ('capabilities' in patch) {
    if (patch.capabilities === null) delete next.capabilities;
    else if (!Array.isArray(patch.capabilities) || !patch.capabilities.every((c) => typeof c === 'string' && AI_CAPABILITIES.includes(c))) {
      throw settingError(`Capabilities must be a list drawn from: ${AI_CAPABILITIES.join(', ')}`);
    } else {
      next.capabilities = knownCapabilities(patch.capabilities);
    }
  }
  if (next.baseUrl && !next.model) throw settingError('Choose a model for this base URL');
  return next;
}

function resolveEffectiveAiSettings(stored) {
  const baseUrl = typeof stored?.baseUrl === 'string' ? stored.baseUrl.trim().replace(/\/+$/, '') : '';
  const model = typeof stored?.model === 'string' ? stored.model.trim() : '';
  const apiKey = typeof stored?.apiKey === 'string' ? stored.apiKey.trim() : '';
  const timeoutMs = validTimeout(stored?.timeoutMs) || DEFAULT_AI_TIMEOUT_MS;
  const capabilitySetting = knownCapabilities(stored?.capabilities) || [...AI_CAPABILITIES];
  const configured = Boolean(baseUrl && model);
  return {
    configured,
    aiSource: configured ? 'app' : 'none',
    capabilities: configured ? capabilitySetting : [],
    capabilitySetting,
    baseUrl,
    model,
    apiKey,
    timeoutMs,
    source: {
      baseUrl: baseUrl ? 'app' : 'none',
      model: model ? 'app' : 'none',
      apiKey: apiKey ? 'app' : 'none',
      timeoutMs: validTimeout(stored?.timeoutMs) ? 'app' : 'none',
      capabilities: knownCapabilities(stored?.capabilities) ? 'app' : 'none',
    },
  };
}

function publicAiSettings(settings) {
  const { apiKey } = settings;
  return {
    configured: settings.configured,
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutMs: settings.timeoutMs,
    capabilities: settings.capabilitySetting,
    hasApiKey: Boolean(apiKey),
    apiKeyHint: apiKey && apiKey.length >= 8 ? apiKey.slice(-4) : null,
    source: settings.source,
    presets: AI_PRESETS,
    canChange: true,
  };
}

async function readRawAiSettings(cfg, fetchImpl = globalThis.fetch) {
  const response = await authedFetch(
    firestoreDocUrl(cfg, 'families/default/settings/ai'),
    { method: 'GET' },
    cfg,
    fetchImpl,
  );
  if (response.status === 404) return {};
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not read AI settings (${response.status})`, response.status, body);
  }
  const payload = await response.json();
  return fromFirestoreFields(payload?.fields || {});
}

export async function firebaseLoadAiSettings(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const raw = await readRawAiSettings(cfg, fetchImpl);
  return publicAiSettings(resolveEffectiveAiSettings(raw));
}

export async function firebaseSaveAiSettings(patch, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const current = await readRawAiSettings(cfg, fetchImpl);
  const next = applyAiSettingsPatch(current, patch);
  const toStore = {
    ...(next.baseUrl ? { baseUrl: next.baseUrl } : {}),
    ...(next.model ? { model: next.model } : {}),
    ...(next.apiKey ? { apiKey: next.apiKey } : {}),
    ...(next.timeoutMs ? { timeoutMs: next.timeoutMs } : {}),
    ...(next.capabilities ? { capabilities: next.capabilities } : {}),
    updatedAt: Date.now(),
  };
  const response = await authedFetch(
    firestoreDocUrl(cfg, 'families/default/settings/ai'),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(toStore) }),
    },
    cfg,
    fetchImpl,
  );
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not save AI settings (${response.status})`, response.status, body);
  }
  return publicAiSettings(resolveEffectiveAiSettings(toStore));
}

export async function firebaseRemoveAiSettings(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const response = await authedFetch(
    firestoreDocUrl(cfg, 'families/default/settings/ai'),
    { method: 'DELETE' },
    cfg,
    fetchImpl,
  );
  if (!response.ok && response.status !== 404) {
    const body = await readErrorBody(response);
    throw httpError(body?.error?.message || `Could not remove AI settings (${response.status})`, response.status, body);
  }
  return publicAiSettings(resolveEffectiveAiSettings({}));
}

function completionContent(payload) {
  const choice = payload?.choices?.[0];
  if (!choice) return '';
  const content = choice.message?.content ?? choice.text;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    }).join('');
  }
  return content == null ? '' : String(content);
}

const FAILURES = {
  timeout: { httpStatus: 504, error: 'The AI provider timed out' },
  unreachable: { httpStatus: 502, error: 'The AI provider is unreachable' },
  failed: { httpStatus: 502, error: 'The AI provider failed' },
  invalid: { httpStatus: 502, error: 'The AI provider returned an invalid response' },
};
const TEST_ERRORS = {
  timeout: 'timed out',
  unreachable: 'unreachable',
  failed: 'provider error',
  invalid: 'invalid response',
};

async function runChatCompletion(settings, messages, fetchImpl = globalThis.fetch) {
  const started = performance.now();
  const fail = (kind, extra = {}) => ({
    ok: false,
    kind,
    ...FAILURES[kind],
    ...extra,
    latencyMs: Math.round(performance.now() - started),
  });
  const headers = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: settings.model, messages }),
      signal: controller.signal,
    });
  } catch (error) {
    return fail(error?.name === 'AbortError' ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    await response.text().catch(() => '');
    return fail('failed', { status: response.status });
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return fail('invalid');
  }
  return {
    ok: true,
    content: completionContent(payload),
    latencyMs: Math.round(performance.now() - started),
  };
}

export async function firebaseTestAiSettings(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const settings = resolveEffectiveAiSettings(await readRawAiSettings(cfg, fetchImpl));
  if (!settings.configured) return { ok: false, latencyMs: 0, error: 'not configured' };
  const result = await runChatCompletion(settings, [{ role: 'user', content: 'Reply with the single word OK.' }], fetchImpl);
  if (result.ok) return { ok: true, latencyMs: result.latencyMs };
  return {
    ok: false,
    latencyMs: result.latencyMs,
    ...(result.status ? { status: result.status } : {}),
    error: TEST_ERRORS[result.kind],
  };
}

function forwardableMessages(messages) {
  if (!Array.isArray(messages)) throw httpError('Request body must include a messages array', 400);
  return messages.map((message, index) => {
    const fail = (why) => { throw httpError(`Message ${index + 1} ${why}`, 400); };
    if (!message || typeof message !== 'object' || Array.isArray(message)) fail('is not an object');
    if ('tool_calls' in message) fail('has tool_calls, which Harrington does not send');
    if (!AI_ROLES.has(message.role)) fail('has a role other than system, user or assistant');
    if (typeof message.content !== 'string') fail('content must be a string');
    return { role: message.role, content: message.content };
  });
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function storedLearnerNames(doc) {
  const students = Array.isArray(doc?.students) ? doc.students : [];
  return students.map((s) => s?.name).filter((n) => typeof n === 'string' && n.trim());
}

function notePatterns(doc, names) {
  const pieces = new Set();
  const add = (piece) => {
    const text = piece.trim();
    if (text.length >= NOTE_MIN) pieces.add(text);
  };
  const records = doc?.records && typeof doc.records === 'object' ? doc.records : {};
  for (const list of Object.values(records)) {
    for (const record of Array.isArray(list) ? list : []) {
      if (typeof record?.note !== 'string') continue;
      const asStored = redactNames(record.note, names);
      const trimmed = redactNames(record.note.trim(), names);
      add(trimmed);
      for (const cut of NOTE_CUTS) {
        add(asStored.slice(0, cut));
        add(trimmed.slice(0, cut));
      }
      for (const line of trimmed.split('\n')) add(line);
    }
  }
  return [...pieces]
    .sort((a, b) => b.length - a.length)
    .map((piece) => new RegExp(piece.split(/\s+/).map(escapeRegExp).join('\\s+'), 'g'));
}

export async function firebaseChat(messages, capability, { includeNotes = false } = {}, cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  const settings = resolveEffectiveAiSettings(await readRawAiSettings(cfg, fetchImpl));
  if (!settings.configured) {
    throw httpError('AI is not configured', 503, { error: 'AI is not configured' });
  }
  if (typeof capability !== 'string' || !AI_CAPABILITIES.includes(capability)) {
    throw httpError('AI requests must name a known capability, so Harrington refused this one', 403);
  }
  if (!settings.capabilities.includes(capability)) {
    throw httpError(capabilityOffMessage(capability), 403, { error: capabilityOffMessage(capability), capability });
  }

  const validMessages = forwardableMessages(messages);
  const doc = await firebaseLoadState(cfg, fetchImpl);
  const names = storedLearnerNames(doc);
  const allowNotes = includeNotes === true && NOTE_CAPABILITIES.has(capability);
  const patterns = allowNotes ? [] : notePatterns(doc, names);

  const guarded = validMessages.map(({ role, content }) => {
    let text = names.length ? redactNames(content, names) : content;
    for (const pattern of patterns) text = text.replace(pattern, NOTE_REMOVED);
    return { role, content: text };
  });

  const result = await runChatCompletion(settings, guarded, fetchImpl);
  if (!result.ok) {
    throw httpError(result.error, result.httpStatus, { error: result.error });
  }
  return { content: result.content };
}

// ---- Health & Static Figures ----

export async function firebaseHealth(cfgOverride = null, fetchImpl = globalThis.fetch) {
  const cfg = activeFirebaseConfig(cfgOverride);
  installFirebaseFetchWrapper(cfg);
  await ensureFirebaseSession(cfg, fetchImpl);
  const [aiRaw, familyState] = await Promise.all([
    readRawAiSettings(cfg, fetchImpl).catch(() => ({})),
    readFamilyDocumentRaw(cfg, fetchImpl).catch(() => ({ doc: { version: 0 } })),
  ]);
  const ai = resolveEffectiveAiSettings(aiRaw);
  return {
    ok: true,
    mode: 'firebase',
    host: 'network',
    authEnabled: true,
    signedIn: true,
    aiConfigured: ai.configured,
    aiSource: ai.aiSource,
    aiCapabilities: ai.capabilities,
    notesOptInCount: 0,
    redaction: 'client',
    taxonomyCached: true,
    taxonomy: 'verified',
    stateVersion: familyState.doc.version || 0,
    backupAgeDays: null,
  };
}

export async function firebaseListFigures(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('/api/figures.json');
  if (!response.ok) throw httpError(`Could not load figures (${response.status})`, response.status);
  const body = await response.json();
  return body.figures;
}
