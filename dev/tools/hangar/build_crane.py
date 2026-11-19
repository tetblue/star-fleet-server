# 天車（取代 models/機庫/整備庫_02_天車.glb）。舊模型是一根 I 型樑加一台吊車，在遊戲裡被不等比拉寬到橫跨整修庫，鋼索是另外畫的一根圓柱。
# 新的：照整修庫的跨度（59）建的樑、兩端的行走台車、吊車沿著樑走、吊鉤升降；鋼索兩頭各跟一根骨頭，放下去會被拉長。
#   參數 trolley＝吊車在樑上的位置（公尺，−TRAV～TRAV）；hook＝吊鉤放下多少（公尺，0～DROP）
#   blender -b --factory-startup --python build_crane.py -- [--no-bake] [--no-export] [--compare]
# 座標：原點在樑頂面的中心；x 沿著樑、y 上、z 是整台天車行走的方向。
#
# 零件表
#   Root   ：Girder 主樑（上下翼板、腹板、加勁肋）、End_Trucks 兩端的行走台車與輪子、Festoon 掛電纜的滑軌與一串電纜
#   Trolley：Hoist 吊車（夾住下翼板的側板與輪子、機箱、馬達、減速箱）、Cable 鋼索（下端跟 Hook）
#   Hook   ：Hook_Block 滑輪座與吊鉤
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

BAY = '--bay' in ARGS                                   # 戰艦庫的版本：跨度短（機庫內寬 38，兩邊的桁架柱之間 35）→ 整備庫_50_天車_戰艦庫
SPAN, TRAV, DROP, HK0 = (35.0, 14.0, 12.0, 4.2) if BAY else (59.0, 26.0, 26.0, 4.2)      # 樑長、吊車行程、吊鉤行程、吊鉤滑輪座在靜止時比樑頂低多少
NR = int((SPAN / 2 - 1.0) / 3.0)                        # 加勁肋每 3 公尺一片
DEPTH = 1.6                                             # 樑高


def fk(ang):
    W = {'Root': I4.copy()}
    W['Trolley'] = Tm(ang['trolley'], 0, 0)
    W['Hook'] = W['Trolley'] @ Tm(0, -HK0 - ang['hook'], 0)
    return W


M = Machine('crane_bay' if BAY else 'crane', '整備庫_50_天車_戰艦庫' if BAY else '整備庫_26_天車', [('trolley', '吊車位置', -TRAV, TRAV, 0.0), ('hook', '吊鉤下放', 0.0, DROP, 0.0)],
            dict(Root=None, Trolley='Root', Hook='Trolley'), fk, dict(trolley=['Trolley'], hook=['Hook']), tex=2048)
h = SPAN / 2

# ---- 主樑 ----
P = Pal()
box(P['white'], -h, h, -0.12, 0.0, -0.6, 0.6)
box(P['white'], -h, h, -DEPTH + 0.12, -0.12, -0.06, 0.06)
box(P['white'], -h, h, -DEPTH, -DEPTH + 0.12, -0.5, 0.5)
for i in range(-NR, NR + 1):                            # 加勁肋（只在腹板上半，下翼板留給吊車的輪子）
    for s in (1, -1):
        box(P['steel'], i * 3.0 - 0.03, i * 3.0 + 0.03, -0.9, -0.12, min(s * 0.06, s * 0.56), max(s * 0.06, s * 0.56))
for s in (1, -1):
    box(P['navy'], -h + 1.5, h - 1.5, -0.105, -0.015, min(s * 0.6, s * 0.612), max(s * 0.6, s * 0.612))
    for x0 in (-h + 2.0, 6.0):                          # 兩段燈條
        box(P['glow'], x0, x0 + h - 8.0, -0.075, -0.045, min(s * 0.612, s * 0.62), max(s * 0.612, s * 0.62))
M.part('Girder', 'Root', P)
P = Pal()
for s in (1, -1):
    x0, x1 = min(s * (h - 0.9), s * (h + 0.1)), max(s * (h - 0.9), s * (h + 0.1))
    box(P['navy'], x0, x1, -1.3, 0.35, -2.4, 2.4)
    box(P['hazard'], min(s * (h + 0.1), s * (h + 0.112)), max(s * (h + 0.1), s * (h + 0.112)), -1.2, 0.25, -2.3, 2.3)
    for z in (-1.8, 1.8):
        cylX(P['steel'], x0 - 0.06, x1 + 0.02, 0.35, z, 0.42, None, 24)
        cylX(P['navy'], x0 - 0.3, x0 - 0.06, 0.35, z, 0.2, None, 16)       # 行走馬達
    box(P['rubber'], x0 + 0.2, x1 - 0.2, -0.6, 0.0, -2.56, -2.4)           # 緩衝塊
    box(P['rubber'], x0 + 0.2, x1 - 0.2, -0.6, 0.0, 2.4, 2.56)
