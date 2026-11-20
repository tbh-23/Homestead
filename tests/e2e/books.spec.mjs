// Decodable books (HAR-45) on the server with no AI provider: the reading
// setup on the learner's page (ticks, Find the level, tricky words, print
// preferences) persists; the books page lists only the books within the
// ticked code and follows a new tick; "Make a new book" writes a printable
// book; both print layouts have the expected pages and sheets; the learner's
// name is on the cover only when the preference is on.
import { test, expect, modal, expectToast } from './fixtures.mjs';
import { LEARNERS } from './support/family.mjs';

const ROWAN = LEARNERS.rowan.id;
const SET1 = ['s', 'a', 't', 'p'];
const SET12 = [...SET1, 'i', 'm', 'f', 'c'];
const withReading = (reading) => ({ extra: { reading: { [ROWAN]: reading } } });
const stageLine = (page) => page.locator('#reading-stage');
const fieldset = (page, n) => page.locator(`fieldset[data-stage="${n}"]`);

// Opens a print window from a button and returns it once written.
async function printWindow(page, button) {
  const [popup] = await Promise.all([page.context().waitForEvent('page'), button.click()]);
  await popup.waitForLoadState();
  return popup;
}

test('the reading setup: tick sets, find the level, tricky words; it persists after a reload', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: {} });
  // From the learner selector, as a parent on a phone would.
  await page.getByRole('button', { name: 'Switch learner' }).first().click();
  await modal(page).getByRole('button', { name: 'Reading and books for Rowan Example' }).click();
  await expect(page).toHaveURL(new RegExp(`#learner/${ROWAN}$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Reading' })).toBeVisible();
  await expect(stageLine(page)).toHaveText('Not started yet. Next sounds: s a t p');

  await fieldset(page, 1).getByRole('checkbox', { name: 'Whole set 1', exact: true }).check();
  await expect(stageLine(page)).toHaveText('Reading at set 1. Next sounds: i m f c');
  await fieldset(page, 2).getByRole('checkbox', { name: 'Whole set 2', exact: true }).check();
  await expect(stageLine(page)).toHaveText('Reading at set 2. Next sounds: o d g l');
  // The default tricky words follow the stage.
  await expect(page.getByRole('checkbox', { name: 'Tricky word the', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Tricky word is', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Tricky word to', exact: true })).not.toBeChecked();
  // One sound off: the stage drops back.
  await page.getByRole('checkbox', { name: 'Sound f', exact: true }).uncheck();
  await expect(stageLine(page)).toHaveText('Reading at set 1. Next sounds: f');
  // The page re-renders; the keyboard focus stays on the tick just changed.
  await expect(page.getByRole('checkbox', { name: 'Sound f', exact: true })).toBeFocused();
  await page.getByRole('checkbox', { name: 'Sound f', exact: true }).check();
  await expect(stageLine(page)).toHaveText('Reading at set 2. Next sounds: o d g l');

  // Find the level: one set a screen, filling the same checklist.
  await page.getByRole('button', { name: 'Find the level' }).click();
  const dialog = modal(page);
  await expect(dialog.getByText('Find the level · Set 3 of 11')).toBeVisible();
  for (const g of ['o', 'd', 'g', 'l']) await dialog.getByRole('button', { name: g, exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'l', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot('find-the-level', { full: false });
  await dialog.getByRole('button', { name: 'Next set' }).click();
  await expect(dialog.getByText('Find the level · Set 4 of 11')).toBeVisible();
  await dialog.getByRole('button', { name: 'h', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expectToast(page, 'Reading at set 3. Next sounds: b n v');
  await expect(stageLine(page)).toHaveText('Reading at set 3. Next sounds: b n v');

  // An own sound and an own word.
  await page.getByLabel('Add a sound').fill('oa');
  await page.getByRole('button', { name: 'Add a sound' }).click();
  await expect(page.getByRole('checkbox', { name: 'Sound oa', exact: true })).toBeChecked();
  await page.getByLabel('Add a word').fill('said');
  await page.getByRole('button', { name: 'Add a word' }).click();
  await expect(page.getByRole('checkbox', { name: 'Tricky word said', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Tricky word I', exact: true })).toBeChecked();

  // Print preferences.
  await page.getByRole('checkbox', { name: /Print Rowan Example's name on the cover/ }).uncheck();
  await page.getByRole('radio', { name: 'Flat (A5 pages)' }).check();

  await api.waitForState((s) => s.reading?.[ROWAN]?.prefs?.layout === 'flat' && s.reading[ROWAN].tricky?.includes('said'));
  const saved = (await api.getState()).state.reading[ROWAN];
  expect(new Set(saved.graphemes)).toEqual(new Set([...SET12, 'o', 'd', 'g', 'l', 'h', 'oa']));
  expect(saved.prefs).toEqual({ nameOnCover: false, layout: 'flat' });
  expect(saved).not.toHaveProperty('stage');

  await page.reload();
  await expect(stageLine(page)).toHaveText('Reading at set 3. Next sounds: b n v');
  await expect(page.getByRole('checkbox', { name: 'Sound h', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Sound oa', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Flat (A5 pages)' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Print Rowan Example's name/ })).not.toBeChecked();
  await shot('reading-setup');
  // The tricky words are the parent's now; back to the usual ones.
  await page.getByRole('button', { name: 'Back to the usual words' }).click();
  await expect(page.getByRole('checkbox', { name: 'Tricky word said', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Tricky word go', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test('the books page lists only books within the code and follows a new tick', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: withReading({ graphemes: SET1 }), hash: `learner/${ROWAN}/books` });
  await expect(page.getByRole('heading', { level: 1, name: 'Books for Rowan Example' })).toBeVisible();
  const ready = page.locator('#bank-list article');
  await expect(ready).toHaveCount(3);
  await expect(ready.getByRole('heading')).toHaveText(['Tap, tap', 'Tass sat', 'Pat at a tap']);
  await expect(ready.first().getByRole('button', { name: 'Print booklet' })).toBeVisible();
  await expect(ready.first().getByRole('button', { name: 'Print flat' })).toBeVisible();
  await expect(ready.first().getByRole('button', { name: 'Save to library' })).toBeVisible();
  // Just beyond: muted, with what they need, and no print buttons.
  const pip = page.locator('#beyond-list article', { hasText: 'Pip the cat' });
  await expect(pip.locator('.needs')).toHaveText('needs: i m f c; tricky: the is');
  await expect(pip.getByRole('button')).toHaveCount(0);
  await expect(page.locator('#beyond-list')).not.toContainText('A bee in a tree');

  // Tick set 2 on the setup page; the books follow (Set 2 first, Set 1 last).
  await page.getByRole('button', { name: 'Change the sounds' }).click();
  await fieldset(page, 2).getByRole('checkbox', { name: 'Whole set 2', exact: true }).check();
  await expect(stageLine(page)).toHaveText('Reading at set 2. Next sounds: o d g l');
  await page.getByRole('button', { name: 'Books for Rowan Example' }).click();
  await expect(page).toHaveURL(new RegExp(`#learner/${ROWAN}/books$`));
  await expect(ready).toHaveCount(6);
  await expect(ready.getByRole('heading')).toHaveText([
    'Pip the cat',
    'Caps',
    'Mim at the mat',
    'Tap, tap',
    'Tass sat',
    'Pat at a tap',
  ]);
  await expect(page.locator('#beyond-list')).toContainText('Dot the dog');
  await expect(page.locator('#beyond-list')).toContainText('needs: o d g');
  await shot('books-page');

  // Save a bank book to the library; it survives a reload.
  await ready.filter({ hasText: 'Caps' }).getByRole('button', { name: 'Save to library' }).click();
  await expectToast(page, '“Caps” is in the library');
  await page.reload();
  await expect(page.locator('#library-list article').getByRole('heading')).toHaveText(['Caps']);
  await page.locator('#library-list article').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('#library-list article')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('make a new book: a printable story from the code, saved to the library', async ({ page, api, gotoApp, shot, errors }) => {
  await gotoApp({ seed: withReading({ graphemes: SET12 }), hash: `learner/${ROWAN}/books` });
  // The newest set is the default focus.
  const focus = page.locator('#focus');
  for (const g of ['i', 'm', 'f', 'c']) await expect(focus.getByRole('button', { name: g, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(focus.getByRole('button', { name: 's', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // A focus sound can be turned off and on again before making the book.
  await focus.getByRole('button', { name: 'c', exact: true }).click();
  await expect(focus.getByRole('button', { name: 'c', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // The page re-renders; the keyboard focus stays on the sound just pressed.
  await expect(focus.getByRole('button', { name: 'c', exact: true })).toBeFocused();
  await focus.getByRole('button', { name: 'c', exact: true }).click();
  await expect(focus.getByRole('button', { name: 'c', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Make a book' }).click();
  const made = page.locator('#made article');
  await expect(made.locator('.made-pages li')).toHaveCount(6);
  const firstPages = await made.locator('.made-pages li').allTextContents();
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await expect.poll(() => made.locator('.made-pages li').allTextContents()).not.toEqual(firstPages);
  await expect(page.getByRole('button', { name: 'Shuffle' })).toBeFocused();
  await page.getByRole('radio', { name: '12 pages' }).check();
  await expect(made.locator('.made-pages li')).toHaveCount(10);
  // Every sentence uses only set 1 and 2 sounds and the tricky words the, is.
  const texts = await made.locator('.made-pages li').allTextContents();
  for (const t of texts) {
    for (const w of t.split(/\s+/).map((x) => x.replace(/[^A-Za-z]/g, '').toLowerCase()).filter(Boolean)) {
      expect(['the', 'is'].includes(w) || /^[satpimfc]+$/.test(w), `${w} in "${t}"`).toBe(true);
    }
  }
  await shot('make-a-book');

  // A new book prints as a booklet or flat; one button each, no third Print.
  await expect(made.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
  // The booklet: 12 pages on six sides.
  const booklet = await printWindow(page, made.getByRole('button', { name: 'Print booklet' }));
  await expect(booklet.locator('.sheet')).toHaveCount(6);
  await expect(booklet.locator('section.page')).toHaveCount(12);
  await expect(booklet.locator('.sheet').first()).toHaveAttribute('data-pages', '12,1');
  await booklet.close();

  await made.getByRole('button', { name: 'Save to library' }).click();
  const title = await made.getByRole('heading').textContent();
  await expectToast(page, `“${title}” is in the library`);
  await api.waitForState((s) => s.reading?.[ROWAN]?.library?.length === 1);
  const saved = (await api.getState()).state.reading[ROWAN].library[0];
  expect(saved.book.pages.map((p) => p.text)).toEqual(texts);
  expect(JSON.stringify(saved)).not.toContain('Rowan');
  await page.reload();
  const entry = page.locator('#library-list article');
  await expect(entry.getByRole('heading')).toHaveText(title);
  await expect(entry).toContainText('saved Oct 7, 2026');
  expect(errors).toEqual([]);
});

test('print view: both layouts, sheet counts, and the name on the cover only when asked', async ({ page, gotoApp, shot, errors }) => {
  await gotoApp({ seed: withReading({ graphemes: SET12 }), hash: `learner/${ROWAN}/books` });
  const caps = page.locator('#bank-list article', { hasText: 'Caps' });

  const booklet = await printWindow(page, caps.getByRole('button', { name: 'Print booklet' }));
  await expect(booklet).toHaveTitle('Caps (booklet)');
  await expect(booklet.locator('.sheet')).toHaveCount(4);
  expect(await booklet.locator('.sheet').evaluateAll((els) => els.map((e) => e.dataset.pages))).toEqual(['8,1', '2,7', '6,3', '4,5']);
  await expect(booklet.getByText('Print double-sided, flip on the short edge; fold; staple.')).toBeVisible();
  await expect(booklet.locator('.cover h1')).toHaveText('Caps');
  await expect(booklet.locator('.cover .owner .line')).toHaveText('Rowan Example');
  await expect(booklet.locator('.story .num')).toHaveText(['2', '7', '6', '3', '4', '5']);
  // Andika, from this server.
  expect(await booklet.evaluate(async () => { await document.fonts.ready; return document.fonts.check('30pt Andika'); })).toBe(true);
  // The folding note is not printed.
  await booklet.emulateMedia({ media: 'print' });
  await expect(booklet.locator('.note')).toBeHidden();
  await booklet.emulateMedia({ media: 'screen' });
  await shot('print-booklet', { target: booklet });
  await booklet.close();

  const flat = await printWindow(page, caps.getByRole('button', { name: 'Print flat' }));
  await expect(flat).toHaveTitle('Caps (flat)');
  await expect(flat.locator('.sheet')).toHaveCount(0);
  expect(await flat.locator('section.page').evaluateAll((els) => els.map((e) => e.dataset.page))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  await expect(flat.locator('.text').first()).toHaveText('A cap.');
  await expect(flat.locator('.back')).toContainText('Words to sound out');
  await flat.close();

  // The preference off: the owner line is empty.
  await page.getByRole('button', { name: 'Change the sounds' }).click();
  await page.getByRole('checkbox', { name: /Print Rowan Example's name on the cover/ }).uncheck();
  await page.getByRole('button', { name: 'Books for Rowan Example' }).click();
  const plain = await printWindow(page, page.locator('#bank-list article', { hasText: 'Caps' }).getByRole('button', { name: 'Print booklet' }));
  await expect(plain.locator('.cover .owner .line')).toHaveText('');
  await expect(plain.locator('body')).not.toContainText('Rowan');
  await plain.close();
  expect(errors).toEqual([]);
});
