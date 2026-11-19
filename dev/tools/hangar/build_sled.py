# 船的托架（照戰艦庫的設計圖）：一座騎在機庫軌道上的滑座，兩邊各一支支撐臂往中間斜上去托住船底，油壓缸頂著。
# 取代 build_cradle.py 的剪式托架（檔名一樣：整備庫_41_托架.glb）。一個參數 height＝墊子頂面的高度 HMIN～HMAX。
#   blender -b --factory-startup --python build_sled.py -- [--no-bake] [--no-export] [--no-check]
# 座標：x 左右、y 上、z 是船（軌道）的方向；原點在滑座底面的中心。機庫的軌道在 x＝±RX。
# 右臂在 z＝+ZA、左臂在 z＝−ZA（前後錯開，壓低的時候兩支臂在中間交叉也不會撞）；整座對 y 軸轉 180° 對稱，左半＝右半轉過去。
#
# 零件表（* ＝銷，不參加互穿檢查）
#   Root      ：Base 底板、壓在軌道上的兩條縱樑與輪座、兩座耳座（臂的轉軸與油壓缸的下固定點都在這裡）、控制箱
#   ArmR/ArmL ：Arm_R／Arm_L 支撐臂（箱型、兩頭圓），底下有油壓缸的耳座；Pins_R*／Pins_L*
#   PadR/PadL ：Pad_R／Pad_L 托墊（掛在臂的末端，不跟著臂轉，永遠朝上）
#   CylR/RodR、CylL/RodL：油壓缸的缸筒與活塞桿（固定點由程式挑）
import sys, os
from math import asin
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

RX, XPV, YPV, LA, PADH, ZA = 3.23, 4.1, 0.95, 4.0, 0.38, 0.62      # 軌道、臂的轉軸（x、y）、臂長、墊子頂面比臂端的銷高多少、臂的 z
TMIN, TMAX = -5 * D, 58 * D
HMIN, HMAX = YPV + LA * sin(TMIN) + PADH, YPV + LA * sin(TMAX) + PADH
FLIP = Ry(pi)
ACT = {}


def fk(ang):
    t = asin(max(-1.0, min(1.0, (ang['height'] - PADH - YPV) / LA)))
    W = {'Root': I4.copy(), 'ArmR': Tm(XPV, YPV, ZA) @ Rz(pi - t), 'PadR': Tm(XPV - LA * cos(t), YPV + LA * sin(t), ZA)}      # 臂的局部 +x 沿著臂、+y 朝下
    if ACT:
        W['CylR'], W['RodR'], ACT['len'] = aim_pair(W, ACT, (0, 0, 1))
    else:
        W['CylR'], W['RodR'] = I4.copy(), W['ArmR'].copy()
    for n in ('Arm', 'Pad', 'Cyl', 'Rod'):
        W[n + 'L'] = FLIP @ W[n + 'R']
    return W


best = search_actuator('支撐臂', fk, [dict(height=HMIN + (HMAX - HMIN) * i / 16) for i in range(17)], 'Root', 'ArmR',
                       [(XPV + dx, y, ZA) for dx in (0.6, 0.35, 0.1, -0.2) for y in (0.34, 0.42)],
                       [(b, 0.34, 0.0) for b in (1.4, 1.7, 2.0, 2.3, 2.6)], clear=0.42, margin=0.7)
ACT.update(best)
print('ANCHOR', best['tp'], best['bp'])
BX, BY = best['bp'][0], best['bp'][1]
AX, AY = best['tp'][0], best['tp'][1]

BONES = ['ArmR', 'PadR', 'CylR', 'RodR', 'ArmL', 'PadL', 'CylL', 'RodL']
M = Machine('sled', '整備庫_41_托架', [('height', '托面高度', HMIN, HMAX, HMIN + 0.8)],
            dict(Root=None, ArmR='Root', PadR='ArmR', CylR='Root', RodR='ArmR', ArmL='Root', PadL='ArmL', CylL='Root', RodL='ArmL'), fk, dict(height=BONES), tex=1024)

P = Pal()
box(P['steel'], -4.9, 4.9, 0.0, 0.1, -1.5, 1.5)                                         # 底板
for z in (-1.5, 1.3):
    box(P['white'], -4.9, 4.9, 0.1, 0.22, z, z + 0.2)                                   # 前後兩根橫樑
