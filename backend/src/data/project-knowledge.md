# INFA-TRACK Luisiana — Project Knowledge

## Place (always use these names)
- The app is for the **Municipality of Luisiana**, province of **Laguna**, **Philippines** (Region IV-A / CALABARZON).
- Nearby towns often shown on the map include Magdalena, Lucban, Majayjay, Cavinti — but the focus LGU is **Luisiana**.
- Map center is approximately **14.19°N, 121.51°E** (Luisiana area).
- Never write placeholders like `[city/town]` or `[city_name]`. Always say **Luisiana, Laguna** when referring to the location.

## What the product is
INFA-TRACK (IMPACT-Luisiana) is a real-time **GIS infrastructure and disaster monitoring** web app for Luisiana LGU offices (MPDC, Engineering, Agriculture, Negosyo Center, Barangay Officials) plus a public Viewer.

## Stack
- Frontend: React + Vite + MapLibre GL + Three.js (GLB buildings) + Deck.gl
- Backend: Node.js Express + Socket.IO
- Persistence: backend JSON for projects; Firestore for accounts, projects mirror, and Collaborative Planning

## URLs / ports
- Dev UI (hot reload): http://localhost:5173
- Production Docker UI (nginx static build): http://localhost:8080 — outdated until `docker compose up --build`
- Backend API + Socket.IO: http://localhost:4000 (not a webpage; use localhost not 0.0.0.0 in the browser)
- Live vs Offline chip: Live = Socket.IO connected to backend; Offline = backend not reachable

## Roles
- MPDC, Engineer, Agriculture, Negosyo Center, Barangay Official, Viewer
- Seed accounts (typical): mpdc, engineer, agriculture, negosyo, barangay — password impact2024
- Viewer is read-only for 3D model transforms
- Barangay Official submits barangay infrastructure requests only (no approve / no model placement)

## Map / layers
- OpenFreeMap Liberty vector basemap (openmaptiles)
- Optional OSM street raster toggle
- Live Situation panel tabs: Layers, Risk, Projects
- Infrastructure projects as GLB 3D models on the map

## Projects / 3D models
- Place Infrastructure (Engineer): Placement Mode → click map → details modal
- Select building: left-drag move, right-drag rotate (yaw), scroll scale; Save Position
- Edit Mode (Projects tab): neon pulsing street overlay on road centerlines
- Snap to Road: magnetizes model to nearest road (~12 m) and aligns yaw to road bearing
- Custom GLB upload via backend (large models supported up to ~500MB)

## Collaborative Planning
- Top bar → Planning (roles with canSeePlanning). Barangay Official sees **Requests**.
- Workspace board: proposals by status (draft → submitted → in_review → recommended/approved/returned/rejected)
- Barangay Official: + Request infrastructure → barangay_request card for MPDC review
- Priority 1–5; assignees from accounts; committees (MDC, Infra, BAC, Agri, Zoning)
- Comments with optional section/map anchors
- Calendar: month grid + events (committee, hearing, deadline, site)
- Meetings: agenda, minutes, decisions, file attachments
- Approve & create project links a planning proposal to a map project

## Inventory
- Inventory page for project catalog / Firestore-backed inventory views

## Chatbot rules
- Answer only about INFA-TRACK / Luisiana using this knowledge
- Do not invent features, weather numbers, or placeholders
- If asked for a live forecast you cannot see, tell the user to open the **Climate** tab in the Live Situation panel for Luisiana readings
