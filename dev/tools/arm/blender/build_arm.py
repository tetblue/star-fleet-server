# 重型機械臂：整台由這支腳本在 Blender 裡建出來（幾何、材質、UV、貼圖烘焙、骨架、動作、匯出）。
# 做法照 AnyMachine 的 PIPELINE.md 第 5～10 步；尺寸與關節沿用 ../machine.js（three.js 版），兩邊的骨頭同名。
#   blender --background --factory-startup --python build_arm.py -- [--no-bake] [--no-check] [--no-export] [--render] [--tex 2048]
#   加 --check-only：只建幾何、跑互穿檢查就結束（幾秒），不動 .blend、貼圖、GLB
# 輸出在 ../out/：arm_blender.blend、arm_blender.glb、arm_blender_info.json、check_blender.json、textures/、renders/
#
# 座標：零件用「手臂座標」建（公尺；x 往前、y 往上、z 是關節的轉軸方向），跟 machine.js 一樣；最後整體轉成 Blender 的 Z 朝上。
#
# 零件表（每個零件只跟一根骨頭；標 * 的是銷，穿過兩邊的零件，不參加互穿檢查）
#   Root  ：Base_Plate 底板與地腳螺栓、Pedestal 底座筒＋八片肋板＋警示帶、Slew_Ring_Fixed 固定環與齒
#   Yaw   ：Slew_Ring_Moving 迴轉環、Turret_Deck 甲板、Slew_Motor 迴轉馬達、Yoke_L／Yoke_R 夾住肩膀的兩片立板、Yoke_Back 背板、
#           Shoulder_Drum_L／R 肩馬達鼓、Shoulder_Pin*、Act_Sh_Bracket 肩油壓缸耳座、Act_Sh_BasePin*、Cabinet 電控箱
#   Upper ：Upper_Arm 上臂（肩的舌、兩片側板、箱梁、油管）、Elbow_Drum_L／R、Elbow_Pin*、Upper_Lugs 兩組耳座、Upper_LugPins*
#   Fore  ：Forearm 前臂（肘的舌、搖臂、梁、白殼、腕的叉）、Horn_Pin*、Wrist_Drum_L／R、Wrist_Pin*
#   Wrist ：Wrist_Block 腕的舌、頸、旋轉座
#   Hand  ：Palm 旋轉環、掌、感測燈、三組爪座
#   Claw_A／B／C：Claw_Finger_* 兩節爪＋夾墊、Claw_Pin_**
#   Act_Sh_Cyl／Act_El_Cyl：Act_*_Barrel 缸筒（尾端的耳環、空心筒身、油口、硬管）
#   Act_Sh_Rod／Act_El_Rod：Act_*_Piston 活塞桿與耳環
import bpy, bmesh, sys, os, json, time
import numpy as np
from math import sin, cos, pi, radians, sqrt, atan2, hypot, acos
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

