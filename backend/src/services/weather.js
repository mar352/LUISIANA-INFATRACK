/**
 * Weather service — ECMWF IFS via Open-Meteo (no API key, CC-BY 4.0)
 *
 * Uses the ECMWF IFS 0.25° model for current conditions + 6-hour forecast.
 * Falls back to a deterministic simulation if the API is unreachable.
 *
 * ECMWF model reference: https://open-meteo.com/en/docs/ecmwf-api
 */

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveSeed() {
  return Math.floor(Date.now() / 5000); // changes every 5 seconds
}

/**
 * Build a storm-track LineString from current position + wind vector.
 * Practical approximation — not a full cyclone model.
 */
function buildStormTrack(lon, lat, windSpeedMps, windDirDeg) {
  // Convert wind direction (meteorological: direction FROM) to movement vector.
  const rad = ((windDirDeg + 180) % 360) * (Math.PI / 180);
  const driftPerStep = windSpeedMps * 0.003; // ~degrees per step
  const dx = Math.sin(rad) * driftPerStep;
  const dy = Math.cos(rad) * driftPerStep;

  return {
    type: "Feature",
    properties: { kind: "stormTrack" },
    geometry: {
      type: "LineString",
      coordinates: [
        [lon - dx * 2, lat - dy * 2],
        [lon - dx,     lat - dy    ],
        [lon,          lat         ],
        [lon + dx,     lat + dy    ],
        [lon + dx * 2, lat + dy * 2],
        [lon + dx * 3, lat + dy * 3],
      ],
    },
  };
}

export async function getWeatherSnapshot({ lat, lon }) {
  const seed = deriveSeed();
  const r = mulberry32(seed);

  // --- Simulation fallback (always valid, never blanks the UI) ---
  let source = "simulation";
  let temperatureC    = Math.round(26 + r() * 6);
  let windSpeedMps    = Number((1 + r() * 10).toFixed(1));
  let windDirectionDeg = Math.round(r() * 360);
  let rainfallMm      = Number((r() * 18).toFixed(1));
  let cloudinessPct   = Math.round(20 + r() * 80);
  let humidityPct     = Math.round(50 + r() * 40);
  let pressureHpa     = Math.round(1005 + r() * 15);
  let rainfallIntensity = clamp01(rainfallMm / 20);

  // 6-hour forecast (simulated fallback)
  let forecast = Array.from({ length: 6 }, (_, i) => ({
    hour: i + 1,
    temperatureC: Math.round(temperatureC + (r() - 0.5) * 3),
    rainfallMm:   Number(Math.max(0, rainfallMm + (r() - 0.5) * 4).toFixed(1)),
    cloudinessPct: Math.min(100, Math.max(0, Math.round(cloudinessPct + (r() - 0.5) * 20))),
    windSpeedMps:  Number(Math.max(0, windSpeedMps + (r() - 0.5) * 2).toFixed(1)),
  }));

  // --- ECMWF IFS via Open-Meteo ---
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      "&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover" +
        ",wind_speed_10m,wind_direction_10m,surface_pressure,weather_code" +
      "&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m" +
      "&forecast_hours=6" +
      "&wind_speed_unit=ms" +       // get m/s directly — no conversion needed
      "&models=ecmwf_ifs025" +      // ECMWF IFS 0.25° model (CC-BY 4.0)
      "&timezone=Asia%2FManila" +   // local time for forecast hours
      "&timeformat=unixtime";

    const res = await fetch(url, {
      headers: { "user-agent": "IMPACT-Luisiana/0.1" },
      signal: AbortSignal.timeout(4000), // don't block the 5s loop
    });

    if (res.ok) {
      const json = await res.json();
      const cur = json?.current;
      const hrly = json?.hourly;

      if (cur) {
        source = "ecmwf_ifs025";
        if (Number.isFinite(cur.temperature_2m))      temperatureC     = Math.round(cur.temperature_2m);
        if (Number.isFinite(cur.wind_speed_10m))       windSpeedMps     = Number(cur.wind_speed_10m.toFixed(1));
        if (Number.isFinite(cur.wind_direction_10m))   windDirectionDeg = Math.round(cur.wind_direction_10m);
        if (Number.isFinite(cur.precipitation))        rainfallMm       = Number(cur.precipitation.toFixed(1));
        if (Number.isFinite(cur.cloud_cover))          cloudinessPct    = Math.round(cur.cloud_cover);
        if (Number.isFinite(cur.relative_humidity_2m)) humidityPct      = Math.round(cur.relative_humidity_2m);
        if (Number.isFinite(cur.surface_pressure))     pressureHpa      = Math.round(cur.surface_pressure);
        rainfallIntensity = clamp01(rainfallMm / 20);
      }

      // Build 6-hour forecast from ECMWF hourly data
      if (hrly?.time?.length) {
        forecast = hrly.time.slice(0, 6).map((_, i) => ({
          hour: i + 1,
          temperatureC:  Number.isFinite(hrly.temperature_2m?.[i])  ? Math.round(hrly.temperature_2m[i])          : temperatureC,
          rainfallMm:    Number.isFinite(hrly.precipitation?.[i])    ? Number(hrly.precipitation[i].toFixed(1))    : rainfallMm,
          cloudinessPct: Number.isFinite(hrly.cloud_cover?.[i])      ? Math.round(hrly.cloud_cover[i])             : cloudinessPct,
          windSpeedMps:  Number.isFinite(hrly.wind_speed_10m?.[i])   ? Number(hrly.wind_speed_10m[i].toFixed(1))   : windSpeedMps,
          windDirectionDeg: Number.isFinite(hrly.wind_direction_10m?.[i]) ? Math.round(hrly.wind_direction_10m[i]) : windDirectionDeg,
        }));
      }
    }
  } catch {
    // keep simulation fallback — never crash the real-time loop
  }

  const stormTrack = buildStormTrack(lon, lat, windSpeedMps, windDirectionDeg);

  return {
    source,
    lat,
    lon,
    seed,
    observedAt: new Date().toISOString(),
    temperatureC,
    windSpeedMps,
    windDirectionDeg,
    rainfallMm,
    cloudinessPct,
    humidityPct,
    pressureHpa,
    rainfallIntensity,
    stormTrack,
    forecast, // next 6 hours from ECMWF
  };
}
