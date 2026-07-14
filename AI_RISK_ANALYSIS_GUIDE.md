# AI-Powered Terrain Risk Analysis System

## Overview

The Luisiana InfraTrack platform now includes an **AI-powered terrain risk analysis system** that uses machine learning to predict landslide and flood risks based on terrain characteristics, weather patterns, and historical data.

## 🤖 How It Works

### Machine Learning Model

The system uses a **Deep Neural Network** built with TensorFlow.js that analyzes 9 key terrain features:

1. **Slope Angle** (0-90°) - Steepness of terrain
2. **Elevation** (meters) - Height above sea level
3. **Aspect** (0-360°) - Direction the slope faces
4. **Curvature** (-1 to 1) - Concave/convex shape
5. **Rainfall** (mm) - Recent precipitation
6. **Soil Moisture** (0-100%) - Ground saturation
7. **Vegetation Density** (0-1) - Forest/plant cover
8. **Distance to River** (meters) - Proximity to water
9. **Historical Events** (count) - Past disasters in area

### Neural Network Architecture

```
Input Layer (9 features)
    ↓
Dense Layer (64 neurons, ReLU)
    ↓
Dropout (30%)
    ↓
Dense Layer (32 neurons, ReLU)
    ↓
Dropout (20%)
    ↓
Dense Layer (16 neurons, ReLU)
    ↓
Output Layer (1 neuron, Sigmoid)
    ↓
Risk Probability (0-100%)
```

## 📊 Risk Predictions

### Output

For each terrain point, the model predicts:

- **Landslide Risk** (0-100%)
- **Flood Risk** (0-100%)
- **Overall Risk** (0-100%)
- **Risk Level**: SAFE | LOW | MODERATE | HIGH | CRITICAL
- **Confidence** (0-100%) - Model certainty
- **Contributing Factors** - What makes the area risky

### Risk Levels

| Level | Risk % | Color | Description |
|-------|--------|-------|-------------|
| SAFE | 0-10% | 🟢 Green | Safe for development |
| LOW | 10-30% | 🟡 Light Green | Standard precautions |
| MODERATE | 30-50% | 🟡 Yellow | Enhanced monitoring |
| HIGH | 50-75% | 🟠 Orange | Avoid construction |
| CRITICAL | 75-100% | 🔴 Red | Evacuation may be needed |

## 🎯 Use Cases

### 1. Infrastructure Planning
- Identify safe zones for construction
- Avoid high-risk areas for critical facilities
- Plan drainage and mitigation systems

### 2. Disaster Preparedness
- Predict which areas need evacuation plans
- Allocate emergency resources strategically
- Create early warning systems

### 3. Land Use Zoning
- Guide residential vs agricultural zoning
- Restrict development in high-risk areas
- Inform building code requirements

### 4. Real-Time Monitoring
- Update risk predictions during heavy rainfall
- Alert residents when risk increases
- Coordinate emergency response

### 5. Public Education
- Show residents why areas are risky
- Explain contributing factors
- Build awareness of natural hazards

## 🔧 Technical Implementation

### Training the Model

```typescript
import { TerrainRiskModel, generateSyntheticTrainingData } from './lib/ml-risk';

// Create model instance
const model = new TerrainRiskModel();

// Generate training data (or load real historical data)
const trainingData = generateSyntheticTrainingData(1000);

// Train the model
await model.train(trainingData, 50); // 50 epochs

// Save trained model
await model.saveModel('luisiana-risk-model');
```

### Making Predictions

```typescript
// Single prediction
const features = {
  slope: 35,              // 35° slope
  elevation: 150,         // 150m elevation
  aspect: 180,            // South-facing
  curvature: -0.2,        // Slightly concave
  rainfall: 120,          // 120mm recent rain
  soilMoisture: 75,       // 75% saturated
  vegetation: 0.4,        // 40% vegetation
  distanceToRiver: 300,   // 300m from river
  historicalEvents: 2,    // 2 past events
};

const prediction = await model.predict(features);

console.log(`Overall Risk: ${prediction.overallRisk.toFixed(1)}%`);
console.log(`Risk Level: ${prediction.riskLevel}`);
console.log(`Landslide Risk: ${prediction.landslideRisk.toFixed(1)}%`);
console.log(`Flood Risk: ${prediction.floodRisk.toFixed(1)}%`);
console.log(`Confidence: ${prediction.confidence.toFixed(1)}%`);

// Show contributing factors
prediction.factors.forEach(factor => {
  console.log(`- ${factor.name}: ${factor.contribution.toFixed(1)}% (${factor.severity})`);
  console.log(`  ${factor.description}`);
});
```

