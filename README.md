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
