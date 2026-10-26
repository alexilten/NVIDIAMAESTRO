import { useMemo } from 'react';
import { MODEL_BY_ID, PHYSICAL_BY_ID } from '../core/catalog/products';
import { resolveRef } from '../core/library';
import { ProductViewer, type DimLabel } from '../viewport/ProductViewer';
import { Catalog } from './Catalog';
import { Inspector } from './Inspector';
import { useStore, type CameraPreset } from './store';

export function Discover() {
  const selectedRef = useStore((s) => s.selectedRef);
  const selectedKey = useStore((s) => s.selectedKey);
  const select = useStore((s) => s.select);
  const parts = useStore((s) => s.parts);
  const r = useMemo(() => (selectedRef ? resolveRef(selectedRef, parts) : null), [selectedRef, parts]);

  const dims = useMemo<[DimLabel, DimLabel, DimLabel] | undefined>(() => {
    if (!r?.entry.dims) return undefined;
    if (selectedRef?.kind === 'product') {
      const pa = PHYSICAL_BY_ID.get(MODEL_BY_ID.get(selectedRef.id)?.physicalAssetId ?? '');
      if (pa) return [pa.dims.width, pa.dims.depth, pa.dims.height].map((d) => ({ value: d.value, status: d.status })) as [DimLabel, DimLabel, DimLabel];
    }
    return r.entry.dims.map((v) => ({ value: v, status: r.entry.verification })) as [DimLabel, DimLabel, DimLabel];
  }, [r, selectedRef]);

  const empty = r && !r.shape
    ? r.entry.physical ? 'Dimensions not recorded yet: no geometry can be drawn without them.'
      : r.entry.kind === 'reference-architecture' ? `${r.entry.name} is a reference architecture, not one enclosure. Its physical racks are listed under Physical implementations.`
        : `${r.entry.name} is software. It is shown through the hardware it runs on; see Related.`
    : undefined;

  return (
    <>
      <ProductViewer shape={r?.shape ?? null} dims={dims} emptyMessage={empty} />
      <aside className="panel left glass"><Catalog onPick={select} selectedKey={selectedKey} /></aside>
      <aside className="panel right glass"><Inspector refItem={selectedRef} /></aside>
      <Viewbar />
    </>
  );
}

const PRESETS: [CameraPreset, string][] = [['perspective', 'Persp'], ['front', 'Front'], ['rear', 'Rear'], ['side', 'Side'], ['top', 'Top'], ['iso', 'Iso']];

export function Viewbar() {
  const camera = useStore((s) => s.camera);
  const setCamera = useStore((s) => s.setCamera);
  const st = useStore();
  return (
    <div className="viewbar glass">
      <div className="segmented sm">
        {PRESETS.map(([k, l]) => <button key={k} className={camera === k ? 'on' : ''} onClick={() => setCamera(k)}>{l}</button>)}
      </div>
      <span className="tool-sep" />
      {([['ortho', 'Ortho'], ['xray', 'X-ray'], ['dims', 'Dims'], ['autoRotate', 'Turn'], ['scaleFigure', 'Figure']] as const).map(([k, l]) => (
        <button key={k} className={`chip ${st[k] ? 'on' : ''}`} onClick={() => st.toggle(k)}>{l}</button>
      ))}
    </div>
  );
}
