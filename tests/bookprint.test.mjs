// Printing decodable books, A4 Practise Sheets, A4 Fluency Story Sheets and
// A4 Fluency Workbooks (views/bookprint.js, phonics/workbook.js, HAR-45, HAR-70):
// both A5 layouts, A4 portrait workbook & sheets, sound-button cues, black ink,
// Andika >= 11 pt, owner line only when asked, CSP hash parity, and XSS escaping.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { PRINT_POPUP_SCRIPT_HASHES } from '../src/js/figures/contract.js';
import { BANK } from '../src/js/phonics/bank.js';
import { checkWord } from '../src/js/phonics/decodability.js';
import { generateBook } from '../src/js/phonics/generator.js';
import { knownCode } from '../src/js/phonics/reading.js';
import { DEFAULT_SEQUENCE, defaultTricky, makeCode, sequenceById } from '../src/js/phonics/sequence.js';
import { graphemeButtons, practiseSheetData, workbookPlan } from '../src/js/phonics/workbook.js';
import {
  ANDIKA_FILES,
  bookPages,
  bookPrintDocument,
  practiseSheetDocument,
  storySheetDocument,
  workbookPrintDocument,
} from '../src/js/views/bookprint.js';

const tap = BANK.find((b) => b.title === 'Tap, tap');
const pip = BANK.find((b) => b.title === 'Pip the cat');
const styleOf = (html) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function assertPureBlackAndWhiteAndika(html, { require30ptText = false } = {}) {
  const style = styleOf(html);
  assert.match(style, new RegExp(`url\\(/vendor/fonts/${ANDIKA_FILES[400]}\\)`));
  assert.match(style, new RegExp(`url\\(/vendor/fonts/${ANDIKA_FILES[700]}\\)`));
  assert.match(style, /body\{font-family:Andika/);
  if (require30ptText) assert.match(style, /\.text\{font-size:30pt/);
  const sizes = [...style.matchAll(/font-size:(\d+(?:\.\d+)?)pt/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0 && Math.min(...sizes) >= 11, `smallest ${Math.min(...sizes)} pt`);
  // Print colours: strictly black and white; screen-only preview may use grey.
  const printCss = style.replace(/@media screen\{.*?\}\}/s, '');
  const colors = new Set([...printCss.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => m[0].toLowerCase()));
  assert.deepEqual([...colors].sort(), ['#000', '#fff']);
  for (const m of html.matchAll(/(?:fill|stroke)="(#[0-9a-f]+)"/gi)) {
    assert.ok(['#000', '#fff'].includes(m[1].toLowerCase()), `unexpected SVG colour ${m[1]}`);
  }
}

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

test('cover, numbered story pages and upgraded workbook-style back page', () => {
  const html = bookPrintDocument(tap, { layout: 'flat', autoPrint: false });
  assert.match(html, /<div class="cover-frame">/);
  assert.match(html, /<h1>Tap, tap<\/h1>/);
  assert.match(html, /<p class="sounds">Sounds: s a t p<\/p>/);
  assert.match(html, /This book belongs to <span class="line"><\/span>/);
  for (let n = 2; n <= 7; n += 1) assert.match(html, new RegExp(`<p class="num">${n}</p>`));
  assert.doesNotMatch(html, /<p class="num">(1|8)<\/p>/, 'no number on the covers');
  assert.match(html, /<p class="text">Pat taps a tap\.<\/p>/);

  const back = html.slice(html.indexOf('class="page back"'));
  assert.match(back, /Warm up &amp; Sounds/);
  assert.match(back, /Sounds in this book<\/h2>\s*<div class="tile-row"><span class="tile">s<\/span><span class="tile">a<\/span><span class="tile">t<\/span><span class="tile">p<\/span><\/div>/);
  // Names keep their capital in the workbook word grid, with sound buttons on by default.
  assert.match(back, /Words to sound out<\/h2>\s*<table class="word-grid"/);
  assert.match(back, /aria-label="Pat"/);
  assert.match(back, /aria-label="taps"/);
  assert.match(back, /class="sb-dot"/);
  assert.doesNotMatch(back, /Tricky words/, 'no tricky words in this one');
  assert.match(back, /Sound it\. Blend it\. — Reading it together/);
  assert.match(back, /colour the pictures in together\./i);
  assert.match(back, /<div class="draw-box"><span>Draw a picture:<\/span><\/div>/);

  // Turning soundButtons and drawBox off removes those cues cleanly.
  const plainBack = bookPrintDocument(tap, { layout: 'flat', autoPrint: false, soundButtons: false, drawBox: false });
  assert.doesNotMatch(plainBack, /class="sb-dot"/);
  assert.doesNotMatch(plainBack, /class="draw-box"/);
  assert.match(plainBack, /<td>Pat<\/td>/);

  const pipHtml = bookPrintDocument(pip, { layout: 'flat', autoPrint: false });
  assert.match(pipHtml, /Tricky words<\/h2><p class="tricky-bar"><span class="tricky-pill">the<\/span><span class="tricky-pill">is<\/span>/);
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
  assertPureBlackAndWhiteAndika(html, { require30ptText: true });
});

test('graphemeButtons segments single letters as dots and digraphs/doubles as bars', () => {
  const set7 = makeCode({ graphemes: ['s', 'a', 't', 'p', 'i', 'm', 'f', 'c', 'h', 'r', 'sh', 'ck'], tricky: ['the'] });
  const ship = graphemeButtons('ship', set7);
  assert.deepEqual(ship, {
    word: 'ship',
    tricky: false,
    buttons: [
      { text: 'sh', multi: true },
      { text: 'i', multi: false },
      { text: 'p', multi: false },
    ],
  });
  const miss = graphemeButtons('miss', set7);
  assert.deepEqual(miss.buttons, [
    { text: 'm', multi: false },
    { text: 'i', multi: false },
    { text: 'ss', multi: true },
  ]);
  const pat = graphemeButtons('Pat', set7);
  assert.deepEqual(pat.buttons.map((b) => b.text), ['P', 'a', 't']);
  const tricky = graphemeButtons('the', set7);
  assert.equal(tricky.tricky, true);
  assert.deepEqual(tricky.buttons, []);
});

test('practiseSheetData generates strictly decodable words and vignette captions for every stage 1..11', () => {
  const seq = sequenceById(DEFAULT_SEQUENCE);
  for (let s = 1; s <= seq.stages.length; s += 1) {
    const upto = seq.stages.slice(0, s);
    const stageCode = makeCode({
      graphemes: upto.flatMap((st) => st.graphemes),
      tricky: defaultTricky(s, seq),
      clusters: upto.some((st) => st.clusters),
    });
    const sheet = practiseSheetData({}, { stageNumber: s });
    assert.equal(sheet.stageNumber, s);
    assert.equal(sheet.sheetTitle, `Practise Sheet ${s}`);
    assert.ok(sheet.words.length >= 6, `stage ${s} has ${sheet.words.length} words`);
    for (const entry of sheet.words) {
      const check = checkWord(entry.word, stageCode);
      assert.equal(check.ok, true, `stage ${s} word "${entry.word}" must decode cleanly`);
      assert.equal(check.tricky, false, `stage ${s} drill word "${entry.word}" must not be tricky`);
      assert.ok(entry.buttons.length >= 2, `stage ${s} word "${entry.word}" has sound buttons`);
    }
    assert.equal(sheet.vignettes.length, 3, `stage ${s} has 3 vignettes`);
    for (const v of sheet.vignettes) {
      if (v.label) {
        const check = checkWord(v.label, stageCode);
        assert.equal(check.ok, true, `stage ${s} vignette caption "${v.label}" must decode cleanly`);
      }
    }
  }
});

test('A4 Practise Sheet, A4 Story Sheet and A4 Fluency Workbook print cleanly in pure B&W Andika', () => {
  const reading = { graphemes: ['s', 'a', 't', 'p', 'i', 'm', 'f', 'c'] };
  const sheet2 = practiseSheetData(reading, { stageNumber: 2 });
  const sheetHtml = practiseSheetDocument(sheet2, { fontBase: '/vendor/fonts/', autoPrint: false, soundButtons: true });
  assert.match(styleOf(sheetHtml), /@page\{size:A4 portrait;margin:0\}/);
  assertPureBlackAndWhiteAndika(sheetHtml);
  assert.match(sheetHtml, /Practise Sheet 2/);
  assert.match(sheetHtml, /We focus on the sounds rather than the letter name\./);
  assert.match(sheetHtml, /Focus Sounds:/);
  assert.match(sheetHtml, /Previous Sounds:/);
  assert.match(sheetHtml, /Sound it\. Blend it\./);
  assert.match(sheetHtml, /class="sb-dot"/);
  assert.equal(sheetHtml.match(/class="ps-vignette"/g).length, 3);

  const sheetNoButtons = practiseSheetDocument(sheet2, { fontBase: '/vendor/fonts/', autoPrint: false, soundButtons: false });
  assert.doesNotMatch(sheetNoButtons, /class="sb-dot"/);

  // Digraph stage (Set 7: x w ck sh) renders underline bars (.sb-bar).
  const sheet7 = practiseSheetData({}, { stageNumber: 7 });
  const sheet7Html = practiseSheetDocument(sheet7, { fontBase: '/vendor/fonts/', autoPrint: false, soundButtons: true });
  assert.match(sheet7Html, /class="sb-bar"/);

  // Single-page A4 Fluency Story Sheet.
  const storyHtml = storySheetDocument(pip, { fontBase: '/vendor/fonts/', autoPrint: false, drawBox: true });
  assert.match(styleOf(storyHtml), /@page\{size:A4 portrait;margin:0\}/);
  assertPureBlackAndWhiteAndika(storyHtml);
  assert.match(storyHtml, /<h1>Pip the cat<\/h1>/);
  assert.match(storyHtml, /Words you may need help with:/);
  assert.match(storyHtml, /Draw a picture:/);
  const storyNoDraw = storySheetDocument(pip, { fontBase: '/vendor/fonts/', autoPrint: false, drawBox: false });
  assert.doesNotMatch(storyNoDraw, /Draw a picture:/);

  // Complete A4 Fluency Workbook: Cover + Set 1 Practise + 3 Set 1 stories + Set 2 Practise + 3 Set 2 stories = 9 pages.
  const plan = workbookPlan(reading);
  assert.deepEqual(plan.stages, [1, 2]);
  assert.equal(plan.sheetCount, 2);
  assert.equal(plan.bookCount, 6);
  const wbHtml = workbookPrintDocument(plan, { ownerName: 'Rowan <Test>', fontBase: '/vendor/fonts/', autoPrint: false });
  assertPureBlackAndWhiteAndika(wbHtml);
  assert.equal(wbHtml.match(/<section class="a4-page /g).length, 9);
  assert.match(wbHtml, /<h1>Decodable Texts<\/h1>/);
  assert.match(wbHtml, /Practise for Fluency/);
  assert.match(wbHtml, /Name: <span class="line">Rowan &lt;Test&gt;<\/span>/);
  // Ascending teaching order: Practise Sheet 1 before Tap, tap before Practise Sheet 2 before Pip the cat.
  assert.ok(wbHtml.indexOf('Practise Sheet 1') < wbHtml.indexOf('<h1>Tap, tap</h1>'));
  assert.ok(wbHtml.indexOf('<h1>Tap, tap</h1>') < wbHtml.indexOf('Practise Sheet 2'));
  assert.ok(wbHtml.indexOf('Practise Sheet 2') < wbHtml.indexOf('<h1>Pip the cat</h1>'));
});

test('the print dialog opens only when asked and its script matches APP_CSP PRINT_POPUP_SCRIPT_HASHES', () => {
  const sheet = practiseSheetData({}, { stageNumber: 1 });
  const plan = workbookPlan({ graphemes: ['s', 'a', 't', 'p'] });
  const docs = [
    bookPrintDocument(tap),
    practiseSheetDocument(sheet),
    storySheetDocument(tap),
    workbookPrintDocument(plan),
  ];
  for (const html of docs) {
    assert.match(html, /window\.print\(\)/);
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(match, 'expected inline autoPrint script');
    const hash = `'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`;
    assert.ok(PRINT_POPUP_SCRIPT_HASHES.includes(hash), `script hash ${hash} not in PRINT_POPUP_SCRIPT_HASHES`);
  }
  assert.doesNotMatch(bookPrintDocument(tap, { autoPrint: false }), /window\.print/);
  assert.doesNotMatch(practiseSheetDocument(sheet, { autoPrint: false }), /window\.print/);
  assert.doesNotMatch(storySheetDocument(tap, { autoPrint: false }), /window\.print/);
  assert.doesNotMatch(workbookPrintDocument(plan, { autoPrint: false }), /window\.print/);
});
