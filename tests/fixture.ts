/**
 * A small synthetic Rhino model for the tests. It is built here so the repository never needs a project file:
 * a plinth block authored in feet, with a nested cap block, placed once in the model.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rh = any;

export const FIXTURE = {
  fileName: 'fixture-feet.3dm',
  plinth: 'NV_PART_Test Plinth (pedestal)',
  cap: 'SUB_Cap',
  /** expected overall size in mm: 2 ft × 1 ft × 3.1 ft */
  dims: [609.6, 304.8, 944.88] as [number, number, number],
};

export function buildFixture(rh: Rh): Uint8Array {
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Feet;
  const layer = (name: string, color: { r: number; g: number; b: number }) => {
    const l = new rh.Layer();
    l.name = name;
    l.color = { ...color, a: 255 };
    return doc.layers().add(l);
  };
  const body = layer('Plinth Body White', { r: 240, g: 240, b: 236 });
  const cap = layer('Cap Black', { r: 20, g: 20, b: 20 });
  const attrs = (li: number, name = '') => { const a = new rh.ObjectAttributes(); a.layerIndex = li; a.name = name; return a; };
  const brepBox = (min: number[], max: number[]) => rh.Brep.createFromBox(new rh.Box(new rh.BoundingBox(min, max)));

  doc.instanceDefinitions().add(FIXTURE.cap, 'Cap plate', '', '', [0, 0, 0], [brepBox([0, 0, 0], [2, 1, 0.1])], [attrs(cap, 'cap plate')]);
  const capId = doc.instanceDefinitions().get(0).id;
  const up = rh.Transform.translationXYZ(0, 0, 3);
  doc.instanceDefinitions().add(
    FIXTURE.plinth, "Exact copy of Show R2 block 'PLINTH'. Origin at the back left corner.", '', '', [0, 0, 0],
    [brepBox([0, 0, 0], [2, 1, 3]), new rh.InstanceReference(capId, up)],
    [attrs(body, 'body'), attrs(cap, 'cap')],
  );
  const plinthId = doc.instanceDefinitions().get(1).id;
  doc.objects().addInstanceObject(new rh.InstanceReference(plinthId, rh.Transform.translationXYZ(10, 0, 0)), attrs(body));
  return doc.toByteArray();
}
