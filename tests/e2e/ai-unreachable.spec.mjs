// Runs against an app server whose AI provider is configured but not running
// (nothing listens on PORTS.deadAi). With HAR-13 the controls stay (no chips),
// and a failure says plainly that the provider could not be reached.
import { test, expect, modal } from './fixtures.mjs';
import { TOPICS } from './support/family.mjs';

const ONE = TOPICS.oneToOne;
const UNREACHABLE = 'Harrington couldn’t reach the AI provider. Check that it’s running, then try again.';
const section = (page, title) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

test('health says AI is configured; /api/ai answers 502 "unreachable"', async ({ request }) => {
  expect((await (await request.get('/api/health')).json()).aiConfigured).toBe(true);
  const res = await request.post('/api/ai', { data: { messages: [{ role: 'user', content: 'hi' }], capability: 'explain' } });
  expect(res.status()).toBe(502);
  expect((await res.json()).error).toBe('The AI provider is unreachable');
});

test('AI helper: the controls stay, and a failure says the provider could not be reached', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  await expect(page.getByRole('heading', { level: 1, name: ONE.name })).toBeVisible();
  // The provider is configured, so no chips.
  await expect(page.getByRole('link', { name: 'Needs a local AI provider' })).toHaveCount(0);
  // The banner says the provider is set up, never that it is connected (F4).
  await expect(page.getByText('Self-hosted preview · family data stays on this server · AI provider set up')).toBeVisible();
  await expect(page.getByText(/connected/i)).toHaveCount(0);

  const helper = section(page, 'AI teaching helper');
  await helper.getByRole('button', { name: 'Explain simply' }).click();
  await expect(helper).toContainText(UNREACHABLE);
  // The server's own wording never reaches the parent.
  await expect(helper).not.toContainText('The AI provider is unreachable');
  await expect(helper.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(helper.getByRole('link', { name: 'How to set one up' })).toHaveCount(0);
  await shot('helper-unreachable', { locator: helper });

  // Trying again fails the same way, without stacking messages.
  await helper.getByRole('button', { name: 'Try again' }).click();
  await expect(helper.getByText(UNREACHABLE)).toHaveCount(1);
});

test('full lesson: the unreachable message with Try again, not a spinner', async ({ page, gotoApp, shot }) => {
  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  await page.getByRole('button', { name: 'Open full lesson' }).click();
  await expect(modal(page)).toContainText(UNREACHABLE);
  await expect(modal(page).getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(modal(page).getByText(/Writing|Preparing/)).toHaveCount(0);
  await shot('lesson-unreachable', { full: false });
});

test('activity instructions: the same message, not the lesson\'s wording (F10, fixed by HAR-13)', async ({ page, gotoApp }) => {
  await gotoApp({ seed: {}, hash: `topic/${ONE.id}` });
  await section(page, 'Activities & games').getByRole('button', { name: /Kitchen counter maths/ }).click();
  await expect(modal(page)).toContainText(UNREACHABLE);
  await expect(modal(page)).not.toContainText(/Couldn.t create the lesson/);
  await expect(modal(page).getByRole('button', { name: 'Try again' })).toBeVisible();
});
