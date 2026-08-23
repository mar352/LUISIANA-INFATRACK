---
name: analyze-phivolcs-kmz
description: >
  Analyze official PHIVOLCS KMZ ground-overlay photos (EIL / Ground Shaking)
  for Luisiana siting. Use when the user mentions KMZ, PHIVOLCS tiles,
  LatLonBox, earthquake map photos, or /analyze-phivolcs-kmz.
---

# Analyze PHIVOLCS KMZ photos

The KMZ is a **label source**, not the prediction. Do not only replay old pixels as the map product.

## Files

- `frontend/public/hazards/eil-2014/source.kmz` — Earthquake-induced landslide 50K 2014
- `frontend/public/hazards/gsh-2014/source.kmz` — Ground shaking 50K 2014
- `frontend/public/hazards/eil-2010/source.kmz` — EIL 2010
- Extracted leaf tiles + `tiles.json` LatLonBox live next to each `source.kmz`

KMZ `GroundOverlay/LatLonBox` is the georeference. Highest-LOD tiles in `tiles.json` match those boxes. Do not geocode the overview PNG (it has legend chrome).

## What the photos actually show

See `references/kmz-photo-read.md` after analysis. Short version:

- **EIL 2014**: cream topo = not susceptible; bright yellow = low; purple = moderate; red = high; cyan hatch = runout. Hazard belts hug the **west ridge** (San Salvador / Ibabang Banga), not the whole square bbox.
- **GSH 2014**: almost all PEIS VIII (red) across Luisiana. Do not spray GSH as local dots — it is municipality-wide shaking, not a site pattern.

## Rules

1. Clip every sample and every predicted cell with `isInsideLuisiana` (black municipal border).
2. Sample **hazard-colored pixels only** for labels (`frontend/scripts/sample-earthquake-labels.ps1`).
3. Train a model on those labels + terrain/lon-lat, then **predict** a grid. The visible dots are predictions, not a photocopy of the KMZ.
4. Pin score = model `predictAt(lon,lat)`, not “nearest old pixel only.”
5. Do **not** put official KMZ overlay toggles on the Risk tab or map shortcuts. The sheets are training/reference for `/earthquake-prone-model` only. The map product is the trained heatmap.
