/**
 * geotag.ts
 *
 * Automatic Coordinate & EXIF Metadata Extraction for Site Photo Documentation
 * INFA-TRACK · Office of the Municipal Planning and Development Coordinator (MPDC)
 * Municipality of Luisiana, Laguna
 */

import exifr from "exifr";
import { loadLuisianaRing, isInsideLuisiana, type LonLat } from "./luisiana-polygon";
import { loadBarangayAreas, type BarangayArea } from "./barangay-overlay";
import { detectBarangayFromCoords } from "../ui/PinpointMapPicker";
import { recognizePhotoWatermarkOcr } from "./ocrGeotag";

export interface GeotagCoordinates {
  lat: number;
  lon: number;
}

export interface GeotagExtractionResult {
  hasGeotag: boolean;
  coords?: GeotagCoordinates;
  altitude?: number;
  dateTime?: string;
  isWithinLuisiana?: boolean;
  detectedBarangay?: string;
  photoName: string;
  photoSize: number;
  source?: "exif" | "ocr";
  ocrRawText?: string;
  messageEn?: string;
  messageTl?: string;
  error?: string;
}

/**
 * Extracts GPS coordinates (Latitude & Longitude) and metadata from an uploaded photo file.
 * Dual-Engine Architecture:
 * 1. Fast Path: Reads embedded EXIF GPS tags via exifr (~5ms).
 * 2. OCR Fallback: If EXIF is stripped (e.g. shared via Messenger/Viber) or missing,
 *    runs in-browser OCR (Tesseract) to recognize GPS Map Camera watermarks stamped on the image pixels.
 */
export async function extractGeotagCoordinates(
  file: File,
  ring?: LonLat[] | null,
  areas?: BarangayArea[] | null
): Promise<GeotagExtractionResult> {
  const photoName = file.name;
  const photoSize = file.size;

  try {
    let coords: GeotagCoordinates | undefined;
    let altitude: number | undefined;
    let dateTime: string | undefined;
    let source: "exif" | "ocr" = "exif";
    let detectedOcrBarangay: string | undefined;
    let ocrRawText: string | undefined;

    // 1. Fast Path: Attempt EXIF GPS extraction via exifr
    try {
      const gpsData = await exifr.gps(file);
      if (
        gpsData &&
        typeof gpsData.latitude === "number" &&
        typeof gpsData.longitude === "number" &&
        Number.isFinite(gpsData.latitude) &&
        Number.isFinite(gpsData.longitude)
      ) {
        coords = {
          lat: Number(gpsData.latitude.toFixed(6)),
          lon: Number(gpsData.longitude.toFixed(6)),
        };
        source = "exif";

        try {
          const parsedTags = await exifr.parse(file, {
            pick: ["GPSAltitude", "DateTimeOriginal", "CreateDate"],
          });
          if (parsedTags) {
            if (typeof parsedTags.GPSAltitude === "number" && Number.isFinite(parsedTags.GPSAltitude)) {
              altitude = Number(parsedTags.GPSAltitude.toFixed(1));
            }
            if (parsedTags.DateTimeOriginal) {
              dateTime = String(parsedTags.DateTimeOriginal);
            } else if (parsedTags.CreateDate) {
              dateTime = String(parsedTags.CreateDate);
            }
          }
        } catch {
          /* non-critical EXIF tags */
        }
      }
    } catch {
      /* fall through to OCR */
    }

    // 2. OCR Engine Fallback: Run OCR if no EXIF coordinates were found
    if (!coords) {
      try {
        const ocrResult = await recognizePhotoWatermarkOcr(file);
        if (ocrResult.hasCoordinates && ocrResult.coords) {
          coords = ocrResult.coords;
          source = "ocr";
          altitude = ocrResult.altitude;
          dateTime = ocrResult.dateTime;
          detectedOcrBarangay = ocrResult.detectedBarangay;
          ocrRawText = ocrResult.rawText;
        }
      } catch (ocrErr) {
        console.warn("[OCR Watermark Recognition Error]:", ocrErr);
      }
    }

    // If neither EXIF nor OCR detected coordinates
    if (!coords) {
      return {
        hasGeotag: false,
        photoName,
        photoSize,
        messageEn: "No GPS EXIF tags or GPS camera watermark recognized. You can use the interactive map pinpointer to select the location.",
        messageTl: "Walang natagpuang GPS EXIF o GPS camera watermark ang litratong ito. Gamitin ang interactive map pinpointer upang piliin ang lokasyon.",
      };
    }

    const lat = coords.lat;
    const lon = coords.lon;

    // 3. Load official Luisiana ring boundary if not provided
    let activeRing = ring;
    if (!activeRing) {
      try {
        activeRing = await loadLuisianaRing();
      } catch {
        activeRing = null;
      }
    }

    // 4. Verify whether the coordinates fall inside the Luisiana border
    const isWithinLuisiana = activeRing ? isInsideLuisiana(lon, lat, activeRing) : false;

    // 5. Detect Luisiana Barangay
    let detectedBarangay = detectedOcrBarangay;
    if (!detectedBarangay) {
      let activeAreas = areas;
      if (!activeAreas) {
        try {
          activeAreas = await loadBarangayAreas();
        } catch {
          activeAreas = null;
        }
      }
      detectedBarangay = detectBarangayFromCoords(lon, lat, activeAreas);
    }

    const sourceLabelEn = source === "ocr" ? "OCR Watermark" : "EXIF GPS";
    const sourceLabelTl = source === "ocr" ? "OCR Watermark" : "EXIF GPS";

    return {
      hasGeotag: true,
      coords: { lat, lon },
      altitude,
      dateTime,
      isWithinLuisiana,
      detectedBarangay,
      photoName,
      photoSize,
      source,
      ocrRawText,
      messageEn: isWithinLuisiana
        ? `Location detected: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E (${detectedBarangay}). Automatically pinned on the map!`
        : `Notice: The photo's coordinates (${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E) are outside the Luisiana municipal border. Please upload a photo taken within the Municipality of Luisiana, or adjust the pin manually on the interactive map.`,
      messageTl: isWithinLuisiana
        ? `Natukoy ang lokasyon: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E (${detectedBarangay}). Awtomatikong nai-pin sa mapa!`
        : `Paunawa: Ang coordinates ng litrato (${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E) ay nasa labas ng Bayan ng Luisiana. Mag-upload ng litratong kuha sa loob ng Bayan ng Luisiana, o ayusin ang pin sa interactive map.`,
    };
  } catch (err: any) {
    console.warn("[Geotag Extraction] Error reading photo data:", err);
    return {
      hasGeotag: false,
      photoName,
      photoSize,
      error: err?.message || "Failed to parse geotag data",
      messageEn: "Could not read GPS metadata from this photo. You can use the interactive map pinpointer to select the location.",
      messageTl: "Hindi mabasa ang GPS metadata ng litratong ito. Gamitin ang interactive map pinpointer upang piliin ang lokasyon.",
    };
  }
}
