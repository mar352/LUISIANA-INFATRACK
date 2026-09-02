/**
 * Read a GLB/GLTF ArrayBuffer and report whether Cesium can show colors.
 * White meshes almost always mean: no images, or no material uses baseColorTexture.
 */

export type GlbTextureReport = {
  ok: boolean;
  format: "glb" | "gltf" | "unknown";
  images: number;
  materials: number;
  texturedMaterials: number;
  whiteUntextured: number;
  warning: string | null;
};

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function parseGltfJson(json: Record<string, unknown>): Omit<GlbTextureReport, "ok" | "format" | "warning"> {
  const images = Array.isArray(json.images) ? json.images.length : 0;
  const materials = Array.isArray(json.materials) ? json.materials : [];
  let texturedMaterials = 0;
  let whiteUntextured = 0;
  for (const raw of materials) {
    const m = raw as {
      pbrMetallicRoughness?: {
        baseColorTexture?: unknown;
        baseColorFactor?: number[];
        metallicFactor?: number;
      };
    };
    const pbr = m.pbrMetallicRoughness;
    if (pbr?.baseColorTexture) {
      texturedMaterials += 1;
      continue;
    }
    const f = pbr?.baseColorFactor ?? [1, 1, 1, 1];
    const white = f[0] > 0.95 && f[1] > 0.95 && f[2] > 0.95;
    const metallic = pbr?.metallicFactor ?? 1;
    if (white || metallic >= 0.8) whiteUntextured += 1;
  }
  return {
    images,
    materials: materials.length,
    texturedMaterials,
    whiteUntextured,
  };
}

function warningFor(stats: Omit<GlbTextureReport, "ok" | "format" | "warning">): string | null {
  if (stats.texturedMaterials === 0 && stats.images > 0) {
    return (
      `This file has ${stats.images} image(s) but no material uses them as Base Color. ` +
      "In Blender run scripts/blender_fix_materials_for_gltf.py, then re-export."
    );
  }
  if (stats.images === 0 && stats.texturedMaterials === 0 && stats.whiteUntextured > 0) {
    return (
      "This file has no embedded textures and materials are white/metal. Cesium will show a colorless mesh. " +
      "In Blender: Image Texture → Principled BSDF Base Color, File → External Data → Pack Resources, " +
      "export glTF Binary (.glb). Or run scripts/blender_fix_materials_for_gltf.py first."
    );
  }
  if (stats.images === 0 && stats.texturedMaterials === 0) {
    return (
      "This file has no image textures (solid colors only). If Blender showed maps on the mesh, they were not packed into the GLB. " +
      "Connect Image Texture → Principled Base Color, Pack Resources, export glTF Binary."
    );
  }
  return null;
}

export function inspectGltfJson(json: Record<string, unknown>, format: GlbTextureReport["format"]): GlbTextureReport {
  const stats = parseGltfJson(json);
  const warning = warningFor(stats);
  return {
    ok: warning == null,
    format,
    warning,
    ...stats,
  };
}

export function inspectGlbBytes(bytes: ArrayBuffer): GlbTextureReport {
  const view = new DataView(bytes);
  if (bytes.byteLength >= 12 && readU32(view, 0) === GLB_MAGIC) {
    if (bytes.byteLength < 20) {
      return {
        ok: false,
        format: "unknown",
        images: 0,
        materials: 0,
        texturedMaterials: 0,
        whiteUntextured: 0,
        warning: "File is too small to be a valid GLB.",
      };
    }
    const chunkLen = readU32(view, 12);
    const chunkType = readU32(view, 16);
    if (chunkType !== JSON_CHUNK) {
      return {
        ok: false,
        format: "glb",
        images: 0,
        materials: 0,
        texturedMaterials: 0,
        whiteUntextured: 0,
        warning: "GLB JSON chunk missing — re-export as glTF Binary from Blender.",
      };
    }
    const jsonStart = 20;
    const jsonEnd = jsonStart + chunkLen;
    if (jsonEnd > bytes.byteLength) {
      return {
        ok: false,
        format: "glb",
        images: 0,
        materials: 0,
        texturedMaterials: 0,
        whiteUntextured: 0,
        warning: "GLB header length does not match the file.",
      };
    }
    const jsonText = new TextDecoder("utf-8").decode(new Uint8Array(bytes, jsonStart, chunkLen));
    try {
      return inspectGltfJson(JSON.parse(jsonText) as Record<string, unknown>, "glb");
    } catch {
      return {
        ok: false,
        format: "glb",
        images: 0,
        materials: 0,
        texturedMaterials: 0,
        whiteUntextured: 0,
        warning: "Could not parse GLB JSON.",
      };
    }
  }

  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json && typeof json === "object" && (json.asset || json.meshes || json.materials)) {
      const report = inspectGltfJson(json, "gltf");
      if (report.images > 0 && report.warning == null) {
        return {
          ...report,
          warning:
            "This is a .gltf (JSON) file. Loose .png/.jpg next to it are not uploaded. Export glTF Binary (.glb) so images are inside one file.",
          ok: false,
        };
      }
      return report;
    }
  } catch {
    /* not JSON */
  }

  return {
    ok: false,
    format: "unknown",
    images: 0,
    materials: 0,
    texturedMaterials: 0,
    whiteUntextured: 0,
    warning: "Not a GLB/GLTF file.",
  };
}

export async function inspectGlbFile(file: File): Promise<GlbTextureReport> {
  const bytes = await file.arrayBuffer();
  return inspectGlbBytes(bytes);
}
