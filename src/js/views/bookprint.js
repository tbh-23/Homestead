// Printing decodable books, A4 Practise Sheets, A4 Fluency Story Sheets and
// complete A4 Fluency Workbooks (HAR-45, HAR-70), the way the teaching guide
// prints (views/guideprint.js): a new window with its own stylesheet, then the
// browser's print dialog, where the parent prints or saves a PDF.
//
// Layouts:
// - flat: one A5 page per sheet, in reading order;
// - booklet: A4 landscape sheets, two A5 pages a side in imposition order
//   (phonics/imposition.js); print double-sided, flip on the short edge, fold
//   the stack in half and staple;
// - A4 portrait: Fluency Workbook cover, PhOrMeS-style Practise Sheets, and
//   single-page A4 Fluency Story Sheets.
//
// Black ink only (#000 on #fff), Andika for the reading text (SIL OFL, bundled
// in src/vendor/fonts), nothing under 11 pt. The learner's name goes on a cover
// only when the parent asks for it, and only here, on paper: it is never sent
// anywhere.
import { esc, toast } from '../ui.js';
import { bookletSheets, padToFour } from '../phonics/imposition.js';
import { renderScene } from '../phonics/pictures.js';
import { bookFacts, bookStage } from '../phonics/reading.js';
import { makeCode } from '../phonics/sequence.js';
import { graphemeButtons } from '../phonics/workbook.js';

export const ANDIKA_FILES = { 400: 'andika-latin-400-normal.woff2', 700: 'andika-latin-700-normal.woff2' };

// Exact static script allowed by APP_CSP (PRINT_POPUP_SCRIPT_HASHES in
// src/js/figures/contract.js). Do not alter without updating contract.js.
const AUTO_PRINT_SCRIPT = '<script>window.onload=function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},300)})}<\/script>';

const fontFaces = (fontBase) => `
  @font-face{font-family:Andika;src:url(${fontBase}${ANDIKA_FILES[400]}) format('woff2');font-weight:400}
  @font-face{font-family:Andika;src:url(${fontBase}${ANDIKA_FILES[700]}) format('woff2');font-weight:700}
`;

// Shared pure-black-and-white sound-button cue styles (dots for single-letter
// graphemes, underline bars for digraphs and doubled consonants).
const SOUND_BUTTON_CSS = `
  .sb-word{display:inline-flex;align-items:flex-end;justify-content:center;gap:.04em;line-height:1.15}
  .sb-g{display:inline-flex;flex-direction:column;align-items:center}
  .sb-t{display:block;line-height:1.22}
  .sb-dot{width:2mm;height:2mm;border-radius:50%;background:#000;margin-top:.8mm}
  .sb-bar{width:calc(100% - 1mm);min-width:5mm;height:1.1mm;border-radius:1mm;background:#000;margin-top:1.2mm}
`;

