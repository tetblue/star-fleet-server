# 通訊塔（取代 人類聯盟風_10通訊塔_設計圖.glb）：八角基座、方形塔身、鋼架段、環形平台，頂上一面大碟形天線和幾面小的。
# 舊模型的外框比例 x 0.549、z 0.557、高 1 → 這裡高 20、x ±5.49、z ±5.57；正面（門）朝 +z。
#   blender -b --factory-startup --python build_comm.py -- [--no-bake] [--no-export]
# 零件表：Pad 基地、管線、儲槽；Base 八角基座、腰帶、門；Shaft 方形塔身、深藍面板、箭頭、四角的鰭；Lattice 鋼架段（四根角柱、斜撐、中間的纜線井）；
#         Ring 環形平台、欄杆、紅燈；Mast 桅杆；Dishes 大小碟形天線；Antennas 天線桿與頂上的紅燈
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

HX, HZ, H = 5.49, 5.57, 20.0
A8, F8 = pi / 8, 0.9239
M = Machine('comm', '重製_通訊塔', tex=4096, bevel=1.6)

P = Pal()
box(P['concrete'], -HX, HX, 0.0, 0.7, -HZ, HZ)
hose(P['steel'], [V(-4.9, 0.95, 2.0), V(-4.9, 0.95, 4.9), V(-2.0, 0.95, 4.9)], 0.22, 10)       # 基地邊上的粗管
hose(P['steel'], [V(4.9, 0.95, -2.0), V(4.9, 0.95, -4.9), V(2.0, 0.95, -4.9)], 0.22, 10)
for x, z in ((-4.6, -4.6), (-3.5, -4.8)):
    cylY(P['white'], x, z, 0.7, 1.8, 0.45, None, 12)
    cylY(P['navy'], x, z, 1.1, 1.35, 0.46, None, 12)
box(P['white'], 3.9, 5.0, 0.7, 1.6, 3.9, 5.0)          # 發電機箱
box(P['navy'], 4.0, 4.9, 1.6, 1.7, 4.0, 4.9)
box(P['glow'], 4.1, 4.8, 1.2, 1.3, 5.0, 5.02)
M.part('Pad', 'Root', P)

P = Pal()
R1 = 4.5
prism(P['white'], 8, 0, 0, [(0.7, R1), (2.3, R1 - 0.2), (2.6, R1 - 0.7)], A8)
prism(P['navy'], 8, 0, 0, [(1.25, R1 - 0.03), (1.85, R1 - 0.1)], A8, False, False)
prism(P['glow'], 8, 0, 0, [(1.92, R1 - 0.13), (1.99, R1 - 0.14)], A8, False, False)
prism(P['hazard'], 8, 0, 0, [(2.6, 3.4), (2.95, 3.4)], A8)
d1 = (R1 - 0.1) * F8
box(P['steel'], -0.6, 0.6, 0.7, 2.0, d1 - 0.1, d1 + 0.1)                           # 門
box(P['navy'], -0.5, 0.5, 0.8, 1.9, d1 + 0.1, d1 + 0.13)
box(P['glow'], -0.3, 0.3, 2.05, 2.12, d1 + 0.05, d1 + 0.09)
for k in range(1, 4):
    box(P['white'], -1.0, 1.0, 0.9, 1.9, d1 - 0.1, d1 + 0.06, FACES4[k])           # 另外三面凸出來的機櫃
    for x in (-0.6, 0.0, 0.6):
        box(P['steel'], x - 0.2, x + 0.2, 1.1, 1.7, d1 + 0.06, d1 + 0.08, FACES4[k])
M.part('Base', 'Root', P)

P = Pal()
HS = 1.9
sq(P['white'], 0, 0, [(2.95, HS + 0.3), (3.6, HS), (7.0, HS - 0.25), (7.3, HS - 0.6)])
for Mf in FACES4:
    box(P['navy'], -0.9, 0.9, 3.8, 6.6, HS - 0.16, HS - 0.02, Mf)
    for i in range(2):                                 # 黃色箭頭
        y = 4.3 + i * 0.7
        for s in (1, -1):
            plate(P['yellow'], [(0, y), (s * 0.45, y + 0.4), (s * 0.45, y + 0.6), (0, y + 0.2)] if s > 0 else [(0, y), (0, y + 0.2), (s * 0.45, y + 0.6), (s * 0.45, y + 0.4)], HS - 0.02, HS + 0.01, Mf)
    box(P['glow'], -0.5, 0.5, 6.1, 6.2, HS - 0.02, HS, Mf)
for sx in (1, -1):                                     # 四角的鰭
    for sz in (1, -1):
        slab(P['white'], [(2.95, sx * 1.7, sx * 2.9, sz * 1.7, sz * 2.9), (6.0, sx * 1.6, sx * 2.15, sz * 1.6, sz * 2.15), (7.6, sx * 1.4, sx * 1.75, sz * 1.4, sz * 1.75)])
        box(P['navy'], sx * 2.0, sx * 2.6, 3.3, 4.3, sz * 2.0, sz * 2.6)
