"""
Fix skateboard orientation in cat-2.glb – make the deck lie flat on the ground.

The skateboard meshes are currently standing vertically (tall in Blender Z = Three.js Y).
Rotating each movable EMPTY root by -90° around local X lays them flat.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/fix_skateboard_rotation.py
"""

import bpy
import mathutils
import math
import os

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_PATH  = os.path.join(PROJECT_DIR, 'public', 'cat-2.glb')
OUTPUT_PATH = INPUT_PATH

# ── helpers ────────────────────────────────────────────────────────────────────

def refresh():
    bpy.context.view_layer.update()

def world_bbox(obj):
    refresh()
    verts = [obj.matrix_world @ mathutils.Vector(v) for v in obj.bound_box]
    xs = [v.x for v in verts]; ys = [v.y for v in verts]; zs = [v.z for v in verts]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)

# ── 1. Load ────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
refresh()

print(f"\nLoaded {len(bpy.data.objects)} objects from {INPUT_PATH}")
print("\nAll objects:")
for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    loc = tuple(round(x, 3) for x in obj.location)
    rot_deg = tuple(round(math.degrees(x), 1) for x in obj.rotation_euler)
    print(f"  {obj.name!r:40s} type={obj.type:6s} loc={loc}  rot_deg={rot_deg}")

# ── 2. Find skateboard meshes ──────────────────────────────────────────────────
SBOARD_NAMES = ('Object_4', 'Object_6', 'Object_8', 'Object_10', 'Object_12')
sboard_meshes = [bpy.data.objects[n] for n in SBOARD_NAMES if n in bpy.data.objects]
print(f"\nSkateboard meshes found: {[m.name for m in sboard_meshes]}")

print("\nPre-rotation bboxes:")
for m in sboard_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    zsize = z1 - z0
    print(f"  {m.name:12s}  X=[{x0:.3f},{x1:.3f}]  Y=[{y0:.3f},{y1:.3f}]  Z=[{z0:.3f},{z1:.3f}]  z_height={zsize:.3f}")

# ── 3. Find movable roots ──────────────────────────────────────────────────────
SCENE_ROOTS = {'GLTF_SceneRootNode', 'RootNode', 'Sketchfab_model',
               'Sketchfab_model.001', 'Sketchfab_model.002', 'root'}

def movable_root(obj):
    cur = obj
    while cur.parent and cur.parent.name not in SCENE_ROOTS:
        cur = cur.parent
    return cur

sb_roots = set()
for m in sboard_meshes:
    sb_roots.add(movable_root(m))
print(f"\nSkateboard movable roots: {[r.name for r in sb_roots]}")

# ── 4. Snapshot pre-rotation world positions for roots ─────────────────────────
root_world_pos = {}
for root in sb_roots:
    refresh()
    root_world_pos[root.name] = root.matrix_world.translation.copy()

# ── 5. Rotate -90° around local X to lay flat ─────────────────────────────────
for root in sb_roots:
    before = tuple(round(math.degrees(x), 1) for x in root.rotation_euler)
    root.rotation_euler.x -= math.pi / 2
    refresh()
    after = tuple(round(math.degrees(x), 1) for x in root.rotation_euler)
    print(f"  {root.name!r}: rotation {before} → {after}")

refresh()

# ── 6. Verify Z height dropped ─────────────────────────────────────────────────
print("\nPost-rotation bboxes:")
all_zs = []
for m in sboard_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    zsize = z1 - z0
    all_zs.extend([z0, z1])
    print(f"  {m.name:12s}  X=[{x0:.3f},{x1:.3f}]  Y=[{y0:.3f},{y1:.3f}]  Z=[{z0:.3f},{z1:.3f}]  z_height={zsize:.3f}")

# If the deck is still tall (> 0.3 m), the -X rotation wasn't enough; try -Y instead
deck_z_range = max(all_zs) - min(all_zs)
if deck_z_range > 0.3:
    print(f"\nDeck still tall (z_range={deck_z_range:.3f}) – reversing X rotation and trying Y instead")
    for root in sb_roots:
        root.rotation_euler.x += math.pi / 2   # undo
    refresh()
    for root in sb_roots:
        root.rotation_euler.y -= math.pi / 2   # try Y
    refresh()
    print("Post-Y-rotation bboxes:")
    all_zs = []
    for m in sboard_meshes:
        x0,x1, y0,y1, z0,z1 = world_bbox(m)
        zsize = z1 - z0
        all_zs.extend([z0, z1])
        print(f"  {m.name:12s}  X=[{x0:.3f},{x1:.3f}]  Y=[{y0:.3f},{y1:.3f}]  Z=[{z0:.3f},{z1:.3f}]  z_height={zsize:.3f}")

# ── 7. Lift so bottom sits on Z=0 ─────────────────────────────────────────────
min_z = min(all_zs)
print(f"\nMin Z after rotation: {min_z:.4f}")

if abs(min_z) > 0.001:
    for root in sb_roots:
        refresh()
        rw = root.matrix_world.translation
        dz = -min_z
        if root.parent:
            pw = root.parent.matrix_world
            local_delta = pw.inverted() @ (rw + mathutils.Vector((0, 0, dz))) - pw.inverted() @ rw
        else:
            local_delta = mathutils.Vector((0, 0, dz))
        root.location += local_delta
    refresh()
    print(f"Lifted by dZ={dz:.4f}")

# ── 8. Final bboxes ────────────────────────────────────────────────────────────
print("\nFinal skateboard bboxes:")
for m in sboard_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    print(f"  {m.name:12s}  X=[{x0:.3f},{x1:.3f}]  Y=[{y0:.3f},{y1:.3f}]  Z=[{z0:.3f},{z1:.3f}]")

print("\nAll mesh world positions:")
for obj in bpy.data.objects:
    if obj.type != 'MESH': continue
    x0,x1, y0,y1, z0,z1 = world_bbox(obj)
    mat = obj.data.materials[0].name if obj.data.materials else 'none'
    print(f"  {obj.name!r:30s}  mat={mat!r:24s}  X=[{x0:.2f},{x1:.2f}]  Y=[{y0:.2f},{y1:.2f}]  Z=[{z0:.2f},{z1:.2f}]")

# ── 9. Export ──────────────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_PATH,
    export_format='GLB',
    export_apply=False,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
print(f"\nExported → {OUTPUT_PATH}")
