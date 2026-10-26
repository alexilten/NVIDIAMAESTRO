/** rhino3dm (≈ 2.7 MB WASM) loads on first use, in the browser. */
import wasmUrl from 'rhino3dm/rhino3dm.wasm?url';

/* eslint-disable @typescript-eslint/no-explicit-any */
let rhinoPromise: Promise<any> | null = null;
export function loadRhino(): Promise<any> {
  rhinoPromise ??= import('rhino3dm/rhino3dm.module.js').then((m: any) => m.default({ locateFile: () => wasmUrl }));
  return rhinoPromise;
}

export function download(bytes: Uint8Array | string, name: string, type = 'application/octet-stream') {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
