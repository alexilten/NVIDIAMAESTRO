import { describe, expect, it } from 'vitest';
import { addItem, groupItems } from '../src/core/compose';
import { sampleExhibition } from '../src/core/exhibitionSample';
import { resolveRef } from '../src/core/library';
import { auditText, buildClientPackage, clientHtml, fitDistance, presetViews, safeUrl, secretsFor, viewsFor, EYE_HEIGHT, type AuditPart, type ClientItemInfo, type ProjectDoc } from '../src/core/presentation';
import type { Composition, Placement, Vec3 } from '../src/core/schema';
import { moduleTag } from '../src/core/sheet';

const box = { min: [-5000, -4000, 0] as Vec3, max: [5000, 4000, 2400] as Vec3 };

describe('views', () => {
  it('generates five views, all but the plan from the front (−Y) side', () => {
    const v = presetViews(box);
    expect(v.map((x) => x.preset)).toEqual(['hero', 'front', 'aerial', 'visitor', 'plan']);
    for (const x of v.filter((x) => x.preset !== 'plan')) expect(x.eye[1]).toBeLessThan(box.min[1]);
    const plan = v.find((x) => x.preset === 'plan')!;
    expect(Math.abs(plan.eye[0] - plan.target[0])).toBeLessThan(1);
    expect(Math.abs(plan.eye[1] - plan.target[1])).toBeLessThan(5);
    expect(plan.eye[2]).toBeGreaterThan(box.max[2]);
  });

  it('puts the visitor at standing eye height in the aisle', () => {
    const v = presetViews(box).find((x) => x.preset === 'visitor')!;
    expect(v.eye[2]).toBe(EYE_HEIGHT.value);
    expect(EYE_HEIGHT.status).toBe('estimated');
    expect(v.eye[1]).toBeLessThan(box.min[1] - 1000);
  });

  it('stands far enough back for the extent to fit the frame', () => {
    for (const fov of [20, 30, 50]) {
      const d = fitDistance(1000, fov, 16 / 9, 1);
      expect(Math.sin(((fov * Math.PI) / 180) / 2) * d).toBeGreaterThanOrEqual(999.9);
    }
    // the elevation fits the full width in the 16:9 frame
    const f = presetViews(box).find((x) => x.preset === 'front')!;
    const half = Math.tan(((f.fov * Math.PI) / 180) / 2) * (16 / 9) * (f.target[1] - f.eye[1] - 4000);
    expect(half).toBeGreaterThanOrEqual(5000);
  });

  it('lists saved views after the generated ones', () => {
    const c: Composition = { ...sampleExhibition(), views: [{ id: 'v1', name: 'Hero for client', eye: [1, 2, 3], target: [0, 0, 0], fov: 30 }] };
    expect(viewsFor(c, box).map((v) => v.name).slice(-1)).toEqual(['Hero for client']);
    expect(viewsFor(c, null)).toHaveLength(1);
  });
});

describe('document links', () => {
  it('keeps only plain web links', () => {
    expect(safeUrl('https://example.com/a b')).toBe('https://example.com/a%20b');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<b>x</b>')).toBeUndefined();
    expect(safeUrl('file:///etc/passwd')).toBeUndefined();
    expect(safeUrl('not a url')).toBeUndefined();
  });
});

// a placed imported part with a private record, as the Import workspace would leave it
const PART: AuditPart = {
  name: 'Gallery Plinth',
  notes: 'Supplier quote pending from fabricator',
  approvedBy: 'J. Reviewer',
  source: { fileName: 'Client_Show_Master_R7.3dm', sha256: 'a'.repeat(64), block: 'NV_PART_Gallery Plinth', description: 'Exact copy of Show R2 block PLINTH', geometryHash: '00abcdef123456' },
  docs: [{ title: 'PLINTH BUILD DRAWINGS', document: 'Client Fabrication Deck.pdf', reference: '260101-NV-01-02-R1' }],
  checks: [{ note: 'Drawing shows 600, model 610; kept the model' }],
};

