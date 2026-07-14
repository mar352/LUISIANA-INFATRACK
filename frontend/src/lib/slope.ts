/**
 * Slope Analysis and Visualization
 * Para makita yung actual slope angles at bundok shapes
 */

export type SlopeCategory = "flat" | "gentle" | "moderate" | "steep" | "very_steep";

export interface SlopeData {
  angle: number; // degrees
  category: SlopeCategory;
  color: [number, number, number, number]; // RGBA
  riskLevel: "low" | "medium" | "high" | "very_high";
}

/**
 * Calculate slope category based on angle
 */
export function getSlopeCategory(angleDegrees: number): SlopeCategory {
  if (angleDegrees < 5) return "flat";
  if (angleDegrees < 15) return "gentle";
  if (angleDegrees < 25) return "moderate";
  if (angleDegrees < 35) return "steep";
  return "very_steep";
}

/**
 * Get color for slope visualization
 * Green (flat) → Yellow (moderate) → Orange (steep) → Red (very steep)
 */
export function getSlopeColor(angleDegrees: number): [number, number, number, number] {
  if (angleDegrees < 5) {
    // Flat - Green
    return [92, 219, 149, 180];
  } else if (angleDegrees < 15) {
    // Gentle - Light Green
    return [154, 205, 50, 190];
  } else if (angleDegrees < 25) {
    // Moderate - Yellow
    return [255, 215, 0, 200];
  } else if (angleDegrees < 35) {
    // Steep - Orange
    return [255, 140, 0, 210];
  } else {
    // Very Steep - Red
    return [255, 77, 79, 220];
  }
}

/**
 * Get risk level based on slope
 */
export function getSlopeRiskLevel(angleDegrees: number): "low" | "medium" | "high" | "very_high" {
  if (angleDegrees < 15) return "low";
  if (angleDegrees < 25) return "medium";
  if (angleDegrees < 35) return "high";
  return "very_high";
}

/**
 * Analyze slope data
 */
export function analyzeSlopeData(angleDegrees: number): SlopeData {
  return {
    angle: angleDegrees,
    category: getSlopeCategory(angleDegrees),
    color: getSlopeColor(angleDegrees),
    riskLevel: getSlopeRiskLevel(angleDegrees),
  };
}

/**
 * Generate slope grid for Luisiana
 * Simulates slope analysis across the municipality
 */
export interface SlopePoint {
  position: [number, number]; // [lon, lat]
  elevation: number; // meters
  slope: number; // degrees
  aspect: number; // direction of slope (0-360)
  category: SlopeCategory;
  color: [number, number, number, number];
}

const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
};

/**
 * Generate slope analysis grid
 */
export function generateSlopeGrid(resolution: number = 30): SlopePoint[] {
  const points: SlopePoint[] = [];
  
  const lonStep = (LUISIANA_BOUNDS.east - LUISIANA_BOUNDS.west) / resolution;
  const latStep = (LUISIANA_BOUNDS.north - LUISIANA_BOUNDS.south) / resolution;
  
  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const lon = LUISIANA_BOUNDS.west + i * lonStep;
      const lat = LUISIANA_BOUNDS.south + j * latStep;
      
      // Simulate elevation based on position
      // Luisiana has mountains in the east, lowlands in the west
      const eastness = (lon - LUISIANA_BOUNDS.west) / (LUISIANA_BOUNDS.east - LUISIANA_BOUNDS.west);
      const northness = (lat - LUISIANA_BOUNDS.south) / (LUISIANA_BOUNDS.north - LUISIANA_BOUNDS.south);
      
      // Base elevation: higher in the east (mountains)
      const baseElevation = eastness * 400 + Math.random() * 50;
      
      // Add terrain variation
      const terrainNoise = 
        Math.sin(lon * 100) * 30 +
        Math.cos(lat * 100) * 30 +
        Math.sin((lon + lat) * 80) * 20;
      
      const elevation = Math.max(0, baseElevation + terrainNoise);
      
      // Calculate slope based on elevation change
      const elevationGradient = eastness * 400; // Steeper in the east
      const localVariation = Math.abs(terrainNoise) / 10;
      const slope = Math.min(45, elevationGradient / 10 + localVariation + Math.random() * 5);
      
      // Aspect (direction of slope) - generally westward
      const aspect = 270 + (Math.random() - 0.5) * 60; // West-facing slopes
      
      const category = getSlopeCategory(slope);
      const color = getSlopeColor(slope);
      
      points.push({
        position: [lon, lat],
        elevation,
        slope,
        aspect,
        category,
        color,
      });
    }
  }
  
  return points;
}