// Page boxes are the paper's own size with the margins inside them, so a
// booklet side is exactly two A5 pages. The type: 30 pt story text, 36 pt
// title, nothing under 11 pt.
const bookStyle = (layout, fontBase) => `
  ${fontFaces(fontBase)}
  @page{size:${layout === 'flat' ? 'A5 portrait' : 'A4 landscape'};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;color:#000}
  body{font-family:Andika,'Andika New Basic',sans-serif}
  .page{width:148mm;height:210mm;padding:10mm 11mm 12mm;display:flex;flex-direction:column;position:relative;overflow:hidden}
  .pic{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
  .pic svg{width:100%;max-height:116mm}
  .text{font-size:30pt;line-height:1.3;text-align:center;min-height:46mm;display:flex;align-items:center;justify-content:center;letter-spacing:.02em;word-spacing:.2em}
  .num{position:absolute;bottom:5.5mm;left:0;right:0;text-align:center;font-size:12pt}
  .rule{border:0;border-top:1.8px solid #000;width:100%;margin:2.5mm 0}
  .cover-frame{flex:1;border:1.5px solid #000;border-radius:6mm;padding:6mm 7mm 6mm;display:flex;flex-direction:column}
  .cover h1{font-size:36pt;line-height:1.1;text-align:center;margin-top:1mm}
  .cover .sounds{text-align:center;font-size:13pt;margin-top:1mm;letter-spacing:.04em}
  .cover .cover-tiles{display:flex;justify-content:center;flex-wrap:wrap;gap:2.5mm;margin-top:2.5mm}
  .cover .cover-tile{min-width:10.5mm;height:10.5mm;padding:0 2mm;border:1.5px solid #000;border-radius:2.2mm;display:inline-flex;align-items:center;justify-content:center;font-size:15pt;font-weight:700;line-height:1}
  .cover .pic svg{max-height:92mm}
  .cover .owner{font-size:14pt;padding-top:3mm;display:flex;gap:2mm;align-items:flex-end}
  .cover .owner .line{flex:1;border-bottom:1.5px solid #000;min-height:8mm;font-size:18pt;padding-left:2mm}
  .back{font-size:11pt;line-height:1.32;gap:2.2mm}
  .back-head{display:flex;justify-content:space-between;align-items:baseline;font-size:11pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .back-title{font-size:17pt;font-weight:700;text-align:center;line-height:1.15}
  .back h2{font-size:11.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-top:1mm}
  .back .tile-row{display:flex;flex-wrap:wrap;gap:2mm;padding:2mm 2.5mm;border:1.4px solid #000;border-radius:3mm;justify-content:center}
  .back .tile{min-width:9.5mm;height:9.5mm;padding:0 1.8mm;border:1.4px solid #000;border-radius:2mm;display:inline-flex;align-items:center;justify-content:center;font-size:14pt;font-weight:700;line-height:1}
  .back .tricky-bar{display:flex;flex-wrap:wrap;align-items:center;gap:1.8mm;font-size:11.5pt}
  .back .tricky-pill{border:1.2px solid #000;border-radius:2mm;padding:.5mm 2.5mm;font-weight:700;font-size:12pt}
  .back .word-grid{width:100%;border-collapse:separate;border-spacing:0;border:1.5px solid #000;border-radius:3mm;overflow:hidden}
  .back .word-grid td{border-right:1.2px solid #000;border-bottom:1.2px solid #000;text-align:center;vertical-align:middle;padding:1.8mm 1.5mm;font-size:14pt;font-weight:700}
  .back .word-grid td:last-child{border-right:0}
  .back .word-grid tr:last-child td{border-bottom:0}
  .back .word-grid .sb-dot{width:1.4mm;height:1.4mm;margin-top:.8mm}
  .back .word-grid .sb-bar{min-width:3.6mm;height:.85mm;margin-top:1mm}
  .back .guide-box{border:1.3px solid #000;border-radius:3mm;padding:2.2mm 3mm;font-size:11pt;line-height:1.3}
  .back .guide-lead{font-weight:700;text-decoration:underline;margin-bottom:.6mm}
  .back .draw-box{flex:1;min-height:20mm;border:1.5px dashed #000;border-radius:3mm;padding:1.8mm 2.8mm;font-size:11pt;font-weight:700;display:flex;flex-direction:column}
  .back .small{font-size:11pt;margin-top:auto;display:flex;justify-content:space-between}
  ${SOUND_BUTTON_CSS}
  .blank{}
  .sheet{width:297mm;height:210mm;display:flex;break-after:page;page-break-after:always}
  .flat>.page{break-after:page;page-break-after:always}
  .sheet:last-child,.flat>.page:last-child{break-after:auto;page-break-after:auto}
  .note{font:15px/1.4 sans-serif;margin:12px;padding:10px 12px;border:1.5px solid #000;max-width:600px}
  @media screen{body{background:#eee}.page,.sheet{background:#fff;margin:12px;box-shadow:0 0 0 1px #999}.sheet .page{margin:0;box-shadow:none}.sheet .page+.page{border-left:1px dashed #999}}
  @media print{.note{display:none}}
`;

