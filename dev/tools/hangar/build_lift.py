# 剪式升降車（取代 models/機庫/整備庫_17_剪式升降車.glb）。舊模型在遊戲裡縮放 80：寬 4.3、長 8.1、平台高 5.7，升高是把整個模型往上拉長。
# 新的：兩層剪刀架、一支油壓缸，一個參數 lift（0～1）＝平台地板的高度 HMIN～HMAX。
#   blender -b --factory-startup --python build_lift.py -- [--no-bake] [--no-export] [--compare]
# 座標：x 左右、y 上、z 前後（車長）。剪刀架在 z–y 平面，銷沿 x。後端（−z）是固定銷，前端是滾輪。
#
# 零件表（* ＝銷，不參加互穿檢查）
#   Root ：Chassis 兩條浮筒、橫樑、缸座、軌道、後端固定耳座、四支撐腳、控制箱；Wheels 八個輪子
#   A0、A1：Arm_A* 外層的臂（後下 → 前上）；A1 的前上端有滾輪頂著平台的軌道
#   B0、B1：Arm_B* 內層的臂（前下 → 後上），左右兩片之間有橫管；B0 的前下端有滾輪走在車架的軌道上
#   A0～B1：Pins_**（兩端與中心的銷）
#   Deck ：Deck 平台地板、底下的軌道與後端耳座、欄杆、踢腳板、機械臂的安裝環
#   Cyl／Rod：Act_Lift_Barrel 缸筒、Act_Lift_Piston 活塞桿；Act_Lift_Pins*
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

L, N, Y0, DK, ZF = 7.4, 2, 1.72, 0.55, 3.6           # 臂長、層數、最下面那排銷的高度、平台地板比最上面那排銷高多少、固定銷在 z＝−ZF
TH0, TH1 = 6 * D, 60 * D
HMIN, HMAX = Y0 + N * L * sin(TH0) + DK, Y0 + N * L * sin(TH1) + DK
XA, XB = (1.52, 1.72), (1.28, 1.48)                  # 外層（A）、內層（B）各佔的 |x|
PARENT = dict(Root=None, Deck='Root', A0='Root', B0='Root', A1='Root', B1='Root', Cyl='Root', Rod='A0')
ACT = {}


def theta(h):
    return asin_((h - Y0 - DK) / (N * L))


def asin_(v):
    from math import asin
    return asin(max(-1.0, min(1.0, v)))


def fk(ang):
    h = ang['lift']
    t = theta(h)
    W = {'Root': I4.copy(), 'Deck': Tm(0, h, 0)}
    for k in range(N):
        c = Tm(0, Y0 + (k + 0.5) * L * sin(t), -ZF + L / 2 * cos(t))
        W['A%d' % k] = c @ Rx(-t)                    # 局部 +z 沿著臂：後下 → 前上
        W['B%d' % k] = c @ Rx(-(pi - t))             # 前下 → 後上
    if ACT:
        W['Cyl'], W['Rod'], ACT['len'] = aim_pair(W, ACT, (1, 0, 0))
    else:
        W['Cyl'], W['Rod'] = I4.copy(), W['A0'].copy()
    return W


JOINTS = [('lift', '平台高度', HMIN, HMAX, HMIN + (HMAX - HMIN) * 0.3)]
SAMPLES = [dict(lift=HMIN + (HMAX - HMIN) * i / 24) for i in range(25)]
# 油壓缸：缸座在車架中間的矮樑上，活塞桿推 A0 下面的橫管。轉軸是 A0 後端的固定銷（A0 座標的 z＝−L/2）
ACT.update(search_actuator('升降', fk, SAMPLES, 'Root', 'A0', [(0, y, z) for y in (0.75, 0.95) for z in (-0.5, 0.3, 1.1, 1.9, 2.7)],
                           [(0, -0.28, z) for z in (-2.9, -2.4, -1.9, -1.4, -0.9, -0.4)], clear=0.12, margin=0.7, pivot=(0, 0, -L / 2)))
M = Machine('lift', '整備庫_25_剪式升降車', JOINTS, PARENT, fk, dict(lift=['Deck', 'A0', 'B0', 'A1', 'B1', 'Cyl', 'Rod']), tex=1024)
PX = Ry(-pi / 2)                                      # plate 的外形畫在 (z, y)，沿 x 擠出

