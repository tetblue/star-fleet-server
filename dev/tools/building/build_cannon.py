# 行星防禦砲（取代 人類聯盟風_05行星防禦砲_設計圖.glb）：階梯狀的八角砲座、轉盤、兩片耳軸架，一門長砲斜指天空。
# 舊模型的外框比例 x 1、z 0.683、高 0.916 → 這裡 x −10～10（砲口在 −x 那一頭）、z ±6.83、高 18.32；遊戲裡種類的 rot＝90。
# 砲座的基地是方的（x −3.66～10），中心在 x＝3.17；砲的耳軸在 (3.17, 8.6, 0)，仰角 35.6°。
#   blender -b --factory-startup --python build_cannon.py -- [--no-bake] [--no-export]
# 零件表：Pad 基地、欄杆；Bunker 三層八角砲座、腰帶、門、V 字徽；Pipes 側面的粗管與冷卻槽；Turntable 轉盤與燈環；Cheeks 耳軸架；
#         Gun 砲身（砲尾、搖架、砲管、發光的加速段、砲口制退器）、駐退筒；Feed 彈藥輸送帶
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

HZ, H, X0, X1 = 6.83, 18.32, -3.66, 10.0
CX = (X0 + X1) / 2
A8, F8 = pi / 8, 0.9239
PV, EL, LG = V(CX, 8.6, 0), 35.6 * D, 15.55            # 耳軸、仰角、耳軸到砲口的長度
M = Machine('cannon', '重製_行星防禦砲', tex=4096, bevel=1.6)
C0 = Tm(CX, 0, 0)

P = Pal()
box(P['concrete'], X0, X1, 0.0, 0.6, -HZ, HZ)
for sz in (1, -1):
    railing(P['steel'], [V(X0 + 0.3, 0.6, sz * 3.0), V(X0 + 0.3, 0.6, sz * (HZ - 0.3)), V(CX - 2.5, 0.6, sz * (HZ - 0.3))], 0.55, 0.03)
    railing(P['steel'], [V(X1 - 0.3, 0.6, sz * 3.0), V(X1 - 0.3, 0.6, sz * (HZ - 0.3)), V(CX + 2.5, 0.6, sz * (HZ - 0.3))], 0.55, 0.03)
M.part('Pad', 'Root', P)

P = Pal()
prism(P['white'], 8, CX, 0, [(0.6, 6.5), (2.4, 6.2), (2.7, 5.6)], A8)
prism(P['navy'], 8, CX, 0, [(1.3, 6.4), (1.9, 6.3)], A8, False, False)
prism(P['glow'], 8, CX, 0, [(2.0, 6.29), (2.07, 6.28)], A8, False, False)
prism(P['white'], 8, CX, 0, [(2.7, 5.2), (4.3, 4.8), (4.55, 4.2)], A8)
prism(P['navy'], 8, CX, 0, [(3.2, 5.1), (3.8, 4.95)], A8, False, False)
prism(P['white'], 8, CX, 0, [(4.55, 3.9), (5.5, 3.6)], A8)
d1 = 6.4 * F8
for k, Mf in enumerate(FACES4):
    Mf = C0 @ Mf
    if k == 0:                                         # 正面（+z）：門
        box(P['steel'], -0.7, 0.7, 0.6, 2.0, d1 - 0.25, d1 + 0.05, Mf)
        box(P['navy'], -0.55, 0.55, 0.7, 1.9, d1 + 0.05, d1 + 0.08, Mf)
        box(P['hazard'], -1.3, -0.8, 0.6, 1.2, d1 - 0.1, d1 - 0.04, Mf)
        box(P['hazard'], 0.8, 1.3, 0.6, 1.2, d1 - 0.1, d1 - 0.04, Mf)
    else:
        for x in (-1.2, 0.0, 1.2):
            box(P['glass'], x - 0.35, x + 0.35, 0.95, 1.2, d1 - 0.2, d1 - 0.1, Mf)
    for s in (1, -1):                                  # 第二層的 V 字徽
        plate(P['white'], [(0, 3.25), (s * 0.5, 3.6), (s * 0.5, 3.8), (0, 3.45)][::s], 5.0 * F8 - 0.02, 5.0 * F8 + 0.03, Mf)
M.part('Bunker', 'Root', P)

