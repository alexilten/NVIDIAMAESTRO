/**
 * Write the synthetic test models to disk (two revisions of a tiny feet-unit model, a text-only drawing PDF and a show presets file) for screenshots and manual
 * tries of Import. They are built in code; no project file is involved. Usage: vite-node scripts/fixture-files.ts [dir]
 */
import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFixture } from '../tests/fixture';
import { sampleExhibition } from '../src/core/exhibitionSample';
import type { ShowPresetFile } from '../src/core/showPresets';

const dir = process.argv[2] ?? 'samples/fixtures';
const rh = await rhino3dm();
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/synthetic-show-r1.3dm`, buildFixture(rh));
writeFileSync(`${dir}/synthetic-show-r2.3dm`, buildFixture(rh, true));
writeFileSync(`${dir}/synthetic-show-drawings.pdf`, textPdf([
  ['SYNTHETIC SHOW', 'Fabrication package, cover'],
  ['TEST PLINTH AND SIGN BUILD DRAWINGS', 'Test plinth (pedestal) with cap plate, overall height 945', 'Header sign, signage panel 1219 wide', 'Drawing SYN-002'],
  ['GENERAL NOTES', 'Finishes and fixings'],
  ['FLOORING', 'Raised floor and ramps'],
  ['LIGHTING', 'Rig and fixtures'],
]));
// two invented booths for one invented show: the sample booth, and the same layout on a plot stepped at the back right
const plain = { ...sampleExhibition(), id: 'comp-synthetic-plain', name: 'Synthetic Show booth A' };
const step = structuredClone(plain);
step.id = 'comp-synthetic-stepped'; step.name = 'Synthetic Show booth B';
step.booth!.outline = [[-5000, -4000], [5000, -4000], [5000, 1000], [2000, 1000], [2000, 4000], [-5000, 4000]];
const shows: ShowPresetFile = {
  schema: 'maestro.show-presets', version: 1, name: 'Synthetic shows', exportedAt: '2026-10-27T00:00:00.000Z',
  presets: [
    { id: 'synthetic-a', show: 'Synthetic Show', edition: '2027', name: 'Booth A', summary: 'Corner plot, two open sides, six modules', sources: ['Built in code: scripts/fixture-files.ts'], comp: plain },
    { id: 'synthetic-b', show: 'Synthetic Show', edition: '2027', name: 'Booth B', summary: 'The same plot stepped at the back right', sources: ['Built in code: scripts/fixture-files.ts'], comp: step },
  ],
};
writeFileSync(`${dir}/synthetic.maestro-shows.json`, JSON.stringify(shows));
console.log(`${dir}/synthetic-show-r1.3dm, ${dir}/synthetic-show-r2.3dm, ${dir}/synthetic-show-drawings.pdf, ${dir}/synthetic.maestro-shows.json`);

/** a plain text PDF, one page per entry, so the drawing-page tools have something synthetic to index */
function textPdf(pages: string[][]): Uint8Array {
  const objs: string[] = [];
  const add = (o: string) => objs.push(o) - 1 + 1;
  const kids = pages.map(() => 0);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((lines, i) => {
    const text = lines.map((l, j) => `BT /F1 ${j ? 12 : 18} Tf 60 ${760 - j * 28} Td (${l.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj ET`).join('\n');
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids[i] = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
