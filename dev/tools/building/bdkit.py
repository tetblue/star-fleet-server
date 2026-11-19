# 建築與道路模型的共用工具：沿用機庫的 hgkit（幾何、程序材質、烘焙、匯出），加上建築用的材質與幾個形狀。
# 每個模型一支 build_*.py：建零件 → done(M, 檔名)。做出來的 GLB 放 models/建築/重製_名稱.glb，舊的 TRIPO 模型不動。
# 尺寸：照舊模型外框的比例（遊戲裡是「縮放到種類的高度」，比例一樣就能直接換檔，fw／fd／r 不用改）。
#   建築用「模型比例」做：最高的那一邊 16～24 個單位，材質的顆粒、掉漆、倒角才會落在貼圖解析得出來的大小；道路直接用遊戲單位（一塊 14）。
# 遊戲裡建築的著色器（building.js 的 bldMat）只吃底色貼圖和發光色，所以環境遮蔽烘進底色（hgkit 本來就這樣），發光材質的底色要亮（發光＝發光色 × 底色）。
import sys, os, shutil
HERE_B = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_B, '..', 'hangar'))
import hgkit
from hgkit import *

hgkit.OUTD = OUTD = os.path.join(HERE_B, 'out')
PANEL = [1.0]
BMODELS = os.path.normpath(os.path.join(HERE_B, '..', '..', '..', 'models', '建築'))
_reset0 = hgkit.reset
hgkit.BASE_ONLY[0] = True                              # 建築只烘底色貼圖（省下法線、ORM 兩張，底色解析度可以開大）


def add_panels(name, size, width=0.05, dark=0.5, tint=0.08, brick=False, accent=None, rate=0.16):
    """在材質的底色上疊一層「分塊」：沿物件座標每隔 size 一條深色的縫，每一塊的明暗隨機差一點（tint）。brick＝一排一排錯開半塊（砌石、瓦）。
    貼圖上的細節：不用多做幾何，烘出來就有一塊一塊的外板／石塊。跟某個軸垂直的面不畫那個軸的縫（不然整面會剛好落在縫裡變黑）。"""
    nt = MATS[name].node_tree
    L, b = nt.links.new, nt.nodes['Principled BSDF']
    bc = b.inputs['Base Color']
    if bc.is_linked:
        src = bc.links[0].from_socket
    else:
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = tuple(bc.default_value)
        src = rgb.outputs[0]

    def mth(op, a, c=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]

    tc = nt.nodes.new('ShaderNodeTexCoord')
    sc, sn = nt.nodes.new('ShaderNodeSeparateXYZ'), nt.nodes.new('ShaderNodeSeparateXYZ')
    L(tc.outputs['Object'], sc.inputs[0])
    L(tc.outputs['Normal'], sn.inputs[0])
    odd = mth('ABSOLUTE', mth('MODULO', mth('FLOOR', mth('DIVIDE', mth('ADD', sc.outputs[1], 0.0137), size[1])), 2.0))
    mask, cells, inner = None, [], None
    for i in range(3):
        c = mth('ADD', sc.outputs[i], 0.37 * size[i] if i != 1 else 0.0137)
        if brick and i != 1:
            c = mth('ADD', c, mth('MULTIPLY', odd, 0.5 * size[i]))
        q = mth('DIVIDE', c, size[i])
        f = mth('FRACT', q)
        line = mth('LESS_THAN', mth('MINIMUM', f, mth('SUBTRACT', 1.0, f)), width / 2 / size[i])
        valid = mth('LESS_THAN', mth('ABSOLUTE', sn.outputs[i]), 0.9)
        li = mth('MULTIPLY', line, valid)
        ins = mth('MAXIMUM', mth('LESS_THAN', mth('ABSOLUTE', mth('SUBTRACT', f, 0.5)), 0.27), mth('SUBTRACT', 1.0, valid))      # 這一塊中間的區域（給艙蓋用）
        inner = ins if inner is None else mth('MULTIPLY', inner, ins)
        mask = li if mask is None else mth('MAXIMUM', mask, li)
        cells.append(mth('FLOOR', q))
    cb = nt.nodes.new('ShaderNodeCombineXYZ')
    for i in range(3):
        L(cells[i], cb.inputs[i])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise')
    wn.noise_dimensions = '3D'
    L(cb.outputs[0], wn.inputs['Vector'])
    tv = mth('ADD', mth('MULTIPLY', wn.outputs['Value'], tint * 1.5), 1.0 - tint)
    m1 = nt.nodes.new('ShaderNodeMixRGB')
    m1.blend_type = 'MULTIPLY'
    m1.inputs['Fac'].default_value = 1.0
    L(src, m1.inputs['Color1'])
    L(tv, m1.inputs['Color2'])
    m2 = nt.nodes.new('ShaderNodeMixRGB')
    m2.blend_type = 'MULTIPLY'
    m2.inputs['Fac'].default_value = 1.0
    m2.inputs['Color2'].default_value = (dark, dark, dark * 1.05, 1)
    L(m1.outputs['Color'], m2.inputs['Color1'])
    m3 = nt.nodes.new('ShaderNodeMixRGB')
    L(mask, m3.inputs['Fac'])
    L(m1.outputs['Color'], m3.inputs['Color1'])
    L(m2.outputs['Color'], m3.inputs['Color2'])
    out = m3.outputs['Color']
    if accent:                                         # 隨機挑一些塊，中間畫一片別的顏色（艙蓋、檢修板、通風口）
        wn2 = nt.nodes.new('ShaderNodeTexWhiteNoise')
        wn2.noise_dimensions = '3D'
        sh = nt.nodes.new('ShaderNodeVectorMath')
        sh.operation = 'ADD'
        sh.inputs[1].default_value = (17.3, 5.1, 9.7)
        L(cb.outputs[0], sh.inputs[0])
        L(sh.outputs[0], wn2.inputs['Vector'])
        m4 = nt.nodes.new('ShaderNodeMixRGB')
        m4.inputs['Color2'].default_value = (*accent, 1)
        L(mth('MULTIPLY', mth('MULTIPLY', inner, mth('LESS_THAN', wn2.outputs['Value'], rate)), 0.9), m4.inputs['Fac'])
        L(out, m4.inputs['Color1'])
        out = m4.outputs['Color']
    L(out, bc)