// A4 Portrait stylesheet for the Fluency Workbook, Practise Sheets, and
// single-page Fluency Story Sheets. Strictly #000 / #fff in print, >= 11 pt.
const a4Style = (fontBase) => `
  ${fontFaces(fontBase)}
  @page{size:A4 portrait;margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;color:#000}
  body{font-family:Andika,'Andika New Basic',sans-serif}
  .a4-page{width:210mm;height:297mm;padding:14mm 16mm 13mm;display:flex;flex-direction:column;position:relative;overflow:hidden;break-after:page;page-break-after:always}
  .a4-page:last-child{break-after:auto;page-break-after:auto}
  .rule{border:0;border-top:2px solid #000;width:100%;margin:3.5mm 0}
  .rule-thin{border:0;border-top:1.2px solid #000;width:100%;margin:3mm 0}
  .page-badge{width:9mm;height:9mm;border:1.5px solid #000;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12pt;font-weight:700;margin:0 auto}
  /* ---- Workbook Cover ---- */
  .wb-frame{flex:1;border:2px solid #000;border-radius:8mm;padding:12mm 14mm 10mm;display:flex;flex-direction:column;align-items:center;text-align:center}
  .wb-eyebrow{display:flex;align-items:center;gap:4mm;font-size:12pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:4mm}
  .wb-eyebrow-line{width:14mm;height:1.5px;background:#000;display:inline-block}
  .wb-cover h1{font-size:40pt;line-height:1.1;font-weight:700;margin-top:5mm}
  .wb-sub{font-size:21pt;font-weight:700;margin-top:2.5mm}
  .wb-meta{font-size:12pt;margin-top:3mm}
  .wb-art-box{width:100%;max-width:136mm;flex:1;max-height:112mm;margin:10mm 0 4mm;border:1.8px dashed #000;border-radius:6mm;padding:6mm;display:flex;align-items:center;justify-content:center}
  .wb-art-box svg{width:100%;height:100%;max-height:96mm}
  .wb-caption{font-size:11pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
  .wb-owner{width:100%;max-width:128mm;margin-top:auto;padding-top:8mm;padding-bottom:6mm;display:flex;align-items:flex-end;gap:3mm;font-size:18pt;font-weight:700;text-align:left}
  .wb-owner .line{flex:1;border-bottom:2px solid #000;min-height:10mm;font-size:22pt;font-weight:400;padding-left:3mm}
  /* ---- Practise Sheet ---- */
  .ps-header{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}
  .ps-kicker{font-size:11.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .ps-title{font-size:26pt;font-weight:700;line-height:1.15;margin-top:1mm}
  .ps-callout{max-width:74mm;border:1.4px solid #000;border-radius:3.5mm;padding:2.8mm 4mm;font-size:11pt;font-style:italic;line-height:1.3}
  .ps-label{font-size:11.5pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:3.5mm 0 2.5mm}
  .focus-tiles{display:flex;flex-wrap:wrap;justify-content:center;gap:5mm;margin-bottom:2mm}
  .focus-tile{min-width:21mm;height:21mm;padding:0 3.5mm;border:2px solid #000;border-radius:4mm;display:inline-flex;align-items:center;justify-content:center;font-size:28pt;font-weight:700;line-height:1}
  .focus-banner{border:2px solid #000;border-radius:4mm;padding:3.5mm 6mm;text-align:center;font-size:16pt;font-weight:700;margin-bottom:2mm}
  .prev-tiles{display:flex;flex-wrap:wrap;justify-content:center;gap:2.5mm;margin-bottom:1.5mm}
  .prev-tile{min-width:11.5mm;height:11.5mm;padding:0 2mm;border:1.3px solid #000;border-radius:2.5mm;display:inline-flex;align-items:center;justify-content:center;font-size:15pt;font-weight:700;line-height:1}
  .drill-grid{width:100%;border-collapse:separate;border-spacing:0;border:2px solid #000;border-radius:4mm;overflow:hidden;margin-top:1mm}
  .drill-grid td{width:33.33%;border-right:1.6px solid #000;border-bottom:1.6px solid #000;text-align:center;vertical-align:middle;padding:5.5mm 3mm;font-size:25pt;font-weight:700}
  .drill-grid.rows-3 td{padding:3.8mm 3mm;font-size:23pt}
  .drill-grid td:last-child{border-right:0}
  .drill-grid tr:last-child td{border-bottom:0}
  .ps-tricky{display:flex;flex-wrap:wrap;align-items:center;gap:2.5mm;margin-top:3.5mm;font-size:12pt}
  .ps-tricky-pill{border:1.5px solid #000;border-radius:2.5mm;padding:1mm 3.5mm;font-size:14pt;font-weight:700}
  .ps-guide{border:1.5px solid #000;border-radius:4mm;padding:4mm 5mm;margin-top:5mm;font-size:12pt;line-height:1.4}
  .ps-guide-title{font-weight:700;text-decoration:underline;margin-bottom:1.5mm;font-size:13pt}
  .ps-vignettes{margin-top:auto;padding-top:4mm;border-top:1.4px dashed #000;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;align-items:end}
  .ps-vignette{display:flex;flex-direction:column;align-items:center;text-align:center}
  .ps-vignette svg{width:36mm;height:25mm}
  .ps-vignette-cap{font-size:11pt;margin-top:.8mm;min-height:4.5mm}
  .ps-footer{margin-top:3mm;text-align:center}
  /* Compact spacing for higher stages (2+ rows of Previous Sounds & 3x3 word grid) */
  .practise-sheet.compact{padding:11mm 15mm 10mm}
  .practise-sheet.compact .rule{margin:2.5mm 0}
  .practise-sheet.compact .ps-label{margin:2.5mm 0 1.8mm}
  .practise-sheet.compact .focus-tile{min-width:17mm;height:17mm;font-size:24pt}
  .practise-sheet.compact .prev-tiles{gap:1.8mm}
  .practise-sheet.compact .prev-tile{min-width:9.5mm;height:9.5mm;font-size:13.5pt;border-radius:2mm}
  .practise-sheet.compact .drill-grid.rows-3 td{padding:2.6mm 2.5mm;font-size:20.5pt}
  .practise-sheet.compact .ps-tricky{margin-top:2.5mm}
  .practise-sheet.compact .ps-guide{padding:3mm 4.5mm;margin-top:3mm;font-size:11.5pt}
  .practise-sheet.compact .ps-vignettes{padding-top:3mm}
  .practise-sheet.compact .ps-vignette svg{width:32mm;height:20mm}
  .practise-sheet.compact .ps-footer{margin-top:2mm}
  /* ---- Single-Page A4 Fluency Story ---- */
  .story-sheet h1{font-size:30pt;font-weight:700;text-align:center;line-height:1.15;margin-bottom:2mm}
  .story-body{flex:1;min-height:0;padding:4mm 0 2mm}
  .story-body.split{display:grid;grid-template-columns:1.12fr .88fr;gap:8mm;align-items:center}
  .story-body.centred{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6mm}
  .story-lines{display:flex;flex-direction:column;gap:4.5mm}
  .story-lines.dense{gap:2.8mm}
  .story-line{font-size:21pt;line-height:1.35;letter-spacing:.01em;word-spacing:.14em}
  .story-lines.dense .story-line{font-size:17.5pt;line-height:1.3}
  .story-body.centred .story-lines{text-align:center;align-items:center}
  .story-body.centred .story-line{font-size:24pt}
  .story-art{border:1.8px solid #000;border-radius:5mm;padding:4mm 4mm 3mm;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .story-art svg{width:100%;max-height:76mm}
  .story-body.centred .story-art{width:116mm}
  .story-art-cap{font-size:11pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-top:2mm}
  .story-meta{display:flex;justify-content:space-between;align-items:baseline;gap:4mm;font-size:12pt;padding:1.5mm 0 3mm}
  .story-tricky{font-style:italic}
  .story-tricky strong{font-style:normal;text-decoration:underline}
  .story-draw{border:1.8px dashed #000;border-radius:4mm;padding:3.5mm 5mm;min-height:58mm;flex-shrink:0;display:flex;flex-direction:column;margin-bottom:4mm}
  .story-draw-title{font-size:12.5pt;font-weight:700}
  .story-footer{text-align:center;margin-top:auto}
  ${SOUND_BUTTON_CSS}
  .note{font:15px/1.4 sans-serif;margin:12px;padding:10px 12px;border:1.5px solid #000;max-width:640px}
  @media screen{body{background:#eee}.a4-page{background:#fff;margin:14px auto;box-shadow:0 0 0 1px #999}}
  @media print{.note{display:none}}
`;

