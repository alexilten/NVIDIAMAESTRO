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
await pick('GIGABYTE GB200 NVL72 rack'); await shot('02-discover-gb200-rack');
await pick('Jetson AGX Thor'); await shot('03-discover-thor-estimated');
await page.fill('.search input', 'taller than 2m'); await shot('04-search-dimensions');
await page.fill('.search input', '');
await pick('Demo counter');
await page.locator('.ctl', { hasText: 'Accessible' }).locator('input').fill('900');
await shot('05-kit-counter-accessible');
await pick(/^NVIDIA Vera Rubin NVL72Reference/); await shot('06-discover-reference-architecture');
// Round 02 line-up
await page.fill('.search input', 'DGX Station'); await pick('GIGABYTE W775'); await shot('10-discover-dgx-station-gigabyte');
await page.fill('.search input', 'spectrum'); await pick('SN6800-LD'); await shot('11-discover-sn6800-photonics');
await page.fill('.search input', 'RTX PRO 6000 Blackwell Workstation Edition'); await pick(/^NVIDIA RTX PRO 6000 Blackwell Workstation Edition/); await shot('12-discover-rtx-pro-6000-ws');
await page.fill('.search input', 'DGX Vera Rubin'); await pick('DGX Vera Rubin NVL72 rack'); await shot('13-discover-placeholder-rack');
await page.fill('.search input', '');

