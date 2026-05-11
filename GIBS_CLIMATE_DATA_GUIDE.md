# NASA GIBS Climate Data Integration

## Overview

Nag-integrate na ako ng **10 climate data layers** from NASA GIBS (Global Imagery Browse Services)! Real satellite data na ito from NASA para sa climate monitoring.

---

## 🛰️ Available Climate Layers

### 1. Precipitation (Ulan)
- **IMERG_Precipitation_Rate** - Real-time rainfall data
- **IMERG_Precipitation_Rate_30min** - 30-minute intervals
- **Resolution**: 10km
- **Update**: Every 30 minutes
- **Use**: Flood monitoring, rainfall tracking

### 2. Temperature (Temperatura)
- **MODIS_Terra_Land_Surface_Temp_Day** - Daytime surface temperature
- **MODIS_Terra_Land_Surface_Temp_Night** - Nighttime surface temperature
- **AIRS_L2_Surface_Air_Temperature_Day** - Air temperature
- **Resolution**: 1km (MODIS), 50km (AIRS)
- **Update**: Daily
- **Use**: Heat wave monitoring, urban heat island

### 3. Satellite Imagery (Larawan)
- **MODIS_Terra_CorrectedReflectance_TrueColor** - Natural color (250m)
- **VIIRS_NOAA20_CorrectedReflectance_TrueColor** - High-res color (750m)
- **Resolution**: 250m - 750m
- **Update**: Daily
- **Use**: Visual inspection, damage assessment

### 4. Atmosphere (Hangin)
- **MODIS_Terra_Aerosol** - Air quality, pollution
- **MODIS_Aqua_Cloud_Top_Temp_Day** - Storm intensity
- **AIRS_L2_Surface_Relative_Humidity_Day** - Humidity levels
- **Resolution**: 5km - 50km
- **Update**: Daily
- **Use**: Air quality, storm tracking

---

## 📊 Layer Details

| Layer | Category | Resolution | Update Frequency | Best For |
|-------|----------|------------|------------------|----------|
| **IMERG Precipitation** | Precipitation | 10km | 30 minutes | Flood monitoring |
| **Land Surface Temp (Day)** | Temperature | 1km | Daily | Heat mapping |
| **Land Surface Temp (Night)** | Temperature | 1km | Daily | Urban heat island |
| **True Color (MODIS)** | Imagery | 250m | Daily | Visual inspection |
| **True Color (VIIRS)** | Imagery | 750m | Daily | Recent imagery |
| **Aerosol** | Atmosphere | 10km | Daily | Air quality |
| **Cloud Top Temp** | Atmosphere | 5km | Daily | Storm intensity |
| **Humidity** | Atmosphere | 50km | Daily | Weather forecasting |
| **Air Temperature** | Temperature | 50km | Daily | Climate monitoring |

---

## 🎯 Use Cases

### 1. Flood Monitoring (MDRRMO)
**Layers to Use**:
- IMERG Precipitation Rate
- Land Surface Temperature

**How**:
1. Monitor real-time rainfall
2. Identify heavy precipitation areas
3. Predict flood-prone zones
4. Issue early warnings

### 2. Heat Wave Detection (Health Office)
**Layers to Use**:
- Land Surface Temp (Day)
- Air Temperature
- Humidity

**How**:
1. Track daytime temperatures
2. Identify heat hotspots
3. Monitor vulnerable areas
4. Plan cooling centers

### 3. Air Quality Monitoring (Environment Office)
**Layers to Use**:
- Aerosol Optical Depth
- True Color Imagery

**How**:
1. Check air pollution levels
2. Identify haze/smoke
3. Track pollution sources
4. Issue health advisories

### 4. Storm Tracking (MDRRMO)
**Layers to Use**:
- Cloud Top Temperature
- Precipitation Rate
- True Color Imagery

**How**:
1. Monitor storm development
2. Track cloud patterns
3. Assess storm intensity
4. Predict storm path

### 5. Agricultural Planning (Agriculture Office)
**Layers to Use**:
- Land Surface Temperature
- Precipitation Rate
- Humidity

**How**:
1. Monitor soil moisture
2. Track rainfall patterns
3. Identify drought areas
4. Plan irrigation

---

## 🔧 Technical Implementation

### Current Setup
```typescript
// Available layers
export const GIBS_LAYERS = {
  "IMERG_Precipitation_Rate": { ... },
  "MODIS_Terra_Land_Surface_Temp_Day": { ... },
  "MODIS_Terra_CorrectedReflectance_TrueColor": { ... },
  // ... 7 more layers
};

// Get layer info
const layerInfo = getGibsLayerInfo("IMERG_Precipitation_Rate");

// Get layers by category
const tempLayers = getGibsLayersByCategory("temperature");

// Check availability
const isAvailable = isGibsLayerAvailable(layerId, new Date());
```

