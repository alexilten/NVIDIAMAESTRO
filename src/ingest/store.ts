/**
 * The private project library: ingested parts, document page indexes and saved compositions, kept in this
 * browser's IndexedDB. Nothing here is sent anywhere; the public build ships without any of it.
 * (Round 02 moves this behind an authenticated service with project-level permissions; the record shapes
 * are the ones that service will store.)
 */
import type { Composition } from '../core/schema';
import type { IngestedPart } from './types';
import type { PageText } from './pipeline';

const DB = 'maestro-private';
const VERSION = 1;
export interface DocIndex { id: string; name: string; size: number; pages: PageText[]; addedAt: string }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('parts')) db.createObjectStore('parts', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('compositions')) db.createObjectStore('compositions', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(req ? (req as IDBRequest<T>).result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const partsStore = {
  all: async () => ((await tx<(IngestedPart & { key: string })[]>('parts', 'readonly', (s) => s.getAll())) ?? []).map(({ key: _k, ...p }) => p as IngestedPart),
  put: (p: IngestedPart) => tx('parts', 'readwrite', (s) => s.put({ ...p, key: `${p.id}@${p.version}` })),
  remove: (p: IngestedPart) => tx('parts', 'readwrite', (s) => s.delete(`${p.id}@${p.version}`)),
};

export const docsStore = {
  all: async () => (await tx<DocIndex[]>('docs', 'readonly', (s) => s.getAll())) ?? [],
  put: (d: DocIndex) => tx('docs', 'readwrite', (s) => s.put(d)),
  remove: (id: string) => tx('docs', 'readwrite', (s) => s.delete(id)),
};

export const compStore = {
  all: async () => (await tx<Composition[]>('compositions', 'readonly', (s) => s.getAll())) ?? [],
  put: (c: Composition) => tx('compositions', 'readwrite', (s) => s.put(c)),
  remove: (id: string) => tx('compositions', 'readwrite', (s) => s.delete(id)),
};

export async function clearPrivateLibrary() {
  await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); });
}
