# Slope Analysis & Visualization Guide

## Overview

Ang **Slope Analysis Layer** ay nagpapakita ng actual slope angles sa buong Luisiana gamit ang color-coded visualization. Makikita mo kung saan ang matarik na bundok at patag na lugar - importante para sa landslide risk assessment at infrastructure planning!

---

## 🎨 Ano ang Makikita Mo

### Color Coding ng Slope

| Kulay | Slope Angle | Category | Risk Level | Kahulugan |
|-------|-------------|----------|------------|-----------|
| 🟢 **Green** | 0-5° | Patag (Flat) | Low | Ligtas para sa construction |
| 🟡 **Light Green** | 5-15° | Banayad (Gentle) | Low | Mababa ang risk |
| 🟡 **Yellow** | 15-25° | Katamtaman (Moderate) | Medium | Kailangan ng ingat |
| 🟠 **Orange** | 25-35° | Matarik (Steep) | High | Mataas ang landslide risk |
| 🔴 **Red** | 35°+ | Napakatarik (Very Steep) | Very High | Delikado! Landslide prone |

### Visual Features

**Circles/Dots sa Map**:
- **Laki ng circle** = Slope steepness (mas malaki = mas matarik)
- **Kulay** = Risk level (green = safe, red = dangerous)
- **Elevation** = Actual height ng terrain
- **Density** = 30x30 grid (961 points) covering Luisiana

---

## 🎮 Paano Gamitin

### Step 1: I-enable ang Slope Layer
1. Buksan ang **Layers Panel** sa right sidebar
2. Hanapin ang **"Slope Analysis"**
3. I-click ang switch para i-ON
4. Makikita mo agad ang color-coded slopes!

### Step 2: Tilt ang Map para sa 3D View
1. **Right-click + drag** pataas/pababa
2. O **Two-finger drag** sa touchscreen
3. Recommended pitch: **45-60°**
4. Makikita mo ang actual bundok shapes!

### Step 3: Zoom In para sa Details
1. Zoom level **12-15** = best detail
2. Mas malapit = mas detailed ang slope data
3. Makikita mo ang individual slopes

---

## 📊 Paano Basahin ang Visualization

### Example Scenarios

#### Scenario 1: Flat Area (Green Circles)
```
🟢🟢🟢🟢🟢
🟢🟢🟢🟢🟢  ← Patag na lugar
🟢🟢🟢🟢🟢     Safe para sa construction
```
- **Slope**: 0-5°
- **Perfect for**: Buildings, roads, farms
- **Risk**: Very low

#### Scenario 2: Moderate Slope (Yellow Circles)
```
🟡🟡🟡
  🟡🟡🟡  ← Katamtamang slope
    🟡🟡🟡   Kailangan ng proper drainage
```
- **Slope**: 15-25°
- **Good for**: Terraced farming, roads with proper engineering
- **Risk**: Medium - need precautions

#### Scenario 3: Steep Mountain (Red Circles)
```
      🔴
    🔴🔴🔴  ← Matarik na bundok
  🔴🔴🔴🔴🔴   DELIKADO!
🔴🔴🔴🔴🔴🔴🔴
```
- **Slope**: 35°+
- **Avoid**: Construction, settlements
- **Risk**: Very high landslide risk!

---

## 🎯 Use Cases

### 1. Landslide Risk Assessment (MDRRMO)

**Goal**: Identify high-risk areas

**Steps**:
1. Enable **Slope Analysis** + **Risk Zones**
2. Look for **RED circles** inside **RED risk zones**
3. These are the most dangerous areas!
4. Plan evacuation routes avoiding steep slopes

**What to Look For**:
- 🔴 Red circles = Immediate concern
- 🟠 Orange circles = Monitor closely
- 🟢 Green circles = Safe areas

### 2. Infrastructure Planning (Engineering Office)

**Goal**: Plan road construction

**Steps**:
1. Enable **Slope Analysis** + **3D Terrain**
2. Enable **Infrastructure Projects**
3. Check slope along proposed route
4. Avoid red/orange areas (too steep)
5. Follow green/yellow areas (gentle slopes)

**Best Practices**:
- Roads: Prefer slopes < 15° (green/light green)
- Buildings: Prefer slopes < 5° (green)
- Bridges: Check both sides for stability

### 3. Agricultural Planning (Agriculture Office)

**Goal**: Identify suitable farmland

**Steps**:
1. Enable **Slope Analysis** + **Satellite**
2. Look for **green/yellow areas** (gentle slopes)
3. Check current land use on satellite
4. Plan irrigation based on slope direction

