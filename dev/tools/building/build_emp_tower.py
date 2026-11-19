# 帝國巨塔（取代 人類帝國風_01巨塔_設計圖.glb）：深灰石材的哥德式高塔，暗紅屋頂、金色線腳、橘紅的窗。
# 舊模型的外框比例 x 0.472、z 0.487、高 1 → 這裡高 20、x ±4.72、z ±4.87；正面（大門、台階）朝 +z。
#   blender -b --factory-startup --python build_emp_tower.py -- [--no-bake] [--no-export]
# 由下往上：三階基座與正面台階 → 下層大廳（四角各一座圓頂角樓、正面門樓）→ 中段塔身（扶壁、每面三扇尖拱窗）→ 迴廊（四角小圓頂、火盆）
#          → 上段塔身（每面一扇窗、正面金色徽記）→ 鐘樓（四面透空、裡面發光、四角小尖塔）→ 八角尖頂與頂上的火珠
# 零件表：Plinth 基座與台階；Hall 下層大廳與線腳；Turrets 四座角樓；Gate 門樓；Shaft 中段塔身、扶壁、窗；Gallery 迴廊；
#         Upper 上段塔身；Belfry 鐘樓；Spire 尖頂與頂飾；Flags 旗
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

HX, HZ, H = 4.72, 4.87, 20.0
M = Machine('emp_tower', '重製_帝國巨塔', tex=4096, bevel=1.6)


def window(P, Mf, x, y0, y1, w, d):
    """尖拱窗：石框＋發光的窗面（貼在離中心 d 的那一面上）。"""
    arch(P['stone2'], Mf, x, y0 - 0.08, y1 + 0.05, w + 0.1, d, d + 0.07)
    arch(P['ember'], Mf, x, y0, y1, w, d + 0.07, d + 0.09)
    box(P['stone2'], x - 0.03, x + 0.03, y0, y1 + w, d + 0.09, d + 0.11, Mf)       # 窗中間的直櫺


P = Pal()
slab(P['stone'], [(0.0, -HX, HX, -HZ, HZ), (0.55, -HX, HX, -HZ, HZ)])
slab(P['stone2'], [(0.55, -HX + 0.35, HX - 0.35, -HZ + 0.4, HZ - 0.5), (1.05, -HX + 0.35, HX - 0.35, -HZ + 0.4, HZ - 0.5)])
slab(P['stone'], [(1.05, -HX + 0.75, HX - 0.75, -HZ + 0.8, HZ - 1.0), (1.5, -HX + 0.75, HX - 0.75, -HZ + 0.8, HZ - 1.0)])
for i in range(5):                                     # 正面的台階
    box(P['stone2'], -1.3, 1.3, 0.55 + i * 0.19, 0.55 + (i + 1) * 0.19, 3.3, HZ - 0.12 - i * 0.26)
for s in (1, -1):                                      # 台階兩邊的欄柱與火盆
    box(P['stone'], s * 1.3, s * 1.75, 0.55, 2.1, HZ - 1.0, HZ - 0.15)
    box(P['gold'], s * 1.25, s * 1.8, 2.1, 2.2, HZ - 1.05, HZ - 0.1)
    orb(P['ember'], s * 1.525, 2.42, HZ - 0.575, 0.22)
M.part('Plinth', 'Root', P)

P = Pal()
HL = 3.3                                               # 下層大廳的半寬
sq(P['stone'], 0, 0, [(1.5, HL), (5.3, HL)])
sq(P['gold'], 0, 0, [(5.3, HL + 0.06), (5.48, HL + 0.06)])
sq(P['stone2'], 0, 0, [(5.48, HL + 0.16), (5.8, HL + 0.16)])
sq(P['stone2'], 0, 0, [(1.5, HL + 0.1), (1.9, HL + 0.1)])                          # 牆腳
for Mf in FACES4:
    for x in (-1.9, 1.9):
        window(P, Mf, x, 2.6, 3.8, 0.28, HL)
    for x in (-2.75, -1.05, 1.05, 2.75):               # 壁柱
        box(P['stone2'], x - 0.14, x + 0.14, 1.9, 5.3, HL, HL + 0.1, Mf)
