---
name: satellite-terrain-predict
description: >
  Predict earthquake-prone / safe-build sites from live satellite + terrain
  (DEM slope and elevation), not only the 2014 PHIVOLCS sheet. Use when the
  user mentions satellite prediction, terrain slope model, DEM features,
  Esri imagery risk, or /satellite-terrain-predict.
---

# Satellite + terrain prediction

PHIVOLCS EIL 2014 is **labels**. Satellite and terrain are **features** so TensorFlow.js can predict at sites the old sheet never painted.

## Inputs

| Signal | Source in this repo | Use |
|---|---|---|
| Elevation / slope / aspect | Cesium World Terrain or ArcGIS Terrain3D (`cesium-terrain.ts`). Fallback: AWS Terrarium via `backend/src/services/dem.js` | Steep west-ridge slopes match EIL yellow/purple |
| Satellite | Layers toggle Satellite = Esri World Imagery on the globe | Greenness / brightness as vegetation + built-up proxy |
| Labels | `luisiana-earthquake-labels.csv` from EIL KMZ pixels | HIGH / MODERATE / LOW / SAFE |
| Clip | `isInsideLuisiana` black border | Never predict outside the municipality |

Do not invent slope from “distance to town center” (`risk-grid.ts` heuristics) when a DEM sampler is registered.

## Runtime

1. User turns **Satellite** on (terrain comes with it in App) **and** Risk → earthquake-prone grid.
2. `CesiumMap` registers `sampleTerrainSat` via `registerTerrainSatSampler`.
3. `ml-earthquake.ts` samples DEM (3×3 Horn slope) for each training point, then trains TF.js.
4. Visible layer = official PHIVOLCS dots **plus** model HIGH/MODERATE in the gaps (`buildMapLayer`).
5. Pin HUD = `predictAt` using the same terrain features.

If terrain is off, say so in the Risk status — do not silently train on fake slope.

## Files

- `frontend/src/lib/terrain-sat-features.ts` — sampler registry + cache
- `frontend/src/lib/ml-earthquake.ts` — TF.js net, bump IndexedDB key when features change
- `frontend/src/ui/CesiumMap.tsx` — register sampler from `viewer.terrainProvider`
- Official KMZ overlays stay on the Risk tab

## Do not

- Replace PHIVOLCS dots with an all-blue square grid
- Use EONET / live quakes
- Sample the KMZ overview PNG (legend chrome)
- Claim the prediction is a PHIVOLCS product
