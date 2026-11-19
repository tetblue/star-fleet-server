# 都市的道路（四款，一支腳本）：遊戲單位，一塊 14 × 14，路面在 y＝1.87（種類的 oy＝−1.87，路面剛好貼地），燈柱頂 6.566。四款的外框都一樣，接縫才對得上。
#   預設：直線道路（沿 z）      → 重製_直線道路.glb（取代 城市_直線道路.glb）
#   --cross：十字路口           → 重製_十字路口.glb
#   --corner：轉角（接 +x 與 −z 兩邊，圓心在 (7, −7)，跟舊的一樣）→ 重製_轉角道路.glb
#   --bridge：天橋（沿 x，長 28、深 9.97、高 10.584，橋面在 7.0）→ 重製_天橋.glb
#   blender -b --factory-startup --python build_road.py -- [--cross|--corner|--bridge] [--no-bake] [--no-export]
# 截面（直線）：x ±4.6 是柏油車道，4.6～7 是人行道（高一階），交界有一道矮護欄（藍色燈條），人行道外緣一條管線，每邊兩支路燈
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bdkit import *

T, YR, YS, RW, TOP = 7.0, 1.87, 2.05, 4.6, 6.566       # 半寬、路面、人行道面、車道半寬、燈柱頂


def lamp(P, x, z, ax, az, arm=2.6):
    """路燈：柱在 (x, z)，燈臂朝 (ax, az) 伸出去。"""
    cylY(P['steel'], x, z, YS, YS + 0.5, 0.2, None, 10)
    cylY(P['white'], x, z, YS + 0.5, TOP - 0.42, 0.09, None, 10)
    a, b = V(x - ax * 0.2, TOP - 0.21, z - az * 0.2), V(x + ax * arm, TOP - 0.21, z + az * arm)
    beam(P['navy'], a, b, 0.3, 0.42)
    c = V(x + ax * (arm - 0.8), TOP - 0.44, z + az * (arm - 0.8))
    beam(P['lamp'], c - V(ax, 0, az) * 0.6, c + V(ax, 0, az) * 0.6, 0.2, 0.04)


def base(P):
    box(P['concrete'], -T + 0.03, T - 0.03, 0.0, YR - 0.12, -T, T)   # 路基（埋在地面下）
    for s in (1, -1):                                  # 側面的飾條（地形不平、露出來的時候看得到）
        box(P['tan'], s * (T - 0.06), s * T, YR - 0.5, YR - 0.36, -T, T)


