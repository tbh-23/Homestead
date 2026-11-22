// The AI provider: where its settings come from, and one chat completion
// against an OpenAI-compatible endpoint. Shared by server.mjs (/api/ai, the
// settings page and its connection test) and scripts/ai-experiment.mjs, so
// there is one implementation. Dependency-free.
//
// Failures come back as a fixed kind and message: never the API key, a
// request header, or the provider's response body.
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { AI_CAPABILITIES, parseCapabilities } from '../src/js/ai-capabilities.js';

export const DEFAULT_AI_TIMEOUT_MS = 180_000;
export const MAX_TIMEOUT_MS = 3_600_000;

const LOCAL_DOMAIN_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home.arpa',
  '.ts.net',
  '.test',
  '.invalid',
  '.example',
];

function isPrivateIpv4(octets) {
  const [a, b] = octets;
  if (a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function parseIpv4Octets(host) {
  if (isIP(host) !== 4) return null;
  return host.split('.').map((part) => Number.parseInt(part, 10));
}

function isPrivateOrLocalIpv6(ip) {
  if (ip === '::1') return true;
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (mapped) {
    const hi = Number.parseInt(mapped[1], 16);
    const lo = Number.parseInt(mapped[2], 16);
    return isPrivateIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  if (ip.startsWith('::')) return false;
  const firstWord = Number.parseInt(ip.split(':', 1)[0], 16);
  if (!Number.isFinite(firstWord)) return false;
  // Unique local addresses (fc00::/7) and link-local addresses (fe80::/10).
  return (firstWord & 0xfe00) === 0xfc00 || (firstWord & 0xffc0) === 0xfe80;
}

function isPrivateOrLocalHost(rawHost) {
  const host = String(rawHost || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) {
    const ip = host.slice(1, -1);
    return isIP(ip) === 6 && isPrivateOrLocalIpv6(ip);
  }
  const ipv4 = parseIpv4Octets(host);
  if (ipv4) return isPrivateIpv4(ipv4);
  if (isIP(host) === 6) return isPrivateOrLocalIpv6(host);
  if (host === 'localhost' || host === 'host.docker.internal' || host === 'gateway.docker.internal') return true;
  if (!host.includes('.')) return true;
  return LOCAL_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// True when baseUrl uses plain http:// against a public host rather than
// loopback, a Docker service alias, a private/CGNAT address, or a local domain.
export function plainHttpPublicHost(baseUrl) {
  let url;
  try {
    url = new URL(String(baseUrl || '').trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  return !isPrivateOrLocalHost(url.hostname);
}

const warnedPlainHttp = new Set();
function warnPlainHttp(where, baseUrl) {
  let target = baseUrl;
  try {
    target = new URL(baseUrl).origin;
  } catch {}
  const key = `${where}:${target}`;
  if (warnedPlainHttp.has(key)) return;
  warnedPlainHttp.add(key);
  console.warn(`Ignoring ${where} AI base URL (${target}) because plain http:// is only allowed on local or private networks; use https:// instead.`);
}

const nonEmpty = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
export const validTimeout = (value) => (Number.isInteger(value) && value > 0 && value <= MAX_TIMEOUT_MS ? value : null);
export const knownCapabilities = (value) => (Array.isArray(value) ? AI_CAPABILITIES.filter((c) => value.includes(c)) : null);

// The settings saved from the app (secrets.json in the data dir), cleaned.
// A missing file is empty; an unreadable one is empty too and reported to
// `onProblem` with a reason, never its content.
export async function readStoredAiSettings(file, onProblem = () => {}) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') onProblem('could not be read');
    return {};
  }
  let ai;
  try {
    ai = JSON.parse(raw)?.ai;
  } catch {
    onProblem('is not valid JSON');
    return {};
  }
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return {};
  const out = {};
  const baseUrl = nonEmpty(ai.baseUrl).replace(/\/+$/, '');
  if (baseUrl) {
    if (plainHttpPublicHost(baseUrl)) {
      onProblem('uses plain http:// for a public host');
      warnPlainHttp('stored', baseUrl);
    } else {
      out.baseUrl = baseUrl;
    }
  }
  if (nonEmpty(ai.model)) out.model = nonEmpty(ai.model);
  if (nonEmpty(ai.apiKey)) out.apiKey = nonEmpty(ai.apiKey);
  if (validTimeout(ai.timeoutMs)) out.timeoutMs = ai.timeoutMs;
  if (knownCapabilities(ai.capabilities)) out.capabilities = knownCapabilities(ai.capabilities);
  return out;
}

// The effective settings: each stored value wins over its HARRINGTON_AI_*
// variable. `source` says where each came from: "app", "env" or "none".
export function resolveAiSettings(stored, env) {
  const envText = (name) => String(env[name] || '').trim();
  const safeUrl = (where, value) => {
    const cleaned = nonEmpty(value).replace(/\/+$/, '');
    if (!cleaned) return '';
    if (plainHttpPublicHost(cleaned)) {
      warnPlainHttp(where, cleaned);
      return '';
    }
    return cleaned;
  };
  const safeStoredBaseUrl = safeUrl('stored', stored?.baseUrl);
  const safeEnvBaseUrl = safeUrl('environment', envText('HARRINGTON_AI_BASE_URL'));
  const source = {};
  const pick = (field, envValue, storedValue = stored[field]) => {
    if (storedValue) { source[field] = 'app'; return storedValue; }
    source[field] = envValue ? 'env' : 'none';
    return envValue;
  };
  const baseUrl = pick('baseUrl', safeEnvBaseUrl, safeStoredBaseUrl);
  const model = pick('model', envText('HARRINGTON_AI_MODEL'));
  const apiKey = pick('apiKey', envText('HARRINGTON_AI_API_KEY'));
  const envTimeout = validTimeout(Number.parseInt(envText('HARRINGTON_AI_TIMEOUT_MS'), 10));
  source.timeoutMs = stored.timeoutMs ? 'app' : envTimeout ? 'env' : 'none';
  source.capabilities = stored.capabilities ? 'app' : envText('HARRINGTON_AI_CAPABILITIES') ? 'env' : 'none';
  const capabilitySetting = stored.capabilities || parseCapabilities(env.HARRINGTON_AI_CAPABILITIES).enabled;
  const configured = Boolean(baseUrl && model);
  return {
    configured,
    aiSource: configured ? source.baseUrl : 'none',
    // Nothing is switched on without a provider.
    capabilities: configured ? capabilitySetting : [],
    capabilitySetting,
    baseUrl,
    model,
    apiKey,
    timeoutMs: stored.timeoutMs || envTimeout || DEFAULT_AI_TIMEOUT_MS,
    source,
  };
}

const FAILURES = {
  timeout: { httpStatus: 504, error: 'The AI provider timed out' },
  unreachable: { httpStatus: 502, error: 'The AI provider is unreachable' },
  failed: { httpStatus: 502, error: 'The AI provider failed' },
  invalid: { httpStatus: 502, error: 'The AI provider returned an invalid response' },
};

export function completionContent(payload) {
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

// settings: { baseUrl (no trailing slash), model, apiKey, timeoutMs }.
// Resolves to { ok: true, content, usage, latencyMs } or
// { ok: false, kind, httpStatus, error, status?, latencyMs }, where `status`
// is the provider's HTTP status when it answered with an error.
export async function chatCompletion(settings, messages, { fetchImpl = globalThis.fetch } = {}) {
  const started = performance.now();
  const fail = (kind, extra = {}) => ({ ok: false, kind, ...FAILURES[kind], ...extra, latencyMs: Math.round(performance.now() - started) });

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
    usage: payload?.usage || null,
    latencyMs: Math.round(performance.now() - started),
  };
}