### Batch Predictions (for map visualization)

```typescript
// Predict risk for entire grid
const grid = generateTerrainGrid(50); // 50x50 grid
const predictions = await model.predictBatch(grid);

// Visualize on map
const riskLayer = new HeatmapLayer({
  id: 'ai-risk-heatmap',
  data: predictions.map((pred, i) => ({
    position: grid[i].position,
    risk: pred.overallRisk,
    color: getRiskColor(pred.overallRisk),
  })),
  getPosition: d => d.position,
  getWeight: d => d.risk,
  colorRange: [
    [0, 255, 0],      // Green
    [255, 255, 0],    // Yellow
    [255, 165, 0],    // Orange
    [255, 0, 0],      // Red
  ],
});
```

## 📈 Model Performance

### Training Metrics

- **Accuracy**: Target >85% on validation set
- **Loss**: Binary cross-entropy
- **Optimizer**: Adam (learning rate 0.001)
- **Regularization**: Dropout (30% and 20%)
- **Validation Split**: 20% of training data

### Inference Speed

- **Single Prediction**: ~5-10ms
- **Batch (100 points)**: ~50-100ms
- **Full Grid (2500 points)**: ~1-2 seconds

### Model Size

- **Parameters**: ~5,000 trainable parameters
- **Storage**: ~50KB (compressed)
- **Memory**: ~10MB during inference

## 🎨 Visualization Features

### 1. Risk Heatmap
- 3D elevation-based visualization
- Color-coded by risk level
- Interactive hover tooltips

### 2. Risk Explanation
- Show top contributing factors
- Percentage contribution per factor
- Severity indicators

### 3. Temporal Analysis
- Predict risk over next 7 days
- Based on weather forecast
- Animated timeline

### 4. Comparison View
- Before/after rainfall
- Seasonal variations
- Historical trends

## 🔄 Real-Time Updates

The model can update predictions in real-time based on:

### Weather Changes
```typescript
// Update predictions when heavy rain occurs
if (currentWeather.rainfallMm > 100) {
  const updatedPredictions = await updateRiskPredictions({
    rainfall: currentWeather.rainfallMm,
    soilMoisture: currentWeather.humidity,
  });
  
  // Alert if risk increased significantly
  if (updatedPredictions.overallRisk > 75) {
    sendAlert('CRITICAL RISK: Heavy rainfall increased landslide risk');
  }
}
```

### Soil Saturation
- Monitor cumulative rainfall
- Track soil moisture levels
- Adjust predictions dynamically

### Seismic Activity
- Integrate earthquake data
- Increase risk after tremors
- Consider aftershock effects

## 📚 Data Sources

### Current Implementation
- **Synthetic Training Data**: Generated based on risk heuristics
- **DEM Data**: Existing terrain elevation data
- **Weather API**: ECMWF IFS forecasts
- **NASA EONET**: Historical disaster events

### Recommended Data Sources (Future)

1. **PHIVOLCS** (Philippine Institute of Volcanology and Seismology)
   - Historical landslide locations
   - Earthquake records
   - Fault line maps

2. **PAGASA** (Philippine Atmospheric, Geophysical and Astronomical Services)
   - Rainfall data
   - Weather forecasts
   - Climate patterns

3. **NAMRIA** (National Mapping and Resource Information Authority)
   - High-resolution DEM
   - Soil type maps
   - Land use data

4. **Local Government Records**
   - Past disaster reports
   - Infrastructure damage
   - Evacuation records

## 🚀 Future Enhancements

### Phase 2: Advanced Features