if '--bridge' in ARGS:
    # 零件表：Footings 兩座基座；Piers 橋墩（A 字腳）；Deck 橋面板、柏油、標線；Parapet 護欄與燈條；Under 橋底的樑、斜撐、垂下來的纜線；Lamps 路燈
    L, DZ, YD, H = 14.0, 4.985, 7.0, 10.584
    M = Machine('bridge', '重製_天橋', tex=2048, bevel=1.6)
    P = Pal()
    for s in (1, -1):
        box(P['concrete'], s * 9.0, s * L, 0.0, 0.9, -DZ, DZ)
        box(P['tan'], s * 9.0, s * L, 0.9, 1.0, -DZ, DZ)
        box(P['white'], s * 9.6, s * 13.4, 1.0, 1.35, -4.3, 4.3)
    M.part('Footings', 'Root', P)
    P = Pal()
    for s in (1, -1):
        for sz in (1, -1):                             # A 字腳：下寬上窄
            slab(P['white'], [(1.35, s * 10.2, s * 13.0, sz * 2.1, sz * 4.1), (5.4, s * 10.9, s * 12.5, sz * 2.3, sz * 3.5), (6.1, s * 10.6, s * 12.8, sz * 2.0, sz * 3.8)])
            box(P['navy'], s * 13.0, s * 13.04, 2.2, 4.6, sz * 2.55, sz * 3.45)                  # 外側的深藍板
            box(P['glow'], s * 13.04, s * 13.06, 2.6, 4.2, sz * 2.95, sz * 3.05)
        box(P['white'], s * 10.8, s * 12.6, 3.6, 4.2, -2.4, 2.4)                                # 兩支腳中間的橫樑
        box(P['navy'], s * 10.75, s * 12.65, 3.75, 4.05, -1.4, 1.4)
    M.part('Piers', 'Root', P)
    P = Pal()
    box(P['white'], -13.2, 13.2, 6.1, YD - 0.1, -3.9, 3.9)
    box(P['asphalt'], -13.2, 13.2, YD - 0.1, YD, -3.05, 3.05)
    for i in range(-6, 7):                             # 中線（虛線）與兩條邊線
        box(P['white'], i * 2.0 - 0.55, i * 2.0 + 0.55, YD, YD + 0.012, -0.06, 0.06)
    for sz in (1, -1):
        box(P['white'], -13.2, 13.2, YD, YD + 0.012, sz * 2.8 - 0.05, sz * 2.8 + 0.05)
    M.part('Deck', 'Root', P)
    P = Pal()
    for sz in (1, -1):
        box(P['white'], -13.2, 13.2, YD - 0.1, YD + 0.75, sz * 3.3, sz * 3.9)
        box(P['navy'], -13.2, 13.2, YD + 0.2, YD + 0.5, sz * 3.9, sz * 3.93)
        box(P['glow'], -12.6, 12.6, YD + 0.32, YD + 0.38, sz * 3.3 - sz * 0.02, sz * 3.3)
        for x in (-13.2, 13.0):
            box(P['hazard'], x, x + 0.2, YD - 0.1, YD + 0.78, sz * 3.28, sz * 3.92)
    M.part('Parapet', 'Root', P)
    P = Pal()
    for z in (-2.6, 0.0, 2.6):                         # 縱樑
        box(P['steel'], -12.9, 12.9, 5.5, 6.1, z - 0.22, z + 0.22)
    for x in range(-9, 10, 3):                         # 橫樑
        box(P['steel'], x - 0.12, x + 0.12, 5.65, 6.1, -3.6, 3.6)
    for s in (1, -1):
        for z in (-2.6, 2.6):                          # 橋墩往橋中間的斜撐
            beam(P['white'], V(s * 10.6, 2.4, z), V(s * 5.6, 5.55, z), 0.34, 0.5)
        hose(P['rubber'], [V(s * 10.4, 5.3, -3.75), V(s * 6.5, 3.9, -3.75), V(0, 3.3, -3.75)], 0.14, 8)      # 垂下來的纜線
    cylX(P['steel'], -12.9, 12.9, 5.25, 1.3, 0.2, None, 12)                                     # 橋底的管線
    for x in (-8, -4, 0, 4, 8):
        box(P['steel'], x - 0.08, x + 0.08, 5.2, 5.5, 1.05, 1.55)
    M.part('Under', 'Root', P)
    P = Pal()
    for x, sz in ((-10, 1), (-3.3, -1), (3.3, 1), (10, -1)):
        cylY(P['steel'], x, sz * 3.6, YD + 0.75, YD + 1.1, 0.16, None, 10)
        cylY(P['white'], x, sz * 3.6, YD + 1.1, H - 0.4, 0.08, None, 10)
        beam(P['navy'], V(x, H - 0.2, sz * 3.8), V(x, H - 0.2, sz * 1.4), 0.28, 0.4)
        beam(P['lamp'], V(x, H - 0.42, sz * 2.7), V(x, H - 0.42, sz * 1.6), 0.18, 0.04)
    M.part('Lamps', 'Root', P)
    done(M, '重製_天橋', dict(size=[28, H, 9.97], deck=YD))
