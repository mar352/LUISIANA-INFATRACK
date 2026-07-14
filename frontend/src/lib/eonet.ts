/**
 * NASA EONET (Earth Observatory Natural Event Tracker) Integration
 * 
 * Provides access to real-time natural event data from NASA's EONET API.
 * Events include wildfires, storms, volcanoes, earthquakes, floods, and more.
 * 
 * API Documentation: https://eonet.gsfc.nasa.gov/docs/v3
 * No API key required - public domain data
 */

const EONET_BASE_URL = 'https://eonet.gsfc.nasa.gov/api/v3';

export interface EONETGeometry {
  date: string;
  type: 'Point' | 'Polygon';
  coordinates: number[]; // [longitude, latitude] for Point
  magnitudeValue?: number;
  magnitudeUnit?: string;
}

export interface EONETCategory {
  id: string;
  title: string;
}

export interface EONETSource {
  id: string;
  url: string;
}

export interface EONETEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null; // ISO date string if closed, null if open
  categories: EONETCategory[];
  sources: EONETSource[];
  geometry: EONETGeometry[];
}

export interface EONETResponse {
  title: string;
  description: string;
  link: string;
  events: EONETEvent[];
}

export interface EONETCategoryInfo {
  id: string;
  title: string;
  description: string;
  color: string; // Hex color for visualization
  icon: string; // Emoji icon
}

/**
 * All available EONET event categories with metadata for visualization
 */
export const EONET_CATEGORIES: Record<string, EONETCategoryInfo> = {
  wildfires: {
    id: 'wildfires',
    title: 'Wildfires',
    description: 'Wildland fires in forests and plains',
    color: '#FF4500',
    icon: '🔥'
  },
  severeStorms: {
    id: 'severeStorms',
    title: 'Severe Storms',
    description: 'Hurricanes, cyclones, tornadoes',
    color: '#4169E1',
    icon: '🌪️'
  },
  volcanoes: {
    id: 'volcanoes',
    title: 'Volcanoes',
    description: 'Volcanic eruptions and ash plumes',
    color: '#DC143C',
    icon: '🌋'
  },
  earthquakes: {
    id: 'earthquakes',
    title: 'Earthquakes',
    description: 'Seismic activity and displacement',
    color: '#8B4513',
    icon: '🌍'
  },
  floods: {
    id: 'floods',
    title: 'Floods',
    description: 'Water inundation events',
    color: '#1E90FF',
    icon: '🌊'
  },
  drought: {
    id: 'drought',
    title: 'Drought',
    description: 'Prolonged absence of precipitation',
    color: '#D2691E',
    icon: '🏜️'
  },
  landslides: {
    id: 'landslides',
    title: 'Landslides',
    description: 'Mudslides and avalanches',
    color: '#A0522D',
    icon: '⛰️'
  },
  dustHaze: {
    id: 'dustHaze',
    title: 'Dust and Haze',
    description: 'Dust storms and air pollution',
    color: '#DAA520',
    icon: '💨'
  },
  snow: {
    id: 'snow',
    title: 'Snow',
    description: 'Extreme snowfall events',
    color: '#F0F8FF',
    icon: '❄️'
  },
  tempExtremes: {
    id: 'tempExtremes',
    title: 'Temperature Extremes',
    description: 'Extreme heat or cold',
    color: '#FF6347',
    icon: '🌡️'
  },
  seaLakeIce: {
    id: 'seaLakeIce',
    title: 'Sea and Lake Ice',
    description: 'Ice formations and icebergs',
    color: '#B0E0E6',
    icon: '🧊'
  },
  waterColor: {
    id: 'waterColor',
    title: 'Water Color',
    description: 'Algae blooms and sediment',
    color: '#20B2AA',
    icon: '🌊'
  },
  manmade: {
    id: 'manmade',
    title: 'Manmade',
    description: 'Human-induced extreme events',
    color: '#696969',
    icon: '🏭'
  }
};