def _reset():
    _reset0()
    mat_paint('stone', (0.085, 0.09, 0.105), 0.7, wear=0.5)                 # 帝國：深灰石材
    mat_paint('stone2', (0.16, 0.165, 0.185), 0.7, wear=0.5)                 # 帝國：淺一階的石材（線腳、基座）
    mat_paint('crimson', (0.20, 0.018, 0.022), 0.5, wear=0.8)               # 帝國：暗紅屋頂、旗
    mat_plain('gold', (0.78, 0.50, 0.16), 1.0, 0.32, noise=0.1, nscale=9.0)
    mat_plain('asphalt', (0.05, 0.055, 0.065), 0.0, 0.85, noise=0.08, nscale=14.0, bump=0.3)
    mat_paint('concrete', (0.50, 0.52, 0.55), 0.75, wear=0.3)
    mat_paint('tan', (0.60, 0.46, 0.24), 0.5, wear=0.8)
    mat_plain('glass', (0.05, 0.11, 0.2), 0.7, 0.12, noise=0.04, nscale=3.0)
    mat_plain('glow', (0.2, 0.5, 0.9), 0.0, 0.3, emit=(0.3, 0.75, 1.0), strength=3.0)        # 蓋掉機庫的：底色要亮
    mat_plain('lamp', (0.9, 0.85, 0.7), 0.0, 0.3, emit=(1.0, 0.93, 0.78), strength=2.0)
    mat_plain('ember', (1.0, 0.42, 0.1), 0.0, 0.3, emit=(1.0, 0.42, 0.1), strength=1.6)      # 帝國：橘紅的窗與火盆
    mat_plain('beacon', (1.0, 0.12, 0.08), 0.0, 0.3, emit=(1.0, 0.12, 0.08), strength=3.0)   # 紅色警示燈
    BEV.update(stone=0.02, stone2=0.02, crimson=0.012, gold=0.006, asphalt=0.0, concrete=0.02, tan=0.012, glass=0.004, ember=0.0, beacon=0.0)
    PS = PANEL[0]                                      # 分塊的大小倍率（道路用遊戲單位，塊小一點）
    add_panels('white', (1.2 * PS, 0.9 * PS, 1.2 * PS), 0.045, 0.45, 0.08, accent=(0.05, 0.09, 0.2), rate=0.13)
    add_panels('navy', (0.9 * PS, 0.7 * PS, 0.9 * PS), 0.04, 0.5, 0.14, accent=(0.45, 0.47, 0.5), rate=0.1)
    add_panels('stone', (0.8, 0.4, 0.8), 0.04, 0.45, 0.2, True)
    add_panels('stone2', (0.6, 0.3, 0.6), 0.035, 0.5, 0.12, True)
    add_panels('crimson', (0.3, 0.22, 0.3), 0.035, 0.5, 0.2, True)
    add_panels('concrete', (2.0 * PS, 2.0, 2.0 * PS), 0.05, 0.6, 0.06)
    add_panels('dark', (1.0, 1.0, 1.0), 0.04, 0.6, 0.15)
    for k in ('ember', 'beacon'):
        if k not in EMIT:
            EMIT.append(k)


