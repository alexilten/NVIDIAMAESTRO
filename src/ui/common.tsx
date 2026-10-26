import type { ReactNode } from 'react';
import { LOD, VERIFICATION, type Verification } from '../core/schema';

export function VBadge({ status, compact }: { status: Verification; compact?: boolean }) {
  return <span className={`vbadge ${status}`} title={VERIFICATION[status].meaning}>{compact ? VERIFICATION[status].label.split('-')[0] : VERIFICATION[status].label}</span>;
}

export function LodBadge({ lod }: { lod: number | null }) {
  if (lod == null) return <span className="lodbadge none" title="No 3D asset yet">No model</span>;
  return <span className="lodbadge" title={LOD[lod as 0 | 1 | 2 | 3]?.meaning}>LOD {lod}</span>;
}

export function Section({ title, summary, children, open = true }: { title: string; summary?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary className="section-head"><span className="section-title">{title}</span>{summary && <span className="section-summary">{summary}</span>}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function KV({ k, children, status, source }: { k: ReactNode; children: ReactNode; status?: Verification; source?: string }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span>{children}{status && <i className={`dot ${status}`} title={`${VERIFICATION[status].label}${source ? ` · ${source}` : ''}`} />}</span>
    </div>
  );
}

export const mm = (v: number | null | undefined, digits = 1) => (v == null ? '—' : `${(Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString('en-GB')} mm`);
export const dims3 = (d: [number, number, number] | null) => (d ? `${Math.round(d[0]).toLocaleString('en-GB')} × ${Math.round(d[1]).toLocaleString('en-GB')} × ${Math.round(d[2]).toLocaleString('en-GB')} mm` : 'Dimensions not recorded');

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></>,
    plus: <path d="M8 3v10M3 8h10" />,
    download: <><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7" /><path d="M3 13.5h10" /></>,
    star: <path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5Z" />,
    cube: <><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5Z" /><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6" /></>,
    undo: <><path d="M5 6H10a3 3 0 0 1 0 6H7" /><path d="M7 3.5 4.5 6 7 8.5" /></>,
    redo: <><path d="M11 6H6a3 3 0 0 0 0 6h3" /><path d="M9 3.5 11.5 6 9 8.5" /></>,
    copy: <><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10V4a1 1 0 0 1 1-1h6" /></>,
    trash: <><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></>,
    group: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" strokeDasharray="2 1.6" /><rect x="5" y="5" width="6" height="6" rx="1" /></>,
    move: <path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2" />,
    rotate: <><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13 2.5v3h-3" /></>,
    file: <><path d="M4 1.5h5L12.5 5v9.5h-8.5Z" /><path d="M9 1.5V5h3.5" /></>,
    check: <path d="m3.5 8.5 3 3 6-7" />,
    x: <path d="m4 4 8 8M12 4l-8 8" />,
    lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
    link: <><path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7" /><path d="M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[name]}</svg>;
}
