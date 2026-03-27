"""
Cleans up cat-2.glb:
  1. Remove Camera / Light objects
  2. Centre the cat on the TV and place it in front (Blender Y ≈ tv_y - 1.5)
  3. Place the skateboard next to the cat on the floor
  4. Ensure cat and skateboard are on the ground (Blender Z ≥ 0)

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/fix_cat2_glb.py
"""

import bpy
import mathutils
import os

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_PATH  = os.path.join(PROJECT_DIR, 'public', 'cat-2.glb')
OUTPUT_PATH = INPUT_PATH

# ── helpers ────────────────────────────────────────────────────────────────────

def refresh():
    bpy.context.view_layer.update()

def world_bbox(obj):
    """Return (x0,x1, y0,y1, z0,z1) in true Blender world space."""
    refresh()
    verts = [obj.matrix_world @ mathutils.Vector(v) for v in obj.bound_box]
    xs = [v.x for v in verts]; ys = [v.y for v in verts]; zs = [v.z for v in verts]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)

def all_mesh_descendants(root):
    result = []
    for child in root.children_recursive:
        if child.type == 'MESH':
            result.append(child)
    return result

# ── 1. Fresh scene & import ────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
refresh()
print(f"\nLoaded {len(bpy.data.objects)} objects from {INPUT_PATH}")

# ── 2. Remove cameras / lights ────────────────────────────────────────────────
REMOVE_NAMES = {'Plane', 'wall', 'wall.001'}
REMOVE_TYPES = {'CAMERA', 'LIGHT'}
to_remove = [o for o in bpy.data.objects
             if o.name in REMOVE_NAMES or o.type in REMOVE_TYPES]
print(f"Removing {len(to_remove)}: {[o.name for o in to_remove]}")
bpy.ops.object.select_all(action='DESELECT')
for o in to_remove:
    o.select_set(True)
bpy.ops.object.delete()
refresh()

# ── 3. Locate key objects ──────────────────────────────────────────────────────
tv_screen = bpy.data.objects.get('defaultMaterial.003')   # TVScreen mesh

# Cat: find the fbx parent (the only EMPTY named with .fbx)
fbx_empty = next((o for o in bpy.data.objects
                  if o.type == 'EMPTY' and '.fbx' in o.name), None)

# Skateboard: the GLTF_SceneRootNode holds all the Object_* parents
sboard_meshes = [bpy.data.objects[n]
                 for n in ('Object_4','Object_6','Object_8','Object_10','Object_12')
                 if n in bpy.data.objects]

assert tv_screen, "TVScreen mesh not found"
assert fbx_empty, "Cat fbx EMPTY not found"
print(f"\nTVScreen: {tv_screen.name}")
print(f"Cat root:  {fbx_empty.name}  world_loc={tuple(round(x,3) for x in fbx_empty.matrix_world.translation)}")

# ── 4. TV screen world centre ──────────────────────────────────────────────────
tx0,tx1, ty0,ty1, tz0,tz1 = world_bbox(tv_screen)
tv_cx = (tx0+tx1)/2
tv_cy = (ty0+ty1)/2
tv_cz = (tz0+tz1)/2
print(f"\nTVScreen world centre: X={tv_cx:.3f}  Y={tv_cy:.3f}  Z={tv_cz:.3f}")

# ── 5. Move the cat ────────────────────────────────────────────────────────────
# We move the fbx EMPTY (top-level parent of cat hierarchy)
# Target world position for cat bbox centre:
#   X = tv_cx (aligned horizontally with TV)
#   Y = tv_cy - 1.5  (1.5 m in front of TV screen)
#   Z = keep existing Z (floor adjust below)

# Current cat world bbox
cat_meshes = all_mesh_descendants(fbx_empty)
if not cat_meshes:
    cat_meshes = [fbx_empty]

cat_xs, cat_ys, cat_zs = [], [], []
for m in cat_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    cat_xs += [x0,x1]; cat_ys += [y0,y1]; cat_zs += [z0,z1]

cat_cx_cur = (min(cat_xs)+max(cat_xs))/2
cat_cy_cur = (min(cat_ys)+max(cat_ys))/2
cat_cz_floor = min(cat_zs)          # bottom of cat (should be 0)
print(f"\nCat current world centre: X={cat_cx_cur:.3f}  Y={cat_cy_cur:.3f}  Z_floor={cat_cz_floor:.3f}")

