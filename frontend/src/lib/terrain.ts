/**
 * Advanced 3D Terrain and Satellite Imagery Utilities
 * WebGL-optimized terrain rendering with high-quality satellite imagery
 */

export type TerrainSource = "terrarium" | "mapbox" | "mapzen";
export type SatelliteSource = "esri" | "sentinel" | "google" | "mapbox";

export interface TerrainConfig {
  source: TerrainSource;
  exaggeration: number;
  hillshadeIntensity: number;
  enableShadows: boolean;
}

export interface SatelliteConfig {
  source: SatelliteSource;
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

/**
 * Terrain DEM sources with WebGL optimization
 */
export const TERRAIN_SOURCES = {
  terrarium: {
    name: "Terrarium (AWS)",
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 15,
    attribution: "Terrain data: Mapzen",
  },
  mapbox: {
    name: "Mapbox Terrain RGB",
    tiles: ["https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token={accessToken}"],
    encoding: "mapbox",
    tileSize: 512,
    maxzoom: 14,
    attribution: "© Mapbox",
  },
  mapzen: {
    name: "Mapzen Terrain",
    tiles: ["https://tile.nextzen.org/tilezen/terrain/v1/terrarium/{z}/{x}/{y}.png?api_key={apiKey}"],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 15,
    attribution: "© Mapzen",
  },
} as const;

/**
 * High-quality satellite imagery sources
 */
export const SATELLITE_SOURCES = {
  esri: {
    name: "ESRI World Imagery",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    maxzoom: 19,
    tileSize: 256,
    attribution: "© Esri",
    description: "High-resolution satellite imagery, updated frequently",
  },
  sentinel: {
    name: "Sentinel-2 (ESA)",
    tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg"],
    maxzoom: 16,
    tileSize: 256,
    attribution: "© ESA Sentinel-2",
    description: "Cloud-free satellite composite from Sentinel-2",
  },
  google: {
    name: "Google Satellite",
    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    maxzoom: 20,
    tileSize: 256,
    attribution: "© Google",
    description: "Google's satellite imagery (use with caution - terms of service)",
  },
  mapbox: {
    name: "Mapbox Satellite",
    tiles: ["https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg?access_token={accessToken}"],
    maxzoom: 19,
    tileSize: 512,
    attribution: "© Mapbox © DigitalGlobe",
    description: "High-quality satellite imagery from Mapbox",
  },
} as const;

/**
 * Default terrain configuration optimized for Luisiana
 */
export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  source: "terrarium",
  exaggeration: 1.8, // Increased for better visibility of slopes
  hillshadeIntensity: 0.35,
  enableShadows: true,
};

/**
 * Default satellite configuration
 */
export const DEFAULT_SATELLITE_CONFIG: SatelliteConfig = {
  source: "esri",
  opacity: 1.0,
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
};

/**
 * Get terrain source configuration
 */
export function getTerrainSource(source: TerrainSource = "terrarium") {
  return TERRAIN_SOURCES[source];
}

/**
 * Get satellite source configuration
 */
export function getSatelliteSource(source: SatelliteSource = "esri") {
  return SATELLITE_SOURCES[source];
}

/**
 * Calculate optimal terrain exaggeration based on zoom level
 * Higher zoom = less exaggeration (more realistic)
 * Lower zoom = more exaggeration (better visibility)
 */
export function calculateTerrainExaggeration(zoom: number): number {
  if (zoom < 10) return 2.5;
  if (zoom < 12) return 2.0;
  if (zoom < 14) return 1.5;
  if (zoom < 16) return 1.2;
  return 1.0;
}

/**
 * Create hillshade layer configuration for enhanced terrain visualization
 */
export function createHillshadeLayer(intensity: number = 0.35) {
  return {
    id: "hillshade",
    type: "hillshade",
    source: "terrain-dem",
    layout: { visibility: "visible" },
    paint: {
      "hillshade-exaggeration": 0.8,
      "hillshade-shadow-color": "rgba(0, 0, 0, 0.8)",
      "hillshade-highlight-color": "rgba(255, 255, 255, 0.6)",
      "hillshade-accent-color": "rgba(255, 255, 255, 0.2)",
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "map",
    },
  };
}

/**
 * Create sky layer for atmospheric effect
 */
export function createSkyLayer() {
  return {
    id: "sky",
    type: "sky",
    paint: {
      "sky-type": "atmosphere",
      "sky-atmosphere-sun": [0.0, 90.0], // Sun position
      "sky-atmosphere-sun-intensity": 15,
      "sky-atmosphere-color": "rgba(135, 206, 235, 1.0)",
      "sky-atmosphere-halo-color": "rgba(255, 255, 255, 0.8)",
      "sky-gradient-center": [0, 0],
      "sky-gradient-radius": 90,
      "sky-gradient": [
        "interpolate",
        ["linear"],
        ["sky-radial-progress"],
        0.8,
        "rgba(135, 206, 235, 1.0)",
        1,
        "rgba(200, 225, 255, 1.0)",
      ],
      "sky-opacity": [
        "interpolate",
        ["exponential", 0.1],
        ["zoom"],
        5,
        0,
        22,
        1,
      ],
    },
  };
}