elif '--cross' in ARGS:
    # 零件表：Base 路基；Road 柏油與標線（四邊各一組斑馬線）；Corners 四個角的人行道、緣石、控制箱；Lamps 四個角各一支雙臂路燈
    M = Machine('road_x', '重製_十字路口', tex=1024, bevel=1.5)
    P = Pal()
    base(P)
    M.part('Base', 'Root', P)
    P = Pal()
    box(P['asphalt'], -T, T, YR - 0.12, YR, -RW, RW)
    for s in (1, -1):                                  # 另外兩臂（不跟中間那一條重疊）
        box(P['asphalt'], -RW, RW, YR - 0.12, YR, s * RW, s * T)
    for s in (1, -1):
        for i in range(-4, 5):                         # 斑馬線
            box(P['white'], i * 0.92 - 0.26, i * 0.92 + 0.26, YR, YR + 0.012, s * 4.9, s * 6.3)
            box(P['white'], s * 4.9, s * 6.3, YR, YR + 0.012, i * 0.92 - 0.26, i * 0.92 + 0.26)
    M.part('Road', 'Root', P)
    P = Pal()
    for sx in (1, -1):
        for sz in (1, -1):
            box(P['white'], sx * RW, sx * T, YR - 0.12, YS, sz * RW, sz * T)
            box(P['steel'], sx * RW, sx * (RW + 0.14), YR - 0.12, YS + 0.02, sz * RW, sz * T)   # 緣石
            box(P['steel'], sx * RW, sx * T, YR - 0.12, YS + 0.02, sz * RW, sz * (RW + 0.14))
            box(P['navy'], sx * 5.2, sx * 6.2, YS, YS + 0.03, sz * 5.2, sz * 6.2)               # 角上的深藍地磚
            box(P['navy'], sx * 6.3, sx * 6.8, YS, YS + 0.8, sz * 6.3, sz * 6.8)                # 號誌的控制箱
            box(P['glow'], sx * 6.3 - sx * 0.02, sx * 6.3, YS + 0.5, YS + 0.6, sz * 6.4, sz * 6.7)
    M.part('Corners', 'Root', P)
    P = Pal()
    for sx in (1, -1):
        for sz in (1, -1):
            x, z = sx * 5.5, sz * 5.5
            cylY(P['steel'], x, z, YS + 0.03, YS + 0.5, 0.2, None, 10)
            cylY(P['white'], x, z, YS + 0.5, TOP - 0.42, 0.09, None, 10)
            for ax, az in ((-sx, 0), (0, -sz)):
                beam(P['navy'], V(x, TOP - 0.21, z), V(x + ax * 2.6, TOP - 0.21, z + az * 2.6), 0.3, 0.42)
                c = V(x + ax * 1.8, TOP - 0.44, z + az * 1.8)
                beam(P['lamp'], c - V(ax, 0, az) * 0.6, c + V(ax, 0, az) * 0.6, 0.2, 0.04)
            box(P['beacon'], x - 0.12, x + 0.12, YS + 2.6, YS + 2.85, z - 0.12, z + 0.12)       # 號誌燈
    M.part('Lamps', 'Root', P)
    done(M, '重製_十字路口', dict(size=[14, TOP, 14], road=YR))
elif '--corner' in ARGS:
    # 零件表：Base 路基；Road 彎道的柏油與標線；Walks 內側的扇形人行道、外側的人行道與外角的鋪面、護欄；Lamps 路燈、管線
    CX, CZ, A0, A1 = T, -T, pi / 2, pi                 # 圓心在 (+x, −z) 那個角；中線半徑 7
    M = Machine('road_cn', '重製_轉角道路', tex=1024, bevel=1.5)
    P = Pal()
    base(P)
    M.part('Base', 'Root', P)
    P = Pal()
    sector(P['asphalt'], CX, CZ, T - RW, T + RW, YR - 0.12, YR, A0, A1, 20)
    for i in range(6):                                 # 中線（虛線）
        a = A0 + (A1 - A0) * (i + 0.5) / 6
        sector(P['white'], CX, CZ, T - 0.06, T + 0.06, YR, YR + 0.012, a - 0.075, a + 0.075, 3)
    for r in (T - 4.25, T + 4.25):                     # 邊線
        sector(P['white'], CX, CZ, r - 0.05, r + 0.05, YR, YR + 0.012, A0, A1, 20)
    M.part('Road', 'Root', P)
    P = Pal()
    edge = lambda a: 14.0 / max(abs(cos(a)), abs(sin(a)))                                       # 從圓心沿角度 a 走到這一塊的外緣
    sector(P['white'], CX, CZ, 0.0, T - RW, YR - 0.12, YS, A0, A1, 12)                          # 內側的扇形
    sector(P['white'], CX, CZ, T + RW, edge, YR - 0.12, YS, A0, A1, 20)                         # 外側（一直鋪到外角）
    sector(P['steel'], CX, CZ, T - RW - 0.14, T - RW, YR - 0.12, YS + 0.02, A0, A1, 12)         # 緣石
    sector(P['steel'], CX, CZ, T + RW, T + RW + 0.14, YR - 0.12, YS + 0.02, A0, A1, 20)
    for k in range(3):                                 # 外側的矮護欄（三段，中間留缺口）
        a = A0 + (A1 - A0) * (k + 0.5) / 3
        sector(P['white'], CX, CZ, T + RW + 0.2, T + RW + 0.48, YS, YS + 0.5, a - 0.2, a + 0.2, 6)
        sector(P['glow'], CX, CZ, T + RW + 0.18, T + RW + 0.2, YS + 0.3, YS + 0.36, a - 0.18, a + 0.18, 6)
        sector(P['navy'], CX, CZ, T + RW + 0.17, T + RW + 0.51, YS, YS + 0.56, a + 0.2, a + 0.25, 1)
        sector(P['navy'], CX, CZ, T + RW + 0.17, T + RW + 0.51, YS, YS + 0.56, a - 0.25, a - 0.2, 1)
    box(P['navy'], -5.6, -3.2, YS, YS + 0.03, 3.2, 5.6)                                         # 外角的深藍地磚與設備箱
    box(P['navy'], -6.6, -5.9, YS, YS + 1.1, 5.9, 6.6)
    box(P['glow'], -5.9, -5.88, YS + 0.7, YS + 0.8, 6.0, 6.5)
    M.part('Walks', 'Root', P)
    P = Pal()
    for a in (A0 + 0.3, A1 - 0.3):
        c, s = cos(a), sin(a)
        lamp(P, CX + 12.6 * c, CZ + 12.6 * s, -c, -s)
    lamp(P, CX - 1.1, CZ + 1.1, -0.7071, 0.7071, 2.2)
    hose(P['steel'], [V(CX + 13.4 * cos(a), YS + 0.22, CZ + 13.4 * sin(a)) for a in [A0 + (A1 - A0) * i / 8 for i in range(9)]], 0.16, 8)
    M.part('Lamps', 'Root', P)
    done(M, '重製_轉角道路', dict(size=[14, TOP, 14], road=YR))
