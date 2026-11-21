// End-to-end suite for Harrington. See docs/e2e/README.md.
//
//   npm run e2e            run everything (report, screenshots, recordings)
//   npm run e2e:ui-docs    wipe and regenerate docs/e2e/screenshots, record every test
//
// These servers are started for the run (ports from tests/e2e/support/env.mjs):
//   mock AI provider  -> 4311   tests/e2e/mock-ai-server.mjs
//   app with AI       -> 4312   node server.mjs, AI pointed at the mock
//   app without AI    -> 4313   node server.mjs, no provider (fail-closed)
//   AI unreachable    -> 4314   provider configured, nothing listening there
//   lessons only      -> 4315   AI pointed at the mock, HARRINGTON_AI_CAPABILITIES=lesson
//   access token      -> 4316   no AI provider, HARRINGTON_ACCESS_TOKEN set
//   settings          -> 4317   no AI in the environment; set in the app instead
// Each app gets a fresh temporary HARRINGTON_DATA_DIR. Tests share one server
// per project and reset the family state before each test, so they run serially.
// Servers are never reused: a Harrington already listening on these ports could
// be a real family's, and every test overwrites /api/state.
import { defineConfig, devices } from '@playwright/test';
import { resolveChromiumExecutable } from './tests/e2e/support/chromium.mjs';
import { PORTS, URLS } from './tests/e2e/support/env.mjs';

const CI = !!process.env.CI;
// Record every test when refreshing the docs; otherwise only the walkthroughs.
const videoEverywhere = process.env.E2E_VIDEO === 'all';
const executablePath = resolveChromiumExecutable();

const launchOptions = {
  // A mismatched local Playwright/Chromium pair still runs automatically:
  // resolveChromiumExecutable() checks E2E_CHROMIUM, then Playwright's default
  // revision, then any installed chromium_headless_shell/chromium in the cache.
  ...(executablePath ? { executablePath } : {}),
  // Fake microphone so the voice recorder works headless.
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
};

const shared = {
  locale: 'en-US',
  timezoneId: 'UTC',
  permissions: ['microphone'],
  launchOptions,
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: videoEverywhere ? 'on' : 'off',
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } };
const mobile = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
};

// Files with a project of their own; the desktop project runs everything else.
const SPECIAL = /(^|[\\/])(api|no-ai|observation|levelset|books|ai-unreachable|lessons-only|settings|mobile|walkthrough|walkthrough-mobile)\.spec\.mjs$/;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './tests/e2e/global-setup.mjs',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: shared,
  webServer: [
    {
      command: `node tests/e2e/mock-ai-server.mjs --port ${PORTS.mockAi}`,
      url: `${URLS.mockAi}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `node tests/e2e/start-app.mjs --port ${PORTS.appAi} --ai`,
      url: `${URLS.appAi}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node tests/e2e/start-app.mjs --port ${PORTS.appNoAi}`,
      url: `${URLS.appNoAi}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node tests/e2e/start-app.mjs --port ${PORTS.appAiUnreachable} --ai-unreachable`,
      url: `${URLS.appAiUnreachable}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node tests/e2e/start-app.mjs --port ${PORTS.appLessonsOnly} --ai --capabilities lesson`,
      url: `${URLS.appLessonsOnly}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node tests/e2e/start-app.mjs --port ${PORTS.appSettings}`,
      url: `${URLS.appSettings}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node tests/e2e/start-app.mjs --port ${PORTS.appToken} --token`,
      url: `${URLS.appToken}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    { name: 'api', testMatch: /(^|[\\/])api\.spec\.mjs$/, use: { baseURL: URLS.appAi } },
    {
      name: 'desktop',
      testIgnore: SPECIAL,
      use: { ...desktop, baseURL: URLS.appAi },
    },
    { name: 'no-ai', testMatch: /(^|[\\/])(no-ai|routes|observation|levelset|books)\.spec\.mjs$/, use: { ...desktop, baseURL: URLS.appNoAi } },
    { name: 'ai-unreachable', testMatch: /(^|[\\/])ai-unreachable\.spec\.mjs$/, use: { ...desktop, baseURL: URLS.appAiUnreachable } },
    { name: 'lessons-only', testMatch: /(^|[\\/])lessons-only\.spec\.mjs$/, use: { ...desktop, baseURL: URLS.appLessonsOnly } },
    { name: 'settings', testMatch: /(^|[\\/])settings\.spec\.mjs$/, use: { ...desktop, baseURL: URLS.appSettings } },
    // The phone project runs mobile.spec and the calendar, teaching-guide and curriculum tests tagged @mobile.
    { name: 'mobile', testMatch: /(^|[\\/])(mobile|calendar|teaching-guide|curriculum)\.spec\.mjs$/, grep: /mobile\.spec\.mjs|@mobile/, use: { ...mobile, baseURL: URLS.appAi } },
    {
      name: 'walkthrough',
      testMatch: /(^|[\\/])walkthrough\.spec\.mjs$/,
      use: { ...desktop, baseURL: URLS.appAi, video: { mode: 'on', size: { width: 1280, height: 900 } } },
    },
    {
      name: 'walkthrough-mobile',
      testMatch: /walkthrough-mobile\.spec\.mjs$/,
      use: { ...mobile, baseURL: URLS.appAi, video: { mode: 'on', size: { width: 390, height: 844 } } },
    },
  ],
});
