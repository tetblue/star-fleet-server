# 整座戰艦庫的檢查圖：把機庫的四個檔和各個擺設照 capbay.js 的位置擺好，用設計圖的角度渲染 → out/renders/hall_view.jpg、hall_view_in.jpg
#   先跑 build_hall.py（和各個擺設的 build_*.py），再跑 blender -b --factory-startup --python hall_view.py
import bpy, os, sys
from math import radians, pi
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hgkit

OUT, ARM = hgkit.OUTD, os.path.normpath(os.path.join(hgkit.HERE, '..', 'arm', 'out', 'arm_blender.glb'))
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def load(path, x=0.0, z=0.0, ry=0.0, k=1.0, y=0.0):
    """遊戲座標 (x, y, z)、rotation.y＝ry、縮放 k → Blender（x, −z, y；繞 Z 轉同樣的角度）。"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path if os.path.isabs(path) else os.path.join(OUT, path + '.glb'))
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.parent is None:
            o.matrix_world = Matrix.Translation((x, -z, y)) @ Matrix.Rotation(ry, 4, 'Z') @ Matrix.Scale(k, 4) @ o.matrix_world
        if o.type == 'ARMATURE':                        # 匯入器會把第一段動作掛上去（參數 0 的姿勢）：拿掉，回到靜止姿勢
            o.animation_data_clear()
            for pb in o.pose.bones:
                pb.matrix_basis = Matrix.Identity(4)
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            o.hide_render = True


for part in ('整備庫_42_戰艦庫_殼', '整備庫_43_戰艦庫_內部', '整備庫_44_戰艦庫_地板', '整備庫_45_戰艦庫_艙蓋'):
    load(part)
# 擺設：照 capbay.js 的 CB_PROP_SET（名稱, x, z, 轉向, 這裡的縮放 ÷ 模型建的時候的縮放, 離地）
for name, x, z, ry, k, y in (
        (ARM, -12.5, -16, pi / 2, 1.0, 0.6), (ARM, 12.5, -16, -pi / 2, 1.0, 0.6), (ARM, -12.5, 2, pi / 2, 1.0, 0.6), (ARM, 12.5, 2, -pi / 2, 1.0, 0.6),
        ('整備庫_35_氣瓶組', -16, 11, 0, 70 / 75, 0.6), ('整備庫_34_加工站', -14.5, -25, 0, 60 / 70, 0.6),
        ('整備庫_36_管制塔', 33, -14, -pi / 2, 1.0, 0.0), ('整備庫_38_雙聯儲槽', 31, 9, 0, 1.0, 0.0), ('整備庫_37_物料艙', -32, -2, pi / 2, 1.0, 0.0), ('整備庫_39_圓頂儲槽', -31, -20, 0, 1.0, 0.0),
        ('整備庫_29_雙管砲塔', 6, 26, 0.5, 65 / 55, 0.6), ('整備庫_30_雙推進器艙', 15, 27, -0.4, 65 / 60, 0.6),
        (ARM, -16, 25, 0.6, 55 / 95, 0.6), (ARM, 21, 20, -1.2, 55 / 95, 0.6), (ARM, -6, 29, 0.3 - pi / 2, 0.35, 0.6),
        ('整備庫_41_托架', 0, -16, 0, 1.0, 0.6), ('整備庫_41_托架', 0, -4, 0, 1.0, 0.6), ('整備庫_41_托架', 0, 8, 0, 1.0, 0.6)):
    load(name, x, z, ry, k, y)
fm = bpy.data.meshes.new('Floor')
fm.from_pydata([(-300, -300, -0.31), (300, -300, -0.31), (300, 300, -0.31), (-300, 300, -0.31)], [], [(0, 1, 2, 3)])
fl = bpy.data.objects.new('Floor', fm)
scn.collection.objects.link(fl)
m = bpy.data.materials.new('F')
m.use_nodes = True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
fm.materials.append(m)
w = bpy.data.worlds.new('W')
scn.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy, sun.data.angle = 2.6, radians(12)
sun.rotation_euler = (radians(48), 0, radians(40))
scn.collection.objects.link(sun)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
scn.collection.objects.link(cam)
scn.camera = cam
hgkit.use_gpu()
scn.cycles.samples = 64
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = 2000, 1116
scn.render.image_settings.file_format = 'JPEG'
# 設計圖的角度：從正面偏右的高處看（正面開口朝右下、管制塔在右、物料艙在左）
for name, eye, look, ortho, lens in (('hall_view', (62, -140, 92), (2, 2, 6), 112, 50), ('hall_view_in', (20, -62, 16), (0, 14, 8), 0, 30)):
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    cam.data.ortho_scale = ortho or 1
    cam.data.lens = lens
    cam.location = eye
    cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = os.path.join(OUT, 'renders', name + '.jpg')
    bpy.ops.render.render(write_still=True)
    print('RENDER', name)
