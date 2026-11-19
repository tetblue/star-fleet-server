# 整備庫物件的共用工具（從 tools/arm/blender/build_arm.py 抽出來）：幾何、材質、互穿檢查、UV、烘焙、骨架、參數動作、匯出、新舊並排圖。
# 每個物件一支 build_*.py：建零件 → M.finish()。座標跟遊戲一樣：公尺、y 朝上；最後整體轉成 Blender 的 Z 朝上，匯出時再轉回來。
import bpy, bmesh, os, sys, json, time
import numpy as np
from math import sin, cos, pi, radians, atan2, hypot, acos
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

T0 = time.time()
D = pi / 180
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.join(HERE, 'out')
MODELS = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'models', '機庫'))
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))       # 遊戲座標 (x, y, z) → Blender (x, -z, y)
I4 = Matrix.Identity(4)


def V(*a):
    return Vector(a)


def Tm(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


AXX, AXY = Ry(pi / 2), Rx(-pi / 2)      # 把「沿 z 的圓柱」轉成沿 x、沿 y


class Pal(dict):
    """材質名 → bmesh。"""
    def __missing__(self, k):
        self[k] = bmesh.new()
        return self[k]


def face(bm, vs):
    try:
        return bm.faces.new(vs)
    except ValueError:
        return None


def loft(bm, rings, cap0=True, cap1=True):
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(vr[0])
    for a, b in zip(vr, vr[1:]):
        for i in range(n):
            face(bm, [a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]])
    if cap0:
        face(bm, list(reversed(vr[0])))
    if cap1:
        face(bm, vr[-1])


def revolve(bm, prof, M, segs=32, cap0=True, cap1=True):
    """prof＝[(沿軸的位置, 半徑)…]，繞 M 的 z 軸。"""
    loft(bm, [[M @ V(r * cos(2 * pi * k / segs), r * sin(2 * pi * k / segs), h) for k in range(segs)] for h, r in prof], cap0, cap1)


def cylZ(bm, cx, cy, z0, z1, r, segs=24, M=None):
    revolve(bm, [(z0, r), (z1, r)], (M or I4) @ Tm(cx, cy, 0), segs)


def cylX(bm, x0, x1, cy, cz, r, r1=None, segs=24, M=None):
    revolve(bm, [(x0, r), (x1, r if r1 is None else r1)], (M or I4) @ Tm(0, cy, cz) @ AXX, segs)


def cylY(bm, cx, cz, y0, y1, r, r1=None, segs=24, M=None):
    revolve(bm, [(y0, r), (y1, r if r1 is None else r1)], (M or I4) @ Tm(cx, 0, cz) @ AXY, segs)


def box(bm, x0, x1, y0, y1, z0, z1, M=None):
    c = [V(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    if M is not None:
        c = [M @ p for p in c]
    vs = [bm.verts.new(p) for p in c]
    for idx in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        face(bm, [vs[i] for i in idx])


def beam(bm, a, b, w, h=None):
    """從 a 到 b 的方管（截面 w × h）。"""
    a, b = Vector(a), Vector(b)
    z = (b - a).normalized()
    x = z.cross(V(0, 1, 0) if abs(z.y) < 0.95 else V(1, 0, 0)).normalized()
    y = z.cross(x)
    h = w if h is None else h
    loft(bm, [[p + x * sx * w / 2 + y * sy * h / 2 for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))] for p in (a, b)])


def plate(bm, pts, z0, z1, M=None):
    """xy 平面的凸外形，從 z0 擠到 z1。"""
    M = M or I4
    a = [bm.verts.new(M @ V(x, y, z0)) for x, y in pts]
    b = [bm.verts.new(M @ V(x, y, z1)) for x, y in pts]
    face(bm, list(reversed(a)))
    face(bm, b)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        face(bm, [a[i], a[j], b[j], b[i]])


def link2d(ln, r0, r1, x0=0.0, seg=10):
    """兩個圓的外包絡：(x0, 0) 半徑 r0 → (x0 + ln, 0) 半徑 r1。"""
    ang = acos(max(-1.0, min(1.0, (r0 - r1) / ln)))
    pts = [(x0 + ln + r1 * cos(-ang + 2 * ang * i / seg), r1 * sin(-ang + 2 * ang * i / seg)) for i in range(seg + 1)]
    return pts + [(x0 + r0 * cos(ang + (2 * pi - 2 * ang) * i / seg), r0 * sin(ang + (2 * pi - 2 * ang) * i / seg)) for i in range(seg + 1)]


def hose(bm, pts, r, segs=8):
    pts = [Vector(p) for p in pts]
    for _ in range(2):
        q = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            q += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        pts = q + [pts[-1]]
    n = len(pts)
    tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    u = tans[0].cross(V(0, 0, 1) if abs(tans[0].z) < 0.9 else V(1, 0, 0)).normalized()
    rings = []
    for i in range(n):
        t = tans[i]
        u = (u - t * u.dot(t)).normalized()
        w = t.cross(u)
        rings.append([pts[i] + (u * cos(2 * pi * k / segs) + w * sin(2 * pi * k / segs)) * r for k in range(segs)])
    loft(bm, rings)