for Mf in FACES4[1:]:                                  # 正面是門樓，另外三面中間再一扇大窗
    window(P, Mf, 0.0, 2.4, 4.1, 0.42, HL)
M.part('Hall', 'Root', P)

P = Pal()
for sx in (1, -1):
    for sz in (1, -1):
        x, z = sx * HL, sz * HL
        prism(P['stone'], 8, x, z, [(1.05, 0.98), (1.5, 0.9), (5.9, 0.9)], pi / 8)
        prism(P['gold'], 8, x, z, [(5.9, 0.97), (6.05, 0.97)], pi / 8)
        prism(P['stone2'], 8, x, z, [(6.05, 1.04), (6.3, 1.04)], pi / 8)
        dome(P['crimson'], x, z, 6.3, 0.95, 12, 1.15)
        cylY(P['gold'], x, z, 7.35, 7.95, 0.05, 0.01, 8)
        orb(P['gold'], x, 7.42, z, 0.11, 8)
        for a in (0, 1, 2, 3):                         # 朝外的兩面各一扇窗，另外兩面被大廳擋住
            Mf = Tm(x, 0, z) @ FACES4[a]
            n = Mf @ V(0, 0, 1) - Mf @ V(0, 0, 0)
            if n.x * sx > 0.5 or n.z * sz > 0.5:
                window(P, Mf, 0.0, 3.6, 4.7, 0.2, 0.83)
                arch(P['ember'], Mf, 0.0, 2.2, 2.7, 0.14, 0.83, 0.86)
M.part('Turrets', 'Root', P)

P = Pal()
box(P['stone2'], -1.15, 1.15, 1.5, 4.7, HL, HL + 0.75)                             # 門樓
plate(P['stone2'], [(-1.3, 4.7), (1.3, 4.7), (0.0, 6.0)], HL, HL + 0.8)            # 山牆
plate(P['gold'], [(-1.36, 4.7), (-1.3, 4.62), (0.0, 5.92), (0.0, 6.08)], HL + 0.8, HL + 0.84)
plate(P['gold'], [(1.3, 4.62), (1.36, 4.7), (0.0, 6.08), (0.0, 5.92)], HL + 0.8, HL + 0.84)
arch(P['gold'], I4, 0.0, 1.5, 3.3, 0.72, HL + 0.75, HL + 0.8)                      # 門框
arch(P['dark'], I4, 0.0, 1.5, 3.25, 0.62, HL + 0.8, HL + 0.82)                     # 大門
box(P['gold'], -0.025, 0.025, 1.5, 4.1, HL + 0.82, HL + 0.84)
orb(P['ember'], 0.0, 5.05, HL + 0.82, 0.2)                                         # 山牆上的圓窗
for s in (1, -1):
    box(P['ember'], s * 0.9 - 0.08, s * 0.9 + 0.08, 3.5, 4.1, HL + 0.75, HL + 0.78)
M.part('Gate', 'Root', P)

P = Pal()
HS = 2.5                                               # 中段塔身的半寬
sq(P['stone'], 0, 0, [(5.8, HS), (10.2, HS)])
sq(P['gold'], 0, 0, [(8.0, HS + 0.04), (8.12, HS + 0.04)])
for Mf in FACES4:
    for x in (-1.35, 0.0, 1.35):
        window(P, Mf, x, 8.5, 9.6, 0.24, HS)
        arch(P['stone2'], Mf, x, 6.3, 7.3, 0.3, HS, HS + 0.05)                     # 下面一排盲拱
    box(P['gold'], -0.5, 0.5, 6.5, 7.5, HS + 0.05, HS + 0.08, Mf) if Mf is not FACES4[0] else None
for sx in (1, -1):                                     # 四角的扶壁：下寬上窄
    for sz in (1, -1):
        slab(P['stone2'], [(5.8, sx * (HS - 0.25), sx * (HS + 0.55), sz * (HS - 0.25), sz * (HS + 0.55)), (8.6, sx * (HS - 0.25), sx * (HS + 0.35), sz * (HS - 0.25), sz * (HS + 0.35)),
                           (10.2, sx * (HS - 0.2), sx * (HS + 0.18), sz * (HS - 0.2), sz * (HS + 0.18))])
        orb(P['ember'], sx * (HS + 0.62), 7.3, sz * (HS + 0.62), 0.16, 8)          # 扶壁上的燈
