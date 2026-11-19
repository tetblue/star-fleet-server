# 氣瓶組（取代 models/機庫/整備庫_15_氣瓶組.glb）。舊模型在遊戲裡縮放 75：寬 2.7、深 5.2、高 3.3。六支氣瓶排成兩排，旁邊一圈軟管。
# 新的尺寸、朝向一樣。沒有會動的部分。
#   blender -b --factory-startup --python build_bottles.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Pallet 底盤與叉槽、四根角柱、兩道擋桿；Bottles 六支氣瓶（瓶身、瓶肩、色帶、護帽）；Manifold 每支瓶的閥、匯流管、調壓器、一捲軟管
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

M = Machine('bottles', '整備庫_35_氣瓶組', tex=1024)
XS, ZS, R, H0 = (-0.62, 0.62), (-1.45, -0.2, 1.05), 0.56, 0.3      # 兩排、三支、瓶身半徑、瓶底的高度

P = Pal()
box(P['steel'], -1.3, 1.3, 0.14, 0.3, -2.15, 1.75)
for z in (-1.5, 1.1):
    box(P['yellow'], -1.3, 1.3, 0.0, 0.14, z - 0.3, z + 0.3)
for x in (-1.24, 1.24):
    for z in (-2.09, 1.69):
        beam(P['white'], V(x, 0.3, z), V(x, 2.3, z), 0.12)
for y in (1.1, 2.2):                                               # 擋桿
    for x in (-1.24, 1.24):
        beam(P['steel'], V(x, y, -2.09), V(x, y, 1.69), 0.07)
    for z in (-2.09, 1.69):
        beam(P['steel'], V(-1.24, y, z), V(1.24, y, z), 0.07)
box(P['hazard'], -1.3, 1.3, 0.14, 0.3, 1.75, 1.762)
M.part('Pallet', 'Root', P)
P = Pal()
for i, x in enumerate(XS):
    for j, z in enumerate(ZS):
        My = Tm(x, 0, z) @ AXY
        revolve(P['white'], [(H0, R - 0.08), (H0 + 0.12, R), (H0 + 2.05, R), (H0 + 2.4, R * 0.62), (H0 + 2.55, 0.2)], My, 20)
        revolve(P['navy' if (i + j) % 2 else 'orange'], [(H0 + 1.5, R + 0.006), (H0 + 1.8, R + 0.006)], My, 20, False, False)
        revolve(P['steel'], [(H0 + 2.5, 0.24), (H0 + 2.92, 0.24), (H0 + 3.0, 0.16)], My, 14)       # 護帽
M.part('Bottles', 'Root', P)
P = Pal()
TOPY = H0 + 2.72
for z in ZS:                                                       # 每一排的橫管接到中間的匯流管
    beam(P['steel'], V(XS[0], TOPY, z), V(XS[1], TOPY, z), 0.07)
    for x in XS:
        cylX(P['chrome'], x - 0.34, x - 0.24, TOPY, z, 0.07, None, 10)
beam(P['steel'], V(0, TOPY, ZS[0]), V(0, TOPY, 1.6), 0.09)
box(P['navy'], -0.2, 0.2, TOPY - 0.3, TOPY + 0.16, 1.5, 1.82)      # 調壓器
cylZ(P['white'], 0, TOPY + 0.3, 1.6, 1.68, 0.16, 16)               # 壓力錶
cylZ(P['glow'], 0, TOPY + 0.3, 1.68, 1.69, 0.12, 16)
pts = [V(0, TOPY - 0.3, 1.86)]
for k in range(13):                                                # 掛在前面的一捲軟管
    a = k * 60 * D
    pts.append(V(0.55 * cos(a), 1.35 + 0.5 * sin(a), 1.9 + k * 0.012))
hose(P['rubber'], pts, 0.05, 8)
box(P['steel'], -0.1, 0.1, 1.75, 1.95, 1.75, 1.95)                 # 掛勾
M.part('Manifold', 'Root', P)

M.finish(dict(size=[2.6, 3.3, 4.2]))
if '--compare' in ARGS:
    M.compare('15_氣瓶組', 75, dist=1.15)