def railing(bm, pts, h=1.1, r=0.035, mid=True):
    """沿著折線的欄杆：每個點一根立柱、頂上一條扶手、中間一條橫桿。pts 是地板上的點。"""
    pts = [Vector(p) for p in pts]
    for p in pts:
        cylY(bm, p.x, p.z, p.y, p.y + h, r, None, 8)
    for a, b in zip(pts, pts[1:]):
        beam(bm, a + V(0, h, 0), b + V(0, h, 0), r * 2.2)
        if mid:
            beam(bm, a + V(0, h * 0.5, 0), b + V(0, h * 0.5, 0), r * 1.6)


# ----------------------------------------------------------------------------------------------
# 材質（程序材質，之後烘成貼圖）：白漆、海軍藍漆、鋼、鍍鉻、橡膠、橘漆、黃黑警示、發光
# ----------------------------------------------------------------------------------------------
MATS = {}
BEV = dict(white=0.018, navy=0.014, steel=0.008, chrome=0.004, rubber=0.006, orange=0.006, hazard=0.012, yellow=0.012, glow=0.0, lamp=0.0, dark=0.012)


def _nodes(name):
    m = bpy.data.materials.new('M_' + name.capitalize())
    m.use_nodes = True
    MATS[name] = m
    return m, m.node_tree, m.node_tree.nodes['Principled BSDF'], m.node_tree.links.new


def _n(nt, kind, **inp):
    n = nt.nodes.new(kind)
    for k, v in inp.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def _mr(nt, a, b, c, d):
    n = nt.nodes.new('ShaderNodeMapRange')
    for k, v in (('From Min', a), ('From Max', b), ('To Min', c), ('To Max', d)):
        n.inputs[k].default_value = v
    return n


