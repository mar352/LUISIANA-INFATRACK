/**
 * Solar radiation visualization utilities
 * Generates 3D solar intensity data for visualization
 */

export type SolarDataPoint = {
  position: [number, number]; // [lon, lat]
  intensity: number; // 0-1 normalized solar radiation
  elevation: number; // height in meters for 3D visualization
};

const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
};

/**
 * Generate synthetic solar radiation data grid for Luisiana
 * In production, this would fetch real data from NASA POWER API or GIBS
 */
export function generateSolarGrid(
  resolution: number = 20,
  timeOfDay: number = 12 // hour 0-23
): SolarDataPoint[] {
  const points: SolarDataPoint[] = [];
  
  const lonStep = (LUISIANA_BOUNDS.east - LUISIANA_BOUNDS.west) / resolution;
  const latStep = (LUISIANA_BOUNDS.north - LUISIANA_BOUNDS.south) / resolution;
  
  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const lon = LUISIANA_BOUNDS.west + i * lonStep;
      const lat = LUISIANA_BOUNDS.south + j * latStep;
      
      // Calculate solar intensity based on time of day and position
      const intensity = calculateSolarIntensity(lon, lat, timeOfDay);
      
      // Elevation based on intensity for 3D effect
      const elevation = intensity * 2000; // max 2km height
      
      points.push({
        position: [lon, lat],
        intensity,
        elevation,
      });
    }
  }
  
  return points;
}

/**
 * Calculate solar intensity (0-1) based on position and time
 * Simulates sun angle, atmospheric conditions, and terrain
 */
function calculateSolarIntensity(
  lon: number,
  lat: number,
  hour: number
): number {
  // Base intensity from sun angle (peaks at noon)
  const hourAngle = Math.abs(hour - 12) / 12; // 0 at noon, 1 at midnight
  const sunAngle = Math.cos(hourAngle * Math.PI) * 0.5 + 0.5;
  
  // Add some spatial variation (simulating terrain/cloud effects)
  const spatialVariation = 
    Math.sin(lon * 50) * 0.1 + 
    Math.cos(lat * 50) * 0.1 + 
    Math.sin((lon + lat) * 30) * 0.05;
  
  // Combine factors
  let intensity = sunAngle * (0.85 + spatialVariation);
  
  // Clamp to 0-1
  return Math.max(0, Math.min(1, intensity));
}

/**
 * Get color for solar intensity (yellow-orange-red gradient)
 */
export function getSolarColor(intensity: number): [number, number, number, number] {
  // Low intensity: yellow (255, 255, 100)
  // High intensity: red-orange (255, 100, 0)
  
  const r = 255;
  const g = Math.floor(255 - intensity * 155);
  const b = Math.floor(100 - intensity * 100);
  const a = Math.floor(120 + intensity * 135); // transparency
  
  return [r, g, b, a];
}

/**
 * Get current hour for solar calculation
 */
export function getCurrentSolarHour(): number {
  const now = new Date();
  // Use Philippine time (UTC+8)
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return phTime.getUTCHours();
}

/**
 * Calculate sun position for lighting
 */
export function calculateSunPosition(hour: number): [number, number, number] {
  // Convert hour to angle (0-360 degrees)
  const angle = ((hour - 6) / 12) * Math.PI; // -90° at 6am, 90° at 6pm
  
  const x = Math.sin(angle) * 100;
  const y = -Math.cos(angle) * 100;
  const z = Math.max(10, Math.sin(angle) * 150); // sun height
  
  return [x, y, z];
}
