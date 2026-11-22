// The contract every "See how it works" page in src/figures/ meets (HAR-34,
// docs/FIGURES.md). A page is found by its file name alone: the server lists
// only the pages that pass figureProblems(), with the title and hint read
// from the page itself, so a page dropped into src/figures/ needs no other
// change. The build and the unit tests apply the same checks.
export const MAX_FIGURE_BYTES = 100 * 1024;
export const MAX_TITLE = 40;
export const MAX_HINT = 90;
export const MAX_LABEL = 20;

// Every page carries this pointer to the engine's MIT notice (the notice itself
// names the product, which may not appear in a page).
export const ENGINE_NOTICE = '/* Harrington figure engine (src/js/figures/engine.js). MIT License. Copyright (c) 2026 April Zhu;'
  + ' Copyright (c) 2026 Tolga Cohce. The full notice is in src/js/figures/engine.js and NOTICE. */';

// The Content-Security-Policy for a file the server serves from src/, given its
// path relative to src/ as resolved on disk. The app shell (index.html) locks
// scripts, styles, media, connections, form targets and frames to same-origin
// (plus inline styles and data:/blob: images/media needed by views and audio),
// so a figure cannot navigate its frame to another origin and any slipped
// markup cannot reach outside; every other HTML page, and anything under
// figures/, is a figure: inline script and style only, no network, framed only
// by Harrington and always sandboxed to an opaque origin. Compared without
// regard to case, because macOS and Windows serve figures/x.html for
// FIGURES/x.html too; a page that is not the shell is never left unsandboxed.
// SHA-256 hashes of the four static window.print() onload scripts written into
// about:blank print popups (which inherit the opener's CSP in Chromium).
export const PRINT_POPUP_SCRIPT_HASHES = [
  "'sha256-mtZeYD9sp61QVMbylSYVLiwSWCDgg7Ml/ZUhzoPfP0g='",
  "'sha256-MflXQyF1Am2ZOeVNyZFEa2MTRFNQFNdxaM0ISHjbfIg='",
  "'sha256-HvBgznNIiGNupYbOEQ00fWY+Fzo4MRqTIGIS5MQ+yM4='",
  "'sha256-jfEJ0YP2ipAFI2quYQk/vYDsJdnjoU3N+mvWk5AYdec='",
];

export const APP_CSP = [
  "default-src 'self'",
  `script-src 'self' ${PRINT_POPUP_SCRIPT_HASHES.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self'",
].join('; ');
export const FIGURE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-scripts',
].join('; ');
export function contentPolicyFor(relativePath) {
  const p = String(relativePath).replace(/\\/g, '/').toLowerCase();
  if (p === 'index.html') return APP_CSP;
  if (p.endsWith('.html') || p.endsWith('.htm') || p.startsWith('figures/')) return FIGURE_CSP;
  return null;
}

// src/figures/<topicId>.html, where the id is a taxonomy topic id.
const FILE = /^(mt_[A-Za-z0-9_-]{4,40})\.html$/;
export const figureIdOf = (fileName) => FILE.exec(fileName)?.[1] ?? null;

// Nothing in a page may reach outside it or credit anyone in the UI.
const FORBIDDEN = [
  [/https?:\/\//i, 'an http(s) URL'],
  // a protocol-relative address in a string, attribute or url(): '//host/x', src=//host, url(//host)
  [/["'`(=]\s*\/\/[^\s/"'`]/, 'a protocol-relative (//host) URL'],
  [/colorfigures/i, 'the name Colorfigures'],
  [/april-zhu/i, 'april-zhu'],
  [/made with/i, 'a "Made with" line'],
  [/<script[^>]*\ssrc\s*=/i, 'a <script src>'],
  [/<link\b/i, 'a <link> tag'],
  [/<(?:iframe|object|embed|base)\b/i, 'an <iframe>, <object>, <embed> or <base> tag'],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);

// The figure's title (<title>) and one-line hint (<meta name="description">).
export function figureMeta(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const hint = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i.exec(html)?.[1];
  return { title: title == null ? '' : decode(title).trim(), hint: hint == null ? '' : decode(hint).trim() };
}

// The part labels a page draws: every string literal in the text argument of
// tag(point, dx, dy, TEXT, on), so a plain 'BULB' and both labels of a
// conditional (st.cut ? 'CUT WIRE' : 'WIRE') count. A label built any other
// way (a variable, a template) is not seen, and the contract asks for literals.
export function figureLabels(html) {
  const labels = new Set();
  for (const call of html.matchAll(/\btag\(/g)) {
    // split the call's arguments at top-level commas, skipping strings and brackets
    const args = [];
    let depth = 0, quote = null, start = call.index + call[0].length;
    for (let i = start; i < html.length; i += 1) {
      const c = html[i];
      if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c)) { if (depth === 0) { args.push(html.slice(start, i)); break; } depth -= 1; }
      else if (c === ',' && depth === 0) { args.push(html.slice(start, i)); start = i + 1; }
    }
    for (const lit of (args[3] || '').matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)) labels.add(lit[1] ?? lit[2]);
  }
  return [...labels];
}

// Everything wrong with a page, as short phrases; [] when it meets the contract.
export function figureProblems(fileName, html) {
  const problems = [];
  if (!figureIdOf(fileName)) problems.push('the file name is not <topicId>.html');
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_FIGURE_BYTES) problems.push(`it is ${bytes} bytes (the limit is ${MAX_FIGURE_BYTES})`);
  const { title, hint } = figureMeta(html);
  if (!title || title.length > MAX_TITLE) problems.push(`the <title> must be 1 to ${MAX_TITLE} characters`);
  if (!hint || hint.length > MAX_HINT) problems.push(`the description hint must be 1 to ${MAX_HINT} characters`);
  for (const [pattern, what] of FORBIDDEN) if (pattern.test(html)) problems.push(`it has ${what}`);
  if (!html.includes(ENGINE_NOTICE)) problems.push('it lacks the engine notice line');
  if (!/\bmountFigure\(/.test(html)) problems.push('it does not call mountFigure()');
  const labels = figureLabels(html);
  if (labels.length < 3 || labels.length > 6) problems.push(`it has ${labels.length} labels (3 to 6)`);
  for (const label of labels) {
    if (!/^[A-Z]+(?: [A-Z]+)?$/.test(label)) problems.push(`the label "${label}" is not one or two words in capital letters A to Z`);
    else if (label.length > MAX_LABEL) problems.push(`the label "${label}" is longer than ${MAX_LABEL} characters`);
  }
  return problems;
}
