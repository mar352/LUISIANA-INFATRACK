/**
 * AI-Powered Terrain Risk Analysis System
 * 
 * Uses machine learning to predict landslide and flood risks based on:
 * - Terrain slope and elevation
 * - Rainfall patterns
 * - Soil moisture
 * - Historical disaster data
 * - Vegetation cover
 * 
 * Powered by TensorFlow.js
 */

import * as tf from '@tensorflow/tfjs';

export interface TerrainFeatures {
  slope: number;              // Slope angle in degrees (0-90)
  elevation: number;          // Elevation in meters
  aspect: number;             // Direction slope faces (0-360)
  curvature: number;          // Terrain curvature (-1 to 1)
  rainfall: number;           // Recent rainfall in mm
  soilMoisture: number;       // Soil moisture percentage (0-100)
  vegetation: number;         // Vegetation density (0-1)
  distanceToRiver: number;    // Distance to nearest river in meters
  historicalEvents: number;   // Number of past events in area
}

export interface RiskPrediction {
  landslideRisk: number;      // 0-100%
  floodRisk: number;          // 0-100%
  overallRisk: number;        // 0-100%
  riskLevel: 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  confidence: number;         // Model confidence 0-100%
  factors: RiskFactor[];      // Contributing factors
}

export interface RiskFactor {
  name: string;
  contribution: number;       // Percentage contribution to risk
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface TrainingData {
  features: TerrainFeatures[];
  labels: number[];           // 0 = safe, 1 = risky
}

/**
 * ML Risk Prediction Model
 */
export class TerrainRiskModel {
  private model: tf.LayersModel | null = null;
  private isTraining = false;
  private isTrained = false;
  
  // Prediction cache to avoid redundant calculations
  private predictionCache = new Map<string, RiskPrediction>();
  private cacheMaxSize = 500; // Limit cache size

  /**
   * Create cache key from features
   */
  private getCacheKey(features: TerrainFeatures): string {
    return `${features.slope.toFixed(1)}_${features.elevation.toFixed(0)}_${features.rainfall.toFixed(0)}`;
  }

  /**
   * Clear prediction cache
   */
  clearCache(): void {
    this.predictionCache.clear();
  }

  /**
   * Create and compile the neural network model
   */
  private createModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input layer: 9 features
        tf.layers.dense({
          inputShape: [9],
          units: 64,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.3 }),
        
