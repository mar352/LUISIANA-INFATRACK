/**
 * Aggressive Cesium pass for municipal-office.glb.
 * Target: ~50k tris, 256px albedo only, no extra material shaders.
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
import { Jimp } from "jimp";
import { MeshoptSimplifier } from "meshoptimizer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "frontend/public/models/municipal-office.glb");
const TARGET_TRIS = 50000;

function meshStats(document) {
  let verts = 0;
  let prims = 0;
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prims += 1;
      const pos = prim.getAttribute("POSITION");
      if (pos) verts += pos.getCount();
      const indices = prim.getIndices();
      if (indices) tris += indices.getCount() / 3;
      else if (pos) tris += pos.getCount() / 3;
    }
  }
  return { prims, verts, tris: Math.round(tris) };
}

function stripHeavy(document) {
  for (const mat of document.getRoot().listMaterials()) {
    mat.setExtension("KHR_materials_clearcoat", null);
    mat.setExtension("KHR_materials_sheen", null);
    mat.setExtension("KHR_materials_specular", null);
    mat.setExtension("KHR_materials_ior", null);
    mat.setNormalTexture(null);
    mat.setOcclusionTexture(null);
    mat.setEmissiveTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setMetallicFactor(0.05);
    mat.setRoughnessFactor(0.9);
  }
}

function dropNonPosAttrs(document, { keepUv }) {
  const drop = ["TEXCOORD_1", "TEXCOORD_2", "TEXCOORD_3", "COLOR_0", "JOINTS_0", "WEIGHTS_0"];
  if (!keepUv) drop.push("TEXCOORD_0");
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of drop) {
        if (prim.getAttribute(sem)) prim.setAttribute(sem, null);
      }
    }
  }
}

function forceSimplify(document, ratio) {
  MeshoptSimplifier.useExperimentalFeatures = true;
  for (const mesh of document.getRoot().listMeshes()) {
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
      const [dst] = MeshoptSimplifier.simplify(idx, pos, 3, target, 1, ["Prune", "Sparse"]);
      indices.setArray(dst);
      compactPrimitive(prim);
    }
  }
}

async function compressAlbedo(document) {
  let ok = 0;
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    try {
      const img = await Jimp.read(Buffer.from(image));
      const maxDim = 256;
      if (img.width > maxDim || img.height > maxDim) {
        if (img.width >= img.height) img.resize({ w: maxDim });
        else img.resize({ h: maxDim });
      }
      texture.setImage(await img.getBuffer("image/jpeg", { quality: 62 }));
      texture.setMimeType("image/jpeg");
      ok += 1;
    } catch (err) {
      console.warn("skip texture", texture.getName(), err?.message || err);
    }
  }
  console.log("Textures:", ok);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

console.log("Reading", file);
const document = await io.read(file);
for (const a of document.getRoot().listAnimations()) a.dispose();
for (const s of document.getRoot().listSkins()) s.dispose();
stripHeavy(document);
dropNonPosAttrs(document, { keepUv: true });

await document.transform(
  dedup(),
  prune({ keepAttributes: false }),
  palette({ min: 2 }),
  flatten(),
  join({ keepNamed: false }),
  weld(),
  prune({ keepAttributes: false }),
);
console.log("Before simplify:", meshStats(document));

await MeshoptSimplifier.ready;
const before = meshStats(document);
forceSimplify(document, Math.min(0.2, TARGET_TRIS / Math.max(before.tris, 1)));
await document.transform(weld(), prune({ keepAttributes: false }), dedup());
let after = meshStats(document);
console.log("After simplify:", after);

if (after.tris > TARGET_TRIS * 1.4) {
  dropNonPosAttrs(document, { keepUv: false });
  await document.transform(weld(), prune({ keepAttributes: false }));
  forceSimplify(document, TARGET_TRIS / Math.max(meshStats(document).tris, 1));
  await document.transform(prune({ keepAttributes: false }), dedup());
  after = meshStats(document);
  console.log("After UV-drop simplify:", after);
}

await compressAlbedo(document);
stripHeavy(document);
await document.transform(prune(), dedup());
await document.transform(draco({ method: "edgebreaker", quantizePosition: 14 }), prune());

await io.write(file, document);
console.log("Wrote", file, meshStats(document));
