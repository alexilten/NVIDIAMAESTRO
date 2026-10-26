import type { Composition, Placement, Vec3, Verification } from './schema';

/**
 * Presentation: named camera views of a composition, links to the project's documents, and the client view,
 * a read-only package that carries only what a client may see.
 *
 * Views are stored in the composition frame (mm, Z up, front toward −Y) so they survive a reload and travel
 * with the saved file; the viewport converts them to its own frame.
 */

export interface SavedView {
  id: string;
  name: string;
  /** camera position and the point it looks at, mm */
  eye: Vec3;
  target: Vec3;
  /** vertical field of view, degrees */
  fov: number;
  /** set for the generated views, which are recomputed when the composition changes */
  preset?: PresetId;
}

export type PresetId = 'hero' | 'front' | 'aerial' | 'visitor' | 'plan';
export const PRESET_LABEL: Record<PresetId, string> = {
  hero: 'Three-quarter', front: 'Front elevation', aerial: 'Aerial', visitor: 'Visitor eye level', plan: 'Plan',
};

/** standing eye height for the visitor view: a common design figure, not a measured one */
export const EYE_HEIGHT = { value: 1600, status: 'estimated' as Verification, note: 'Typical standing adult eye height used for sight lines; not a project figure.' };

export const STILL_ASPECT = 16 / 9;
export const STILL_SIZES = [
  { id: 'hd', label: '1920 × 1080', w: 1920, h: 1080 },
  { id: '4k', label: '3840 × 2160', w: 3840, h: 2160 },
] as const;

interface Box { min: Vec3; max: Vec3 }

const rad = (d: number) => (d * Math.PI) / 180;
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** how far back a camera must stand for a sphere of radius r to fill the frame with a margin */
export function fitDistance(r: number, fovDeg: number, aspect = STILL_ASPECT, margin = 1.12): number {
  const v = rad(fovDeg);
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return (Math.max(r, 200) / Math.sin(Math.min(v, h) / 2)) * margin;
}

/**
 * The generated views for an extent (the items and, for an exhibition, the booth plot). The front of
 * everything faces −Y, so every view but the plan stands on the −Y side.
 */
export function presetViews(e: Box, aspect = STILL_ASPECT): SavedView[] {
  const c: Vec3 = [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, (e.min[2] + e.max[2]) / 2];
  const r = Math.hypot(e.max[0] - e.min[0], e.max[1] - e.min[1], e.max[2] - e.min[2]) / 2;
  const at = (dir: Vec3, fov: number, margin = 1.12): { eye: Vec3; target: Vec3; fov: number } => {
    const d = fitDistance(r, fov, aspect, margin), n = norm(dir);
    return { eye: [c[0] + n[0] * d, c[1] + n[1] * d, c[2] + n[2] * d], target: c, fov };
  };
  const eye = EYE_HEIGHT.value;
  const W = e.max[0] - e.min[0], D = e.max[1] - e.min[1], H = e.max[2] - e.min[2];
  // a visitor in the hall aisle, a few steps in front of the front edge, looking at the middle of the stand
  const standOff = Math.min(3000, Math.max(1800, W * 0.3));
  const visitor: SavedView = {
    id: 'preset-visitor', name: PRESET_LABEL.visitor, preset: 'visitor', fov: 50,
    eye: [c[0] - W * 0.1, e.min[1] - standOff, eye], target: [c[0], c[1], Math.min(eye - 250, Math.max(900, c[2]))],
  };
  // elevation and plan are fitted to the face they show rather than to the bounding sphere
  const tanV = (f: number) => Math.tan(rad(f) / 2), tanH = (f: number) => tanV(f) * aspect;
  const fFront = 24, dFront = Math.max(W / (2 * tanH(fFront)), H / (2 * tanV(fFront))) * 1.12 + D / 2;
  const fPlan = 24, dPlan = Math.max(W / (2 * tanH(fPlan)), D / (2 * tanV(fPlan))) * 1.06 + H / 2;
  return [
    { id: 'preset-hero', name: PRESET_LABEL.hero, preset: 'hero', ...at([-0.6, -1, 0.42], 30, 0.86) },
    { id: 'preset-front', name: PRESET_LABEL.front, preset: 'front', fov: fFront, eye: [c[0], c[1] - dFront, c[2] + dFront * 0.03], target: c },
    { id: 'preset-aerial', name: PRESET_LABEL.aerial, preset: 'aerial', ...at([0.75, -1, 1.15], 30, 0.86) },
    visitor,
    // straight down, with the front at the bottom of the frame
    { id: 'preset-plan', name: PRESET_LABEL.plan, preset: 'plan', fov: fPlan, eye: [c[0], c[1] - 1, c[2] + dPlan], target: c },
  ];
}

