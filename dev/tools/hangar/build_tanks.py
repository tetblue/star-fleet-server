# 兩種儲槽（戰艦庫旁邊），一支腳本出兩款，舊模型在遊戲裡都縮放 85：
#   預設：雙聯儲槽（取代 整備庫_19_雙聯儲槽.glb）寬 3.7、深 3.7、高 5.0：一大一小兩個直立的槽，小的在 −x、+z 那一角。
#   --dome：圓頂儲槽（取代 整備庫_21_圓頂儲槽.glb）寬 3.9、深 5.1、高 6.9：方底板、圓筒槽身、上面一圈比較粗的環、圓頂蓋，兩根管子從 ±x 兩側往 +z 伸出去再往下。
# 尺寸、朝向照舊模型。沒有會動的部分。
#   blender -b --factory-startup --python build_tanks.py -- [--dome] [--no-bake] [--no-export] [--compare]
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

DOME = '--dome' in ARGS
if not DOME:
    # 零件表：Skid 底座；Big 大槽（槽身、色帶、頂蓋、人孔）；Small 小槽；Piping 連通管、閥、爬梯、液位計
    M = Machine('tank_twin', '整備庫_38_雙聯儲槽', tex=1024)
    BX, BZ, SX, SZ = 0.4, -0.4, -1.05, 1.1
    P = Pal()
    box(P['steel'], -1.8, 1.85, 0.0, 0.16, -1.85, 1.85)
    for x in (-1.5, 1.5):
        box(P['yellow'], x - 0.25, x + 0.25, 0.16, 0.24, -1.85, 1.85)
    M.part('Skid', 'Root', P)
    P = Pal()
    My = Tm(BX, 0, BZ) @ AXY
    revolve(P['white'], [(0.24, 1.3), (0.5, 1.42), (4.3, 1.42), (4.75, 1.15), (4.9, 0.5)], My, 28)
    for y in (1.0, 3.4):
        revolve(P['navy'], [(y, 1.427), (y + 0.5, 1.427)], My, 28, False, False)
    revolve(P['glow'], [(3.6, 1.434), (3.66, 1.434)], My, 28, False, False)
    cylY(P['steel'], BX, BZ, 4.9, 5.0, 0.55, None, 16)                 # 人孔蓋
    for i in range(8):
        a = (i + 0.5) / 8 * 2 * pi
        cylY(P['steel'], BX + 0.46 * cos(a), BZ + 0.46 * sin(a), 5.0, 5.03, 0.04, None, 6)
    M.part('Big', 'Root', P)
    P = Pal()
    My = Tm(SX, 0, SZ) @ AXY
    revolve(P['navy'], [(0.24, 0.62), (0.4, 0.72), (2.9, 0.72), (3.25, 0.55), (3.4, 0.2)], My, 20)
    revolve(P['white'], [(1.3, 0.726), (1.7, 0.726)], My, 20, False, False)
    cylY(P['steel'], SX, SZ, 3.4, 3.55, 0.16, None, 10)
    M.part('Small', 'Root', P)
    P = Pal()
    hose(P['steel'], [V(SX, 3.5, SZ), V(SX, 3.9, SZ), V(SX + 0.5, 3.9, SZ - 0.5), V(BX - 1.0, 3.9, BZ + 1.05)], 0.08, 8)       # 連通管
    cylZ(P['orange'], SX, 3.9, SZ + 0.1, SZ + 0.16, 0.2, 12)           # 閥的手輪
    for x in (0.2, 0.6):                                               # 爬梯（+z 面）
        beam(P['steel'], V(BX + x - 0.4, 0.3, BZ + 1.5), V(BX + x - 0.4, 4.6, BZ + 1.5), 0.06)
    for i in range(13):
        cylX(P['steel'], BX - 0.2, BX + 0.2, 0.6 + i * 0.32, BZ + 1.5, 0.022, None, 6)
    box(P['steel'], BX + 1.42, BX + 1.5, 1.0, 3.2, BZ - 0.08, BZ + 0.08)       # 液位計
    box(P['glow'], BX + 1.5, BX + 1.51, 1.1, 2.4, BZ - 0.04, BZ + 0.04)
    M.part('Piping', 'Root', P)
    M.finish(dict(size=[3.7, 5.0, 3.7]))
    if '--compare' in ARGS:
        M.compare('19_雙聯儲槽', 85, dist=1.25)