function renderWordMarkup(entry, soundButtons) {
  if (!soundButtons || entry.tricky || !entry.buttons || !entry.buttons.length) {
    return esc(entry.word);
  }
  const inner = entry.buttons.map((b) => `<span class="sb-g"><span class="sb-t">${esc(b.text)}</span><span class="${b.multi ? 'sb-bar' : 'sb-dot'}" aria-hidden="true"></span></span>`).join('');
  return `<span class="sb-word" aria-label="${esc(entry.word)}">${inner}</span>`;
}

function wordRows(entries, cols) {
  const rows = [];
  for (let i = 0; i < entries.length; i += cols) rows.push(entries.slice(i, i + cols));
  return rows;
}

// ---- A5 Booklet & Flat Book Pages ------------------------------------------

function cover(book, facts, ownerName) {
  const tiles = facts.focus.length
    ? `<div class="cover-tiles" aria-hidden="true">${facts.focus.map((g) => `<span class="cover-tile">${esc(g)}</span>`).join('')}</div>`
    : '';
  return `<section class="page cover" data-page="1">
    <div class="cover-frame">
      <h1>${esc(book.title)}</h1>
      <hr class="rule">
      <p class="sounds">${esc(facts.coverLine)}</p>
      ${tiles}
      <div class="pic">${renderScene(book.cover || [], { label: book.title })}</div>
      <p class="owner">This book belongs to <span class="line">${ownerName ? esc(ownerName) : ''}</span></p>
    </div>
  </section>`;
}

