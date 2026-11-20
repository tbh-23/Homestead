// Printing a decodable book (HAR-45), the way the teaching guide prints
// (views/guideprint.js): a new window with its own stylesheet, then the
// browser's print dialog, where the parent prints or saves a PDF. Two
// layouts:
// - flat: one A5 page per sheet, in reading order;
// - booklet: A4 landscape sheets, two pages a side in imposition order
//   (phonics/imposition.js); print double-sided, flip on the short edge, fold
//   the stack in half and staple.
// Black ink only, Andika for the reading text (SIL OFL, bundled in
// src/vendor/fonts). The learner's name goes on the cover only when the
// parent asks for it, and only here, on paper: it is never sent anywhere.
import { esc, toast } from '../ui.js';
import { bookletSheets, padToFour } from '../phonics/imposition.js';
import { renderScene } from '../phonics/pictures.js';
import { bookFacts } from '../phonics/reading.js';

export const ANDIKA_FILES = { 400: 'andika-latin-400-normal.woff2', 700: 'andika-latin-700-normal.woff2' };

// Page boxes are the paper's own size with the margins inside them, so a
// booklet side is exactly two A5 pages. The type: 30 pt story text, 40 pt
// title, nothing under 11 pt.
const style = (layout, fontBase) => `
  @font-face{font-family:Andika;src:url(${fontBase}${ANDIKA_FILES[400]}) format('woff2');font-weight:400}
  @font-face{font-family:Andika;src:url(${fontBase}${ANDIKA_FILES[700]}) format('woff2');font-weight:700}
  @page{size:${layout === 'flat' ? 'A5 portrait' : 'A4 landscape'};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;color:#000}
  body{font-family:Andika,'Andika New Basic',sans-serif}
  .page{width:148mm;height:210mm;padding:12mm 12mm 14mm;display:flex;flex-direction:column;position:relative;overflow:hidden}
  .pic{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
  .pic svg{width:100%;max-height:118mm}
  .text{font-size:30pt;line-height:1.3;text-align:center;min-height:46mm;display:flex;align-items:center;justify-content:center;letter-spacing:.02em;word-spacing:.2em}
  .num{position:absolute;bottom:6mm;left:0;right:0;text-align:center;font-size:12pt}
  .cover h1{font-size:40pt;line-height:1.1;text-align:center;margin-top:6mm}
  .cover .sounds{text-align:center;font-size:16pt;margin-top:3mm;letter-spacing:.06em}
  .cover .owner{font-size:16pt;padding-top:4mm;display:flex;gap:2mm;align-items:flex-end}
  .cover .owner .line{flex:1;border-bottom:1.5px solid #000;min-height:9mm;font-size:20pt;padding-left:2mm}
  .back{font-size:12pt;line-height:1.4}
  .back h2{font-size:15pt;margin:4mm 0 1.5mm}
  .back h2:first-child{margin-top:0}
  .back .big{font-size:24pt;letter-spacing:.25em;line-height:1.3}
  .back .words{font-size:15pt;word-spacing:.5em}
  .back ul{padding-left:5mm}
  .back .small{font-size:11pt;margin-top:auto}
  .blank{}
  .sheet{width:297mm;height:210mm;display:flex;break-after:page;page-break-after:always}
  .flat>.page{break-after:page;page-break-after:always}
  .sheet:last-child,.flat>.page:last-child{break-after:auto;page-break-after:auto}
  .note{font:15px/1.4 sans-serif;margin:12px;padding:10px 12px;border:1.5px solid #000;max-width:600px}
  @media screen{body{background:#eee}.page,.sheet{background:#fff;margin:12px;box-shadow:0 0 0 1px #999}.sheet .page{margin:0;box-shadow:none}.sheet .page+.page{border-left:1px dashed #999}}
  @media print{.note{display:none}}
`;

