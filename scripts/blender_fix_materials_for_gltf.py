"""
Blender script — make materials survive glTF/GLB export for Cesium (INFA-TRACK).

Why models go white on the globe:
  Blender's viewport can show Texture Paint, Viewport Display, Emission, Mix
  shaders, or unpacked images. The glTF exporter only writes Principled BSDF
  Base Color (solid or Image Texture) plus packed image bytes. Everything else
  becomes baseColorFactor [1,1,1] with no map — Cesium draws a white mesh.

Usage in Blender:
  1. Open the .blend (or File → Import → glTF 2.0 the existing .glb)
  2. Scripting workspace → Open this file → Run Script
  3. File → Export → glTF 2.0 (.glb)
       Format: glTF Binary (.glb)
       Include → Limit to: (leave unchecked — export the whole scene)
       Data → Mesh: UVs, Normals ON
       Data → Material: Export
       Data → Images: Automatic  (NOT WebP — Cesium is happiest with JPEG/PNG)
       Compression: off until colors look right
  4. Confirm in https://gltf.report — if it is white there, Cesium will be white
  5. Re-upload the new .glb to INFA-TRACK
"""

from __future__ import annotations

import bpy


def _is_white(rgb) -> bool:
    return rgb[0] > 0.95 and rgb[1] > 0.95 and rgb[2] > 0.95


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def pack_images() -> tuple[int, int]:
    packed = missing = 0
    for img in bpy.data.images:
        if img is None or img.name == "Render Result" or img.name == "Viewer Node":
            continue
        if img.source == "GENERATED" and not img.pixels:
            continue
        if img.packed_file:
            packed += 1
            continue
        try:
            img.pack()
            packed += 1
        except Exception as err:
            missing += 1
            print(f"[INFA-TRACK] Could not pack image '{img.name}': {err}")
    return packed, missing


def ensure_principled(mat: bpy.types.Material):
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    output = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None)

    if principled is None:
        principled = nodes.new("ShaderNodeBsdfPrincipled")
        principled.location = (0, 0)

    if output is None:
        output = nodes.new("ShaderNodeOutputMaterial")
        output.location = (300, 0)

    surface = output.inputs.get("Surface")
    if surface and not surface.is_linked:
        links.new(principled.outputs["BSDF"], surface)
    elif surface and surface.is_linked:
        from_node = surface.links[0].from_node
        if from_node != principled and from_node.type in {
            "BSDF_DIFFUSE",
            "BSDF_GLOSSY",
            "EMISSION",
            "BSDF_TRANSPARENT",
            "MIX_SHADER",
        }:
            # Steal a connected image from the old graph, then force Principled.
            _steal_image_into_principled(mat, principled, from_node)
            links.new(principled.outputs["BSDF"], surface)

    return principled


def _steal_image_into_principled(mat, principled, from_node) -> None:
    nodes = mat.node_tree.nodes
    visited = set()
    stack = [from_node]
    while stack:
        n = stack.pop()
        if n.name in visited:
            continue
        visited.add(n.name)
        if n.type == "TEX_IMAGE" and n.image:
            base = principled.inputs.get("Base Color")
            if base and not base.is_linked:
                mat.node_tree.links.new(n.outputs["Color"], base)
            return
        for inp in n.inputs:
            if inp.is_linked:
                stack.append(inp.links[0].from_node)


def pick_albedo_image_node(nodes):
    imgs = [n for n in nodes if n.type == "TEX_IMAGE" and n.image]
    if not imgs:
        return None

    def score(n) -> int:
        blob = f"{n.image.name} {n.name}".lower()
        cs = ""
        try:
            cs = n.image.colorspace_settings.name
        except Exception:
            pass
        if cs in {"Non-Color", "Non-Colour Data", "Linear"}:
            if any(k in blob for k in ("nor", "rough", "metal", "ao", "orm")):
                return -1
        if any(k in blob for k in ("diff", "albedo", "color", "colour", "base", "col", "tex")):
            return 3
        return 1

    imgs.sort(key=score, reverse=True)
    return imgs[0] if score(imgs[0]) >= 0 else imgs[0]


