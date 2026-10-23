import fs from 'fs';
import exifr from 'file:///C:/Users/kingking/Desktop/LUISIANA-INFATRACK-master/frontend/node_modules/exifr/dist/full.esm.mjs';

const targetPath = 'C:/Users/kingking/Desktop/sample-geotagged-site-photo.jpg';
const destFrontend = 'C:/Users/kingking/Desktop/LUISIANA-INFATRACK-master/frontend/public/sample-geotagged-site-photo.jpg';

function buildExifApp1(latDeg, lonDeg, altM = 152) {
  const latD = Math.floor(latDeg);
  const latM = Math.floor((latDeg - latD) * 60);
  const latS = Math.round(((latDeg - latD) * 60 - latM) * 60 * 100);

  const lonD = Math.floor(lonDeg);
  const lonM = Math.floor((lonDeg - lonD) * 60);
  const lonS = Math.round(((lonDeg - lonD) * 60 - lonM) * 60 * 100);

  function rational(n, d = 1) {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setUint32(0, n, true);
    view.setUint32(4, d, true);
    return Array.from(buf);
  }

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const tiffHeader = [0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00];
  const ifd0 = [
    0x01, 0x00,
    0x25, 0x88,
    0x04, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x1A, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ];

  const offsetLat = 92;
  const offsetLon = 116;
  const offsetAlt = 140;

  const gpsIfd = [
    0x05, 0x00,
    0x01, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x4E, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00, offsetLat, 0x00, 0x00, 0x00,
    0x03, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x45, 0x00, 0x00, 0x00,
    0x04, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00, offsetLon, 0x00, 0x00, 0x00,
    0x06, 0x00, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, offsetAlt, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ];

  const dataLat = [...rational(latD, 1), ...rational(latM, 1), ...rational(latS, 100)];
  const dataLon = [...rational(lonD, 1), ...rational(lonM, 1), ...rational(lonS, 100)];
  const dataAlt = rational(altM, 1);

  const payload = [
    ...exifHeader,
    ...tiffHeader,
    ...ifd0,
    ...gpsIfd,
    ...dataLat,
    ...dataLon,
    ...dataAlt
  ];

  const len = payload.length + 2;
  const lenHigh = (len >> 8) & 0xFF;
  const lenLow = len & 0xFF;

  return new Uint8Array([0xFF, 0xE1, lenHigh, lenLow, ...payload]);
}

const raw = fs.readFileSync(targetPath);
// Strip any existing APP1 (0xFF 0xE1) markers if present
let idx = 2;
const segments = [raw.slice(0, 2)]; // 0xFF, 0xD8 (SOI)

// Inject our GPS APP1 marker
const app1 = buildExifApp1(14.183700, 121.508900, 120);
segments.push(app1);

while (idx < raw.length) {
  if (raw[idx] === 0xFF && raw[idx + 1] === 0xE1) {
    const len = (raw[idx + 2] << 8) | raw[idx + 3];
    idx += 2 + len;
    continue;
  }
  // Reached Start of Scan (SOS) or remaining body
  if (raw[idx] === 0xFF && raw[idx + 1] === 0xDA) {
    segments.push(raw.slice(idx));
    break;
  }
  const len = (raw[idx + 2] << 8) | raw[idx + 3];
  segments.push(raw.slice(idx, idx + 2 + len));
  idx += 2 + len;
}

const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
const merged = new Uint8Array(totalLength);
let offset = 0;
for (const s of segments) {
  merged.set(s, offset);
  offset += s.length;
}

fs.writeFileSync(targetPath, merged);
fs.writeFileSync(destFrontend, merged);

const verifyGps = await exifr.gps(merged);
console.log('Verified EXIF GPS in watermarked photo:', verifyGps);
