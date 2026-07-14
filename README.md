## IMPACT-Luisiana: Real-Time GIS Infrastructure and Disaster Monitoring System

Map-first LGU-friendly web system (React + Node/Express) with:
- Full-screen live GIS map (dark mode default)
- Animated Zoom Earth–style heatmap (rainfall, landslide pressure, infrastructure density)
- Weather overlay + storm tracking (real-time API + simulation fallback)
- Landslide risk zones (rainfall + slope logic)
- Real-time alerts (WebSockets)
- Infrastructure project tracking markers

### Project structure
- `frontend/` React (Vite) app
- `backend/` Node.js (Express) API + Socket.IO real-time server

---

## Quick start with Docker (recommended for sharing)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

1. Copy the env file and add your Mapbox token (optional but needed for the base map):

```bash
cp .env.example .env
```

Edit `.env` and set `VITE_MAPBOX_TOKEN=pk....`

2. Build and run:

```bash
docker compose up --build
```

3. Open **http://localhost:8080**

Stop with `Ctrl+C`, or run detached:

```bash
docker compose up --build -d
docker compose down
```

Groupmates only need Docker + this repo + a Mapbox token in `.env` (shared or each creates their own).

### Hot reload (dev)

The default `docker compose up` builds a **production** image (nginx + static files). Code changes do **not** auto-reload — you must rebuild:

```bash
docker compose up --build -d
```

For **hot reload** while coding (Vite HMR + backend `node --watch` + Compose file watch):

```bash
docker compose -p infatrack-dev -f docker-compose.dev.yml up --build --watch
```

Or double-click `run-docker-dev.bat`, then open **http://localhost:5173**.  
Uses project name `infatrack-dev` so it won't replace the production stack on `:8080`.  
Code changes under `frontend/src` and `backend/src` reload automatically — no rebuild needed.

| Mode | Command | URL | Auto-reload |
|------|---------|-----|-------------|
| Share / demo | `docker compose up --build` | :8080 | No — run `docker compose up --build -d` after changes |
| Development | `docker compose -p infatrack-dev -f docker-compose.dev.yml up --build --watch` | :5173 | Yes — instant on save |

---

### Local development (without Docker)

**Prerequisites:** Node.js LTS (18+)

Open two terminals.

Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Then open the Vite URL shown in the terminal (usually `http://localhost:5173`).

### Map token
This project uses Mapbox for the base map. Create a Mapbox token and set it in:
- Docker: root `.env` as `VITE_MAPBOX_TOKEN=...`
- Local: `frontend/.env` as `VITE_MAPBOX_TOKEN=...`

If you don’t have a token yet, the app will still load the UI but the map will show a token warning.

### Project monitoring data

Infrastructure project records (status, progress, milestones, budget, issues) are persisted to:

- **Local dev:** `backend/data/projects.json` (auto-seeded on first run)
- **Docker:** volume `project_data` mounted at `/app/data/projects.json` inside the backend container

Edits from the **Projects** tab survive container restarts when using Docker Compose.
