/** Decimal-degree labels for Luisiana infrastructure (about 1 m at 5 dp). */

export function formatLonLat(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${ns}  ${Math.abs(lon).toFixed(5)}°${ew}`;
}

/** Paste-friendly `lat, lon` for clipboard / GPS. */
export function formatLonLatCopy(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function infraLabelText(
  name: string,
  lat: number,
  lon: number,
  isSitePin: boolean,
  showCoords = true,
): string {
  const title = isSitePin ? `📌 ${name}` : name;
  if (!showCoords) return title;
  const coords = formatLonLat(lat, lon);
  return coords ? `${title}\n${coords}` : title;
}
