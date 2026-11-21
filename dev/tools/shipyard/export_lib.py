# 戰艦組裝素材：把一艘船的 component_library.blend＋detail_library.blend 匯出成一個 GLB（不含貼圖，材質名稱保留，
# 編輯器依名稱換成所選塗裝的材質）。每個零件／細節是一個網格，放在原點、不旋轉。
#   blender -b --factory-startup --python export_lib.py -- <部件資料夾> <輸出.glb>
import bpy, sys, os
argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
names = []
for lib, coll in (("component_library.blend", "component_library"), ("detail_library.blend", "detail_library")):
    f = os.path.join(src, lib)
    if not os.path.exists(f): continue
    with bpy.data.libraries.load(f, link=False) as (src_d, dst_d):
        dst_d.objects = [n for n in src_d.objects if n.startswith(("component_", "detail_"))]
    for ob in dst_d.objects:
        if ob is None or ob.type != 'MESH': continue
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = None; ob.location = (0, 0, 0); ob.rotation_euler = (0, 0, 0); ob.scale = (1, 1, 1)
        ob.hide_render = False; ob.hide_viewport = False; ob.hide_set(False)
        ob.name = ob.data.name if ob.data.name.startswith(("component_", "detail_")) else ob.name
        names.append(ob.name)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True,
                          export_image_format='NONE', export_yup=True)
print("EXPORTED", len(names), out)