function storyPage(page, n) {
  return `<section class="page story" data-page="${n}">
    <div class="pic">${renderScene(page.scene || [], { label: page.text })}</div>
    <p class="text">${esc(page.text)}</p>
    <p class="num">${n}</p>
  </section>`;
}

function backPage(book, facts, n, { soundButtons = true, drawBox = true } = {}) {
  const bookCode = makeCode({ graphemes: book.graphemes || [], tricky: book.tricky || [], clusters: !!book.clusters });
  const entries = facts.words.map((w) => graphemeButtons(w, bookCode));
  const cols = entries.length > 8 ? 3 : 2;
  const shownEntries = entries.slice(0, cols === 3 ? 12 : 8);
  const gridRows = wordRows(shownEntries, cols).map((row) => {
    const padded = [...row];
    while (padded.length < cols) padded.push(null);
    return `<tr>${padded.map((e) => `<td>${e ? renderWordMarkup(e, soundButtons) : ''}</td>`).join('')}</tr>`;
  }).join('');
  const extraWords = entries.slice(shownEntries.length);

  return `<section class="page back" data-page="${n}">
    <div class="back-head"><span>Decodable Phonics Warm-Up</span><span>Back Cover</span></div>
    <p class="back-title">Warm up &amp; Sounds</p>
    <hr class="rule">
    <h2>Sounds in this book</h2>
    <div class="tile-row">${facts.sounds.map((g) => `<span class="tile">${esc(g)}</span>`).join('')}</div>
    ${facts.clusters ? '<p>Includes words with two consonants together, like stop.</p>' : ''}
    ${facts.tricky.length ? `<h2>Tricky words</h2><p class="tricky-bar">${facts.tricky.map((w) => `<span class="tricky-pill">${esc(w)}</span>`).join('')}<span>Say these together; they do not follow the sounds yet.</span></p>` : ''}
    <h2>Words to sound out</h2>
    <table class="word-grid" aria-label="Words to sound out"><tbody>${gridRows}</tbody></table>
    ${extraWords.length ? `<p class="extra-words">${esc(extraWords.map((e) => e.word).join(' · '))}</p>` : ''}
    <div class="guide-box">
      <p class="guide-lead">Sound it. Blend it. — Reading it together</p>
      <p>Point to each sound above and say it together, then blend left to right (“s-a-t, sat”). A name with a capital letter reads the same way (“P-a-t, Pat”). Talk about the picture after reading, read it again tomorrow, and colour the pictures in together.</p>
    </div>
    ${drawBox ? '<div class="draw-box"><span>Draw a picture:</span></div>' : ''}
    <p class="small"><span>Harrington Decodables</span><span>Every word checked against these sounds.</span></p>
  </section>`;
}

