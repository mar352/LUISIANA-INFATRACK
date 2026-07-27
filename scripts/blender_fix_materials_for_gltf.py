"""
Blender script — bake Viewport Display colors into Principled BSDF
so glTF/GLB export keeps the colors you see in the viewport.

Why: SVG imports and some materials only store color in Viewport Display.
glTF export ignores that, so INFA-TRACK shows white / flat / "kulang" colors.

Usage in Blender:
  1. Open your .blend
  2. Scripting workspace → Open this file → Run Script
  3. File → External Data → Pack Resources (if you use image textures)
  4. File → Export → glTF 2.0 (.glb)
     - Format: glTF Binary (.glb)
     - Include → Materials: Export
     - Geometry → UVs, Normals on
  5. Re-upload the new .glb to INFA-TRACK
"""

import bpy


def ensure_principled(mat: bpy.types.Material) -> bpy.types.ShaderNodeBsdfPrincipled | None:
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

    # Ensure Principled → Material Output is linked
    if not any(link.to_node == output and link.to_socket.name == "Surface" for link in links):
        links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    return principled


def has_base_color_texture(principled: bpy.types.ShaderNodeBsdfPrincipled) -> bool:
    sock = principled.inputs.get("Base Color")
    return bool(sock and sock.is_linked)


def fix_material(mat: bpy.types.Material) -> str:
    principled = ensure_principled(mat)
    if principled is None:
        return "skip"

    # Keep existing image textures — only fill solid Base Color when missing.
    if has_base_color_texture(principled):
        return "textured"

    base = principled.inputs.get("Base Color")
    if base is None:
        return "skip"

    # Viewport Display color is what you see on SVG / simple materials.
    r, g, b, a = mat.diffuse_color
    current = tuple(base.default_value)
    # Blender default white-ish — replace with viewport color
    is_default_white = (
        current[0] > 0.95 and current[1] > 0.95 and current[2] > 0.95
    )
    viewport_useful = not (r > 0.95 and g > 0.95 and b > 0.95)

    if is_default_white and viewport_useful:
        base.default_value = (r, g, b, a)
        return "fixed"

    if is_default_white and not viewport_useful:
        # Try parsing hex from material name: "#RRGGBB" or "#RRGGBBAA"
        name = mat.name.strip()
        if name.startswith("#") and len(name) >= 7:
            hx = name[1:7]
            try:
                rr = int(hx[0:2], 16) / 255.0
                gg = int(hx[2:4], 16) / 255.0
                bb = int(hx[4:6], 16) / 255.0
                # Blender colors are often stored linear-ish; sRGB hex → approx linear
                def srgb_to_linear(c: float) -> float:
                    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

                base.default_value = (
                    srgb_to_linear(rr),
                    srgb_to_linear(gg),
                    srgb_to_linear(bb),
                    1.0,
                )
                return "fixed-hex"
            except ValueError:
                pass
        return "white"

    return "ok"


fixed = textured = white = skipped = ok = 0
for mat in bpy.data.materials:
    if mat is None or mat.name.startswith("Dots Stroke"):
        continue
    result = fix_material(mat)
    if result == "fixed" or result == "fixed-hex":
        fixed += 1
    elif result == "textured":
        textured += 1
    elif result == "white":
        white += 1
    elif result == "ok":
        ok += 1
    else:
        skipped += 1

print(
    f"[INFA-TRACK] Materials — fixed:{fixed} textured:{textured} "
    f"already-ok:{ok} still-white:{white} skipped:{skipped}"
)
print("[INFA-TRACK] Next: Pack Resources → Export glTF Binary (.glb) → re-upload")