function withPart(): { comp: Composition; resolve: (p: Placement) => ClientItemInfo | null } {
  let c = sampleExhibition();
  const r = addItem(c, { kind: 'ingested', id: 'part-x', version: 2 }, 'Gallery Plinth', [600, 600, 900], [0, 0, 0], 2);
  c = groupItems(r.comp, [r.id], 'Plinth module').comp;
  const docs: ProjectDoc[] = [
    { id: 'd1', title: 'Venue exhibitor manual', kind: 'venue', url: 'https://venue.example/manual.pdf', confidential: false, addedAt: '' },
    { id: 'd2', title: 'Internal cost plan v3', kind: 'other', url: 'https://drive.example/secret-cost', reference: 'COST-2026-07', confidential: true, addedAt: '' },
    { id: 'd3', title: 'Plinth module render', kind: 'render', url: 'https://share.example/r1', confidential: false, moduleId: c.groups[c.groups.length - 1].id, addedAt: '' },
    { id: 'd4', title: 'Bad link', kind: 'other', url: 'javascript:alert(1)', confidential: false, addedAt: '' },
  ];
  c = { ...c, docs };
  const resolve = (p: Placement): ClientItemInfo | null => {
    if (p.ref.kind === 'ingested') return { name: PART.name, source: 'project', status: 'project', dims: [600, 600, 900], category: 'Pedestals' };
    const e = resolveRef(p.ref, [])?.entry;
    return e ? { name: e.name, source: e.section, status: e.verification, dims: e.dims, category: e.group } : null;
  };
  return { comp: c, resolve };
}

describe('client view', () => {
  it('lists items by name and status, shared documents only, with the notices', () => {
    const { comp, resolve } = withPart();
    const pkg = buildClientPackage(comp, { resolve, overall: [8600, 6950, 2700], moduleTag, now: '2026-10-26T12:00:00Z' });
    expect(pkg.items.reduce((n, r) => n + r.count, 0)).toBe(comp.items.length);
    expect(pkg.items.find((r) => r.name === 'Gallery Plinth')).toMatchObject({ source: 'Project build · Pedestals', status: 'project', count: 1 });
    expect(pkg.docs.map((d) => d.title)).toEqual(['Venue exhibitor manual', 'Bad link']);
    expect(pkg.docs[1].url).toBeUndefined();
    expect(pkg.modules.at(-1)).toMatchObject({ name: 'Plinth module', docs: [{ title: 'Plinth module render' }] });
    expect(pkg.booth?.open).toEqual(['front', 'left']);
    expect(pkg.notices.join(' ')).toMatch(/not endorsed by NVIDIA/);
  });

  it('writes one page with no scripts, no outside requests and escaped text', () => {
    const { comp, resolve } = withPart();
    const c = { ...comp, name: 'Booth <script>alert(1)</script>' };
    const html = clientHtml(buildClientPackage(c, { resolve, overall: null, stills: [{ name: 'Hero', src: 'data:image/png;base64,iVBORw0KGgo=' }] }));
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('Booth &lt;script&gt;');
    expect(html).toContain("default-src 'none'");
    // the only URLs are shared document links, opened by the reader
    const srcs = [...html.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.every((s) => s.startsWith('data:image/'))).toBe(true);
    expect(html).not.toContain('javascript:');
  });

  it('shows none of the private record of the parts it contains', () => {
    const { comp, resolve } = withPart();
    const secrets = secretsFor(comp, [PART], [PART.name]);
    expect(secrets.map((s) => s.value)).toEqual(expect.arrayContaining(['Client_Show_Master_R7.3dm', 'NV_PART_Gallery Plinth', '260101-NV-01-02-R1', 'Internal cost plan v3', 'https://drive.example/secret-cost', 'J. Reviewer']));
    // the venue manual is shared, so it is not a secret
    expect(secrets.some((s) => s.value.includes('venue.example'))).toBe(false);
    const html = clientHtml(buildClientPackage(comp, { resolve, overall: null }));
    expect(auditText(html, secrets)).toEqual([]);
  });

  it('catches a private value typed into a name', () => {
    const { comp, resolve } = withPart();
    const leaky = { ...comp, groups: comp.groups.map((g, k) => (k === 0 ? { ...g, name: 'From Client_Show_Master_R7.3dm' } : g)) };
    const secrets = secretsFor(leaky, [PART], [PART.name]);
    const leaks = auditText(clientHtml(buildClientPackage(leaky, { resolve, overall: null })), secrets);
    expect(leaks.map((l) => l.what)).toEqual(['source file of Gallery Plinth']);
  });

  it('ignores inline image data when auditing', () => {
    expect(auditText('<img src="data:image/png;base64,QUJDREVGR0g=">', [{ what: 'x', value: 'QUJDREVGR0g' }])).toEqual([]);
  });
});