P = Pal()
for sz in (1, -1):                                     # 兩側從砲座上層彎下來的粗管，中間一段發光（冷卻液）
    pts = [V(CX + 2.0, 4.9, sz * 3.2), V(CX + 3.6, 4.9, sz * 4.6), V(CX + 5.0, 3.6, sz * 5.4), V(CX + 5.0, 0.7, sz * 5.4)]
    hose(P['steel'], pts, 0.36, 10)
    cylY(P['glow'], CX + 5.0, sz * 5.4, 1.3, 2.6, 0.4, None, 12)
    cylY(P['navy'], CX + 5.0, sz * 5.4, 0.6, 1.3, 0.48, None, 12)
for z in (-1.0, 0.2):                                  # 後面的兩個冷卻槽
    cylY(P['white'], X1 - 1.0, z, 0.6, 2.2, 0.5, None, 14)
    cylY(P['navy'], X1 - 1.0, z, 1.2, 1.6, 0.51, None, 14)
box(P['navy'], X0 + 0.6, X0 + 1.6, 0.6, 1.5, -5.9, -4.9)                           # 配電箱
box(P['glow'], X0 + 0.7, X0 + 1.5, 1.1, 1.2, -4.9, -4.88)
M.part('Pipes', 'Root', P)

P = Pal()
cylY(P['navy'], CX, 0, 5.5, 6.0, 3.5, None, 28)
cylY(P['glow'], CX, 0, 6.0, 6.06, 3.3, None, 28)
cylY(P['white'], CX, 0, 6.06, 6.5, 3.1, 2.9, 28)
M.part('Turntable', 'Root', P)

P = Pal()
for sz in (1, -1):                                     # 耳軸架：兩片梯形的厚板
    plate(P['white'], [(CX - 2.4, 6.5), (CX + 2.6, 6.5), (CX + 1.1, 9.3), (CX + 0.4, 9.7), (CX - 0.4, 9.7), (CX - 1.1, 9.3)], sz * 1.55 - 0.3, sz * 1.55 + 0.3)
    plate(P['navy'], [(CX - 1.3, 6.9), (CX + 1.5, 6.9), (CX + 0.6, 8.6), (CX - 0.6, 8.6)], sz * 1.87 - 0.03 * sz - 0.03, sz * 1.87 - 0.03 * sz + 0.03)
    cylZ(P['steel'], CX, 8.6, sz * 1.9 - 0.12, sz * 1.9 + 0.12, 0.7, 20)           # 耳軸蓋
    cylZ(P['glow'], CX, 8.6, sz * 2.03 - 0.02, sz * 2.03 + 0.02, 0.3, 14)
M.part('Cheeks', 'Root', P)

P = Pal()
G = Tm(*PV) @ Rz(-EL) @ Ry(-pi / 2)                    # 砲的局部座標：+z 沿砲管往砲口，+x 朝上（轉之前的 +x 轉到斜上）
k = LG / 16.5
box(P['white'], -1.25, 1.25, -1.2, 1.2, -2.6 * k, 2.2 * k, G)                      # 砲尾與搖架
box(P['navy'], -1.32, 1.32, -0.7, 0.7, -2.2 * k, 0.6 * k, G)
box(P['navy'], -0.9, 0.9, -0.9, 0.9, -3.2 * k, -2.6 * k, G)                        # 砲閂
box(P['glow'], -0.5, 0.5, -0.5, 0.5, -3.24 * k, -3.2 * k, G)
revolve(P['white'], [(2.2 * k, 1.15), (3.0 * k, 0.95), (7.6 * k, 0.8)], G, 20)
revolve(P['navy'], [(7.6 * k, 1.0), (8.9 * k, 1.0)], G, 20)
revolve(P['steel'], [(8.9 * k, 0.62), (12.2 * k, 0.6)], G, 16)                     # 加速段：鋼芯外面一圈發光的線圈
for i in range(6):
    z = (9.2 + i * 0.5) * k
    revolve(P['glow'], [(z, 0.7), (z + 0.2 * k, 0.7)], G, 16)
