# 戰艦組裝「發佈」：把編輯器匯出的設計 GLB（很多部件、很多材質、十幾萬面）烘成遊戲能用的模型。
# 遊戲的船只讀「第一個網格＋它的底色貼圖」（main.js loadOneModel／getModel），所以這裡：
#   匯入 → 合成一個網格（高模）→ 複製一份拿掉小零件、減面（低模）→ 低模重新攤 UV → 高模各材質的底色（含發光）烘到低模的一張貼圖，環境遮蔽乘進底色 → 只匯出低模（JPEG 貼圖）。
# 座標照素材：+x 船首、+y 上，單位公尺（Blender 匯入時轉成 Z 朝上，匯出再轉回來）。
# 用法：blender --background --factory-startup --python bake.py -- 輸入.glb 輸出.glb [--tris 40000] [--tex 2048] [--detail 0.005] [--no-ao] [--keep-png]
# 最後一行印 RESULT {json}，伺服器（/api/shipyard/publish）讀這行。
import bpy, bmesh, sys, os, json, time
import numpy as np
from math import radians

T0 = time.time()
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, d):
    return type(d)(ARGS[ARGS.index(name) + 1]) if name in ARGS else d


INP, OUT = ARGS[0], ARGS[1]
TRIS, TEX, AO = opt('--tris', 40000), opt('--tex', 2048), '--no-ao' not in ARGS
DETAIL = opt('--detail', 0.005)     # 比「船長 × 這個比例」小的零件不留在遊戲模型裡，只烘進貼圖
WELD = opt('--weld', 0.0)           # 焊接距離（船長的比例；0＝不焊）。焊了反而會讓疊在一起的零件黏成非流形，減面減成碎片
PLANAR = opt('--planar', 3.0)       # 減面前先把幾乎共平面的面合併（度；0＝不做）：硬邊機械的形狀保留得比較好


def step(msg):
    print('STEP', msg, round(time.time() - T0, 1), 's', flush=True)


def use_gpu(scn):
    scn.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for t in ('OPTIX', 'CUDA', 'HIP'):
            try:
                prefs.compute_device_type = t
            except Exception:
                continue
            prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for dv in prefs.devices:
                    dv.use = True
                scn.cycles.device = 'GPU'
                return t
    except Exception as e:
        print('gpu', e)
    return 'CPU'


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
step('匯入 ' + os.path.basename(INP))
bpy.ops.import_scene.gltf(filepath=INP)
obs = [o for o in scn.objects if o.type == 'MESH']
if not obs:
    raise SystemExit('GLB 裡沒有網格')

# 每個網格各自一份（匯入時實例共用網格）、拿掉父子關係並套用變換（鏡像的負縮放會一起翻面）
bpy.ops.object.select_all(action='DESELECT')
for o in obs:
    o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in scn.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o)

# 原本的 UV 統一叫 UVMap（合併時才會合成同一層）；材質裡的貼圖明確指定用它（之後的作用中 UV 會換成新攤的那一層）
for o in obs:
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    me.uv_layers[0].name = 'UVMap'
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[1])
mats = {m for o in obs for m in o.data.materials if m}
for m in mats:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE' and not n.inputs['Vector'].is_linked:
            uv = nt.nodes.new('ShaderNodeUVMap')
            uv.uv_map = 'UVMap'
            nt.links.new(uv.outputs['UV'], n.inputs['Vector'])

tris0 = sum(tri_count(o.data) for o in obs)
step('合併 %d 個網格、%d 面' % (len(obs), tris0))
bpy.ops.object.join()
MESH = bpy.context.view_layer.objects.active
me = MESH.data
co = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
lo, hi = co.min(0), co.max(0)
SIZE = float(max(hi - lo))

# （可選）焊接重複頂點；清掉自訂法線，之後改用角度平滑
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=SIZE * WELD) if WELD > 0 else None
bpy.ops.object.mode_set(mode='OBJECT')
try:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
except Exception:
    pass


