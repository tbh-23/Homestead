// Printable decodable books from the command line (HAR-45, unified in HAR-67).
// Thin CLI wrapper over the app's own phonics modules (src/js/phonics/) and
// print document (src/js/views/bookprint.js), so the command-line PDFs and the
// in-app print view share one decodability gate, one picture library and one
// layout.
//
//   node tools/decodable-books/make-books.mjs [output-folder]
//   node tools/decodable-books/make-books.mjs --stage 5 [output-folder]
//   node tools/decodable-books/make-books.mjs --all [output-folder]
//
// Defaults to the three starter books (Tap, tap; Pip the cat; Caps) in
// decodable-books/ at the repository root (gitignored). Writes, per book, an
// A4 booklet (*-booklet-A4-flip-short-edge.pdf: print double-sided, flip on
// the short edge, fold and staple) and a flat A5 copy (*-A5.pdf). Every word,
// title included, is checked against the book's sounds and tricky words before
// any file is removed or written; only this script's own filenames are ever
// removed from the output folder.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BANK } from '../../src/js/phonics/bank.js';
import { checkBook } from '../../src/js/phonics/decodability.js';
import { bookFacts, bookStage } from '../../src/js/phonics/reading.js';
import { DEFAULT_SEQUENCE, makeCode, sequenceById } from '../../src/js/phonics/sequence.js';
import { ANDIKA_FILES, bookPrintDocument } from '../../src/js/views/bookprint.js';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = resolve(HERE, '..', '..', 'decodable-books');
export const STARTER_IDS = ['bank-tap-tap', 'bank-pip-the-cat', 'bank-caps'];
export const PRINT_TIP = 'print double-sided, flip on the short edge, then fold and staple';

const STAGE_COUNT = sequenceById(DEFAULT_SEQUENCE).stages.length;
const USAGE = `Usage: node tools/decodable-books/make-books.mjs [--all | --stage <1..${STAGE_COUNT}>] [output-folder]`;

