import { useEffect, useState } from 'react';
import { MODEL_BY_ID } from '../core/catalog/products';
import { SOURCE_BY_ID } from '../core/catalog/sources';
import { resolveRef, type LibraryEntry } from '../core/library';
import type { ItemRef } from '../core/schema';
import type { Shape } from '../core/geometry/shape';
import { heroImage } from '../viewport/heroRender';
import { useStore } from './store';

/**
 * The product floating at the top of the inspector: its official photo when the catalog has one, otherwise a
 * still drawn from its own model. A reference architecture shows the first product that implements it.
 */
export function ProductHero({ refItem, entry, shape }: { refItem: ItemRef; entry: LibraryEntry; shape: Shape | null }) {
  const parts = useStore((s) => s.parts);
  const model = refItem.kind === 'product' ? MODEL_BY_ID.get(refItem.id) : undefined;
  const photo = model?.image;
  const impl = !shape && model?.implementations?.length ? model.implementations[0] : null;
  const drawn = shape ?? (impl ? resolveRef({ kind: 'product', id: impl }, parts)?.shape ?? null : null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (photo || !drawn) { setSrc(null); return; }
    // render after the panel paints, so selecting stays instant
    const t = setTimeout(() => setSrc(heroImage(`${entry.key}:${impl ?? ''}`, drawn)), 0);
    return () => clearTimeout(t);
  }, [photo, drawn, entry.key, impl]);
  if (photo && !failed) {
    const s = photo.src.includes('://') ? photo.src : `${import.meta.env.BASE_URL}${photo.src}`;
    const from = SOURCE_BY_ID.get(photo.sourceId);
    return (
      <figure className="hero">
        <img src={s} alt={entry.name} onError={() => setFailed(true)} />
        <figcaption>Image: {from ? <a href={from.url} target="_blank" rel="noreferrer">{photo.credit}</a> : photo.credit}</figcaption>
      </figure>
    );
  }
  if (!drawn) return null;
  return (
    <figure className="hero">
      {src ? <img src={src} alt={entry.name} /> : <span className="hero-wait" />}
      <figcaption>{impl ? `Drawn from its model: ${MODEL_BY_ID.get(impl)?.name ?? impl}` : 'Drawn from its model'}</figcaption>
    </figure>
  );
}
