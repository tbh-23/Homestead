// Printing a decodable book (views/bookprint.js, HAR-45): both layouts, the
// page and sheet counts, black ink, Andika, the cover's owner line only when
// asked for, and every text escaped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANK } from '../src/js/phonics/bank.js';
import { generateBook } from '../src/js/phonics/generator.js';
import { knownCode } from '../src/js/phonics/reading.js';
import { ANDIKA_FILES, bookPages, bookPrintDocument } from '../src/js/views/bookprint.js';

const tap = BANK.find((b) => b.title === 'Tap, tap');
const styleOf = (html) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('flat: one A5 page per sheet, in reading order, eight pages', () => {
  const html = bookPrintDocument(tap, { layout: 'flat', autoPrint: false });
  assert.match(styleOf(html), /@page\{size:A5 portrait;margin:0\}/);
  const pages = [...html.matchAll(/<section class="page ([a-z]+)" data-page="(\d+)"/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(pages, [['cover', 1], ['story', 2], ['story', 3], ['story', 4], ['story', 5], ['story', 6], ['story', 7], ['back', 8]]);
  assert.doesNotMatch(html, /class="sheet"/);
  assert.match(html, /<title>Tap, tap \(flat\)<\/title>/);
});

test('booklet: A4 landscape sides of two pages in imposition order', () => {
  const html = bookPrintDocument(tap, { layout: 'booklet', autoPrint: false });
  assert.match(styleOf(html), /@page\{size:A4 landscape;margin:0\}/);
  const sheets = [...html.matchAll(/<div class="sheet" data-pages="(\d+),(\d+)">/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(sheets, [[8, 1], [2, 7], [6, 3], [4, 5]]);
  // The page inside each side is the one named.
  const first = html.slice(html.indexOf('data-pages="8,1"'));
  assert.ok(first.indexOf('data-page="8"') < first.indexOf('data-page="1"'));
  // The folding note shows on screen only.
  assert.match(html, /<p class="note">Print double-sided, flip on the short edge; fold; staple\.<\/p>/);
  assert.match(styleOf(html), /@media print\{\.note\{display:none\}\}/);
});

test('a ten-page story is a twelve-page booklet on six sides', () => {
  const made = generateBook(knownCode({ graphemes: ['s', 'a', 't', 'p', 'i', 'm', 'f', 'c'] }), { pages: 10, seed: 9 });
  assert.equal(bookPages(made).length, 12);
  const html = bookPrintDocument(made, { layout: 'booklet', autoPrint: false });
  assert.equal(html.match(/<div class="sheet"/g).length, 6);
  assert.match(html, /data-pages="12,1"/);
  assert.match(html, /<p class="num">11<\/p>/);
  assert.equal(bookPrintDocument(made, { layout: 'flat', autoPrint: false }).match(/<section class="page /g).length, 12);
});

test('cover, numbered story pages and the back page', () => {
  const html = bookPrintDocument(tap, { layout: 'flat', autoPrint: false });
  assert.match(html, /<h1>Tap, tap<\/h1>/);
  assert.match(html, /<p class="sounds">Sounds: s a t p<\/p>/);
  assert.match(html, /This book belongs to <span class="line"><\/span>/);
  for (let n = 2; n <= 7; n += 1) assert.match(html, new RegExp(`<p class="num">${n}</p>`));
  assert.doesNotMatch(html, /<p class="num">(1|8)<\/p>/, 'no number on the covers');
  assert.match(html, /<p class="text">Pat taps a tap\.<\/p>/);
  const back = html.slice(html.indexOf('class="page back"'));
  assert.match(back, /Sounds in this book<\/h2>\s*<p class="big">s a t p<\/p>/);
  // Names keep their capital, as the tip below says they are read.
  assert.match(back, /Words to sound out<\/h2>\s*<p class="words">a at Pat sat tap taps<\/p>/);
  assert.doesNotMatch(back, /Tricky words/, 'no tricky words in this one');
  assert.match(back, /Reading it together/);
  assert.match(back, /Colour the pictures in together\./);
  const pip = bookPrintDocument(BANK.find((b) => b.title === 'Pip the cat'), { layout: 'flat', autoPrint: false });
  assert.match(pip, /Tricky words<\/h2><p class="words">the is<\/p>/);
  // Every page has its picture.
  assert.equal(html.match(/<svg /g).length, 7);
});

test('the cover lists only the practice sounds the book uses', () => {
  // Asked to practice w and sh at set 7, a book that has no sh word says only w.
  const asked = { ...tap, focus: ['s', 'sh', 'w'] };
  assert.match(bookPrintDocument(asked, { autoPrint: false }), /<p class="sounds">Sounds: s<\/p>/);
  // A focus it does not use at all: the cover lists the book's own sounds.
  assert.match(bookPrintDocument({ ...tap, focus: ['ch'] }, { autoPrint: false }), /<p class="sounds">Sounds: s a t p<\/p>/);
});

test('the learner\'s name is on the cover only when given, and escaped', () => {
  const named = bookPrintDocument(tap, { layout: 'booklet', ownerName: 'Rowan <b>Example</b>', autoPrint: false });
  assert.match(named, /This book belongs to <span class="line">Rowan &lt;b&gt;Example&lt;\/b&gt;<\/span>/);
  assert.doesNotMatch(bookPrintDocument(tap, { autoPrint: false }), /Rowan/);
  const evil = { ...tap, title: '<img src=x onerror=alert(1)>', pages: [{ text: '<script>x</script>', scene: [] }, ...tap.pages.slice(1)] };
  const html = bookPrintDocument(evil, { autoPrint: false });
  assert.doesNotMatch(html, /<img|<script>x/);
  assert.match(html, /&lt;img src=x/);
});

test('black ink only, Andika at about 30 pt, nothing under 11 pt', () => {
  const html = bookPrintDocument(tap, { fontBase: '/vendor/fonts/', autoPrint: false });
  const style = styleOf(html);
  assert.match(style, new RegExp(`url\\(/vendor/fonts/${ANDIKA_FILES[400]}\\)`));
  assert.match(style, new RegExp(`url\\(/vendor/fonts/${ANDIKA_FILES[700]}\\)`));
  assert.match(style, /body\{font-family:Andika/);
  assert.match(style, /\.text\{font-size:30pt/);
  const sizes = [...style.matchAll(/font-size:(\d+(?:\.\d+)?)pt/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...sizes) >= 11, `smallest ${Math.min(...sizes)} pt`);
  // Print colors: black and white; the screen-only preview may use grey.
  const printCss = style.replace(/@media screen\{.*?\}\}/s, '');
  const colors = new Set([...printCss.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => m[0].toLowerCase()));
  assert.deepEqual([...colors].sort(), ['#000', '#fff']);
  for (const m of html.matchAll(/(?:fill|stroke)="(#[0-9a-f]+)"/gi)) assert.ok(['#000', '#fff'].includes(m[1].toLowerCase()));
});

test('the print dialog opens only when asked', () => {
  assert.match(bookPrintDocument(tap), /window\.print\(\)/);
  assert.doesNotMatch(bookPrintDocument(tap, { autoPrint: false }), /window\.print/);
});
