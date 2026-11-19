# 登艦梯（取代 models/機庫/整備庫_22_登艦梯.glb）。舊模型在遊戲裡縮放 60：寬 8.3、深 8.4、高 6.2。四根柱子撐一個平台，樓梯從 +z 那頭上來，平台往 −x 伸出一段登艦橋。
# 新的尺寸、朝向一樣。沒有會動的部分。
#   blender -b --factory-startup --python build_stairs.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Tower 四根柱子、腳板、斜撐、平台；Flight 兩條斜樑、十六階踏板；Gangway 登艦橋的橋面、斜撐、端板；Rails 樓梯、平台、登艦橋的欄杆
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

PH, X0, X1, Z0, Z1, ZF = 5.0, 1.1, 4.1, -4.2, -1.2, 4.0      # 平台高度、平台的 x／z 範圍、樓梯最下面的 z
SX0, SX1 = 1.5, 3.7                                          # 樓梯的寬
M = Machine('stairs', '整備庫_31_登艦梯', tex=1024)

P = Pal()
LEGS = [(x, z) for x in (X0 + 0.2, X1 - 0.2) for z in (Z0 + 0.2, Z1 - 0.2)]
for x, z in LEGS:
    beam(P['white'], V(x, 0.06, z), V(x, PH - 0.1, z), 0.26)
    box(P['steel'], x - 0.3, x + 0.3, 0.0, 0.06, z - 0.3, z + 0.3)
    for dx, dz in ((0.2, 0.2), (-0.2, 0.2), (0.2, -0.2), (-0.2, -0.2)):
        cylY(P['steel'], x + dx, z + dz, 0.06, 0.1, 0.035, None, 6)
for x in (X0 + 0.2, X1 - 0.2):                               # 兩側的交叉斜撐
    beam(P['steel'], V(x, 0.5, Z0 + 0.2), V(x, PH - 0.6, Z1 - 0.2), 0.1)
    beam(P['steel'], V(x, PH - 0.6, Z0 + 0.2), V(x, 0.5, Z1 - 0.2), 0.1)
beam(P['steel'], V(X0 + 0.2, 0.5, Z0 + 0.2), V(X1 - 0.2, PH - 0.6, Z0 + 0.2), 0.1)
beam(P['steel'], V(X0 + 0.2, PH - 0.6, Z0 + 0.2), V(X1 - 0.2, 0.5, Z0 + 0.2), 0.1)
box(P['steel'], X0, X1, PH - 0.1, PH, Z0, Z1)                # 平台
for x in (X0 + 0.06, X1 - 0.06):
    beam(P['white'], V(x, PH - 0.22, Z0), V(x, PH - 0.22, Z1), 0.12, 0.24)
for z in (Z0 + 0.06, Z1 - 0.06):
    beam(P['white'], V(X0, PH - 0.22, z), V(X1, PH - 0.22, z), 0.12, 0.24)
box(P['hazard'], SX0, SX1, PH - 0.1, PH + 0.004, Z1 - 0.3, Z1)        # 樓梯口的警示帶
M.part('Tower', 'Root', P)
P = Pal()
for x in (SX0, SX1):
    beam(P['white'], V(x, 0.1, ZF), V(x, PH - 0.16, Z1), 0.12, 0.36)
N = 16
for i in range(N):
    t = (i + 1) / (N + 1)
    y, z = PH * t, ZF + (Z1 - ZF) * t
    box(P['steel'], SX0, SX1, y - 0.04, y, z - 0.17, z + 0.17)
    box(P['yellow'], SX0 + 0.06, SX1 - 0.06, y - 0.04, y + 0.003, z + 0.12, z + 0.17)      # 踏板前緣
M.part('Flight', 'Root', P)
P = Pal()
GX, GZ0, GZ1 = -4.1, -3.5, -1.9                              # 登艦橋伸到 x＝GX
box(P['steel'], GX, X0, PH - 0.1, PH, GZ0, GZ1)
for z in (GZ0 + 0.06, GZ1 - 0.06):
    beam(P['white'], V(GX, PH - 0.22, z), V(X0, PH - 0.22, z), 0.12, 0.24)
    beam(P['steel'], V(X0 + 0.2, 2.9, z), V(-1.9, PH - 0.3, z), 0.12)      # 從柱子斜撐上來
box(P['hazard'], GX - 0.012, GX, PH - 0.34, PH, GZ0, GZ1)
box(P['rubber'], GX - 0.14, GX - 0.012, PH - 0.2, PH - 0.02, GZ0 + 0.2, GZ1 - 0.2)        # 靠船的緩衝墊
M.part('Gangway', 'Root', P)
P = Pal()
for x in (SX0, SX1):                                         # 樓梯兩側
    railing(P['steel'], [V(x, PH * t, ZF + (Z1 - ZF) * t) for t in (0.0, 0.25, 0.5, 0.75, 1.0)], 1.1, 0.035)
railing(P['steel'], [V(SX1, PH, Z1), V(X1 - 0.05, PH, Z1 + 0.05), V(X1 - 0.05, PH, Z0 + 0.05), V(X0 + 0.05, PH, Z0 + 0.05), V(X0 + 0.05, PH, GZ0)], 1.1, 0.035)
railing(P['steel'], [V(SX0, PH, Z1), V(X0 + 0.05, PH, Z1 + 0.05), V(X0 + 0.05, PH, GZ1)], 1.1, 0.035)
for z in (GZ0 + 0.05, GZ1 - 0.05):
    railing(P['steel'], [V(X0 + 0.05, PH, z), V(-0.6, PH, z), V(-2.3, PH, z), V(GX + 0.05, PH, z)], 1.1, 0.035)
M.part('Rails', 'Root', P)

M.finish(dict(top=PH, gangway_end=[GX, PH, (GZ0 + GZ1) / 2]))
if '--compare' in ARGS:
    M.compare('22_登艦梯', 60, dist=1.0)