# 高模（原樣，烘焙的來源）＋低模（拿掉太小的零件、減面，遊戲用）：小零件（螺栓條、裝甲板、接縫…）幾千塊各自封閉，減面減不動，
# 而且在遊戲的距離看不到形狀，只要顏色 → 從高模「選取對作用中」烘到低模的貼圖上
HI = MESH.copy()
HI.data = MESH.data.copy()
HI.name = 'HI'
scn.collection.objects.link(HI)
step('拿掉小零件（< %.1f 公尺）' % (SIZE * DETAIL))
bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
seen = np.zeros(len(bm.verts), dtype=bool)
kill = []
for v in bm.verts:
    if seen[v.index]:
        continue
    st, vs = [v], []
    seen[v.index] = True
    while st:
        x = st.pop()
        vs.append(x)
        for e in x.link_edges:
            o = e.other_vert(x)
            if not seen[o.index]:
                seen[o.index] = True
                st.append(o)
    c = np.array([q.co[:] for q in vs])
    if float((c.max(0) - c.min(0)).max()) < SIZE * DETAIL:
        kill.extend(vs)
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(me)
bm.free()
me.update()

if PLANAR > 0:
    step('合併共平面的面（%g°）' % PLANAR)
    md = MESH.modifiers.new('pl', 'DECIMATE')
    md.decimate_type = 'DISSOLVE'
    md.angle_limit = radians(PLANAR)
    md.delimit = set()
    bpy.ops.object.select_all(action='DESELECT')
    MESH.select_set(True)
    bpy.context.view_layer.objects.active = MESH
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode='OBJECT')
for k in range(5):     # 一次減面常常停在目標之上：照剩下的比例再減幾次
    cur = tri_count(me)
    if cur <= TRIS * 1.08:
        break
    step('減面 %d → %d（第 %d 次）' % (cur, TRIS, k + 1))
    md = MESH.modifiers.new('dec', 'DECIMATE')
    md.decimate_type = 'COLLAPSE'
    md.ratio = max(0.05, TRIS / cur * (0.9 if k else 1.0))
    md.use_collapse_triangulate = True
    bpy.ops.object.select_all(action='DESELECT')
    MESH.select_set(True)
    bpy.context.view_layer.objects.active = MESH
    bpy.ops.object.modifier_apply(modifier=md.name)
    if tri_count(me) > cur * 0.97:
        break
bpy.ops.object.select_all(action='DESELECT')
MESH.select_set(True)
bpy.context.view_layer.objects.active = MESH
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.dissolve_degenerate(threshold=SIZE * 1e-6)     # 面積 0 的面會讓 UV 打包縮成幾個點
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.object.mode_set(mode='OBJECT')
try:
    bpy.ops.object.shade_smooth_by_angle(angle=radians(35))
except Exception:
    bpy.ops.object.shade_flat()
tris1 = tri_count(me)

step('攤 UV（%d 面）' % tris1)
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
atlas = me.uv_layers.new(name='UV_Atlas')
me.uv_layers.active = atlas
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
bpy.ops.object.mode_set(mode='OBJECT')

# ───── 烘焙 ─────
dev = use_gpu(scn)
scn.cycles.samples = 4
scn.cycles.use_denoising = False
scn.render.bake.margin = 4
step('烘焙底色（%s、%dpx）' % (dev, TEX))
N = TEX


