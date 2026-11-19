# 星艦船塢（無船）（取代 人類聯盟風_03星艦船塢_無船_設計圖.glb）：一座高起的平台，中間是乾塢的凹槽，三道門形架跨在上面，前面兩座高塔、一座吊車。
# 舊模型的外框比例 x 0.88、z 1、高 0.543 → 這裡 x ±8.8、z ±10、高 10.86；入口朝 +z。
#   blender -b --factory-startup --python build_dock.py -- [--no-bake] [--no-export]
# 零件表：Base 地基與平台（中間留乾塢的凹槽）、圍牆、入口；Pit 乾塢的底、龍骨墩、警示框；Gantry 三道門形架（立柱＋桁架樑）與兩側的縱樑；
#         Towers 前面兩座高塔；Crane 門形架頂上的吊車；Arms 塢邊的機械臂；Yard 管制室、停機坪、管線、儲槽
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

HX, HZ, H = 8.8, 10.0, 10.86
YD = 1.5                                               # 平台面
PX, PZ0, PZ1 = 3.4, -8.2, 6.0                          # 乾塢的凹槽
M = Machine('dock', '重製_星艦船塢', tex=4096, bevel=1.6)


def truss(P, a, b, h, w, n):
    """桁架樑：a → b（水平），高 h、寬 w，n 格。"""
    a, b = Vector(a), Vector(b)
    d = (b - a) / n
    side = V(0, 0, 1) if abs(d.x) > abs(d.z) else V(1, 0, 0)
    for s in (1, -1):
        o = side * (s * w / 2)
        beam(P['white'], a + o, b + o, 0.16)
        beam(P['white'], a + o + V(0, h, 0), b + o + V(0, h, 0), 0.16)
        for i in range(n):
            p, q = a + d * i + o, a + d * (i + 1) + o
            beam(P['steel'], p if i % 2 else p + V(0, h, 0), q + V(0, h, 0) if i % 2 else q, 0.09)
    for i in range(n + 1):
        p = a + d * i
        beam(P['steel'], p - side * (w / 2), p + side * (w / 2), 0.09)
        beam(P['steel'], p - side * (w / 2) + V(0, h, 0), p + side * (w / 2) + V(0, h, 0), 0.09)


P = Pal()
box(P['concrete'], -HX, HX, 0.0, 0.45, -HZ, HZ)
CH = 1.6                                               # 平台的四個角切掉
out = [(-HX + 0.3 + CH, -HZ + 0.3), (HX - 0.3 - CH, -HZ + 0.3), (HX - 0.3, -HZ + 0.3 + CH), (HX - 0.3, HZ - 0.3 - CH), (HX - 0.3 - CH, HZ - 0.3), (-HX + 0.3 + CH, HZ - 0.3), (-HX + 0.3, HZ - 0.3 - CH), (-HX + 0.3, -HZ + 0.3 + CH)]
for x0, x1, z0, z1 in ((-HX + 0.3, -PX, -HZ + 0.3 + CH, HZ - 0.3 - CH), (PX, HX - 0.3, -HZ + 0.3 + CH, HZ - 0.3 - CH), (-PX, PX, -HZ + 0.3, PZ0), (-PX, PX, PZ1, HZ - 0.3)):
    box(P['white'], x0, x1, 0.45, YD, z0, z1)
for sx in (1, -1):
    for sz in (1, -1):                                 # 四個切角
        plate(P['white'], [(sx * PX, -sz * (HZ - 0.3 - CH)), (sx * (HX - 0.3), -sz * (HZ - 0.3 - CH)), (sx * (HX - 0.3 - CH), -sz * (HZ - 0.3)), (sx * PX, -sz * (HZ - 0.3))][::(1 if sx * sz > 0 else -1)], 0.45, YD, AXY)