export function parseArgs(argv = [], defaultOut = DEFAULT_OUT) {
  let mode = 'starter';
  let stage = null;
  let outArg = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') {
      if (mode !== 'starter') throw new Error(`Choose either --all or --stage, not both.\n${USAGE}`);
      mode = 'all';
    } else if (arg === '--stage' || arg.startsWith('--stage=')) {
      if (mode !== 'starter') throw new Error(`Choose either --all or --stage, not both.\n${USAGE}`);
      const raw = arg === '--stage' ? argv[++i] : arg.slice('--stage='.length);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > STAGE_COUNT) {
        throw new Error(`--stage expects a whole number from 1 to ${STAGE_COUNT} (got "${raw ?? ''}").\n${USAGE}`);
      }
      mode = 'stage';
      stage = n;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, mode, stage, outDir: resolve(defaultOut) };
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option "${arg}".\n${USAGE}`);
    } else if (outArg === null) {
      outArg = arg;
    } else {
      throw new Error(`Unexpected extra argument "${arg}".\n${USAGE}`);
    }
  }
  return { help: false, mode, stage, outDir: outArg ? resolve(outArg) : resolve(defaultOut) };
}

export function selectBooks({ mode = 'starter', stage = null } = {}, bank = BANK) {
  if (mode === 'all') return [...bank];
  if (mode === 'stage') return bank.filter((b) => bookStage(b) === stage);
  return STARTER_IDS.map((id) => {
    const found = bank.find((b) => b.id === id);
    if (!found) throw new Error(`Starter book "${id}" is missing from BANK.`);
    return found;
  });
}

export const slugOf = (book) => String(book.id || '').replace(/^bank-/, '');
export const stemOf = (book) => `set-${String(bookStage(book)).padStart(2, '0')}-${slugOf(book)}`;
export const flatFileName = (book) => `${stemOf(book)}-A5.pdf`;
export const bookletFileName = (book) => `${stemOf(book)}-booklet-A4-flip-short-edge.pdf`;

// Earlier CLI versions wrote unprefixed, book-N-* or 0N-* PDF names for the
// three starter books; remove those exact names too when refreshing a folder.
export function ownedFileNamesFor(book) {
  const slug = slugOf(book);
  const names = new Set([
    flatFileName(book),
    bookletFileName(book),
    `${slug}-A5.pdf`,
    `${slug}-flat-A5.pdf`,
    `${slug}-booklet-A4-flip-short-edge.pdf`,
    `${slug}-booklet-A4.pdf`,
    `${book.id}-flat-A5.pdf`,
    `${book.id}-booklet-A4.pdf`,
    `${book.id}-booklet-A4-print-double-sided-short-edge-flip.pdf`,
  ]);
  const starterIndex = STARTER_IDS.indexOf(book.id);
  if (starterIndex !== -1) {
    const n = starterIndex + 1;
    const pad = String(n).padStart(2, '0');
    for (const prefix of [`book-${n}-${slug}`, `${pad}-${slug}`]) {
      names.add(`${prefix}-A5.pdf`);
      names.add(`${prefix}-flat-A5.pdf`);
      names.add(`${prefix}-booklet-A4.pdf`);
      names.add(`${prefix}-booklet-A4-flip-short-edge.pdf`);
      names.add(`${prefix}-booklet-A4-print-double-sided-short-edge-flip.pdf`);
    }
  }
  return [...names];
}

export function cleanBookOutputs(outDir, books) {
  for (const book of books) {
    for (const name of ownedFileNamesFor(book)) {
      rmSync(join(outDir, name), { force: true });
    }
  }
}

// Self-test the checker first, then check every selected book before any file
// in the output folder is removed or written.
export function verifyBooks(books) {
  const set1 = makeCode({ graphemes: ['s', 'a', 't', 'p'] });
  const textProbe = checkBook({ title: 'Pat', pages: [{ text: 'Pat sat on a mat.' }] }, set1);
  const titleProbe = checkBook({ title: 'Pat on a mat', pages: [{ text: 'Pat sat.' }] }, set1);
  if (textProbe.ok || textProbe.failing.join(', ') !== 'on, mat'
    || titleProbe.ok || titleProbe.failing.join(', ') !== 'on, mat') {
    throw new Error('Checker self-test failed: it let a word outside the code through.');
  }
  if (!books.length) throw new Error('Nothing printed. No books matched the selection.');
  return books.map((book) => {
    const code = makeCode({
      graphemes: book.graphemes || [],
      tricky: book.tricky || [],
      clusters: !!book.clusters,
    });
    const result = checkBook(book, code);
    if (!result.ok) {
      throw new Error(`Nothing printed. ${book.title}: not decodable with ${(book.graphemes || []).join(' ')}: ${result.failing.join(', ')}`);
    }
    return { book, facts: bookFacts(book) };
  });
}

export function resolveFontBase(resolveFn = require.resolve) {
  try {
    const file400 = resolveFn(`@fontsource/andika/files/${ANDIKA_FILES[400]}`);
    resolveFn(`@fontsource/andika/files/${ANDIKA_FILES[700]}`);
    return new URL('./', pathToFileURL(file400)).href;
  } catch {
    throw new Error('The reading font is missing. Run npm install (or npm install --no-save @fontsource/andika).');
  }
}

export function bookPrintHtml(book, { layout = 'booklet', fontBase = resolveFontBase() } = {}) {
  return bookPrintDocument(book, { layout, fontBase, autoPrint: false });
}

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

async function launchBrowser() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch {
    throw new Error('Playwright is missing. Run npm install (or npm ci) in the repository first.');
  }
  const tries = process.env.CHROME ? [process.env.CHROME] : [null, ...BROWSERS.filter((p) => existsSync(p))];
  let lastError = '';
  for (const executablePath of tries) {
    try { return await chromium.launch(executablePath ? { executablePath } : {}); } catch (e) {
      lastError = `${executablePath ?? "Playwright's Chromium"}: ${String(e?.message ?? e).split('\n')[0]}`;
    }
  }
  throw new Error(
    `Could not start a browser to make the PDFs${process.env.CHROME ? ` (CHROME=${process.env.CHROME} did not start)` : ''}. `
    + (lastError ? `Last launch error: ${lastError}. ` : '')
    + 'Either point the script at a Chrome or Chromium you already have, for example '
    + 'CHROME=<path to a Chrome or Chromium binary> node tools/decodable-books/make-books.mjs, '
    + 'or install the browser Playwright uses with: npx playwright install chromium',
  );
}

async function renderPdf(page, scratchDir, name, html, pdfOptions) {
  const htmlPath = join(scratchDir, name);
  writeFileSync(htmlPath, html, 'utf8');
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 30pt Andika'),
      document.fonts.load('700 40pt Andika'),
    ]);
  });
  await page.pdf(pdfOptions);
}

export async function runCli(argv = process.argv.slice(2), log = console.log) {
  const opts = parseArgs(argv);
  if (opts.help) {
    log(USAGE);
    return;
  }
  const selected = selectBooks(opts);
  const checked = verifyBooks(selected);
  const fontBase = resolveFontBase();
  log('checker self-test: refuses "on" and "mat" for set 1, in the text and in a title');

  const browser = await launchBrowser();
  const scratchDir = mkdtempSync(join(tmpdir(), 'harrington-make-books-'));
  try {
    mkdirSync(opts.outDir, { recursive: true });
    cleanBookOutputs(opts.outDir, selected);
    const page = await browser.newPage();
    for (const { book, facts } of checked) {
      const slug = stemOf(book);
      await renderPdf(
        page,
        scratchDir,
        `${slug}-flat.html`,
        bookPrintHtml(book, { layout: 'flat', fontBase }),
        { path: join(opts.outDir, flatFileName(book)), width: '148mm', height: '210mm', printBackground: true, preferCSSPageSize: true },
      );
      await renderPdf(
        page,
        scratchDir,
        `${slug}-booklet.html`,
        bookPrintHtml(book, { layout: 'booklet', fontBase }),
        { path: join(opts.outDir, bookletFileName(book)), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true },
      );
      log(`${book.title}: decodable, words: ${facts.words.join(' ')}`);
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
    await browser.close();
  }
  log(`\nPDFs in ${opts.outDir}\nBooklets (A4): ${PRINT_TIP}. Flat copies (A5): print as they are.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