plate(P['gold'], [(-0.55, 6.4), (0.55, 6.4), (0.55, 7.2), (0.0, 7.7), (-0.55, 7.2)], HS, HS + 0.06)       # 正面的盾徽
plate(P['crimson'], [(-0.42, 6.5), (0.42, 6.5), (0.42, 7.15), (0.0, 7.52), (-0.42, 7.15)], HS + 0.06, HS + 0.09)
M.part('Shaft', 'Root', P)

P = Pal()
HG = 3.0                                               # 迴廊
sq(P['stone2'], 0, 0, [(10.2, HS + 0.1), (10.45, HG), (10.75, HG)])
sq(P['gold'], 0, 0, [(10.75, HG + 0.04), (10.85, HG + 0.04)])
for Mf in FACES4:                                      # 城垛
    for i in range(-4, 5):
        if i % 2 == 0:
            box(P['stone'], i * 0.6 - 0.2, i * 0.6 + 0.2, 10.85, 11.25, HG - 0.22, HG, Mf)
for sx in (1, -1):
    for sz in (1, -1):
        x, z = sx * (HG - 0.35), sz * (HG - 0.35)
        prism(P['stone'], 8, x, z, [(10.85, 0.42), (11.7, 0.42)], pi / 8)
        dome(P['crimson'], x, z, 11.7, 0.46, 10, 1.2)
        cylY(P['gold'], x, z, 12.2, 12.6, 0.035, 0.008, 6)
M.part('Gallery', 'Root', P)

P = Pal()
HU = 1.55                                               # 上段塔身
sq(P['stone'], 0, 0, [(10.85, HU), (14.4, HU)])
sq(P['gold'], 0, 0, [(14.4, HU + 0.05), (14.55, HU + 0.05)])
sq(P['stone2'], 0, 0, [(14.55, HU + 0.2), (14.8, HU + 0.2)])
for Mf in FACES4:
    window(P, Mf, 0.0, 11.4, 12.6, 0.3, HU)
    for x in (-1.3, 1.3):
        box(P['stone2'], x - 0.12, x + 0.12, 10.85, 14.4, HU, HU + 0.08, Mf)
    for x in (-0.7, 0.7):
        arch(P['ember'], Mf, x, 13.3, 13.8, 0.13, HU, HU + 0.03)
cylZ(P['gold'], 0.0, 13.55, HU, HU + 0.07, 0.42, 16)                               # 正面的金色圓徽
cylZ(P['ember'], 0.0, 13.55, HU + 0.07, HU + 0.09, 0.3, 16)
M.part('Upper', 'Root', P)

P = Pal()
HB = 1.25                                               # 鐘樓：四根角柱、每面一個透空的尖拱，裡面是發光的核心
for sx in (1, -1):
    for sz in (1, -1):
        box(P['stone'], sx * (HB - 0.42), sx * HB, 14.8, 16.5, sz * (HB - 0.42), sz * HB)
        x, z = sx * (HB + 0.12), sz * (HB + 0.12)      # 四角的小尖塔
        sq(P['stone2'], x, z, [(14.8, 0.2), (16.9, 0.2)])
        sq(P['crimson'], x, z, [(16.9, 0.26), (17.9, 0.02)])
sq(P['ember'], 0, 0, [(14.8, HB - 0.45), (16.2, HB - 0.45)])
sq(P['stone'], 0, 0, [(16.2, HB), (16.5, HB)])
sq(P['gold'], 0, 0, [(16.5, HB + 0.1), (16.62, HB + 0.1)])
for Mf in FACES4:
    box(P['stone2'], -0.06, 0.06, 14.8, 16.2, HB - 0.2, HB - 0.08, Mf)             # 每面中間一根細柱
    box(P['stone2'], -HB + 0.4, HB - 0.4, 14.8, 15.1, HB - 0.2, HB - 0.05, Mf)     # 欄杆
M.part('Belfry', 'Root', P)

