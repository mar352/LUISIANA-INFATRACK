---
name: infatrack-siting
description: >
  INFA-TRACK / IMPACT-Luisiana product rules for the map-first LGU siting app.
  Use when changing the Cesium map, site pins, roles, Risk/Climate/Events tabs,
  or when the user talks about safe build areas, MPDC, Engineer, or Luisiana.
---

# INFA-TRACK siting app

Luisiana, Laguna GIS for **where to build infrastructure on safer ground**. Not an MDRRM operations console.

## Stack

- React 18 + TS + Vite frontend; Express + Socket.IO backend
- Cesium is the primary globe (`ENABLE_MAPLIBRE` is false)
- Dual project store: backend JSON + Firestore; socket `projects:update` can overwrite local state
- Roles: MPDC, Engineer, Agriculture, Negosyo Center, Barangay Official, Viewer
- Barangay Official files infrastructure requests (Planning → Request infrastructure). They do not approve, place models, or open Activity / Analytics. Seed login `barangay` / `impact2024`.

## Site pins vs models

- MPDC pins first (`siteMarkerOnly: true`) — marker only, stay **Planned**
- Engineer clicks a pin → confirm **Itatayo na ba ito?** → `modelType: construction`, unlock, Engineer still places (move / rotate / scale)
- Only Engineer can remove a building. Do not show Remove Building to MPDC. Hide Remove Building / Remove site pin unless Edit Mode is on.
- Placement Mode freezes existing models (no select / drag). Clicks only drop the new site.
- Edit Mode is how you move a model: turn it on from the map chip (bottom-left, Engineer), click a building, then left-drag to reposition (right-drag rotate, scroll scale). Hide the place-details panel in Edit Mode. Lock / Unlock only appears in Edit Mode. Outside Edit Mode, 3D models never move. After one model is selected, other models are not clickable — click empty ground (or ×) to deselect, then pick another.

## Tabs

- **Risk** — PHIVOLCS KMZ overlays (EIL / ground shaking) + explainable rainfall/slope zones. Site-safety layers stay.
- **Climate** — NASA GIBS overlays. Precipitation follows **tropical tracking**.
- **Events** — tropical Invest/TC + GIBS precip toggle only. **No NASA EONET** (wildfires, volcanoes, live earthquakes).
- **Projects / Layers / Climate** stay map-first.

## Map camera

Home look-at is street-level Luisiana (municipal office). Do not lock tilt unless asked. Horizon flip is a pitch/collision issue — clamp pitch, do not disable rotate.

## Auth / audit

Staff login is hashed + session. Activity log is a visible **Activity** button for staff. Firestore rules must allow `sessions` and `auditLogs` or login/audit fail.