for (x0, z0), (x1, z1) in zip(out, out[1:] + out[:1]):  # 平台側面的深藍腰帶與燈條
    a, b = V(x0, 0, z0), V(x1, 0, z1)
    if abs(z0 - (HZ - 0.3)) < 0.01 and abs(z1 - (HZ - 0.3)) < 0.01:
        continue                                       # 正面另外做（有入口）
    n = (b - a).normalized().cross(V(0, 1, 0)) * -0.03
    beam(P['navy'], a + V(0, 0.95, 0) + n, b + V(0, 0.95, 0) + n, 0.08, 0.5)
    beam(P['glow'], a.lerp(b, 0.2) + V(0, 0.95, 0) + n * 2.2, a.lerp(b, 0.8) + V(0, 0.95, 0) + n * 2.2, 0.03, 0.07)
for s in (1, -1):                                      # 正面：入口兩邊的門柱、腰帶、斜坡
    box(P['navy'], s * 2.0, s * (HX - 0.3 - CH), 0.7, 1.2, HZ - 0.3, HZ - 0.26)
    box(P['white'], s * 1.5, s * 2.1, 0.45, YD + 1.3, HZ - 0.9, HZ - 0.2)
    box(P['glow'], s * 1.7, s * 1.9, 0.9, YD + 1.0, HZ - 0.2, HZ - 0.18)
    box(P['navy'], s * 1.45, s * 2.15, YD + 1.3, YD + 1.5, HZ - 0.95, HZ - 0.15)
slab(P['steel'], [(0.45, -1.5, 1.5, HZ - 0.3, HZ - 0.02), (YD, -1.5, 1.5, HZ - 0.3, HZ - 0.3)])       # 入口的斜坡
box(P['hazard'], -1.5, 1.5, YD, YD + 0.012, PZ1 + 0.3, HZ - 0.9)
M.part('Base', 'Root', P)

P = Pal()
box(P['dark'], -PX, PX, 0.45, 0.6, PZ0, PZ1)
for z in (-6.5, -4.0, -1.5, 1.0, 3.5):                 # 龍骨墩
    box(P['steel'], -1.4, 1.4, 0.6, 0.95, z - 0.3, z + 0.3)
    box(P['yellow'], -1.4, 1.4, 0.95, 1.02, z - 0.3, z + 0.3)
for s in (1, -1):                                      # 凹槽邊緣的警示框
    box(P['hazard'], s * PX, s * (PX + 0.4), YD, YD + 0.012, PZ0, PZ1)
    box(P['glow'], s * (PX - 0.02), s * PX, 1.1, 1.2, PZ0 + 0.5, PZ1 - 0.5)
box(P['hazard'], -PX - 0.4, PX + 0.4, YD, YD + 0.012, PZ0 - 0.4, PZ0)
M.part('Pit', 'Root', P)

P = Pal()
GX, YG = 5.6, 8.1                                      # 門形架的立柱位置、桁架樑的底
for z in (-6.8, -2.6, 1.6):
    for s in (1, -1):
        sq(P['white'], s * GX, z, [(YD, 0.62), (YD + 0.5, 0.5), (YG + 0.9, 0.42)])
        sq(P['navy'], s * GX, z, [(YD + 1.2, 0.53), (YD + 2.6, 0.5)])
        box(P['glow'], s * (GX - 0.52), s * (GX - 0.5), YD + 1.5, YD + 2.3, z - 0.08, z + 0.08)
    truss(P, (-GX, YG, z), (GX, YG, z), 0.8, 0.7, 8)
for s in (1, -1):                                      # 兩側的縱樑（兩層）與走道
    for y in (4.6, 6.4):
        box(P['steel'], s * GX - 0.14, s * GX + 0.14, y, y + 0.28, -6.8, 1.6)
    box(P['white'], s * (GX - 0.9), s * (GX - 0.3), 4.5, 4.6, -6.8, 1.6)
    railing(P['steel'], [V(s * (GX - 0.88), 4.6, z) for z in (-6.7, -4.7, -2.6, -0.5, 1.5)], 0.5, 0.025)
M.part('Gantry', 'Root', P)