T0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.normpath(os.path.join(HERE, '..', 'out'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TEX_N = int(ARGS[ARGS.index('--tex') + 1]) if '--tex' in ARGS else 2048
OUT = 'arm_blender'
D = pi / 180
os.makedirs(OUTD, exist_ok=True)

# ----------------------------------------------------------------------------------------------
# 尺寸、關節（跟 machine.js 的 DIM、JOINTS 一樣）
# ----------------------------------------------------------------------------------------------
H, L1, L2, L3, HANDX, CLAWX, CLAWR = 3.2, 4.2, 3.6, 1.75, 0.62, 0.47, 0.30
JOINTS = [   # key, 名稱, 最小, 最大, 靜止（度）
    ('yaw', '底座迴轉', -170, 170, 0), ('sh', '肩', 30, 105, 75), ('el', '肘', -125, -25, -105),
    ('wr', '腕俯仰', -105, 60, -60), ('roll', '腕旋轉', -180, 180, 0), ('grip', '夾爪', -4, 36, 36)]
JLIM = {j[0]: (j[2], j[3]) for j in JOINTS}
REST_ANG = {j[0]: j[4] for j in JOINTS}
CLIP_BONES = dict(yaw=['Yaw'], sh=['Upper', 'Act_Sh_Cyl', 'Act_Sh_Rod'], el=['Fore', 'Act_El_Cyl', 'Act_El_Rod'], wr=['Wrist'], roll=['Hand'],
                  grip=['Claw_A', 'Claw_B', 'Claw_C'])
PARENT = dict(Root=None, Yaw='Root', Upper='Yaw', Fore='Upper', Wrist='Fore', Hand='Wrist', TCP='Hand', Claw_A='Hand', Claw_B='Hand', Claw_C='Hand',
              Act_Sh_Cyl='Yaw', Act_Sh_Rod='Upper', Act_El_Cyl='Upper', Act_El_Rod='Fore')
BONE_ORDER = list(PARENT)


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


def at(x, y, rz=0.0):
    """手臂平面裡的擺放：移到 (x, y)，繞 z 轉 rz 度。"""
    return Tm(x, y, 0) @ Rz(rz * D)


# 手臂座標 (x, y, z) → Blender (x, -z, y)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# ----------------------------------------------------------------------------------------------
# 油壓缸固定點：掃過關節整個行程，留下「活塞桿套得住」而且力臂最大的一組；找不到就讓建置失敗
# ----------------------------------------------------------------------------------------------
def search_anchors(name, J, rng, tops, bots, clear):
    best = None
    for tp in tops:
        for bp in bots:
            lo, hi, lev = 1e9, 0.0, 1e9
            for i in range(33):
                a = (rng[0] + (rng[1] - rng[0]) * i / 32) * D
                bx, by = J[0] + bp[0] * cos(a) - bp[1] * sin(a), J[1] + bp[0] * sin(a) + bp[1] * cos(a)
                ln = hypot(bx - tp[0], by - tp[1])
                lo, hi = min(lo, ln), max(hi, ln)
                lev = min(lev, abs((J[0] - tp[0]) * (by - tp[1]) - (J[1] - tp[1]) * (bx - tp[0])) / ln)
            ok = hi <= 2 * lo - 0.7 and lev >= clear
            sc = (1 if ok else 0, lev if ok else -(hi / lo))
            if best is None or sc > best['sc']:
                best = dict(sc=sc, tp=tp, bp=bp, lo=lo, hi=hi, lever=lev, ok=ok)
    assert best['ok'], '油壓缸 %s：找不到套得住的固定點（最長 %.2f、最短 %.2f）' % (name, best['hi'], best['lo'])
    best.update(Lc=best['lo'] - 0.25, J=J, name=name)
    best['Lr'] = best['hi'] - best['Lc'] + 0.18
    print('ACT %-3s 缸筒端 %s 活塞桿端 (%.3f, %.3f) 行程 %.2f..%.2f 力臂 %.2f 缸筒 %.2f 活塞桿 %.2f' % (
        name, tp_fmt(best['tp']), best['bp'][0], best['bp'][1], best['lo'], best['hi'], best['lever'], best['Lc'], best['Lr']))
    return best


def tp_fmt(p):
    return '(%.2f, %.2f)' % (p[0], p[1])


SH = search_anchors('肩', (0, H), JLIM['sh'], [(x, y) for x in (1.35, 1.5, 1.65, 1.8, 1.95) for y in (H - 1.75, H - 1.6, H - 1.45)],
                    [(x, y) for x in (1.6, 1.9, 2.2, 2.6) for y in (-0.45, -0.55)], 0.5 + 0.15 + 0.1)
EL = search_anchors('肘', (L1, 0), JLIM['el'], [(x, y) for x in (L1 - 3.4, L1 - 3.0, L1 - 2.6, L1 - 2.2) for y in (0.55, 0.65, 0.75)],
                    [(r * cos(a * D), r * sin(a * D)) for r in (0.75, 0.85, 0.95) for a in (150, 160, 170)], 0.3 + 0.11 + 0.1)
SH['rc'], EL['rc'] = 0.15, 0.11


# ----------------------------------------------------------------------------------------------
# 正向運動學：角度（度）→ 每根骨頭在手臂座標裡的位置（跟 machine.js 的 pose 一樣）
# ----------------------------------------------------------------------------------------------
def clamp_ang(ang):
    return {k: max(JLIM[k][0], min(JLIM[k][1], v)) for k, v in ang.items()}


def fk(ang):
    a = dict(REST_ANG)
    a.update(ang)
    W = {'Root': Matrix.Identity(4)}
    W['Yaw'] = Ry(a['yaw'] * D)
    W['Upper'] = W['Yaw'] @ Tm(0, H, 0) @ Rz(a['sh'] * D)
    W['Fore'] = W['Upper'] @ Tm(L1, 0, 0) @ Rz(a['el'] * D)
    W['Wrist'] = W['Fore'] @ Tm(L2, 0, 0) @ Rz(a['wr'] * D)
    W['Hand'] = W['Wrist'] @ Tm(HANDX, 0, 0) @ Rx(a['roll'] * D)
    W['TCP'] = W['Hand'] @ Tm(L3 - HANDX, 0, 0)
    for i, k in enumerate('ABC'):
        W['Claw_' + k] = W['Hand'] @ Rx(i * 120 * D) @ Tm(CLAWX, CLAWR, 0) @ Rz(a['grip'] * D)
    for n, A, q, top, bot in (('Sh', SH, a['sh'] * D, 'Yaw', 'Upper'), ('El', EL, a['el'] * D, 'Upper', 'Fore')):
        bx, by = A['J'][0] + A['bp'][0] * cos(q) - A['bp'][1] * sin(q), A['J'][1] + A['bp'][0] * sin(q) + A['bp'][1] * cos(q)
        dr = atan2(by - A['tp'][1], bx - A['tp'][0])
        W['Act_%s_Cyl' % n] = W[top] @ Tm(A['tp'][0], A['tp'][1], 0) @ Rz(dr)
        W['Act_%s_Rod' % n] = W[bot] @ Tm(A['bp'][0], A['bp'][1], 0) @ Rz(dr + pi - q)
        A['len'] = hypot(bx - A['tp'][0], by - A['tp'][1])
    return W


REST3 = fk({})                                   # 手臂座標
REST = {b: C @ m for b, m in REST3.items()}      # Blender 座標
LOCREST = {b: REST[PARENT[b]].inverted() @ REST[b] for b in BONE_ORDER if PARENT[b]}

# ----------------------------------------------------------------------------------------------
# 場景、材質（這裡是程序材質；後面烘成貼圖）
# ----------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
SCN = bpy.context.scene
SCN.unit_settings.system = 'METRIC'
COL = bpy.data.collections.new('Arm')
SCN.collection.children.link(COL)
MATS = {}
BEV = dict(white=0.018, navy=0.014, steel=0.008, chrome=0.004, rubber=0.006, orange=0.006, hazard=0.014, glow=0.0)


def _nodes(name):
    m = bpy.data.materials.new('M_Arm_' + name.capitalize())
    m.use_nodes = True
    MATS[name] = m
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF'], nt.links.new


def _n(nt, kind, **inp):
    n = nt.nodes.new(kind)
    for k, v in inp.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def mat_paint(name, col, rough, wear=1.0):
    """烤漆：大塊色差、往下流的污痕、凸出的邊角掉漆露出金屬、細小的顆粒。"""
    m, nt, b, L = _nodes(name)
    tc = _n(nt, 'ShaderNodeTexCoord')
    big = _n(nt, 'ShaderNodeTexNoise', Scale=0.6, Detail=4.0)
    tone = _n(nt, 'ShaderNodeMapRange')
    for k, v in (('From Min', 0.3), ('From Max', 0.7), ('To Min', 0.86), ('To Max', 1.05)):
        tone.inputs[k].default_value = v
    mul = _n(nt, 'ShaderNodeMixRGB', blend_type='MULTIPLY')
    mul.inputs['Fac'].default_value = 1.0
    mul.inputs['Color1'].default_value = (*col, 1)
    mp = _n(nt, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (7.0, 7.0, 0.3)
    st = _n(nt, 'ShaderNodeTexNoise', Scale=1.0, Detail=6.0)
    sr = _n(nt, 'ShaderNodeMapRange')
    for k, v in (('From Min', 0.55), ('From Max', 0.8), ('To Min', 0.0), ('To Max', 0.4 * wear)):
        sr.inputs[k].default_value = v
    grime = _n(nt, 'ShaderNodeMixRGB')
    grime.inputs['Color2'].default_value = (0.10, 0.09, 0.08, 1)
    bv = _n(nt, 'ShaderNodeBevel', samples=8)    # 邊角：倒圓後的法線跟原本的法線差得多的地方 → 磨損
    bv.inputs['Radius'].default_value = 0.022
    geo = _n(nt, 'ShaderNodeNewGeometry')
    dot = _n(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT')
    er = _n(nt, 'ShaderNodeMapRange')
    for k, v in (('From Min', 0.995), ('From Max', 0.93), ('To Min', 0.0), ('To Max', 1.0)):
        er.inputs[k].default_value = v
    chip = _n(nt, 'ShaderNodeTexNoise', Scale=11.0, Detail=5.0)
    cr = _n(nt, 'ShaderNodeMapRange')
    for k, v in (('From Min', 0.42), ('From Max', 0.58), ('To Min', 0.0), ('To Max', 1.0)):
        cr.inputs[k].default_value = v
    mask = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    mask2 = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    mask2.inputs[1].default_value = wear
    bare = _n(nt, 'ShaderNodeMixRGB')
    bare.inputs['Color2'].default_value = (0.30, 0.31, 0.33, 1)
    fine = _n(nt, 'ShaderNodeTexNoise', Scale=38.0, Detail=4.0)
    rr = _n(nt, 'ShaderNodeMapRange')
    rr.inputs['To Min'].default_value = rough - 0.08
    rr.inputs['To Max'].default_value = rough + 0.10
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
    m.diffuse_color = (*col, 1)
    return m


def mat_plain(name, col, metallic, rough, noise=0.08, nscale=8.0, bump=0.0, emit=None, strength=0.0):
    m, nt, b, L = _nodes(name)
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    elif noise:
        tc = _n(nt, 'ShaderNodeTexCoord')
        nz = _n(nt, 'ShaderNodeTexNoise', Scale=nscale, Detail=5.0)
        mr = _n(nt, 'ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = max(rough - noise, 0.03)
        mr.inputs['To Max'].default_value = rough + noise
        L(tc.outputs['Object'], nz.inputs['Vector'])
        L(nz.outputs['Fac'], mr.inputs['Value'])
        L(mr.outputs['Result'], b.inputs['Roughness'])
        if bump:
            bp = _n(nt, 'ShaderNodeBump')
            bp.inputs['Strength'].default_value = bump
            bp.inputs['Distance'].default_value = 0.006
            L(nz.outputs['Fac'], bp.inputs['Height'])
            L(bp.outputs['Normal'], b.inputs['Normal'])
    m.diffuse_color = (*col, 1)
    return m


def mat_hazard(name):
    """黃黑斜紋警示帶：繞著垂直軸的角度加上高度，取正弦。"""
    m, nt, b, L = _nodes(name)
    tc = _n(nt, 'ShaderNodeTexCoord')
    sp = _n(nt, 'ShaderNodeSeparateXYZ')
    an = _n(nt, 'ShaderNodeMath', operation='ARCTAN2')
    k1 = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    k1.inputs[1].default_value = 14.0
    k2 = _n(nt, 'ShaderNodeMath', operation='MULTIPLY')
    k2.inputs[1].default_value = 22.0
    ad = _n(nt, 'ShaderNodeMath', operation='ADD')
    sn = _n(nt, 'ShaderNodeMath', operation='SINE')
    gt = _n(nt, 'ShaderNodeMath', operation='GREATER_THAN')
    gt.inputs[1].default_value = 0.0
    mx = _n(nt, 'ShaderNodeMixRGB')
    mx.inputs['Color1'].default_value = (0.02, 0.02, 0.022, 1)
    mx.inputs['Color2'].default_value = (0.85, 0.52, 0.03, 1)
    L(tc.outputs['Object'], sp.inputs[0])
    L(sp.outputs['Y'], an.inputs[0])
    L(sp.outputs['X'], an.inputs[1])
    L(an.outputs[0], k1.inputs[0])
    L(sp.outputs['Z'], k2.inputs[0])
    L(k1.outputs[0], ad.inputs[0])
    L(k2.outputs[0], ad.inputs[1])
    L(ad.outputs[0], sn.inputs[0])
    L(sn.outputs[0], gt.inputs[0])
    L(gt.outputs[0], mx.inputs['Fac'])
    L(mx.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.55
    return m


mat_paint('white', (0.72, 0.74, 0.77), 0.40)
mat_paint('navy', (0.018, 0.045, 0.13), 0.45, wear=1.3)
mat_plain('steel', (0.16, 0.17, 0.19), 0.9, 0.42, noise=0.14, nscale=6.0)
mat_plain('chrome', (0.80, 0.82, 0.85), 1.0, 0.14, noise=0.05, nscale=20.0)
mat_plain('rubber', (0.018, 0.018, 0.02), 0.0, 0.82, noise=0.08, nscale=30.0, bump=0.25)
mat_paint('orange', (0.80, 0.22, 0.03), 0.6, wear=0.7)
mat_hazard('hazard')
mat_plain('glow', (0.01, 0.03, 0.08), 0.0, 0.3, emit=(0.16, 0.55, 1.0), strength=5.0)
MATS['glow'].name = 'M_Arm_Glow'

# ----------------------------------------------------------------------------------------------
# 幾何小工具（都在骨頭自己的手臂座標裡建）
# ----------------------------------------------------------------------------------------------
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
            j = (i + 1) % n
            face(bm, [a[i], a[j], b[j], b[i]])
    if cap0:
        face(bm, list(reversed(vr[0])))
    if cap1:
        face(bm, vr[-1])


def revolve(bm, prof, M, segs=32, cap0=True, cap1=True):
    """prof＝[(沿軸的位置, 半徑)…]，繞 M 的 z 軸。"""
    loft(bm, [[M @ V(r * cos(2 * pi * k / segs), r * sin(2 * pi * k / segs), h) for k in range(segs)] for h, r in prof], cap0, cap1)


def cylZ(bm, cx, cy, z0, z1, r, segs=32, M=None):
    revolve(bm, [(z0, r), (z1, r)], (M or Matrix.Identity(4)) @ Tm(cx, cy, 0), segs)


def cylX(bm, x0, x1, cy, cz, r, r1=None, segs=28, M=None):
    revolve(bm, [(x0, r), (x1, r if r1 is None else r1)], (M or Matrix.Identity(4)) @ Tm(0, cy, cz) @ AXX, segs)


def cylY(bm, cx, cz, y0, y1, r, r1=None, segs=48, M=None):
    revolve(bm, [(y0, r), (y1, r if r1 is None else r1)], (M or Matrix.Identity(4)) @ Tm(cx, 0, cz) @ AXY, segs)


def box(bm, x0, x1, y0, y1, z0, z1, M=None):
    c = [V(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    if M is not None:
        c = [M @ p for p in c]
    vs = [bm.verts.new(p) for p in c]
    for idx in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        face(bm, [vs[i] for i in idx])


def plate(bm, pts, z0, z1, M=None):
    """xy 平面的凸外形，從 z0 擠到 z1。"""
    M = M or Matrix.Identity(4)
    a = [bm.verts.new(M @ V(x, y, z0)) for x, y in pts]
    b = [bm.verts.new(M @ V(x, y, z1)) for x, y in pts]
    face(bm, list(reversed(a)))
    face(bm, b)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        face(bm, [a[i], a[j], b[j], b[i]])


def link2d(ln, r0, r1, x0=0.0, seg=12):
    """兩個圓的外包絡：(x0, 0) 半徑 r0 → (x0 + ln, 0) 半徑 r1。"""
    ang = acos(max(-1.0, min(1.0, (r0 - r1) / ln)))
    pts = [(x0 + ln + r1 * cos(-ang + 2 * ang * i / seg), r1 * sin(-ang + 2 * ang * i / seg)) for i in range(seg + 1)]
    pts += [(x0 + r0 * cos(ang + (2 * pi - 2 * ang) * i / seg), r0 * sin(ang + (2 * pi - 2 * ang) * i / seg)) for i in range(seg + 1)]
    return pts


def arc(cx, cy, r, a0, a1, n=16):
    return [(cx + r * cos((a0 + (a1 - a0) * i / n) * D), cy + r * sin((a0 + (a1 - a0) * i / n) * D)) for i in range(n + 1)]


def boltsZ(bm, cx, cy, R, n, z, h, rb=0.03, M=None):
    for i in range(n):
        a = (i + 0.5) / n * 2 * pi
        cylZ(bm, cx + R * cos(a), cy + R * sin(a), min(z, z + h), max(z, z + h), rb, 6, M)


def boltsY(bm, cx, cz, R, n, y, h, rb=0.035):
    for i in range(n):
        a = (i + 0.5) / n * 2 * pi
        cylY(bm, cx + R * cos(a), cz + R * sin(a), y, y + h, rb, None, 6)


def boltsX(bm, x, h, R, n, rb=0.022):
    for i in range(n):
        a = (i + 0.5) / n * 2 * pi
        cylX(bm, min(x, x + h), max(x, x + h), R * cos(a), R * sin(a), rb, None, 6)


def hose(bm, pts, r, segs=8):
    """沿著折線的軟管（先把折角磨圓兩次）。"""
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


def piece(name, bm, mname):
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
    COL.objects.link(ob)
    me.materials.append(MATS[mname])
    if BEV[mname] > 0:
        m = ob.modifiers.new('bev', 'BEVEL')
        m.width, m.segments, m.limit_method, m.angle_limit, m.use_clamp_overlap = BEV[mname], 1, 'ANGLE', ang, True
    t = ob.modifiers.new('tri', 'TRIANGULATE')
    t.quad_method = 'SHORTEST_DIAGONAL'
    w = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
    w.keep_sharp, w.weight = True, 60
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    ob.modifiers.clear()
    ob.data = me2
    me2.name = name
    bpy.data.meshes.remove(me)
    return ob


PARTS = {}      # 名稱 → (物件, 骨頭, 要不要參加互穿檢查)


def part(name, bone, P, check=True):
    obs = [piece(name, bm, k) for k, bm in P.items() if len(bm.faces)]
    ob = obs[0]
    if len(obs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.join()
    ob.name = ob.data.name = name
    ob.matrix_world = REST[bone]
    PARTS[name] = (ob, bone, check)
    return ob


# ----------------------------------------------------------------------------------------------
# 底座（Root）
# ----------------------------------------------------------------------------------------------
P = Pal()
cylY(P['steel'], 0, 0, 0, 0.18, 1.75)
boltsY(P['steel'], 0, 0, 1.56, 12, 0.18, 0.06, 0.06)
for i in range(12):                                   # 墊圈
    a = (i + 0.5) / 12 * 2 * pi
    cylY(P['steel'], 1.56 * cos(a), 1.56 * sin(a), 0.18, 0.195, 0.1, None, 16)
part('Base_Plate', 'Root', P)
P = Pal()
revolve(P['white'], [(0.18, 1.28), (0.34, 1.22), (0.82, 1.09), (0.95, 1.05)], AXY, 64)
revolve(P['hazard'], [(0.18, 1.30), (0.33, 1.245)], AXY, 64, False, False)
revolve(P['navy'], [(0.44, 1.215), (0.62, 1.167)], AXY, 64, False, False)
revolve(P['glow'], [(0.51, 1.205), (0.55, 1.195)], AXY, 64, False, False)
for i in range(8):                                    # 肋板
    plate(P['steel'], [(1.20, 0.18), (1.64, 0.18), (1.64, 0.24), (1.14, 0.70), (1.08, 0.70)], -0.03, 0.03, Ry((i + 0.5) * 45 * D))
box(P['navy'], 1.10, 1.19, 0.66, 0.90, -0.22, 0.22, Ry(180 * D))      # 檢修蓋
part('Pedestal', 'Root', P)
P = Pal()
cylY(P['steel'], 0, 0, 0.95, 1.12, 1.18)
for i in range(72):                                   # 齒
    box(P['steel'], 1.17, 1.215, 0.99, 1.08, -0.022, 0.022, Ry(i * 5 * D))
part('Slew_Ring_Fixed', 'Root', P)

# ----------------------------------------------------------------------------------------------
# 迴轉座（Yaw）
# ----------------------------------------------------------------------------------------------
P = Pal()
cylY(P['steel'], 0, 0, 1.14, 1.28, 1.12)
boltsY(P['steel'], 0, 0, 1.085, 30, 1.28, 0.02, 0.026)
part('Slew_Ring_Moving', 'Yaw', P)
P = Pal()
cylY(P['white'], 0, 0, 1.28, 1.48, 1.05)
boltsY(P['steel'], 0, 0, 0.96, 18, 1.48, 0.025, 0.03)
part('Turret_Deck', 'Yaw', P)
P = Pal()                                              # 迴轉馬達（甲板後側）
cylY(P['navy'], -0.30, -0.84, 1.48, 1.92, 0.15, None, 24)
cylY(P['steel'], -0.30, -0.84, 1.92, 1.98, 0.11, None, 24)
for y in (1.6, 1.68, 1.76, 1.84):
    cylY(P['steel'], -0.30, -0.84, y, y + 0.02, 0.165, None, 24)
box(P['steel'], -0.42, -0.18, 1.48, 1.54, -0.96, -0.72)
part('Slew_Motor', 'Yaw', P)
YOKE = [(-0.75, 1.48), (0.85, 1.48)] + arc(0, H, 0.6, -25, 205)
for n, s in (('L', 1), ('R', -1)):
    P = Pal()
    z0, zo = (0.5 if s > 0 else -0.66), s * 0.66
    plate(P['white'], YOKE, z0, z0 + 0.16)
    box(P['navy'], -0.14, 0.14, 1.72, H - 0.78, min(zo, zo + s * 0.014), max(zo, zo + s * 0.014))
    box(P['glow'], -0.028, 0.028, 1.9, H - 0.95, min(zo, zo + s * 0.022), max(zo, zo + s * 0.022))
    for bx, by in ((-0.6, 1.62), (0.7, 1.62), (-0.42, 2.3), (0.5, 2.3)):
        cylZ(P['steel'], bx, by, min(zo, zo + s * 0.02), max(zo, zo + s * 0.02), 0.035, 6)
    plate(P['steel'], [(-0.72, 1.48), (-0.2, 1.48), (-0.5, 2.5), (-0.58, 2.5)], zo if s > 0 else zo - 0.03, zo + 0.03 if s > 0 else zo)   # 外側斜撐
    part('Yoke_' + n, 'Yaw', P)
P = Pal()
box(P['navy'], -0.75, -0.55, 1.48, H - 0.9, -0.5, 0.5)
cylZ(P['steel'], -0.5, H - 0.55, -0.5, 0.5, 0.06, 16)          # 兩片立板之間的橫桿
part('Yoke_Back', 'Yaw', P)
P = Pal()
cylZ(P['navy'], 0, H, 0.66, 0.92, 0.46)
for z in (0.72, 0.78, 0.84):
    cylZ(P['steel'], 0, H, z, z + 0.022, 0.485)
cylZ(P['white'], 0, H, 0.92, 0.985, 0.34)
boltsZ(P['steel'], 0, H, 0.40, 10, 0.92, 0.03)
box(P['steel'], -0.12, 0.12, H + 0.42, H + 0.56, 0.70, 0.88)   # 接線盒
hose(P['rubber'], [V(-0.06, H + 0.5, 0.8), V(-0.5, H + 0.45, 0.8), V(-0.86, H - 0.2, 0.74), V(-0.9, 2.3, 0.5), V(-0.9, 2.2, 0.3)], 0.035)
part('Shoulder_Drum_L', 'Yaw', P)
P = Pal()
cylZ(P['navy'], 0, H, -0.80, -0.66, 0.40)
cylZ(P['steel'], 0, H, -0.86, -0.80, 0.2)
boltsZ(P['steel'], 0, H, 0.32, 8, -0.80, -0.025)
part('Shoulder_Drum_R', 'Yaw', P)
P = Pal()
cylZ(P['chrome'], 0, H, -0.66, 0.66, 0.14)
part('Shoulder_Pin', 'Yaw', P, False)
P = Pal()
_bx, _by = 0.7, 1.62
_ln, _rz = hypot(SH['tp'][0] - _bx, SH['tp'][1] - _by), atan2(SH['tp'][1] - _by, SH['tp'][0] - _bx) / D
for z in (0.19, -0.27):                                         # 兩片耳板的間距比缸筒寬，缸筒往後倒的時候從中間過
    plate(P['steel'], link2d(_ln, 0.22, 0.14), z, z + 0.08, at(_bx, _by, _rz))
box(P['steel'], 0.5, 0.9, 1.48, 1.60, -0.27, 0.27)             # 底板
box(P['steel'], 0.52, 0.70, 1.6, 1.78, -0.19, 0.19)            # 兩片耳板之間的腹板
part('Act_Sh_Bracket', 'Yaw', P)
P = Pal()
cylZ(P['chrome'], SH['tp'][0], SH['tp'][1], -0.31, 0.31, 0.07, 20)
for s in (1, -1):
    cylZ(P['steel'], SH['tp'][0], SH['tp'][1], min(s * 0.27, s * 0.30), max(s * 0.27, s * 0.30), 0.1, 6)
    cylZ(P['steel'], SH['tp'][0], SH['tp'][1], min(s * 0.11, s * 0.185), max(s * 0.11, s * 0.185), 0.095, 16)   # 襯套
part('Act_Sh_BasePin', 'Yaw', P, False)
P = Pal()
box(P['white'], -1.0, -0.76, 1.48, 2.5, -0.4, 0.4)
box(P['navy'], -1.014, -1.0, 1.66, 2.34, -0.32, 0.32)
box(P['glow'], -1.024, -1.014, 2.2, 2.24, -0.24, 0.24)
for i in range(5):                                             # 散熱百葉
    box(P['steel'], -1.03, -1.014, 1.74 + i * 0.07, 1.775 + i * 0.07, -0.24, 0.24)
box(P['steel'], -1.03, -1.014, 1.95, 2.1, 0.25, 0.29)          # 門把
part('Cabinet', 'Yaw', P)

# ----------------------------------------------------------------------------------------------
# 上臂（Upper）：原點在肩軸，+x 沿著手臂
# ----------------------------------------------------------------------------------------------
P = Pal()
cylZ(P['steel'], 0, 0, -0.44, 0.44, 0.5, 40)
for z in (0.30, -0.42):
    plate(P['white'], link2d(L1, 0.44, 0.36, 0.0, 16), z, z + 0.12)
box(P['navy'], 0.35, L1 - 1.0, -0.26, 0.26, -0.30, 0.30)
for i in range(5):                                             # 箱梁上下的橫肋
    x = 0.9 + i * 0.55
    box(P['steel'], x, x + 0.06, -0.3, -0.26, -0.30, 0.30)
for s in (1, -1):
    box(P['navy'], 0.9, L1 - 0.9, -0.065, 0.065, min(s * 0.42, s * 0.434), max(s * 0.42, s * 0.434))
    box(P['glow'], 1.2, L1 - 1.2, -0.02, 0.02, min(s * 0.434, s * 0.442), max(s * 0.434, s * 0.442))
    boltsZ(P['steel'], 0, 0, 0.36, 12, s * 0.42, s * 0.022, 0.028)
    boltsZ(P['steel'], L1, 0, 0.29, 10, s * 0.42, s * 0.022, 0.024)
    hose(P['rubber'], [V(0.5, 0.2, s * 0.2), V(0.62, 0.3, s * 0.2), V(L1 - 1.3, 0.3, s * 0.2), V(L1 - 1.12, 0.2, s * 0.2)], 0.035)
    for x in (1.0, 2.0, 2.9):                                  # 油管夾
        box(P['steel'], x, x + 0.06, 0.26, 0.345, s * 0.2 - 0.05, s * 0.2 + 0.05)
part('Upper_Arm', 'Upper', P)
P = Pal()
cylZ(P['navy'], L1, 0, 0.42, 0.6, 0.34)
for z in (0.46, 0.52):
    cylZ(P['steel'], L1, 0, z, z + 0.02, 0.36)
cylZ(P['white'], L1, 0, 0.6, 0.66, 0.24)
boltsZ(P['steel'], L1, 0, 0.29, 8, 0.6, 0.028, 0.024)
part('Elbow_Drum_L', 'Upper', P)
P = Pal()
cylZ(P['navy'], L1, 0, -0.56, -0.42, 0.30)
cylZ(P['steel'], L1, 0, -0.62, -0.56, 0.16)
part('Elbow_Drum_R', 'Upper', P)
P = Pal()
cylZ(P['chrome'], L1, 0, -0.42, 0.42, 0.1, 24)
part('Elbow_Pin', 'Upper', P, False)
P = Pal()
for z in (0.10, -0.17):
    plate(P['steel'], link2d(EL['tp'][1] - 0.2, 0.22, 0.14), z, z + 0.07, at(EL['tp'][0], 0.2, 90))
    plate(P['steel'], link2d(-SH['bp'][1] - 0.2, 0.22, 0.14), z, z + 0.07, at(SH['bp'][0], -0.2, -90))
box(P['steel'], EL['tp'][0] - 0.3, EL['tp'][0] + 0.3, 0.26, 0.30, -0.2, 0.2)
box(P['steel'], SH['bp'][0] - 0.3, SH['bp'][0] + 0.3, -0.30, -0.26, -0.2, 0.2)
part('Upper_Lugs', 'Upper', P)
P = Pal()
cylZ(P['chrome'], EL['tp'][0], EL['tp'][1], -0.2, 0.2, 0.055, 16)
cylZ(P['chrome'], SH['bp'][0], SH['bp'][1], -0.2, 0.2, 0.06, 16)
part('Upper_LugPins', 'Upper', P, False)

# ----------------------------------------------------------------------------------------------
# 前臂（Fore）：原點在肘軸
# ----------------------------------------------------------------------------------------------
P = Pal()
cylZ(P['steel'], 0, 0, -0.27, 0.27, 0.30, 36)
_hl, _hr = hypot(*EL['bp']), atan2(EL['bp'][1], EL['bp'][0]) / D
for z in (0.10, -0.17):
    plate(P['steel'], link2d(_hl, 0.26, 0.13), z, z + 0.07, Rz(_hr * D))
plate(P['navy'], link2d(L2 - 0.75, 0.27, 0.22, 0.0, 14), -0.24, 0.24)
box(P['white'], 0.6, L2 - 1.05, -0.29, 0.29, -0.27, 0.27)
for s in (1, -1):
    box(P['navy'], 0.8, L2 - 1.25, -0.055, 0.055, min(s * 0.27, s * 0.282), max(s * 0.27, s * 0.282))
    box(P['glow'], 1.0, L2 - 1.45, -0.017, 0.017, min(s * 0.282, s * 0.289), max(s * 0.282, s * 0.289))
    boltsZ(P['steel'], L2, 0, 0.15, 8, s * 0.24, s * 0.018, 0.018)
for x in (0.6, L2 - 1.11):                                     # 白殼兩頭的收邊框
    box(P['steel'], x, x + 0.06, -0.30, 0.30, -0.28, 0.28)
hose(P['rubber'], [V(0.5, -0.24, 0.0), V(0.62, -0.33, 0.0), V(L2 - 1.2, -0.33, 0.0), V(L2 - 1.0, -0.24, 0.0)], 0.03)
for z in (0.16, -0.24):
    plate(P['steel'], link2d(0.9, 0.22, 0.2, L2 - 0.9), z, z + 0.08)
part('Forearm', 'Fore', P)
P = Pal()
cylZ(P['chrome'], EL['bp'][0], EL['bp'][1], -0.2, 0.2, 0.05, 16)
part('Horn_Pin', 'Fore', P, False)
P = Pal()
cylZ(P['navy'], L2, 0, 0.24, 0.36, 0.2)
cylZ(P['white'], L2, 0, 0.36, 0.4, 0.13)
part('Wrist_Drum_L', 'Fore', P)
P = Pal()
cylZ(P['navy'], L2, 0, -0.34, -0.24, 0.18)
part('Wrist_Drum_R', 'Fore', P)
P = Pal()
cylZ(P['chrome'], L2, 0, -0.24, 0.24, 0.07, 20)
part('Wrist_Pin', 'Fore', P, False)

# ----------------------------------------------------------------------------------------------
# 手腕（Wrist）、手（Hand）、三支爪（Claw_A／B／C）
# ----------------------------------------------------------------------------------------------
P = Pal()
cylZ(P['steel'], 0, 0, -0.14, 0.14, 0.19)
box(P['steel'], 0.05, 0.42, -0.15, 0.15, -0.14, 0.14)
cylX(P['navy'], 0.36, 0.585, 0, 0, 0.28)
cylX(P['steel'], 0.585, 0.612, 0, 0, 0.31)
box(P['steel'], 0.38, 0.56, 0.26, 0.34, -0.09, 0.09)           # 旋轉馬達
part('Wrist_Block', 'Wrist', P)
P = Pal()
cylX(P['steel'], 0.01, 0.10, 0, 0, 0.26)
boltsX(P['steel'], 0.10, 0.02, 0.305, 12)
cylX(P['white'], 0.10, 0.34, 0, 0, 0.30, 0.34)
cylX(P['navy'], 0.34, 0.38, 0, 0, 0.34)
cylX(P['glow'], 0.38, 0.40, 0, 0, 0.09)
for i in range(3):
    for z in (0.1, -0.16):
        box(P['steel'], 0.3, 0.56, 0.2, 0.38, z, z + 0.06, Rx(i * 120 * D))
part('Palm', 'Hand', P)
_kx, _ky, _tx, _ty = 0.5, 0.22, 0.95, -0.05
_rb = atan2(_ty - _ky, _tx - _kx) / D
for k in 'ABC':
    P = Pal()
    cylZ(P['steel'], 0, 0, -0.085, 0.085, 0.08, 20)
    plate(P['white'], link2d(hypot(_kx, _ky), 0.085, 0.07), -0.06, 0.06, Rz(atan2(_ky, _kx)))
    plate(P['white'], link2d(hypot(_tx - _kx, _ty - _ky), 0.07, 0.05), -0.06, 0.06, at(_kx, _ky, _rb))
    cylZ(P['navy'], _kx, _ky, -0.07, 0.07, 0.075, 20)
    box(P['orange'], -0.2, 0.03, -0.09, -0.045, -0.07, 0.07, at(_tx, _ty, _rb))
    for i in range(4):                                         # 夾墊的防滑紋
        box(P['rubber'], -0.18 + i * 0.05, -0.16 + i * 0.05, -0.1, -0.088, -0.07, 0.07, at(_tx, _ty, _rb))
    part('Claw_Finger_' + k, 'Claw_' + k, P)
    P = Pal()
    cylZ(P['chrome'], 0, 0, -0.17, 0.17, 0.035, 12)
    part('Claw_Pin_' + k, 'Claw_' + k, P, False)

# ----------------------------------------------------------------------------------------------
# 油壓缸：缸筒在上一段、活塞桿在下一段。筒身是空心的，活塞桿在孔裡滑，兩個零件的面不相交
# ----------------------------------------------------------------------------------------------
for n, A, ez in (('Sh', SH, 0.105), ('El', EL, 0.075)):
    rc, Lc, Lr = A['rc'], A['Lc'], A['Lr']
    P = Pal()
    cylZ(P['steel'], 0, 0, -ez, ez, rc * 0.8, 20)
    box(P['steel'], 0.04, 0.2, -rc * 0.5, rc * 0.5, -ez, ez)
    cylX(P['steel'], 0.16, 0.24, 0, 0, rc * 1.12)
    revolve(P['navy'], [(0.2, rc), (Lc - 0.1, rc), (Lc - 0.1, rc * 1.12), (Lc, rc * 1.12), (Lc, rc * 0.5 + 0.008), (0.26, rc * 0.5 + 0.008)], AXX, 28)
    for x in (0.34, Lc - 0.3):                                 # 油口
        box(P['steel'], x, x + 0.14, rc * 0.8, rc * 1.3, -0.05, 0.05)
    hose(P['steel'], [V(0.41, rc * 1.3, 0), V(0.5, rc * 1.5, 0), V(Lc - 0.32, rc * 1.5, 0), V(Lc - 0.23, rc * 1.3, 0)], 0.018, 6)
    part('Act_%s_Barrel' % n, 'Act_%s_Cyl' % n, P)
    P = Pal()
    cylZ(P['steel'], 0, 0, -ez + 0.02, ez - 0.02, rc * 0.75, 20)
    cylX(P['steel'], 0.05, 0.2, 0, 0, rc * 0.62)
    cylX(P['chrome'], 0.2, Lr, 0, 0, rc * 0.5)
    part('Act_%s_Piston' % n, 'Act_%s_Rod' % n, P)

_low = {b.lower() for b in BONE_ORDER}
assert not [n for n in PARTS if n.lower() in _low], '網格跟骨頭同名'
INFO_PARTS = [dict(name=n, bone=b, tris=len(o.data.polygons), checked=c, materials=[m.name for m in o.data.materials]) for n, (o, b, c) in PARTS.items()]
TRIS = sum(p['tris'] for p in INFO_PARTS)
print('BUILT', len(PARTS), 'parts', TRIS, 'tris', round(time.time() - T0, 1), 's')

# ----------------------------------------------------------------------------------------------
# 互穿檢查：每個零件對每個不同骨頭上的零件，三角面對三角面（BVH）。銷不檢查。
# 靜止姿勢必須是 0；每個關節單獨掃過整個範圍必須是 0；示範動作（頁面存下來的 demo_poses.json）必須是 0。
# ----------------------------------------------------------------------------------------------
CK = []
for _n, (_ob, _b, _c) in PARTS.items():
    if _c:
        _co = np.empty(len(_ob.data.vertices) * 3, dtype=np.float64)
        _ob.data.vertices.foreach_get('co', _co)
        CK.append(dict(name=_n, bone=_b, co=_co.reshape(-1, 3), polys=[tuple(p.vertices) for p in _ob.data.polygons]))


def clashes(ang, floor=False):
    W = fk(ang)
    for c in CK:
        M = np.array(W[c['bone']])
        c['w'] = c['co'] @ M[:3, :3].T + M[:3, 3]
        c['lo'], c['hi'], c['tree'] = c['w'].min(0), c['w'].max(0), None
    out = []
    for i, a in enumerate(CK):
        if floor and a['bone'] != 'Root' and a['lo'][1] < -1e-4:
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


CHECK = None
if '--no-check' not in ARGS:
    CHECK = dict(method='BVH 三角面對三角面；銷不檢查', parts_checked=len(CK), rest=[' × '.join(p) for p in clashes({})], sweeps=[])
    for key, _nm, lo, hi, _r in JOINTS:
        bad, first = 0, None
        for i in range(31):
            h = clashes({key: lo + (hi - lo) * i / 30})
            if h:
                bad += 1
                first = first or dict(value=round(i / 30, 3), pair=' × '.join(h[0]))
        CHECK['sweeps'].append(dict(joint=key, steps=31, clashing=bad, first=first))
    CHECK['actuators'] = {}
    for key, A in (('sh', SH), ('el', EL)):
        ins, bot = 1e9, 1e9
        for i in range(61):
            fk({key: JLIM[key][0] + (JLIM[key][1] - JLIM[key][0]) * i / 60})
            ins, bot = min(ins, A['Lc'] + A['Lr'] - A['len']), min(bot, A['len'] - A['Lr'] - 0.26)
        CHECK['actuators'][key] = dict(stroke=[round(A['lo'], 3), round(A['hi'], 3)], rod_inside_min=round(ins, 3), rod_to_bore_bottom_min=round(bot, 3), ok=ins >= 0.1 and bot >= 0)
    _dp = os.path.join(OUTD, 'demo_poses.json')
    if os.path.exists(_dp):
        poses = json.load(open(_dp))
        bad, first = 0, None
        for i, a in enumerate(poses):
            h = clashes(clamp_ang(a), True)
            if h:
                bad += 1
                first = first or dict(sample=i, pair=' × '.join(h[0]))
        CHECK['demo'] = dict(samples=len(poses), clashing=bad, first=first)
    G, bad, cnt = 6, 0, {}
    for a in range(G + 1):
        for b in range(G + 1):
            for c in range(G + 1):
                h = clashes({k: JLIM[k][0] + (JLIM[k][1] - JLIM[k][0]) * v / G for k, v in (('sh', a), ('el', b), ('wr', c))})
                if h:
                    bad += 1
                    for p in h:
                        cnt[' × '.join(p)] = cnt.get(' × '.join(p), 0) + 1
    CHECK['grid'] = dict(poses=(G + 1) ** 3, clashing=bad, top=sorted(cnt.items(), key=lambda kv: -kv[1])[:5], note='參考用：關節各自獨立時的所有組合')
    CHECK['pass'] = (not CHECK['rest'] and all(not s['clashing'] for s in CHECK['sweeps']) and all(a['ok'] for a in CHECK['actuators'].values())
                     and not CHECK.get('demo', {}).get('clashing'))
    json.dump(CHECK, open(os.path.join(OUTD, 'check_blender.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('CHECK pass', CHECK['pass'], 'rest', CHECK['rest'], 'sweeps', [(s['joint'], s['clashing'], s['first']) for s in CHECK['sweeps']],
          'demo', CHECK.get('demo'), 'grid', CHECK['grid']['clashing'], CHECK['grid']['top'][:2], round(time.time() - T0, 1), 's')

if '--check-only' in ARGS:
    sys.exit(0 if CHECK and CHECK['pass'] else 1)

# ----------------------------------------------------------------------------------------------
# 合成一個網格（每個零件的頂點都只屬於它那根骨頭的頂點群組），攤 UV
# ----------------------------------------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
for _n, (_ob, _b, _c) in PARTS.items():
    _ob.vertex_groups.new(name=_b).add(list(range(len(_ob.data.vertices))), 1.0, 'REPLACE')
    _ob.select_set(True)
MESH = PARTS['Base_Plate'][0]
bpy.context.view_layer.objects.active = MESH
bpy.ops.object.join()
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
MESH.name = MESH.data.name = 'Arm_Mesh'
MESH.data.uv_layers.new(name='UV_Atlas')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
print('UV', len(MESH.data.polygons), 'tris', round(time.time() - T0, 1), 's')

# ----------------------------------------------------------------------------------------------
# 烘焙：程序材質 → textures/arm_basecolor／orm／normal（UV_Atlas），之後整台只剩兩個材質（貼圖的、發光的）
# ----------------------------------------------------------------------------------------------
TEX_DIR = os.path.join(OUTD, 'textures')
TEX, BAKE_INFO = {}, {}
SCN.world = bpy.data.worlds.new('World')


def use_gpu():
    SCN.render.engine = 'CYCLES'
    dev = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for t in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = t
                prefs.get_devices()
                if any(d.type == t for d in prefs.devices):
                    for dv in prefs.devices:
                        dv.use = True
                    SCN.cycles.device = 'GPU'
                    dev = t
                    break
            except Exception:
                pass
    except Exception as e:
        print('gpu', e)
    print('DEVICE', dev)
    return dev


def bake_textures():
    os.makedirs(TEX_DIR, exist_ok=True)
    dev = use_gpu()
    SCN.cycles.samples = 24
    SCN.cycles.use_denoising = False
    SCN.world.light_settings.distance = 1.2
    N = TEX_N
    used = [m for m in MESH.data.materials]

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

    IM = dict(base=new_img('arm_basecolor', True, (0.05, 0.05, 0.05, 1)), rough=new_img('arm_r', False, (0.5, 0.5, 0.5, 1)), metal=new_img('arm_m', False, (0, 0, 0, 1)),
              ao=new_img('arm_a', False, (1, 1, 1, 1)), normal=new_img('arm_normal', False, (0.5, 0.5, 1.0, 1)), orm=new_img('arm_orm', False, (1, 0.5, 0, 1)))
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
        print('bake', kind, round(time.time() - T0, 1), 's', flush=True)
        for nt, out, old, em in saved:
            nt.links.new(old, out.inputs['Surface'])
            nt.nodes.remove(em)

    emit_bake('base', 'Base Color', True)
    emit_bake('rough', 'Roughness', False)
    emit_bake('metal', 'Metallic', False)
    target('normal')
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=6, use_clear=False)
    SCN.cycles.samples = 64
    target('ao')
    bpy.ops.object.bake(type='AO', margin=6, use_clear=False)
    print('bake normal+ao', round(time.time() - T0, 1), 's', flush=True)
    ao = np.clip(get(IM['ao'])[:, 0], 0, 1)
    r, mt, base = get(IM['rough']), get(IM['metal']), get(IM['base'])
    base[:, :3] *= (0.42 + 0.58 * ao ** 1.1)[:, None]          # 縫裡、底下比較暗：遮蔽直接乘進底色
    IM['base'].pixels.foreach_set(base.ravel())
    px = np.ones_like(r)
    px[:, 0], px[:, 1], px[:, 2] = ao, r[:, 0], mt[:, 0]
    IM['orm'].pixels.foreach_set(px.ravel())
    for key, kk in (('basecolor', 'base'), ('orm', 'orm'), ('normal', 'normal')):
        im = IM[kk]
        im.filepath_raw = os.path.join(TEX_DIR, 'arm_%s.png' % key)
        im.file_format = 'PNG'
        im.save()
        TEX[key] = im
    for kk in ('rough', 'metal', 'ao'):
        bpy.data.images.remove(IM[kk])
    for m in used:
        m.node_tree.nodes.remove(tex[m.name])
    BAKE_INFO.update(size=N, device=dev, area_m2=round(sum(p.area for p in MESH.data.polygons), 1))


BAKED = '--no-bake' not in ARGS
if BAKED:
    bake_textures()
    mt = bpy.data.materials.new('M_Arm')
    mt.use_nodes = True
    nt = mt.node_tree
    b = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UV_Atlas'
    imgs = {}
    for key in ('basecolor', 'orm', 'normal'):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = TEX[key]
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
    me = MESH.data                                      # 七個程序材質收成一個貼圖材質；發光的留著
    old = [m.name for m in me.materials]
    new, remap = [], []
    for n in old:
        m2 = MATS['glow'] if n == 'M_Arm_Glow' else mt
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
    print('BAKED', json.dumps(BAKE_INFO), round(time.time() - T0, 1), 's')

# ----------------------------------------------------------------------------------------------
# 骨架、蒙皮（每個頂點 100% 跟一根骨頭）
# ----------------------------------------------------------------------------------------------
arm_data = bpy.data.armatures.new('Armature')
ARM = bpy.data.objects.new('Armature', arm_data)
COL.objects.link(ARM)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = ARM
ARM.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n in BONE_ORDER:
    eb = arm_data.edit_bones.new(n)
    o, r = REST[n].to_translation(), REST[n].to_3x3()
    eb.head = o
    eb.tail = o + r.col[1] * (0.2 if n.startswith(('Claw', 'Act', 'TCP')) else 0.5)
    eb.align_roll(r.col[2])
    if PARENT[n]:
        eb.parent = arm_data.edit_bones[PARENT[n]]
    eb.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
arm_data.display_type = 'STICK'
PB = ARM.pose.bones
for pb in PB:
    pb.rotation_mode = 'QUATERNION'
MESH.parent = ARM
MESH.matrix_parent_inverse = Matrix.Identity(4)
MESH.modifiers.new('Armature', 'ARMATURE').object = ARM
ARM['dim'] = json.dumps(dict(H=H, L1=L1, L2=L2, L3=L3))      # 匯出到 GLB 的 extras：遊戲照這些數字算反向運動學
ARM['joints'] = json.dumps([dict(key=j[0], min=j[2], max=j[3], rest=j[4], clip=j[0] + '_param') for j in JOINTS])


def set_pose(ang, keys=None, frame=None, prev=None):
    """把骨架擺成 ang；keys 有給就只動那幾根骨頭並在 frame 下關鍵格。"""
    W = {b: C @ m for b, m in fk(ang).items()}
    for b in (keys or BONE_ORDER):
        if b == 'Root':
            continue
        q = (LOCREST[b].inverted() @ (W[PARENT[b]].inverted() @ W[b])).to_quaternion()
        if prev is not None:
            if b in prev and prev[b].dot(q) < 0:
                q.negate()
            prev[b] = q
        PB[b].rotation_quaternion = q
        if frame is not None:
            PB[b].keyframe_insert('rotation_quaternion', frame=frame)


# 動作：每個參數一段，第 0～32 格＝參數 0～1（每秒 32 格，所以長度剛好 1 秒；seek 到 t＝參數值）
SCN.render.fps = 32
NK = 32
ACTS = {}
ARM.animation_data_create()
for key, _nm, lo, hi, _r in JOINTS:
    act = bpy.data.actions.new(key + '_param')
    act.use_fake_user = True
    ARM.animation_data.action = act
    set_pose({})
    prev = {}
    for f in range(NK + 1):
        set_pose({key: lo + (hi - lo) * f / NK}, CLIP_BONES[key], f, prev)
    ACTS[key + '_param'] = act
    set_pose({})
ARM.animation_data.action = None
set_pose({})
SCN.frame_start, SCN.frame_end = 0, NK
print('RIG', len(BONE_ORDER), 'bones', len(ACTS), 'actions', round(time.time() - T0, 1), 's')

# ----------------------------------------------------------------------------------------------
# 資訊、存檔
# ----------------------------------------------------------------------------------------------
bb = [[round(min(v.co[i] for v in MESH.data.vertices), 2) for i in range(3)], [round(max(v.co[i] for v in MESH.data.vertices), 2) for i in range(3)]]
info = dict(units='m', blender=bpy.app.version_string, tris=len(MESH.data.polygons), bbox_blender_zup=bb, baked=BAKED, bake=BAKE_INFO,
            dim=dict(H=H, L1=L1, L2=L2, L3=L3, handX=HANDX, clawX=CLAWX, clawR=CLAWR),
            joints=[dict(key=j[0], name=j[1], min=j[2], max=j[3], rest=j[4], clip=j[0] + '_param', bones=CLIP_BONES[j[0]]) for j in JOINTS],
            actuators={k: dict(top_anchor=A['tp'], bot_anchor=[round(v, 4) for v in A['bp']], stroke=[round(A['lo'], 3), round(A['hi'], 3)], min_lever=round(A['lever'], 3),
                               cylinder=round(A['Lc'], 3), rod=round(A['Lr'], 3)) for k, A in (('sh', SH), ('el', EL))},
            bones={n: dict(parent=PARENT[n], head=[round(v, 4) for v in REST[n].to_translation()], y_axis=[round(v, 3) for v in REST[n].to_3x3().col[1]],
                           z_axis=[round(v, 3) for v in REST[n].to_3x3().col[2]]) for n in BONE_ORDER},
            parts=INFO_PARTS, check=CHECK)
json.dump(info, open(os.path.join(OUTD, OUT + '_info.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTD, OUT + '.blend'))
print('SAVED', round(time.time() - T0, 1), 's')

# ----------------------------------------------------------------------------------------------
# 渲染（--render）：靜止姿勢與伸手姿勢，整台與特寫。看的是烘焙後的樣子＝遊戲拿到的樣子
# ----------------------------------------------------------------------------------------------
if '--render' in ARGS:
    RD = os.path.join(OUTD, 'renders')
    os.makedirs(RD, exist_ok=True)
    w = SCN.world
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    fm = bpy.data.meshes.new('Floor')
    fm.from_pydata([(-80, -80, 0), (80, -80, 0), (80, 80, 0), (-80, 80, 0)], [], [(0, 1, 2, 3)])
    fl = bpy.data.objects.new('Floor', fm)
    SCN.collection.objects.link(fl)
    fmat = bpy.data.materials.new('M_Studio_Floor')
    fmat.use_nodes = True
    fmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.1, 0.115, 1)
    fmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
    fm.materials.append(fmat)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy, sun.data.angle = 3.2, radians(10)
    sun.rotation_euler = (radians(50), 0, radians(-35))
    SCN.collection.objects.link(sun)
    for nm, loc, size, pw in (('Fill', (10, 12, 8), 10, 3000), ('Rim', (-12, -8, 10), 9, 5000)):
        l = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'AREA'))
        l.data.size, l.data.energy = size, pw
        l.location = loc
        l.rotation_euler = (Vector((0, 0, 4)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        SCN.collection.objects.link(l)
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    cam.data.lens = 50
    SCN.collection.objects.link(cam)
    SCN.camera = cam
    use_gpu()
    SCN.cycles.samples = 64
    SCN.cycles.use_denoising = True
    SCN.render.resolution_x, SCN.render.resolution_y = 1600, 900
    SCN.render.image_settings.file_format = 'JPEG'
    SCN.render.image_settings.quality = 90
    try:
        SCN.view_settings.look = 'AgX - Medium High Contrast'
    except Exception as e:
        print('look', e)
    REACH = dict(yaw=35, sh=42, el=-92, wr=-40, roll=30, grip=14)

    def shot(name, ang, eye, look, lens=50):
        set_pose(ang)
        cam.data.lens = lens
        cam.location = eye
        cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        SCN.render.filepath = os.path.join(RD, 'arm_%s.jpg' % name)
        bpy.ops.render.render(write_still=True)
        print('render', name, round(time.time() - T0, 1), 's', flush=True)

    # Blender 座標：x 往前、y＝−（手臂座標的 z）、z 往上
    shot('3q', {}, (17.5, -15.5, 9.0), (1.4, 0, 4.2))
    shot('side', {}, (2.0, -25, 4.4), (2.0, 0, 4.2))
    shot('reach', REACH, (17, -12, 7.5), (2.2, -1.2, 3.4))
    shot('cu_elbow', {}, (4.2, -5.2, 8.6), (1.3, 0, 7.0), 70)
    shot('cu_base', {}, (5.2, -5.0, 3.2), (0.5, 0, 1.9), 60)
    _tp = (C @ fk(REACH)['TCP']).to_translation()         # 手在哪裡由正向運動學算
    shot('cu_hand', REACH, tuple(_tp + Vector((3.0, -3.4, 1.9))), tuple(_tp + Vector((-0.2, 0.1, 0.45))), 70)
    set_pose({})

# ----------------------------------------------------------------------------------------------
# 匯出 GLB（公尺、Y 朝上）：一個蒙皮網格、兩個材質、六段動作
# ----------------------------------------------------------------------------------------------
if '--no-export' not in ARGS:
    ad = ARM.animation_data
    ad.action = None
    set_pose({})
    for an, act in ACTS.items():                       # 每段動作一條 NLA 軌：各自匯出成一段
        tr = ad.nla_tracks.new()
        tr.name = an
        stp = tr.strips.new(an, 0, act)
        try:
            stp.action_slot = act.slots[0]
        except Exception as e:
            print('strip slot', e)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in (ARM, MESH):
        o.select_set(True)
    bpy.context.view_layer.objects.active = ARM
    kw = dict(filepath=os.path.join(OUTD, OUT + '.glb'), export_format='GLB', use_selection=True, export_apply=False, export_skins=True, export_yup=True,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1, export_tangents=BAKED,
              export_image_format='JPEG', export_jpeg_quality=90, export_extras=True, export_optimize_animation_size=True,
              export_optimize_animation_keep_anim_armature=False, export_anim_slide_to_zero=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:                             # 選項名稱隨版本變：拿掉不認得的再試
        print('gltf option', e)
        for k in ('export_optimize_animation_keep_anim_armature', 'export_anim_slide_to_zero'):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    print('GLB', os.path.getsize(kw['filepath']) // 1024, 'KB', round(time.time() - T0, 1), 's')

print('DONE', round(time.time() - T0, 1), 's')
if CHECK is not None and not CHECK['pass']:
    sys.exit(1)
