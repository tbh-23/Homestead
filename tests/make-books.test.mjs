// Command-line book generator (tools/decodable-books/make-books.mjs, HAR-67):
// selection flags, pre-flight decodability gate, shared print HTML with
// capitalised story names and Australian English copy, and safe file cleanup.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { BANK } from '../src/js/phonics/bank.js';
import {
  DEFAULT_OUT,
  bookPrintHtml,
  bookletFileName,
  cleanBookOutputs,
  flatFileName,
  parseArgs,
  resolveFontBase,
  selectBooks,
  verifyBooks,
} from '../tools/decodable-books/make-books.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'harrington-make-books-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

test('CLI flags select starter books by default, one stage, or the whole bank', () => {
  const def = parseArgs([]);
  assert.equal(def.mode, 'starter');
  assert.equal(def.outDir, DEFAULT_OUT);
  assert.deepEqual(selectBooks(def).map((b) => b.title), ['Tap, tap', 'Pip the cat', 'Caps']);

  const customOut = parseArgs(['/tmp/my-books']);
  assert.equal(customOut.outDir, resolve('/tmp/my-books'));

  const stage5 = parseArgs(['--stage', '5', '/tmp/stage5']);
  assert.equal(stage5.mode, 'stage');
  assert.equal(stage5.stage, 5);
  assert.ok(selectBooks(stage5).length >= 3);

  const stage11 = parseArgs(['--stage=11']);
  assert.equal(stage11.stage, 11);
  assert.ok(selectBooks(stage11).some((b) => b.title === 'A bee in a tree'));

  const all = parseArgs(['--all']);
  assert.equal(all.mode, 'all');
  assert.equal(selectBooks(all).length, BANK.length);
  assert.ok(BANK.length >= 33);

  assert.throws(() => parseArgs(['--stage', '0']), /1 to 11/);
  assert.throws(() => parseArgs(['--stage', '12']), /1 to 11/);
  assert.throws(() => parseArgs(['--all', '--stage', '2']), /not both/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
  assert.throws(() => parseArgs(['dir-a', 'dir-b']), /Unexpected extra argument/);
});

test('pre-flight check verifies every bank book and refuses undecodable text or titles', () => {
  const verified = verifyBooks(BANK);
  assert.equal(verified.length, BANK.length);

  const badPage = {
    id: 'bank-bad-page',
    title: 'Pat sat',
    graphemes: ['s', 'a', 't', 'p'],
    tricky: [],
    pages: [{ text: 'Pat sat on a train.', scene: [] }],
  };
  assert.throws(() => verifyBooks([badPage]), /Nothing printed\. Pat sat: not decodable with s a t p: on, train/);

  const badTitle = {
    id: 'bank-bad-title',
    title: 'Pat on a boat',
    graphemes: ['s', 'a', 't', 'p'],
    tricky: [],
    pages: [{ text: 'Pat sat.', scene: [] }],
  };
  assert.throws(() => verifyBooks([badTitle]), /Nothing printed\. Pat on a boat: not decodable with s a t p: on, boat/);
});

test('font resolution and print HTML share bookprint.js with capitalised names', () => {
  const fontBase = resolveFontBase();
  assert.match(fontBase, /^file:\/\/.*@fontsource\/andika\/files\/$/);
  assert.throws(
    () => resolveFontBase(() => { throw new Error('missing'); }),
    /The reading font is missing.*@fontsource\/andika/,
  );

  const starters = selectBooks(parseArgs([]));
  const [tap, pip, caps] = starters;

  const tapBooklet = bookPrintHtml(tap, { layout: 'booklet', fontBase });
  assert.doesNotMatch(tapBooklet, /window\.print/);
  assert.match(tapBooklet, /url\(file:\/\/.*andika-latin-400-normal\.woff2\)/);
  assert.match(tapBooklet, /Words to sound out<\/h2>\s*<p class="words">a at Pat sat tap taps<\/p>/);
  assert.match(tapBooklet, /Colour the pictures in together\./);

  const pipFlat = bookPrintHtml(pip, { layout: 'flat', fontBase });
  assert.match(pipFlat, /Words to sound out<\/h2>\s*<p class="words">[^<]*\bPip\b[^<]*\bTim\b[^<]*<\/p>/);
  assert.doesNotMatch(pipFlat, /Words to sound out<\/h2>\s*<p class="words">[^<]*\b(pip|tim)\b/);

  const capsFlat = bookPrintHtml(caps, { layout: 'flat', fontBase });
  assert.match(capsFlat, /Words to sound out<\/h2>\s*<p class="words">[^<]*\bPip\b[^<]*\bSam\b[^<]*\bTim\b[^<]*<\/p>/);
});

test('safe cleanup deletes only owned and legacy book PDFs, preserving unrelated files', () => {
  const out = join(scratch, 'safe-clean');
  const starters = selectBooks(parseArgs([]));
  const dot = BANK.find((b) => b.title === 'Dot the dog');
  const files = [
    flatFileName(starters[0]),
    bookletFileName(starters[0]),
    'book-1-tap-tap-flat-A5.pdf',
    'book-1-tap-tap-booklet-A4-print-double-sided-short-edge-flip.pdf',
    '01-tap-tap-booklet-A4.pdf',
    flatFileName(dot),
    'unrelated.pdf',
    'family-notes.pdf',
    'readme.txt',
  ];
  mkdirSyncOut(out, files);

  assert.equal(flatFileName(starters[0]), 'set-01-tap-tap-A5.pdf');
  assert.equal(bookletFileName(starters[0]), 'set-01-tap-tap-booklet-A4-flip-short-edge.pdf');

  cleanBookOutputs(out, starters);

  assert.ok(!existsSync(join(out, flatFileName(starters[0]))));
  assert.ok(!existsSync(join(out, bookletFileName(starters[0]))));
  assert.ok(!existsSync(join(out, 'book-1-tap-tap-flat-A5.pdf')));
  assert.ok(!existsSync(join(out, 'book-1-tap-tap-booklet-A4-print-double-sided-short-edge-flip.pdf')));
  assert.ok(!existsSync(join(out, '01-tap-tap-booklet-A4.pdf')));

  // Unselected bank books and unrelated PDFs/files remain untouched.
  assert.deepEqual(
    readdirSync(out).sort(),
    ['family-notes.pdf', 'readme.txt', flatFileName(dot), 'unrelated.pdf'].sort(),
  );
});

function mkdirSyncOut(dir, names) {
  rmSync(dir, { recursive: true, force: true });
  const created = mkdtempSync(join(scratch, 'dir-'));
  rmSync(created, { recursive: true, force: true });
  for (const name of names) {
    const p = join(dir, name);
    writeFileSync(mkdirParent(dir, p), 'stub');
  }
}

function mkdirParent(dir, filePath) {
  if (!existsSync(dir)) {
    // Node's writeFileSync needs the directory created first.
    writeDir(dir);
  }
  return filePath;
}

import { mkdirSync } from 'node:fs';
function writeDir(dir) {
  mkdirSync(dir, { recursive: true });
}