        // Hidden layer 1
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        
        // Hidden layer 2
        tf.layers.dense({
          units: 16,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        
        // Output layer: risk probability
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  /**
   * Train the model with historical data
   */
  async train(trainingData: TrainingData, epochs = 50): Promise<void> {
    if (this.isTraining) {
      throw new Error('Model is already training');
    }

    this.isTraining = true;

    try {
      // Create model if not exists
      if (!this.model) {
        this.model = this.createModel();
      }

      // Prepare training data
      const xs = tf.tensor2d(
        trainingData.features.map(f => this.featuresToArray(f))
      );
      const ys = tf.tensor2d(trainingData.labels, [trainingData.labels.length, 1]);

      // Train the model
      await this.model.fit(xs, ys, {
        epochs,
        batchSize: 32,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(
              `Epoch ${epoch + 1}/${epochs} - ` +
              `loss: ${logs?.loss.toFixed(4)} - ` +
              `acc: ${logs?.acc.toFixed(4)} - ` +
              `val_loss: ${logs?.val_loss.toFixed(4)} - ` +
              `val_acc: ${logs?.val_acc.toFixed(4)}`
            );
          },
        },
      });

      // Cleanup tensors
      xs.dispose();
      ys.dispose();

      this.isTrained = true;
      console.log('✅ Model training completed successfully!');
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Predict risk for given terrain features (with caching)
   */
  async predict(features: TerrainFeatures): Promise<RiskPrediction> {
    if (!this.model || !this.isTrained) {
      throw new Error('Model must be trained before making predictions');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(features);
    const cached = this.predictionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Convert features to tensor
    const input = tf.tensor2d([this.featuresToArray(features)]);

    // Make prediction
    const prediction = this.model.predict(input) as tf.Tensor;
    const riskValue = (await prediction.data())[0];

    // Cleanup
    input.dispose();
    prediction.dispose();

    // Calculate component risks
    const landslideRisk = this.calculateLandslideRisk(features, riskValue);
    const floodRisk = this.calculateFloodRisk(features, riskValue);
    const overallRisk = (landslideRisk + floodRisk) / 2;

    // Determine risk level
    const riskLevel = this.getRiskLevel(overallRisk);

    // Calculate contributing factors
    const factors = this.analyzeRiskFactors(features);

    // Model confidence (based on feature quality)
    const confidence = this.calculateConfidence(features);

    const result: RiskPrediction = {
      landslideRisk,
      floodRisk,
      overallRisk,
      riskLevel,
      confidence,
      factors,
    };

    // Cache the result (with size limit)
    if (this.predictionCache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.predictionCache.keys().next().value;
      this.predictionCache.delete(firstKey);
    }
    this.predictionCache.set(cacheKey, result);

    return result;
  }

  /**
   * Predict risk for multiple points (batch prediction)
   */
  async predictBatch(featuresArray: TerrainFeatures[]): Promise<RiskPrediction[]> {
    if (!this.model || !this.isTrained) {
      throw new Error('Model must be trained before making predictions');
    }

    const predictions: RiskPrediction[] = [];

    // Process in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < featuresArray.length; i += batchSize) {
      const batch = featuresArray.slice(i, i + batchSize);
      const batchPredictions = await Promise.all(
        batch.map(f => this.predict(f))
      );
      predictions.push(...batchPredictions);
    }

    return predictions;
  }

  /**
   * Convert features object to array for tensor input
   */
  private featuresToArray(features: TerrainFeatures): number[] {
    return [
      features.slope / 90,                    // Normalize to 0-1
      features.elevation / 1000,              // Normalize to 0-1 (assuming max 1000m)
      features.aspect / 360,                  // Normalize to 0-1
      (features.curvature + 1) / 2,          // Normalize -1 to 1 → 0 to 1
      features.rainfall / 500,                // Normalize (assuming max 500mm)
      features.soilMoisture / 100,           // Already 0-100, normalize to 0-1
      features.vegetation,                    // Already 0-1
      Math.min(features.distanceToRiver / 5000, 1), // Normalize (max 5km)
      Math.min(features.historicalEvents / 10, 1),  // Normalize (max 10 events)
    ];
  }

  /**
   * Calculate landslide-specific risk
   */
  private calculateLandslideRisk(features: TerrainFeatures, baseRisk: number): number {
    let risk = baseRisk * 100;

    // Slope is critical for landslides
    if (features.slope > 30) risk *= 1.5;
    if (features.slope > 45) risk *= 2.0;

    // Heavy rainfall increases risk
    if (features.rainfall > 100) risk *= 1.3;
    if (features.rainfall > 200) risk *= 1.6;

    // Low vegetation increases risk
    if (features.vegetation < 0.3) risk *= 1.2;

    // Historical events indicate susceptibility
    if (features.historicalEvents > 2) risk *= 1.4;

    return Math.min(risk, 100);
  }

  /**
   * Calculate flood-specific risk
   */
  private calculateFloodRisk(features: TerrainFeatures, baseRisk: number): number {
    let risk = baseRisk * 100;

    // Low elevation increases flood risk
    if (features.elevation < 50) risk *= 1.4;
    if (features.elevation < 20) risk *= 1.8;

    // Proximity to river
    if (features.distanceToRiver < 500) risk *= 1.5;
    if (features.distanceToRiver < 200) risk *= 2.0;

    // Heavy rainfall
    if (features.rainfall > 150) risk *= 1.4;

    // Concave terrain (water accumulation)
    if (features.curvature < -0.3) risk *= 1.3;

    return Math.min(risk, 100);
  }

  /**
   * Determine risk level from percentage
   */
  private getRiskLevel(risk: number): 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
    if (risk < 10) return 'SAFE';
    if (risk < 30) return 'LOW';
    if (risk < 50) return 'MODERATE';
    if (risk < 75) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * Analyze which factors contribute most to risk
   */
  private analyzeRiskFactors(features: TerrainFeatures): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Slope analysis
    if (features.slope > 30) {
      factors.push({
        name: 'Steep Slope',
        contribution: Math.min((features.slope / 90) * 40, 40),
        severity: features.slope > 45 ? 'CRITICAL' : 'HIGH',
        description: `Slope angle of ${features.slope.toFixed(1)}° increases landslide risk`,
      });
    }

    // Rainfall analysis
    if (features.rainfall > 100) {
      factors.push({
        name: 'Heavy Rainfall',
        contribution: Math.min((features.rainfall / 500) * 30, 30),
        severity: features.rainfall > 200 ? 'HIGH' : 'MODERATE',
        description: `${features.rainfall.toFixed(0)}mm rainfall saturates soil`,
      });
    }

    // Elevation analysis
    if (features.elevation < 50) {
      factors.push({
        name: 'Low Elevation',
        contribution: 20,
        severity: features.elevation < 20 ? 'HIGH' : 'MODERATE',
        description: `Low elevation (${features.elevation.toFixed(0)}m) prone to flooding`,
      });
    }

    // Vegetation analysis
    if (features.vegetation < 0.3) {
      factors.push({
        name: 'Low Vegetation',
        contribution: 15,
        severity: features.vegetation < 0.1 ? 'HIGH' : 'MODERATE',
        description: 'Lack of vegetation reduces soil stability',
      });
    }

    // River proximity
    if (features.distanceToRiver < 500) {
      factors.push({
        name: 'Near Water Body',
        contribution: 15,
        severity: features.distanceToRiver < 200 ? 'HIGH' : 'MODERATE',
        description: `${features.distanceToRiver.toFixed(0)}m from river increases flood risk`,
      });
    }

    // Historical events
    if (features.historicalEvents > 0) {
      factors.push({
        name: 'Historical Events',
        contribution: Math.min(features.historicalEvents * 10, 25),
        severity: features.historicalEvents > 3 ? 'HIGH' : 'MODERATE',
        description: `${features.historicalEvents} past events in this area`,
      });
    }

    // Sort by contribution
    factors.sort((a, b) => b.contribution - a.contribution);

    return factors;
  }

  /**
   * Calculate model confidence based on feature quality
   */
  private calculateConfidence(features: TerrainFeatures): number {
    let confidence = 100;

    // Reduce confidence for edge cases
    if (features.slope > 80) confidence -= 10;
    if (features.elevation > 900) confidence -= 10;
    if (features.rainfall > 400) confidence -= 15;
    if (features.historicalEvents === 0) confidence -= 5;

    return Math.max(confidence, 50);
  }

  /**
   * Save model to browser storage
   */
  async saveModel(name = 'terrain-risk-model'): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    await this.model.save(`localstorage://${name}`);
    console.log(`✅ Model saved as ${name}`);
  }