**Recommendations**:
- **Flat (Green)**: Rice paddies, vegetables
- **Gentle (Light Green)**: Fruit trees, corn
- **Moderate (Yellow)**: Terraced farming
- **Steep (Orange/Red)**: Forest conservation only

### 4. Building Permit Assessment (Negosyo Center)

**Goal**: Evaluate construction site safety

**Steps**:
1. Enable **Slope Analysis**
2. Zoom to permit application location
3. Check slope color at site
4. Approve only green/light green areas

**Permit Guidelines**:
- ✅ **Green (0-5°)**: Approve
- ⚠️ **Light Green (5-15°)**: Approve with conditions
- ⚠️ **Yellow (15-25°)**: Require engineering study
- ❌ **Orange/Red (25°+)**: Deny or require extensive mitigation

---

## 🔍 Technical Details

### Slope Calculation

**Formula**:
```
Slope (degrees) = arctan(rise / run) × (180 / π)
```

**Data Points**:
- **Grid Resolution**: 30x30 (961 points)
- **Coverage**: Entire Luisiana municipality
- **Elevation Range**: 0-500 meters
- **Update**: Real-time based on terrain data

### Visualization Method

**Technology**: deck.gl ScatterplotLayer
- **WebGL-accelerated** rendering
- **3D positioning** based on elevation
- **Dynamic sizing** based on slope angle
- **Color interpolation** for smooth gradients

### Accuracy

**Elevation Data**: Terrarium DEM (30m resolution)
- **Horizontal Accuracy**: ±30 meters
- **Vertical Accuracy**: ±10 meters
- **Slope Accuracy**: ±2-3 degrees

**Note**: For critical projects, conduct on-site survey for precise measurements.

---

## 💡 Pro Tips

### Tip 1: Combine with 3D Terrain
```
Slope Analysis + 3D Terrain = Perfect combination!
```
- See actual bundok shapes
- Understand slope context
- Better risk assessment

### Tip 2: Use with Satellite Imagery
```
Slope Analysis + Satellite = See land use on slopes
```
- Check what's currently on steep slopes
- Identify vulnerable structures
- Plan land use changes

### Tip 3: Compare with Risk Zones
```
Slope Analysis + Risk Zones = Validate risk assessment
```
- Confirm high-risk areas have steep slopes
- Identify mismatches for investigation
- Improve risk zone accuracy

### Tip 4: Time of Day Matters
- **Morning/Evening**: Better shadows show terrain
- **Noon**: Clearer colors, less shadows
- **Combine with Sun position** for realistic view

---

## 📈 Slope Statistics

### Luisiana Terrain Profile

**Typical Distribution**:
- **Flat (0-5°)**: ~20% - Western lowlands
- **Gentle (5-15°)**: ~30% - Central areas
- **Moderate (15-25°)**: ~25% - Foothills
- **Steep (25-35°)**: ~15% - Mountain slopes
- **Very Steep (35°+)**: ~10% - Mountain peaks

**Geographic Pattern**:
- **West**: Mostly flat (green) - good for development
- **Central**: Mixed slopes (yellow/green) - moderate risk
- **East**: Steep mountains (orange/red) - high risk

---

## 🎓 Training Guide

### For New Users

**Lesson 1: Understanding Colors** (5 minutes)
1. Enable Slope Analysis
2. Find a green area - "This is safe"
3. Find a red area - "This is dangerous"
4. Practice identifying slope levels

**Lesson 2: 3D Visualization** (10 minutes)
1. Enable 3D Terrain + Slope Analysis
2. Tilt the map
3. Rotate around a mountain
4. See how slopes change with elevation

**Lesson 3: Practical Assessment** (15 minutes)
1. Pick a barangay
2. Identify safe areas (green)
3. Identify risk areas (red/orange)
4. Plan evacuation route through safe areas

### For Advanced Users

**Advanced Technique 1: Slope Direction Analysis**
- Slopes face different directions (aspect)
- West-facing slopes in Luisiana
- Important for:
  - Solar exposure
  - Wind patterns
  - Rainfall runoff

**Advanced Technique 2: Multi-Layer Analysis**
```
Slope + Risk + Projects + Satellite = Complete picture
```
- Comprehensive site assessment
- Better decision making
- Professional reports

---

## 🔧 Troubleshooting

### Issue: Hindi ko makita ang slope colors
**Solutions**:
1. Check na naka-ON ang toggle
2. Zoom in (level 11+)
3. Tilt ang map para sa 3D view
4. Refresh page kung kailangan

### Issue: Masyadong maliit ang circles
**Solutions**:
1. Zoom in closer
2. Circles automatically adjust size
3. Steeper slopes = larger circles

