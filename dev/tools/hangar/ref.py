# 舊模型的參考圖：blender -b --factory-startup --python ref.py -- 名稱 縮放 [名稱 縮放 …] → out/renders/ref_名稱.jpg（斜角＋側面）
import bpy, os, sys
import numpy as np
from math import radians
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
A = sys.argv[sys.argv.index('--') + 1:]
for name, sc in zip(A[0::2], A[1::2]):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.normpath(os.path.join(HERE, '..', '..', '..', 'models', '機庫', '整備庫_%s.glb' % name)))
    obs = [o for o in scn.objects if o.type == 'MESH']
    for o in scn.objects:
        if o.parent is None:
            o.matrix_world = Matrix.Scale(float(sc), 4) @ o.matrix_world
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    lo, hi = Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    print('REF', name, 'size x/y(depth)/z(up)', [round(v, 2) for v in hi - lo])
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (radians(50), 0, radians(-35)); scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scn.collection.objects.link(cam); scn.camera = cam
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x, scn.render.resolution_y = 700, 560
    ctr, R, row = (lo + hi) / 2, max(hi - lo) * 1.9, []
    for d in (Vector((0.72, -0.6, 0.42)), Vector((1, -0.05, 0.12)), Vector((0.05, -1, 0.12))):
        cam.location = ctr + d.normalized() * R
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = os.path.join(HERE, 'out', 'renders', '_t.png'); bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(scn.render.filepath); px = np.empty(700 * 560 * 4, dtype=np.float32); im.pixels.foreach_get(px); row.append(px.reshape(560, 700, 4))
    sh = np.hstack(row); out = bpy.data.images.new('s', sh.shape[1], sh.shape[0]); out.pixels.foreach_set(sh.ravel())
    out.filepath_raw = os.path.join(HERE, 'out', 'renders', 'ref_%s.jpg' % name); out.file_format = 'JPEG'; out.save()
