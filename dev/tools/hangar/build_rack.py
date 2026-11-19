# 飛彈架（取代 models/機庫/整備庫_04_飛彈架.glb；天車吊的那一箱也是它）。舊模型在遊戲裡縮放 85：寬 5.2、深 4.8、高 2.4，兩台小車各載兩枚飛彈，上面一塊方塊。
# 新的：一個吊運架載四枚飛彈（彈頭朝 +z），頂上的吊環就是天車吊鉤掛的點（高度 TOP，跟舊模型的頂一樣高）。沒有會動的部分。
#   blender -b --factory-startup --python build_rack.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Skid 底架與堆高機的叉槽；Saddles 每枚飛彈前後兩個鞍座與束帶；Missiles 四枚飛彈（彈體、色帶、彈頭、尾翼）；Lift_Frame 四根立柱、頂框、斜撐、吊環
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

TOP, XS, MY, MR = 2.4, (-1.8, -0.6, 0.6, 1.8), 1.12, 0.4      # 吊環頂的高度、四枚飛彈的 x、飛彈中心的高度、彈體半徑
M = Machine('rack', '整備庫_28_飛彈架', tex=1024, yaw=90)      # 舊模型的彈頭朝 +x（零件照 +z 建，最後整個轉 90°，朝向跟舊模型一樣）

P = Pal()
for x in (-2.45, 2.45):
    beam(P['steel'], V(x, 0.14, -2.25), V(x, 0.14, 2.25), 0.28)
for z in (-1.9, -0.65, 0.65, 1.9):
    beam(P['steel'], V(-2.45, 0.14, z), V(2.45, 0.14, z), 0.22)
for x in (-1.2, 1.2):                                 # 叉槽
    box(P['yellow'], x - 0.32, x + 0.32, 0.0, 0.26, -2.25, 2.25)
    box(P['hazard'], x - 0.32, x + 0.32, 0.03, 0.23, 2.25, 2.262)
M.part('Skid', 'Root', P)
P = Pal()
for x in XS:
    for z in (-1.3, 0.9):
        plate(P['navy'], [(x - 0.5, 0.25), (x + 0.5, 0.25), (x + 0.5, MY - 0.1), (x + 0.3, MY - 0.3), (x - 0.3, MY - 0.3), (x - 0.5, MY - 0.1)], z - 0.14, z + 0.14)
        box(P['rubber'], x - 0.3, x + 0.3, MY - 0.42, MY - 0.3, z - 0.15, z + 0.15)
        revolve(P['steel'], [(z - 0.06, MR + 0.025), (z + 0.06, MR + 0.025)], Tm(x, MY, 0), 20, False, False)      # 束帶
        box(P['steel'], x - 0.07, x + 0.07, MY + MR, MY + MR + 0.09, z - 0.09, z + 0.09)                          # 束帶扣
M.part('Saddles', 'Root', P)
P = Pal()
for x in XS:
    Mz = Tm(x, MY, 0)
    revolve(P['white'], [(-2.15, 0.3), (-2.05, MR), (1.15, MR), (1.9, 0.22), (2.25, 0.03)], Mz, 20)
    revolve(P['navy'], [(0.35, MR + 0.006), (0.7, MR + 0.006)], Mz, 20, False, False)
    revolve(P['orange'], [(1.92, 0.215), (2.27, 0.03)], Mz, 20, False, True)
    revolve(P['steel'], [(-2.3, 0.26), (-2.15, 0.3)], Mz, 16)                 # 噴口
    for a in (45, 135, 225, 315):                                             # 尾翼
        box(P['navy'], MR - 0.03, MR + 0.3, -0.02, 0.02, -2.0, -1.45, Mz @ Rz(a * D))
M.part('Missiles', 'Root', P)
P = Pal()
for x in (-2.45, 2.45):
    for z in (-1.9, 1.9):
        beam(P['white'], V(x, 0.28, z), V(x, 1.9, z), 0.16)
        beam(P['steel'], V(x, 0.3, z), V(x, 1.1, z * 0.55), 0.08)
for x in (-2.45, 2.45):
    beam(P['white'], V(x, 1.9, -1.9), V(x, 1.9, 1.9), 0.16)
for z in (-1.9, 1.9):
    beam(P['white'], V(-2.45, 1.9, z), V(2.45, 1.9, z), 0.16)
    box(P['hazard'], -2.3, 2.3, 1.83, 1.97, min(z * 1.043, z * 1.049), max(z * 1.043, z * 1.049))
for sx in (1, -1):
    for sz in (1, -1):                                # 四根斜撐收到中間的吊座
        beam(P['steel'], V(sx * 2.4, 1.9, sz * 1.85), V(sx * 0.18, 2.02, sz * 0.18), 0.1)
box(P['steel'], -0.3, 0.3, 1.94, 2.08, -0.3, 0.3)
hose(P['steel'], [V(-0.16, 2.06, 0), V(-0.2, 2.26, 0), V(0, TOP - 0.05, 0), V(0.2, 2.26, 0), V(0.16, 2.06, 0)], 0.05, 8)      # 吊環
M.part('Lift_Frame', 'Root', P)

M.finish(dict(top=TOP, hang=[0, TOP - 0.1, 0]))
if '--compare' in ARGS:
    M.compare('04_飛彈架', 85, dist=1.2)