def hex_from_name(name: str):
    n = name.strip()
    if n.startswith("#") and len(n) >= 7:
        hx = n[1:7]
        try:
            rr = int(hx[0:2], 16) / 255.0
            gg = int(hx[2:4], 16) / 255.0
            bb = int(hx[4:6], 16) / 255.0
            return (
                _srgb_to_linear(rr),
                _srgb_to_linear(gg),
                _srgb_to_linear(bb),
                1.0,
            )
        except ValueError:
            return None
    return None


def fix_material(mat: bpy.types.Material) -> str:
    principled = ensure_principled(mat)
    if principled is None:
        return "skip"

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    base = principled.inputs.get("Base Color")
    if base is None:
        return "skip"

    if base.is_linked:
        result = "textured"
    else:
        img_node = pick_albedo_image_node(nodes)
        if img_node is not None:
            links.new(img_node.outputs["Color"], base)
            result = "relinked"
        else:
            # Emission-only graphs look textured in the viewport.
            emit = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
            if emit is not None and emit.is_linked:
                src = emit.links[0].from_socket
                links.new(src, base)
                result = "relinked-emission"
            else:
                r, g, b, a = mat.diffuse_color
                current = tuple(base.default_value)
                viewport_useful = not _is_white((r, g, b))
                hex_col = hex_from_name(mat.name)

                if _is_white(current) and viewport_useful:
                    base.default_value = (r, g, b, a)
                    result = "viewport-color"
                elif _is_white(current) and hex_col:
                    base.default_value = hex_col
                    result = "hex-color"
                elif _is_white(current):
                    result = "white"
                else:
                    result = "solid-color"

    # White chrome (metallic 1, no map) reads as colorless in Cesium.
    metallic = principled.inputs.get("Metallic")
    roughness = principled.inputs.get("Roughness")
    has_tex = base.is_linked
    if metallic is not None and not metallic.is_linked:
        if metallic.default_value >= 0.8 and not has_tex and _is_white(tuple(base.default_value)):
            metallic.default_value = 0.0
            if roughness is not None and not roughness.is_linked:
                roughness.default_value = max(float(roughness.default_value), 0.6)
            if result == "white":
                result = "dechrome-white"
            else:
                result = result + "+dechrome"

    return result


def warn_missing_uvs() -> int:
    warned = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data is None:
            continue
        mesh = obj.data
        if mesh.uv_layers:
            continue
        uses_tex = False
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            if any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes):
                uses_tex = True
                break
        if uses_tex:
            warned += 1
            print(
                f"[INFA-TRACK] '{obj.name}' has image textures but no UV map — "
                "Cesium cannot place the texture (mesh will look white). "
                "In Edit Mode: UV → Smart UV Project, then re-run this script."
            )
    return warned


packed, pack_fail = pack_images()

fixed = {
    "textured": 0,
    "relinked": 0,
    "relinked-emission": 0,
    "viewport-color": 0,
    "hex-color": 0,
    "solid-color": 0,
    "white": 0,
    "dechrome-white": 0,
    "skip": 0,
}
other = 0

for mat in bpy.data.materials:
    if mat is None or mat.name.startswith("Dots Stroke"):
        continue
    result = fix_material(mat)
    key = result.split("+")[0]
    if key in fixed:
        fixed[key] += 1
        if "+dechrome" in result:
            fixed["dechrome-white"] += 1
    else:
        other += 1

uv_warn = warn_missing_uvs()

print(
    "[INFA-TRACK] Materials — "
    f"already-textured:{fixed['textured']} "
    f"relinked-image:{fixed['relinked'] + fixed['relinked-emission']} "
    f"viewport/hex/solid:{fixed['viewport-color'] + fixed['hex-color'] + fixed['solid-color']} "
    f"still-white:{fixed['white']} "
    f"dechromed:{fixed['dechrome-white']} "
    f"skipped:{fixed['skip']}"
)
print(f"[INFA-TRACK] Images packed:{packed} pack-failed:{pack_fail} meshes-missing-UVs:{uv_warn}")
print("[INFA-TRACK] Next: Export glTF Binary (.glb), Images=Automatic, then check https://gltf.report")