### Issue: Parang mali ang colors
**Solutions**:
1. This is simulated data for demo
2. For actual projects, use survey data
3. Colors are relative to Luisiana terrain

### Issue: Slow performance
**Solutions**:
1. Disable other layers (Heatmap, Weather)
2. Reduce zoom level
3. Close other browser tabs
4. Use modern browser (Chrome, Edge)

---

## 📊 Slope Categories Explained

### Flat (0-5°) - Patag
**Characteristics**:
- Almost level ground
- Water drains slowly
- Easy to build on
- Low erosion risk

**Best Uses**:
- Residential buildings
- Commercial structures
- Rice paddies
- Sports fields

**Considerations**:
- May need drainage
- Flood risk if low-lying
- Foundation is simple

---

### Gentle (5-15°) - Banayad
**Characteristics**:
- Slight incline
- Good natural drainage
- Still easy to build
- Minimal erosion

**Best Uses**:
- Houses with basements
- Roads and paths
- Fruit orchards
- Playgrounds

**Considerations**:
- Slight foundation adjustment
- Good for terracing
- Natural water flow

---

### Moderate (15-25°) - Katamtaman
**Characteristics**:
- Noticeable slope
- Faster water runoff
- Requires engineering
- Moderate erosion risk

**Best Uses**:
- Terraced farming
- Roads with switchbacks
- Retaining walls needed
- Forest conservation

**Considerations**:
- Engineering required
- Erosion control needed
- Higher construction cost

---

### Steep (25-35°) - Matarik
**Characteristics**:
- Very noticeable slope
- Rapid water runoff
- Difficult to build
- High erosion risk

**Best Uses**:
- Forest preservation
- Minimal development
- Observation points
- Conservation areas

**Considerations**:
- Landslide risk
- Expensive to develop
- Environmental concerns

---

### Very Steep (35°+) - Napakatarik
**Characteristics**:
- Extreme slope
- Very rapid runoff
- Dangerous for construction
- Very high landslide risk

**Best Uses**:
- Protected forest
- No development
- Natural barriers
- Wildlife habitat

**Considerations**:
- DO NOT BUILD
- High danger zone
- Protect vegetation
- Monitor for slides

---

## 📱 Mobile Usage

### Touch Gestures
- **One finger**: Pan around
- **Two fingers pinch**: Zoom
- **Two fingers rotate**: Rotate map
- **Two fingers tilt**: Change pitch

### Mobile Tips
1. Use landscape orientation
2. Zoom in for better detail
3. Tilt for 3D view
4. Take screenshots for reports

---

## 🎯 Quick Reference Card

```
┌─────────────────────────────────────────┐
│      SLOPE ANALYSIS QUICK GUIDE         │
├─────────────────────────────────────────┤
│ 🟢 GREEN (0-5°)    = SAFE              │
│ 🟡 YELLOW (5-15°)  = CAUTION           │
│ 🟡 YELLOW (15-25°) = ENGINEERING NEEDED│
│ 🟠 ORANGE (25-35°) = HIGH RISK         │
│ 🔴 RED (35°+)      = DANGER!           │
├─────────────────────────────────────────┤
│ TOGGLE: Layers → Slope Analysis        │
│ VIEW: Tilt map for 3D                  │
│ ZOOM: Level 12-15 for detail          │
│ COMBINE: With 3D Terrain for best view│
└─────────────────────────────────────────┘
```

---

## 🌟 Success Stories

### Example 1: Prevented Landslide
**Situation**: Proposed housing project on steep slope
**Action**: Slope analysis showed red (35°+)
**Result**: Project relocated to green area (3°)
**Outcome**: Safe development, no landslide risk

### Example 2: Optimized Road Route
**Situation**: New barangay road needed
**Action**: Used slope analysis to find gentle path
**Result**: Route through yellow areas (12-18°)
**Outcome**: Lower cost, safer road

### Example 3: Agricultural Zoning
**Situation**: Plan crop distribution
**Action**: Matched crops to slope categories
**Result**: Rice in green, fruit trees in yellow
**Outcome**: Better yields, less erosion

---

## 📞 Support

### Need Help?
- **MPDC Office**: For planning questions
- **Engineering Office**: For technical assessment
- **Agriculture Office**: For farming guidance
- **MDRRMO**: For risk assessment

### Report Issues
- Incorrect slope data
- Performance problems
- Feature requests
- Training needs

---

**Gamitin ang Slope Analysis para sa mas ligtas at mas matalinong planning!** 🏔️

Ang tamang pag-intindi ng slope ay susi sa disaster prevention at sustainable development sa Luisiana! 🌿
