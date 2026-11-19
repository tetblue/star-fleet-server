# 第五階段的樣本圖：三段牆板接在一起，前面放兩座托架（一低一高）→ out/renders/hall_sample.jpg、hall_sample_close.jpg
#   先跑 build_wall.py、build_cradle.py，再跑 blender -b --factory-startup --python sample_hall.py
import bpy, os, sys
from math import radians
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hgkit

OUT = hgkit.OUTD
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def load(name, loc, frame=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm and frame is not None:                       # 用參數動作擺姿勢：停在那一格，把姿勢記下來，再把動作拿掉
        act = next(a for a in bpy.data.actions if a.name.startswith('height_param'))
        arm.animation_data_create()
        arm.animation_data.action = act
        try:
            arm.animation_data.action_slot = act.slots[0]
        except Exception as e:
            print('slot', e)
        scn.frame_set(frame)
        bpy.context.view_layer.update()
        keep = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis = keep[pb.name]
    for o in new:
        if o.parent is None:
            o.matrix_world = Matrix.Translation(loc) @ o.matrix_world
        if o.type == 'MESH' and not o.vertex_groups and o.name.startswith('Icosphere'):
            o.hide_render = True


for i in range(3):                                      # 牆沿 x 接三段；遊戲的 +z（牆的裡面）＝ Blender 的 −y
    load('整備庫_40_牆段22', Vector((i * 8.0 - 12.0, 0, 0)))
scn.render.fps = 24
load('整備庫_41_托架', Vector((-5.0, -7.0, 0)), 3)
load('整備庫_41_托架', Vector((4.0, -7.0, 0)), 17)
fm = bpy.data.meshes.new('Floor')
fm.from_pydata([(-80, -80, 0), (80, -80, 0), (80, 80, 0), (-80, 80, 0)], [], [(0, 1, 2, 3)])
fl = bpy.data.objects.new('Floor', fm)
scn.collection.objects.link(fl)
m = bpy.data.materials.new('F')
m.use_nodes = True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.07, 0.08, 0.095, 1)
fm.materials.append(m)
w = bpy.data.worlds.new('W')
scn.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy, sun.data.angle = 3.0, radians(10)
sun.rotation_euler = (radians(55), 0, radians(25))
scn.collection.objects.link(sun)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
scn.collection.objects.link(cam)
scn.camera = cam
hgkit.use_gpu()
scn.cycles.samples = 64
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = 1600, 900
scn.render.image_settings.file_format = 'JPEG'
for name, eye, look, lens in (('hall_sample', (16, -34, 12), (0, 0, 9), 35), ('hall_sample_close', (10, -17, 5), (0, -6, 2.4), 50)):
    cam.data.lens = lens
    cam.location = eye
    cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = os.path.join(OUT, 'renders', name + '.jpg')
    bpy.ops.render.render(write_still=True)
    print('RENDER', name)
