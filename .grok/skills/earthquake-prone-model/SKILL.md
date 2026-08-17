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
| PHIVOLCS KMZ photos | **Training labels only** (where the old map painted yellow/purple/red) |
| TF.js net | **Prediction** at any lon/lat inside Luisiana |
| Visible dots | Model output on a municipal-clipped grid |
| Official overlay toggle | Reference sheet — leave it |

Do not set `hazardMapPoints()` (raw KMZ pixels) as the map product. Train, then `predictGrid()`.

## Classes

HIGH = EIL high · MODERATE = EIL moderate/runout · LOW = EIL low · SAFE = no mapped susceptibility (town proper / cream).

GSH 2014 is PEIS VIII almost everywhere — store it as context, do not drive local class.

## Build

1. Labels: `frontend/scripts/sample-earthquake-labels.ps1` (EIL tile LatLonBox + Luisiana polygon).
2. `ml-earthquake.ts` — 4-class softmax, train on first Risk-tab enable, IndexedDB persist. Bump the model key when labels change.
3. Map: predicted cells inside the black border + hover card.
4. Pin HUD: `predictAt` fetches **old** (nearest PHIVOLCS 2014) **and** **prediction** (TF.js). Show both. Do not hide the model just because a 2014 pixel is nearby.

## Do not

- Replay only old KMZ dots
- Use EONET / live catalogs
- Claim PHIVOLCS-certified output
- Draw dots outside the municipal polygon
