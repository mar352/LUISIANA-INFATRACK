/**
 * Earthquake-prone siting model (TensorFlow.js).
 * Learns official PHIVOLCS GSH + EIL labels over Luisiana terrain.
 * Not a live quake feed.
 */

import * as tf from "@tensorflow/tfjs";
import { extractTerrainFeaturesAt } from "./risk-grid";
import { LUISIANA_BOUNDS } from "./luisiana-bounds";
import { isInsideLuisiana, loadLuisianaRing, ringBounds } from "./luisiana-polygon";
import {
  cachedTerrainSat,
  hasTerrainSatSampler,
  sampleTerrainSat,
  sampleTerrainSatMany,
} from "./terrain-sat-features";
import {
  classFromIndex,
  classIndex,
  fetchEarthquakeLabels,
  nearestLabel,
  type EarthquakeLabelPoint,
  type QuakeSiteClass,
} from "./earthquake-labels";

const MODEL_KEY = "indexeddb://infatrack-earthquake-prone-v6";
const META_KEY = "infatrack-earthquake-prone-meta-v6";

export type EarthquakeSiteScore = {
  lon: number;
  lat: number;
  cls: QuakeSiteClass;
  confidence: number;
  shakeClass: EarthquakeLabelPoint["shakeClass"];
  eilClass: EarthquakeLabelPoint["eilClass"];
  source: "model" | "nearest-label";
};

/** Official 2014 sheet + model guess at the same point. */
export type EarthquakeDualSummary = EarthquakeSiteScore & {
  official: EarthquakeSiteScore | null;
  predicted: EarthquakeSiteScore | null;
};

export function isDualSummary(
  score: EarthquakeSiteScore | EarthquakeDualSummary | null | undefined,
): score is EarthquakeDualSummary {
  return Boolean(score && "official" in score && "predicted" in score);
}

export type EarthquakeTrainStatus = {
  state: "idle" | "loading" | "training" | "ready" | "failed";
  message: string;
  samples: number;
  accuracy: number | null;
};

export type EarthquakeGridCell = EarthquakeSiteScore;

type TrainMeta = {
  samples: number;
  accuracy: number;
  at: string;
};

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function featuresToArray(lon: number, lat: number): number[] {
  const t = extractTerrainFeaturesAt(lon, lat);
  const live = cachedTerrainSat(lon, lat);
  const lonN = (lon - LUISIANA_BOUNDS.west) / (LUISIANA_BOUNDS.east - LUISIANA_BOUNDS.west);
  const latN = (lat - LUISIANA_BOUNDS.south) / (LUISIANA_BOUNDS.north - LUISIANA_BOUNDS.south);
  const slope = live?.slope ?? t.slope;
  const elevation = live?.elevation ?? t.elevation;
  const aspect = live?.aspect ?? t.aspect;
  const green = live?.greenness ?? t.vegetation;
  return [
    Math.min(1, Math.max(0, lonN)),
    Math.min(1, Math.max(0, latN)),
    Math.min(1, slope / 90),
    Math.min(1, elevation / 800),
    aspect / 360,
    Math.min(1, Math.max(0, green)),
  ];
}

function balanceForTrain(labels: EarthquakeLabelPoint[]): EarthquakeLabelPoint[] {
  const buckets: Record<QuakeSiteClass, EarthquakeLabelPoint[]> = {
    SAFE: [],
    LOW: [],
    MODERATE: [],
    HIGH: [],
  };
  for (const p of labels) buckets[p.label].push(p);
  const out = [...labels];
  const grow = (list: EarthquakeLabelPoint[], want: number) => {
    if (list.length === 0) return;
    let i = 0;
    while (out.filter((p) => p.label === list[0].label).length < want) {
      out.push(list[i % list.length]);
      i += 1;
      if (i > want * 4) break;
    }
  };
  grow(buckets.HIGH, 360);
  grow(buckets.MODERATE, 480);
  return out;
}

function addSafeNegatives(
  hazard: EarthquakeLabelPoint[],
  ring: [number, number][],
  count = 420,
): EarthquakeLabelPoint[] {
  const box = ringBounds(ring);
  const extra: EarthquakeLabelPoint[] = [];
  const cols = 28;
  const rows = 28;
  for (let i = 0; i < cols && extra.length < count; i++) {
    for (let j = 0; j < rows && extra.length < count; j++) {
      const lon = box.west + ((i + 0.5) / cols) * (box.east - box.west);
      const lat = box.south + ((j + 0.5) / rows) * (box.north - box.south);
      if (!isInsideLuisiana(lon, lat, ring)) continue;
      const near = nearestLabel(hazard, lon, lat);
      if (near && haversineM(lon, lat, near.lon, near.lat) < 180) continue;
      extra.push({
        lon,
        lat,
        shakeClass: "viii",
        eilClass: "none",
        label: "SAFE",
        source: "safe-negative",
      });
    }
  }
  return extra;
}

