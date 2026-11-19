# 管制塔（取代 models/機庫/整備庫_01_管制塔.glb：戰艦庫旁邊）。舊模型在遊戲裡縮放 95：寬 13.6、深 16.9、高 30.9。
# 方形塔身，腰部一圈有欄杆的平台（往 +x 伸出去、底下有支柱），塔身上有深藍的帶子和 V 字徽，頂上是往外張的管制室、碟形天線、兩根天線、紅色警示燈；塔腳邊三個儲槽。門朝 +x，徽朝 ±z。
# 新的尺寸、朝向一樣。沒有會動的部分。
#   blender -b --factory-startup --python build_tower.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Base 塔基與門；Balcony 平台、支柱、欄杆；Shaft 塔身、帶子、徽；Cab 管制室（窗帶）、屋頂、女兒牆；Roof_Gear 碟形天線、天線、警示燈；Tanks 三個儲槽與管線
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

M = Machine('tower', '整備庫_36_管制塔', tex=2048, bevel=2.0)
SQ = AXY @ Rz(45 * D)                                  # 四邊形的迴轉：半徑＝半邊長 × 1.414
R2 = 1.41421

P = Pal()
revolve(P['white'], [(0.0, 3.6 * R2), (0.8, 3.6 * R2), (1.4, 3.2 * R2), (7.0, 3.2 * R2)], SQ, 4)
box(P['navy'], 3.2, 3.22, 0.0, 3.4, -1.1, 1.1)        # 門（朝 +x）
box(P['steel'], 3.22, 3.26, 0.0, 3.1, -0.9, 0.9)
box(P['glow'], 3.22, 3.24, 3.5, 3.62, -1.0, 1.0)
box(P['hazard'], 3.2, 3.21, 0.0, 0.5, -3.2, -1.2)
box(P['hazard'], 3.2, 3.21, 0.0, 0.5, 1.2, 3.2)
M.part('Base', 'Root', P)
P = Pal()
BY = 8.6
box(P['steel'], -4.2, 6.8, BY - 0.2, BY, -5.4, 5.4)
for z in (-5.3, 5.3):
    beam(P['white'], V(-4.2, BY - 0.42, z), V(6.8, BY - 0.42, z), 0.2, 0.44)
for x in (-4.1, 6.7):
    beam(P['white'], V(x, BY - 0.42, -5.4), V(x, BY - 0.42, 5.4), 0.2, 0.44)
box(P['hazard'], 6.8, 6.812, BY - 0.64, BY - 0.2, -5.4, 5.4)
for z in (-4.6, 4.6):                                  # +x 那頭的支柱與斜撐
    beam(P['white'], V(6.3, 0.0, z), V(6.3, BY - 0.6, z), 0.34)
    box(P['steel'], 5.9, 6.7, 0.0, 0.1, z - 0.4, z + 0.4)
    beam(P['steel'], V(6.3, 4.6, z), V(3.4, 7.0, z * 0.6), 0.16)
beam(P['steel'], V(6.3, 1.2, -4.6), V(6.3, BY - 1.2, 4.6), 0.14)
beam(P['steel'], V(6.3, BY - 1.2, -4.6), V(6.3, 1.2, 4.6), 0.14)
pts = [V(-4.1, BY, -5.3), V(1.3, BY, -5.3), V(6.7, BY, -5.3), V(6.7, BY, 0.0), V(6.7, BY, 5.3), V(1.3, BY, 5.3), V(-4.1, BY, 5.3), V(-4.1, BY, 0.0), V(-4.1, BY, -5.3)]
railing(P['steel'], pts, 1.2, 0.06)
M.part('Balcony', 'Root', P)
P = Pal()
revolve(P['white'], [(7.0, 2.6 * R2), (21.0, 2.6 * R2), (21.6, 2.2 * R2), (22.2, 2.2 * R2)], SQ, 4)
revolve(P['navy'], [(17.4, 2.63 * R2), (18.6, 2.63 * R2)], SQ, 4, False, False)
revolve(P['steel'], [(BY, 2.9 * R2), (BY + 0.5, 2.9 * R2)], SQ, 4)        # 塔身穿過平台的那一圈
for s in (1, -1):                                      # V 字徽（±z 兩面）：一根直條、兩道 V
    Mz = I4 if s > 0 else Ry(pi)
    box(P['navy'], -0.35, 0.35, 10.2, 14.0, 2.6, 2.63, Mz)
    for y0 in (14.0, 15.4):
        plate(P['navy'], [(0.0, y0), (1.9, y0 + 1.5), (1.9, y0 + 2.4), (0.0, y0 + 0.9), (-1.9, y0 + 2.4), (-1.9, y0 + 1.5)], 2.6, 2.63, Mz)
    box(P['glow'], -1.6, 1.6, 19.2, 19.34, 2.6, 2.62, Mz)
