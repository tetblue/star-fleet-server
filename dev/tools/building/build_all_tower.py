# 聯盟巨塔（取代 人類聯盟風_01巨塔_設計圖.glb）：白色與深藍的八角階梯塔，頂上一圈尖柱圍著發光的球、一根天線。
# 舊模型的外框比例 x 0.636、z 0.68、高 1 → 這裡高 20、x ±6.36、z ±6.8；正面（車庫門）朝 +z。
#   blender -b --factory-startup --python build_all_tower.py -- [--no-bake] [--no-export]
# 由下往上：方形的基地 → 第一層（八角、深藍腰帶、V 字徽、正面車庫門、警示條）→ 第二層（四面各一片深藍的斜鰭、燈條）
#          → 第三層（深藍腰帶）→ 第四層（直肋）→ 第五層與深藍的頸圈 → 四支尖柱、發光的球、天線
# 零件表：Pad 基地、欄杆、儲槽；Tier1～Tier5 各層；Fins 斜鰭；Crown 尖柱、球、天線
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

HX, HZ, H = 6.36, 6.8, 20.0
A8 = pi / 8                                            # 八角形轉 22.5°：平的面朝 ±x、±z
F8 = 0.9239                                            # 外接圓半徑 → 面到中心的距離
M = Machine('all_tower', '重製_聯盟巨塔', tex=4096, bevel=1.6)


def emblem(P, Mf, y, d, k=1.0):
    """V 字徽（兩片斜板）。"""
    for s in (1, -1):
        plate(P['white'], [(0, y), (s * 0.5 * k, y + 0.42 * k), (s * 0.5 * k, y + 0.62 * k), (0, y + 0.2 * k)] if s > 0 else
              [(0, y), (0, y + 0.2 * k), (s * 0.5 * k, y + 0.62 * k), (s * 0.5 * k, y + 0.42 * k)], d, d + 0.03, Mf)


P = Pal()
box(P['concrete'], -HX, HX, 0.0, 0.6, -HZ, HZ)
box(P['white'], -HX + 0.3, HX - 0.3, 0.6, 0.8, -HZ + 0.3, HZ - 0.3)
for sx in (1, -1):
    for sz in (1, -1):
        railing(P['steel'], [V(sx * (HX - 0.45), 0.8, sz * 2.6), V(sx * (HX - 0.45), 0.8, sz * 4.4), V(sx * (HX - 0.45), 0.8, sz * (HZ - 0.45)), V(sx * 4.2, 0.8, sz * (HZ - 0.45)), V(sx * 2.4, 0.8, sz * (HZ - 0.45))], 0.55, 0.03)
for x, z in ((-5.3, -5.6), (5.3, -5.6)):               # 後面兩角的儲槽
    cylY(P['white'], x, z, 0.8, 1.9, 0.5, None, 14)
    cylY(P['navy'], x, z, 1.2, 1.5, 0.51, None, 14)
    cylY(P['steel'], x, z, 1.9, 2.0, 0.3, None, 10)
box(P['navy'], 4.6, 5.6, 0.8, 1.5, 5.0, 5.9)           # 前面一角的設備箱
box(P['glow'], 4.8, 5.4, 1.2, 1.3, 5.9, 5.92)
M.part('Pad', 'Root', P)

P = Pal()
R1 = 5.7
prism(P['white'], 8, 0, 0, [(0.8, R1), (2.5, R1 - 0.25)], A8)
prism(P['navy'], 8, 0, 0, [(2.5, R1 - 0.2), (3.3, R1 - 0.55)], A8)
prism(P['white'], 8, 0, 0, [(3.3, R1 - 0.5), (3.55, R1 - 0.9)], A8)
prism(P['glow'], 8, 0, 0, [(2.38, R1 - 0.2), (2.46, R1 - 0.21)], A8, False, False)
d1 = (R1 - 0.1) * F8
box(P['steel'], -1.1, 1.1, 0.8, 2.2, d1 - 0.1, d1 + 0.12)                          # 正面的車庫門
for i in range(5):
    box(P['white'], -1.0, 1.0, 0.9 + i * 0.25, 1.1 + i * 0.25, d1 + 0.12, d1 + 0.15)
for s in (1, -1):
    box(P['hazard'], s * 1.2, s * 2.0, 0.8, 1.3, d1 + 0.02, d1 + 0.06)             # 門兩邊的警示條
    box(P['glow'], s * 1.2, s * 1.3, 1.5, 2.2, d1, d1 + 0.04)