// compose a module
await page.locator('.segmented button', { hasText: 'Compose' }).click();
for (const n of ['Demo counter', 'DGX Spark', 'Hardware light table', 'DGX B200', 'MSI XpertStation', 'SN6600 Ethernet']) await page.locator('.panel.left .cat-item', { hasText: n }).first().click();
await page.locator('.chip', { hasText: 'Frame all' }).click();
await page.locator('.tree-item').nth(1).click();
await shot('07-compose-module');
// Round 03: templates, place on surface, power schedule, sheet
const deselect = () => page.mouse.click(800, 140);
await deselect();
await page.locator('button', { hasText: 'New module' }).click();
for (const t of ['DGX Spark demo counter', 'RTX PRO board niche', 'Spectrum-X switch table']) { await page.locator('.link-row', { hasText: t }).click(); await page.waitForTimeout(300); await deselect(); }
await deselect();
await page.locator('.chip', { hasText: 'Frame all' }).click();
await shot('14-compose-templates');
await page.locator('.tree-item', { hasText: 'RTX PRO 5000' }).click();
await page.locator('button', { hasText: 'Place on Gallery niche' }).click();
await shot('15-compose-place-on-shelf');
await deselect();
await page.locator('.section', { hasText: 'Power and data' }).first().scrollIntoViewIfNeeded();
await shot('16-compose-power-schedule');
// the A3 sheet the module exports, rendered from the sample file written by export:samples
const sheet = await browser.newPage({ viewport: { width: 1587, height: 1123 } });
await sheet.goto(new URL('../samples/demo-modules.sheet.svg', import.meta.url).href);
await sheet.screenshot({ path: `${out}/17-elevation-sheet.png` });
await sheet.close();
console.log('saved 17-elevation-sheet');
// Round 04: the exhibition workspace opens on the sample corner booth
await page.locator('.segmented button', { hasText: 'Exhibition' }).click();
await page.waitForSelector('.unit-row');
await shot('18-exhibition-sample-booth');
await page.locator('.chip', { hasText: 'Plan' }).click();
await shot('19-exhibition-plan-circulation');
// close both open sides: every module loses its approach
for (const side of ['Front (−Y) open', 'Left (−X) open']) await page.locator('.check-row', { hasText: side }).locator('input').uncheck();
await page.locator('.section', { hasText: 'Checks' }).first().scrollIntoViewIfNeeded();
await shot('20-exhibition-closed-booth-checks');
for (const side of ['Front (−Y) open', 'Left (−X) open']) await page.locator('.check-row', { hasText: side }).locator('input').check();
await page.locator('button', { hasText: '+ Power + data' }).scrollIntoViewIfNeeded();
await shot('21-exhibition-service-points');
// Round 07: start the checks from the German rule set
await page.locator('summary', { hasText: 'Accessibility rules' }).click();
await page.selectOption('select[aria-label="Rule set"]', 'din-18040-1');
await page.locator('select[aria-label="Rule set"]').scrollIntoViewIfNeeded();
await shot('30-exhibition-din-rule-set');
await page.selectOption('select[aria-label="Rule set"]', 'ada-2010');
// Round 08: a hall column at the plot centre runs into a module
await page.locator('summary', { hasText: 'Columns' }).click();
await page.locator('button', { hasText: '+ Column' }).click();
await page.locator('.section', { hasText: 'Checks' }).first().scrollIntoViewIfNeeded();
await shot('32-exhibition-column-clash');
await page.locator('.svc-row', { has: page.locator('input[aria-label="Column name"]') }).locator('button[title="Remove"]').click();
const plan = await browser.newPage({ viewport: { width: 1587, height: 1123 } });
await plan.goto(new URL('../samples/sample-booth.plan.svg', import.meta.url).href);
await plan.screenshot({ path: `${out}/22-booth-plan-sheet.png` });
await plan.close();
console.log('saved 22-booth-plan-sheet');
// Round 06: presentation of the sample booth
await page.locator('.segmented button', { hasText: 'Present' }).click();
await page.waitForSelector('.view-row');
await shot('26-present-three-quarter');
const doc = async (title, url, shared) => {
  await page.fill('.doc-form input[aria-label="Document title"]', title);
  await page.fill('.doc-form input[aria-label="Document link"]', url);
  if (shared) await page.locator('.doc-form .check-row input').uncheck();
  await page.locator('.doc-form button', { hasText: 'Add link' }).click();
};
await page.selectOption('.doc-form select[aria-label="Document kind"]', 'venue');
await doc('Venue exhibitor manual', 'https://example.com/venue-manual.pdf', true);
await doc('Internal cost plan', 'https://example.com/private/cost-plan', false);
await page.locator('.view-row', { hasText: 'Visitor eye level' }).locator('button').click();
await page.locator('.doc-form').scrollIntoViewIfNeeded();
await shot('27-present-visitor-document-links');
await page.locator('button', { hasText: 'Render all' }).click();
await page.waitForSelector('.still', { timeout: 180000 });
await page.locator('.audit').scrollIntoViewIfNeeded();
await shot('28-present-stills-audit');
// Round 07: the Hall look, with a still of the three-quarter view
await page.locator('.view-row', { hasText: 'Three-quarter' }).locator('button').click();
await page.locator('.wide-seg button', { hasText: 'Hall' }).click();
await page.locator('button', { hasText: 'Render view' }).click();
await page.waitForTimeout(4000);
await shot('31-present-hall-look');
await page.locator('.wide-seg button', { hasText: 'Studio' }).click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Save .html' }).click()]);
const clientFile = `${out}/.client-view.html`;
await dl.saveAs(clientFile);
const cv = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await cv.goto(new URL(clientFile, `file://${process.cwd()}/`).href);
await cv.screenshot({ path: `${out}/29-client-view.png`, fullPage: true });
await cv.close();
(await import('node:fs')).rmSync(clientFile);
console.log('saved 29-client-view');
await page.locator('.segmented button', { hasText: 'Import' }).click();
await shot('08-import-intro');
// Round 05: batch extraction and a revision diff, on the synthetic two-revision model (scripts/fixture-files.ts)
const fx = process.argv[4];
if (fx) {
  await page.locator('input[type=file][accept=".3dm"]').first().setInputFiles(`${fx}/synthetic-show-r1.3dm`);
  await page.waitForSelector('.batch-bar');
  await page.locator('button', { hasText: 'Select new kit candidates' }).click();
  await shot('23-import-batch-plan');
  await page.locator('.sheet-actions button.primary').click();
  await page.waitForSelector('.pstate.proposed');
  await page.locator('.source-card').first().click();
  await shot('24-import-batch-done');
  await page.locator('input[type=file][accept=".3dm"]').nth(1).setInputFiles(`${fx}/synthetic-show-r2.3dm`);
  await page.waitForSelector('.impact');
  await shot('25-import-revision-diff');
  // Round 08: the synthetic drawing PDF links both parts to one page, reviewed together
  await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles(`${fx}/synthetic-show-drawings.pdf`);
  await page.locator('.tree-item', { hasText: 'p.2' }).click();
  await page.waitForSelector('text=Confirm page for all');
  await page.locator('button', { hasText: 'Confirm page for all' }).click();
  await page.selectOption('select[aria-label="Measure"]', 'overall height');
  await page.fill('input[aria-label="Drawing value in mm"]', '945');
  await page.locator('button', { hasText: 'Check all' }).click();
  await shot('33-import-group-review');
  await page.locator('button', { hasText: 'Approve ready parts' }).click();
  await page.waitForSelector('.batch-report');
  await shot('34-import-group-approved');
}
await page.locator('.logo').click(); await shot('09-about');
await browser.close();
if (errors.length) { console.log('page errors:\n' + errors.join('\n')); process.exitCode = 1; }
