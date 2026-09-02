#!/usr/bin/env node
/**
 * optimize-all-models.mjs
 *
 * Batch GLB optimizer for InfaTrack catalog models and legacy uploads.
 * Generates both high-detail optimized LOD0 (*.glb) and ultra-low-poly LOD1 (*.lod.glb).
 *
 * Run from repo root: node scripts/optimize-all-models.mjs
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  compactPrimitive,
  dedup,
  draco,
  flatten,
  join,
  palette,
  prune,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import jpeg from "jpeg-js";
import { Jimp } from "jimp";
import { MeshoptSimplifier } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = path.join(ROOT, "frontend/public/models");
const UPLOADS_DIR = path.join(ROOT, "frontend/public/uploads");

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function meshStats(doc) {
  let verts = 0, prims = 0, tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prims++;
      const pos = prim.getAttribute("POSITION");
      if (pos) verts += pos.getCount();
      const idx = prim.getIndices();
      if (idx) tris += idx.getCount() / 3;
      else if (pos) tris += pos.getCount() / 3;
    }
  }
  const mats = doc.getRoot().listMaterials().length;
  const textures = doc.getRoot().listTextures().length;
  return { prims, verts: Math.round(verts), tris: Math.round(tris), mats, textures };
}

function stripAnimations(doc) {
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  for (const s of doc.getRoot().listSkins()) s.dispose();
}

function stripHeavyMaterials(doc) {
  for (const mat of doc.getRoot().listMaterials()) {
    for (const ext of [
      "KHR_materials_clearcoat",
      "KHR_materials_sheen",
      "KHR_materials_specular",
      "KHR_materials_ior",
      "KHR_materials_transmission",
      "KHR_materials_volume",
      "KHR_materials_iridescence",
      "KHR_materials_anisotropy",
    ]) {
      mat.setExtension(ext, null);
    }
    mat.setOcclusionTexture(null);
    mat.setEmissiveTexture(null);
    mat.setNormalTexture(null);
    mat.setEmissiveFactor([0, 0, 0]);
    mat.setMetallicFactor(0.0);
    mat.setRoughnessFactor(0.85);
  }
}

function stripExtraAttribs(doc, keepUv = true) {
  const drop = ["TEXCOORD_1", "TEXCOORD_2", "TEXCOORD_3", "COLOR_0", "JOINTS_0", "WEIGHTS_0", "TANGENT"];
  if (!keepUv) drop.push("TEXCOORD_0");
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of drop) {
        if (prim.getAttribute(sem)) prim.setAttribute(sem, null);
      }
    }
  }
}

async function simplifyDoc(doc, targetTris) {
  await MeshoptSimplifier.ready;
  MeshoptSimplifier.useExperimentalFeatures = true;
  const before = meshStats(doc).tris;
  if (before <= targetTris) return;
  const ratio = Math.min(0.99, targetTris / Math.max(before, 1));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const position = prim.getAttribute("POSITION");
      const indices = prim.getIndices();
      if (!position || !indices) continue;
      let pos = position.getArray();
      let idx = indices.getArray();
      if (!pos || !idx) continue;
      if (!(pos instanceof Float32Array)) pos = new Float32Array(pos);
      if (!(idx instanceof Uint32Array)) idx = new Uint32Array(idx);
      const target = Math.max(3, Math.floor((ratio * idx.length) / 3) * 3);
      if (target >= idx.length) continue;
      const [dst] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.01, ["Prune", "Sparse"]);
      indices.setArray(dst);
      compactPrimitive(prim);
    }
  }
}

async function reencodeTextures(doc, maxDim = 512, quality = 70) {
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const mime = texture.getMimeType() || "";
    try {
      let raw;
      if (mime.includes("jpeg") || mime.includes("jpg")) {
        raw = jpeg.decode(Buffer.from(image), { maxMemoryUsageInMB: 2048 });
      } else {
        const j = await Jimp.read(Buffer.from(image));
        raw = { width: j.bitmap.width, height: j.bitmap.height, data: j.bitmap.data };
      }
      const jimpImg = new Jimp({ width: raw.width, height: raw.height, data: raw.data });
      if (raw.width > maxDim || raw.height > maxDim) {
        if (raw.width >= raw.height) jimpImg.resize({ w: maxDim });
        else jimpImg.resize({ h: maxDim });
      }
      const out = await jimpImg.getBuffer("image/jpeg", { quality });
      texture.setImage(new Uint8Array(out));
      texture.setMimeType("image/jpeg");
    } catch {
      // Kept intact if format cannot be parsed
    }
  }
}

async function generateLod1(io, doc, lodPath) {
  try {
    const binary = await io.writeBinary(doc);
    const lodDoc = await io.readBinary(binary);
    await simplifyDoc(lodDoc, 800);
    await reencodeTextures(lodDoc, 128, 50);
    stripHeavyMaterials(lodDoc);
    await lodDoc.transform(
      weld({ tolerance: 1e-2 }),
      prune({ keepAttributes: false }),
      dedup(),
      draco({
        method: "edgebreaker",
        quantizePosition: 12,
        quantizeNormal: 6,
        quantizeTexcoord: 10,
      }),
      prune(),
    );
    await io.write(lodPath, lodDoc);
  } catch (err) {
    console.warn("  [LOD1 error]:", err?.message || err);
  }
}

async function optimizeFile(io, filePath) {
  const baseName = path.basename(filePath);
  const lodPath = filePath.replace(/\.glb$/i, ".lod.glb");

  const beforeBytes = fs.statSync(filePath).size;
  const doc = await io.read(filePath);

  stripAnimations(doc);
  stripExtraAttribs(doc, true);
  stripHeavyMaterials(doc);

  const stats = meshStats(doc);
  const maxTex = stats.textures > 8 ? 256 : 512;
  await reencodeTextures(doc, maxTex, 70);

  await doc.transform(
    dedup(),
    prune({ keepAttributes: false }),
    palette({ min: 2 }),
    flatten(),
    join({ keepNamed: false }),
    weld({ tolerance: 1e-3 }),
    prune({ keepAttributes: false }),
    dedup(),
  );

  const TARGET_TRIS = 40000;
  const mid = meshStats(doc);
  if (mid.tris > TARGET_TRIS) {
    await simplifyDoc(doc, TARGET_TRIS);
    await doc.transform(weld({ tolerance: 1e-3 }), prune({ keepAttributes: false }), dedup());
  }

  stripHeavyMaterials(doc);
  await doc.transform(prune(), dedup());

  // Generate LOD1 companion file before Draco encoding LOD0
  await generateLod1(io, doc, lodPath);

  // Draco compress LOD0
  await doc.transform(
    draco({
      method: "edgebreaker",
      quantizePosition: 14,
      quantizeNormal: 8,
      quantizeTexcoord: 12,
    }),
    prune(),
  );

  await io.write(filePath, doc);
  const afterBytes = fs.statSync(filePath).size;
  const lodBytes = fs.existsSync(lodPath) ? fs.statSync(lodPath).size : 0;
  const saved = beforeBytes > 0 ? (100 * (1 - afterBytes / beforeBytes)).toFixed(1) + "%" : "0%";

  return { file: baseName, before: fmtBytes(beforeBytes), after: fmtBytes(afterBytes), lod: fmtBytes(lodBytes), saved };
}

async function main() {
  console.log("=".repeat(66));
  console.log("  InfaTrack Batch Optimizer & Low-Poly LOD Generator");
  console.log("=".repeat(66));

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  await MeshoptSimplifier.ready;

  // 1. Process Catalog Models in frontend/public/models/
  console.log("\n📦 Processing Catalog Models (/models)...");
  const catalogFiles = fs.readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith(".glb") && !f.endsWith(".lod.glb") && !f.endsWith(".bak"));

  for (const f of catalogFiles) {
    const fp = path.join(MODELS_DIR, f);
    const bak = fp + ".bak";
    if (!fs.existsSync(bak)) fs.copyFileSync(fp, bak);
    else fs.copyFileSync(bak, fp); // Restore original before processing

    try {
      const res = await optimizeFile(io, fp);
      console.log(`  ✓ ${res.file.padEnd(25)} ${res.before.padEnd(10)} -> ${res.after.padEnd(10)} (LOD1: ${res.lod.padEnd(10)}) saved ${res.saved}`);
    } catch (err) {
      console.error(`  ✗ ${f}:`, err?.message || err);
    }
  }

  // 2. Process Uploaded Models in frontend/public/uploads/
  if (fs.existsSync(UPLOADS_DIR)) {
    console.log("\n📂 Processing Uploaded Models (/uploads)...");
    const uploadFiles = fs.readdirSync(UPLOADS_DIR)
      .filter((f) => f.endsWith(".glb") && !f.endsWith(".lod.glb") && !f.endsWith(".bak"));

    for (const f of uploadFiles) {
      const fp = path.join(UPLOADS_DIR, f);
      const size = fs.statSync(fp).size;
      const lodPath = fp.replace(/\.glb$/i, ".lod.glb");

      // If already small (< 500KB) and has .lod.glb, skip
      if (size < 500 * 1024 && fs.existsSync(lodPath)) {
        continue;
      }

      try {
        const res = await optimizeFile(io, fp);
        console.log(`  ✓ ${res.file.padEnd(35)} ${res.before.padEnd(10)} -> ${res.after.padEnd(10)} (LOD1: ${res.lod.padEnd(10)}) saved ${res.saved}`);
      } catch (err) {
        console.error(`  ✗ ${f}:`, err?.message || err);
      }
    }
  }

  console.log("\n" + "=".repeat(66));
  console.log("✓ All catalog & uploaded models optimized with LOD0 & LOD1 variants!");
  console.log("=".repeat(66));
}

main().catch((err) => {
  console.error("Optimizer error:", err);
  process.exit(1);
});