hgkit.reset = _reset


def prism(bm, n, cx, cz, prof, rot=0.0, cap0=True, cap1=True):
    """正 n 邊形的柱／錐：prof＝[(y, 外接圓半徑)…]。n＝4、rot＝45° 就是方的（半徑＝半邊長 × √2）。"""
    revolve(bm, prof, Tm(cx, 0, cz) @ AXY @ Rz(rot), n, cap0, cap1)


def sq(bm, cx, cz, prof):
    """方柱／方錐：prof＝[(y, 半邊長)…]。"""
    prism(bm, 4, cx, cz, [(y, r * 1.41421356) for y, r in prof], pi / 4)


def slab(bm, prof):
    """長方形的截面一層一層疊：prof＝[(y, x0, x1, z0, z1)…]（每一層可以不同大小、不同位置）。"""
    loft(bm, [[V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1)] for y, x0, x1, z0, z1 in prof])


def sector(bm, cx, cz, r0, r1, y0, y1, a0, a1, n=16):
    """扇環（俯視）：圓心 (cx, cz)，半徑 r0～r1（可以是 角度 → 半徑 的函式），角度 a0～a1（x＝cos、z＝sin）。"""
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        c, s = cos(a), sin(a)
        p, q = (r0(a) if callable(r0) else r0), (r1(a) if callable(r1) else r1)
        rings.append([V(cx + p * c, y0, cz + p * s), V(cx + q * c, y0, cz + q * s), V(cx + q * c, y1, cz + q * s), V(cx + p * c, y1, cz + p * s)])
    loft(bm, rings)