M.part('End_Trucks', 'Root', P)
P = Pal()
box(P['steel'], -h + 1.2, h - 1.2, -0.3, -0.2, 0.92, 1.0)                  # 電纜滑軌
for i in range(-NR, NR + 1):
    box(P['steel'], i * 3.0 - 0.04, i * 3.0 + 0.04, -0.2, -0.12, 0.6, 1.0)
for i in range(int((h - 4.7) / 2.7)):                   # 一串垂下來的電纜（收在右半邊）
    x = 3.5 + i * 2.7
    box(P['steel'], x - 0.06, x + 0.06, -0.42, -0.3, 0.9, 1.02)
    hose(P['rubber'], [V(x, -0.42, 0.96), V(x + 0.35, -1.2, 0.96), V(x + 1.35, -1.45, 0.96), V(x + 2.35, -1.2, 0.96), V(x + 2.7, -0.42, 0.96)], 0.04, 6)
M.part('Festoon', 'Root', P)

# ---- 吊車：掛在下翼板上 ----
P = Pal()
for s in (1, -1):
    z0, z1 = min(s * 0.56, s * 0.66), max(s * 0.56, s * 0.66)
    box(P['steel'], -1.0, 1.0, -2.0, -1.05, z0, z1)                        # 側板（在下翼板外側）
    for x in (-0.7, 0.7):                                                  # 輪子：壓在下翼板的上表面
        cylZ(P['steel'], x, -DEPTH + 0.12 + 0.212, min(s * 0.14, s * 0.46), max(s * 0.14, s * 0.46), 0.2, 20)
        cylZ(P['chrome'], x, -DEPTH + 0.12 + 0.212, min(s * 0.46, s * 0.56), max(s * 0.46, s * 0.56), 0.06, 10)
box(P['white'], -1.15, 1.15, -2.9, -1.95, -0.62, 0.62)                     # 機箱
box(P['navy'], -0.8, 0.8, -2.75, -2.1, 0.62, 0.634)
box(P['glow'], -0.6, 0.6, -2.3, -2.26, 0.634, 0.642)
box(P['hazard'], -1.15, 1.15, -2.9, -2.72, -0.632, -0.62)
cylX(P['navy'], 1.15, 1.85, -2.42, 0.0, 0.34, None, 24)                    # 馬達
for x in (1.3, 1.45, 1.6):
    cylX(P['steel'], x, x + 0.03, -2.42, 0.0, 0.36, None, 24)
box(P['steel'], -1.6, -1.15, -2.8, -2.05, -0.4, 0.4)                       # 減速箱
cylX(P['steel'], -0.5, 0.5, -3.0, 0.0, 0.2, None, 20)                      # 捲筒露在機箱下面的一截
M.part('Hoist', 'Trolley', P)
P = Pal()
for x in (-0.22, 0.22):                                                    # 兩股鋼索：上端在捲筒、下端在滑輪座
    cylY(P['steel'], x, 0.0, -HK0 + 0.3, -3.0, 0.035, None, 8)
M.part('Cable', 'Trolley', P, False, split=('Hook', lambda co: co.y < -3.4))

# ---- 吊鉤（原點在滑輪的軸）----
P = Pal()
for s in (1, -1):
    plate(P['yellow'], [(-0.42, 0.3), (0.42, 0.3), (0.42, -0.3), (0.2, -0.6), (-0.2, -0.6), (-0.42, -0.3)], min(s * 0.1, s * 0.17), max(s * 0.1, s * 0.17))
    box(P['hazard'], -0.36, 0.36, -0.22, 0.22, min(s * 0.17, s * 0.18), max(s * 0.17, s * 0.18))
cylZ(P['steel'], 0, 0, -0.09, 0.09, 0.3, 24)                               # 滑輪
cylZ(P['chrome'], 0, 0, -0.2, 0.2, 0.06, 12)
cylY(P['steel'], 0, 0, -0.85, -0.55, 0.12, None, 12)                       # 吊鉤的頸
hose(P['steel'], [V(0, -0.85, 0), V(0, -1.2, 0), V(0.42, -1.55, 0), V(0.1, -2.0, 0), V(-0.42, -1.75, 0), V(-0.46, -1.4, 0)], 0.1, 10)
M.part('Hook_Block', 'Hook', P)

if '--no-check' not in ARGS:
    M.check(extra=[dict(trolley=t, hook=d) for t in (-TRAV, 0, TRAV) for d in (0, DROP)])
# 遊戲要的數字：樑長、吊鉤掛東西的那一點在靜止時比樑頂低多少（放下 hook 公尺就再低那麼多）
M.finish(dict(span=SPAN, travel=TRAV, drop=DROP, hook_y=-(HK0 + 1.9), depth=DEPTH))
if '--compare' in ARGS:
    M.compare('02_天車', 120, [dict(trolley=0, hook=0), dict(trolley=-18, hook=12)], old_off=(0, -15.94, 0), dist=0.55, floor=-30.5)
if M.checkres and not M.checkres['pass']:
    sys.exit(1)
