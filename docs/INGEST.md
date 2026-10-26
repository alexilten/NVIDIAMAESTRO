# Import: from a project model to a library part

Source project → ingestion → technical verification → kit of parts. MAESTRO never remodels a project part. It keeps the source geometry exactly, measures it, and asks a reviewer to compare it with the drawings before it can be used as a project-specific component.

## 1. Read the model

Open a `.3dm`. The file is read in the browser with rhino3dm and is not stored or uploaded. MAESTRO lists every block definition with:

- the objects it holds and the blocks nested in it
- the blocks it is used inside (a block used only inside others is a sub-assembly, carried along with its parent)
- how many times it is placed at the top level
- a suggested category from its name (niche, pedestal, kiosk, counter…), which the reviewer can change
- provenance stated in its description, such as "Exact copy of Show R2 block 'PANEL'", kept as `derivedFrom`

The model's units and tolerance are read from the file; everything is converted to millimetres.

## 2. Extract

For each chosen block MAESTRO stores:

- **Source geometry**: every object of the block and its nested blocks, encoded with `CommonObject.encode()`, with layer, material and name. This is what the Rhino export rebuilds. It is never altered.
- **A viewport mesh**: rhino3dm has no B-rep mesher, so planar faces are triangulated from their trimmed loops and curved faces are sampled over their surface. Curved faces are counted as approximated; the count is shown with the part. The mesh is for display only.
- **Measurements**: overall extents, and extents per material (width, depth, height, bottom and top).
- **Identity**: file name, size and SHA-256, block name and description.

The part is **Fixed geometry**: it has no recovered parameters. Parametric parts are the separate kit (counter, light table, niche).

## 3. Link documentation

Attach the fabrication deck. Its text is indexed in the browser and pages are suggested for each part by matching words from the part name and category, with a bonus for build drawings and sign-off stamps. Suggestions are only suggestions: the reviewer confirms, removes or adds pages, and can preview any page.

## 4. Compare dimensions

Each check pairs a model measurement with a value read from a drawing, with a tolerance (2 mm by default). A check is **match**, **discrepancy** or **missing**. A discrepancy has to be resolved explicitly:

- **Model governs**: the model is right; the drawing is out of date.
- **Drawing governs**: the drawing is right. The source geometry is still kept as it is, and the part is flagged for correction in the source model.
- **Noted**: accepted with a note for the record.

## 5. Approve

Approval needs at least one confirmed page, at least one compared dimension and no open discrepancy. An approved part is published to the private project library as Project-specific, locked, and can be placed in Compose and exported. A revised source becomes version 2 of the same part; version 1 stays as it was, and placements that use it are flagged.

### Reviewing parts that share a drawing

A build drawing often shows several parts. When two or more proposed parts are linked to the same page, the page appears under **Review together**. Its sheet confirms the page for all of them, compares one shared measure (for example "overall height") with the same drawing value on each, and approves the parts that are then clear. The group never lowers the bar: every part still needs its own confirmed page, compared dimension and resolved discrepancies, and a part that is not clear is listed with what still blocks it. A check already made on that measure is updated rather than repeated.

## Review notes

Review work can be exported and imported as a `*.maestro-review.json` sidecar, matched to parts by block name, so it survives re-importing a revised model. The sidecar holds project information, so it lives with the project files, never in this repository.

```json
{
  "schema": "maestro.review", "version": 1,
  "entries": [{
    "block": "NV_HW_Example Plinth",
    "notes": "…",
    "docs": [{ "document": "deck.pdf", "page": 12, "title": "Plinth GA", "reference": "DWG-01", "status": "SIGNED OFF" }],
    "checks": [{ "label": "Height on GA", "measure": "overall height", "drawing": 900, "document": "deck.pdf", "page": 12 }]
  }]
}
```

`measure` names a model measurement as the review panel lists it ("overall width", "<material> · height"…). A value already typed by the reviewer is never overwritten by a sidecar.