for S in (None, FLIP):
    for za, zb in ((-1.3, ZA - 0.3), (ZA + 0.3, 1.3)):                                  # 壓在軌道上的縱樑（油壓缸經過的那一段空著）
        box(P['white'], RX - 0.3, RX + 0.3, 0.1, 0.16, za, zb, S)
    for za, zb in ((0.9, 1.5), (-1.5, -0.9)):
        box(P['navy'], RX - 0.45, RX + 0.45, -0.1, 0.0, za, zb, S)                      # 輪座（夾著軌道）
    for za, zb in ((ZA + 0.24, ZA + 0.36), (ZA - 0.36, ZA - 0.24)):                     # 耳座：兩片板，臂和油壓缸夾在中間
        plate(P['white'], [(XPV - 0.6, 0.1), (XPV + 0.8, 0.1), (XPV + 0.8, 0.5), (XPV + 0.24, YPV + 0.08), (XPV, YPV + 0.22), (XPV - 0.24, YPV + 0.08)], za, zb, S)
    box(P['hazard'], 4.9, 4.912, 0.0, 0.1, -1.5, 1.5, S)
    box(P['navy'], 1.2, 2.6, 0.1, 0.55, -1.25, -0.5, S)                                 # 控制箱（在另一支臂掃不到的那一角）
    box(P['glow'], 1.4, 2.4, 0.55, 0.56, -1.0, -0.9, S)
M.part('Base', 'Root', P)
for n in ('R', 'L'):
    P = Pal()
    plate(P['white'], link2d(LA, 0.22, 0.14), -0.2, 0.2)
    for z0, z1 in ((0.2, 0.212), (-0.212, -0.2)):                                       # 兩側的深藍條
        plate(P['navy'], [(0.9, -0.09), (LA - 0.7, -0.07), (LA - 0.7, 0.07), (0.9, 0.09)], z0, z1)
    for z0, z1 in ((0.11, 0.19), (-0.19, -0.11)):                                       # 油壓缸的耳座（在臂的下面）
        plate(P['steel'], [(BX - 0.24, 0.0), (BX + 0.24, 0.0), (BX + 0.12, BY + 0.13), (BX - 0.12, BY + 0.13)], z0, z1)
    M.part('Arm_' + n, 'Arm' + n, P)
    P = Pal()
    cylZ(P['chrome'], 0, 0, -0.4, 0.4, 0.07, 12)
    cylZ(P['chrome'], LA, 0, -0.34, 0.34, 0.05, 12)
    cylZ(P['chrome'], BX, BY, -0.2, 0.2, 0.04, 10)
    M.part('Pins_' + n, 'Arm' + n, P, False)
    P = Pal()
    for z0, z1 in ((0.24, 0.32), (-0.32, -0.24)):                                       # 托墊：兩片耳板夾著臂端
        plate(P['steel'], [(-0.2, 0.26), (-0.12, -0.06), (0.0, -0.12), (0.12, -0.06), (0.2, 0.26)], z0, z1)
    box(P['white'], -0.6, 0.6, 0.24, 0.32, -0.5, 0.5)
    box(P['rubber'], -0.55, 0.55, 0.32, PADH, -0.45, 0.45)
    for z0, z1 in ((0.5, 0.512), (-0.512, -0.5)):
        box(P['hazard'], -0.6, 0.6, 0.24, 0.32, z0, z1)
    M.part('Pad_' + n, 'Pad' + n, P)
    actuator_parts(M, 'Act_' + n, ACT, 0.13, 0.1, 'Cyl' + n, 'Rod' + n)
P = Pal()
for S in (None, FLIP):
    cylZ(P['chrome'], AX, AY, ZA - 0.3, ZA + 0.3, 0.04, 10, S)                          # 油壓缸下固定點的銷
M.part('Pins_Base', 'Root', P, False)

if '--no-check' not in ARGS:
    M.check(floor=True)
M.finish(dict(hmin=round(HMIN, 3), hmax=round(HMAX, 3), width=9.8, depth=3.0, gauge=RX))
if M.checkres and not M.checkres['pass']:
    sys.exit(1)