### Data Format
- **Tile Service**: WMTS (Web Map Tile Service)
- **Projection**: EPSG:3857 (Web Mercator)
- **Format**: PNG (data layers), JPEG (imagery)
- **Temporal**: Date-based (YYYY-MM-DD)

---

## 📅 Data Availability

### Temporal Coverage
- **Start Date**: ~2000-01-01 (varies by layer)
- **End Date**: Yesterday (1-day processing lag)
- **Update Frequency**: 30 minutes to daily

### Geographic Coverage
- **Global**: All layers cover entire world
- **Luisiana**: Full coverage at all resolutions

---

## 🚀 Future Enhancements

### Planned Features
- [ ] **Layer Selector UI** - Choose different climate layers
- [ ] **Time Slider** - View historical data
- [ ] **Animation** - Play time-lapse
- [ ] **Data Export** - Download climate data
- [ ] **Comparison Mode** - Compare two dates
- [ ] **Statistics** - Calculate averages, trends

### Integration Ideas
- [ ] **Combine with Risk Zones** - Climate-based risk
- [ ] **Alert System** - Automatic warnings
- [ ] **Reports** - Generate climate reports
- [ ] **API Access** - Programmatic data access

---

## 💡 Pro Tips

### Tip 1: Layer Selection
```
Precipitation + Temperature = Comprehensive weather view
```

### Tip 2: Date Selection
- Use yesterday's date for most reliable data
- Some layers have 1-2 day lag
- Check availability before fetching

### Tip 3: Resolution
- Higher resolution = more detail
- But slower loading
- Choose based on use case

### Tip 4: Combining Layers
```
True Color Imagery + Precipitation = Visual + Data
```

---

## 🔍 Data Sources

### NASA GIBS
- **Website**: https://gibs.earthdata.nasa.gov
- **Documentation**: https://wiki.earthdata.nasa.gov/display/GIBS
- **API**: WMTS standard
- **Cost**: Free (public data)

### Satellites
- **MODIS**: Terra & Aqua satellites
- **VIIRS**: NOAA-20 satellite
- **IMERG**: GPM satellite constellation
- **AIRS**: Aqua satellite

---

## 📊 Example Queries

### Get Precipitation Data
```typescript
const layer = "IMERG_Precipitation_Rate";
const date = formatGibsDate(new Date());
const url = gibsWmtsTileUrl({ layer, date });
```

### Get Temperature Data
```typescript
const layer = "MODIS_Terra_Land_Surface_Temp_Day";
const date = formatGibsDate(yesterday);
const url = gibsWmtsTileUrl({ layer, date });
```

### Get True Color Imagery
```typescript
const layer = "MODIS_Terra_CorrectedReflectance_TrueColor";
const date = formatGibsDate(yesterday);
const url = gibsWmtsTileUrl({ 
  layer, 
  date,
  format: "image/jpeg" 
});
```

---

## 🎓 Understanding the Data

### Precipitation Rate
- **Units**: mm/hr
- **Colors**: Blue (light) to Red (heavy)
- **Interpretation**: 
  - < 1 mm/hr = Light rain
  - 1-5 mm/hr = Moderate rain
  - > 5 mm/hr = Heavy rain

### Land Surface Temperature
- **Units**: Kelvin (K) or Celsius (°C)
- **Colors**: Blue (cold) to Red (hot)
- **Interpretation**:
  - < 20°C = Cool
  - 20-30°C = Moderate
  - > 30°C = Hot

### Aerosol Optical Depth
- **Units**: Dimensionless (0-5)
- **Colors**: White (clean) to Brown (polluted)
- **Interpretation**:
  - < 0.1 = Clean air
  - 0.1-0.3 = Moderate
  - > 0.3 = Polluted

---

## 🌟 Benefits

### Real-Time Monitoring
- ✅ Actual satellite data
- ✅ Updated frequently
- ✅ Global coverage
- ✅ Free access

### Multiple Parameters
- ✅ Precipitation
- ✅ Temperature
- ✅ Humidity
- ✅ Air quality
- ✅ Cloud cover

### High Resolution
- ✅ 250m to 50km
- ✅ Suitable for municipal planning
- ✅ Detailed enough for analysis

### Historical Data
- ✅ Data since 2000
- ✅ Time series analysis
- ✅ Trend detection
- ✅ Climate studies

---

## 📞 Support

### Questions?
- **Technical**: Check NASA GIBS documentation
- **Implementation**: See code in `lib/gibs.ts`
- **Usage**: This guide

### Resources
- NASA GIBS: https://gibs.earthdata.nasa.gov
- Worldview: https://worldview.earthdata.nasa.gov
- Documentation: https://wiki.earthdata.nasa.gov/display/GIBS

---

**May access na tayo sa real NASA climate data!** 🛰️

Perfect para sa comprehensive climate monitoring at disaster preparedness sa Luisiana! 🌍
