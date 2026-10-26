"""Independent check of NVIDIA MAESTRO .3dm exports with McNeel's Python rhino3dm (openNURBS) bindings.

    pip install rhino3dm
    python3 scripts/verify_3dm.py samples/*.3dm

For every top-level block instance it rebuilds the block's geometry extents (following nested blocks and
their transforms), and compares the instance's extents with the width/depth/height written on it by MAESTRO
(rotation is taken into account). It also checks units, the layer standard, names and the embedded composition.
Exits non-zero on any failure.
"""
import itertools
import json
import math
import sys

import rhino3dm as rh

TOL = 1.0  # mm


def corners(mn, mx):
    return [rh.Point3d(*c) for c in itertools.product(*zip(mn, mx))]


def def_extent(model, idef, objs, idefs, xf, cache_pts):
    pts = []
    for oid in idef.GetObjectIds():
        o = objs.get(oid)
        if o is None:
            continue
        g = o.Geometry
        if isinstance(g, rh.InstanceReference):
            child = idefs[g.ParentIdefId]
            pts += def_extent(model, child, objs, idefs, rh.Transform.Multiply(xf, g.Xform), cache_pts)
        elif isinstance(g, (rh.Brep, rh.Extrusion, rh.Mesh)):
            b = g.GetBoundingBox()
            for p in corners((b.Min.X, b.Min.Y, b.Min.Z), (b.Max.X, b.Max.Y, b.Max.Z)):
                p.Transform(xf)
                pts.append((p.X, p.Y, p.Z))
    return pts


def check(path):
    m = rh.File3dm.Read(path)
    if m is None:
        return [f"{path}: could not be read"], {}
    errs = []
    units = str(m.Settings.ModelUnitSystem).split(".")[-1]
    if units != "Millimeters":
        errs.append(f"units are {units}")
    layers = [l.FullPath for l in m.Layers]
    for need in ["NVIDIA_MAESTRO::10_NVIDIA_HARDWARE", "NVIDIA_MAESTRO::30_DISPLAY_FURNITURE", "NVIDIA_MAESTRO::90_DIMENSIONS"]:
        if need not in layers:
            errs.append(f"missing layer {need}")
    objs = {o.Attributes.Id: o for o in m.Objects}
    idefs = {d.Id: d for d in m.InstanceDefinitions}
    comp = None
    for i in range(len(m.Strings)):
        k, v = m.Strings[i]
        if k == "maestro.composition":
            comp = json.loads(v)
    if comp is None:
        errs.append("no embedded composition")
    rows = []
    for o in m.Objects:
        g = o.Geometry
        a = o.Attributes
        if a.IsInstanceDefinitionObject if hasattr(a, "IsInstanceDefinitionObject") else False:
            continue
        if not isinstance(g, rh.InstanceReference):
            continue
        # only top-level instances carry maestro.placement
        pid = a.GetUserString("maestro.placement")
        if not pid:
            continue
        idef = idefs[g.ParentIdefId]
        pts = def_extent(m, idef, objs, idefs, g.Xform, {})
        if not pts:
            errs.append(f"{a.Name}: block has no geometry"); continue
        ext = [max(p[k] for p in pts) - min(p[k] for p in pts) for k in range(3)]
        w, d, h = (float(a.GetUserString(f"maestro.{k}_mm")) for k in ("width", "depth", "height"))
        rot = math.radians(float(a.GetUserString("maestro.rotation_deg") or 0))
        exp = [abs(w * math.cos(rot)) + abs(d * math.sin(rot)), abs(w * math.sin(rot)) + abs(d * math.cos(rot)), h]
        ok = all(abs(e - x) <= TOL for e, x in zip(ext, exp))
        if not ok:
            errs.append(f"{a.Name}: extents {[round(v,1) for v in ext]} != recorded {[round(v,1) for v in exp]}")
        if not a.Name:
            errs.append("an instance has no name")
        rows.append({"name": a.Name, "block": idef.Name, "layer": layers[a.LayerIndex], "extent_mm": [round(v, 1) for v in ext], "verification": a.GetUserString("maestro.verification"), "ok": ok})
    if comp and len(rows) != len(comp["items"]):
        errs.append(f"{len(rows)} instances but the composition lists {len(comp['items'])} items")
    return errs, {"file": path, "units": units, "layers": len(layers), "blocks": len(m.InstanceDefinitions), "groups": len(m.Groups), "instances": rows}


ok = True
for path in sys.argv[1:]:
    errs, report = check(path)
    print(json.dumps(report, indent=2))
    for e in errs:
        print("FAIL", e)
    ok = ok and not errs
print("ALL CHECKS PASSED" if ok else "CHECKS FAILED")
sys.exit(0 if ok else 1)
