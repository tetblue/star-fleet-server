# 新舊並排圖：blender -b --factory-startup --python view.py -- 新檔名 舊檔名 [新檔名 舊檔名 …]（models/建築/ 裡的檔名，不含 .glb）
# → out/renders/cmp_新檔名.jpg：上排舊模型、下排新模型，各四個角度（斜角、正面＝從 +z 看、側面＝從 +x 看、俯視）。舊模型縮放到跟新的一樣高。
import bpy, os, sys
import numpy as np
from math import radians
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
A = sys.argv[sys.argv.index('--') + 1:]
DIR = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'models', '建築'))
W, H = 640, 640


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(DIR, name + '.glb'))
    obs = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    return obs


def bounds(obs):
    pts = [o.matrix_world @ Vector(c) for o in obs if o.type == 'MESH' for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


for new, old in zip(A[0::2], A[1::2]):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    N = load(new)
    lo, hi = bounds(N)
    O = load(old)
    lo2, hi2 = bounds(O)
    k = (hi.z - lo.z) / (hi2.z - lo2.z)
    for o in O:
        if o.parent is None:
            o.matrix_world = Matrix.Translation((0, 0, lo.z - lo2.z * k)) @ Matrix.Scale(k, 4) @ o.matrix_world
    print('VIEW', new, 'size', [round(v, 2) for v in hi - lo], 'old scaled', [round(v * k, 2) for v in hi2 - lo2], 'tris', sum(len(o.data.polygons) for o in N if o.type == 'MESH'))
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (radians(50), 0, radians(-35)); scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scn.collection.objects.link(cam); scn.camera = cam
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x, scn.render.resolution_y = W, H
    ctr, R, rows = (lo + hi) / 2, max(hi - lo) * 1.75, []
    for show, hide in ((O, N), (N, O)):
        for o in show:
            o.hide_render = False
        for o in hide:
            o.hide_render = True
        row = []
        for d in (Vector((0.72, -0.6, 0.42)), Vector((0.02, -1, 0.1)), Vector((1, -0.02, 0.1)), Vector((0.02, -0.05, 1))):
            cam.location = ctr + d.normalized() * R
            cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
            scn.render.filepath = os.path.join(HERE, 'out', 'renders', '_t.png'); bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(scn.render.filepath); px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px); row.append(px.reshape(H, W, 4)); bpy.data.images.remove(im)
        rows.append(np.hstack(row))
    sh = np.vstack(list(reversed(rows))); out = bpy.data.images.new('s', sh.shape[1], sh.shape[0]); out.pixels.foreach_set(sh.ravel())
    out.filepath_raw = os.path.join(HERE, 'out', 'renders', 'cmp_%s.jpg' % new); out.file_format = 'JPEG'; out.save()
