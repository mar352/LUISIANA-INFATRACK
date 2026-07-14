# LUISIANA INFATRACK - Technical Specifications

## 3.4 Technical Specifications

### System Architecture

| Component | Specification |
|-----------|--------------|
| **Security Layer** | Role-Based Access Control (RBAC) with 4 user roles |
| **Mapping Engine** | MapLibre GL JS + Deck.gl WebGL Visualization |
| **3D Rendering** | Three.js for GLB/GLTF 3D Models |
| **Frontend Framework** | React 18 + TypeScript + Vite |
| **Backend Framework** | Node.js + Express.js |
| **Real-Time Communication** | Socket.IO (WebSocket) |
| **Database** | In-Memory (Extensible to MySQL/PostgreSQL/Firebase) |
| **AI/ML Engine** | TensorFlow.js (Client-Side Deep Learning) |
| **Connectivity** | Real-Time Data Synchronization via WiFi/LTE |

---

## Frontend Technologies

### Core Framework
- **React 18.3.1** - Component-based UI library
- **TypeScript 5.6.2** - Type-safe JavaScript
- **Vite 5.4.11** - Fast build tool and dev server

### Mapping & Visualization
- **MapLibre GL JS 4.7.1** - Open-source map rendering engine
- **Deck.gl 9.0.38** - WebGL-powered data visualization
  - `@deck.gl/core` - Core visualization framework
  - `@deck.gl/layers` - Standard visualization layers
  - `@deck.gl/aggregation-layers` - Heatmap and aggregation
  - `@deck.gl/mapbox` - MapLibre integration
- **Three.js 0.170.0** - 3D graphics library for GLB models
- **GLTFLoader** - 3D model loading

### Machine Learning
- **TensorFlow.js 4.22.0** - Browser-based ML framework
  - Deep Neural Network (4 layers: 64→32→16→1 neurons)
  - Real-time terrain risk prediction
  - Client-side model training and inference

### Utilities
- **SunCalc 1.9.0** - Sun position calculations for shadows
- **MapLibre GL 4.7.1** - Map controls and interactions

---

## Backend Technologies

### Server Framework
- **Node.js 18+** - JavaScript runtime
- **Express.js 4.x** - Web application framework
- **Socket.IO 4.x** - Real-time bidirectional communication

### APIs & Services
- **RESTful API** - HTTP endpoints for CRUD operations
- **WebSocket Server** - Real-time updates (5-second intervals)

---

## External APIs & Data Sources

### NASA APIs (No API Key Required)
1. **NASA EONET API**
   - URL: `https://eonet.gsfc.nasa.gov/api/v3`
   - Purpose: Natural disaster event tracking
   - Data: 13 event categories (wildfires, earthquakes, floods, etc.)
   - Update Frequency: Real-time
   - License: Public Domain

2. **NASA GIBS API**
   - URL: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi`
   - Purpose: Satellite imagery and climate data
   - Layers: 10 layers (precipitation, temperature, imagery, atmosphere)
   - Resolution: 250m - 50km depending on layer
   - License: Public Domain

### Weather APIs
3. **Open-Meteo API**
   - URL: `https://api.open-meteo.com/v1/forecast`
   - Purpose: Weather forecasting (ECMWF IFS 0.25° model)
   - Data: Temperature, wind, precipitation, humidity, pressure
   - Update Frequency: 5-second polling
   - License: CC-BY 4.0 (Free, no API key)

4. **RainViewer API**
   - URL: `https://api.rainviewer.com/public/weather-maps.json`
   - Purpose: Animated precipitation radar
   - Data: Past 10 frames + 3 nowcast frames
   - Update Frequency: Real-time
   - License: Free (No API key)

### Map Services
5. **Mapbox/MapLibre**
   - Purpose: Base map tiles and terrain data
   - API Key: Required (set in `.env`)
   - Features: Vector tiles, satellite imagery, 3D terrain

6. **Terrain DEM Sources**
   - Terrarium: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
   - Mapbox Terrain RGB: `mapbox://mapbox.terrain-rgb`
   - Purpose: Elevation data for 3D terrain and slope analysis

---

## System Features

### 1. Real-Time GIS Mapping
- **Technology**: MapLibre GL JS + WebGL
- **Features**:
  - Full-screen interactive 3D map
  - Dynamic terrain exaggeration (zoom-based)
  - Hillshade and atmospheric sky layers
  - Building shadows with real sun position
  - Dark mode optimized

### 2. Role-Based Access Control (RBAC)
- **Roles**: 4 user types
  1. **MPDC** - Full access to all features
  2. **Engineer** - Infrastructure + Risk monitoring
  3. **Agriculture** - Weather + Risk monitoring
  4. **Negosyo Center** - Business permits only
- **Implementation**: Client-side role filtering
- **Authentication**: Hardcoded demo credentials (extensible to OAuth/JWT)

### 3. NASA Natural Event Tracker
- **Data Source**: NASA EONET API
- **Event Categories**: 13 types
  - Wildfires, Severe Storms, Volcanoes, Earthquakes
  - Floods, Drought, Landslides, Dust/Haze
  - Snow, Temperature Extremes, Sea Ice, Water Color, Manmade