/** a composition's views: the generated ones for its current extent, then the ones saved with it */
export function viewsFor(c: Composition, e: Box | null): SavedView[] {
  return [...(e ? presetViews(e) : []), ...(c.views ?? [])];
}

// ── project documents ───────────────────────────────────────────────────────────────────────────────

export type DocKind = 'drawing' | 'deck' | 'render' | 'brief' | 'venue' | 'other';
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  drawing: 'Drawing', deck: 'Deck', render: 'Render', brief: 'Brief', venue: 'Venue manual', other: 'Document',
};

/**
 * A link to a project document kept elsewhere (a drive, a project site). MAESTRO stores the reference only,
 * never the document. Confidential links never leave the private workspace; that is the default.
 */
export interface ProjectDoc {
  id: string;
  title: string;
  kind: DocKind;
  url?: string;
  /** drawing number, revision, page */
  reference?: string;
  confidential: boolean;
  /** the module (group) the document belongs to; unset = the whole composition */
  moduleId?: string;
  addedAt: string;
}

/** only plain web links: anything else (javascript:, data:, file:) is dropped */
export function safeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const x = new URL(u.trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : undefined;
  } catch { return undefined; }
}

// ── client view ─────────────────────────────────────────────────────────────────────────────────────

export type ItemSource = 'hardware' | 'kit' | 'project';
export const SOURCE_LABEL: Record<ItemSource, string> = { hardware: 'NVIDIA hardware', kit: 'Display kit', project: 'Project build' };

/** what the client view is allowed to know about one placed item */
export interface ClientItemInfo { name: string; source: ItemSource; status: Verification; dims: Vec3 | null; category?: string }

export interface ClientPackage {
  schema: 'maestro.client-view';
  title: string;
  kind: Composition['kind'];
  preparedAt: string;
  preparedBy?: string;
  overall: Vec3 | null;
  booth?: { width: number; depth: number; heightLimit: number; open: string[]; status: Verification };
  modules: { tag: string; name: string; items: number; docs: ClientDoc[] }[];
  items: { name: string; source: string; count: number; status: Verification; dims: Vec3 | null }[];
  power: { statedW: number; live: number; unknownLive: number } | null;
  access?: { accessibleShare: number; open: number };
  docs: ClientDoc[];
  stills: { name: string; src: string }[];
  notices: string[];
}

export interface ClientDoc { title: string; kind: string; url?: string; reference?: string }

export interface ClientInputs {
  resolve: (p: Placement) => ClientItemInfo | null;
  overall: Vec3 | null;
  power?: { statedW: number; live: number; unknownLive: number } | null;
  access?: { accessibleShare: number; open: number };
  stills?: { name: string; src: string }[];
  preparedBy?: string;
  moduleTag?: (k: number) => string;
  now?: string;
}

const clientDoc = (d: ProjectDoc): ClientDoc => ({ title: d.title, kind: DOC_KIND_LABEL[d.kind], url: safeUrl(d.url), reference: d.reference || undefined });

