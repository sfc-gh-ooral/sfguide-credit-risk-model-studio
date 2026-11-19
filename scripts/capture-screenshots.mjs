// Captures the landing-page screenshots and catalog card images from the hosted example.
//
//   npm run build:example        # refresh docs/try/ first if the UI changed
//   npm run capture              # writes docs/images/*.png and docs/catalog/*.jpg
//
// Runs headless Chromium at a fixed 1600x1000 viewport against docs/try/ served locally, so no
// sign-in, account URL, or user name can appear: only the bundled synthetic data. The walkthrough
// runs in one browser context per pass, so the story (drift → challenger → promotion → queue)
// carries from shot to shot. Review every image before publishing anyway.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const BASE = '/sfguide-credit-risk-model-studio/try'; // must match basePath in next.config.ts
const CARD_ID = 'credit-risk-model-studio';
const VIEWPORT = { width: 1600, height: 1000 };

const scrollTo = (text) => async (page) => { await page.getByText(text, { exact: false }).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(400); };

// Landing-page order. `card` marks which shots become catalog cards (in that order).
const SHOTS = [
  { name: '01-portfolio', card: 1, path: '/' },
  {
    name: '02-monitoring', card: 2, path: '/monitoring/',
    async act(page) {
      await page.getByRole('button', { name: /Run drift check/ }).click();
      await page.getByText('Sample result').waitFor({ timeout: 20000 });
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  { name: '03-workbench', card: 3, path: '/workbench/' },
  {
    name: '04-model-card', card: 4, path: '/model-card/?version=V2',
    async act(page) {
      await page.getByRole('button', { name: /Draft with AI/ }).click();
      await page.getByText('Sample AI response').waitFor({ timeout: 20000 });
      // Frame the fairness finding and the full AI draft below the sticky header.
      await page.evaluate(() => { const el = [...document.querySelectorAll('.eyebrow')].find((e) => e.textContent?.startsWith('Fairness')); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 130); });
    },
  },
  {
    name: '05-promotion', path: null, noSettle: true,
    async act(page) {
      await page.getByRole('button', { name: /Approve and promote V2/ }).click();
      await page.getByText('Running SCORE_PORTFOLIO_TASK').waitFor();
      await page.waitForTimeout(3200);
    },
  },
  {
    name: '06-queue', card: 5, path: '/queue/',
    async before(page) { await page.getByRole('link', { name: /See the refreshed queue/ }).waitFor({ timeout: 30000 }); },
  },
  {
    name: '07-account', card: 6, path: null,
    async act(page) { await page.locator('tbody tr').first().click(); await page.getByText('Why the score moved').waitFor(); },
  },
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(BASE)) { res.writeHead(404).end(); return; }
    let file = normalize(join(DOCS, 'try', decodeURIComponent(url.pathname.slice(BASE.length))));
    if (!file.startsWith(join(DOCS, 'try'))) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1600); // count-ups and chart entrance animations
}

async function pass(browser, origin, scale) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: scale, colorScheme: 'light', locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await context.newPage();
  for (const shot of SHOTS) {
    if (shot.before) await shot.before(page);
    if (shot.path) { await page.goto(origin + shot.path); await settle(page); }
    if (shot.act) { await shot.act(page); if (!shot.noSettle) await page.waitForTimeout(900); }
    const out = scale === 1 ? join(DOCS, 'images', `${shot.name}.png`) : shot.card ? join(DOCS, 'catalog', `${CARD_ID}-${shot.card}.jpg`) : null;
    if (!out) continue;
    await page.screenshot({ path: out, ...(out.endsWith('.jpg') ? { type: 'jpeg', quality: 76 } : {}) });
    console.log(`${out.replace(ROOT + '/', '')}  ${Math.round(statSync(out).size / 1024)} KB`);
  }
  await context.close();
}

async function main() {
  if (!existsSync(join(DOCS, 'try', 'index.html'))) throw new Error('docs/try/ is missing. Run `npm run build:example` first.');
  mkdirSync(join(DOCS, 'images'), { recursive: true });
  mkdirSync(join(DOCS, 'catalog'), { recursive: true });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}${BASE}`;
  const browser = await chromium.launch();
  try {
    await pass(browser, origin, 1);    // 1600x1000 PNGs for the landing page
    await pass(browser, origin, 0.6);  // 960x600 JPGs for the catalog card
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((failure) => { console.error(failure.message); process.exit(1); });