revolve(P['navy'], [(12.2 * k, 0.9), (13.0 * k, 0.9)], G, 20)
revolve(P['white'], [(13.0 * k, 0.66), (15.2 * k, 0.58)], G, 16)
revolve(P['steel'], [(15.2 * k, 0.85), (16.5 * k, 0.85)], G, 12)                   # 砲口制退器
for i in range(6):                                     # 制退器上的槽
    a = i * pi / 3
    box(P['dark'], -0.12, 0.12, 0.8, 0.87, 15.45 * k, 16.25 * k, G @ Rz(a))
revolve(P['dark'], [(16.5 * k, 0.5), (16.52 * k, 0.5)], G, 12)
for s in (1, -1):                                      # 駐退筒（砲管上下各一支）
    cylZ(P['steel'], s * 1.05, 0.0, 2.2 * k, 6.6 * k, 0.2, 10, G)
    cylZ(P['chrome'], s * 1.05, 0.0, 6.6 * k, 7.6 * k, 0.12, 10, G)
beam(P['steel'], G @ V(1.25, 0, -2.0 * k), G @ V(0.95, 0, 12.6 * k), 0.05)         # 砲尾拉到砲管前段的鋼索
M.part('Gun', 'Root', P)

P = Pal()
box(P['steel'], CX + 3.2, X1 - 0.4, 0.6, 1.0, 3.6, 4.6)                            # 彈藥輸送帶（從基地邊送到砲座）
box(P['rubber'], CX + 3.2, X1 - 0.5, 1.0, 1.06, 3.7, 4.5)
for i in range(4):
    box(P['yellow'], CX + 3.6 + i * 0.75, CX + 4.1 + i * 0.75, 1.06, 1.4, 3.85, 4.35)
box(P['white'], X1 - 1.5, X1 - 0.4, 0.6, 1.7, 2.0, 3.6)
box(P['navy'], X1 - 1.55, X1 - 0.35, 1.7, 1.82, 1.95, 3.65)
M.part('Feed', 'Root', P)

# ===== 第三版：幾何細節 =====
# BunkerD 三層砲座的小零件與欄杆；TurretD 耳軸架上的雷達碟、測距儀、爬梯、俯仰油壓缸、纜線；GunD 砲管的加強環、散熱片、導線管、砲口的環；YardD 基地的彈藥箱、探照燈、護牆
KG = LG / 16.5
P = Pal()
tier_detail(P, 8, CX, 0, A8, 6.5, 0.6, 6.2, 2.4, 51, 3, skip=(5,), scale=0.8)
tier_detail(P, 8, CX, 0, A8, 5.2, 2.7, 4.8, 4.3, 52, 3, scale=0.7)
tier_detail(P, 8, CX, 0, A8, 3.9, 4.55, 3.6, 5.5, 53, 2, scale=0.5)
ring_rail(P, 8, CX, 0, A8, 5.5, 2.7, 0.42, 0.022)
ring_rail(P, 8, CX, 0, A8, 4.1, 4.55, 0.38, 0.02)
for i in range(6):                                     # 門前的台階
    box(P['steel'], CX - 0.9, CX + 0.9, 0.6, 0.6 + 0.0 * i + 0.02, d1 + 0.05, d1 + 0.5)
for kk in (0, 2, 4, 6):                                # 斜的四面：一樓到二樓的爬梯
    Mf, w0, w1, sl = face_frame(8, CX, 0, A8, 6.5, 0.6, 6.2, 2.4, kk)
    ladder(P, Mf, -w1 * 0.36, 0.0, sl + 0.3, 0.09)
M.part('BunkerD', 'Root', P)
P = Pal()
cylY(P['steel'], CX + 1.3, 2.35, 9.3, 10.3, 0.07, None, 8)                         # 耳軸架旁的雷達碟
dish(P['white'], Tm(CX + 1.3, 10.55, 2.35) @ Ry(-pi / 2) @ Rx(-0.55), 0.62, None, 14)
box(P['navy'], CX - 0.5, CX + 0.6, 9.7, 10.15, -2.2, -1.3)                         # 另一邊的測距儀
cylX(P['steel'], CX - 0.9, CX - 0.5, 9.92, -1.75, 0.14, None, 10)
cylX(P['glass'], CX - 0.93, CX - 0.9, 9.92, -1.75, 0.11, None, 10)
for sz in (1, -1):
    ladder(P, Tm(CX + 1.9, 6.5, sz * 1.86) @ Ry(0 if sz > 0 else pi), 0.0, 0.0, 2.2, 0.08)
    a, b = V(CX - 2.5, 6.45, sz * 0.75), G @ V(-0.95, sz * 0.5, 4.6 * KG)          # 俯仰油壓缸（轉盤前緣頂到砲管下面）
    beam(P['navy'], a, a.lerp(b, 0.6), 0.3)
    beam(P['chrome'], a.lerp(b, 0.6), b, 0.14)
    cylZ(P['steel'], a.x, a.y, a.z - 0.22, a.z + 0.22, 0.2, 10)
    hose(P['rubber'], [V(CX + 2.3, 6.5, sz * 1.0), V(CX + 2.6, 7.6, sz * 0.9), G @ V(0.2, sz * 1.0, -2.9 * KG)], 0.07, 8)      # 砲尾的纜線
