# NASA EONET Natural Event Tracker Integration Guide

## Overview

The Luisiana InfraTrack platform now includes real-time natural event tracking powered by NASA's EONET (Earth Observatory Natural Event Tracker) API. This feature provides live monitoring of natural disasters and environmental events worldwide, with filtering capabilities to focus on events near Luisiana, Laguna.

## What is NASA EONET?

NASA EONET is a public API that provides near real-time natural event metadata from multiple authoritative sources. Events are continuously updated and include:

- **Wildfires** 🔥 - Forest fires, brush fires, and wildland fires
- **Severe Storms** 🌪️ - Hurricanes, cyclones, tornadoes, typhoons
- **Volcanoes** 🌋 - Volcanic eruptions and ash plumes
- **Earthquakes** 🌍 - Seismic activity and ground displacement
- **Floods** 🌊 - Water inundation and overflow events
- **Droughts** 🏜️ - Prolonged absence of precipitation
- **Landslides** ⛰️ - Mudslides, avalanches, and slope failures
- **Dust & Haze** 💨 - Dust storms and air pollution events
- **Snow** ❄️ - Extreme snowfall events
- **Temperature Extremes** 🌡️ - Heat waves and cold snaps
- **Sea & Lake Ice** 🧊 - Ice formations and icebergs
- **Water Color** 🌊 - Algae blooms, red tide, sediment
- **Manmade Events** 🏭 - Human-induced extreme events

## Features

### 1. Real-Time Event Tracking
- Events are fetched from NASA EONET API every 30 minutes
- Only active (open) events are displayed
- Events from the last 30 days are included

### 2. Geographic Filtering
- Events are filtered by distance from Luisiana, Laguna (14.1856° N, 121.5167° E)
- Adjustable search radius from 100 km to 5,000 km
- Default radius: 1,000 km (covers Philippines and nearby regions)

### 3. Category Filtering
- Select which event types to display
- Default categories: Wildfires, Severe Storms, Volcanoes, Earthquakes, Floods
- Toggle categories on/off in the Events tab