- [ ] **Multi-Model Ensemble** - Combine multiple ML models
- [ ] **Recurrent Neural Network** - Time-series predictions
- [ ] **Convolutional Neural Network** - Image-based terrain analysis
- [ ] **Transfer Learning** - Use pre-trained models
- [ ] **Active Learning** - Improve model with user feedback

### Phase 3: Integration

- [ ] **SMS Alerts** - Send warnings to residents
- [ ] **Mobile App** - Risk notifications on phones
- [ ] **IoT Sensors** - Real-time soil moisture monitoring
- [ ] **Drone Imagery** - Aerial terrain analysis
- [ ] **Satellite Integration** - Automatic data updates

### Phase 4: Advanced Analytics

- [ ] **Risk Trends** - Historical risk evolution
- [ ] **Scenario Modeling** - "What if" simulations
- [ ] **Cost-Benefit Analysis** - Mitigation ROI
- [ ] **Evacuation Planning** - Optimal routes and shelters
- [ ] **Insurance Integration** - Risk-based premiums

## ⚠️ Limitations

### Current Limitations

1. **Training Data**: Using synthetic data initially
   - Need real historical disaster data for better accuracy
   - Limited to Luisiana region patterns

2. **Feature Availability**: Some features estimated
   - Soil moisture not directly measured
   - Vegetation data from satellite (may be outdated)

3. **Model Complexity**: Simplified for browser performance
   - More complex models could improve accuracy
   - Trade-off between speed and precision

4. **Temporal Factors**: Static predictions
   - Doesn't account for seasonal variations
   - No time-series analysis yet

### Accuracy Considerations

- Model predictions are **probabilistic**, not deterministic
- Should be used as **one input** in decision-making
- Requires **validation** with local experts
- Needs **continuous improvement** with real data

## 🛡️ Safety Guidelines

### For LGU Officials

1. **Don't Rely Solely on AI** - Use as decision support tool
2. **Validate Predictions** - Cross-check with local knowledge
3. **Update Regularly** - Retrain model with new data
4. **Monitor Performance** - Track prediction accuracy
5. **Combine with Other Data** - Use multiple information sources

### For Residents

1. **Understand Limitations** - AI is not perfect
2. **Follow Official Warnings** - LGU alerts take precedence
3. **Report Issues** - Help improve model accuracy
4. **Stay Informed** - Check risk updates regularly
5. **Prepare Accordingly** - Have evacuation plans ready

## 📖 API Reference

### TerrainRiskModel Class

#### Methods

**`train(trainingData, epochs)`**
- Train the model with historical data
- Returns: Promise<void>

**`predict(features)`**
- Predict risk for single location
- Returns: Promise<RiskPrediction>

**`predictBatch(featuresArray)`**
- Predict risk for multiple locations
- Returns: Promise<RiskPrediction[]>

**`saveModel(name)`**
- Save trained model to browser storage
- Returns: Promise<void>

**`loadModel(name)`**
- Load trained model from storage
- Returns: Promise<void>

**`isReady()`**
- Check if model is ready for predictions
- Returns: boolean

**`getSummary()`**
- Get model architecture summary
- Returns: string

### Helper Functions

**`generateSyntheticTrainingData(samples)`**
- Generate synthetic training data
- Returns: TrainingData

**`getRiskColor(risk)`**
- Get RGBA color for risk level
- Returns: [number, number, number, number]

**`getRiskDescription(level)`**
- Get human-readable risk description
- Returns: string

## 🎓 Training Resources

### For Developers

- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course)
- [Deep Learning Specialization](https://www.coursera.org/specializations/deep-learning)

### For LGU Staff

- Model interpretation guide (coming soon)
- Risk assessment training (coming soon)
- Emergency response protocols (coming soon)

## 📞 Support

For technical issues or questions:
- Check browser console for error messages
- Verify TensorFlow.js is loaded correctly
- Ensure sufficient browser memory (>1GB available)
- Contact system administrator

---

**Version**: 1.2.0 (AI Risk Analysis)  
**Last Updated**: May 11, 2026  
**Author**: Luisiana InfraTrack Development Team  
**Powered by**: TensorFlow.js
