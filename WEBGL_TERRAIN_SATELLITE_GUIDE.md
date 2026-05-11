# WebGL 3D Terrain & Satellite Imagery Guide

## Overview

INFA-TRACK now features **WebGL-accelerated 3D terrain visualization** combined with **high-resolution satellite imagery**, creating a photorealistic view of Luisiana municipality. This powerful combination enables detailed terrain analysis, slope assessment, and infrastructure planning.

---

## 🌍 Features

### 3D Terrain Visualization
- **Real elevation data** from Terrarium DEM tiles
- **Dynamic exaggeration** that adjusts with zoom level
- **Hillshade rendering** for depth perception
- **Smooth transitions** between 2D and 3D views
- **WebGL-optimized** for smooth 60 FPS performance

### High-Resolution Satellite Imagery
- **ESRI World Imagery** - High-resolution, frequently updated
- **Sentinel-2 (ESA)** - Cloud-free composite imagery
- **Multiple providers** ready for integration
- **Seamless overlay** on 3D terrain
- **Adjustable opacity** and visual properties

### Atmospheric Effects
- **Sky layer** with realistic atmosphere
- **Sun position** based on time of day
- **Lighting effects** that match terrain shadows
- **Fog/haze** at distance for realism

---

## 🎮 How to Use

### Enabling 3D Terrain

1. **Open Layers Panel** in the right sidebar
2. **Toggle "3D Terrain"** switch
3. **Map automatically tilts** to 62° pitch for 3D view
4. **Terrain exaggeration** adjusts as you zoom

### Enabling Satellite Imagery

1. **Toggle "Satellite"** in Layers panel
2. **High-res imagery** overlays on terrain
3. **Buildings dim slightly** to show imagery
4. **Combine with terrain** for photorealistic 3D

### Best Viewing Experience

```
┌─────────────────────────────────────────┐
│  OPTIMAL SETTINGS FOR 3D TERRAIN        │
├─────────────────────────────────────────┤
│  ✓ 3D Terrain: ON                       │
│  ✓ Satellite: ON                        │
│  ✓ Shadows: ON                          │
│  ✓ Zoom Level: 12-15                    │
│  ✓ Pitch: 45-70°                        │
│  ✓ Time: Daytime for best lighting     │
└─────────────────────────────────────────┘
```

---

## 🎨 Visual Enhancements

### Hillshade Layer
Automatically enabled with 3D terrain:
- **Shadow direction**: Northwest (315°)
- **Exaggeration**: 0.8x for subtle effect
- **Visibility**: Fades in/out with terrain toggle

### Sky Atmosphere
Creates realistic horizon:
- **Type**: Atmospheric scattering
- **Sun intensity**: 15 (bright daylight)
- **Colors**: Blue sky gradient
- **Opacity**: Increases with zoom

### Dynamic Exaggeration

| Zoom Level | Exaggeration | Purpose |
|------------|--------------|---------|
| < 10 | 2.5x | Overview - emphasize terrain |
| 10-12 | 2.0x | Regional - clear slopes |
| 12-14 | 1.5x | Local - balanced view |
| 14-16 | 1.2x | Detailed - near-realistic |
| > 16 | 1.0x | Street level - true scale |

---

## 🚀 WebGL Optimizations

### Performance Presets

#### Balanced (Default)
```typescript
{
  meshQuality: "medium",
  textureFiltering: "linear",
  lodBias: 0,
  maxParallelImageRequests: 16,
  maxTileCacheSize: 100 MB
}
```
- **Best for**: Most users
- **FPS**: 50-60 on modern hardware
- **Quality**: High

#### Quality (Advanced)
```typescript
{
  meshQuality: "high",
  textureFiltering: "mipmap",
  lodBias: -0.5,
  maxParallelImageRequests: 24,
  maxTileCacheSize: 200 MB
}
```
- **Best for**: High-end systems
- **FPS**: 45-60 on powerful GPUs
- **Quality**: Ultra

### Automatic Optimizations
- **Tile caching**: Reduces redundant downloads
- **Parallel loading**: Up to 16 simultaneous requests
- **LOD management**: Loads appropriate detail level
- **Memory management**: Automatic cache cleanup

---

## 📊 Use Cases

### 1. Landslide Risk Assessment
**Scenario**: Identify high-risk slopes

**Steps**:
1. Enable 3D Terrain + Satellite
2. Enable Risk Zones layer
3. Zoom to area of interest
4. Tilt map to see slope angles
5. Red zones on steep terrain = highest risk

**Benefits**:
- Visual confirmation of slope steepness
- Identify vulnerable areas
- Plan evacuation routes

### 2. Infrastructure Planning
**Scenario**: Plan road construction

**Steps**:
1. Enable 3D Terrain + Satellite
2. Enable Infrastructure Projects
3. Assess terrain elevation changes
4. Identify optimal routes (gentle slopes)
5. Avoid steep areas and waterways

**Benefits**:
- Minimize earthwork costs
- Identify drainage issues
- Optimize road grades

### 3. Agricultural Land Assessment
**Scenario**: Evaluate farmland suitability

