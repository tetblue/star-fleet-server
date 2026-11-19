# 雙管砲塔（取代 models/機庫/整備庫_16_雙管砲塔.glb：牆邊的備用零件）。舊模型在遊戲裡縮放 55：長 5.4、寬 3.4、高 1.9，圓座上一個砲塔，兩根砲管朝 −x。
# 新的尺寸、朝向一樣。沒有會動的部分（備用零件，放在地上）。
#   blender -b --factory-startup --python build_turret.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Base 座圈與螺栓、運送用的木墊；House 砲塔本體、兩側的附加裝甲、頂蓋、觀測窗；Guns 砲盾、兩根砲管（套筒、砲口制退器）、砲口蓋
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

M = Machine('turret', '整備庫_29_雙管砲塔', tex=1024)

P = Pal()
for z in (-1.0, 1.0):                                 # 運送用的墊木
    box(P['rubber'], -1.5, 1.5, 0.0, 0.14, z - 0.2, z + 0.2)
cylY(P['steel'], 0, 0, 0.14, 0.4, 1.7, None, 40)
cylY(P['white'], 0, 0, 0.4, 0.56, 1.55, None, 40)
for i in range(20):
    a = (i + 0.5) / 20 * 2 * pi
    cylY(P['steel'], 1.62 * cos(a), 1.62 * sin(a), 0.4, 0.45, 0.045, None, 6)
M.part('Base', 'Root', P)
P = Pal()
PROF = [(-1.85, 0.6), (1.45, 0.6), (1.9, 0.95), (1.9, 1.5), (1.4, 1.9), (-1.0, 1.9), (-1.85, 1.35)]
plate(P['white'], PROF, -1.3, 1.3)
for s in (1, -1):                                     # 兩側的附加裝甲、色帶、燈條
    plate(P['navy'], [(-1.5, 0.75), (1.3, 0.75), (1.65, 1.05), (1.65, 1.4), (1.25, 1.7), (-0.9, 1.7), (-1.5, 1.3)], min(s * 1.3, s * 1.4), max(s * 1.3, s * 1.4))
    box(P['glow'], -0.9, 0.9, 1.2, 1.25, min(s * 1.4, s * 1.41), max(s * 1.4, s * 1.41))
    for bx, by in ((-1.2, 0.95), (1.2, 0.95), (1.2, 1.45), (-0.7, 1.5)):
        cylZ(P['steel'], bx, by, min(s * 1.4, s * 1.43), max(s * 1.4, s * 1.43), 0.05, 6)
cylY(P['steel'], 0.6, 0.0, 1.9, 1.98, 0.45, None, 24)       # 頂蓋
box(P['steel'], 0.5, 0.7, 1.98, 2.03, -0.3, 0.3)
box(P['navy'], -0.6, 0.0, 1.9, 2.02, 0.5, 1.0)              # 觀測儀
box(P['glow'], -0.61, -0.6, 1.93, 1.99, 0.58, 0.92)
box(P['steel'], 1.9, 2.0, 0.95, 1.5, -0.9, 0.9)             # 後艙的散熱板
for i in range(5):
    box(P['navy'], 2.0, 2.02, 1.02 + i * 0.09, 1.07 + i * 0.09, -0.8, 0.8)
M.part('House', 'Root', P)
P = Pal()
plate(P['steel'], [(-2.1, 0.85), (-1.7, 0.75), (-1.2, 1.55), (-1.45, 1.75), (-2.1, 1.45)], -0.95, 0.95)       # 砲盾
for z in (-0.5, 0.5):
    cylX(P['navy'], -2.75, -2.1, 1.2, z, 0.24, None, 20)
    cylX(P['steel'], -3.5, -2.75, 1.2, z, 0.15, None, 16)
    cylX(P['steel'], -3.55, -3.25, 1.2, z, 0.21, None, 16)                                                    # 砲口制退器
    for x in (-3.47, -3.37):
        box(P['rubber'], x, x + 0.05, 1.12, 1.28, z - 0.22, z + 0.22)
    cylX(P['orange'], -3.6, -3.55, 1.2, z, 0.2, None, 16)                                                     # 砲口蓋
M.part('Guns', 'Root', P)

M.finish(dict(size=[5.5, 2.03, 3.4]))
if '--compare' in ARGS:
    M.compare('16_雙管砲塔', 55, dist=1.15)