P = Pal()
prism(P['crimson'], 8, 0, 0, [(16.62, 1.5), (17.1, 1.05), (19.0, 0.16)], pi / 8)
prism(P['gold'], 8, 0, 0, [(19.0, 0.2), (19.12, 0.2)], pi / 8)
orb(P['ember'], 0, 19.38, 0, 0.27)
cylY(P['gold'], 0, 0, 19.6, H, 0.07, 0.008, 8)
for k in range(8):                                     # 尖頂的金色稜線
    a = pi / 8 + k * pi / 4
    beam(P['gold'], V(1.05 * cos(a), 17.1, 1.05 * sin(a)), V(0.16 * cos(a), 19.0, 0.16 * sin(a)), 0.05)
M.part('Spire', 'Root', P)

P = Pal()
for x, y, z, s in ((HL + 0.5, 6.3, HL + 0.5, -1), (-HL - 0.5, 6.3, -HL - 0.5, 1), (HS + 0.3, 11.3, -HS - 0.3, -1), (-HU - 0.1, 14.9, HU + 0.1, 1)):
    cylY(P['steel'], x, z, y, y + 1.7, 0.03, None, 6)
    plate(P['crimson'], [(0, y + 1.0), (s * 1.1, y + 1.12), (s * 0.85, y + 1.32), (s * 1.1, y + 1.55), (0, y + 1.65)] if s > 0 else
          [(0, y + 1.0), (0, y + 1.65), (s * 1.1, y + 1.55), (s * 0.85, y + 1.32), (s * 1.1, y + 1.12)], -0.012, 0.012, Tm(x, 0, z))
M.part('Flags', 'Root', P)

# ===== 第三版：幾何細節 =====
# HallD 大廳的腰線、城垛、兩側的側堂、後面的半圓殿；ShaftD 中段的飛扶壁、托座、旗幔；UpperD 上段的角樓、迴廊的小尖塔；SpireD 尖頂的老虎窗、鐘樓頂的小尖塔；YardD 基座上的燈柱與火砲
P = Pal()
for y in (2.25, 4.45):
    sq(P['stone2'], 0, 0, [(y, HL + 0.07), (y + 0.1, HL + 0.07)])
for Mf in FACES4:                                      # 大廳頂的城垛
    for i in range(-5, 6):
        if i % 2 == 0:
            box(P['stone'], i * 0.62 - 0.2, i * 0.62 + 0.2, 5.8, 6.15, HL - 0.1, HL + 0.16, Mf)
for k in (1, 3):                                       # 兩側的側堂（斜屋頂、三扇窗）
    Mf = FACES4[k]
    box(P['stone'], -1.7, 1.7, 1.5, 3.5, HL, HL + 0.9, Mf)
    slabM(P['crimson'], [(3.5, -1.8, 1.8, HL, HL + 1.0), (4.5, -1.8, 1.8, HL, HL + 0.08)], Mf)
    box(P['gold'], -1.82, 1.82, 3.44, 3.52, HL + 0.9, HL + 1.02, Mf)
    for x in (-1.0, 0.0, 1.0):
        window(P, Mf, x, 2.1, 2.8, 0.17, HL + 0.9)
    for x in (-1.7, 1.7):
        box(P['stone2'], x - 0.12, x + 0.12, 1.5, 3.5, HL + 0.85, HL + 0.98, Mf)
prism(P['stone'], 8, 0, -HL, [(1.5, 1.3), (4.6, 1.3)], pi / 8)                    # 後面的半圓殿
prism(P['gold'], 8, 0, -HL, [(4.6, 1.36), (4.72, 1.36)], pi / 8)
dome(P['crimson'], 0, -HL, 4.72, 1.32, 12, 0.9)
cylY(P['gold'], 0, -HL, 5.85, 6.4, 0.05, 0.01, 8)
for k in (0, 1, 2):
    Mf, w0, w1, sl = face_frame(8, 0, -HL, pi / 8, 1.3, 1.5, 1.3, 4.6, k)
    arch(P['stone2'], Mf, 0.0, 1.0, 2.2, 0.27, 0.0, 0.06)
    arch(P['ember'], Mf, 0.0, 1.08, 2.15, 0.19, 0.06, 0.08)
