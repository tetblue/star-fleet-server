# 照明塔（取代 models/機庫/整備庫_13_照明塔A.glb、14_照明塔B.glb）。舊模型在遊戲裡縮放 75：寬 4.7、深 5.8、高 13.9。三腳架、三節伸縮桿、橫桿上兩盞方形探照燈。
# 一支腳本出兩款：A＝兩盞燈各往外偏；B（加 --b）＝兩盞燈朝同一邊、壓得比較低。沒有會動的部分。
#   blender -b --factory-startup --python build_light.py -- [--b] [--no-bake] [--no-export] [--compare]
# 零件表：Tripod 中心座、三支腳與腳墊、斜撐、配重箱；Mast 三節桿、夾環、電纜；Head 橫桿、兩個燈架、兩盞燈（燈殼、散熱片、遮光板、燈面）
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

B = '--b' in ARGS
M = Machine('light_b' if B else 'light_a', '整備庫_33_照明塔B' if B else '整備庫_32_照明塔A', tex=1024, yaw=90)      # 舊模型的燈朝 +x（零件照 +z 建，最後整個轉 90°，朝向跟舊模型一樣）
TOPY, HS = 11.75, 1.4                 # 橫桿的高度、燈頭放大的倍率

P = Pal()
cylY(P['steel'], 0, 0, 0.45, 1.1, 0.5, 0.42, 8)
for a in (90, 210, 330):
    dx, dz = cos(a * D), sin(a * D)
    beam(P['steel'], V(0, 0.95, 0), V(dx * 2.75, 0.2, dz * 2.75), 0.24)
    beam(P['steel'], V(0, 2.4, 0), V(dx * 1.7, 0.6, dz * 1.7), 0.12)
    cylY(P['chrome'], dx * 2.75, dz * 2.75, 0.08, 0.55, 0.05, None, 10)
    cylY(P['steel'], dx * 2.75, dz * 2.75, 0.0, 0.08, 0.24, None, 14)
box(P['navy'], -0.5, 0.5, 0.12, 0.62, -1.5, -0.6)             # 配重兼電源箱
box(P['glow'], -0.3, 0.3, 0.42, 0.46, -1.51, -1.5)
box(P['hazard'], -0.5, 0.5, 0.12, 0.24, -1.512, -1.5)
M.part('Tripod', 'Root', P)
P = Pal()
for y0, y1, r in ((0.9, 5.2, 0.34), (5.0, 9.0, 0.27), (8.8, TOPY, 0.2)):
    cylY(P['white'], 0, 0, y0, y1, r, None, 20)
for y, r in ((5.1, 0.39), (8.9, 0.31)):
    cylY(P['steel'], 0, 0, y - 0.2, y + 0.14, r, None, 20)
    cylZ(P['steel'], r + 0.04, y, -0.1, 0.1, 0.06, 8)
cylY(P['navy'], 0, 0, 1.5, 1.9, 0.35, None, 20)
hose(P['rubber'], [V(0.1, TOPY - 0.2, -0.26), V(0.3, 9.4, -0.42), V(0.26, 7.0, -0.4), V(0.4, 4.0, -0.5), V(0.34, 1.2, -0.6), V(0.2, 0.62, -0.9)], 0.08, 8)
M.part('Mast', 'Root', P)
P = Pal()
beam(P['steel'], V(-2.2, TOPY, 0), V(2.2, TOPY, 0), 0.26)
cylY(P['steel'], 0, 0, TOPY - 0.3, TOPY + 0.16, 0.26, None, 16)
for s in (1, -1):
    yaw, tilt = ((16 * D, 34 * D) if B else (s * 14 * D, 20 * D))
    Mh = Tm(s * 1.32, TOPY + 0.2 + 0.78 * HS, 0) @ Ry(yaw) @ Rx(tilt) @ Matrix.Scale(HS, 4)
    cylY(P['steel'], s * 1.32, 0, TOPY, TOPY + 0.3, 0.12, None, 10)
    for sx in (1, -1):                                        # 燈架的兩片側板
        box(P['steel'], min(sx * 0.68, sx * 0.74), max(sx * 0.68, sx * 0.74), -0.75, 0.12, -0.1, 0.1, Mh)
    box(P['steel'], -0.74, 0.74, -0.75, -0.68, -0.1, 0.1, Mh)
    box(P['navy'], -0.65, 0.65, -0.65, 0.65, -0.5, 0.4, Mh)   # 燈殼
    box(P['lamp'], -0.56, 0.56, -0.56, 0.56, 0.4, 0.42, Mh)   # 燈面
    box(P['steel'], -0.7, 0.7, 0.6, 0.66, 0.1, 0.75, Mh)      # 遮光板
    for i in range(6):                                        # 散熱片
        box(P['steel'], -0.6 + i * 0.22, -0.52 + i * 0.22, -0.55, 0.55, -0.66, -0.5, Mh)
M.part('Head', 'Root', P)

M.finish(dict(height=13.9, variant='B' if B else 'A'))
if '--compare' in ARGS:
    M.compare('14_照明塔B' if B else '13_照明塔A', 75, dist=0.85)