P = Pal()
for x, z, top, hw in ((-6.6, 5.2, 9.9, 0.95), (6.7, 5.4, 8.6, 0.85)):
    sq(P['white'], x, z, [(YD, hw + 0.25), (YD + 0.8, hw), (top - 0.6, hw - 0.12), (top, hw - 0.35)])
    sq(P['navy'], x, z, [(YD + 1.6, hw - 0.01), (YD + 3.4, hw - 0.04)])
    box(P['glass'], x - hw + 0.25, x + hw - 0.25, top - 1.7, top - 0.8, z + hw - 0.14, z + hw - 0.08)
    box(P['glow'], x - 0.08, x + 0.08, YD + 1.8, YD + 3.2, z + hw - 0.03, z + hw)
    for s in (1, -1):                                  # V 字徽
        plate(P['white'], [(x, YD + 4.0), (x + s * 0.4, YD + 4.35), (x + s * 0.4, YD + 4.55), (x, YD + 4.2)][::s], z + hw - 0.1, z + hw - 0.06)
    cylY(P['steel'], x, z, top, top + 0.5, 0.04, None, 6)
    cylY(P['beacon'], x, z, top + 0.5, top + 0.6, 0.07, None, 6)
box(P['hazard'], -7.5, -5.7, YD, YD + 0.6, 6.15, 6.19)
M.part('Towers', 'Root', P)

P = Pal()
CX, CZ, YC = -GX, -6.8, YG + 0.9                       # 吊車：站在最後面那道門形架的左柱上，吊臂沿 +x
cylY(P['navy'], CX, CZ, YC, YC + 0.35, 0.6, None, 14)
box(P['white'], CX - 0.6, CX + 0.7, YC + 0.35, YC + 1.25, CZ - 0.5, CZ + 0.5)
box(P['glass'], CX + 0.7, CX + 0.74, YC + 0.7, YC + 1.1, CZ - 0.35, CZ + 0.35)
truss(P, (CX + 0.2, YC + 1.25, CZ), (CX + 7.4, YC + 1.25, CZ), 0.5, 0.5, 9)
box(P['navy'], CX - 1.7, CX - 0.6, YC + 0.5, YC + 1.2, CZ - 0.45, CZ + 0.45)                   # 配重
box(P['steel'], CX + 4.4, CX + 5.0, YC + 1.05, YC + 1.3, CZ - 0.32, CZ + 0.32)                 # 吊車的小車
cylY(P['steel'], CX + 4.7, CZ, YC - 1.5, YC + 1.05, 0.025, None, 6)
box(P['yellow'], CX + 4.5, CX + 4.9, YC - 1.85, YC - 1.5, CZ - 0.15, CZ + 0.15)
cylY(P['steel'], CX, CZ, YC + 1.25, H - 0.1, 0.04, None, 6)
cylY(P['beacon'], CX, CZ, H - 0.1, H, 0.07, None, 6)
M.part('Crane', 'Root', P)

P = Pal()
for x, z, s in ((-4.4, -4.6, 1), (4.4, -0.6, -1), (-4.4, 3.4, 1)):                             # 塢邊的機械臂：底座、兩節臂、夾爪
    cylY(P['navy'], x, z, YD, YD + 0.5, 0.5, None, 12)
    cylY(P['white'], x, z, YD + 0.5, YD + 1.2, 0.3, None, 12)
    a, b, c = V(x, YD + 1.2, z), V(x + s * 0.5, YD + 3.3, z), V(x + s * 2.3, YD + 2.5, z)
    beam(P['white'], a, b, 0.32)
    beam(P['white'], b, c, 0.26)
    cylZ(P['orange'], b.x, b.y, z - 0.24, z + 0.24, 0.26, 12)
    cylZ(P['orange'], a.x, a.y, z - 0.26, z + 0.26, 0.24, 12)
    box(P['steel'], c.x - 0.12, c.x + 0.12, c.y - 0.5, c.y + 0.05, z - 0.2, z + 0.2)
M.part('Arms', 'Root', P)

P = Pal()
box(P['white'], 4.6, 7.6, YD, YD + 1.5, 7.2, 8.9)      # 管制室（前面右邊）
box(P['glass'], 4.8, 7.4, YD + 0.75, YD + 1.25, 8.9, 8.94)
box(P['navy'], 4.5, 7.7, YD + 1.5, YD + 1.65, 7.1, 9.0)
box(P['navy'], 5.0, 7.4, YD, YD + 0.02, 2.6, 4.6)      # 停機坪
box(P['white'], 5.3, 7.1, YD + 0.02, YD + 0.03, 2.9, 4.3)
box(P['navy'], 5.5, 6.9, YD + 0.03, YD + 0.04, 3.1, 4.1)
for z in (-7.6, -6.2):                                 # 左後的儲槽
    cylZ(P['white'], -7.4, YD + 0.6, z, z + 1.1, 0.5, 14)
    cylZ(P['navy'], -7.4, YD + 0.6, z + 0.4, z + 0.7, 0.51, 14)