else:
    # 零件表：Plinth 方底板與地腳螺栓；Body 槽身、色帶、加勁環；Collar 上面那圈粗環與圓頂蓋、人孔；Pipes 兩根管子、法蘭、閥、液位計
    M = Machine('tank_dome', '整備庫_39_圓頂儲槽', tex=1024)
    P = Pal()
    box(P['steel'], -1.93, 1.93, 0.0, 0.3, -1.93, 1.93)
    for sx in (1, -1):
        for sz in (1, -1):
            cylY(P['steel'], sx * 1.65, sz * 1.65, 0.3, 0.4, 0.09, None, 6)
    box(P['hazard'], -1.93, 1.93, 0.02, 0.28, 1.93, 1.942)
    M.part('Plinth', 'Root', P)
    P = Pal()
    revolve(P['white'], [(0.3, 1.55), (0.6, 1.45), (4.6, 1.45)], AXY, 28)
    for y in (1.5, 3.0):
        revolve(P['steel'], [(y, 1.5), (y + 0.12, 1.5)], AXY, 28, False, False)
    revolve(P['navy'], [(2.0, 1.456), (2.6, 1.456)], AXY, 28, False, False)
    M.part('Body', 'Root', P)
    P = Pal()
    revolve(P['white'], [(4.5, 1.5), (4.8, 1.92), (5.8, 1.92), (6.1, 1.6), (6.5, 1.45), (6.8, 0.9)], AXY, 8)       # 八角的粗環與蓋
    revolve(P['navy'], [(5.1, 1.93), (5.5, 1.93)], AXY, 8, False, False)
    revolve(P['glow'], [(5.27, 1.94), (5.33, 1.94)], AXY, 8, False, False)
    cylY(P['steel'], 0, 0, 6.8, 6.93, 0.85, None, 16)
    box(P['steel'], -0.12, 0.12, 6.93, 7.0, -0.5, 0.5)
    box(P['navy'], -2.1, -1.7, 5.0, 5.9, -0.5, 0.5)                    # 側邊的控制盒
    M.part('Collar', 'Root', P)
    P = Pal()
    for s in (1, -1):                                                  # 兩根管子：從槽身兩側出來，往 +z 伸出去再往下
        hose(P['steel'], [V(s * 1.3, 2.3, 0.6), V(s * 1.5, 2.3, 1.6), V(s * 1.5, 2.3, 2.9), V(s * 1.5, 1.6, 3.15), V(s * 1.5, 0.1, 3.15)], 0.17, 10)
        cylZ(P['steel'], s * 1.5, 2.3, 1.9, 2.02, 0.27, 12)            # 法蘭
        cylY(P['steel'], s * 1.5, 3.15, 0.0, 0.12, 0.3, None, 12)
    cylZ(P['orange'], 1.5, 2.75, 2.4, 2.46, 0.24, 12)                  # 閥的手輪
    cylY(P['steel'], 1.5, 2.43, 2.47, 2.75, 0.04, None, 6)
    box(P['steel'], -0.08, 0.08, 0.8, 4.2, 1.45, 1.53)                 # 液位計
    box(P['glow'], -0.04, 0.04, 0.9, 3.1, 1.53, 1.54)
    M.part('Pipes', 'Root', P)
    M.finish(dict(size=[3.9, 7.0, 5.1]))
    if '--compare' in ARGS:
        M.compare('21_圓頂儲槽', 85, dist=1.15)
