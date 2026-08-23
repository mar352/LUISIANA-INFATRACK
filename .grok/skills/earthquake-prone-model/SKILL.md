---
name: earthquake-prone-model
description: >
  Train and wire a TensorFlow.js model that classifies Luisiana sites as
  earthquake-prone for infrastructure siting. Use when the user asks to train
  an earthquake model, identify earthquake-prone areas, score a pin for
  seismic safety, or runs /earthquake-prone-model.
---

# Earthquake-prone site model

Siting **prediction**, not a photocopy of the 2014 sheet and not live quake tracking. Read `/analyze-phivolcs-kmz` before changing labels. For DEM + satellite features, follow `/satellite-terrain-predict`.

## Roles

| Piece | Role |
|---|---|
| PHIVOLCS KMZ photos | **Training labels + context only** — never a user-facing map overlay |
| TF.js net | **Prediction** at any lon/lat inside Luisiana |
| Visible heatmap | Model output on a municipal-clipped grid (Google cyan→red). Small pick dots stay for hover/click. |

Do **not** put official KMZ sheet toggles on Risk, Layers, or map shortcuts. Staff see the model heatmap, not the raw PHIVOLCS tiles.

Do not set `hazardMapPoints()` (raw KMZ pixels) as the map product. Train, then `predictGrid()`.

## Official sheets (data the model is based on)

These stay on disk as the label source. They are **not** map layers.

| Sheet | Path | How the model uses it |
|---|---|---|
| EIL / Earthquake 50K 2014 | `frontend/public/hazards/eil-2014/` (`source.kmz`, leaf tiles, `tiles.json`) | **Primary local class.** Cream = SAFE, yellow = LOW, purple = MODERATE, red = HIGH, cyan hatch = runout → MODERATE. Hazard hugs the **west ridge** (San Salvador / Ibabang Banga), not the whole bbox. |
| Ground Shaking 2014 | `frontend/public/hazards/gsh-2014/` | **Context only.** Almost all PEIS VIII across Luisiana — store on each label, do **not** drive the local class. |
| EIL 2010 | `frontend/public/hazards/eil-2010/` | Older sheet. Prefer 2014 EIL for labels unless comparing vintages. |

Georeference = KMZ `GroundOverlay/LatLonBox` on the highest-LOD tiles. Do not geocode the overview PNG (legend chrome).

Sample colored pixels with `frontend/scripts/sample-earthquake-labels.ps1` → `frontend/public/data/luisiana-earthquake-labels.csv`. Metadata for tile boxes lives in `frontend/src/lib/hazard-overlays.ts`.

## Classes

HIGH = EIL high · MODERATE = EIL moderate/runout · LOW = EIL low · SAFE = no mapped susceptibility (town proper / cream).

GSH 2014 is PEIS VIII almost everywhere — store it as context, do not drive local class.

## Build

1. Labels: `frontend/scripts/sample-earthquake-labels.ps1` (EIL tile LatLonBox + Luisiana polygon).
2. `ml-earthquake.ts` — 4-class softmax, train on first Risk-tab enable, IndexedDB persist. Bump the model key when labels change.
3. Map: Google-style heatmap of **predicted** cells (plus 2014-informed labels in the gaps) inside the black border + hover card. No official KMZ imagery layer.
4. Pin HUD: `predictAt` fetches **old** (nearest PHIVOLCS 2014 label) **and** **prediction** (TF.js). Show both. Do not hide the model just because a 2014 pixel is nearby.

## Do not

- Replay only old KMZ dots or paint the official sheet on the globe
- Add Risk-tab / shortcut toggles for EIL 2010, EIL 2014, or Ground Shaking
- Use EONET / live catalogs
- Claim PHIVOLCS-certified output
- Draw cells outside the municipal polygon