else:
    # 零件表：Base 路基；Road 柏油與標線；Walks 兩邊的人行道、緣石、矮護欄與燈條、設備箱；Lamps 每邊兩支路燈、人行道外緣的管線
    M = Machine('road_st', '重製_直線道路', tex=1024, bevel=1.5)
    P = Pal()
    base(P)
    M.part('Base', 'Root', P)
    P = Pal()
    box(P['asphalt'], -RW, RW, YR - 0.12, YR, -T, T)
    for i in range(-3, 4):                             # 中線（虛線，一塊 7 段，接到下一塊剛好連續）
        box(P['white'], -0.06, 0.06, YR, YR + 0.012, i * 2.0 - 0.55, i * 2.0 + 0.55)
    for s in (1, -1):
        box(P['white'], s * 4.25 - 0.05, s * 4.25 + 0.05, YR, YR + 0.012, -T, T)
    M.part('Road', 'Root', P)
    P = Pal()
    for s in (1, -1):
        box(P['white'], s * RW, s * T, YR - 0.12, YS, -T, T)
        box(P['steel'], s * RW, s * (RW + 0.14), YR - 0.12, YS + 0.02, -T, T)                   # 緣石
        for z0, z1 in ((-6.2, -0.8), (0.8, 6.2)):      # 矮護欄（兩段，中間留缺口）
            box(P['white'], s * (RW + 0.2), s * (RW + 0.48), YS, YS + 0.5, z0, z1)
            box(P['glow'], s * (RW + 0.18), s * (RW + 0.2), YS + 0.3, YS + 0.36, z0 + 0.3, z1 - 0.3)
            for z in (z0, z1):
                box(P['navy'], s * (RW + 0.17), s * (RW + 0.51), YS, YS + 0.56, z - 0.15, z + 0.15)
        for i in range(-2, 3):                         # 人行道的地磚縫（深色細條）
            box(P['steel'], s * (RW + 0.6), s * (T - 0.7), YS, YS + 0.008, i * 2.8 - 0.03, i * 2.8 + 0.03)
    box(P['navy'], 5.9, 6.4, YS, YS + 1.1, -0.7, 0.7)                                           # 一邊的設備箱
    box(P['glow'], 5.88, 5.9, YS + 0.7, YS + 0.8, -0.4, 0.4)
    M.part('Walks', 'Root', P)
    P = Pal()
    for s in (1, -1):
        for z in (-3.5, 3.5):
            lamp(P, s * 5.6, z, -s, 0)
        cylZ(P['steel'], s * 6.75, YS + 0.22, -T, T, 0.16, 10)
        for z in (-5.25, -1.75, 1.75, 5.25):
            box(P['steel'], s * 6.75 - 0.22, s * 6.75 + 0.22, YS, YS + 0.44, z - 0.06, z + 0.06)
    M.part('Lamps', 'Root', P)
    done(M, '重製_直線道路', dict(size=[14, TOP, 14], road=YR))