for k, Mf in enumerate(FACES4):
    emblem(P, Mf, 2.6, (R1 - 0.42) * F8, 1.0)
    if k:
        for x in (-1.2, 0.0, 1.2):                     # 另外三面：一排窗
            box(P['glass'], x - 0.4, x + 0.4, 1.3, 1.9, d1 - 0.12, d1 - 0.02, Mf)
for k in range(4):                                     # 斜的四面：直的燈條與通風口
    Mf = Ry(pi / 4 + k * pi / 2)
    box(P['navy'], -1.2, 1.2, 1.1, 2.1, d1 - 0.14, d1 - 0.05, Mf)
    for x in (-0.8, 0.0, 0.8):
        box(P['glow'], x - 0.06, x + 0.06, 1.25, 1.95, d1 - 0.05, d1 - 0.03, Mf)
M.part('Tier1', 'Root', P)

P = Pal()
R2 = 4.2
prism(P['white'], 8, 0, 0, [(3.55, R2), (6.3, R2 - 0.55), (6.6, R2 - 0.9)], A8)
for k in range(4):
    Mf = Ry(pi / 4 + k * pi / 2)
    box(P['navy'], -0.9, 0.9, 4.0, 5.9, R2 * F8 - 0.42, R2 * F8 - 0.3, Mf)
    box(P['glass'], -0.6, 0.6, 4.3, 5.6, R2 * F8 - 0.33, R2 * F8 - 0.26, Mf)
M.part('Tier2', 'Root', P)

P = Pal()
for Mf in FACES4:                                      # 四面的深藍斜鰭：從第一層頂斜上去貼著第二、三層
    slabM(P['navy'], [(3.4, -0.55, 0.55, 3.0, 4.75), (6.7, -0.5, 0.5, 2.6, 3.55), (9.6, -0.4, 0.4, 2.2, 2.75)], Mf)
    slabM(P['white'], [(3.4, -0.3, 0.3, 4.6, 4.86), (6.7, -0.28, 0.28, 3.5, 3.66), (9.6, -0.22, 0.22, 2.7, 2.84)], Mf)
    box(P['glow'], -0.08, 0.08, 4.2, 5.6, 4.38, 4.46, Mf)
M.part('Fins', 'Root', P)

P = Pal()
R3 = 3.0
prism(P['white'], 8, 0, 0, [(6.6, R3), (8.0, R3 - 0.1)], A8)
prism(P['navy'], 8, 0, 0, [(8.0, R3 + 0.05), (8.8, R3 - 0.05)], A8)
prism(P['white'], 8, 0, 0, [(8.8, R3 - 0.15), (10.3, R3 - 0.4), (10.55, R3 - 0.7)], A8)
prism(P['glow'], 8, 0, 0, [(8.86, R3 - 0.13), (8.94, R3 - 0.14)], A8, False, False)
for k in range(4):
    Mf = Ry(pi / 4 + k * pi / 2)
    emblem(P, Mf, 8.1, (R3 + 0.02) * F8, 0.8)
    box(P['glass'], -0.5, 0.5, 9.2, 10.0, (R3 - 0.3) * F8 - 0.04, (R3 - 0.3) * F8 + 0.03, Mf)
M.part('Tier3', 'Root', P)

P = Pal()
R4 = 2.2
prism(P['white'], 8, 0, 0, [(10.55, R4), (13.7, R4 - 0.3), (14.0, R4 - 0.55)], A8)
for k in range(8):                                     # 直肋
    Mf = Ry(k * pi / 4)
    box(P['navy' if k % 2 else 'steel'], -0.14, 0.14, 10.8, 13.5, R4 * F8 - 0.3, R4 * F8 + 0.02, Mf)
    if k % 2 == 0:
        box(P['glow'], -0.04, 0.04, 11.2, 13.0, R4 * F8 + 0.02, R4 * F8 + 0.04, Mf)
prism(P['navy'], 8, 0, 0, [(12.0, R4 - 0.1), (12.4, R4 - 0.14)], A8, False, False)
M.part('Tier4', 'Root', P)