hose(P['steel'], [V(7.9, YD + 0.2, -7.5), V(7.9, YD + 0.2, 1.5), V(7.9, YD + 0.2, 6.8)], 0.16, 8)   # 右邊的管線
hose(P['steel'], [V(-7.9, YD + 0.2, -5.0), V(-7.9, YD + 0.2, 0.0), V(-7.9, YD + 0.2, 3.6)], 0.16, 8)
for x, z in ((-7.2, -1.5), (-7.2, 0.2), (7.0, -4.5)):  # 貨櫃
    box(P['orange' if z > -1 else 'navy'], x - 0.5, x + 0.5, YD, YD + 0.8, z - 0.7, z + 0.7)
M.part('Yard', 'Root', P)

# ===== 第三版：幾何細節 =====
# BaseD 平台側面的小零件、邊上的欄杆、乾塢壁的肋與爬梯；GantryD 門形架的吊車小車與吊鉤、探照燈、立柱的爬梯、上走道的樓梯；TowerD 兩座高塔的小零件；YardD2 燈柱、纜線盤、搬運車、護柱
P = Pal()
for i, Ms in enumerate((Tm(HX - 0.3, 0.45, 0) @ Ry(pi / 2), Tm(-HX + 0.3, 0.45, 0) @ Ry(-pi / 2))):
    greeble(P, Ms, -HZ + 2.2, HZ - 2.2, 0.05, 1.0, 41 + i, 12, scale=0.75)
greeble(P, Tm(0, 0.45, -HZ + 0.3) @ Ry(pi), -HX + 2.2, HX - 2.2, 0.05, 1.0, 43, 10, scale=0.75)
for s in (1, -1):
    railing(P['steel'], [V(s * (HX - 0.5), YD, z) for z in (-8.0, -6.0, -4.0, -2.0, 0.0, 2.0)], 0.5, 0.025)
    for z in (-7.0, -5.4, -3.8, -2.2, -0.6, 1.0, 2.6, 4.2):                        # 乾塢壁的肋
        box(P['steel'], s * (PX - 0.14), s * PX, 0.6, YD, z - 0.07, z + 0.07)
    ladder(P, Tm(s * PX, 0.6, 5.0) @ Ry(-s * pi / 2), 0.0, 0.0, 0.9, 0.08)
    for z in (-5.0, 0.0):                              # 塢邊的工作燈
        cylY(P['steel'], s * (PX + 0.55), z, YD, YD + 0.9, 0.035, None, 6)
        box(P['lamp'], s * (PX + 0.3), s * (PX + 0.6), YD + 0.86, YD + 0.9, z - 0.12, z + 0.12)
railing(P['steel'], [V(x, YD, -HZ + 0.5) for x in (-6.0, -3.0, 0.0, 3.0, 6.0)], 0.5, 0.025)
hose(P['rubber'], [V(-2.6, 0.66, -7.0), V(-1.0, 0.66, -5.2), V(-2.4, 0.66, -3.0), V(-2.9, 0.66, 0.5)], 0.06, 8)
hose(P['orange'], [V(2.8, 0.66, 4.8), V(1.6, 0.66, 2.4), V(2.7, 0.66, -0.4)], 0.05, 8)
M.part('BaseD', 'Root', P)
P = Pal()
for i, z in enumerate((-6.8, -2.6, 1.6)):
    x = (-2.2, 1.6, -0.6)[i]                           # 每道門形架底下一台吊車小車與吊鉤
    box(P['navy'], x - 0.5, x + 0.5, YG - 0.28, YG, z - 0.42, z + 0.42)
    cylY(P['steel'], x, z, YG - 2.2 - i * 0.5, YG - 0.28, 0.022, None, 6)
    box(P['yellow'], x - 0.16, x + 0.16, YG - 2.55 - i * 0.5, YG - 2.2 - i * 0.5, z - 0.12, z + 0.12)
    for s in (1, -1):
        box(P['navy'], s * (GX - 0.4) - 0.2, s * (GX - 0.4) + 0.2, 6.9, 7.2, z + 0.42, z + 0.6)      # 立柱上的探照燈
        box(P['lamp'], s * (GX - 0.4) - 0.15, s * (GX - 0.4) + 0.15, 6.86, 6.9, z + 0.44, z + 0.58)
        ladder(P, Tm(s * (GX + 0.46), YD + 0.5, z) @ Ry(s * pi / 2), 0.0, 0.0, YG - YD - 0.5, 0.08)
        box(P['white'], s * GX - 0.5, s * GX + 0.5, YG + 0.9, YG + 1.0, z - 0.5, z + 0.5)           # 柱頂的蓋板