- **Features**:
  - Real-time event markers on map
  - Geographic filtering (500km radius)
  - Click-to-fly navigation
  - Auto-refresh every 30 minutes
  - Interactive tooltips with event details

### 4. AI-Powered Risk Analysis
- **Technology**: TensorFlow.js Deep Neural Network
- **Architecture**:
  - Input Layer: 9 terrain features
  - Hidden Layers: 64 → 32 → 16 neurons (ReLU activation)
  - Output Layer: 1 neuron (Sigmoid activation)
  - Dropout: 30% and 20% for regularization
- **Training**:
  - 2000 synthetic samples (Philippines-specific patterns)
  - 50 epochs with validation split (20%)
  - Adam optimizer (learning rate: 0.001)
  - Binary cross-entropy loss
- **Features Analyzed**:
  1. Slope angle (0-90°)
  2. Elevation (meters)
  3. Aspect (0-360°)
  4. Terrain curvature (-1 to 1)
  5. Rainfall (mm)
  6. Soil moisture (0-100%)
  7. Vegetation density (0-1)
  8. Distance to river (meters)
  9. Historical events count
- **Predictions**:
  - Landslide risk (0-100%)
  - Flood risk (0-100%)
  - Overall risk score
  - Risk level (SAFE/LOW/MODERATE/HIGH/CRITICAL)
  - Confidence score
- **Performance**:
  - 20x20 grid (441 prediction points)
  - LRU cache (500 entries)
  - Real-time inference (<100ms per point)
- **Visualization**:
  - Smooth gradient heatmap
  - Color-coded risk zones (green→yellow→orange→red)
  - Interactive hover tooltips

### 5. Weather & Climate Data
- **Real-Time Weather**:
  - ECMWF IFS 0.25° model via Open-Meteo
  - 5-second update interval
  - 6-hour forecast
  - Fallback to deterministic simulation
- **Animated Radar**:
  - RainViewer precipitation radar
  - 9 color schemes (Windy Style, TITAN, Classic, etc.)
  - Smooth animation loop
- **Satellite Imagery**:
  - NASA GIBS layers (10 available)
  - Date-based imagery from 2000 onwards
  - Precipitation, temperature, true color, atmosphere
- **Weather Canvas Overlay**:
  - Animated cloud particles
  - Rain streak effects
  - Wind-based movement

### 6. 3D Infrastructure Visualization
- **Technology**: Three.js + GLTFLoader
- **Model Format**: GLB/GLTF
- **Features**:
  - 11 pre-built models (office, school, hospital, etc.)
  - Custom model upload support
  - Interactive placement with modal form
  - Real-time manipulation:
    - Drag to move
    - Right-drag to rotate
    - Scroll to scale
  - Status-based coloring (Planning/Ongoing/Completed)
  - Building information modal
  - Shadow casting with sun position

### 7. Terrain Analysis
- **Slope Visualization**:
  - 30x30 grid analysis
  - Color-coded slope angles
  - Real elevation data integration
- **Solar Radiation**:
  - Hour-by-hour analysis (0-23)
  - 3D column visualization
  - 20x20 grid coverage
- **Hillshade**:
  - Dynamic terrain depth
  - Adjustable intensity

### 8. Impact Heatmap
- **Style**: Zoom Earth-inspired
- **Data Sources**:
  - Rainfall intensity
  - Landslide pressure
  - Infrastructure density
- **Rendering**:
  - Smooth gradient (blue→yellow→red)
  - Pulsing animation effect
  - Aggregation: SUM

### 9. Real-Time Alerts
- **Technology**: Socket.IO WebSocket
- **Trigger**: Automatic HIGH-risk detection
- **Delivery**: Department-specific notifications
- **Features**:
  - Alert history
  - Severity levels
  - Recommended actions

### 10. Infrastructure Tracking
- **Features**:
  - Project markers on map
  - Status tracking (Planning/Ongoing/Completed)
  - Progress percentage (0-100%)
  - Department assignment
  - Location coordinates
  - Rotation angle
  - Custom descriptions
- **Placement Workflow**:
  1. Enable placement mode
  2. Select building type
  3. Click map location
  4. Fill modal form with details
  5. Submit to place building

---

## Performance Optimizations

### Caching Strategies
1. **Heatmap Data Cache** - useRef cache for visualization data
2. **Grid Generation Cache** - Module-level cache for terrain grid
3. **ML Prediction Cache** - LRU cache (500 entries) for TensorFlow predictions
4. **Color Range Memoization** - Reused array references

### Memory Management
- **Total Overhead**: ~260KB
  - Grid Cache: ~50KB
  - Prediction Cache: ~200KB
  - Heatmap Cache: ~10KB

### Rendering Optimizations
- **WebGL Acceleration** - Hardware-accelerated graphics
- **Memoization** - React useMemo and useRef hooks
- **Lazy Loading** - On-demand model loading
- **Batch Processing** - 100-point batches for ML predictions

---

## Data Flow Architecture

### Client → Server
```
User Action → React Component → API Call → Express Route → Database
```

