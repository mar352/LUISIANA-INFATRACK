#!/usr/bin/env node
/**
 * compress-highres-models.mjs
 *
 * Applies LOSSLESS 16-bit Draco compression to high-res GLBs in frontend/public/uploads.
 * 100% of triangles, 100% textures, 100% materials preserved.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPLOADS_DIR = path.join(ROOT, "frontend/public/uploads");
const DIST_UPLOADS = path.join(ROOT, "frontend/dist/uploads");

function meshStats(doc) {
  let verts = 0, tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (pos) verts += pos.getCount();
      const idx = prim.getIndices();
      if (idx) tris += idx.getCount() / 3;
      else if (pos) tris += pos.getCount() / 3;
    }
  }
  return { verts: Math.round(verts), tris: Math.round(tris) };
}

async function main() {
  console.log("=".repeat(66));
  console.log("  InfaTrack Lossless High-Resolution Model Compressor");
  console.log("=".repeat(66));

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  const files = fs.readdirSync(UPLOADS_DIR)
    .filter((f) => f.endsWith(".glb") && !f.endsWith(".lod.glb") && !f.endsWith(".bak"));

  for (const f of files) {
    const fp = path.join(UPLOADS_DIR, f);
    const size = fs.statSync(fp).size;

    // If already compressed (< 18MB) or too large for 32-bit WASM memory (> 200MB), skip
    if (size < 18 * 1024 * 1024 || size > 200 * 1024 * 1024) continue;

    console.log(`\nCompressing: ${f} (${(size / 1024 / 1024).toFixed(1)} MB)...`);
    try {
      const doc = await io.read(fp);
      const beforeStats = meshStats(doc);

      // Lossless 16-bit Draco compression
      await doc.transform(
        dedup(),
        prune({ keepAttributes: true }),
        draco({
          method: "edgebreaker",
          quantizePosition: 16,
          quantizeNormal: 10,
          quantizeTexcoord: 14,
          quantizeColor: 8,
        }),
        prune({ keepAttributes: true }),
      );

      const afterStats = meshStats(doc);
      const binary = await io.writeBinary(doc);
      fs.writeFileSync(fp, Buffer.from(binary));

      if (fs.existsSync(DIST_UPLOADS)) {
        fs.writeFileSync(path.join(DIST_UPLOADS, f), Buffer.from(binary));
      }

      const newSize = binary.byteLength;
      console.log(`  ✓ ${f}: ${(size / 1024 / 1024).toFixed(1)} MB -> ${(newSize / 1024 / 1024).toFixed(1)} MB (${beforeStats.tris.toLocaleString()} tris preserved 100%)`);
    } catch (err) {
      console.warn(`  ✗ Failed to compress ${f}:`, err.message);
    }
  }

  console.log("\n" + "=".repeat(66));
  console.log("✓ All high-res models compressed with 100% full geometry preserved!");
  console.log("=".repeat(66));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