# ---- 車架 ----
P = Pal()
for s in (1, -1):
    x0, x1 = (1.15, 1.75) if s > 0 else (-1.75, -1.15)
    plate(P['white'], [(-4.05, 0.85), (-3.8, 0.6), (3.8, 0.6), (4.05, 0.85), (4.05, 1.22), (3.87, 1.4), (-3.87, 1.4), (-4.05, 1.22)], -x1, -x0, PX)
    box(P['navy'], min(s * 1.75, s * 1.762), max(s * 1.75, s * 1.762), 0.86, 1.14, -3.4, 3.4)
    for z in (-4.06, 4.05):                           # 兩端的警示條
        box(P['hazard'], x0 + 0.04, x1 - 0.04, 0.9, 1.2, z, z + 0.012)
    box(P['steel'], min(s * 1.05, s * 1.5), max(s * 1.05, s * 1.5), 1.36, 1.50, -0.1, 3.95)             # 軌道（滾輪走這裡；只有前半段，後半段留給油壓缸推的橫管）
    for xa, xb in ((1.30, 1.46), (1.76, 1.84)):       # 後端固定銷的耳座（A0 的後下端夾在中間）
        plate(P['steel'], [(-ZF - 0.34, 1.4), (-ZF + 0.34, 1.4), (-ZF + 0.2, Y0 + 0.12), (-ZF, Y0 + 0.22), (-ZF - 0.2, Y0 + 0.12)], -max(s * xa, s * xb), -min(s * xa, s * xb), PX)
    for z in (-3.3, 3.3):                             # 撐腳
        box(P['steel'], min(s * 1.78, s * 2.12), max(s * 1.78, s * 2.12), 0.95, 1.2, z - 0.16, z + 0.16)
        cylY(P['chrome'], s * 2.0, z, 0.12, 0.95, 0.07, None, 12)
        cylY(P['steel'], s * 2.0, z, 0.0, 0.12, 0.22, None, 16)
for z in (-3.5, 3.5):                                 # 橫樑只在兩端：中間是油壓缸的位置
    cylX(P['steel'], -1.15, 1.15, 0.78, z, 0.11, None, 12)
box(P['steel'], -0.45, 0.45, 0.28, 0.5, -0.9, 3.3)    # 缸座的矮樑
for s in (1, -1):
    plate(P['steel'], link2d(ACT['tp'][1] - 0.5, 0.2, 0.13), min(s * 0.21, s * 0.28), max(s * 0.21, s * 0.28), Tm(0, 0.5, ACT['tp'][2]) @ PX @ Rz(pi / 2))
box(P['white'], -0.6, 0.6, 0.6, 1.4, 3.35, 3.9)       # 控制箱（前端）
box(P['navy'], -0.45, 0.45, 0.75, 1.25, 3.9, 3.912)
box(P['glow'], -0.3, 0.3, 1.1, 1.14, 3.912, 3.922)
M.part('Chassis', 'Root', P)
P = Pal()
for s in (1, -1):
    for z in (-3.0, -1.65, 1.65, 3.0):
        cylX(P['rubber'], min(s * 1.79, s * 2.13), max(s * 1.79, s * 2.13), 0.55, z, 0.55, None, 20)
        cylX(P['steel'], min(s * 2.13, s * 2.16), max(s * 2.13, s * 2.16), 0.55, z, 0.26, None, 12)
M.part('Wheels', 'Root', P)

