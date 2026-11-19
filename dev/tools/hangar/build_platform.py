# 升降工作台（取代 models/機庫/整備庫_10_升降工作台.glb）。舊模型在遊戲裡縮放 110：寬 12.2、深 8.3、高 12，兩根伸縮柱撐一條有欄杆的窄平台，底下掛探照燈。
# 整修庫把大的那座機械臂放在它頂上（高度 12）。新的：平台加深到站得下機械臂的底座，地板上表面就在 12，所以遊戲裡擺機械臂的高度不用改。
# 沒有會動的部分（不建骨架）。
#   blender -b --factory-startup --python build_platform.py -- [--no-bake] [--no-export] [--compare]
#
# 零件表：Columns 兩根三節伸縮柱＋夾環＋電纜；Feet 每根柱子三支撐腳與腳墊、兩柱之間的連桿；Deck_Frame 平台的框與地板、安裝環；
#         Rails 欄杆與踢腳板；Lamps 平台底下四盞探照燈；Ladder 爬梯
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

TOP, CX, HW, HD = 12.0, 4.6, 6.1, 3.0                 # 地板上表面的高度、柱子的 |x|、平台半寬、半深
M = Machine('platform', '整備庫_27_升降工作台', tex=1024)

P = Pal()
for s in (1, -1):
    x = s * CX
    for (y0, y1, r) in ((0.5, 4.6, 0.55), (4.4, 8.4, 0.44), (8.2, TOP - 0.5, 0.34)):
        cylY(P['white'], x, 0, y0, y1, r, None, 28)
    for y, r in ((4.5, 0.6), (8.3, 0.49)):            # 每一節頂端的夾環
        cylY(P['steel'], x, 0, y - 0.18, y + 0.12, r, None, 28)
        cylZ(P['steel'], x + r + 0.05, y, -0.12, 0.12, 0.08, 10)
    cylY(P['navy'], x, 0, 1.2, 1.6, 0.562, None, 28)
    cylY(P['glow'], x, 0, 1.36, 1.44, 0.568, None, 28)
    hose(P['rubber'], [V(x - s * 0.45, TOP - 0.55, 0.5), V(x - s * 0.75, 9.0, 0.6), V(x - s * 0.7, 6.0, 0.55), V(x - s * 0.9, 3.0, 0.65), V(x - s * 0.62, 1.0, 0.5)], 0.07, 8)
M.part('Columns', 'Root', P)
P = Pal()
for s in (1, -1):
    x = s * CX
    cylY(P['steel'], x, 0, 0.25, 0.7, 0.78, 0.7, 8)   # 柱腳的座
    for a in (90, 210, 330):                          # 三支撐腳：一支朝前後、兩支斜出去
        dx, dz = cos(a * D) * (-s), sin(a * D)
        beam(P['steel'], V(x, 0.5, 0), V(x + dx * 3.3, 0.22, dz * 3.3), 0.22)
        cylY(P['chrome'], x + dx * 3.3, dz * 3.3, 0.1, 0.5, 0.06, None, 10)
        cylY(P['steel'], x + dx * 3.3, dz * 3.3, 0.0, 0.1, 0.26, None, 14)
        beam(P['steel'], V(x, 1.9, 0), V(x + dx * 2.0, 0.34, dz * 2.0), 0.1)          # 斜撐
beam(P['steel'], V(-CX, 0.5, 0), V(CX, 0.5, 0), 0.18)   # 兩柱之間的連桿
M.part('Feet', 'Root', P)
P = Pal()
box(P['steel'], -HW, HW, TOP - 0.1, TOP, -HD, HD)        # 地板
for z in (-HD + 0.1, 0.0, HD - 0.1):                     # 縱樑
    box(P['white'], -HW, HW, TOP - 0.5, TOP - 0.1, z - 0.1, z + 0.1)
for i in range(7):                                       # 橫樑
    x = -HW + 0.1 + i * (2 * HW - 0.2) / 6
    box(P['white'], x - 0.08, x + 0.08, TOP - 0.42, TOP - 0.1, -HD, HD)
for s in (1, -1):
    cylY(P['steel'], s * CX, 0, TOP - 0.62, TOP - 0.5, 0.6, None, 24)                 # 柱頂的法蘭
    box(P['hazard'], -HW, HW, TOP - 0.5, TOP - 0.1, min(s * HD, s * (HD + 0.012)), max(s * HD, s * (HD + 0.012)))
    box(P['navy'], min(s * HW, s * (HW + 0.012)), max(s * HW, s * (HW + 0.012)), TOP - 0.5, TOP - 0.1, -HD, HD)
cylY(P['white'], 0, 0, TOP, TOP + 0.06, 2.75, None, 56)  # 機械臂的安裝環
for i in range(20):
    a = (i + 0.5) / 20 * 2 * pi
    cylY(P['steel'], 2.55 * cos(a), 2.55 * sin(a), TOP + 0.06, TOP + 0.1, 0.05, None, 6)
M.part('Deck_Frame', 'Root', P)
P = Pal()
xs = [-HW + 0.06 + i * (2 * HW - 0.12) / 6 for i in range(7)]
railing(P['steel'], [V(x, TOP, -HD + 0.06) for x in xs] + [V(HW - 0.06, TOP, 0), V(HW - 0.06, TOP, HD - 0.06)] + [V(x, TOP, HD - 0.06) for x in reversed(xs[1:-1])]
        + [V(-HW + 0.06, TOP, HD - 0.06), V(-HW + 0.06, TOP, 1.0)], 1.1, 0.04)                # 左邊爬梯上來的地方留缺口
for s in (1, -1):
    box(P['white'], -HW, HW, TOP, TOP + 0.15, min(s * (HD - 0.06), s * HD), max(s * (HD - 0.06), s * HD))
M.part('Rails', 'Root', P)
P = Pal()
for x in (-3.4, -1.5, 1.5, 3.4):                         # 探照燈：朝前下方
    Lm = Tm(x, TOP - 0.85, HD - 0.7) @ Rx(35 * D)
    box(P['steel'], x - 0.05, x + 0.05, TOP - 0.85, TOP - 0.5, HD - 0.76, HD - 0.64)
    revolve(P['navy'], [(-0.3, 0.2), (0.0, 0.34), (0.12, 0.36)], Lm, 20)
    revolve(P['glow'], [(0.12, 0.3), (0.135, 0.3)], Lm, 20)
M.part('Lamps', 'Root', P)
P = Pal()
for z in (1.3, 1.9):                                     # 爬梯（左側，從地面到平台）
    beam(P['steel'], V(-HW - 0.12, 0.3, z), V(-HW - 0.12, TOP + 1.1, z), 0.07)
for i in range(38):
    cylZ(P['steel'], -HW - 0.12, 0.6 + i * 0.31, 1.3, 1.9, 0.025, 6)
for y in (4.0, 8.0, TOP - 0.3):
    for z in (1.3, 1.9):
        beam(P['steel'], V(-HW - 0.12, y, z), V(-HW + 0.02, y, z), 0.06)
M.part('Ladder', 'Root', P)

M.finish(dict(top=TOP, deck=[2 * HW, 2 * HD]))
if '--compare' in ARGS:
    M.compare('10_升降工作台', 110, dist=1.1)