**Steps**:
1. Enable Satellite imagery
2. View current land use
3. Enable 3D Terrain
4. Check slope for irrigation planning
5. Identify flat areas for crops

**Benefits**:
- Assess irrigation needs
- Plan terracing for slopes
- Identify flood-prone areas

### 4. Damage Assessment
**Scenario**: Post-disaster evaluation

**Steps**:
1. Enable latest Satellite imagery
2. Compare with pre-disaster state
3. Use 3D Terrain to assess landslides
4. Mark affected infrastructure
5. Plan recovery operations

**Benefits**:
- Visual damage confirmation
- Prioritize response areas
- Document for reports

---

## 🎯 Advanced Features

### Terrain Data Sources

#### Terrarium (Default)
- **Coverage**: Global
- **Resolution**: 30m
- **Max Zoom**: 15
- **Encoding**: RGB height encoding
- **Cost**: Free
- **Best for**: General use

#### Mapbox Terrain RGB
- **Coverage**: Global
- **Resolution**: 10m (some areas)
- **Max Zoom**: 14
- **Encoding**: Mapbox RGB
- **Cost**: Requires API key
- **Best for**: High-detail areas

### Satellite Sources

#### ESRI World Imagery (Default)
- **Resolution**: Up to 0.3m in urban areas
- **Update Frequency**: Varies by region
- **Coverage**: Global
- **Cost**: Free
- **Best for**: General mapping

#### Sentinel-2 (ESA)
- **Resolution**: 10m
- **Update Frequency**: Every 5 days
- **Coverage**: Global (cloud-free composite)
- **Cost**: Free
- **Best for**: Recent, cloud-free imagery

---

## 🔧 Technical Details

### Terrain Rendering Pipeline

```
1. DEM Tiles Download
   ↓
2. RGB to Elevation Conversion
   ↓
3. Mesh Generation (WebGL)
   ↓
4. Texture Mapping (Satellite)
   ↓
5. Hillshade Calculation
   ↓
6. Lighting & Shadows
   ↓
7. Final Render (60 FPS)
```

### Elevation Encoding

**Terrarium Format**:
```javascript
elevation = (R * 256 + G + B / 256) - 32768
```
- **R**: High byte
- **G**: Middle byte  
- **B**: Low byte
- **Range**: -32,768m to +32,768m
- **Precision**: ~0.004m

### WebGL Shaders
- **Vertex Shader**: Terrain mesh deformation
- **Fragment Shader**: Texture + hillshade blending
- **Lighting Shader**: Directional sun + ambient
- **Shadow Shader**: Real-time shadow mapping

---

## 📱 Controls Reference

### Mouse Controls
| Action | Control |
|--------|---------|
| **Pan** | Left-click + drag |
| **Rotate** | Right-click + drag (or Ctrl + drag) |
| **Tilt** | Right-click + drag up/down |
| **Zoom** | Scroll wheel |
| **Reset North** | Double-click compass |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| **+** / **=** | Zoom in |
| **-** / **_** | Zoom out |
| **N** | Reset to north |
| **H** | Fly to home (Luisiana center) |
| **T** | Toggle terrain (future) |
| **S** | Toggle satellite (future) |

### Touch Controls (Mobile)
| Gesture | Action |
|---------|--------|
| **One finger drag** | Pan |
| **Two finger pinch** | Zoom |
| **Two finger rotate** | Rotate map |
| **Two finger tilt** | Change pitch |

---

## ⚙️ Configuration

### Terrain Settings

```typescript
// Adjust exaggeration manually
map.setTerrain({ 
  source: "terrain-dem", 
  exaggeration: 2.0  // 1.0 = realistic, 2.0 = 2x height
});

// Disable terrain
map.setTerrain(null);
```

### Satellite Settings

```typescript
// Adjust opacity
map.setPaintProperty(
  "satellite-layer", 
  "raster-opacity", 
  0.8  // 0.0 = invisible, 1.0 = opaque
);

// Adjust brightness
map.setPaintProperty(
  "satellite-layer",
  "raster-brightness-max",
  1.2  // > 1.0 = brighter
);
```

### Hillshade Settings

```typescript
// Adjust intensity
map.setPaintProperty(
  "hillshade",
  "hillshade-exaggeration",
  1.0  // 0.0 = flat, 1.0 = normal
);

// Change sun direction
map.setPaintProperty(
  "hillshade",
  "hillshade-illumination-direction",
  315  // degrees (0 = north, 90 = east)
);
```

---

## 🐛 Troubleshooting

### Issue: Terrain not showing
**Solutions**:
1. Check that toggle is ON
2. Zoom in (terrain visible at zoom > 10)
3. Tilt map (pitch > 30°)
4. Refresh page if style failed to load

### Issue: Satellite imagery blurry
**Solutions**:
1. Wait for tiles to load (check network)
2. Zoom in for higher resolution tiles
3. Check internet connection
4. Try different satellite source

### Issue: Performance lag
**Solutions**:
1. Disable other heavy layers (Heatmap, Weather)
2. Reduce terrain exaggeration
3. Lower zoom level
4. Close other browser tabs
5. Update graphics drivers