# ---- 剪刀架 ----
for k in range(N):
    for nm, (xa, xb), col in (('A', XA, 'white'), ('B', XB, 'navy')):
        P = Pal()
        for s in (1, -1):
            x0, x1 = min(s * xa, s * xb), max(s * xa, s * xb)
            box(P[col], x0, x1, -0.17, 0.17, -L / 2, L / 2)
            for z in (-L / 2, 0, L / 2):
                cylX(P['steel'], x0, x1, 0, z, 0.2, None, 20)
        if nm == 'B':
            for z in (-L / 2 + 0.9, L / 2 - 0.9):     # 左右兩片之間的橫管
                cylX(P['steel'], -XB[0], XB[0], 0, z, 0.09, None, 12)
        roll = (nm == 'B' and k == 0 and -L / 2) or (nm == 'A' and k == N - 1 and L / 2)
        if roll:                                      # 滾輪：在臂的內側，走在軌道上／頂著平台的軌道
            for s in (1, -1):
                cylX(P['rubber'], min(s * 1.07, s * 1.25), max(s * 1.07, s * 1.25), 0, roll, 0.21, None, 20)
        if nm == 'A' and k == 0:                      # 油壓缸推的橫管與耳座（在 A0 下面）
            for s in (1, -1):                         # 中間留給活塞桿的耳環，那一小段是銷
                cylX(P['steel'], min(s * 0.13, s * XA[0]), max(s * 0.13, s * XA[0]), ACT['bp'][1], ACT['bp'][2], 0.07, None, 12)
                box(P['steel'], min(s * 1.4, s * 1.52), max(s * 1.4, s * 1.52), ACT['bp'][1] - 0.1, -0.1, ACT['bp'][2] - 0.12, ACT['bp'][2] + 0.12)
        M.part('Arm_%s%d' % (nm, k), '%s%d' % (nm, k), P)
        P = Pal()
        for z in (-L / 2, 0, L / 2):
            cylX(P['chrome'], -1.88, 1.88, 0, z, 0.06, None, 12)
        M.part('Pins_%s%d' % (nm, k), '%s%d' % (nm, k), P, False)

# ---- 平台（原點在地板上表面的中心）----
P = Pal()
box(P['steel'], -2.13, 2.13, -0.12, 0.0, -4.05, 4.05)
for s in (1, -1):
    box(P['steel'], min(s * 1.05, s * 1.75), max(s * 1.05, s * 1.75), -DK + 0.24, -0.12, -3.95, 3.95)      # 底下的軌道
    plate(P['steel'], [(-ZF - 0.3, -0.12), (-ZF + 0.3, -0.12), (-ZF + 0.2, -DK - 0.1), (-ZF, -DK - 0.2), (-ZF - 0.2, -DK - 0.1)], -max(s * 1.52, s * 1.68), -min(s * 1.52, s * 1.68), PX)
    box(P['hazard'], min(s * 2.13, s * 2.142), max(s * 2.13, s * 2.142), -0.12, 0.14, -4.05, 4.05)        # 側邊警示帶
    box(P['white'], min(s * 2.05, s * 2.13), max(s * 2.05, s * 2.13), 0.0, 0.14, -4.05, 4.05)             # 踢腳板
for z in (-4.05, 3.97):
    box(P['white'], -2.13, 2.13, 0.0, 0.14, z, z + 0.08)
railing(P['steel'], [V(-2.09, 0, 0.9), V(-2.09, 0, 4.01), V(2.09, 0, 4.01), V(2.09, 0, 1.35), V(2.09, 0, -1.35), V(2.09, 0, -4.01), V(-2.09, 0, -4.01), V(-2.09, 0, -0.9)])   # 左邊留一個上下的缺口
cylY(P['white'], 0, 0, 0.0, 0.06, 2.05, None, 48)     # 機械臂的安裝環
for i in range(16):
    a = (i + 0.5) / 16 * 2 * pi
    cylY(P['steel'], 1.9 * cos(a), 1.9 * sin(a), 0.06, 0.09, 0.04, None, 6)
M.part('Deck_Platform', 'Deck', P)

# ---- 油壓缸 ----
actuator_parts(M, 'Act_Lift', ACT, 0.16, 0.12, 'Cyl', 'Rod')
P = Pal()
cylZ(P['chrome'], 0, 0, -0.31, 0.31, 0.06, 12)
M.part('Act_Lift_PinA', 'Cyl', P, False)
P = Pal()
cylZ(P['chrome'], 0, 0, -0.16, 0.16, 0.05, 12)
M.part('Act_Lift_PinB', 'Rod', P, False)

if '--no-check' not in ARGS:
    M.check(floor=True)
EX = dict(hmin=round(HMIN, 3), hmax=round(HMAX, 3), deck=[4.26, 8.1], act=dict(stroke=[round(ACT['lo'], 3), round(ACT['hi'], 3)], lever=round(ACT['lever'], 3)))
M.finish(EX)
if '--compare' in ARGS:
    M.compare('17_剪式升降車', 80, [dict(lift=5.7), dict(lift=HMIN), dict(lift=11.0)], dist=1.9)
if M.checkres and not M.checkres['pass']:
    sys.exit(1)
