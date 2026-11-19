# 重裝方舟堡壘（取代 人類聯盟風_重裝方舟堡壘.glb）：一艘降落在地面當堡壘用的重裝方舟：深藍的船身包著一塊一塊白色的裝甲，
# 船頭（+z）是雙叉艏夾著一個大砲口，船尾八個發光的噴口，背上一座艦橋。
# 舊模型的外框比例 x 0.331、z 0.89、高 0.228 → 這裡 x ±4.47、z ±12、高 6.15。
#   blender -b --factory-startup --python build_ark.py -- [--no-bake] [--no-export]
# 零件表：Hull 深藍的船身（八角截面，往船頭收窄）；Armor 兩側與背上的白色裝甲板；Pods 船腹兩側的深藍艙；Bow 雙叉艏與砲口；
#         Bridge 艦橋與天線；Engines 噴口；Deck 背上的發光艙蓋、燈
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

HX, HZ, H = 4.47, 12.0, 6.15
M = Machine('ark', '重製_方舟堡壘', tex=4096, bevel=1.6)


def ring(z, hw, y0, y1, c):
    return [V(x, y, z) for x, y in ((hw - c, y0), (hw, y0 + c), (hw, y1 - c), (hw - c, y1), (-hw + c, y1), (-hw, y1 - c), (-hw, y0 + c), (-hw + c, y0))]


SEC = [(-10.6, 3.5, 0.5, 4.9), (-9.0, 3.85, 0.25, 5.2), (3.0, 3.85, 0.25, 5.2), (6.0, 3.5, 0.5, 4.8), (8.5, 3.0, 0.9, 4.2)]      # (z, 半寬, 底, 頂)