/**
 * Enhanced satellite layer with WebGL optimizations
 */
export function createSatelliteLayer(
  sourceId: string,
  config: Partial<SatelliteConfig> = {}
) {
  const finalConfig = { ...DEFAULT_SATELLITE_CONFIG, ...config };
  
  return {
    id: "satellite-layer",
    type: "raster",
    source: sourceId,
    paint: {
      "raster-opacity": finalConfig.opacity,
      "raster-brightness-min": 0,
      "raster-brightness-max": finalConfig.brightness,
      "raster-contrast": finalConfig.contrast - 1, // MapLibre uses -1 to 1 range
      "raster-saturation": finalConfig.saturation - 1,
      "raster-fade-duration": 300,
      "raster-resampling": "linear", // Better quality than nearest
    },
  };
}

/**
 * Create contour lines layer for topographic visualization
 */
export function createContourLinesLayer() {
  return {
    id: "contour-lines",
    type: "line",
    source: "terrain-dem",
    layout: {
      visibility: "visible",
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "rgba(255, 255, 255, 0.3)",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.5,
        16,
        1.5,
      ],
      "line-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.3,
        14,
        0.6,
        16,
        0.8,
      ],
    },
  };
}

/**
 * WebGL-optimized terrain rendering parameters
 */
export interface WebGLTerrainParams {
  // Terrain mesh quality
  meshQuality: "low" | "medium" | "high" | "ultra";
  
  // Texture filtering
  textureFiltering: "nearest" | "linear" | "mipmap";
  
  // Level of detail
  lodBias: number; // -1 to 1, negative = higher quality
  
  // Tile loading
  maxParallelImageRequests: number;
  
  // Memory management
  maxTileCacheSize: number; // MB
}

export const WEBGL_TERRAIN_PRESETS: Record<string, WebGLTerrainParams> = {
  performance: {
    meshQuality: "low",
    textureFiltering: "nearest",
    lodBias: 0.5,
    maxParallelImageRequests: 8,
    maxTileCacheSize: 50,
  },
  balanced: {
    meshQuality: "medium",
    textureFiltering: "linear",
    lodBias: 0,
    maxParallelImageRequests: 16,
    maxTileCacheSize: 100,
  },
  quality: {
    meshQuality: "high",
    textureFiltering: "mipmap",
    lodBias: -0.5,
    maxParallelImageRequests: 24,
    maxTileCacheSize: 200,
  },
  ultra: {
    meshQuality: "ultra",
    textureFiltering: "mipmap",
    lodBias: -1,
    maxParallelImageRequests: 32,
    maxTileCacheSize: 300,
  },
};

/**
 * Apply WebGL optimizations to map instance
 */
export function applyWebGLOptimizations(
  map: any,
  preset: keyof typeof WEBGL_TERRAIN_PRESETS = "balanced"
) {
  const params = WEBGL_TERRAIN_PRESETS[preset];
  
  // Apply rendering optimizations
  if (map._requestManager) {
    map._requestManager._maxParallelImageRequests = params.maxParallelImageRequests;
  }
  
  // Set tile cache size
  if (map.style && map.style.sourceCaches) {
    Object.values(map.style.sourceCaches).forEach((sourceCache: any) => {
      if (sourceCache._cache) {
        sourceCache._cache.max = params.maxTileCacheSize;
      }
    });
  }
  
  return params;
}

/**
 * Calculate slope angle from terrain at a point
 * Useful for landslide risk assessment
 */
export function calculateSlope(
  elevation: number,
  neighborElevations: number[],
  cellSize: number = 30 // meters
): number {
  if (neighborElevations.length < 4) return 0;
  
  // Calculate gradient in x and y directions
  const dzdx = (neighborElevations[1] - neighborElevations[3]) / (2 * cellSize);
  const dzdy = (neighborElevations[0] - neighborElevations[2]) / (2 * cellSize);
  
  // Calculate slope in degrees
  const slopeRadians = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  const slopeDegrees = slopeRadians * (180 / Math.PI);
  
  return slopeDegrees;
}

/**
 * Get elevation color for visualization
 */
export function getElevationColor(elevation: number): string {
  // Luisiana elevation range: ~0-500m
  if (elevation < 50) return "rgba(34, 139, 34, 0.6)"; // Low - green
  if (elevation < 100) return "rgba(154, 205, 50, 0.6)"; // Medium-low - yellow-green
  if (elevation < 200) return "rgba(255, 215, 0, 0.6)"; // Medium - gold
  if (elevation < 300) return "rgba(255, 140, 0, 0.6)"; // Medium-high - orange
  return "rgba(178, 34, 34, 0.6)"; // High - red
}