P = Pal()
prism(P['white'], 8, 0, 0, [(14.0, 1.5), (15.6, 1.4)], A8)
prism(P['navy'], 8, 0, 0, [(15.6, 1.75), (16.0, 1.75)], A8)
prism(P['white'], 8, 0, 0, [(16.0, 1.55), (16.15, 1.2)], A8)
for k in range(8):
    Mf = Ry(k * pi / 4)
    box(P['glass'], -0.3, 0.3, 14.4, 15.2, 1.4 * F8 - 0.03, 1.4 * F8 + 0.02, Mf)
M.part('Tier5', 'Root', P)

P = Pal()
for k in range(4):                                     # 四支尖柱（在斜的四個方向）
    a = pi / 4 + k * pi / 2
    x, z = 1.3 * cos(a), 1.3 * sin(a)
    sq(P['white'], x, z, [(16.0, 0.32), (17.6, 0.24), (18.8, 0.03)])
    sq(P['navy'], x, z, [(16.6, 0.3), (17.0, 0.28)])
cylY(P['steel'], 0, 0, 16.15, 16.45, 0.7, 0.5, 12)
orb(P['glow'], 0, 17.1, 0, 0.78, 14)
cylY(P['steel'], 0, 0, 17.8, H, 0.05, 0.015, 8)
cylY(P['beacon'], 0, 0, 19.3, 19.42, 0.07, None, 8)
M.part('Crown', 'Root', P)

# ===== 第三版：幾何細節 =====
# Detail1 第一層：每面的小零件、八個角的機房、頂上的欄杆與天線；Detail2 第二、三層；Detail3 第四、五層與上段的鰭；CrownD 冠上多四支短柱與一圈環；YardD 基地上的雜物
P = Pal()
tier_detail(P, 8, 0, 0, A8, R1, 0.8, R1 - 0.25, 2.5, 11, 3, skip=(5,), scale=0.8)
for k in (0, 2, 4, 6):                                 # 斜的四面底下各凸出一座機房
    Mf, w0, w1, sl = face_frame(8, 0, 0, A8, R1, 0.8, R1 - 0.25, 2.5, k)
    box(P['white'], -1.25, 1.25, -0.02, 1.15, -0.1, 0.75, Mf)
    box(P['navy'], -1.3, 1.3, 1.15, 1.28, -0.1, 0.8, Mf)
    box(P['glass'], -0.9, 0.9, 0.55, 0.85, 0.75, 0.78, Mf)
    vent(P, Tm(0, 0, 0.75) if False else Mf @ Tm(0, 0, 0.75), -1.1, 0.12, 0.6, 0.3, 0.03)
    box(P['hazard'], 0.3, 1.1, 0.02, 0.4, 0.75, 0.77, Mf)
    cylY(P['steel'], 0.8, 0.35, 1.28, 1.7, 0.1, None, 8, Mf)
ring_rail(P, 8, 0, 0, A8, R1 - 0.95, 3.55, 0.42, 0.022)
for k in range(8):                                     # 第一層頂的平台：冷氣機、天線
    a = A8 + k * pi / 4 + 0.2
    x, z = (R1 - 1.2) * cos(a), -(R1 - 1.2) * sin(a)
    if k % 2:
        mast(P, x, z, 3.55, 5.0)
    else:
        box(P['white'], x - 0.28, x + 0.28, 3.55, 3.95, z - 0.28, z + 0.28)
        cylY(P['dark'], x, z, 3.95, 3.98, 0.2, None, 10)
M.part('Detail1', 'Root', P)
P = Pal()
tier_detail(P, 8, 0, 0, A8, R2, 3.55, R2 - 0.55, 6.3, 12, 4, skip=(1, 3, 5, 7), scale=0.8)
ring_rail(P, 8, 0, 0, A8, R2 - 1.0, 6.6, 0.4, 0.02)
tier_detail(P, 8, 0, 0, A8, R3, 6.6, R3 - 0.1, 8.0, 13, 2, scale=0.6)
tier_detail(P, 8, 0, 0, A8, R3 - 0.15, 8.8, R3 - 0.4, 10.3, 14, 3, skip=(0, 2, 4, 6), scale=0.6)
ring_rail(P, 8, 0, 0, A8, R3 - 0.75, 10.55, 0.38, 0.02)
for k in range(4):                                     # 第三層頂：兩面小碟、兩支天線
    a = k * pi / 2 + 0.5
    x, z = (R3 - 0.95) * cos(a), -(R3 - 0.95) * sin(a)
    if k % 2:
        mast(P, x, z, 10.55, 12.3)
    else:
        cylY(P['steel'], x, z, 10.55, 11.0, 0.05, None, 6)
        dish(P['white'], Tm(x, 11.15, z) @ Ry(a + pi / 2) @ Rx(-0.7), 0.42, None, 12)