/**
 * Fetch natural events from NASA EONET API
 * 
 * @param options Query options
 * @returns Promise with event data
 */
export async function fetchEONETEvents(options: {
  status?: 'open' | 'closed' | 'all';
  limit?: number;
  days?: number;
  category?: string;
  source?: string;
  bbox?: string; // minLon,minLat,maxLon,maxLat
} = {}): Promise<EONETResponse> {
  const params = new URLSearchParams();
  
  if (options.status) params.append('status', options.status);
  if (options.limit) params.append('limit', options.limit.toString());
  if (options.days) params.append('days', options.days.toString());
  if (options.category) params.append('category', options.category);
  if (options.source) params.append('source', options.source);
  if (options.bbox) params.append('bbox', options.bbox);

  const url = `${EONET_BASE_URL}/events?${params.toString()}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`EONET API error: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch EONET events:', error);
    throw error;
  }
}

/**
 * Get the most recent geometry point for an event
 * Events can have multiple geometry points over time
 */
export function getLatestGeometry(event: EONETEvent): EONETGeometry | null {
  if (!event.geometry || event.geometry.length === 0) return null;
  
  // Sort by date descending and return the most recent
  const sorted = [...event.geometry].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  return sorted[0];
}

/**
 * Get color for an event based on its category
 */
export function getEventColor(event: EONETEvent): string {
  const categoryId = event.categories[0]?.id;
  return EONET_CATEGORIES[categoryId]?.color || '#808080';
}

/**
 * Get icon for an event based on its category
 */
export function getEventIcon(event: EONETEvent): string {
  const categoryId = event.categories[0]?.id;
  return EONET_CATEGORIES[categoryId]?.icon || '📍';
}

/**
 * Format event for display
 */
export function formatEventInfo(event: EONETEvent): string {
  const geometry = getLatestGeometry(event);
  const category = event.categories[0]?.title || 'Unknown';
  const icon = getEventIcon(event);
  const status = event.closed ? 'Closed' : 'Active';
  
  let info = `${icon} ${event.title}\n`;
  info += `Category: ${category}\n`;
  info += `Status: ${status}\n`;
  
  if (event.description) {
    info += `Description: ${event.description}\n`;
  }
  
  if (geometry?.magnitudeValue && geometry?.magnitudeUnit) {
    info += `Magnitude: ${geometry.magnitudeValue.toLocaleString()} ${geometry.magnitudeUnit}\n`;
  }
  
  if (geometry?.date) {
    const date = new Date(geometry.date);
    info += `Last Updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`;
  }
  
  return info;
}

/**
 * Filter events by bounding box (for Luisiana region)
 * Luisiana, Laguna is approximately at: 14.1856° N, 121.5167° E
 */
export function filterEventsByRegion(
  events: EONETEvent[],
  center: [number, number] = [121.5167, 14.1856],
  radiusKm: number = 500
): EONETEvent[] {
  return events.filter(event => {
    const geometry = getLatestGeometry(event);
    if (!geometry || geometry.type !== 'Point') return false;
    
    const [lon, lat] = geometry.coordinates;
    const distance = calculateDistance(center[1], center[0], lat, lon);
    
    return distance <= radiusKm;
  });
}

/**
 * Calculate distance between two points in kilometers (Haversine formula)
 * Exported for use in UI components
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get events by category
 */
export function getEventsByCategory(events: EONETEvent[], categoryId: string): EONETEvent[] {
  return events.filter(event => 
    event.categories.some(cat => cat.id === categoryId)
  );
}

/**
 * Get event statistics
 */
export function getEventStats(events: EONETEvent[]): Record<string, number> {
  const stats: Record<string, number> = {};
  
  events.forEach(event => {
    event.categories.forEach(category => {
      stats[category.id] = (stats[category.id] || 0) + 1;
    });
  });
  
  return stats;
}