class EarthquakeProneModel {
  private model: tf.LayersModel | null = null;
  private labels: EarthquakeLabelPoint[] = [];
  private ready = false;
  private training = false;
  status: EarthquakeTrainStatus = {
    state: "idle",
    message: "Off",
    samples: 0,
    accuracy: null,
  };

  isReady(): boolean {
    return this.ready && this.model !== null;
  }

  getLabels(): EarthquakeLabelPoint[] {
    return this.labels;
  }

  private createModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [6], units: 32, activation: "relu" }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 16, activation: "relu" }),
        tf.layers.dense({ units: 4, activation: "softmax" }),
      ],
    });
    model.compile({
      optimizer: tf.train.adam(0.008),
      loss: "categoricalCrossentropy",
      metrics: ["accuracy"],
    });
    return model;
  }

  async ensureReady(onStatus?: (s: EarthquakeTrainStatus) => void): Promise<void> {
    if (this.ready) {
      onStatus?.(this.status);
      return;
    }
    if (this.training) return;
    this.training = true;
    const emit = (patch: Partial<EarthquakeTrainStatus>) => {
      this.status = { ...this.status, ...patch };
      onStatus?.(this.status);
    };
    try {
      emit({ state: "loading", message: "Loading PHIVOLCS labels…" });
      const ring = await loadLuisianaRing();
      const hazard = (await fetchEarthquakeLabels()).filter((p) =>
        isInsideLuisiana(p.lon, p.lat, ring),
      );
      this.labels = [...hazard, ...addSafeNegatives(hazard, ring)];
      if (this.labels.length < 20) {
        throw new Error("Too few labels inside the Luisiana boundary");
      }

      try {
        this.model = await tf.loadLayersModel(MODEL_KEY);
        const raw = localStorage.getItem(META_KEY);
        const meta = raw ? (JSON.parse(raw) as TrainMeta) : null;
        this.ready = true;
        emit({
          state: "ready",
          message: "Ready (saved weights)",
          samples: meta?.samples ?? this.labels.length,
          accuracy: meta?.accuracy ?? null,
        });
        return;
      } catch {
        /* train from scratch */
      }

      if (hasTerrainSatSampler()) {
        emit({
          state: "loading",
          message: "Sampling live terrain / satellite…",
          samples: this.labels.length,
        });
        await sampleTerrainSatMany(this.labels);
      }
      emit({
        state: "training",
        message: hasTerrainSatSampler()
          ? `Training on ${this.labels.length} points (DEM + satellite)…`
          : `Training on ${this.labels.length} PHIVOLCS points…`,
        samples: this.labels.length,
      });
      this.model = this.createModel();
      const trainSet = balanceForTrain(this.labels);
      const xs = tf.tensor2d(trainSet.map((p) => featuresToArray(p.lon, p.lat)));
      const ys = tf.oneHot(
        tf.tensor1d(
          trainSet.map((p) => classIndex(p.label)),
          "int32",
        ),
        4,
      );
      const hist = await this.model.fit(xs, ys, {
        epochs: 36,
        batchSize: 32,
        shuffle: true,
        validationSplit: 0.15,
        verbose: 0,
      });
      xs.dispose();
      ys.dispose();
      const accArr = hist.history.acc ?? hist.history.accuracy;
      const lastAcc = Array.isArray(accArr) ? Number(accArr[accArr.length - 1]) : null;
      await this.model.save(MODEL_KEY);
      const meta: TrainMeta = {
        samples: this.labels.length,
        accuracy: lastAcc ?? 0,
        at: new Date().toISOString(),
      };
      localStorage.setItem(META_KEY, JSON.stringify(meta));
      this.ready = true;
      emit({
        state: "ready",
        message: hasTerrainSatSampler()
          ? "PHIVOLCS labels + live terrain/satellite prediction"
          : "PHIVOLCS EIL 2014 points + model prediction",
        samples: this.labels.length,
        accuracy: lastAcc,
      });
    } catch (err) {
      emit({
        state: "failed",
        message: err instanceof Error ? err.message : "Training failed",
      });
      throw err;
    } finally {
      this.training = false;
    }
  }

  private async inferModel(
    lon: number,
    lat: number,
  ): Promise<{ cls: QuakeSiteClass; confidence: number; probs: number[] } | null> {
    if (!this.model || !this.ready) return null;
    await sampleTerrainSat(lon, lat);
    const input = tf.tensor2d([featuresToArray(lon, lat)]);
    const out = this.model.predict(input) as tf.Tensor;
    const data = Array.from(await out.data());
    input.dispose();
    out.dispose();
    let bestI = 0;
    let best = -1;
    for (let i = 0; i < 4; i++) {
      if (data[i] > best) {
        best = data[i];
        bestI = i;
      }
    }
    const pHigh = data[3] ?? 0;
    const pMod = data[2] ?? 0;
    // Prefer the hazardous tail so the map is not all LOW.
    let cls = classFromIndex(bestI);
    let confidence = best;
    if (pHigh >= 0.16) {
      cls = "HIGH";
      confidence = pHigh;
    } else if (pMod + pHigh >= 0.22) {
      cls = "MODERATE";
      confidence = pMod + pHigh;
    }
    return { cls, confidence, probs: data };
  }

  async predictAt(lon: number, lat: number): Promise<EarthquakeDualSummary> {
    const officialPts = this.labels.filter((p) => p.source !== "safe-negative");
    const near = nearestLabel(officialPts, lon, lat);
    const distM = near ? haversineM(lon, lat, near.lon, near.lat) : Infinity;

    const official: EarthquakeSiteScore | null = near
      ? {
          lon: near.lon,
          lat: near.lat,
          cls: near.label,
          confidence: Math.max(0.35, 1 - Math.min(distM, 800) / 800),
          shakeClass: near.shakeClass,
          eilClass: near.eilClass,
          source: "nearest-label",
        }
      : null;

    const inferred = await this.inferModel(lon, lat);
    const predicted: EarthquakeSiteScore | null = inferred
      ? {
          lon,
          lat,
          cls: inferred.cls,
          confidence: inferred.confidence,
          shakeClass: near?.shakeClass ?? "viii",
          eilClass:
            inferred.cls === "HIGH"
              ? "high"
              : inferred.cls === "MODERATE"
                ? "moderate"
                : inferred.cls === "LOW"
                  ? "low"
                  : "none",
          source: "model",
        }
      : null;

    const primary =
      predicted ??
      official ??
      ({
        lon,
        lat,
        cls: "SAFE" as const,
        confidence: 0.4,
        shakeClass: "viii" as const,
        eilClass: "none" as const,
        source: "nearest-label" as const,
      } satisfies EarthquakeSiteScore);

    return { ...primary, official, predicted };
  }

  /** Official 2014 EIL pixels (yellow / purple / red) — the old PHIVOLCS sheet. */
  hazardMapPoints(): EarthquakeGridCell[] {
    let lowN = 0;
    const out: EarthquakeGridCell[] = [];
    for (const p of this.labels) {
      if (p.source === "safe-negative" || p.label === "SAFE") continue;
      if (p.label === "LOW") {
        lowN += 1;
        if (lowN % 2 === 0) continue;
      }
      out.push({
        lon: p.lon,
        lat: p.lat,
        cls: p.label,
        confidence: 1,
        shakeClass: p.shakeClass,
        eilClass: p.eilClass,
        source: "nearest-label",
      });
    }
    return out;
  }

  async predictGrid(step = 18): Promise<EarthquakeGridCell[]> {
    if (!this.ready) await this.ensureReady();
    const ring = await loadLuisianaRing();
    const box = ringBounds(ring);
    const cells: EarthquakeGridCell[] = [];
    const official = this.labels.filter((p) => p.source !== "safe-negative");
    let lowKeep = 0;
    for (let i = 0; i < step; i++) {
      for (let j = 0; j < step; j++) {
        const lon = box.west + ((i + 0.5) / step) * (box.east - box.west);
        const lat = box.south + ((j + 0.5) / step) * (box.north - box.south);
        if (!isInsideLuisiana(lon, lat, ring)) continue;
        const near = nearestLabel(official, lon, lat);
        if (near && haversineM(lon, lat, near.lon, near.lat) < 55) continue;
        const inferred = await this.inferModel(lon, lat);
        if (!inferred || inferred.cls === "SAFE") continue;
        if (inferred.cls === "LOW") {
          lowKeep += 1;
          if (lowKeep % 3 !== 0) continue;
        }
        cells.push({
          lon,
          lat,
          cls: inferred.cls,
          confidence: inferred.confidence,
          shakeClass: "viii",
          eilClass: inferred.cls === "HIGH" ? "high" : inferred.cls === "MODERATE" ? "moderate" : "low",
          source: "model",
        });
      }
    }
    return cells;
  }

  /** Official PHIVOLCS dots + model predictions in the gaps. */
  async buildMapLayer(): Promise<EarthquakeGridCell[]> {
    if (!this.ready) await this.ensureReady();
    const official = this.hazardMapPoints();
    const predicted = await this.predictGrid(18);
    this.status = {
      ...this.status,
      message: `${official.length} PHIVOLCS + ${predicted.length} predicted`,
    };
    return [...official, ...predicted];
  }
}

export const earthquakeProneModel = new EarthquakeProneModel();
