# 雙推進器艙（取代 models/機庫/整備庫_12_雙推進器艙.glb：牆邊的備用零件）。舊模型在遊戲裡縮放 60：寬 4.0、深 4.7、高 2.2，一個圓角機艙，兩個噴嘴朝 +z。
# 新的尺寸、朝向一樣。沒有會動的部分。
#   blender -b --factory-startup --python build_pod.py -- [--no-bake] [--no-export] [--compare]
# 零件表：Housing 機艙外殼、頂上的檢修蓋、後面的進氣格柵、兩側的安裝耳；Nozzles 兩個噴嘴（外罩、內壁、燃燒室的環）；Stand 運送架
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

M = Machine('pod', '整備庫_30_雙推進器艙', tex=1024, yaw=90)      # 舊模型的噴嘴朝 +x（零件照 +z 建，最後整個轉 90°，朝向跟舊模型一樣）
NX, NY = 0.98, 1.12                                    # 噴嘴的中心

P = Pal()
plate(P['white'], [(-1.6, 0.2), (1.6, 0.2), (2.0, 0.6), (2.0, 1.6), (1.6, 2.0), (-1.6, 2.0), (-2.0, 1.6), (-2.0, 0.6)], -1.6, 1.4)
box(P['navy'], -0.9, 0.9, 2.0, 2.08, -1.0, 0.7)       # 檢修蓋
box(P['glow'], -0.6, 0.6, 2.08, 2.09, -0.2, -0.14)
for bx in (-0.8, 0.8):
    for bz in (-0.9, 0.6):
        cylY(P['steel'], bx, bz, 2.08, 2.11, 0.05, None, 6)
for s in (1, -1):
    box(P['navy'], min(s * 2.0, s * 2.012), max(s * 2.0, s * 2.012), 0.95, 1.25, -1.3, 1.1)
    for z in (-1.0, 0.8):                             # 安裝耳
        plate(P['steel'], [(0.0, -0.22), (0.34, -0.14), (0.34, 0.14), (0.0, 0.22)], z - 0.07, z + 0.07, Tm(s * 2.0, 1.1, 0) @ (I4 if s > 0 else Ry(pi)))
    for i in range(6):                                # 後面的進氣格柵
        box(P['navy'], s * NX - 0.6, s * NX + 0.6, 0.62 + i * 0.17, 0.72 + i * 0.17, -1.63, -1.6)
plate(P['steel'], [(-1.7, 0.3), (1.7, 0.3), (1.9, 0.6), (1.9, 1.6), (1.7, 1.9), (-1.7, 1.9), (-1.9, 1.6), (-1.9, 0.6)], 1.4, 1.48)       # 噴嘴那一面的端板
M.part('Housing', 'Root', P)
P = Pal()
for s in (1, -1):
    Mz = Tm(s * NX, NY, 0)
    revolve(P['steel'], [(1.48, 0.66), (2.0, 0.74), (3.05, 0.9), (3.05, 0.82), (1.75, 0.5), (1.6, 0.5)], Mz, 32)
    revolve(P['navy'], [(1.5, 0.67), (1.95, 0.75)], Mz, 32, False, False)
    for z in (2.3, 2.65):                             # 外罩上的加強環
        revolve(P['steel'], [(z, 0.78 + (z - 2.0) * 0.152 + 0.02), (z + 0.05, 0.78 + (z + 0.05 - 2.0) * 0.152 + 0.02)], Mz, 32, False, False)
    revolve(P['rubber'], [(1.76, 0.3), (1.77, 0.3)], Mz, 20)                  # 燃燒室（備用零件，沒點火）
    revolve(P['steel'], [(1.75, 0.5), (1.75, 0.3)], Mz, 20, False, False)
    for i in range(6):                                # 噴嘴外面的致動桿
        a = i * 60 * D
        beam(P['chrome'], Mz @ V(0.72 * cos(a), 0.72 * sin(a), 1.5), Mz @ V(0.86 * cos(a), 0.86 * sin(a), 2.25), 0.05)
M.part('Nozzles', 'Root', P)
P = Pal()
for z in (-1.2, 1.0):                                 # 運送架
    box(P['yellow'], -1.9, 1.9, 0.0, 0.2, z - 0.16, z + 0.16)
    for x in (-1.3, 1.3):
        box(P['rubber'], x - 0.3, x + 0.3, 0.2, 0.26, z - 0.18, z + 0.18)
for x in (-1.9, 1.9):
    beam(P['yellow'], V(x, 0.1, -1.2), V(x, 0.1, 1.0), 0.16)
M.part('Stand', 'Root', P)

M.finish(dict(size=[4.68, 2.11, 4.68]))
if '--compare' in ARGS:
    M.compare('12_雙推進器艙', 60, dist=1.15)