/**
 * Get slope description in Tagalog
 */
export function getSlopeDescriptionTagalog(category: SlopeCategory): string {
  switch (category) {
    case "flat":
      return "Patag - Ligtas para sa construction";
    case "gentle":
      return "Banayad - Mababa ang risk";
    case "moderate":
      return "Katamtaman - Kailangan ng ingat";
    case "steep":
      return "Matarik - Mataas ang risk";
    case "very_steep":
      return "Napakatarik - Delikado, landslide risk";
  }
}

/**
 * Get slope statistics for an area
 */
export interface SlopeStatistics {
  averageSlope: number;
  maxSlope: number;
  minSlope: number;
  flatArea: number; // percentage
  gentleArea: number;
  moderateArea: number;
  steepArea: number;
  verySteepArea: number;
  highRiskArea: number; // percentage of steep + very steep
}

export function calculateSlopeStatistics(points: SlopePoint[]): SlopeStatistics {
  if (points.length === 0) {
    return {
      averageSlope: 0,
      maxSlope: 0,
      minSlope: 0,
      flatArea: 0,
      gentleArea: 0,
      moderateArea: 0,
      steepArea: 0,
      verySteepArea: 0,
      highRiskArea: 0,
    };
  }
  
  const slopes = points.map(p => p.slope);
  const total = points.length;
  
  const flat = points.filter(p => p.category === "flat").length;
  const gentle = points.filter(p => p.category === "gentle").length;
  const moderate = points.filter(p => p.category === "moderate").length;
  const steep = points.filter(p => p.category === "steep").length;
  const verySteep = points.filter(p => p.category === "very_steep").length;
  
  return {
    averageSlope: slopes.reduce((a, b) => a + b, 0) / total,
    maxSlope: Math.max(...slopes),
    minSlope: Math.min(...slopes),
    flatArea: (flat / total) * 100,
    gentleArea: (gentle / total) * 100,
    moderateArea: (moderate / total) * 100,
    steepArea: (steep / total) * 100,
    verySteepArea: (verySteep / total) * 100,
    highRiskArea: ((steep + verySteep) / total) * 100,
  };
}

/**
 * Contour line generation for topographic visualization
 */
export interface ContourLine {
  elevation: number; // meters
  coordinates: [number, number][]; // line path
  isMajor: boolean; // major contour (every 100m) vs minor (every 20m)
}

/**
 * Generate contour lines for visualization
 */
export function generateContourLines(
  elevationGrid: number[][],
  bounds: typeof LUISIANA_BOUNDS,
  interval: number = 20
): ContourLine[] {
  const contours: ContourLine[] = [];
  
  // Simplified contour generation
  // In production, use a proper contouring algorithm like marching squares
  const minElevation = 0;
  const maxElevation = 500;
  
  for (let elev = minElevation; elev <= maxElevation; elev += interval) {
    const isMajor = elev % 100 === 0;
    
    // Generate a simplified contour line
    // This is a placeholder - real implementation would trace actual elevation
    const line: [number, number][] = [];
    
    // Create a curved line across the map at this elevation
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lon = bounds.west + (bounds.east - bounds.west) * t;
      const lat = bounds.south + (bounds.north - bounds.south) * (0.5 + Math.sin(t * Math.PI * 3) * 0.3);
      line.push([lon, lat]);
    }
    
    contours.push({
      elevation: elev,
      coordinates: line,
      isMajor,
    });
  }
  
  return contours;
}

/**
 * Format slope angle for display
 */
export function formatSlopeAngle(degrees: number): string {
  return `${degrees.toFixed(1)}°`;
}

/**
 * Convert slope angle to percentage
 */
export function slopeDegreesToPercent(degrees: number): number {
  return Math.tan(degrees * Math.PI / 180) * 100;
}

/**
 * Format slope as percentage
 */
export function formatSlopePercent(degrees: number): string {
  const percent = slopeDegreesToPercent(degrees);
  return `${percent.toFixed(1)}%`;
}