M.part('HallD', 'Root', P)
P = Pal()
for sx in (1, -1):
    for sz in (1, -1):                                 # 飛扶壁：角樓頂斜上去頂住塔身；扶壁頂上一支小尖塔
        beam(P['stone2'], V(sx * HL, 6.2, sz * HL), V(sx * (HS + 0.2), 8.9, sz * (HS + 0.2)), 0.2, 0.34)
        sq(P['stone2'], sx * (HS + 0.36), sz * (HS + 0.36), [(8.6, 0.2), (9.9, 0.2)])
        sq(P['crimson'], sx * (HS + 0.36), sz * (HS + 0.36), [(9.9, 0.25), (10.8, 0.02)])
sq(P['stone2'], 0, 0, [(6.05, HS + 0.06), (6.15, HS + 0.06)])
for Mf in FACES4:
    for i in range(-5, 6):                             # 迴廊底下一排托座
        box(P['stone2'], i * 0.5 - 0.09, i * 0.5 + 0.09, 9.95, 10.22, HS, HS + 0.3, Mf)
for k in (1, 3):                                       # 兩側的長旗幔
    Mf = FACES4[k]
    box(P['crimson'], -0.42, 0.42, 6.35, 7.95, HS + 0.08, HS + 0.1, Mf)
    box(P['gold'], -0.46, 0.46, 7.95, 8.0, HS + 0.06, HS + 0.13, Mf)
    plate(P['gold'], [(-0.2, 6.9), (0.0, 6.6), (0.2, 6.9), (0.0, 7.5)], HS + 0.1, HS + 0.115, Mf)
M.part('ShaftD', 'Root', P)
P = Pal()
for sx in (1, -1):
    for sz in (1, -1):                                 # 上段四角的小角樓
        x, z = sx * HU, sz * HU
        prism(P['stone2'], 8, x, z, [(12.9, 0.12), (13.3, 0.3), (14.75, 0.3)], pi / 8)
        prism(P['crimson'], 8, x, z, [(14.75, 0.36), (15.7, 0.02)], pi / 8)
for Mf in FACES4:                                      # 迴廊每邊中間一座小尖塔；上段的腰線
    p = Mf @ V(0, 0, HG - 0.25)
    sq(P['stone'], p.x, p.z, [(10.85, 0.2), (11.8, 0.2)])
    sq(P['crimson'], p.x, p.z, [(11.8, 0.26), (12.7, 0.02)])
    box(P['stone2'], -HU - 0.02, HU + 0.02, 12.95, 13.05, HU, HU + 0.06, Mf)
M.part('UpperD', 'Root', P)
P = Pal()
for Mf in FACES4:
    box(P['stone2'], -0.22, 0.22, 16.95, 17.6, 0.5, 1.0, Mf)                       # 尖頂的老虎窗
    plate(P['crimson'], [(-0.3, 17.6), (0.3, 17.6), (0.0, 17.95)], 0.45, 1.04, Mf)
    arch(P['ember'], Mf, 0.0, 17.05, 17.35, 0.11, 1.0, 1.02)
    p = Mf @ V(0, 0, HB + 0.1)                                                     # 鐘樓頂每邊中間一支小尖塔
    sq(P['stone2'], p.x, p.z, [(16.62, 0.1), (17.15, 0.1)])
    sq(P['gold'], p.x, p.z, [(17.15, 0.12), (17.6, 0.01)])
M.part('SpireD', 'Root', P)
P = Pal()
for sx in (1, -1):
    for sz in (1, -1):                                 # 基座四角的燈柱
        x, z = sx * (HX - 0.3), sz * (HZ - 0.3)
        sq(P['stone2'], x, z, [(0.55, 0.16), (1.5, 0.12)])
        sq(P['gold'], x, z, [(1.5, 0.17), (1.56, 0.17)])
        orb(P['ember'], x, 1.74, z, 0.17, 8)
cylX(P['steel'], -HX + 0.05, -3.7, 1.72, 2.2, 0.13, 0.1, 12)                       # 左邊的一門火砲
box(P['stone2'], -4.1, -3.6, 1.05, 1.6, 1.9, 2.5)
cylZ(P['gold'], -3.85, 1.6, 1.85, 2.55, 0.2, 12)
for z in (-2.2, -1.2):                                 # 右邊的彈藥箱
    crate(P, 4.2, z, 1.05, 0.45, 0.4, 0.6, 'crimson')
M.part('YardD', 'Root', P)

done(M, '重製_帝國巨塔', dict(size=[HX * 2, H, HZ * 2]))
