#!/usr/bin/env node
/**
 * Report whether a GLB will show colors in Cesium.
 * Usage: node scripts/inspect-glb.mjs path/to/model.glb
 */
import fs from "node:fs";
import path from "node:path";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function inspect(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a GLB (need glTF Binary). If this is .gltf, export as .glb.");
  }
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== JSON_CHUNK) throw new Error("GLB JSON chunk missing");
  const json = JSON.parse(buf.slice(20, 20 + chunkLen).toString("utf8"));
  const images = json.images ?? [];
  const materials = json.materials ?? [];
  let textured = 0;
  let white = 0;
  for (const m of materials) {
    const pbr = m.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture) {
      textured += 1;
      continue;
    }
    const f = pbr.baseColorFactor ?? [1, 1, 1, 1];
    if (f[0] > 0.95 && f[1] > 0.95 && f[2] > 0.95) white += 1;
  }
  const mimes = {};
  for (const img of images) {
    const mime = img.mimeType || "(none)";
    mimes[mime] = (mimes[mime] || 0) + 1;
  }
  return {
    file: path.basename(file),
    bytes: buf.length,
    images: images.length,
    mimes,
    materials: materials.length,
    texturedMaterials: textured,
    whiteUntextured: white,
  };
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/inspect-glb.mjs path/to/model.glb");
  process.exit(1);
}
const report = inspect(file);
console.log(JSON.stringify(report, null, 2));
if (report.texturedMaterials === 0 && report.images > 0) {
  console.error(
    "\nImages exist but no material uses baseColorTexture. Run scripts/blender_fix_materials_for_gltf.py then re-export.",
  );
  process.exit(2);
}
if (report.images === 0 && report.whiteUntextured > 0) {
  console.error(
    "\nNo embedded images and materials are white/metal — Cesium will draw this colorless. In Blender: Image Texture → Principled Base Color, Pack Resources, export glTF Binary.",
  );
  process.exit(2);
}
if (report.images === 0) {
  console.error(
    "\nNo image textures (solid colors only). If Blender showed maps, they were not packed into the GLB.",
  );
  process.exit(2);
}