target_cat_cx = tv_cx                # align X with TV
target_cat_cy = tv_cy - 1.5         # 1.5 m in front
target_cat_cz = cat_cz_floor        # lift floor to Z=0, apply to Z offset

fbx_world = fbx_empty.matrix_world.translation
delta_x = target_cat_cx - cat_cx_cur
delta_y = target_cat_cy - cat_cy_cur
delta_z = -cat_cz_floor              # bring feet to Z=0

# Convert world delta to local delta (parent of fbx_empty)
if fbx_empty.parent:
    parent_world = fbx_empty.parent.matrix_world
    local_delta = parent_world.inverted() @ (fbx_world + mathutils.Vector((delta_x, delta_y, delta_z))) - \
                  parent_world.inverted() @ fbx_world
else:
    local_delta = mathutils.Vector((delta_x, delta_y, delta_z))

fbx_empty.location += local_delta
refresh()
print(f"Cat moved by world delta: ({delta_x:.3f}, {delta_y:.3f}, {delta_z:.3f})")

# Verify
cat_xs2, cat_ys2, cat_zs2 = [], [], []
for m in cat_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    cat_xs2 += [x0,x1]; cat_ys2 += [y0,y1]; cat_zs2 += [z0,z1]
print(f"Cat new world centre: X={(min(cat_xs2)+max(cat_xs2))/2:.3f}  Y={(min(cat_ys2)+max(cat_ys2))/2:.3f}  Z_floor={min(cat_zs2):.3f}")

# ── 6. Move the skateboard ─────────────────────────────────────────────────────
# Find their movable root (highest EMPTY that is NOT the GLTF scene root)
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

# Collective world bbox of all skateboard meshes
sb_xs, sb_ys, sb_zs = [], [], []
for m in sboard_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    sb_xs += [x0,x1]; sb_ys += [y0,y1]; sb_zs += [z0,z1]

sb_cx_cur = (min(sb_xs)+max(sb_xs))/2
sb_cy_cur = (min(sb_ys)+max(sb_ys))/2
sb_cz_floor = min(sb_zs)
print(f"\nSkateboard current: X_ctr={sb_cx_cur:.3f}  Y_ctr={sb_cy_cur:.3f}  Z_floor={sb_cz_floor:.3f}")

# Target: right of cat by 0.8m, same Y as cat, floor at Z=0
target_sb_cx = tv_cx + 0.8
target_sb_cy = tv_cy - 1.5
target_sb_dz = -sb_cz_floor

for sr in sb_roots:
    sr_world = sr.matrix_world.translation
    dx = target_sb_cx - sb_cx_cur
    dy = target_sb_cy - sb_cy_cur
    dz = target_sb_dz
    if sr.parent:
        pw = sr.parent.matrix_world
        local_d = pw.inverted() @ (sr_world + mathutils.Vector((dx, dy, dz))) - pw.inverted() @ sr_world
    else:
        local_d = mathutils.Vector((dx, dy, dz))
    sr.location += local_d
refresh()

sb_xs2, sb_ys2, sb_zs2 = [], [], []
for m in sboard_meshes:
    x0,x1, y0,y1, z0,z1 = world_bbox(m)
    sb_xs2 += [x0,x1]; sb_ys2 += [y0,y1]; sb_zs2 += [z0,z1]
print(f"Skateboard new:     X_ctr={(min(sb_xs2)+max(sb_xs2))/2:.3f}  Y_ctr={(min(sb_ys2)+max(sb_ys2))/2:.3f}  Z_floor={min(sb_zs2):.3f}")

# ── 7. Final layout ────────────────────────────────────────────────────────────
print("\nFinal mesh world positions:")
for obj in bpy.data.objects:
    if obj.type != 'MESH': continue
    x0,x1, y0,y1, z0,z1 = world_bbox(obj)
    mat = obj.data.materials[0].name if obj.data.materials else 'none'
    print(f"  {obj.name!r}  mat={mat!r}  X=[{x0:.2f},{x1:.2f}]  Y=[{y0:.2f},{y1:.2f}]  Z=[{z0:.2f},{z1:.2f}]")

# ── 8. Export ──────────────────────────────────────────────────────────────────
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_PATH,
    export_format='GLB',
    export_apply=False,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
print(f"\nExported → {OUTPUT_PATH}")
