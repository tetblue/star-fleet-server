# 機庫牆板（第五階段的樣本）。現在機庫的牆是程式裡的一塊白色方塊，兩面各貼一張畫出來的牆板貼圖，每 8 公尺一根方柱。
# 新的：一個 8 公尺寬的牆段，可以沿著牆一段一段接下去。裡面那一面（+z）有凸出來的牆板、深藍腰帶與燈條、一根鋼柱、兩道橫管、電纜槽；
# 外面那一面（−z）有牆板與深藍腰帶。牆厚 3（跟現在一樣）。原點在牆段左下角、裡面那一面的牆面上；x 沿著牆、y 上。
#   blender -b --factory-startup --python build_wall.py -- [--h 32] [--no-bake] [--no-export]
#   高度預設 22（戰艦庫），--h 32 是整修庫的高度（多一排牆板）
# 零件表：Slab 牆體；Panels_In 裡面的牆板、腰帶、燈條、踢腳；Column 鋼柱、柱腳、托架；Runs 橫管、管夾、電纜槽；Panels_Out 外面的牆板與腰帶
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

HH = float(ARGS[ARGS.index('--h') + 1]) if '--h' in ARGS else 22.0
W, T = 8.0, 3.0
tag = '%d' % HH
M = Machine('wall_' + tag, '整備庫_40_牆段%s' % tag, tex=2048, bevel=1.5)
BAND = (HH * 0.30 - 1.1, HH * 0.30 + 1.1)              # 深藍腰帶的高度（跟現在外牆的腰帶一樣在三成高）

P = Pal()
box(P['white'], 0, W, 0, HH, -T + 0.12, -0.12)
M.part('Slab', 'Root', P)
P = Pal()
rows, y = [], 0.5
while y < HH - 1.0:                                    # 一排一排的牆板，碰到腰帶就跳過
    y1 = min(y + 4.6, HH - 0.3)
    if y < BAND[1] and y1 > BAND[0]:
        if BAND[0] - y > 1.0:
            rows.append((y, BAND[0] - 0.15))
        y = BAND[1] + 0.15
        continue
    rows.append((y, y1))
    y = y1 + 0.25
for y0, y1 in rows:
    for x0, x1 in ((0.12, 3.3), (4.7, 7.88)):
        box(P['white'], x0, x1, y0, y1, -0.12, 0.0)
        box(P['steel'], x0 + 0.25, x0 + 0.33, y0 + 0.3, y1 - 0.3, 0.0, 0.012)       # 牆板上的細縫
box(P['navy'], 0, W, BAND[0], BAND[1], -0.12, 0.03)
box(P['glow'], 0.3, 3.2, BAND[0] + 1.02, BAND[0] + 1.18, 0.03, 0.045)
box(P['glow'], 4.8, 7.7, BAND[0] + 1.02, BAND[0] + 1.18, 0.03, 0.045)
box(P['hazard'], 0, W, 0.0, 0.45, -0.12, 0.02)         # 踢腳的警示帶
box(P['steel'], 3.3, 4.7, 0.45, HH, -0.12, -0.06)      # 柱子後面的襯板
M.part('Panels_In', 'Root', P)
P = Pal()
box(P['steel'], 3.4, 4.6, 0.0, HH, 0.0, 1.2)           # 鋼柱（H 型：兩片翼板加腹板的樣子）
box(P['white'], 3.52, 4.48, 0.3, HH - 0.3, 1.2, 1.26)
box(P['steel'], 3.1, 4.9, 0.0, 0.25, 0.0, 1.6)         # 柱腳
for bx in (3.25, 4.75):
    for bz in (0.3, 1.3):
        cylY(P['steel'], bx, bz, 0.25, 0.33, 0.07, None, 6)
for yb in [v for v in (HH * 0.36 + 1.5, HH * 0.68) if v < HH - 2]:        # 托架
    plate(P['steel'], [(3.4, yb - 1.0), (3.4, yb), (2.6, yb), (2.6, yb - 0.2)], 0.2, 0.34)
    plate(P['steel'], [(4.6, yb - 1.0), (5.4, yb - 0.2), (5.4, yb), (4.6, yb)], 0.2, 0.34)
M.part('Column', 'Root', P)
P = Pal()
for yb, r in ((HH * 0.36 + 1.5, 0.16), (HH * 0.68, 0.12)):
    if yb < HH - 2:
        cylX(P['white'], 0, W, yb + r + 0.02, 1.5, r, None, 12)                # 橫管（從柱子前面過）
        cylX(P['steel'], 0, W, yb + r + 0.02, 1.9, r * 0.6, None, 10)
        for x in (1.2, 6.8):
            box(P['steel'], x - 0.08, x + 0.08, yb, yb + 2 * r + 0.06, 0.0, 2.05)        # 管夾與支架
box(P['steel'], 0, W, HH - 1.6, HH - 1.5, 0.1, 0.9)    # 電纜槽
for z in (0.1, 0.86):
    box(P['steel'], 0, W, HH - 1.6, HH - 1.3, z, z + 0.04)
for i in range(3):
    cylX(P['rubber'], 0, W, HH - 1.44, 0.3 + i * 0.2, 0.05, None, 8)
M.part('Runs', 'Root', P)
P = Pal()
for y0, y1 in rows:
    for x0, x1 in ((0.12, 3.9), (4.1, 7.88)):
        box(P['white'], x0, x1, y0, y1, -T, -T + 0.12)
box(P['navy'], 0, W, BAND[0], BAND[1], -T - 0.2, -T + 0.12)
M.part('Panels_Out', 'Root', P)

M.finish(dict(width=W, height=HH, thick=T))
