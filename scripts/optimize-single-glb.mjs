#!/usr/bin/env node
/**
 * optimize-single-glb.mjs
 *
 * Optimizes a single GLB file:
 *   1. <output>.glb     (High-Detail LOD0: full geometry & textures preserved, deduplicated, Draco compressed)
 *   2. <output>.lod.glb (Low-Poly LOD1: ultra-lightweight ~1,000 triangles, 128x128 textures, ~10-30KB)
 *
 * Usage:
 *   node scripts/optimize-single-glb.mjs <input-file.glb> [output-file.glb]
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

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath;

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error(JSON.stringify({ ok: false, error: "Input file not found" }));
  process.exit(1);
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

async function reencodeTextures(doc, maxDim = 512, quality = 75) {
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
    await simplifyDoc(lodDoc, 1000);
    await reencodeTextures(lodDoc, 128, 50);
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
    if (!fs.existsSync(lodPath) && fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, lodPath);
    }
  }
}

async function run() {
  const beforeBytes = fs.statSync(inputPath).size;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  await MeshoptSimplifier.ready;

  const doc = await io.read(inputPath);
  const beforeStats = meshStats(doc);

  stripAnimations(doc);

  // Generate LOD1 low-poly companion file first
  const lodPath = outputPath.replace(/\.glb$/i, ".lod.glb");
  await generateLod1(io, doc, lodPath);

  // Clean LOD0 (High Detail): deduplicate, prune unused data, Draco compress
  await doc.transform(
    dedup(),
    prune({ keepAttributes: true }),
    weld({ tolerance: 1e-4 }),
    prune({ keepAttributes: true }),
    dedup(),
    draco({
      method: "edgebreaker",
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
    }),
    prune(),
  );

  const tempOutput = outputPath + ".opt.tmp";
  await io.write(tempOutput, doc);
  fs.renameSync(tempOutput, outputPath);

  const afterBytes = fs.statSync(outputPath).size;
  const lodBytes = fs.existsSync(lodPath) ? fs.statSync(lodPath).size : 0;
  const afterStats = meshStats(doc);
  const savedPercent = beforeBytes > 0 ? Number(((1 - afterBytes / beforeBytes) * 100).toFixed(1)) : 0;

  console.log(
    JSON.stringify({
      ok: true,
      file: path.basename(outputPath),
      lodFile: path.basename(lodPath),
      beforeBytes,
      afterBytes,
      lodBytes,
      savedBytes: Math.max(0, beforeBytes - afterBytes),
      savedPercent,
      beforeStats,
      afterStats,
    }),
  );
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  process.exit(1);
});