/**
 * Build the client view of a composition. It carries names, counts, overall sizes and the status of each
 * value; it leaves out source files, block names, drawing references from the import, approvals, internal
 * notes, item positions and every document marked confidential.
 */
export function buildClientPackage(c: Composition, x: ClientInputs): ClientPackage {
  const tag = x.moduleTag ?? ((k: number) => String.fromCharCode(65 + (k % 26)));
  const publicDocs = (c.docs ?? []).filter((d) => !d.confidential);
  const rows = new Map<string, ClientPackage['items'][number]>();
  for (const p of c.items) {
    const r = x.resolve(p);
    const name = r?.name ?? 'Item to be confirmed';
    const key = `${r?.source ?? '?'}|${name}`;
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { name, source: r ? (r.category ? `${SOURCE_LABEL[r.source]} · ${r.category}` : SOURCE_LABEL[r.source]) : 'Unknown', count: 1, status: r?.status ?? 'placeholder', dims: r?.dims ?? null });
  }
  const order: Record<string, number> = { 'NVIDIA hardware': 0, 'Display kit': 1, 'Project build': 2 };
  const items = [...rows.values()].sort((a, b) => (order[a.source.split(' · ')[0]] ?? 3) - (order[b.source.split(' · ')[0]] ?? 3) || a.name.localeCompare(b.name));
  const b = c.booth;
  const notices = [
    'Concept visualisation for discussion. Not for construction; every size is confirmed against approved drawings before fabrication.',
    'Each value carries its status: Verified (published manufacturer document), Project-specific (this build’s approved model or drawing), Estimated (to be checked) or Placeholder (not yet known).',
    'Prepared with MAESTRO, an internal working tool. It is not an NVIDIA product and is not endorsed by NVIDIA. Product names belong to their owners.',
  ];
  return {
    schema: 'maestro.client-view',
    title: c.name,
    kind: c.kind,
    preparedAt: x.now ?? new Date().toISOString(),
    preparedBy: x.preparedBy || undefined,
    overall: x.overall,
    booth: b ? {
      width: b.width.value, depth: b.depth.value, heightLimit: b.heightLimit.value,
      open: (['front', 'left', 'right', 'back'] as const).filter((s) => b.open[s]),
      status: [b.width.status, b.depth.status, b.heightLimit.status].reduce((m, s) => (rank(s) < rank(m) ? s : m), 'verified' as Verification),
    } : undefined,
    modules: c.groups.map((g, k) => ({
      tag: tag(k), name: g.name, items: c.items.filter((i) => i.groupId === g.id).length,
      docs: publicDocs.filter((d) => d.moduleId === g.id).map(clientDoc),
    })),
    items,
    power: x.power ?? null,
    access: x.access,
    docs: publicDocs.filter((d) => !d.moduleId || !c.groups.some((g) => g.id === d.moduleId)).map(clientDoc),
    stills: x.stills ?? [],
    notices,
  };
}

const RANKS: Verification[] = ['placeholder', 'estimated', 'project', 'verified'];
const rank = (s: Verification) => RANKS.indexOf(s);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const n0 = (v: number) => Math.round(v).toLocaleString('en-GB');
const STATUS_TEXT: Record<Verification, string> = { verified: 'Verified', project: 'Project-specific', estimated: 'Estimated', placeholder: 'Placeholder' };
const SIDE_TEXT: Record<string, string> = { front: 'front', left: 'left', right: 'right', back: 'back' };

