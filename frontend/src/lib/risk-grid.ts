/**
 * Risk Grid Generator
 * 
 * Generates a grid of terrain points for AI risk analysis
 * Extracts terrain features from DEM data and weather
 */

import type { TerrainFeatures } from './ml-risk';

export interface GridPoint {
  position: [number, number]; // [lon, lat]
  features: TerrainFeatures;
}

// Luisiana bounds
const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
};

// Cache for grid generation
let gridCache: { size: number; grid: GridPoint[] } | null = null;

/**
 * Generate a grid of points covering Luisiana (with caching)
 */
export function generateRiskGrid(gridSize: number): GridPoint[] {
  // Return cached grid if size matches
  if (gridCache && gridCache.size === gridSize) {
    return gridCache.grid;
  }

  const points: GridPoint[] = [];
  
  const lonStep = (LUISIANA_BOUNDS.east - LUISIANA_BOUNDS.west) / gridSize;
  const latStep = (LUISIANA_BOUNDS.north - LUISIANA_BOUNDS.south) / gridSize;
  
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const lon = LUISIANA_BOUNDS.west + (i * lonStep);
      const lat = LUISIANA_BOUNDS.south + (j * latStep);
      
      const features = extractTerrainFeatures(lon, lat);
      
      points.push({
        position: [lon, lat],
        features,
      });
    }
  }
  
  // Cache the result
  gridCache = { size: gridSize, grid: points };
  
  return points;
}

/**
 * Extract terrain features for a specific location
 * In production, this should use real DEM data
 */
function extractTerrainFeatures(lon: number, lat: number): TerrainFeatures {
  // Simulate terrain features based on location
  // In production, fetch from actual DEM/weather APIs
  
  // Distance from center of Luisiana
  const centerLon = (LUISIANA_BOUNDS.west + LUISIANA_BOUNDS.east) / 2;
  const centerLat = (LUISIANA_BOUNDS.south + LUISIANA_BOUNDS.north) / 2;
  const distFromCenter = Math.sqrt(
    Math.pow(lon - centerLon, 2) + Math.pow(lat - centerLat, 2)
  );
  
  // Simulate elevation (higher towards edges - mountainous)
  const elevation = 50 + (distFromCenter * 15000);
  
  // Simulate slope (steeper towards edges)
  const slope = Math.min(distFromCenter * 2000, 60);
  
  // Aspect (direction slope faces)
  const aspect = ((Math.atan2(lat - centerLat, lon - centerLon) * 180 / Math.PI) + 360) % 360;
  
  // Curvature (concave in valleys, convex on ridges)
  const curvature = Math.sin(distFromCenter * 100) * 0.5;
  
  // Simulate rainfall (more in mountainous areas)
  const rainfall = 80 + (elevation / 10) + (Math.random() * 40);
  
  // Soil moisture (higher in low areas)
  const soilMoisture = Math.max(20, 80 - (elevation / 5) + (Math.random() * 20));
  
  // Vegetation (less in steep slopes)
  const vegetation = Math.max(0.1, 0.9 - (slope / 100) + (Math.random() * 0.2));
  
  // Distance to river (simulate rivers in valleys)
  const distanceToRiver = elevation < 100 ? Math.random() * 500 : 500 + (Math.random() * 2000);
  
  // Historical events (more in high-risk areas)
  const historicalEvents = slope > 30 && elevation > 200 ? Math.floor(Math.random() * 4) : 0;
  
  return {
    slope,
    elevation,
    aspect,
    curvature,
    rainfall,
    soilMoisture,
    vegetation,
    distanceToRiver,
    historicalEvents,
  };
}

/**
 * Update grid features with current weather data
 */
export function updateGridWithWeather(
  grid: GridPoint[],
  weather: { rainfallMm: number; humidityPct: number }
): GridPoint[] {
  return grid.map(point => ({
    ...point,
    features: {
      ...point.features,
      rainfall: weather.rainfallMm,
      soilMoisture: weather.humidityPct,
    },
  }));
}

/**
 * Get grid point at specific coordinates
 */
export function getGridPointAt(
  grid: GridPoint[],
  lon: number,
  lat: number
): GridPoint | null {
  // Find nearest grid point
  let nearest: GridPoint | null = null;
  let minDist = Infinity;
  
  for (const point of grid) {
    const dist = Math.sqrt(
      Math.pow(point.position[0] - lon, 2) +
      Math.pow(point.position[1] - lat, 2)
    );
    
    if (dist < minDist) {
      minDist = dist;
      nearest = point;
    }
  }
  
  return nearest;
}

/**
 * Calculate grid statistics
 */
export function getGridStats(grid: GridPoint[]) {
  const slopes = grid.map(p => p.features.slope);
  const elevations = grid.map(p => p.features.elevation);
  
  return {
    avgSlope: slopes.reduce((a, b) => a + b, 0) / slopes.length,
    maxSlope: Math.max(...slopes),
    minSlope: Math.min(...slopes),
    avgElevation: elevations.reduce((a, b) => a + b, 0) / elevations.length,
    maxElevation: Math.max(...elevations),
    minElevation: Math.min(...elevations),
    totalPoints: grid.length,
  };
}