### 4. Visual Representation
- Events displayed as colored circles on the 3D map
- Circle size represents event magnitude (when available)
- Color-coded by event category:
  - 🔥 Wildfires: Orange-Red (#FF4500)
  - 🌪️ Severe Storms: Royal Blue (#4169E1)
  - 🌋 Volcanoes: Crimson (#DC143C)
  - 🌍 Earthquakes: Brown (#8B4513)
  - 🌊 Floods: Dodger Blue (#1E90FF)
  - 🏜️ Drought: Chocolate (#D2691E)
  - ⛰️ Landslides: Sienna (#A0522D)
  - 💨 Dust & Haze: Goldenrod (#DAA520)
  - ❄️ Snow: Alice Blue (#F0F8FF)
  - 🌡️ Temperature Extremes: Tomato (#FF6347)
  - 🧊 Sea & Lake Ice: Powder Blue (#B0E0E6)
  - 🌊 Water Color: Light Sea Green (#20B2AA)
  - 🏭 Manmade: Dim Gray (#696969)

### 5. Event Statistics
- Real-time count of active events by category
- Displayed in the Events tab sidebar
- Updates automatically when filters change

## How to Use

### Accessing the Events Tab

1. **Login** to the InfraTrack platform with MPDC or Engineer credentials
2. Navigate to the **🌍 Events** tab in the right sidebar
3. Toggle **"Enable Event Tracking"** to activate the feature

### Configuring Event Display

**Category Selection:**
- Click on category buttons to enable/disable specific event types
- Multiple categories can be selected simultaneously
- At least one category must be selected

**Search Radius:**
- Use the slider to adjust the search radius (100-5000 km)
- Smaller radius: Focus on nearby events
- Larger radius: See regional and continental events

### Viewing Events on the Map

- Events appear as colored circles on the map
- Circle size indicates event magnitude (larger = more severe)
- Hover over events to see details (in browser console for now)
- Events update automatically every 30 minutes

## Technical Implementation

### File Structure

```
frontend/src/lib/eonet.ts          # EONET API integration library
frontend/src/ui/App.tsx             # Main app with Events tab UI
frontend/src/ui/DeckOverlay.tsx     # Deck.gl visualization layer
NASA_EONET_GUIDE.md                 # This documentation
```

### API Integration

**Endpoint:** `https://eonet.gsfc.nasa.gov/api/v3/events`

**Query Parameters:**
- `status=open` - Only active events
- `limit=500` - Maximum events to fetch
- `days=30` - Events from last 30 days

**No API Key Required** - EONET is a public domain API

### Data Flow

1. **Fetch** - Events fetched from EONET API when enabled
2. **Filter by Region** - Haversine formula calculates distance from Luisiana
3. **Filter by Category** - User-selected categories applied
4. **Visualize** - Deck.gl ScatterplotLayer renders events on map
5. **Refresh** - Auto-refresh every 30 minutes

### Performance Considerations

- Events are cached in React state
- Only re-fetches when enabled or filters change
- Efficient distance calculation using Haversine formula
- Deck.gl provides GPU-accelerated rendering

## Event Data Structure

Each event includes:

```typescript
{
  id: string;                    // Unique event ID (e.g., "EONET_20002")
  title: string;                 // Event name
  description: string | null;    // Event description
  link: string;                  // API link to full event details
  closed: string | null;         // Closure date (null if active)
  categories: [{                 // Event categories
    id: string;                  // Category ID
    title: string;               // Category name
  }];
  sources: [{                    // Data sources
    id: string;                  // Source ID
    url: string;                 // Source URL
  }];
  geometry: [{                   // Event locations over time
    date: string;                // ISO timestamp
    type: "Point" | "Polygon";   // Geometry type
    coordinates: [lon, lat];     // Location
    magnitudeValue?: number;     // Event magnitude
    magnitudeUnit?: string;      // Magnitude unit (acres, km², etc.)
  }];
}
```

## Use Cases for Luisiana LGU

### 1. Disaster Preparedness
- Monitor approaching typhoons and severe storms
- Track regional earthquake activity
- Early warning for potential flooding events

### 2. Agricultural Planning
- Monitor drought conditions in surrounding regions
- Track temperature extremes affecting crops
- Wildfire smoke impact on air quality

### 3. Infrastructure Risk Assessment
- Earthquake activity near infrastructure projects
- Flood risk assessment for construction sites
- Landslide monitoring in mountainous areas

### 4. Public Safety Alerts
- Real-time awareness of nearby natural disasters
- Coordinate with MDRRMO for emergency response
- Inform residents of regional hazards

## Limitations

1. **Data Lag** - Events may have 1-6 hour processing delay
2. **Coverage** - Not all events worldwide are captured
3. **Accuracy** - Event locations are approximate
4. **Local Events** - Very localized events may not be included
5. **Historical Data** - Only shows events from last 30 days

## Future Enhancements

- [ ] Click on events to show detailed popup
- [ ] Event history timeline
- [ ] Export event data to CSV
- [ ] Email/SMS alerts for nearby events
- [ ] Integration with local MDRRMO alert system
- [ ] Event impact radius visualization
- [ ] Historical event heatmap

## API Reference

### Functions

**`fetchEONETEvents(options)`**
Fetches events from NASA EONET API.

```typescript
const events = await fetchEONETEvents({
  status: 'open',      // 'open' | 'closed' | 'all'
  limit: 500,          // Max events to return
  days: 30,            // Events from last N days
  category: 'wildfires', // Filter by category (optional)
});
```

**`filterEventsByRegion(events, center, radiusKm)`**
Filters events by distance from a point.

```typescript
const nearby = filterEventsByRegion(
  events,
  [121.5167, 14.1856], // [longitude, latitude]
  1000                  // radius in km
);
```

**`getEventStats(events)`**
Returns event count by category.

```typescript
const stats = getEventStats(events);
// { wildfires: 5, severeStorms: 2, ... }
```

**`getLatestGeometry(event)`**
Gets the most recent location for an event.

```typescript
const location = getLatestGeometry(event);
// { date, type, coordinates, magnitudeValue, magnitudeUnit }
```

**`getEventColor(event)`**
Returns hex color for event category.

```typescript
const color = getEventColor(event);
// "#FF4500" for wildfires
```

**`formatEventInfo(event)`**
Formats event data for display.

```typescript
const info = formatEventInfo(event);
// "🔥 PINE MOUNTAIN Wildfire\nCategory: Wildfires\n..."
```

## Resources

- **NASA EONET Website:** https://eonet.gsfc.nasa.gov/
- **API Documentation:** https://eonet.gsfc.nasa.gov/docs/v3
- **Event Categories:** https://eonet.gsfc.nasa.gov/api/v3/categories
- **Data Sources:** https://eonet.gsfc.nasa.gov/api/v3/sources

## Support

For technical issues or questions:
- Check browser console for error messages
- Verify internet connection (API requires external access)
- Ensure CORS is not blocking requests
- Contact system administrator

---

**Version:** 1.1.4  
**Last Updated:** May 11, 2026  
**Author:** Luisiana InfraTrack Development Team