const blankPage = () => '<section class="page blank" aria-hidden="true"></section>';

/**
 * The pages of a book in reading order, as HTML: the cover (1), the story
 * (2 to n - 1), the back page (n), padded with blank pages before the back
 * to a multiple of four.
 */
export function bookPages(book, { ownerName = '', soundButtons = true, drawBox = true } = {}) {
  const facts = bookFacts(book);
  const story = book.pages.map((p, i) => storyPage(p, i + 2));
  const n = story.length + 2;
  return padToFour([cover(book, facts, ownerName), ...story, backPage(book, facts, n, { soundButtons, drawBox })], blankPage);
}

/**
 * The print document for one book, as a complete HTML page. `layout` is
 * 'booklet' or 'flat'; `ownerName` (optional) fills "This book belongs to";
 * `fontBase` is where the Andika files are served; `autoPrint` opens the
 * print dialog once the page and its fonts have loaded.
 */
export function bookPrintDocument(book, { layout = 'booklet', ownerName = '', fontBase = 'vendor/fonts/', autoPrint = true, soundButtons = true, drawBox = true } = {}) {
  const pages = bookPages(book, { ownerName, soundButtons, drawBox });
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
  <style>${bookStyle(layout, fontBase)}</style></head><body class="${layout === 'flat' ? 'layout-flat' : 'layout-booklet'}">
    ${body}
    ${autoPrint ? AUTO_PRINT_SCRIPT : ''}
  </body></html>`;
}

// ---- A4 Fluency Workbook, Practise Sheet & Story Sheet Sections ------------

function workbookCoverSection(plan, ownerName) {
  const range = plan.stages.length > 1
    ? `Sets ${plan.stages[0]}–${plan.stages[plan.stages.length - 1]} · ${plan.bookCount} decodable ${plan.bookCount === 1 ? 'story' : 'stories'}`
    : plan.stages.length === 1
      ? `Set ${plan.stages[0]} · ${plan.bookCount} decodable ${plan.bookCount === 1 ? 'story' : 'stories'}`
      : '';
  return `<section class="a4-page wb-cover" data-page="1">
    <div class="wb-frame">
      <p class="wb-eyebrow"><span class="wb-eyebrow-line" aria-hidden="true"></span><span>&#9734; Harrington Phonics &#9734;</span><span class="wb-eyebrow-line" aria-hidden="true"></span></p>
      <h1>${esc(plan.title || 'Decodable Texts')}</h1>
      <p class="wb-sub">${esc(plan.subtitle || 'Practise for Fluency')}</p>
      ${range ? `<p class="wb-meta">${esc(range)}</p>` : ''}
      <div class="wb-art-box">${renderScene(plan.coverScene || [], { label: 'Decodable Texts cover illustration', ground: false })}</div>
      <p class="wb-caption">Colour me in!</p>
      <p class="wb-owner">Name: <span class="line">${ownerName ? esc(ownerName) : ''}</span></p>
      <p class="page-badge">1</p>
    </div>
  </section>`;
}

function practiseSheetSection(sheet, { pageNumber = 1, soundButtons = true } = {}) {
  const cols = 3;
  const rows = wordRows(sheet.words || [], cols);
  const gridBody = rows.map((row) => {
    const padded = [...row];
    while (padded.length < cols) padded.push(null);
    return `<tr>${padded.map((e) => `<td>${e ? renderWordMarkup(e, soundButtons) : ''}</td>`).join('')}</tr>`;
  }).join('');

  const focusMarkup = sheet.focusSounds.length
    ? `<div class="focus-tiles">${sheet.focusSounds.map((g) => `<span class="focus-tile">${esc(g)}</span>`).join('')}</div>`
    : `<div class="focus-banner">${esc(sheet.clustersNote || 'Adjacent consonants')}</div>`;

  const prevMarkup = sheet.previousSounds.length
    ? `<p class="ps-label">Previous Sounds:</p><div class="prev-tiles">${sheet.previousSounds.map((g) => `<span class="prev-tile">${esc(g)}</span>`).join('')}</div>`
    : '';

  const trickyMarkup = sheet.trickyWords && sheet.trickyWords.length
    ? `<div class="ps-tricky"><strong>Tricky words:</strong>${sheet.trickyWords.map((w) => `<span class="ps-tricky-pill">${esc(w)}</span>`).join('')}</div>`
    : '';

  const vignettesMarkup = (sheet.vignettes || []).map((v) => `<div class="ps-vignette">${renderScene(v.scene || [], { label: v.label || v.kind, ground: false })}<span class="ps-vignette-cap">${esc(v.label || '')}</span></div>`).join('');

  const compact = (sheet.previousSounds || []).length > 12 || rows.length >= 3;

  return `<section class="a4-page practise-sheet${compact ? ' compact' : ''}" data-page="${pageNumber}" data-stage="${sheet.stageNumber}">
    <div class="ps-header">
      <div>
        <p class="ps-kicker">Harrington Phonics</p>
        <h1 class="ps-title">${esc(sheet.sheetTitle)}</h1>
      </div>
      <div class="ps-callout">We focus on the sounds rather than the letter name.</div>
    </div>
    <hr class="rule">
    <p class="ps-label">Focus Sounds:</p>
    ${focusMarkup}
    ${prevMarkup}
    <p class="ps-label">Decodable Words:</p>
    <table class="drill-grid ${rows.length >= 3 ? 'rows-3' : ''}" aria-label="Decodable words"><tbody>${gridBody}</tbody></table>
    ${trickyMarkup}
    <div class="ps-guide">
      <p class="ps-guide-title">Sound it. Blend it.</p>
      <p>Ask your child to put their finger under each sound. Say the sound, then blend the word by sliding their finger along under the word.</p>
    </div>
    <div class="ps-vignettes">${vignettesMarkup}</div>
    <div class="ps-footer"><p class="page-badge">${pageNumber}</p></div>
  </section>`;
}

function storySheetSection(book, { pageNumber = 1, drawBox = true } = {}) {
  const facts = bookFacts(book);
  const stage = bookStage(book);
  const lines = (book.pages || []).map((p) => String(p.text || '').trim()).filter(Boolean);
  const isShort = lines.length <= 4;
  const dense = lines.length > 6;
  const artScene = (book.cover && book.cover.length)
    ? book.cover
    : ((book.pages || []).find((p) => Array.isArray(p.scene) && p.scene.length)?.scene || []);

  const metaLeft = facts.tricky.length
    ? `<p class="story-tricky">Words you may need help with: <strong>${esc(facts.tricky.join(', '))}</strong></p>`
    : `<p class="story-tricky">${esc(facts.coverLine)}</p>`;
  const metaRight = stage ? `<p>Set ${stage}</p>` : '';

  return `<section class="a4-page story-sheet" data-page="${pageNumber}">
    <h1>${esc(book.title)}</h1>
    <hr class="rule">
    <div class="story-body ${isShort ? 'centred' : 'split'}">
      <div class="story-lines ${dense ? 'dense' : ''}">
        ${lines.map((line) => `<p class="story-line">${esc(line)}</p>`).join('')}
      </div>
      <div class="story-art">
        ${renderScene(artScene, { label: book.title })}
        <p class="story-art-cap">Colour me in</p>
      </div>
    </div>
    <hr class="rule-thin">
    <div class="story-meta">${metaLeft}${metaRight}</div>
    ${drawBox ? '<div class="story-draw"><p class="story-draw-title">Draw a picture:</p></div>' : ''}
    <div class="story-footer"><p class="page-badge">${pageNumber}</p></div>
  </section>`;
}

/**
 * Printable A4 HTML document for a single PhOrMeS-style Practise Sheet.
 */
export function practiseSheetDocument(sheet, { fontBase = 'vendor/fonts/', autoPrint = true, soundButtons = true } = {}) {
  const title = `${sheet.sheetTitle} — Harrington Phonics`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${a4Style(fontBase)}</style></head><body class="layout-practise">
    <p class="note">Standard A4 portrait. Print at 100% scale, black and white.</p>
    <main class="a4-doc">${practiseSheetSection(sheet, { pageNumber: 1, soundButtons })}</main>
    ${autoPrint ? AUTO_PRINT_SCRIPT : ''}
  </body></html>`;
}

