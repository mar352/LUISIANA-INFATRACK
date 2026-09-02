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
- Placement Mode freezes existing models (no select / drag). Clicks only drop the new site. No gizmo while placing. After Engineer confirms a new GLB, Placement Mode turns off and Edit Mode opens on that building with the gizmo.
- Edit Mode is how you move a model: turn it on from the map chip (bottom-left, Engineer), click a building. Blender-style tools: Select (A), Move (G), Rotate (R), Scale (S), axis lock X/Y/Z, ENU gizmo on the model. Size tool: center cube / scroll = overall size; X cube = width, Y = depth, Z = height. HUD Width / Depth / Height nudges the same. Right-drag still rotates. Scroll scales only when the cursor is on the selected model or gizmo — otherwise the globe zooms. Hide the place-details panel in Edit Mode. Lock / Unlock only appears in Edit Mode. Outside Edit Mode, 3D models never move. After one model is selected, other models are not clickable — click empty ground (or ×) to deselect, then pick another.

## Tabs

- **Risk** — explainable rainfall/slope zones + the earthquake-prone model heatmap (cyan LOW → red HIGH). **No official PHIVOLCS KMZ overlay toggles** — EIL 2010 / EIL 2014 / Ground Shaking sheets are training data for the model only (see `/earthquake-prone-model`). Not a live-event heat layer. Clicking a placed site shows a **Luisiana-only siting assessment**: PEIS / EIL 2014 / terrain model / Mt. Banahaw from local sheets, plus **live MGB flood and rain-induced landslide** from GeoRiskPH public layers (`/api/georisk-assess`). **View report** on that block opens a printable table (Hazard / Assessment / Explanation and recommendation). Not HazardHunterPH. No fault / liquefaction / surge from GeoRisk. Outside the municipality, no assessment.
- **Climate** — station readings, tropical Invest/TC tracking, NASA GIBS overlays. Precipitation follows **tropical tracking**. **No NASA EONET.** No Events tab.
- **Projects / Layers / Climate** stay map-first. Layers has no heatmap, weather overlay, storm-track, or development-priority heatmap toggles (not an MDRRM / heat console). Planning scores stay on the Planning board.
- **Settings** — globe performance: draw distance, terrain quality, shadows, fog, motion blur. Saved on the device. Not an MDRRM console.
- **Account** — signed-in staff change their own password (current + new, min 8 characters). Separate from globe Settings.

## Map shortcuts

Left-rail SVG buttons toggle the common map layers (satellite, 3D blocks, projects, barangays, shapes, quake heatmap, climate readings, tropical) so staff do not have to open the side panel. Active = gold on navy. Hover shows the name. Barangays paints each of the 23 barangays a different color with a legend; click a legend row to fly the globe to that barangay. **Shapes** (Engineer) opens a palette of volumes (freeform / box / cylinder), roofs, and trees — click a tile then click the globe (freeform: draw a polygon, then Finish). Climate opens the station readings card on the map. No Street View. No KMZ overlay shortcuts.

## Map camera

Home look-at is street-level Luisiana (municipal office). Do not lock tilt unless asked. Horizon flip is a pitch/collision issue — clamp pitch, do not disable rotate.

## Reporting

Staff **Analytics** generates live municipal reports from map projects: CSV (projects / barangay / budget), multi-sheet Excel, municipal PDF (includes globe snapshot), and printable map. Per-project accomplishment reports (Projects panel) export CSV, Excel, PDF (print), and JSON. No scheduled/cron reports — one-click from live data.

**Analytics also has explainable decision support** (`planning-insights.ts`): a predictive outlook (months to clear ongoing work, gaps with nothing in flight) and ranked next-build recommendations (which facility in which barangay, plus matching Planning requests). Planning request scores (0–100) stay rule-based and gain points when the request fills a mapped baseline gap. Not ML. No development-priority heatmap on the globe.

**Critical infrastructure identification** (Analytics): filterable list of mapped halls, health facilities, schools, water, and evacuation centers, with live flood/landslide and 2014 seismic class per pin. Identification is by model type on the globe — not an NDRRMC CI inventory.

## Notifications

**Notify** tab (all municipal staff) includes project/schedule alerts from live data: deadline overdue or within 14 days, budget ≥90% / over, Delayed/Suspended status, Planning meetings and calendar items in the next 7 days, and projects in Maintenance. Engineer/MPDC still also see planning-workflow notices. Click opens Projects or Planning. Dismiss is local to the browser. Not an MDRRM live-event inbox.

## Auth / audit

Staff login is hashed + session on the Express server (`POST /api/auth/login`). Change password is Settings → Account (`POST /api/auth/password`). Activity log is a visible **Activity** button for staff.

## Field photos / QR

Place panel: **Take photo** (rear camera on phones) and gallery upload. GPS is stamped on the photo when the browser allows geolocation. If the network is down, the photo is stored in IndexedDB on the device and uploaded when `online` (flush every 20s). **Asset QR** on Overview opens `?asset=<projectId>` and flies the globe to that site. Not an in-app QR scanner — phone camera scan of the printed/on-screen QR is enough.

**Offline globe:** Left-rail **Offline mode** toggle. First turn-on downloads Luisiana Esri tiles if the pack is empty, then uses cache. Toggle off = live Ion/OSM globe. Service worker only intercepts Esri tiles while the toggle is on. 3D terrain is ellipsoid in offline mode. Not a nationwide pack.