M.part('Detail2', 'Root', P)
P = Pal()
tier_detail(P, 8, 0, 0, A8, R4, 10.55, R4 - 0.3, 13.7, 15, 2, skip=(1, 3, 5, 7), scale=0.55)
ring_rail(P, 8, 0, 0, A8, R4 - 0.6, 14.0, 0.34, 0.018)
for Mf in FACES4:                                      # 上段的鰭（接著下面那四片往上）
    slabM(P['navy'], [(10.6, -0.3, 0.3, 1.85, 2.45), (14.1, -0.22, 0.22, 1.25, 1.7)], Mf)
    slabM(P['white'], [(10.6, -0.16, 0.16, 2.4, 2.52), (14.1, -0.12, 0.12, 1.66, 1.76)], Mf)
    box(P['glow'], -0.04, 0.04, 11.3, 13.2, 2.05, 2.2, Mf)
for k in range(8):                                     # 第五層的窗台與窗楣
    Mf, w0, w1, sl = face_frame(8, 0, 0, A8, 1.5, 14.0, 1.4, 15.6, k)
    box(P['white'], -0.38, 0.38, 0.28, 0.36, 0.0, 0.14, Mf)
    box(P['navy'], -0.36, 0.36, 1.26, 1.32, 0.0, 0.08, Mf)
M.part('Detail3', 'Root', P)
P = Pal()
for k in range(4):                                     # 四支短柱（在正的四個方向）
    a = k * pi / 2
    x, z = 1.35 * cos(a), 1.35 * sin(a)
    sq(P['white'], x, z, [(16.0, 0.24), (17.0, 0.18), (17.9, 0.03)])
    sq(P['navy'], x, z, [(16.3, 0.23), (16.55, 0.215)])
prism(P['navy'], 16, 0, 0, [(17.0, 1.0), (17.0, 1.1), (17.14, 1.1), (17.14, 1.0)], 0.0)
for k in range(8):
    a = A8 + k * pi / 4
    beam(P['steel'], V(0.72 * cos(a), 17.07, 0.72 * sin(a)), V(1.02 * cos(a), 17.07, 1.02 * sin(a)), 0.05)
    box(P['beacon'], -0.05, 0.05, 15.74, 15.86, 1.75 * F8, 1.75 * F8 + 0.03, Ry(k * pi / 4))
M.part('CrownD', 'Root', P)
P = Pal()
for i, (x, z) in enumerate(((-5.5, 5.4), (-4.8, 5.7), (-5.6, 4.5), (5.6, -3.6), (5.6, -2.7), (-5.7, -3.2))):
    crate(P, x, z, 0.8, 0.55, 0.42 + 0.1 * (i % 2), 0.7, ('navy', 'orange', 'white')[i % 3])
for sx in (1, -1):
    for sz in (1, -1):                                 # 四個角的照明燈柱
        x, z = sx * (HX - 0.7), sz * (HZ - 0.7)
        cylY(P['steel'], x, z, 0.8, 3.3, 0.05, None, 8)
        beam(P['navy'], V(x, 3.3, z), V(x - sx * 0.7, 3.3, z - sz * 0.7), 0.14, 0.1)
        beam(P['lamp'], V(x - sx * 0.3, 3.24, z - sz * 0.3), V(x - sx * 0.65, 3.24, z - sz * 0.65), 0.1, 0.02)
for s in (1, -1):                                      # 車庫門前的引導線與護柱
    box(P['hazard'], s * 1.3, s * 1.5, 0.8, 0.812, d1 + 0.2, HZ - 0.4)
    for z in (d1 + 0.5, HZ - 0.7):
        cylY(P['yellow'], s * 1.8, z, 0.8, 1.25, 0.07, None, 8)
tank(P, 5.3, -4.3, 0.8, 0.35, 0.8)
hose(P['steel'], [V(5.3, 1.0, -5.1), V(5.3, 1.0, -4.3), V(4.2, 1.0, -3.6), V(3.9, 1.6, -3.4)], 0.07, 8)
M.part('YardD', 'Root', P)

done(M, '重製_聯盟巨塔', dict(size=[HX * 2, H, HZ * 2]))
