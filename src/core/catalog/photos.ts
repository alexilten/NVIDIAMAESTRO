import type { ProductImage } from '../schema';

/**
 * Product photos for the inspector, cut out of Acronym's build photos from the GTC Berlin 2026 hardware wall.
 * Photos shot from above at three quarters are used as taken. Racks, trays, boards and cards that were shot
 * straight on are straightened and redrawn on the same three-quarter view, with plain side faces added.
 */
const SOURCE = 'acronym-gtc-berlin-2026-photos';

const AS_SHOT = [
  'dell-pro-max-gb300',
  'gb-w775-v10',
  'msi-ws300',
  'smc-ars-511gd',
  'nv-dgx-spark',
  'qct-arc-pro-2u',
  'dell-rtx-pro-server',
  'hpe-rtx-pro-server',
  'nv-sn6600',
  'nv-sn6800-ld',
  'nv-sn6810-ld',
  'nv-bf4-stx-processor',
  'qct-vera-cmx',
  'smc-vera-cmx',
];

const REDRAWN = [
  'nv-vr-ultra-compute-tray',
  'nv-vr-ultra-switch-tray',
  'nv-vr-ultra-nvl576',
  'nv-rtx-pro-5000',
  'nv-rtx-pro-6000-maxq',
  'nv-rtx-pro-6000-ws',
  'nv-spectrum6-spx-rack',
  'nv-connectx-9',
  'nv-bluefield-4',
  'nv-spectrum-x-photonics',
  'nv-bf4-stx-rack',
  'nv-groq3-lpx-rack',
  'nv-groq3-lpx-tray',
  'nv-vr-nvl72-compute-tray',
  'nv-vr-nvlink-switch-tray',
  'nv-vera-cpu-tray',
];

export const PHOTO_BY_ID = new Map<string, ProductImage>([
  ...AS_SHOT.map((id): [string, ProductImage] => [id, { src: `products/${id}.webp`, sourceId: SOURCE, credit: 'Acronym build photo, GTC Berlin 2026' }]),
  ...REDRAWN.map((id): [string, ProductImage] => [id, { src: `products/${id}.webp`, sourceId: SOURCE, credit: 'Acronym build photo, GTC Berlin 2026, redrawn to three-quarter view' }]),
]);
