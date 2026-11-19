# 單獨驗證匯出的 GLB：先直接讀檔頭（不靠 Blender 的匯入器）數裡面有什麼，再匯入空場景，數骨頭、動作、三角面，
# 用匯入後的東西渲染一張（看的是「一般 GLB 檢視器會看到的樣子」）。
#   blender --background --factory-startup --python verify_glb.py
import bpy, os, json, struct
from math import radians
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.normpath(os.path.join(HERE, '..', 'out'))
GLB = os.path.join(OUTD, 'arm_blender.glb')
with open(GLB, 'rb') as fh:
    fh.read(12)
    ln, _ = struct.unpack('<II', fh.read(8))
    g = json.loads(fh.read(ln))
names = [n.get('name') for n in g['nodes']]
R = dict(bytes=os.path.getsize(GLB), meshes=len(g['meshes']), primitives=len(g['meshes'][0]['primitives']), joints=len(g['skins'][0]['joints']),
         images=[i.get('mimeType') for i in g.get('images', [])],
         materials=[dict(name=m['name'], base='baseColorTexture' in m.get('pbrMetallicRoughness', {}), orm='metallicRoughnessTexture' in m.get('pbrMetallicRoughness', {}),
                         normal='normalTexture' in m, emissive=m.get('emissiveFactor')) for m in g['materials']],
         animations=[dict(name=a['name'], bones=sorted({names[c['target']['node']] for c in a['channels']}),
                          seconds=[g['accessors'][a['samplers'][0]['input']]['min'][0], g['accessors'][a['samplers'][0]['input']]['max'][0]]) for a in g['animations']])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scn = bpy.context.scene
arm = next(o for o in scn.objects if o.type == 'ARMATURE')
meshes = [o for o in scn.objects if o.type == 'MESH' and o.vertex_groups]      # 匯入器會多放一顆小球當骨頭的顯示形狀，不算
R['imported'] = dict(bones=len(arm.data.bones), meshes=len(meshes), tris=sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes),
                     actions=sorted(a.name for a in bpy.data.actions), size=[round(max((o.matrix_world @ Vector(c))[i] for o in meshes for c in o.bound_box) -
                                                                                min((o.matrix_world @ Vector(c))[i] for o in meshes for c in o.bound_box), 2) for i in range(3)])
info = json.load(open(os.path.join(OUTD, 'arm_blender_info.json'), encoding='utf-8'))
want = {j['clip']: sorted(j['bones']) for j in info['joints']}
R['pass'] = (R['imported']['bones'] == len(info['bones']) and R['imported']['tris'] == info['tris'] and {a['name']: a['bones'] for a in R['animations']} == want
             and all(a['seconds'] == [0.0, 1.0] for a in R['animations']))
json.dump(R, open(os.path.join(OUTD, 'verify_blender_import.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('VERIFY', json.dumps(R, ensure_ascii=False))
w = bpy.data.worlds.new('World')
scn.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 3.0
sun.rotation_euler = (radians(50), 0, radians(-35))
scn.collection.objects.link(sun)
cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
scn.collection.objects.link(cam)
scn.camera = cam
cam.location = (17.5, -15.5, 9.0)
cam.rotation_euler = (Vector((1.4, 0, 4.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scn.render.engine = 'CYCLES'
scn.cycles.samples = 32
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = 1280, 720
scn.render.image_settings.file_format = 'JPEG'
scn.render.filepath = os.path.join(OUTD, 'renders', 'arm_glb_reimport.jpg')
bpy.ops.render.render(write_still=True)