box(P['navy'], 2.6, 2.63, BY, BY + 3.2, -0.9, 0.9)          # 平台那一層的門（朝 +x）
box(P['steel'], 2.63, 2.67, BY, BY + 2.9, -0.7, 0.7)
M.part('Shaft', 'Root', P)
P = Pal()
revolve(P['white'], [(22.2, 2.9 * R2), (23.2, 4.3 * R2), (23.6, 4.5 * R2), (25.4, 4.7 * R2), (25.9, 4.2 * R2), (26.3, 4.2 * R2)], SQ, 4)
revolve(P['navy'], [(23.75, 4.56 * R2), (25.25, 4.72 * R2)], SQ, 4, False, False)          # 窗帶
revolve(P['glow'], [(24.44, 4.655 * R2), (24.56, 4.668 * R2)], SQ, 4, False, False)
revolve(P['steel'], [(26.3, 4.3 * R2), (26.8, 4.3 * R2), (26.8, 4.0 * R2), (26.3, 4.0 * R2)], SQ, 4, False, False)   # 女兒牆
for sx in (1, -1):
    for sz in (1, -1):                                 # 四個角的柱
        box(P['white'], sx * 4.4 - 0.2, sx * 4.4 + 0.2, 23.5, 25.5, sz * 4.4 - 0.2, sz * 4.4 + 0.2)
M.part('Cab', 'Root', P)
P = Pal()
cylY(P['white'], 0.6, 0.4, 26.3, 27.6, 1.3, 0.9, 16)   # 天線座
Md = Tm(0.6, 28.4, 0.4) @ Ry(40 * D) @ Rx(-55 * D)
revolve(P['white'], [(0.0, 0.25), (0.25, 1.0), (0.6, 1.45), (0.66, 1.45), (0.3, 1.0), (0.06, 0.25)], Md, 20)      # 碟
cylY(P['steel'], 0.6, 0.4, 27.6, 28.4, 0.12, None, 10)
revolve(P['steel'], [(0.0, 0.04), (1.1, 0.03)], Md, 6)
for x, z, h in ((-2.6, -2.4, 30.9), (2.8, -1.6, 30.2)):
    cylY(P['steel'], x, z, 26.3, h, 0.07, 0.03, 8)
    cylY(P['steel'], x, z, 26.3, 26.7, 0.2, None, 10)
for sx in (1, -1):
    for sz in (1, -1):                                 # 紅色警示燈
        cylY(P['orange'], sx * 3.4, sz * 3.4, 26.8, 27.4, 0.36, None, 12)
        cylY(P['steel'], sx * 3.4, sz * 3.4, 27.4, 27.5, 0.4, None, 12)
box(P['steel'], -1.8, -0.6, 26.3, 27.1, 1.6, 3.0)      # 空調箱
M.part('Roof_Gear', 'Root', P)
P = Pal()
for x in (-5.7, -3.3, -0.9):                           # 塔腳邊的三個儲槽（−x、+z 那一角）
    My = Tm(x, 0, 7.3) @ AXY
    revolve(P['white'], [(0.0, 1.0), (0.3, 1.1), (3.3, 1.1), (3.7, 0.8), (3.8, 0.3)], My, 20)
    revolve(P['navy'], [(0.5, 1.106), (1.0, 1.106)], My, 20, False, False)
    revolve(P['navy'], [(2.6, 1.106), (3.1, 1.106)], My, 20, False, False)
    cylY(P['steel'], x, 7.3, 3.8, 4.0, 0.25, None, 10)
hose(P['steel'], [V(-5.7, 3.9, 7.3), V(-5.7, 4.3, 7.3), V(-0.9, 4.3, 7.3), V(-0.9, 4.3, 3.6), V(-0.9, 3.0, 3.25)], 0.1, 8)
M.part('Tanks', 'Root', P)

M.finish(dict(size=[13.6, 30.9, 16.9], balcony_y=BY))
if '--compare' in ARGS:
    M.compare('01_管制塔', 95, dist=1.0)