def sec(z):
    for a, b in zip(SEC, SEC[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return [a[i] + (b[i] - a[i]) * t for i in (1, 2, 3)]
    return list(SEC[-1][1:])


P = Pal()
loft(P['navy'], [ring(z, hw, y0, y1, 0.7) for z, hw, y0, y1 in SEC])
for z in (-8.0, -4.0, 0.0):                            # 起落架（船腹下的矮墩）
    for s in (1, -1):
        box(P['steel'], s * 2.2 - 0.6, s * 2.2 + 0.6, 0.0, 0.3, z - 0.7, z + 0.7)
M.part('Hull', 'Root', P)

P = Pal()
z = -8.8
i = 0
while z < 8.0:                                         # 兩側一塊一塊的裝甲（白、深藍交錯），上下兩排
    ln = 2.3 if i % 3 else 1.5
    hw, y0, y1 = sec(z + ln / 2)
    for s in (1, -1):
        for ya, yb, col in ((y0 + 0.85, (y0 + y1) / 2 - 0.08, 'white' if i % 3 else 'navy'), ((y0 + y1) / 2 + 0.08, y1 - 0.85, 'navy' if i % 4 == 2 else 'white')):
            box(P[col], s * (hw - 0.05), s * (hw + 0.16), ya, yb, z, z + ln - 0.14)
        if i % 3 == 1:
            box(P['glow'], s * (hw + 0.16), s * (hw + 0.18), (y0 + y1) / 2 + 0.5, (y0 + y1) / 2 + 0.62, z + 0.4, z + ln - 0.6)
    z += ln
    i += 1
for z0, z1, hw in ((-8.6, -5.2, 2.9), (-5.0, -1.0, 3.0), (2.6, 5.6, 2.7), (5.8, 8.2, 2.1)):      # 背上的裝甲
    y = sec((z0 + z1) / 2)[2]
    box(P['white'], -hw, hw, y - 0.05, y + 0.16, z0, z1)
    box(P['navy'], -hw * 0.45, hw * 0.45, y + 0.16, y + 0.2, z0 + 0.3, z1 - 0.3)
for z0, z1 in ((-8.6, -5.2), (-5.0, -1.0), (2.6, 5.6)):                                          # 斜肩上的裝甲（貼著船身的斜面）
    hw, y0, y1 = sec((z0 + z1) / 2)
    for s in (1, -1):
        loft(P['white'], [[V(s * (hw - 0.6), y1 - 0.1, z), V(s * (hw - 0.1), y1 - 0.6, z), V(s * hw, y1 - 0.5, z), V(s * (hw - 0.5), y1, z)] for z in (z0 + 0.1, z1 - 0.1)])
M.part('Armor', 'Root', P)

P = Pal()
for s in (1, -1):                                      # 船腹兩側凸出來的深藍艙（整艘最寬的地方）
    slab(P['navy'], [(0.9, s * 3.6, s * HX, -4.6, 1.6), (2.6, s * 3.6, s * HX, -5.0, 2.0), (4.3, s * 3.6, s * HX, -4.6, 1.6)])
    box(P['white'], s * (HX - 0.02), s * (HX + 0.0), 1.9, 3.3, -3.6, -2.4)
    box(P['glow'], s * HX - 0.01, s * HX + 0.0, 2.45, 2.75, -1.6, 0.9)
    box(P['steel'], s * 3.7, s * (HX - 0.1), 4.3, 4.5, -3.8, 0.8)
M.part('Pods', 'Root', P)

P = Pal()
for s in (1, -1):                                      # 雙叉艏：兩支往前收尖的艏
    loft(P['white'], [[V(s * 1.5, 1.0, 8.4), V(s * 3.0, 1.0, 8.4), V(s * 3.0, 4.1, 8.4), V(s * 1.5, 4.1, 8.4)],
                      [V(s * 1.6, 1.4, 10.6), V(s * 2.7, 1.4, 10.6), V(s * 2.7, 3.5, 10.6), V(s * 1.6, 3.5, 10.6)],
                      [V(s * 1.75, 2.0, HZ), V(s * 2.2, 2.0, HZ), V(s * 2.2, 2.7, HZ), V(s * 1.75, 2.7, HZ)]])
    box(P['navy'], s * 2.75, s * 3.02, 1.9, 2.9, 8.5, 10.2)
    box(P['glow'], s * 3.02, s * 3.04, 2.3, 2.5, 8.8, 9.9)
box(P['steel'], -1.5, 1.5, 0.9, 4.3, 8.3, 9.3)         # 砲口的框
box(P['white'], -1.35, 1.35, 4.3, 4.5, 8.3, 9.2)
box(P['dark'], -1.1, 1.1, 1.3, 3.9, 9.3, 9.34)
box(P['steel'], -0.7, 0.7, 1.9, 3.3, 9.34, 9.5)
box(P['glow'], -0.45, 0.45, 2.15, 3.05, 9.5, 9.52)
M.part('Bow', 'Root', P)

P = Pal()
slab(P['white'], [(5.2, -1.7, 1.7, -1.0, 2.6), (5.75, -1.5, 1.5, -0.8, 2.3), (5.95, -1.2, 1.2, -0.6, 1.9)])
box(P['glass'], -1.3, 1.3, 5.42, 5.66, 2.36, 2.42)
box(P['navy'], -1.0, 1.0, 5.95, 6.0, -0.5, 1.7)
cylY(P['steel'], -0.7, -0.2, 5.95, H - 0.06, 0.03, None, 6)
cylY(P['beacon'], -0.7, -0.2, H - 0.06, H, 0.05, None, 6)
box(P['steel'], 0.3, 0.9, 6.0, 6.1, 0.0, 0.5)
M.part('Bridge', 'Root', P)

P = Pal()
for x in (-2.55, -0.85, 0.85, 2.55):                   # 船尾八個噴口（上下兩排）
    for y in (1.55, 3.75):
        box(P['navy'], x - 0.78, x + 0.78, y - 0.95, y + 0.95, -11.4, -10.5)
        box(P['steel'], x - 0.66, x + 0.66, y - 0.82, y + 0.82, -HZ, -11.4)
        box(P['glow'], x - 0.5, x + 0.5, y - 0.66, y + 0.66, -HZ - 0.0, -HZ + 0.03)
M.part('Engines', 'Root', P)

P = Pal()
for x in (-2.1, -0.7, 0.7, 2.1):                       # 船尾背上的八個發光艙蓋
    for z in (-10.2, -9.0):
        box(P['navy'], x - 0.6, x + 0.6, 4.85, 5.3 if z > -9.5 else 5.0, z - 0.5, z + 0.5)
        box(P['glow'], x - 0.42, x + 0.42, 5.3 if z > -9.5 else 5.0, (5.3 if z > -9.5 else 5.0) + 0.03, z - 0.34, z + 0.34)
box(P['glow'], -0.25, 0.25, 5.36, 5.39, 6.2, 7.6)      # 船頭背上的燈條
M.part('Deck', 'Root', P)

done(M, '重製_重裝方舟堡壘', dict(size=[HX * 2, H, HZ * 2]))