def mat_paint(name, col, rough, wear=1.0):
    """烤漆：大塊色差、往下流的污痕、凸出的邊角掉漆露出金屬、細小的顆粒。"""
    m, nt, b, L = _nodes(name)
    tc = _n(nt, 'ShaderNodeTexCoord')
    big = _n(nt, 'ShaderNodeTexNoise', Scale=0.6, Detail=4.0)
    tone = _mr(nt, 0.3, 0.7, 0.86, 1.05)
    mul = _n(nt, 'ShaderNodeMixRGB', blend_type='MULTIPLY')
    mul.inputs['Fac'].default_value = 1.0
    mul.inputs['Color1'].default_value = (*col, 1)
    mp = _n(nt, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (7.0, 7.0, 0.3)
    st = _n(nt, 'ShaderNodeTexNoise', Scale=1.0, Detail=6.0)
    sr = _mr(nt, 0.55, 0.8, 0.0, 0.4 * wear)
    grime = _n(nt, 'ShaderNodeMixRGB')
    grime.inputs['Color2'].default_value = (0.10, 0.09, 0.08, 1)
    bv = _n(nt, 'ShaderNodeBevel', samples=8)
    bv.inputs['Radius'].default_value = 0.022
    geo = _n(nt, 'ShaderNodeNewGeometry')
    dot = _n(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT')
    er = _mr(nt, 0.995, 0.93, 0.0, 1.0)
    chip = _n(nt, 'ShaderNodeTexNoise', Scale=11.0, Detail=5.0)
    cr = _mr(nt, 0.42, 0.58, 0.0, 1.0)
    mask = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    mask2 = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    mask2.inputs[1].default_value = wear
    bare = _n(nt, 'ShaderNodeMixRGB')
    bare.inputs['Color2'].default_value = (0.30, 0.31, 0.33, 1)
    fine = _n(nt, 'ShaderNodeTexNoise', Scale=38.0, Detail=4.0)
    rr = _mr(nt, 0.0, 1.0, rough - 0.08, rough + 0.10)
    rmix = _n(nt, 'ShaderNodeMixRGB')
    rmix.inputs['Color2'].default_value = (0.36, 0.36, 0.36, 1)
    met = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    met.inputs[1].default_value = 0.9
    bp = _n(nt, 'ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.10
    bp.inputs['Distance'].default_value = 0.004
    for n in (big, mp, chip, fine):
        L(tc.outputs['Object'], n.inputs['Vector'])
    L(mp.outputs['Vector'], st.inputs['Vector'])
    L(big.outputs['Fac'], tone.inputs['Value'])
    L(tone.outputs['Result'], mul.inputs['Color2'])
    L(st.outputs['Fac'], sr.inputs['Value'])
    L(mul.outputs['Color'], grime.inputs['Color1'])
    L(sr.outputs['Result'], grime.inputs['Fac'])
    L(bv.outputs['Normal'], dot.inputs[0])
    L(geo.outputs['Normal'], dot.inputs[1])
    L(dot.outputs['Value'], er.inputs['Value'])
    L(chip.outputs['Fac'], cr.inputs['Value'])
    L(er.outputs['Result'], mask.inputs[0])
    L(cr.outputs['Result'], mask.inputs[1])
    L(mask.outputs[0], mask2.inputs[0])
    L(grime.outputs['Color'], bare.inputs['Color1'])
    L(mask2.outputs[0], bare.inputs['Fac'])
    L(bare.outputs['Color'], b.inputs['Base Color'])
    L(fine.outputs['Fac'], rr.inputs['Value'])
    L(rr.outputs['Result'], rmix.inputs['Color1'])
    L(mask2.outputs[0], rmix.inputs['Fac'])
    L(rmix.outputs['Color'], b.inputs['Roughness'])
    L(mask2.outputs[0], met.inputs[0])
    L(met.outputs[0], b.inputs['Metallic'])
    L(fine.outputs['Fac'], bp.inputs['Height'])
    L(bp.outputs['Normal'], b.inputs['Normal'])


def mat_plain(name, col, metallic, rough, noise=0.08, nscale=8.0, bump=0.0, emit=None, strength=0.0):
    m, nt, b, L = _nodes(name)
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
        return
    tc = _n(nt, 'ShaderNodeTexCoord')
    nz = _n(nt, 'ShaderNodeTexNoise', Scale=nscale, Detail=5.0)
    mr = _mr(nt, 0.0, 1.0, max(rough - noise, 0.03), rough + noise)
    L(tc.outputs['Object'], nz.inputs['Vector'])
    L(nz.outputs['Fac'], mr.inputs['Value'])
    L(mr.outputs['Result'], b.inputs['Roughness'])
    if bump:
        bp = _n(nt, 'ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.006
        L(nz.outputs['Fac'], bp.inputs['Height'])
        L(bp.outputs['Normal'], b.inputs['Normal'])


def mat_hazard(name, k=6.0):
    """黃黑斜紋：沿 (x + y + z) 取正弦（Blender 座標）。"""
    m, nt, b, L = _nodes(name)
    tc = _n(nt, 'ShaderNodeTexCoord')
    dt = _n(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT')
    dt.inputs[1].default_value = (k, k, k)
    sn = _n(nt, 'ShaderNodeMath', operation='SINE')
    gt = _n(nt, 'ShaderNodeMath', operation='GREATER_THAN')
    gt.inputs[1].default_value = 0.0
    mx = _n(nt, 'ShaderNodeMixRGB')
    mx.inputs['Color1'].default_value = (0.02, 0.02, 0.022, 1)
    mx.inputs['Color2'].default_value = (0.85, 0.52, 0.03, 1)
    L(tc.outputs['Object'], dt.inputs[0])
    L(dt.outputs['Value'], sn.inputs[0])
    L(sn.outputs[0], gt.inputs[0])
    L(gt.outputs[0], mx.inputs['Fac'])
    L(mx.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.55


def reset():
    """空場景＋整套材質。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    MATS.clear()
    mat_paint('white', (0.72, 0.74, 0.77), 0.40)
    mat_paint('navy', (0.018, 0.045, 0.13), 0.45, wear=1.3)
    mat_plain('steel', (0.16, 0.17, 0.19), 0.9, 0.42, noise=0.14, nscale=6.0)
    mat_plain('chrome', (0.80, 0.82, 0.85), 1.0, 0.14, noise=0.05, nscale=20.0)
    mat_plain('rubber', (0.018, 0.018, 0.02), 0.0, 0.82, noise=0.08, nscale=30.0, bump=0.25)
    mat_paint('orange', (0.80, 0.22, 0.03), 0.6, wear=0.7)
    mat_paint('yellow', (0.80, 0.50, 0.03), 0.5, wear=1.0)
    mat_paint('dark', (0.085, 0.095, 0.115), 0.55, wear=0.6)      # 機庫裡面的深色牆與地板
    mat_hazard('hazard')
    mat_plain('glow', (0.01, 0.03, 0.08), 0.0, 0.3, emit=(0.16, 0.55, 1.0), strength=5.0)
    mat_plain('lamp', (0.2, 0.2, 0.18), 0.0, 0.3, emit=(1.0, 0.93, 0.78), strength=6.0)      # 探照燈的燈面（暖白）


def use_gpu():
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    dev = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for t in ('OPTIX', 'CUDA'):
            prefs.compute_device_type = t
            prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for dv in prefs.devices:
                    dv.use = True
                scn.cycles.device = 'GPU'
                dev = t
                break
    except Exception as e:
        print('gpu', e)
    return dev


def search_actuator(name, fk, samples, top, bot, tops, bots, clear=0.0, margin=0.7, pivot=(0, 0, 0)):
    """油壓缸固定點：tops／bots＝候選點（各自骨頭的座標）。把 samples 裡的姿勢全部算過，留下套得住、力臂最大的。
    力臂＝下一段的轉軸（pivot，下一段骨頭的座標）到油壓缸中線的距離。找不到就讓建置失敗。"""
    Ws = [fk(a) for a in samples]
    best = None
    for tp in tops:
        for bp in bots:
            lo, hi, lev = 1e9, 0.0, 1e9
            for W in Ws:
                a, b, j = W[top] @ Vector(tp), W[bot] @ Vector(bp), W[bot] @ Vector(pivot)
                ln = (b - a).length
                lo, hi = min(lo, ln), max(hi, ln)
                lev = min(lev, (j - a).cross(b - a).length / max(ln, 1e-6))
            ok = hi <= 2 * lo - margin and lev >= clear
            sc = (1 if ok else 0, lev if ok else -(hi / lo))
            if best is None or sc > best['sc']:
                best = dict(sc=sc, tp=tuple(tp), bp=tuple(bp), lo=lo, hi=hi, lever=lev, ok=ok)
    assert best['ok'], '油壓缸 %s：找不到套得住的固定點（最長 %.2f、最短 %.2f、力臂 %.2f）' % (name, best['hi'], best['lo'], best['lever'])
    best.update(Lc=best['lo'] - 0.25, top=top, bot=bot, name=name)
    best['Lr'] = best['hi'] - best['Lc'] + 0.18
    print('ACT %s 行程 %.2f..%.2f 力臂 %.2f 缸筒 %.2f 活塞桿 %.2f' % (name, best['lo'], best['hi'], best['lever'], best['Lc'], best['Lr']))
    return best


def aim_pair(W, A, pin):
    """油壓缸兩半的位置：各自在自己的固定點，局部 +x 指向對方，局部 z＝銷的方向（pin＝上一段骨頭座標裡的軸）。回傳 (缸筒, 活塞桿, 長度)。"""
    a, b = W[A['top']] @ Vector(A['tp']), W[A['bot']] @ Vector(A['bp'])
    z = (W[A['top']].to_3x3() @ Vector(pin)).normalized()
    out = []
    for o, x in ((a, (b - a).normalized()), (b, (a - b).normalized())):
        y = z.cross(x)
        m = Matrix((x, y, z)).transposed().to_4x4()
        m.translation = o
        out.append(m)
    return out[0], out[1], (b - a).length


def actuator_parts(M, name, A, rc, ez, cyl_bone, rod_bone):
    """缸筒（空心，尾端耳環、油口、硬管）＋ 活塞桿（耳環、鍍鉻桿）。活塞桿在孔裡滑，兩個零件的面不相交。"""
    Lc, Lr = A['Lc'], A['Lr']
    P = Pal()
    cylZ(P['steel'], 0, 0, -ez, ez, rc * 0.8, 20)
    box(P['steel'], 0.04, 0.2, -rc * 0.5, rc * 0.5, -ez, ez)
    cylX(P['steel'], 0.16, 0.24, 0, 0, rc * 1.12)
    revolve(P['navy'], [(0.2, rc), (Lc - 0.1, rc), (Lc - 0.1, rc * 1.12), (Lc, rc * 1.12), (Lc, rc * 0.5 + 0.008), (0.26, rc * 0.5 + 0.008)], AXX, 24)
    for x in (0.34, Lc - 0.3):
        box(P['steel'], x, x + 0.14, rc * 0.8, rc * 1.3, -0.05, 0.05)
    hose(P['steel'], [V(0.41, rc * 1.3, 0), V(0.5, rc * 1.5, 0), V(Lc - 0.32, rc * 1.5, 0), V(Lc - 0.23, rc * 1.3, 0)], 0.018, 6)
    M.part(name + '_Barrel', cyl_bone, P)
    P = Pal()
    cylZ(P['steel'], 0, 0, -ez + 0.02, ez - 0.02, rc * 0.75, 20)
    cylX(P['steel'], 0.05, 0.2, 0, 0, rc * 0.62)
    cylX(P['chrome'], 0.2, Lr, 0, 0, rc * 0.5)
    M.part(name + '_Piston', rod_bone, P)


class Machine:
    """一個物件：零件、（可以沒有的）骨頭與參數、檢查、烘焙、匯出。
    joints＝[(鍵, 名稱, 最小, 最大, 靜止)…]；parent＝{骨頭: 上一層}；fk(參數值) → {骨頭: 4×4（遊戲座標）}；clip_bones＝{鍵: [那個參數會動到的骨頭]}。"""

    def __init__(self, name, glb, joints=(), parent=None, fk=None, clip_bones=None, tex=1024, bevel=1.0, yaw=0.0):
        reset()
        self.name, self.glb, self.joints, self.tex, self.bevel, self.yaw = name, glb, list(joints), tex, bevel, yaw
        assert not (yaw and joints), 'yaw 只給沒有骨架的物件用'
        self.parent = dict(parent or {'Root': None})
        self.fk = fk or (lambda ang: {'Root': I4.copy()})
        self.clip_bones = clip_bones or {}
        self.lim = {j[0]: (j[2], j[3]) for j in self.joints}
        self.rest_ang = {j[0]: j[4] for j in self.joints}
        self.bones = list(self.parent)
        self.scn = bpy.context.scene
        self.col = bpy.data.collections.new(name)
        self.scn.collection.children.link(self.col)
        self.parts, self.info, self.checkres, self.splits = {}, dict(units='m', name=name), None, {}
        os.makedirs(OUTD, exist_ok=True)

    def pose(self, ang=None):
        a = dict(self.rest_ang)
        a.update(ang or {})
        return self.fk(a)

    def _piece(self, name, bm, mname):
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ang = radians(30)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            e.smooth = (len(e.link_faces) == 2 and e.calc_face_angle(0.0) < ang)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        self.col.objects.link(ob)
        me.materials.append(MATS[mname])
        if BEV[mname] > 0:
            m = ob.modifiers.new('bev', 'BEVEL')
            m.width, m.segments, m.limit_method, m.angle_limit, m.use_clamp_overlap = BEV[mname] * self.bevel, 1, 'ANGLE', ang, True
        ob.modifiers.new('tri', 'TRIANGULATE').quad_method = 'SHORTEST_DIAGONAL'
        w = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
        w.keep_sharp, w.weight = True, 60
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        ob.modifiers.clear()
        ob.data = me2
        me2.name = name
        bpy.data.meshes.remove(me)
        return ob

    def part(self, name, bone, P, check=True, split=None):
        """split＝(另一根骨頭, 判斷函式)：判斷函式(頂點座標) 為真的頂點改跟另一根骨頭（鋼索這種兩頭各跟一根骨頭、中間被拉長的零件）。"""
        if not hasattr(self, 'REST'):
            self.REST3 = self.pose()
            self.REST = {b: C @ m for b, m in self.REST3.items()}
        assert name.lower() not in {b.lower() for b in self.bones}, '網格跟骨頭同名：' + name
        obs = [self._piece(name, bm, k) for k, bm in P.items() if len(bm.faces)]
        ob = obs[0]
        if len(obs) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in obs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.join()
        ob.name = ob.data.name = name
        ob.matrix_world = self.REST[bone]
        self.parts[name] = (ob, bone, check)
        self.splits[name] = split
        return ob

    # ---- 互穿檢查：三角面對三角面；靜止姿勢、每個參數單獨掃、另外給的姿勢，都必須是 0 ----
    def check(self, extra=(), floor=False, steps=24):
        CK = []
        for n, (ob, b, c) in self.parts.items():
            if c:
                co = np.empty(len(ob.data.vertices) * 3, dtype=np.float64)
                ob.data.vertices.foreach_get('co', co)
                CK.append(dict(name=n, bone=b, co=co.reshape(-1, 3), polys=[tuple(p.vertices) for p in ob.data.polygons]))

        def clashes(ang):
            W = self.pose(ang)
            for c in CK:
                Mx = np.array(W[c['bone']])
                c['w'] = c['co'] @ Mx[:3, :3].T + Mx[:3, 3]
                c['lo'], c['hi'], c['tree'] = c['w'].min(0), c['w'].max(0), None
            out = []
            for i, a in enumerate(CK):
                if floor and a['bone'] != 'Root' and a['lo'][1] < -1e-4:      # 底座本來就貼著地
                    out.append((a['name'], '地板'))
                for b in CK[i + 1:]:
                    if a['bone'] == b['bone'] or (a['lo'] > b['hi']).any() or (b['lo'] > a['hi']).any():
                        continue
                    for c in (a, b):
                        if c['tree'] is None:
                            c['tree'] = BVHTree.FromPolygons(c['w'].tolist(), c['polys'], epsilon=0.0)
                    if a['tree'].overlap(b['tree']):
                        out.append((a['name'], b['name']))
            return out

        R = dict(method='BVH 三角面對三角面；銷不檢查', parts_checked=len(CK), rest=[' × '.join(p) for p in clashes({})], sweeps=[])
        for key, _nm, lo, hi, _r in self.joints:
            bad, first = 0, None
            for i in range(steps + 1):
                h = clashes({key: lo + (hi - lo) * i / steps})
                if h:
                    bad += 1
                    first = first or dict(value=round(i / steps, 3), pair=' × '.join(h[0]))
            R['sweeps'].append(dict(joint=key, steps=steps + 1, clashing=bad, first=first))
        if extra:
            bad, first = 0, None
            for i, a in enumerate(extra):
                h = clashes(a)
                if h:
                    bad += 1
                    first = first or dict(sample=i, pair=' × '.join(h[0]))
            R['combined'] = dict(samples=len(extra), clashing=bad, first=first)
        R['pass'] = not R['rest'] and all(not s['clashing'] for s in R['sweeps']) and not R.get('combined', {}).get('clashing')
        self.checkres = R
        json.dump(R, open(os.path.join(OUTD, self.name + '_check.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        print('CHECK', self.name, 'pass', R['pass'], 'rest', R['rest'][:3], [(s['joint'], s['clashing'], s['first']) for s in R['sweeps']], R.get('combined'), round(time.time() - T0, 1), 's')
        return R

    # ---- 合成一個網格、UV、烘焙、骨架、動作、存檔、匯出 ----
    def finish(self, extras=None):
        scn = self.scn
        self.info['parts'] = [dict(name=n, bone=b, tris=len(o.data.polygons), checked=c) for n, (o, b, c) in self.parts.items()]
        bpy.ops.object.select_all(action='DESELECT')
        first = None
        for n, (ob, b, c) in self.parts.items():
            sp = self.splits.get(n)
            other = [v.index for v in ob.data.vertices if sp[1](v.co)] if sp else []
            ob.vertex_groups.new(name=b).add([i for i in range(len(ob.data.vertices)) if i not in set(other)], 1.0, 'REPLACE')
            if other:
                ob.vertex_groups.new(name=sp[0]).add(other, 1.0, 'REPLACE')
            ob.select_set(True)
            first = first or ob
        bpy.context.view_layer.objects.active = first
        bpy.ops.object.join()
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        MESH = self.mesh = first
        if self.yaw:                           # 整個轉到跟舊模型同一個朝向（度，繞朝上的軸；遊戲裡的 rotation.y 同方向）
            MESH.data.transform(Matrix.Rotation(self.yaw * D, 4, 'Z'))
        MESH.name = MESH.data.name = self.name.capitalize() + '_Mesh'
        MESH.data.uv_layers.new(name='UV_Atlas')
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
        bpy.ops.object.mode_set(mode='OBJECT')
        self.info['tris'] = len(MESH.data.polygons)
        baked = '--no-bake' not in ARGS
        if baked:
            self._bake()
        rigged = bool(self.joints)
        if rigged:
            self._rig(extras)
        elif extras:
            for k, v in extras.items():
                MESH[k] = json.dumps(v)
        co = np.empty(len(MESH.data.vertices) * 3)
        MESH.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        lo, hi = co.min(0), co.max(0)
        self.info.update(size_xyz=[round(float(hi[0] - lo[0]), 2), round(float(hi[2] - lo[2]), 2), round(float(hi[1] - lo[1]), 2)], baked=baked, tex=self.tex,
                         joints=[dict(key=j[0], name=j[1], min=j[2], max=j[3], rest=j[4], clip=j[0] + '_param', bones=self.clip_bones.get(j[0], [])) for j in self.joints],
                         bones={b: self.parent[b] for b in self.bones} if rigged else None, check=self.checkres, extras=extras)
        json.dump(self.info, open(os.path.join(OUTD, self.name + '_info.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTD, self.name + '.blend'))
        if '--no-export' not in ARGS:
            bpy.ops.object.select_all(action='DESELECT')
            for o in ([self.arm] if rigged else []) + [MESH]:
                o.select_set(True)
            bpy.context.view_layer.objects.active = self.arm if rigged else MESH
            path = os.path.join(OUTD, self.glb + '.glb')
            bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_skins=rigged, export_yup=True,
                                      export_animations=rigged, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1, export_tangents=baked,
                                      export_image_format='JPEG', export_jpeg_quality=90, export_extras=True, export_optimize_animation_size=True,
                                      export_optimize_animation_keep_anim_armature=False, export_anim_slide_to_zero=True)
            print('GLB', self.glb, os.path.getsize(path) // 1024, 'KB')
        print('DONE', self.name, self.info['tris'], 'tris', len(self.parts), 'parts', round(time.time() - T0, 1), 's')

    def _bake(self):
        scn, MESH, N = self.scn, self.mesh, self.tex
        scn.world = bpy.data.worlds.new('World')
        use_gpu()
        scn.cycles.samples = 24
        scn.cycles.use_denoising = False
        scn.world.light_settings.distance = 1.2
        used = list(MESH.data.materials)

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

        pre = self.name
        IM = dict(base=new_img(pre + '_basecolor', True, (0.05, 0.05, 0.05, 1)), rough=new_img(pre + '_r', False, (0.5, 0.5, 0.5, 1)), metal=new_img(pre + '_m', False, (0, 0, 0, 1)),
                  ao=new_img(pre + '_a', False, (1, 1, 1, 1)), normal=new_img(pre + '_normal', False, (0.5, 0.5, 1.0, 1)), orm=new_img(pre + '_orm', False, (1, 0.5, 0, 1)))
        tex = {m.name: m.node_tree.nodes.new('ShaderNodeTexImage') for m in used}

        def target(kind):
            for m in used:
                tex[m.name].image = IM[kind]
                m.node_tree.nodes.active = tex[m.name]
            bpy.ops.object.select_all(action='DESELECT')
            MESH.select_set(True)
            bpy.context.view_layer.objects.active = MESH

        def emit_bake(kind, socket, is_color):
            saved = []
            for m in used:
                nt = m.node_tree
                out = nt.nodes['Material Output']
                inp = nt.nodes['Principled BSDF'].inputs[socket]
                old = out.inputs['Surface'].links[0].from_socket
                em = nt.nodes.new('ShaderNodeEmission')
                if inp.is_linked:
                    nt.links.new(inp.links[0].from_socket, em.inputs['Color'])
                else:
                    v = inp.default_value
                    em.inputs['Color'].default_value = tuple(v) if is_color else (v, v, v, 1.0)
                nt.links.new(em.outputs[0], out.inputs['Surface'])
                saved.append((nt, out, old, em))
            target(kind)
            bpy.ops.object.bake(type='EMIT', margin=6, use_clear=False)
            for nt, out, old, em in saved:
                nt.links.new(old, out.inputs['Surface'])
                nt.nodes.remove(em)

        emit_bake('base', 'Base Color', True)
        emit_bake('rough', 'Roughness', False)
        emit_bake('metal', 'Metallic', False)
        target('normal')
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=6, use_clear=False)
        scn.cycles.samples = 64
        target('ao')
        bpy.ops.object.bake(type='AO', margin=6, use_clear=False)
        ao = np.clip(get(IM['ao'])[:, 0], 0, 1)
        r, mt, base = get(IM['rough']), get(IM['metal']), get(IM['base'])
        base[:, :3] *= (0.42 + 0.58 * ao ** 1.1)[:, None]
        IM['base'].pixels.foreach_set(base.ravel())
        px = np.ones_like(r)
        px[:, 0], px[:, 1], px[:, 2] = ao, r[:, 0], mt[:, 0]
        IM['orm'].pixels.foreach_set(px.ravel())
        td = os.path.join(OUTD, 'textures')
        os.makedirs(td, exist_ok=True)
        for key, kk in (('basecolor', 'base'), ('orm', 'orm'), ('normal', 'normal')):
            IM[kk].filepath_raw = os.path.join(td, '%s_%s.png' % (pre, key))
            IM[kk].file_format = 'PNG'
            IM[kk].save()
        for kk in ('rough', 'metal', 'ao'):
            bpy.data.images.remove(IM[kk])
        for m in used:
            m.node_tree.nodes.remove(tex[m.name])
        mt2 = bpy.data.materials.new('M_' + self.name.capitalize())
        mt2.use_nodes = True
        nt = mt2.node_tree
        b = nt.nodes['Principled BSDF']
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UV_Atlas'
        imgs = {}
        for key, kk in (('basecolor', 'base'), ('orm', 'orm'), ('normal', 'normal')):
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = IM[kk]
            nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
            imgs[key] = t
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'UV_Atlas'
        nt.links.new(imgs['basecolor'].outputs['Color'], b.inputs['Base Color'])
        nt.links.new(imgs['orm'].outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
        nt.links.new(imgs['normal'].outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        me = MESH.data
        new, remap = [], []
        for m in list(me.materials):
            m2 = m if m in (MATS['glow'], MATS['lamp']) else mt2      # 發光的材質不烘，留著
            if m2 not in new:
                new.append(m2)
            remap.append(new.index(m2))
        idx = np.empty(len(me.polygons), dtype=np.int32)
        me.polygons.foreach_get('material_index', idx)
        idx = np.array(remap, dtype=np.int32)[idx]
        me.materials.clear()
        for m2 in new:
            me.materials.append(m2)
        me.polygons.foreach_set('material_index', idx)
        me.update()
        print('BAKED', self.name, N, round(time.time() - T0, 1), 's')

    def _set_pose(self, ang, keys=None, frame=None, prev=None):
        W = {b: C @ m for b, m in self.pose(ang).items()}
        for b in (keys or self.bones):
            if b == 'Root':
                continue
            basis = self.LOCREST[b].inverted() @ (W[self.parent[b]].inverted() @ W[b])
            q = basis.to_quaternion()
            if prev is not None:
                if b in prev and prev[b].dot(q) < 0:
                    q.negate()
                prev[b] = q
            pb = self.PB[b]
            pb.rotation_quaternion, pb.location = q, basis.to_translation()
            if frame is not None:
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('location', frame=frame)

    def _rig(self, extras):
        REST = self.REST
        self.LOCREST = {b: REST[self.parent[b]].inverted() @ REST[b] for b in self.bones if self.parent[b]}
        ad = bpy.data.armatures.new('Armature')
        ARM = self.arm = bpy.data.objects.new('Armature', ad)
        self.col.objects.link(ARM)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = ARM
        ARM.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        for n in self.bones:
            eb = ad.edit_bones.new(n)
            o, r = REST[n].to_translation(), REST[n].to_3x3()
            eb.head, eb.tail = o, o + r.col[1] * 0.4
            eb.align_roll(r.col[2])
            if self.parent[n]:
                eb.parent = ad.edit_bones[self.parent[n]]
            eb.use_connect = False
        bpy.ops.object.mode_set(mode='OBJECT')
        self.PB = ARM.pose.bones
        for pb in self.PB:
            pb.rotation_mode = 'QUATERNION'
        self.mesh.parent = ARM
        self.mesh.matrix_parent_inverse = Matrix.Identity(4)
        self.mesh.modifiers.new('Armature', 'ARMATURE').object = ARM
        ARM['joints'] = json.dumps([dict(key=j[0], min=j[2], max=j[3], rest=j[4], clip=j[0] + '_param') for j in self.joints])
        for k, v in (extras or {}).items():
            ARM[k] = json.dumps(v)
        self.scn.render.fps = 32          # 第 0～32 格＝參數 0～1，長度剛好 1 秒
        ARM.animation_data_create()
        acts = {}
        for key, _nm, lo, hi, _r in self.joints:
            act = bpy.data.actions.new(key + '_param')
            act.use_fake_user = True
            ARM.animation_data.action = act
            self._set_pose({})
            prev = {}
            for f in range(33):
                self._set_pose({key: lo + (hi - lo) * f / 32}, self.clip_bones[key], f, prev)
            acts[key + '_param'] = act
            self._set_pose({})
        ARM.animation_data.action = None
        self._set_pose({})
        for an, act in acts.items():
            tr = ARM.animation_data.nla_tracks.new()
            tr.name = an
            stp = tr.strips.new(an, 0, act)
            try:
                stp.action_slot = act.slots[0]
            except Exception as e:
                print('strip slot', e)
        bpy.context.view_layer.update()

    # ---- 新舊並排：舊模型（models/機庫 的 GLB × 遊戲裡的縮放）在上排，新模型在下排，同樣的鏡頭 ----
    def compare(self, old, scale, poses=None, old_off=(0, 0, 0), dist=1.0, floor=0.0):
        scn = self.scn
        rd = os.path.join(OUTD, 'renders')
        os.makedirs(rd, exist_ok=True)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, '整備庫_%s.glb' % old))
        olds = [o for o in bpy.data.objects if o not in before]
        for o in olds:
            if o.parent is None:
                o.matrix_world = Matrix.Translation(C @ Vector(old_off)) @ Matrix.Scale(scale, 4) @ o.matrix_world
        news = [self.mesh]
        tracks = list(self.arm.animation_data.nla_tracks) if self.joints else []
        for tr in tracks:                      # 動作軌先關掉，不然姿勢會被第 0 格的動作蓋掉
            tr.mute = True
        if scn.world is None:
            scn.world = bpy.data.worlds.new('World')
        w = scn.world
        w.use_nodes = True
        w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
        w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
        fm = bpy.data.meshes.new('Floor')
        fm.from_pydata([(-300, -300, 0), (300, -300, 0), (300, 300, 0), (-300, 300, 0)], [], [(0, 1, 2, 3)])
        fl = bpy.data.objects.new('Floor', fm)
        fl.location.z = floor
        scn.collection.objects.link(fl)
        fmat = bpy.data.materials.new('M_Studio_Floor')
        fmat.use_nodes = True
        fmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.1, 0.115, 1)
        fm.materials.append(fmat)
        sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
        sun.data.energy, sun.data.angle = 3.2, radians(10)
        sun.rotation_euler = (radians(50), 0, radians(-35))
        scn.collection.objects.link(sun)
        cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
        scn.collection.objects.link(cam)
        scn.camera = cam
        use_gpu()
        scn.cycles.samples = 48
        scn.cycles.use_denoising = True
        scn.render.resolution_x, scn.render.resolution_y = 800, 600
        scn.render.image_settings.file_format = 'PNG'
        sx, sy, sz = self.info['size_xyz']
        R = max(sx, sy, sz) * 1.9 * dist
        co = np.empty(len(self.mesh.data.vertices) * 3)
        self.mesh.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        ctr = Vector(((co.min(0) + co.max(0)) / 2).tolist())
        views = [('3q', Vector((0.72, -0.6, 0.42))), ('side', Vector((1, -0.05, 0.12))), ('front', Vector((0.05, -1, 0.12)))]
        rows = []
        for label, show, hide, ang in [('old', olds, news, None)] + [('new%d' % i, news, olds, a) for i, a in enumerate(poses or [{}])]:
            for o in show:
                o.hide_render = False
            for o in hide:
                o.hide_render = True
            if ang is not None and self.joints:
                self._set_pose(ang)
            row = []
            for vn, d in views:
                cam.location = ctr + d.normalized() * R
                cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
                scn.render.filepath = os.path.join(rd, '_tmp.png')
                bpy.ops.render.render(write_still=True)
                im = bpy.data.images.load(scn.render.filepath)
                px = np.empty(800 * 600 * 4, dtype=np.float32)
                im.pixels.foreach_get(px)
                row.append(px.reshape(600, 800, 4))
                bpy.data.images.remove(im)
            rows.append(np.hstack(row))
        if self.joints:
            self._set_pose({})
        for tr in tracks:
            tr.mute = False
        sheet = np.vstack(list(reversed(rows)))          # 影像的第 0 列在下面：倒過來疊，舊的才在最上排
        out = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0], alpha=False)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(rd, self.name + '_compare.jpg')
        out.file_format = 'JPEG'
        out.save()
        os.remove(os.path.join(rd, '_tmp.png'))
        for o in olds + [fl, sun, cam]:
            bpy.data.objects.remove(o)
        print('COMPARE', out.filepath_raw, round(time.time() - T0, 1), 's')
