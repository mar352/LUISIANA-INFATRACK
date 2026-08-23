import type { SyntheticEvent } from "react";
import type { WeatherSnapshot } from "../types";

const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function windDirLabel(deg: number): string {
  return WIND_DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function hanginLine(weather: WeatherSnapshot): string {
  const kph = Math.round(weather.windSpeedMps * 3.6);
  if (kph >= 118) return `Bagyo-level wind — ${kph} kph. Limit outdoor / elevated work.`;
  if (kph >= 62) return `Strong breeze at ${kph} kph. Secure loose materials on site.`;
  if (kph >= 30) return `Moderate wind at ${kph} kph from ${windDirLabel(weather.windDirectionDeg)}.`;
  return `Light wind at ${kph} kph — conditions are manageable for outdoor operations.`;
}

type Props = {
  weather: WeatherSnapshot | null;
  onClose: () => void;
  onPointerDown?: (e: SyntheticEvent) => void;
};

export function ClimateReadingsCard({ weather, onClose, onPointerDown }: Props) {
  return (
    <aside
      className="map-climate-card"
      aria-label="Climate readings"
      onPointerDown={onPointerDown}
      onMouseDown={onPointerDown}
    >
      <header className="map-climate-head">
        <div>
          <div className="map-climate-title">Climate readings</div>
          <p className="map-climate-sub">Luisiana station · not a particle overlay</p>
        </div>
        <button type="button" className="map-climate-close" onClick={onClose} aria-label="Close climate readings">
          ×
        </button>
      </header>

      <div className="map-climate-grid">
        <div>
          <div className="map-climate-v">{weather ? `${Math.round(weather.windSpeedMps * 3.6)} kph` : "—"}</div>
          <div className="map-climate-l">Wind speed</div>
        </div>
        <div>
          <div className="map-climate-v">
            {weather ? `${windDirLabel(weather.windDirectionDeg)} · ${Math.round(weather.windDirectionDeg)}°` : "—"}
          </div>
          <div className="map-climate-l">Wind direction</div>
        </div>
        <div>
          <div className="map-climate-v">{weather ? `${weather.temperatureC.toFixed(1)}°C` : "—"}</div>
          <div className="map-climate-l">Air temperature</div>
        </div>
        <div>
          <div className="map-climate-v">{weather ? `${weather.rainfallMm.toFixed(1)} mm` : "—"}</div>
          <div className="map-climate-l">Rainfall</div>
        </div>
        <div>
          <div className="map-climate-v">{weather ? `${weather.humidityPct ?? "—"}%` : "—"}</div>
          <div className="map-climate-l">Humidity</div>
        </div>
        <div>
          <div className="map-climate-v">{weather ? `${weather.cloudinessPct}%` : "—"}</div>
          <div className="map-climate-l">Cloud cover</div>
        </div>
        <div>
          <div className="map-climate-v">{weather ? `${weather.pressureHpa ?? "—"} hPa` : "—"}</div>
          <div className="map-climate-l">Pressure</div>
        </div>
        <div>
          <div className="map-climate-v">{weather ? `${(weather.rainfallIntensity * 100).toFixed(0)}%` : "—"}</div>
          <div className="map-climate-l">Rain intensity</div>
        </div>
      </div>

      {weather && (
        <div className="map-climate-note">
          <strong>Hangin:</strong> {hanginLine(weather)}
          <div className="map-climate-src">
            Source: {weather.source} · Updated {formatAgo(weather.observedAt)}
          </div>
        </div>
      )}

      {weather?.forecast?.length ? (
        <div className="map-climate-forecast">
          <div className="map-climate-forecast-title">Next hours</div>
          {weather.forecast.slice(0, 3).map((f) => (
            <div key={f.hour} className="map-climate-forecast-row">
              <b>+{f.hour}h</b>
              <span>
                {f.temperatureC}°C · {Math.round(f.windSpeedMps * 3.6)} kph {windDirLabel(f.windDirectionDeg)} ·{" "}
                {f.rainfallMm} mm
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
