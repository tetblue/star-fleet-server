# 物料艙（取代 models/機庫/整備庫_18_物料艙.glb：戰艦庫旁邊）。舊模型在遊戲裡縮放 70：寬 8.8、深 12.8、高 14.2。
# 一個正面是斜的料斗（門在下面，朝 +z），兩側各一片高高的側板，一條深藍的輸送臂從料斗頂上斜著升上去、在最高處往 −z 平伸出去；輸送臂朝 +z 的那一面有 V 字徽。
# 新的尺寸、朝向一樣。沒有會動的部分。
#   blender -b --factory-startup --python build_hopper.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Bin 料斗、卸料門、檢修蓋；Sides 兩片側板與加勁條、爬梯；Conveyor 輸送臂（斜段、平段）、V 字徽、滾輪、出料口；Feet 底座與腳墊
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

M = Machine('hopper', '整備庫_37_物料艙', tex=2048, bevel=1.6)
PX = Ry(-pi / 2)                                       # 外形畫在 (z, y)，沿 x 擠出

P = Pal()
plate(P['white'], [(-2.6, 0.3), (3.8, 0.3), (3.8, 2.8), (1.2, 7.4), (-2.6, 7.4)], -3.5, 3.5, PX)
box(P['navy'], -1.5, 1.5, 0.3, 2.5, 3.8, 3.83)                           # 卸料門
for i in range(5):
    box(P['steel'], -1.4, 1.4, 0.5 + i * 0.4, 0.62 + i * 0.4, 3.83, 3.86)
box(P['hazard'], -3.5, 3.5, 0.3, 0.7, 3.8, 3.812)
box(P['glow'], -1.2, 1.2, 2.6, 2.7, 3.8, 3.82)
Ms = Tm(0, 2.8, 3.8) @ Rx(-(pi / 2 - atan2(4.6, 2.6)))                  # 斜面上的檢修蓋
box(P['navy'], -1.3, 1.3, 1.0, 3.6, 0.0, 0.05, Ms)
box(P['steel'], -1.5, 1.5, 0.8, 1.0, 0.0, 0.09, Ms)
box(P['steel'], -1.5, 1.5, 3.6, 3.8, 0.0, 0.09, Ms)
M.part('Bin', 'Root', P)
P = Pal()
for s in (1, -1):
    x0, x1 = (3.5, 3.9) if s > 0 else (-3.9, -3.5)
    plate(P['white'], [(-3.0, 0.0), (0.4, 0.0), (0.4, 7.2), (-1.2, 11.4), (-3.0, 11.4)], -x1, -x0, PX)
    box(P['navy'], min(s * 3.9, s * 3.93), max(s * 3.9, s * 3.93), 1.0, 6.4, -2.6, -0.1)
    for y in (3.0, 5.8, 8.6):
        box(P['steel'], min(s * 3.9, s * 3.98), max(s * 3.9, s * 3.98), y, y + 0.16, -3.0, 0.2)
for z in (-0.5, 0.1):                                                    # 右側的爬梯
    beam(P['steel'], V(4.2, 0.2, z + 1.4), V(4.2, 7.6, z + 1.4), 0.08)
for i in range(22):
    cylZ(P['steel'], 4.2, 0.6 + i * 0.32, 0.9, 1.5, 0.03, 6)
for y in (2.4, 5.2, 7.3):
    for z in (0.9, 1.5):
        beam(P['steel'], V(3.5, y, z), V(4.2, y, z), 0.07)
M.part('Sides', 'Root', P)
P = Pal()
plate(P['navy'], [(-0.6, 7.2), (0.9, 7.2), (-1.9, 12.5), (-3.4, 12.5)], -1.5, 1.5, PX)          # 斜段
plate(P['navy'], [(-1.9, 12.5), (-2.3, 13.3), (-8.9, 13.3), (-8.9, 14.18), (-3.0, 14.18), (-3.4, 12.5)], -1.5, 1.5, PX)   # 轉折與平段
Mc = Tm(0, 7.2, 0.9) @ Rx(-(pi / 2 - atan2(5.3, 2.8)))                   # 斜段朝前的那一面：V 字徽
for y0 in (1.3, 2.5, 3.7):
    plate(P['white'], [(0.0, y0), (1.1, y0 + 0.75), (1.1, y0 + 1.25), (0.0, y0 + 0.5), (-1.1, y0 + 1.25), (-1.1, y0 + 0.75)], 0.0, 0.04, Mc)
for s in (1, -1):                                                        # 兩側的護邊與滾輪
    box(P['steel'], min(s * 1.5, s * 1.62), max(s * 1.5, s * 1.62), 13.2, 14.26, -8.95, -2.6)
    for i in range(6):
        cylX(P['steel'], min(s * 1.62, s * 1.7), max(s * 1.62, s * 1.7), 13.74, -8.3 + i * 1.05, 0.2, None, 12)
box(P['steel'], -1.3, 1.3, 12.5, 13.3, -8.9, -7.7)                       # 出料口
box(P['hazard'], -1.5, 1.5, 13.3, 14.18, -8.912, -8.9)
M.part('Conveyor', 'Root', P)
P = Pal()
box(P['steel'], -3.9, 3.9, 0.0, 0.3, -3.0, 3.9)
for sx in (1, -1):
    for z in (-2.6, 3.5):
        box(P['rubber'], sx * 3.5 - 0.5, sx * 3.5 + 0.5, 0.0, 0.12, z - 0.5, z + 0.5)
M.part('Feet', 'Root', P)

M.finish(dict(size=[8.0, 14.2, 12.8]))
if '--compare' in ARGS:
    M.compare('18_物料艙', 70, dist=1.1)