/**
 * Printable A4 HTML document for a single-page Fluency Story Sheet.
 */
export function storySheetDocument(book, { fontBase = 'vendor/fonts/', autoPrint = true, drawBox = true, pageNumber = 1 } = {}) {
  const title = `${book.title} (A4 story sheet)`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${a4Style(fontBase)}</style></head><body class="layout-story-sheet">
    <p class="note">Standard A4 portrait fluency story sheet. Print at 100% scale, black and white.</p>
    <main class="a4-doc">${storySheetSection(book, { pageNumber, drawBox })}</main>
    ${autoPrint ? AUTO_PRINT_SCRIPT : ''}
  </body></html>`;
}

/**
 * Printable A4 HTML document for a complete Fluency Workbook: Cover Page 1 +
 * interleaved Practise Sheets and single-page Decodable Stories in teaching
 * order.
 */
export function workbookPrintDocument(plan, { ownerName = '', fontBase = 'vendor/fonts/', autoPrint = true, soundButtons = true, drawBox = true } = {}) {
  let pageNum = 1;
  const sections = [workbookCoverSection(plan, ownerName)];
  for (const item of plan.items || []) {
    pageNum += 1;
    if (item.kind === 'practise') {
      sections.push(practiseSheetSection(item.sheet, { pageNumber: pageNum, soundButtons }));
    } else if (item.kind === 'story') {
      sections.push(storySheetSection(item.book, { pageNumber: pageNum, drawBox }));
    }
  }
  const title = `${plan.title || 'Decodable Texts'} — Fluency Workbook (A4)`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${a4Style(fontBase)}</style></head><body class="layout-workbook">
    <p class="note">A4 Fluency Workbook (${sections.length} pages). Print single-sided or double-sided on A4 paper at 100% scale.</p>
    <main class="a4-doc">${sections.join('')}</main>
    ${autoPrint ? AUTO_PRINT_SCRIPT : ''}
  </body></html>`;
}

function openPrintPopup(html) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

const resolvedFontBase = () => new URL('vendor/fonts/', document.baseURI).href;

// Opens the book in a new window and the print dialog over it.
export function printBook(book, { layout, ownerName, soundButtons = true, drawBox = true } = {}) {
  openPrintPopup(bookPrintDocument(book, { layout, ownerName, fontBase: resolvedFontBase(), soundButtons, drawBox }));
}

// Opens a single A4 PhOrMeS-style Practise Sheet in a new print window.
export function printPractiseSheet(sheet, { soundButtons = true } = {}) {
  openPrintPopup(practiseSheetDocument(sheet, { fontBase: resolvedFontBase(), soundButtons }));
}

// Opens a single-page A4 Fluency Story Sheet in a new print window.
export function printStorySheet(book, { drawBox = true } = {}) {
  openPrintPopup(storySheetDocument(book, { fontBase: resolvedFontBase(), drawBox }));
}

// Opens the full A4 Fluency Workbook in a new print window.
export function printWorkbook(plan, { ownerName = '', soundButtons = true, drawBox = true } = {}) {
  openPrintPopup(workbookPrintDocument(plan, { ownerName, fontBase: resolvedFontBase(), soundButtons, drawBox }));
}
