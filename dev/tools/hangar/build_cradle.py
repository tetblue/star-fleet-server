# 船的托架（第五階段的樣本）。現在的托架是程式裡的一塊方塊，高度照船底直接拉長。
# 新的：一座剪式托架，一個參數 height（0～1）＝托面的高度 HMIN～HMAX；頂上是墊著橡膠的托樑。船沿 z 停，托架橫著（沿 x）。
#   blender -b --factory-startup --python build_cradle.py -- [--no-bake] [--no-export]
# 座標：x 左右、y 上、z 是船的方向。剪刀架在 x–y 平面，銷沿 z。左邊（−x）是固定銷，右邊是滾輪。
#
# 零件表（* ＝銷，不參加互穿檢查）
#   Root：Base 底框、軌道、左邊的固定耳座、調平腳、螺桿與馬達箱（示意，不會轉）
#   A   ：Arm_A 外層的臂（左下 → 右上），右上端的滾輪頂著托樑的軌道；Pins_A*
#   B   ：Arm_B 內層的臂（右下 → 左上），前後兩片之間有橫管，右下端的滾輪走在底框的軌道上；Pins_B*
#   Top ：Saddle 托樑、底下的軌道與左邊的耳座、橡膠墊、兩端的警示帶
import sys, os
from math import asin
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

L, Y0, DK, XF, PAD = 4.8, 0.45, 0.35, 2.35, 0.06      # 臂長、下排銷的高度、托樑頂面比上排銷高多少、固定銷在 x＝−XF、橡膠墊的厚度
HMIN, HMAX = Y0 + L * sin(6 * D) + DK + PAD, Y0 + L * sin(62 * D) + DK + PAD
ZA, ZB = (0.62, 0.78), (0.42, 0.58)                    # 外層（A）、內層（B）各佔的 |z|


def fk(ang):
    h = ang['height']
    t = asin(max(-1.0, min(1.0, (h - PAD - DK - Y0) / L)))
    c = Tm(-XF + L / 2 * cos(t), Y0 + L / 2 * sin(t), 0)
    return {'Root': I4.copy(), 'Top': Tm(0, h, 0), 'A': c @ Rz(t), 'B': c @ Rz(pi - t)}       # 局部 +x 沿著臂


M = Machine('cradle', '整備庫_41_托架', [('height', '托面高度', HMIN, HMAX, HMIN + 0.8)], dict(Root=None, Top='Root', A='Root', B='Root'), fk,
            dict(height=['Top', 'A', 'B']), tex=1024)

P = Pal()
for s in (1, -1):
    z0, z1 = min(s * 0.9, s * 1.1), max(s * 0.9, s * 1.1)
    box(P['white'], -2.9, 2.9, 0.0, 0.22, z0, z1)                                       # 底框的兩條縱樑
    box(P['steel'], -0.3, 2.75, 0.12, 0.24, min(s * 0.36, s * 0.6), max(s * 0.36, s * 0.6))     # 軌道（B 的滾輪走這裡）
    for za, zb in ((0.8, 0.88), (0.44, 0.6)):                                           # 左邊固定銷的耳座（A 的左下端夾在中間）
        plate(P['steel'], [(-XF - 0.3, 0.1), (-XF + 0.3, 0.1), (-XF + 0.18, Y0 + 0.1), (-XF, Y0 + 0.2), (-XF - 0.18, Y0 + 0.1)], min(s * za, s * zb), max(s * za, s * zb))
    for x in (-2.6, 2.6):                                                               # 調平腳
        cylY(P['steel'], x, s * 1.0, 0.0, 0.06, 0.2, None, 12)
    box(P['hazard'], -2.9, 2.9, 0.02, 0.2, min(s * 1.1, s * 1.112), max(s * 1.1, s * 1.112))
for x in (-2.8, -1.2, 2.8):
    box(P['white'], x - 0.1, x + 0.1, 0.0, 0.12, -1.1, 1.1)                             # 橫樑（壓低，讓 B 的橫管過得去）
box(P['navy'], -2.9, -2.1, 0.12, 0.62, -0.3, 0.3)                                       # 馬達箱
box(P['glow'], -2.5, -2.3, 0.62, 0.63, -0.2, 0.2)
cylX(P['chrome'], -2.1, 2.7, 0.3, 0.0, 0.035, None, 10)                                 # 螺桿
M.part('Base', 'Root', P)
for nm, (za, zb), col in (('A', ZA, 'white'), ('B', ZB, 'navy')):
    P = Pal()
    for s in (1, -1):
        z0, z1 = min(s * za, s * zb), max(s * za, s * zb)
        box(P[col], -L / 2, L / 2, -0.12, 0.12, z0, z1)
        for x in (-L / 2, 0, L / 2):
            cylZ(P['steel'], x, 0, z0, z1, 0.15, 16)
    if nm == 'B':                                                                       # 前後兩片之間的橫管；右下端的滾輪
        cylZ(P['steel'], L / 2 - 0.6, 0, -ZB[0], ZB[0], 0.06, 10)
        for s in (1, -1):
            cylZ(P['rubber'], -L / 2, 0, min(s * 0.37, s * 0.42), max(s * 0.37, s * 0.42), 0.19, 16)
    else:                                                                               # 右上端的滾輪（頂著托樑的軌道）
        for s in (1, -1):
            cylZ(P['rubber'], L / 2, 0, min(s * 0.78, s * 0.83), max(s * 0.78, s * 0.83), 0.19, 16)
    M.part('Arm_' + nm, nm, P)
    P = Pal()
    for x in (-L / 2, 0, L / 2):
        cylZ(P['chrome'], x, 0, -0.92, 0.92, 0.05, 10)
    M.part('Pins_' + nm, nm, P, False)
P = Pal()                                                                               # 托樑（原點在墊子頂面的中心）
box(P['white'], -2.9, 2.9, -PAD - 0.1, -PAD, -1.0, 1.0)
for s in (1, -1):
    box(P['steel'], -0.3, 2.75, -PAD - DK + 0.2, -PAD - 0.1, min(s * 0.6, s * 0.86), max(s * 0.6, s * 0.86))      # 底下的軌道（A 的滾輪頂這裡）
    for za, zb in ((0.6, 0.68), (0.3, 0.4)):                                            # 左邊的耳座（B 的左上端夾在中間）
        plate(P['steel'], [(-XF - 0.26, -PAD - 0.1), (-XF + 0.26, -PAD - 0.1), (-XF + 0.17, -PAD - DK - 0.08), (-XF, -PAD - DK - 0.17), (-XF - 0.17, -PAD - DK - 0.08)],
              min(s * za, s * zb), max(s * za, s * zb))
    box(P['hazard'], min(s * 2.9, s * 2.912), max(s * 2.9, s * 2.912), -PAD - 0.1, -PAD, -1.0, 1.0)
for x in (-2.0, -0.7, 0.7, 2.0):
    box(P['rubber'], x - 0.5, x + 0.5, -PAD, 0.0, -0.9, 0.9)                            # 橡膠墊（船底壓在這上面）
M.part('Saddle', 'Top', P)

if '--no-check' not in ARGS:
    M.check(floor=True)
M.finish(dict(hmin=round(HMIN, 3), hmax=round(HMAX, 3), width=5.8, depth=2.2))
if M.checkres and not M.checkres['pass']:
    sys.exit(1)
