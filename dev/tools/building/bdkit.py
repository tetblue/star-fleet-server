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
BMODELS = os.path.normpath(os.path.join(HERE_B, '..', '..', '..', 'models', '建築'))
_reset0 = hgkit.reset


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
    revolve(bm, prof + [(0.03 * r, r * 1.02), (-d * 0.2, r * 0.5), (-d * 1.3, r * 0.22)], M, segs)


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
