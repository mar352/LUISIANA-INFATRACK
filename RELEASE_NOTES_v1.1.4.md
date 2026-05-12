# NASA EONET Natural Event Tracker - Version 1.1.4

## Major New Feature

Added comprehensive real-time natural event tracking powered by NASA Earth Observatory Natural Event Tracker (EONET) API.

## Key Features

### Interactive Event List
- Click-to-Fly: Click any event to fly the map to its location
- Distance Display: See how far each event is from Luisiana
- Event Details: View magnitude, category, and last update time
- Scrollable List: Up to 20 nearest events displayed

### Real-Time Monitoring
13 Event Categories tracked:
- Wildfires
- Severe Storms (Hurricanes, Typhoons, Tornadoes)
- Volcanoes
- Earthquakes
- Floods
- Droughts
- Landslides
- Dust and Haze
- Snow Events
- Temperature Extremes
- Sea and Lake Ice
- Water Color (Algae Blooms)
- Manmade Events

### Smart Filtering
- Geographic Filtering: Adjustable radius from 100 km to 5,000 km
- Category Selection: Toggle specific event types on/off
- Distance Calculation: Haversine formula for accurate distances
- Auto-Refresh: Updates every 30 minutes

### 3D Visualization
- Color-Coded Markers: Each event type has distinct color
- Size-Based Magnitude: Larger circles = more severe events
- GPU-Accelerated: Smooth rendering via Deck.gl
- Interactive: Hover and click for details

## What's Included

### New Files
- frontend/src/lib/eonet.ts - Complete EONET API integration (350+ lines)
- NASA_EONET_GUIDE.md - Comprehensive documentation
- CHANGELOG_v1.1.4.md - Detailed release notes

### Modified Files
- frontend/src/ui/App.tsx - Events tab UI and state management
- frontend/src/ui/DeckOverlay.tsx - Event visualization layer

## Use Cases for Luisiana LGU

1. Disaster Preparedness - Monitor approaching typhoons and storms
2. Agricultural Planning - Track drought and temperature extremes
3. Infrastructure Risk - Assess earthquake and flood risks
4. Public Safety - Real-time awareness of regional hazards

## Technical Details

- API: NASA EONET v3 (Public Domain, No API Key Required)
- Update Frequency: Every 30 minutes
- Performance: GPU-accelerated rendering, 60 FPS
- Build Size: 2,630 KB (minified)
- Dependencies: No new dependencies added

## Quick Start

1. Login with MPDC or Engineer credentials
2. Click Events tab in sidebar
3. Toggle ON Enable Event Tracking
4. Adjust search radius and categories
5. Click events in list to fly to location

## Upgrade Instructions

```bash
git pull origin master
cd frontend
npm install
npm run build
```

## Previous Features (Maintained)

All existing features from v1.1.3 remain fully functional:
- 3D Solar Radiation Visualization
- Enhanced 3D Terrain with WebGL
- NASA GIBS Climate Data (10 layers)
- Real-time Weather and Radar
- Risk Zone Monitoring
- Infrastructure Project Tracking

## Credits

- Data Provider: NASA EONET API
- Development: Luisiana InfraTrack Team

---

Status: Production Ready
Release Date: May 11, 2026
Breaking Changes: None (Backward Compatible)
