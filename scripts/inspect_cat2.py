import bpy, mathutils, math
P = '/Users/mattgreenberg/dev/demos/skate-cat/public/cat-2.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=P)
bpy.context.view_layer.update()

def world_bbox(obj):
    bpy.context.view_layer.update()
    verts = [obj.matrix_world @ mathutils.Vector(v) for v in obj.bound_box]
    xs=[v.x for v in verts]; ys=[v.y for v in verts]; zs=[v.z for v in verts]
    return min(xs),max(xs), min(ys),max(ys), min(zs),max(zs)

def print_tree(obj, depth=0):
    indent = '  ' * depth
    rot = tuple(round(math.degrees(x),1) for x in obj.rotation_euler)
    extra = ''
    if obj.type == 'MESH':
        x0,x1,y0,y1,z0,z1 = world_bbox(obj)
        extra = f'  BBOX Z=[{z0:.3f},{z1:.3f}] X=[{x0:.3f},{x1:.3f}] Y=[{y0:.3f},{y1:.3f}]'
    parent_name = obj.parent.name if obj.parent else 'None'
    print(f"{indent}{obj.name!r:40s} {obj.type:6s} parent={parent_name!r:30s} rot_deg={rot}{extra}")

print(f"\n=== Hierarchy ({len(bpy.data.objects)} objects) ===")
visited = set()
def recurse(obj, depth=0):
    if obj.name in visited: return
    visited.add(obj.name)
    print_tree(obj, depth)
    for c in obj.children:
        recurse(c, depth+1)

roots = [o for o in bpy.data.objects if o.parent is None]
for r in roots:
    recurse(r)