box(P['white'], CX - 0.6, CX + 0.6, 6.5, 7.0, -1.2, 1.2)                           # 轉盤上的機箱
box(P['glow'], CX - 0.62, CX - 0.6, 6.7, 6.8, -0.8, 0.8)
M.part('TurretD', 'Root', P)
P = Pal()
for z in (3.4, 4.6, 5.8, 7.0):                         # 砲管的加強環
    revolve(P['steel'], [(z * KG, 0.98 - (z - 3.4) * 0.035), ((z + 0.22) * KG, 0.98 - (z - 3.4) * 0.035)], G, 20)
for i in range(8):                                     # 搖架上的散熱片
    box(P['steel'], -1.34, 1.34, -1.26, 1.26, (0.8 + i * 0.16) * KG, (0.87 + i * 0.16) * KG, G)
for a in (0.8, -0.8, pi - 0.8, pi + 0.8):              # 沿著砲管的四根導線管
    cylZ(P['navy'], 0.9 * cos(a), 0.9 * sin(a), 2.4 * KG, 12.3 * KG, 0.055, 8, G)
for z in (13.5, 14.3):
    revolve(P['navy'], [(z * KG, 0.72), ((z + 0.25) * KG, 0.72)], G, 16)
revolve(P['steel'], [(15.0 * KG, 0.9), (15.25 * KG, 0.9)], G, 12)
revolve(P['steel'], [(16.2 * KG, 0.86), (16.4 * KG, 0.86)], G, 12)
box(P['white'], 1.25, 1.6, -0.55, 0.55, -1.8 * KG, 0.9 * KG, G)                    # 砲尾上面的瞄準鏡座
box(P['glass'], 1.3, 1.55, -0.3, 0.3, 0.9 * KG, 0.93 * KG, G)
M.part('GunD', 'Root', P)
P = Pal()
for i, (x, z) in enumerate(((X0 + 0.9, 4.2), (X0 + 0.9, 5.0), (X0 + 1.7, 4.6), (X1 - 1.0, -4.6), (X1 - 1.0, -5.5), (X1 - 1.9, -5.2))):
    crate(P, x, z, 0.6, 0.6, 0.45, 0.8, ('navy', 'orange', 'white')[i % 3])
crate(P, X0 + 1.2, 4.6, 1.05, 0.55, 0.4, 0.75, 'orange')
for x, z, ax in ((X0 + 0.6, -6.2, 1), (X1 - 0.6, 6.2, -1)):                        # 探照燈
    cylY(P['steel'], x, z, 0.6, 3.0, 0.06, None, 8)
    box(P['navy'], x - 0.3, x + 0.3, 3.0, 3.45, z - 0.3, z + 0.3)
    box(P['lamp'], x + ax * 0.3, x + ax * 0.32, 3.05, 3.4, z - 0.25, z + 0.25)
for z in (-2.2, 0.0, 2.2):                             # 砲口那一邊的護牆
    slab(P['concrete'], [(0.6, X0 + 0.25, X0 + 0.95, z - 0.95, z + 0.95), (1.5, X0 + 0.45, X0 + 0.75, z - 0.9, z + 0.9)])
    box(P['hazard'], X0 + 0.24, X0 + 0.26, 0.7, 1.0, z - 0.8, z + 0.8)
M.part('YardD', 'Root', P)

done(M, '重製_行星防禦砲', dict(size=[20, H, HZ * 2], pivot=[CX, 8.6, 0], elev=35.6))