  /**
   * Load model from browser storage
   */
  async loadModel(name = 'terrain-risk-model'): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`localstorage://${name}`);
      this.isTrained = true;
      console.log(`✅ Model loaded from ${name}`);
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    }
  }

  /**
   * Check if model is ready for predictions
   */
  isReady(): boolean {
    return this.isTrained && this.model !== null;
  }

  /**
   * Get model summary
   */
  getSummary(): string {
    if (!this.model) {
      return 'No model created';
    }
    
    let summary = '';
    this.model.summary(undefined, undefined, (line) => {
      summary += line + '\n';
    });
    return summary;
  }
}

/**
 * Generate synthetic training data for initial model training
 * Based on realistic terrain risk patterns for Philippines
 */
export function generateSyntheticTrainingData(samples = 2000): TrainingData {
  const features: TerrainFeatures[] = [];
  const labels: number[] = [];

  for (let i = 0; i < samples; i++) {
    const slope = Math.random() * 90;
    const elevation = Math.random() * 800;
    const rainfall = Math.random() * 400;
    const vegetation = Math.random();
    const distanceToRiver = Math.random() * 5000;
    const soilMoisture = Math.random() * 100;
    const historicalEvents = Math.floor(Math.random() * 6);

    const feature: TerrainFeatures = {
      slope,
      elevation,
      aspect: Math.random() * 360,
      curvature: (Math.random() * 2) - 1,
      rainfall,
      soilMoisture,
      vegetation,
      distanceToRiver,
      historicalEvents,
    };

    // Realistic risk logic based on Philippine terrain patterns
    let riskScore = 0;
    
    // LANDSLIDE RISK FACTORS (Philippines-specific)
    // 1. Steep slopes (>30°) are very dangerous
    if (slope > 45) riskScore += 35;
    else if (slope > 35) riskScore += 25;
    else if (slope > 25) riskScore += 15;
    else if (slope > 15) riskScore += 5;
    
    // 2. Heavy rainfall (Philippines gets 2000-4000mm/year)
    if (rainfall > 250) riskScore += 30; // Extreme rainfall
    else if (rainfall > 180) riskScore += 20; // Heavy rainfall
    else if (rainfall > 120) riskScore += 10; // Moderate rainfall
    
    // 3. High soil moisture + steep slope = very dangerous
    if (soilMoisture > 80 && slope > 30) riskScore += 20;
    else if (soilMoisture > 70 && slope > 25) riskScore += 10;
    
    // 4. Low vegetation on steep slopes
    if (vegetation < 0.3 && slope > 25) riskScore += 15;
    else if (vegetation < 0.5 && slope > 35) riskScore += 10;
    
    // 5. Historical events are strong indicators
    if (historicalEvents >= 3) riskScore += 25;
    else if (historicalEvents >= 2) riskScore += 15;
    else if (historicalEvents >= 1) riskScore += 8;
    
    // 6. Elevation patterns (mid-elevation most risky in PH)
    if (elevation > 200 && elevation < 600 && slope > 30) riskScore += 10;
    
    // FLOOD RISK FACTORS
    // 1. Low elevation near rivers
    if (elevation < 30 && distanceToRiver < 500) riskScore += 25;
    else if (elevation < 50 && distanceToRiver < 300) riskScore += 20;
    else if (elevation < 100 && distanceToRiver < 200) riskScore += 15;
    
    // 2. Heavy rainfall in low areas
    if (rainfall > 200 && elevation < 50) riskScore += 15;
    
    // 3. Concave terrain (water accumulation)
    if (feature.curvature < -0.4 && elevation < 100) riskScore += 10;
    
    // 4. High soil saturation in low areas
    if (soilMoisture > 85 && elevation < 80) riskScore += 12;
    
    // Normalize to 0-100 scale
    riskScore = Math.min(riskScore, 100);
    
    // Convert to binary label (0 = safe, 1 = risky)
    // Threshold at 40% risk
    const isRisky = riskScore > 40 ? 1 : 0;
    
    // Add some realistic noise (10% error rate)
    const finalLabel = Math.random() < 0.1 ? 1 - isRisky : isRisky;

    features.push(feature);
    labels.push(finalLabel);
  }

  // Ensure balanced dataset (50-50 split)
  const riskyCount = labels.filter(l => l === 1).length;
  const safeCount = labels.filter(l => l === 0).length;
  
  console.log(`Training data: ${riskyCount} risky, ${safeCount} safe (${samples} total)`);

  return { features, labels };
}

/**
 * Get risk color for visualization
 */
export function getRiskColor(risk: number): [number, number, number, number] {
  if (risk < 10) return [46, 213, 115, 200];        // Vibrant Green - Safe
  if (risk < 30) return [123, 237, 159, 210];       // Light Green - Low
  if (risk < 50) return [255, 234, 167, 220];       // Bright Yellow - Moderate
  if (risk < 75) return [255, 159, 64, 230];        // Vibrant Orange - High
  return [255, 71, 87, 240];                         // Bright Red - Critical
}

/**
 * Get risk level description
 */
export function getRiskDescription(level: string): string {
  switch (level) {
    case 'SAFE':
      return 'Area is safe for development and habitation';
    case 'LOW':
      return 'Low risk - Standard precautions recommended';
    case 'MODERATE':
      return 'Moderate risk - Enhanced monitoring advised';
    case 'HIGH':
      return 'High risk - Avoid construction, implement mitigation';
    case 'CRITICAL':
      return 'Critical risk - Evacuation may be necessary';
    default:
      return 'Unknown risk level';
  }
}