function cover(book, facts, ownerName) {
  return `<section class="page cover" data-page="1">
    <h1>${esc(book.title)}</h1>
    <p class="sounds">${esc(facts.coverLine)}</p>
    <div class="pic">${renderScene(book.cover || [], { label: book.title })}</div>
    <p class="owner">This book belongs to <span class="line">${ownerName ? esc(ownerName) : ''}</span></p>
  </section>`;
}

function storyPage(page, n) {
  return `<section class="page story" data-page="${n}">
    <div class="pic">${renderScene(page.scene || [], { label: page.text })}</div>
    <p class="text">${esc(page.text)}</p>
    <p class="num">${n}</p>
  </section>`;
}

function backPage(facts, n) {
  return `<section class="page back" data-page="${n}">
    <h2>Sounds in this book</h2>
    <p class="big">${esc(facts.sounds.join(' '))}</p>
    ${facts.clusters ? '<p>and words with two consonants together, like stop.</p>' : ''}
    ${facts.tricky.length ? `<h2>Tricky words</h2><p class="words">${esc(facts.tricky.join(' '))}</p><p>Say these together; they do not follow the sounds yet.</p>` : ''}
    <h2>Words to sound out</h2>
    <p class="words">${esc(facts.words.join(' '))}</p>
    <h2>Reading it together</h2>
    <ul>
      <li>Before reading, point to each sound above and say it together.</li>
      <li>Sound out each word, then blend: “s-a-t, sat”.</li>
      <li>A name with a capital letter is read the same way: “P-a-t, Pat”.</li>
      <li>Talk about the picture after the page is read, not before.</li>
      <li>Read it again tomorrow. The second read is where fluency comes from.</li>
      <li>Colour the pictures in together.</li>
    </ul>
    <p class="small">A Harrington decodable book. Every word was checked against the sounds above.</p>
  </section>`;
}

const blankPage = () => '<section class="page blank" aria-hidden="true"></section>';

/**
 * The pages of a book in reading order, as HTML: the cover (1), the story
 * (2 to n - 1), the back page (n), padded with blank pages before the back
 * to a multiple of four.
 */
export function bookPages(book, { ownerName = '' } = {}) {
  const facts = bookFacts(book);
  const story = book.pages.map((p, i) => storyPage(p, i + 2));
  const n = story.length + 2;
  return padToFour([cover(book, facts, ownerName), ...story, backPage(facts, n)], blankPage);
}

/**
 * The print document for one book, as a complete HTML page. `layout` is
 * 'booklet' or 'flat'; `ownerName` (optional) fills "This book belongs to";
 * `fontBase` is where the Andika files are served; `autoPrint` opens the
 * print dialog once the page and its fonts have loaded.
 */
export function bookPrintDocument(book, { layout = 'booklet', ownerName = '', fontBase = 'vendor/fonts/', autoPrint = true } = {}) {
  const pages = bookPages(book, { ownerName });
  let body;
  if (layout === 'flat') {
    body = `<p class="note">One page per sheet, in reading order. Print on A5 paper, or on A4 with "Fit to page".</p>
      <main class="flat">${pages.join('')}</main>`;
  } else {
    const sheets = bookletSheets(pages.length).map(([l, r]) => `<div class="sheet" data-pages="${l},${r}">${pages[l - 1]}${pages[r - 1]}</div>`);
    body = `<p class="note">Print double-sided, flip on the short edge; fold; staple.</p>
      <main class="booklet">${sheets.join('')}</main>`;
  }
  const title = `${book.title} (${layout === 'flat' ? 'flat' : 'booklet'})`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${style(layout, fontBase)}</style></head><body class="${layout === 'flat' ? 'layout-flat' : 'layout-booklet'}">
    ${body}
    ${autoPrint ? '<script>window.onload=function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},300)})}<\/script>' : ''}
  </body></html>`;
}

// Opens the book in a new window and the print dialog over it.
export function printBook(book, { layout, ownerName } = {}) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  const fontBase = new URL('vendor/fonts/', document.baseURI).href;
  w.document.write(bookPrintDocument(book, { layout, ownerName, fontBase }));
  w.document.close();
}
