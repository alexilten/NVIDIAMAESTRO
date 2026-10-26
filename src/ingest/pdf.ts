/**
 * Fabrication decks and drawing sets: read the text of every page in the browser (pdf.js) so parts can be
 * cross-referenced to pages, and render a page on demand for the reviewer. The PDF itself is not stored;
 * only its page text is kept, in the private library. Drawings that are raster images carry little text:
 * the page titles still index them, and the reviewer reads the dimensions off the rendered page.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageText } from './pipeline';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const open = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

export async function indexPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<PageText[]> {
  const doc = await load(file);
  const pages: PageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push({ page: i, text: tc.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim() });
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  return pages;
}

function load(file: File) {
  const key = `${file.name}:${file.size}`;
  if (!open.has(key)) open.set(key, file.arrayBuffer().then((b) => pdfjs.getDocument({ data: new Uint8Array(b) }).promise));
  return open.get(key)!;
}

/** render one page of an open document into a canvas (the File must be supplied again after a reload) */
export async function renderPage(file: File, pageNo: number, canvas: HTMLCanvasElement, width = 900) {
  const doc = await load(file);
  const page = await doc.getPage(pageNo);
  const v1 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / v1.width });
  canvas.width = viewport.width; canvas.height = viewport.height;
  canvas.style.width = `${width}px`;
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
}