def new_img(nm, srgb, fill):
    im = bpy.data.images.new(nm, N, N, alpha=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    px = np.empty((N * N, 4), dtype=np.float32)
    px[:] = fill
    im.pixels.foreach_set(px.ravel())
    return im


def get(im):
    px = np.empty(N * N * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    return px.reshape(-1, 4)


def principled(nt):
    return next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def out_node(nt):
    return next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)


def sock(nt, s):
    """把一個顏色輸入變成可以接線的輸出（有接線就沿用，沒有就做一個常數節點）。"""
    if s.is_linked:
        return s.links[0].from_socket
    rgb = nt.nodes.new('ShaderNodeRGB')
    rgb.outputs[0].default_value = tuple(s.default_value)
    return rgb.outputs[0]


# 高模的材質暫時改成「發光＝底色（＋發光色 × 強度）」，烘 EMIT
for m in {m for m in HI.data.materials if m}:
    if not m.use_nodes:
        m.use_nodes = True
    nt = m.node_tree
    out, b = out_node(nt), principled(nt)
    if out is None:
        out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    if b is None:
        em.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
    else:
        col = sock(nt, b.inputs['Base Color'])
        es = b.inputs.get('Emission Strength')
        ec = b.inputs.get('Emission Color') or b.inputs.get('Emission')
        k = es.default_value if es is not None and not es.is_linked else 0.0
        if ec is not None and k > 0 and (ec.is_linked or max(ec.default_value[:3]) > 0.01):
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'ADD'
            mix.inputs['Factor'].default_value = min(1.0, k * 0.5)
            nt.links.new(col, mix.inputs['A'])
            nt.links.new(sock(nt, ec), mix.inputs['B'])
            col = mix.outputs['Result']
        nt.links.new(col, em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])

# 低模：一個材質、一張貼圖（烘焙目標＝材質裡作用中的貼圖節點）
BASE = new_img('base', True, (0.35, 0.36, 0.38, 1))
mt = bpy.data.materials.new('M_Ship')
mt.use_nodes = True
nt = mt.node_tree
b = principled(nt)
tx = nt.nodes.new('ShaderNodeTexImage')
tx.image = BASE
nt.nodes.active = tx
b.inputs['Roughness'].default_value = 0.6
b.inputs['Metallic'].default_value = 0.35
me.materials.clear()
me.materials.append(mt)

bpy.ops.object.select_all(action='DESELECT')
HI.select_set(True)
MESH.select_set(True)
bpy.context.view_layer.objects.active = MESH
bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=SIZE * 0.004, max_ray_distance=SIZE * 0.02, use_clear=False)

if AO:
    step('烘焙環境遮蔽')
    HI.hide_render = True
    AOI = new_img('ao', False, (1, 1, 1, 1))
    tx.image = AOI
    scn.world = bpy.data.worlds.new('World')
    scn.world.light_settings.distance = SIZE * 0.03
    scn.cycles.samples = 32
    bpy.ops.object.select_all(action='DESELECT')
    MESH.select_set(True)
    bpy.ops.object.bake(type='AO', use_selected_to_active=False, use_clear=False)
    ao = np.clip(get(AOI)[:, 0], 0, 1)
    base = get(BASE)
    base[:, :3] *= (0.45 + 0.55 * ao ** 1.1)[:, None]
    BASE.pixels.foreach_set(base.ravel())
    tx.image = BASE

# ───── 匯出：只有低模 ─────
step('匯出')
bpy.data.objects.remove(HI)
od = os.path.dirname(os.path.abspath(OUT))
os.makedirs(od, exist_ok=True)
BASE.filepath_raw = os.path.join(od, os.path.splitext(os.path.basename(OUT))[0] + '_base.png')
BASE.file_format = 'PNG'
BASE.save()
nt.links.new(tx.outputs['Color'], b.inputs['Base Color'])
MESH.name = me.name = 'Ship'
bpy.ops.object.select_all(action='DESELECT')
MESH.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
                          export_tangents=False, export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=88, export_animations=False, export_extras=False)
if '--keep-png' not in ARGS:
    try:
        os.remove(BASE.filepath_raw)
    except Exception:
        pass
res = dict(tris0=tris0, tris=tris1, tex=TEX, ao=AO, dev=dev, size=[round(float(x), 1) for x in (hi - lo)], bytes=os.path.getsize(OUT), sec=round(time.time() - T0, 1))
print('RESULT ' + json.dumps(res), flush=True)