for i in range(14):                                    # 上走道的樓梯（左邊，往前下到平台）
    box(P['steel'], -GX + 0.3, -GX + 0.9, 4.5 - (i + 1) * 0.214, 4.55 - (i + 1) * 0.214, 1.6 + i * 0.22, 1.6 + (i + 1) * 0.22)
for x in (-GX + 0.3, -GX + 0.9):
    beam(P['white'], V(x, 4.45, 1.6), V(x, YD + 0.05, 4.68), 0.06, 0.2)
    railing(P['steel'], [V(x, 4.55 - t * 3.0, 1.6 + t * 3.08) for t in (0.0, 0.33, 0.66, 1.0)], 0.5, 0.02, False)
M.part('GantryD', 'Root', P)
P = Pal()
for i, (x, z, top, hw) in enumerate(((-6.6, 5.2, 9.9, 0.95), (6.7, 5.4, 8.6, 0.85))):
    tier_detail(P, 4, x, z, pi / 4, hw * 1.41421, YD + 0.8, (hw - 0.12) * 1.41421, top - 0.6, 45 + i, 5, skip=(2,), scale=0.6)
    sq(P['navy'], x, z, [(top - 0.62, hw - 0.08), (top - 0.5, hw - 0.1)])
    mast(P, x + 0.4, z - 0.4, top - 0.3, top + 0.35, tip=None)
M.part('TowerD', 'Root', P)
P = Pal()
for x, z in ((-8.0, -8.9), (8.0, -8.9), (-3.6, 8.9)):  # 照明燈柱
    cylY(P['steel'], x, z, YD, YD + 3.6, 0.06, None, 8)
    box(P['navy'], x - 0.45, x + 0.45, YD + 3.6, YD + 3.75, z - 0.12, z + 0.12)
    box(P['lamp'], x - 0.4, x + 0.4, YD + 3.56, YD + 3.6, z - 0.1, z + 0.1)
for x, z in ((4.6, -7.6), (5.5, -7.6)):                # 纜線盤
    cylX(P['orange'], x - 0.22, x + 0.22, YD + 0.42, z, 0.42, None, 14)
    cylX(P['steel'], x - 0.27, x + 0.27, YD + 0.42, z, 0.12, None, 8)
box(P['yellow'], 6.4, 7.6, YD + 0.18, YD + 0.6, 0.2, 0.9)                          # 搬運車
box(P['navy'], 6.4, 6.9, YD + 0.6, YD + 1.0, 0.25, 0.85)
for x in (6.6, 7.4):
    for z in (0.2, 0.9):
        cylZ(P['rubber'], x, YD + 0.16, z - 0.07, z + 0.07, 0.16, 10)
for s in (1, -1):
    for z in (6.6, 7.6, 8.6):
        cylY(P['yellow'], s * 2.5, z, YD, YD + 0.4, 0.07, None, 8)
for i, (x, z) in enumerate(((-7.4, 2.2), (-6.7, 2.4), (-7.3, 3.2), (4.9, -3.0), (7.4, -1.6), (7.4, -2.6))):
    crate(P, x, z, YD, 0.55, 0.42, 0.75, ('white', 'navy', 'orange')[i % 3])
M.part('YardD2', 'Root', P)

done(M, '重製_星艦船塢', dict(size=[HX * 2, H, HZ * 2]))
