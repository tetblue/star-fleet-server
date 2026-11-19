# 舊建築模型的參考圖：blender -b --factory-startup --python ref.py -- 檔名（不含 .glb）… → out/renders/ref_檔名.jpg（斜角、正面、側面、俯視）
# 也印出外框尺寸（模型座標）與三角面數，新模型照這個比例做
import bpy, os, sys
import numpy as np
from math import radians
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
A = sys.argv[sys.argv.index('--') + 1:]
DIR = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'models', '建築'))
for name in A:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(DIR, name + '.glb'))
    obs = [o for o in scn.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    lo, hi = Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    print('REF', name, 'x', round(hi[0] - lo[0], 3), 'depth(game z)', round(hi[1] - lo[1], 3), 'up', round(hi[2] - lo[2], 3), 'lo', [round(v, 3) for v in lo], 'tris', sum(len(o.data.loop_triangles) or len(o.data.polygons) for o in obs), 'meshes', len(obs))
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (radians(50), 0, radians(-35)); scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scn.collection.objects.link(cam); scn.camera = cam
    scn.render.engine = 'BLENDER_EEVEE'
    W, H = 640, 640
    scn.render.resolution_x, scn.render.resolution_y = W, H
    ctr, R, row = (lo + hi) / 2, max(hi - lo) * 1.75, []
    for d in (Vector((0.72, -0.6, 0.42)), Vector((0.02, -1, 0.1)), Vector((1, -0.02, 0.1)), Vector((0.02, -0.05, 1))):
        cam.location = ctr + d.normalized() * R
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = os.path.join(HERE, 'out', 'renders', '_t.png'); bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(scn.render.filepath); px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px); row.append(px.reshape(H, W, 4))
    sh = np.hstack(row); out = bpy.data.images.new('s', sh.shape[1], sh.shape[0]); out.pixels.foreach_set(sh.ravel())
    out.filepath_raw = os.path.join(HERE, 'out', 'renders', 'ref_%s.jpg' % name); out.file_format = 'JPEG'; out.save()