### Server → Client (Real-Time)
```
Data Change → Socket.IO Emit → Client Listener → State Update → UI Render
```

### External APIs
```
Client → NASA/Weather API → Response → State Update → Visualization
```

---

## Security Features

### Authentication & Authorization
- Role-based access control (RBAC)
- Session management
- Credential validation

### Data Security
- Input sanitization
- XSS prevention
- SQL injection prevention (parameterized queries)
- File upload validation (GLB/GLTF only)

### Network Security
- HTTPS support
- CORS configuration
- Rate limiting (extensible)

---

## Deployment Specifications

### Development Environment
- **Frontend**: `npm run dev` (Vite dev server on port 5173)
- **Backend**: `npm run dev` (Express server on port 4000)
- **Hot Reload**: Enabled for both frontend and backend

### Production Build
- **Frontend**: `npm run build` → Static files in `dist/`
- **Backend**: Node.js process
- **Deployment**: Can be deployed to Vercel, Netlify, AWS, etc.

### System Requirements
- **Node.js**: 18+ LTS
- **RAM**: 2GB minimum (4GB recommended)
- **Storage**: 500MB for dependencies
- **Browser**: Modern browser with WebGL 2.0 support
  - Chrome 90+
  - Firefox 88+
  - Safari 15+
  - Edge 90+

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| WebGL 2.0 | ✅ 90+ | ✅ 88+ | ✅ 15+ | ✅ 90+ |
| WebSocket | ✅ | ✅ | ✅ | ✅ |
| TensorFlow.js | ✅ | ✅ | ✅ | ✅ |
| Three.js | ✅ | ✅ | ✅ | ✅ |
| MapLibre GL | ✅ | ✅ | ✅ | ✅ |

---

## API Endpoints

### Projects API
- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create new project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/upload-model` - Upload custom GLB model

### Real-Time Events (Socket.IO)
- `projects:update` - Project list updated
- `weather:update` - Weather data updated (every 5 seconds)
- `alerts:new` - New alert triggered

---

## File Structure

```
LUISIANA-INFATRACK/
├── frontend/
│   ├── src/
│   │   ├── ui/
│   │   │   ├── App.tsx (Main application)
│   │   │   ├── DeckOverlay.tsx (Visualization layers)
│   │   │   ├── BuildingOverlay.tsx (3D models)
│   │   │   └── styles.css
│   │   ├── lib/
│   │   │   ├── api.ts (Backend API)
│   │   │   ├── eonet.ts (NASA EONET)
│   │   │   ├── gibs.ts (NASA GIBS)
│   │   │   ├── radar.ts (RainViewer)
│   │   │   ├── ml-risk.ts (TensorFlow.js)
│   │   │   ├── risk-grid.ts (Grid generation)
│   │   │   ├── terrain.ts (3D terrain)
│   │   │   ├── solar.ts (Solar analysis)
│   │   │   ├── slope.ts (Slope analysis)
│   │   │   └── heatmap.ts (Heatmap generation)
│   │   └── types.ts (TypeScript definitions)
│   └── public/
│       └── models/ (GLB 3D models)
├── backend/
│   └── src/
│       ├── index.js (Express server)
│       └── services/
│           ├── weather.js (Weather API)
│           ├── projects.js (Project management)
│           ├── alerts.js (Alert system)
│           └── risk.js (Risk calculation)
└── Documentation/
    ├── README.md
    ├── TECHNICAL_SPECIFICATIONS.md
    ├── API_DOCUMENTATION.md
    └── USER_GUIDE.md
```

---

## Scalability & Extensibility

### Database Migration
- Current: In-memory storage
- Extensible to:
  - MySQL/PostgreSQL (relational)
  - MongoDB (NoSQL)
  - Firebase (cloud)

### Authentication
- Current: Hardcoded demo credentials
- Extensible to:
  - JWT tokens
  - OAuth 2.0 (Google, Facebook)
  - LDAP/Active Directory

### Cloud Deployment
- Frontend: Vercel, Netlify, AWS S3 + CloudFront
- Backend: AWS EC2, Google Cloud Run, Heroku
- Database: AWS RDS, Google Cloud SQL, MongoDB Atlas

---

## Testing & Quality Assurance

### Testing Strategy
- **Unit Tests**: Component-level testing
- **Integration Tests**: API endpoint testing
- **E2E Tests**: User workflow testing
- **Performance Tests**: Load testing, stress testing

### Code Quality
- **TypeScript**: Type safety
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Git Hooks**: Pre-commit validation

---

## License & Attribution

### Open Source Libraries
- React, TypeScript, Vite - MIT License
- MapLibre GL JS - BSD 3-Clause License
- Deck.gl - MIT License
- Three.js - MIT License
- TensorFlow.js - Apache 2.0 License

### Data Sources
- NASA EONET - Public Domain
- NASA GIBS - Public Domain
- Open-Meteo - CC-BY 4.0
- RainViewer - Free API

---

**Document Version**: 1.0  
**Last Updated**: May 14, 2026  
**Project**: LUISIANA INFATRACK  
**Author**: Development Team
