export type HeatPoint = [number, number, number]; // [lon,lat,weight]

export type WeatherForecastHour = {
  hour: number;
  temperatureC: number;
  rainfallMm: number;
  cloudinessPct: number;
  windSpeedMps: number;
  windDirectionDeg: number;
};

export type WeatherSnapshot = {
  source: string;
  lat: number;
  lon: number;
  seed: number;
  observedAt: string;
  temperatureC: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  rainfallMm: number;
  cloudinessPct: number;
  humidityPct: number;
  pressureHpa: number;
  rainfallIntensity: number;
  stormTrack: GeoJSON.Feature<GeoJSON.LineString, { kind: "stormTrack" }>;
  forecast: WeatherForecastHour[]; // next 6 hours from ECMWF
};

export type RiskFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  {
    zoneId: string;
    name: string;
    slopeIndex: number;
    rainfallIntensity: number;
    level: "LOW" | "MODERATE" | "HIGH";
    score: number;
  }
>;

export type RiskZones = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  RiskFeature["properties"]
> & { properties?: Record<string, unknown> };

export type Project = {
  id: string;
  name: string;
  type: "Municipal Project" | "Private Building" | "Agricultural Structure";
  department: "MPDC" | "Engineering" | "Agriculture" | "Negosyo Center";
  status: "Planning" | "Ongoing" | "Completed";
  progress: number;
  location: { lat: number; lon: number };
  updatedAt: string;
};

export type AlertItem = {
  id: string;
  type: "LANDSLIDE_RISK";
  severity: "HIGH";
  zoneId: string;
  title: string;
  message: string;
  recommendedAction: string;
  triggeredAt: string;
};