/** A single self-contained HTML page: no scripts, no external requests, images inline. */
export function clientHtml(p: ClientPackage): string {
  const badge = (s: Verification) => `<span class="b ${s}">${STATUS_TEXT[s]}</span>`;
  const doc = (d: ClientDoc) => `<li>${d.url ? `<a href="${esc(d.url)}" rel="noopener noreferrer" target="_blank">${esc(d.title)}</a>` : esc(d.title)} <span class="m">${esc(d.kind)}${d.reference ? ` · ${esc(d.reference)}` : ''}</span></li>`;
  const date = p.preparedAt.slice(0, 10);
  const facts: string[] = [];
  if (p.booth) facts.push(`<div><dt>Booth</dt><dd>${n0(p.booth.width)} × ${n0(p.booth.depth)} mm ${badge(p.booth.status)}</dd></div>`, `<div><dt>Open to the aisle</dt><dd>${p.booth.open.map((s) => SIDE_TEXT[s]).join(', ') || 'no side'}</dd></div>`, `<div><dt>Height limit</dt><dd>${n0(p.booth.heightLimit)} mm</dd></div>`);
  if (p.overall) facts.push(`<div><dt>Overall</dt><dd>${n0(p.overall[0])} × ${n0(p.overall[1])} × ${n0(p.overall[2])} mm</dd></div>`);
  if (p.modules.length) facts.push(`<div><dt>${p.kind === 'exhibition' ? 'Modules' : 'Groups'}</dt><dd>${p.modules.length}</dd></div>`);
  if (p.power && p.power.live) facts.push(`<div><dt>Stated power, live items</dt><dd>${(p.power.statedW / 1000).toLocaleString('en-GB', { maximumFractionDigits: 2 })} kW${p.power.unknownLive ? ` + ${p.power.unknownLive} without a figure` : ''}</dd></div>`);
  if (p.access) facts.push(`<div><dt>Accessible floor</dt><dd>${Math.round(p.access.accessibleShare * 100)}%${p.access.open ? ` · ${p.access.open} point${p.access.open === 1 ? '' : 's'} under review` : ' · every module reachable'}</dd></div>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="robots" content="noindex">
<title>${esc(p.title)}</title>
<style>
:root{--ink:#1b1d1a;--ink3:#6b6f68;--line:#e2e4df;--bg:#f6f7f4;--card:#fff;--acc:#76b900}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1180px;margin:0 auto;padding:40px 24px 64px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:24px;flex-wrap:wrap}
h1{font-size:30px;line-height:1.15;margin:4px 0 0;letter-spacing:-.01em}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin:36px 0 12px}
.k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);font-weight:700}.m{color:var(--ink3);font-size:12.5px}
figure{margin:0 0 18px;background:var(--card);border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}figure img{display:block;width:100%;height:auto}figcaption{padding:10px 14px;font-size:12.5px;color:var(--ink3)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:0}dl div{background:var(--card);border-radius:12px;padding:12px 14px}dt{font-size:11.5px;color:var(--ink3)}dd{margin:2px 0 0;font-weight:600}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.b{display:inline-block;font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:999px;margin-left:4px;vertical-align:1px}.b.verified{background:#e7f3d3;color:#3c6100}.b.project{background:#e3ecfb;color:#244f94}.b.estimated{background:#fdf0d8;color:#8a5a00}.b.placeholder{background:#eceded;color:#5b5e58}
ul{margin:0;padding-left:18px}li{margin:3px 0}a{color:#3c6100}
.notice{margin-top:40px;border-top:1px solid var(--line);padding-top:14px;font-size:12px;color:var(--ink3)}.notice p{margin:4px 0}
@media print{body{background:#fff}main{padding:0}figure{break-inside:avoid;box-shadow:none;border:1px solid var(--line)}}
</style></head>
<body><main>
<header><div><div class="k">${p.kind === 'exhibition' ? 'Exhibition concept' : 'Demo module concept'}</div><h1>${esc(p.title)}</h1></div>
<div class="m">Prepared ${esc(date)}${p.preparedBy ? ` by ${esc(p.preparedBy)}` : ''}</div></header>
${p.stills.length ? `<section class="grid">${p.stills.map((s, i) => `<figure${i === 0 && p.stills.length > 1 ? ' style="grid-column:1/-1"' : ''}><img src="${esc(s.src)}" alt="${esc(s.name)}"><figcaption>${esc(s.name)}</figcaption></figure>`).join('')}</section>` : ''}
${facts.length ? `<h2>At a glance</h2><dl>${facts.join('')}</dl>` : ''}
${p.modules.length ? `<h2>${p.kind === 'exhibition' ? 'Modules' : 'Groups'}</h2><table><thead><tr><th></th><th>Name</th><th>Items</th><th>Documents</th></tr></thead><tbody>${p.modules.map((m) => `<tr><td>${esc(m.tag)}</td><td>${esc(m.name)}</td><td class="n">${m.items}</td><td>${m.docs.length ? `<ul>${m.docs.map(doc).join('')}</ul>` : '<span class="m">—</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>What is shown</h2>
<table><thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Size (W × D × H)</th></tr></thead><tbody>
${p.items.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.source)}</td><td class="n">${r.count}</td><td class="n">${r.dims ? `${n0(r.dims[0])} × ${n0(r.dims[1])} × ${n0(r.dims[2])} mm` : 'to be confirmed'} ${badge(r.status)}</td></tr>`).join('\n')}
</tbody></table>
${p.docs.length ? `<h2>Project documents</h2><ul>${p.docs.map(doc).join('')}</ul>` : ''}
<div class="notice">${p.notices.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
</main></body></html>
`;
}

// ── leak audit ──────────────────────────────────────────────────────────────────────────────────────

/** the minimal shape of an imported part the audit reads; see ingest/types.ts */
export interface AuditPart {
  name: string;
  notes?: string;
  approvedBy?: string;
  source: { fileName: string; sha256: string; block: string; description?: string; derivedFrom?: string; originNote?: string; geometryHash?: string };
  docs: { title: string; document: string; reference?: string }[];
  checks: { note?: string }[];
}

export interface Secret { what: string; value: string }

/**
 * Every string the client view must never contain: the private record of each imported part placed in the
 * composition, and every confidential document link. Short strings (under 6 characters) are left out, as
 * they would match ordinary words; names the client view shows on purpose are left out too.
 */
export function secretsFor(c: Composition, parts: AuditPart[], shown: string[]): Secret[] {
  const out: Secret[] = [];
  const add = (what: string, v: string | undefined) => { const t = v?.trim(); if (t && t.length >= 6) out.push({ what, value: t }); };
  for (const p of parts) {
    add(`source file of ${p.name}`, p.source.fileName);
    add(`file checksum of ${p.name}`, p.source.sha256);
    add(`source block of ${p.name}`, p.source.block);
    add(`block description of ${p.name}`, p.source.description);
    add(`upstream block of ${p.name}`, p.source.derivedFrom);
    add(`origin note of ${p.name}`, p.source.originNote);
    add(`geometry fingerprint of ${p.name}`, p.source.geometryHash);
    add(`notes on ${p.name}`, p.notes);
    add(`approver of ${p.name}`, p.approvedBy);
    for (const d of p.docs) { add(`linked document of ${p.name}`, d.document); add(`drawing reference of ${p.name}`, d.reference); add(`drawing title of ${p.name}`, d.title); }
    for (const k of p.checks) add(`dimension note on ${p.name}`, k.note);
  }
  for (const d of c.docs ?? []) {
    if (!d.confidential) continue;
    add('confidential document title', d.title);
    add('confidential document link', d.url);
    add('confidential document reference', d.reference);
  }
  const ok = new Set(shown.map((s) => s.trim()));
  const seen = new Set<string>();
  return out.filter((s) => !ok.has(s.value) && !seen.has(s.value) && (seen.add(s.value), true));
}

/** the secrets that appear in a text, raw or HTML-escaped; inline images are skipped */
export function auditText(text: string, secrets: Secret[]): Secret[] {
  const t = text.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '');
  return secrets.filter((s) => t.includes(s.value) || t.includes(esc(s.value)));
}

