/**
 * Write the synthetic test models to disk (two revisions of a tiny feet-unit model) for screenshots and manual
 * tries of Import. They are built in code; no project file is involved. Usage: vite-node scripts/fixture-files.ts [dir]
 */
import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFixture } from '../tests/fixture';

const dir = process.argv[2] ?? 'samples/fixtures';
const rh = await rhino3dm();
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/synthetic-show-r1.3dm`, buildFixture(rh));
writeFileSync(`${dir}/synthetic-show-r2.3dm`, buildFixture(rh, true));
console.log(`${dir}/synthetic-show-r1.3dm, ${dir}/synthetic-show-r2.3dm`);