M.part('Shaft', 'Root', P)

P = Pal()
YL0, YL1, HP = 7.3, 13.9, 1.35                         # 鋼架段
for sx in (1, -1):
    for sz in (1, -1):
        beam(P['white'], V(sx * HP, YL0, sz * HP), V(sx * HP, YL1, sz * HP), 0.3)
sq(P['navy'], 0, 0, [(YL0, 0.6), (YL1, 0.6)])          # 中間的纜線井
for i in range(4):
    cylY(P['steel'], (0.72 if i % 2 else -0.72) * (1 if i < 2 else 0), (0.72 if i % 2 else -0.72) * (0 if i < 2 else 1), YL0, YL1, 0.07, None, 6)
NB = 3
for Mf in FACES4:
    for i in range(NB + 1):
        y = YL0 + (YL1 - YL0) * i / NB
        beam(P['steel'], Mf @ V(-HP, y, HP), Mf @ V(HP, y, HP), 0.14)
    for i in range(NB):
        y0, y1 = YL0 + (YL1 - YL0) * i / NB, YL0 + (YL1 - YL0) * (i + 1) / NB
        beam(P['steel'], Mf @ V(-HP, y0, HP), Mf @ V(HP, y1, HP), 0.1)
        beam(P['steel'], Mf @ V(HP, y0, HP), Mf @ V(-HP, y1, HP), 0.1)
M.part('Lattice', 'Root', P)

P = Pal()
RR = 2.7
prism(P['navy'], 8, 0, 0, [(YL1, RR - 0.5), (YL1 + 0.12, RR), (YL1 + 0.4, RR)], A8)
prism(P['white'], 8, 0, 0, [(YL1 + 0.4, RR - 0.15), (YL1 + 0.48, RR - 0.15)], A8)
pts = [V((RR - 0.3) * cos(A8 + k * pi / 4), YL1 + 0.48, (RR - 0.3) * sin(A8 + k * pi / 4)) for k in range(9)]
railing(P['steel'], pts, 0.6, 0.03)
for k in range(8):
    a = A8 + k * pi / 4
    box(P['beacon'], -0.09, 0.09, YL1 + 0.14, YL1 + 0.32, RR - 0.02, RR + 0.03, Ry(pi / 2 - a))
M.part('Ring', 'Root', P)

P = Pal()
YM = YL1 + 0.48
sq(P['white'], 0, 0, [(YM, 0.95), (YM + 0.5, 0.8), (17.4, 0.7)])
sq(P['navy'], 0, 0, [(15.2, 0.76), (16.2, 0.74)])
sq(P['steel'], 0, 0, [(17.4, 0.85), (17.6, 0.85)])
for Mf in FACES4:
    box(P['glow'], -0.06, 0.06, 15.3, 16.1, 0.76, 0.78, Mf)
M.part('Mast', 'Root', P)

P = Pal()
MD = Tm(0.15, 18.15, 0.25) @ Ry(0.5) @ Rx(-0.9)        # 大碟：斜斜朝上、偏向正面
cylY(P['steel'], 0, 0, 17.6, 17.95, 0.3, 0.22, 10)
dish(P['white'], MD, 2.0)
for k in range(3):                                     # 饋源的三支撐桿與饋源
    a = k * 2 * pi / 3
    beam(P['steel'], MD @ V(1.7 * cos(a), 1.7 * sin(a), 0.0), MD @ V(0, 0, 1.25), 0.05)
revolve(P['navy'], [(1.15, 0.14), (1.4, 0.14)], MD, 8)
for y, yaw, r in ((16.6, 0.0, 0.62), (15.6, pi / 2, 0.55), (16.3, pi, 0.6), (15.2, -pi / 2, 0.5), (14.9, 0.5, 0.42)):       # 桅杆四周的小碟
    Md = Ry(yaw) @ Tm(0, y, 1.15) @ Rx(-0.25)
    dish(P['white'], Md, r)
    beam(P['steel'], Ry(yaw) @ V(0, y, 0.7), Ry(yaw) @ V(0, y, 1.1), 0.1)
    revolve(P['navy'], [(r * 0.35, 0.05), (r * 0.5, 0.05)], Md, 6)
M.part('Dishes', 'Root', P)

P = Pal()
for x, z, y1, r in ((-0.55, -0.55, H, 0.035), (0.6, -0.6, 19.2, 0.03), (-0.65, 0.5, 18.8, 0.03)):
    cylY(P['steel'], x, z, 17.6, y1 - 0.12, r, None, 6)
    cylY(P['beacon'], x, z, y1 - 0.12, y1, r * 1.8, None, 6)
box(P['steel'], -0.9, -0.2, 18.4, 18.44, -0.58, -0.52)                             # 橫的天線陣
box(P['steel'], -0.9, -0.2, 18.9, 18.94, -0.58, -0.52)
M.part('Antennas', 'Root', P)

done(M, '重製_通訊塔', dict(size=[HX * 2, H, HZ * 2]))