def dish(bm, M, r, depth=None, segs=20):
    """碟形天線：M 的 z 軸＝朝向。薄殼（拋物面）＋背面的座＋饋源。回傳 None。"""
    d = depth or r * 0.28
    prof = [(d * (t * t) - d, r * t) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
    revolve(bm, prof + [(0.03 * r, r * 1.02), (-d * 0.62, r * 0.6), (-d * 1.12, r * 0.14), (-d * 1.6, r * 0.12)], M, segs)


def done(M, glb, extras=None):
    """收尾：UV、烘焙、匯出，然後複製到 models/建築/。"""
    M.finish(extras)
    if '--no-export' not in ARGS:
        src = os.path.join(OUTD, M.glb + '.glb')
        shutil.copyfile(src, os.path.join(BMODELS, glb + '.glb'))
        print('COPIED', glb, os.path.getsize(src) // 1024, 'KB', M.info['size_xyz'])


def slabM(bm, prof, M=None):
    """slab 的可轉向版本：整個再乘上 M。"""
    M = M or I4
    loft(bm, [[M @ V(x0, y, z0), M @ V(x1, y, z0), M @ V(x1, y, z1), M @ V(x0, y, z1)] for y, x0, x1, z0, z1 in prof])


def dome(bm, cx, cz, y0, r, n=12, k=1.0, top=0.0):
    """半球形的屋頂（k＝高度比例，>1 是尖一點的洋蔥頂；top＝頂上留的小平台半徑）。"""
    prof = [(y0 + r * k * sin(t * pi / 12), max(r * cos(t * pi / 12), top)) for t in range(7)]
    revolve(bm, prof, Tm(cx, 0, cz) @ AXY, n)


def orb(bm, x, y, z, r, n=10):
    """球。"""
    revolve(bm, [(r * -cos(t * pi / 6), max(r * sin(t * pi / 6), r * 0.02)) for t in range(7)], Tm(x, y, z) @ AXY, n)


FACES4 = [Ry(k * pi / 2) for k in range(4)]            # 四個面：把「朝 +z 的東西」轉到 +z、+x、−z、−x


def arch(bm, M, x, y0, y1, w, z0, z1):
    """尖拱形的板（哥德式的窗、門）：中心 x、底 y0、直邊到 y1、半寬 w，從 z0 凸到 z1（M 的局部座標，朝 +z）。"""
    plate(bm, [(x - w, y0), (x + w, y0), (x + w, y1), (x + w * 0.5, y1 + w * 0.9), (x, y1 + w * 1.5), (x - w * 0.5, y1 + w * 0.9), (x - w, y1)], z0, z1, M)


# ----------------------------------------------------------------------------------------------
# 小零件（第三版：幾何細節）。都畫在「面的座標」裡：x 沿著面、y 沿著面往上、z 朝外，原點在面的下緣中間。
# ----------------------------------------------------------------------------------------------
import random


def face_frame(n, cx, cz, rot, r0, y0, r1, y1, k):
    """prism(n, cx, cz, [(y0, r0), (y1, r1)], rot) 的第 k 個面 → (面的座標, 下緣寬, 上緣寬, 斜面的長度)。"""
    c = cos(pi / n)
    a0, a1 = r0 * c, r1 * c
    phi = rot + (k + 0.5) * 2 * pi / n
    tilt = atan2(a0 - a1, y1 - y0)
    return Tm(cx, 0, cz) @ Ry(phi + pi / 2) @ Tm(0, y0, a0) @ Rx(-tilt), 2 * r0 * sin(pi / n), 2 * r1 * sin(pi / n), hypot(a0 - a1, y1 - y0)


def vent(P, M, x, y, w, h, t=0.05, n=4):
    """百葉通風口。"""
    box(P['steel'], x, x + w, y, y + h, -0.02, t, M)
    for i in range(n):
        yy = y + h * (i + 0.5) / n
        box(P['dark'], x + w * 0.1, x + w * 0.9, yy - h / n * 0.3, yy + h / n * 0.3, t, t + 0.012, M)


def ladder(P, M, x, y0, y1, d=0.1, w=0.3):
    """爬梯（貼在面上）。"""
    for s in (-1, 1):
        box(P['steel'], x + s * w / 2 - 0.02, x + s * w / 2 + 0.02, y0, y1, 0.0, d, M)
    for i in range(int((y1 - y0) / 0.22)):
        y = y0 + 0.12 + i * 0.22
        box(P['steel'], x - w / 2, x + w / 2, y - 0.012, y + 0.012, d - 0.03, d, M)


def pipe_run(P, M, x, y0, y1, r=0.06, d=0.1, col='steel'):
    """沿著面往上的一根管子，兩頭彎進牆裡，中間幾個管夾。"""
    cylY(P[col], x, d, y0, y1, r, None, 8, M)
    for y in (y0, y1):
        box(P[col], x - r, x + r, y - r, y + r, -0.02, d, M)
    for i in range(1, max(2, int((y1 - y0) / 0.9))):
        y = y0 + (y1 - y0) * i / max(2, int((y1 - y0) / 0.9))
        box(P['steel'], x - r * 1.5, x + r * 1.5, y - 0.03, y + 0.03, -0.02, d + r * 0.6, M)


def greeble(P, M, x0, x1, y0, y1, seed, n=6, cols=('white', 'navy', 'steel'), light='glow', scale=1.0):
    """在面上的一塊範圍裡隨機擺 n 個小零件：凸出的蓋板、百葉、帶燈條的機盒、管子、線槽、爬梯。seed 固定，每次烘出來一樣。"""
    R = random.Random(seed)
    W, Hh = x1 - x0, y1 - y0
    if W < 0.3 or Hh < 0.3:
        return
    for _ in range(n):
        w, h = min(W, R.uniform(0.3, 0.9) * scale), min(Hh, R.uniform(0.25, 0.8) * scale)
        x, y, t, k = R.uniform(x0, x1 - w), R.uniform(y0, y1 - h), R.choice((0.04, 0.07, 0.12)) * scale, R.random()
        c = R.choice(cols)
        if k < 0.3:                                    # 蓋板（兩層）
            box(P[c], x, x + w, y, y + h, -0.03, t, M)
            box(P[R.choice(cols)], x + w * 0.15, x + w * 0.85, y + h * 0.15, y + h * 0.85, t, t + 0.02, M)
        elif k < 0.5:
            vent(P, M, x, y, w, h, t)
        elif k < 0.68:                                 # 機盒＋燈條
            box(P[c], x, x + w, y, y + h, -0.03, t * 1.6, M)
            box(P[light], x + w * 0.2, x + w * 0.8, y + h * 0.42, y + h * 0.58, t * 1.6, t * 1.6 + 0.012, M)
        elif k < 0.84:
            pipe_run(P, M, x + w / 2, y0 + R.uniform(0, Hh * 0.2), y1 - R.uniform(0, Hh * 0.2), 0.05 * scale, 0.09 * scale)
        elif k < 0.93 and Hh > 1.2:
            ladder(P, M, x + w / 2, y0, y1, 0.08)
        else:                                          # 橫的線槽
            box(P['steel'], x0, x1, y + h * 0.4, y + h * 0.4 + 0.07 * scale, -0.02, 0.06 * scale, M)


def tier_detail(P, n, cx, cz, rot, r0, y0, r1, y1, seed, per=5, skip=(), **kw):
    """整圈（n 個面）都擺小零件；skip＝不擺的面（門、徽記那幾面）。"""
    for k in range(n):
        if k in skip:
            continue
        M, w0, w1, sl = face_frame(n, cx, cz, rot, r0, y0, r1, y1, k)
        w = min(w0, w1) * 0.42
        greeble(P, M, -w, w, sl * 0.08, sl * 0.92, seed * 31 + k, per, **kw)


def ring_rail(P, n, cx, cz, rot, r, y, h=0.5, t=0.025, col='steel'):
    """多邊形平台邊上的一圈欄杆。"""
    pts = [V(cx + r * cos(rot + 2 * pi * k / n), y, cz - r * sin(rot + 2 * pi * k / n)) for k in range(n + 1)]
    q = []
    for a, b in zip(pts, pts[1:]):
        q += [a, a.lerp(b, 0.5)]
    railing(P[col], q + [pts[-1]], h, t)


def mast(P, x, z, y0, y1, col='steel', tip='beacon', bars=2):
    """天線桿：細桿、幾根橫的振子、頂上一顆燈。"""
    cylY(P[col], x, z, y0, y1, 0.03, 0.015, 6)
    for i in range(bars):
        y = y0 + (y1 - y0) * (0.55 + 0.3 * i / max(1, bars - 1))
        w = 0.28 - 0.08 * i
        box(P[col], x - w, x + w, y, y + 0.02, z - 0.012, z + 0.012)
    if tip:
        cylY(P[tip], x, z, y1, y1 + 0.07, 0.035, None, 6)


def crate(P, x, z, y, w=0.5, h=0.4, d=0.7, col='navy'):
    box(P[col], x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2)
    box(P['steel'], x - w / 2 - 0.015, x + w / 2 + 0.015, y + h * 0.45, y + h * 0.55, z - d / 2 - 0.015, z + d / 2 + 0.015)


def tank(P, x, z, y, r=0.4, h=1.0, col='white', band='navy'):
    cylY(P[col], x, z, y, y + h, r, None, 12)
    dome(P[col], x, z, y + h, r, 12, 0.45)
    cylY(P[band], x, z, y + h * 0.35, y + h * 0.55, r * 1.02, None, 12)
    cylY(P['steel'], x, z, y, y + 0.06, r * 1.12, None, 12)
