// Public screenshots of the built app (no project data). Usage: node scripts/screenshots.mjs [url] [outDir]
import { createRequire } from 'node:module';
// Playwright is not a project dependency: use the one installed on the machine
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/screenshots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
let step = 'start';
page.on('pageerror', (e) => errors.push(`[${step}] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { await page.waitForTimeout(1800); await page.screenshot({ path: `${out}/${name}.png` }); step = name; console.log('saved', name); };
const pick = (text) => page.locator('.cat-item', { hasText: text }).first().click();

await page.goto(url);
await page.waitForSelector('.cat-item');
await shot('01-discover-dgx-spark');
await pick('GIGABYTE'); await shot('02-discover-gb200-rack');
await pick('Jetson AGX Thor'); await shot('03-discover-thor-estimated');
await page.fill('.search input', 'taller than 2m'); await shot('04-search-dimensions');
await page.fill('.search input', '');
await pick('Demo counter');
await page.locator('.ctl', { hasText: 'Accessible' }).locator('input').fill('900');
await shot('05-kit-counter-accessible');
await pick('Vera Rubin'); await shot('06-discover-reference-architecture');

// compose a module
await page.locator('.segmented button', { hasText: 'Compose' }).click();
for (const n of ['Demo counter', 'DGX Spark', 'Hardware light table', 'DGX B200']) await page.locator('.panel.left .cat-item', { hasText: n }).first().click();
await page.locator('.chip', { hasText: 'Frame all' }).click();
await page.locator('.tree-item').nth(1).click();
await shot('07-compose-module');
await page.locator('.segmented button', { hasText: 'Import' }).click();
await shot('08-import-intro');
await page.locator('.logo').click(); await shot('09-about');
await browser.close();
if (errors.length) { console.log('page errors:\n' + errors.join('\n')); process.exitCode = 1; }