### Issue: Terrain looks "spiky"
**Solutions**:
1. This is normal at low zoom levels
2. Zoom in for smoother terrain
3. Exaggeration auto-adjusts with zoom
4. Or manually reduce exaggeration

### Issue: Satellite and terrain misaligned
**Solutions**:
1. This shouldn't happen with proper sources
2. Refresh the page
3. Clear browser cache
4. Report if persistent

---

## 📈 Performance Metrics

### Expected Performance

| Hardware | FPS | Quality | Notes |
|----------|-----|---------|-------|
| **High-end** (RTX 3060+) | 60 | Ultra | All features enabled |
| **Mid-range** (GTX 1660) | 50-60 | High | Balanced preset |
| **Low-end** (Integrated) | 30-45 | Medium | Reduce exaggeration |
| **Mobile** (Modern) | 30-40 | Medium | Touch optimized |

### Optimization Tips
1. **Disable unused layers** - Each layer costs FPS
2. **Reduce exaggeration** - Lower = faster
3. **Limit zoom range** - Don't zoom too far out
4. **Use balanced preset** - Default is optimized
5. **Close background apps** - Free up GPU

---

## 🔮 Future Enhancements

### Planned Features
- [ ] **Multiple satellite sources** - Switch between providers
- [ ] **Terrain quality presets** - Performance/Quality toggle
- [ ] **Contour lines** - Topographic map overlay
- [ ] **Slope analysis** - Color-coded slope angles
- [ ] **Elevation profiles** - Cross-section views
- [ ] **3D measurement tools** - Distance, area, volume
- [ ] **Time-lapse satellite** - Historical imagery
- [ ] **Custom DEM upload** - Use local survey data

### Data Integration
- [ ] **LiDAR data** - Ultra-high resolution terrain
- [ ] **Drone imagery** - Recent, high-res photos
- [ ] **Street-level photos** - Ground-truth validation
- [ ] **Building heights** - Accurate 3D models

---

## 📚 Technical References

### Libraries Used
- **MapLibre GL JS** - WebGL map rendering
- **Terrarium Tiles** - DEM data source
- **ESRI ArcGIS** - Satellite imagery

### Specifications
- **WebGL Version**: 2.0
- **Tile Format**: PNG (RGB encoded)
- **Projection**: Web Mercator (EPSG:3857)
- **Coordinate System**: WGS84

### API Endpoints
```
Terrain DEM:
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png

Satellite Imagery:
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

---

## 💡 Pro Tips

1. **Best Time for Viewing**: Midday for best lighting
2. **Combine Layers**: Terrain + Satellite + Shadows = photorealistic
3. **Use Tilt**: 45-60° pitch shows terrain best
4. **Zoom Smartly**: Zoom 12-14 for optimal detail/performance
5. **Screenshot Tool**: Browser screenshot for reports
6. **Compare Views**: Toggle terrain on/off to see difference
7. **Follow Sun**: Rotate map to match sun direction
8. **Check Slopes**: Steep areas appear more dramatic in 3D

---

## 🎓 Training Scenarios

### Scenario 1: New User Orientation
1. Start with 2D view (terrain OFF)
2. Enable Satellite to see real imagery
3. Enable 3D Terrain
4. Tilt and rotate to explore
5. Zoom to familiar landmark
6. Practice navigation controls

### Scenario 2: Risk Assessment Training
1. Enable Risk Zones + 3D Terrain
2. Find HIGH risk zone
3. Observe terrain steepness
4. Enable Satellite to see land cover
5. Assess accessibility
6. Plan mitigation strategy

### Scenario 3: Project Planning Workshop
1. Enable Infrastructure Projects
2. Enable 3D Terrain + Satellite
3. Select project location
4. Assess terrain challenges
5. Measure distances (future feature)
6. Document with screenshots

---

## 📞 Support

### Common Questions

**Q: Is this real elevation data?**
A: Yes! Terrarium DEM uses real SRTM/ASTER data

**Q: How often is satellite imagery updated?**
A: ESRI updates vary by region, typically monthly to yearly

**Q: Can I use this offline?**
A: No, requires internet for tile downloads

**Q: Does it work on mobile?**
A: Yes, but performance varies by device

**Q: Can I export 3D views?**
A: Use browser screenshot, 3D export coming soon

### Contact
- **Technical Support**: MPDC Luisiana
- **Documentation**: See this guide
- **Bug Reports**: Contact development team

---

## 🏆 Best Practices

### For MPDC & Engineers
- Use 3D terrain for infrastructure planning
- Combine with risk zones for safety assessment
- Take screenshots for project documentation
- Share views with stakeholders

### For Agriculture Office
- Use satellite to monitor crop health
- Check terrain for irrigation planning
- Identify erosion-prone slopes
- Plan terracing projects

### For All Departments
- Enable terrain when assessing locations
- Use satellite for ground-truth verification
- Combine multiple layers for comprehensive view
- Document findings with screenshots

---

**Enjoy exploring Luisiana in stunning 3D!** 🌄

The combination of WebGL-accelerated terrain and high-resolution satellite imagery provides an unprecedented view of your municipality for better planning and decision-making.
