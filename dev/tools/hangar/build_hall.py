# 整座機庫（照使用者給的戰艦庫設計圖，2026-11-19）。取代 capbay.js 的 cbBuildHangar 用方塊蓋的機庫。
# 設計圖的重點：外牆白色、上緣斜切到屋頂（斷面是八角形的上半），腰部一條深藍帶子；正面一圈厚門框，左邊門柱有深藍盾牌與 V 字徽；
# 屋頂中間是一大片從後面掀起來的艙蓋（中間深藍條加 V 字徽），兩支液壓桿撐著；屋頂兩側有白色的設備箱；裡面是深色的牆、桁架柱、橫管，
# 右牆有一條架高的走道（欄杆、樓梯、控制台），後牆右上有管制室的窗；地上有兩條軌道、白框、黃線、警示斜紋、V 字標誌；機庫坐在一塊大底板上。
# 分成四個檔（各烘一組貼圖）：殼 shell、內部設備 fit、地板 floor、屋頂艙蓋 hatch（有骨架：參數 hatch＝掀開的角度）。
#   blender -b --factory-startup --python build_hall.py -- [--refit] [--only shell,fit,floor,hatch] [--no-bake] [--no-export]
#   預設是戰艦庫的尺寸（半寬 19、z −30～16、高 22）；--refit 是整修庫（半寬 30、z −48～22、高 32）
# 座標跟 capbay.js 一樣：x 左右、y 上、z 前後（正面開口在 +z）；地面 y＝0，機庫的地板在 y＝0.6。
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hgkit import *

REFIT = '--refit' in ARGS
ONLY = ARGS[ARGS.index('--only') + 1].split(',') if '--only' in ARGS else ['shell', 'fit', 'floor', 'hatch']
HW, Z0, Z1, HH = (30.0, -48.0, 22.0, 32.0) if REFIT else (19.0, -30.0, 16.0, 22.0)
TAG, NUM = ('整修庫', 46) if REFIT else ('戰艦庫', 42)
T, Y0 = 3.0, 0.6
L, ZC = Z1 - Z0, (Z0 + Z1) / 2
YW, YR = Y0 + HH * 0.80, Y0 + HH            # 內牆直的部分到哪、內部最高處
YT = YR + 2.6                               # 屋頂頂面
CI = 0.6 if REFIT else HH * 0.22            # 內側斜切的水平寬（整修庫裡有橫跨整個寬度的天車，裡面不能斜切）
XO, CO = HW + T, 4.0                        # 外牆的 x、外側斜切的大小
XH = HW - CI - 1.2                          # 屋頂開口的半寬
ZP = Z1 - 2.0                               # 側牆到這裡，前面是門框
HZ, HLEN = Z0 + 10.0, L - 18.0              # 艙蓋的鉸鏈在 z＝HZ，開口長 HLEN
XP, YP, CP = XO + 2.0, YT + 1.4, CO + 1.5   # 門框的外形
BAND = (Y0 + HH * 0.27, Y0 + HH * 0.37)     # 深藍腰帶


def mx(pts, s):
    return pts if s > 0 else [(-x, y) for x, y in reversed(pts)]


def bx(P, s, x0, x1, y0, y1, z0, z1):
    box(P, min(s * x0, s * x1), max(s * x0, s * x1), y0, y1, z0, z1)


def chevrons(bm, cx, y0, n, w, z0, z1, M=None, step=1.5):
    """n 道 V 字（尖端朝下），畫在 xy 平面。"""
    for i in range(n):
        y = y0 + i * step
        plate(bm, [(cx, y), (cx + w, y + w * 0.75), (cx + w, y + w * 0.75 + 0.7), (cx, y + 0.7), (cx - w, y + w * 0.75 + 0.7), (cx - w, y + w * 0.75)], z0, z1, M)


# ==============================================================================================
# 殼：兩道側牆（含斜切與屋頂邊）、後牆、前後兩段固定的屋頂、正面門框、外牆的腰帶與接縫、屋頂的設備箱
# ==============================================================================================
if 'shell' in ONLY:
    M = Machine('hall_shell_' + ('refit' if REFIT else 'bay'), '整備庫_%d_%s_殼' % (NUM, TAG), tex=4096, bevel=3.0)
    P = Pal()
    for s in (1, -1):
        # 裡面那一層是深色的內襯（0.1 厚），外面是白色的牆體
        plate(P['dark'], mx([(HW, Y0), (HW + 0.1, Y0), (HW + 0.1, YW + 0.04), (HW, YW)], s), Z0, ZP)
        plate(P['dark'], mx([(HW, YW), (HW + 0.1, YW + 0.04), (HW - CI + 0.04, YR + 0.1), (HW - CI, YR)], s), Z0, ZP)
        plate(P['dark'], mx([(HW - CI, YR), (HW - CI + 0.04, YR + 0.1), (XH, YR + 0.1), (XH, YR)], s), Z0, ZP)
        plate(P['white'], mx([(HW + 0.1, Y0), (XO, Y0), (XO, YT - CO), (HW + 0.1, YW + 0.04)], s), Z0, ZP)
        plate(P['white'], mx([(HW + 0.1, YW + 0.04), (XO, YT - CO), (XO - CO, YT), (HW - CI + 0.04, YR + 0.1)], s), Z0, ZP)
        plate(P['white'], mx([(HW - CI + 0.04, YR + 0.1), (XO - CO, YT), (XH, YT), (XH, YR + 0.1)], s), Z0, ZP)
        bx(P['navy'], s, XO, XO + 0.22, BAND[0], BAND[1], Z0 - T, ZP)                    # 外牆的深藍腰帶
        z = Z0 + 4.0
        while z < ZP - 2:                                                               # 外牆的接縫條、斜面上的接縫
            bx(P['steel'], s, XO, XO + 0.07, Y0, YT - CO, z, z + 0.22)
            z += 8.0
        for zb in (Z0 + L * 0.3, Z0 + L * 0.62):                                        # 屋頂兩側的設備箱
            bx(P['white'], s, XH + 0.7, XO - CO - 0.5, YT, YT + 1.7, zb, zb + L * 0.16)
            bx(P['navy'], s, XH + 0.7, XH + 0.74, YT + 0.3, YT + 1.3, zb + 0.5, zb + L * 0.16 - 0.5)
            for i in range(4):
                bx(P['steel'], s, XH + 1.2, XO - CO - 1.0, YT + 1.7, YT + 1.76, zb + 0.6 + i * 1.2, zb + 1.2 + i * 1.2)
    DZ, DY = Z1 - 14.0, 8.6                                                             # 右牆的門：管制塔的上層平台接到這裡（塔的位置在 capbay.js 的 CB_PROP_SET）
    box(P['navy'], XO, XO + 0.28, DY, DY + 3.2, DZ - 1.0, DZ + 1.0)
    box(P['steel'], XO + 0.28, XO + 0.32, DY, DY + 2.9, DZ - 0.8, DZ + 0.8)
    box(P['glow'], XO + 0.28, XO + 0.3, DY + 3.3, DY + 3.42, DZ - 0.9, DZ + 0.9)
    box(P['steel'], XO, XO + 0.45, DY - 0.2, DY, DZ - 2.0, DZ + 2.0)                    # 門檻
    M.part('Side_Walls', 'Root', P)
    P = Pal()
    OUT = [(-XO, Y0), (XO, Y0), (XO, YT - CO), (XO - CO, YT), (-(XO - CO), YT), (-XO, YT - CO)]
    INN = [(-HW, Y0), (HW, Y0), (HW, YW), (HW - CI, YR), (-(HW - CI), YR), (-HW, YW)]
    plate(P['white'], OUT, Z0 - T, Z0 - 0.1)
    plate(P['dark'], INN, Z0 - 0.1, Z0)
    box(P['navy'], -XO, XO, BAND[0], BAND[1], Z0 - T - 0.22, Z0 - T)
    for x in range(int(-XO) + 4, int(XO), 8):
        box(P['steel'], x, x + 0.22, Y0, YT - CO, Z0 - T - 0.07, Z0 - T)
    M.part('Back_Wall', 'Root', P)
    P = Pal()
    for za, zb in ((Z0, HZ), (HZ + HLEN, ZP)):                                          # 開口前後兩段固定的屋頂
        box(P['white'], -XH, XH, YR + 0.1, YT, za, zb)
        box(P['dark'], -XH, XH, YR, YR + 0.1, za, zb)
    box(P['steel'], -XH, XH, YT, YT + 0.5, HZ - 1.2, HZ - 0.2)                          # 鉸鏈座
    M.part('Roof_Fixed', 'Root', P)
    P = Pal()
    for s in (1, -1):                                                                   # 正面門框：兩根柱子與斜角
        plate(P['white'], mx([(HW, Y0), (XP, Y0), (XP, YP - CP), (HW, YW)], s), ZP, Z1 + 2)
        plate(P['white'], mx([(HW, YW), (XP, YP - CP), (XP - CP, YP), (HW - CI, YR)], s), ZP, Z1 + 2)
        bx(P['navy'], s, HW + 1.7, HW + 3.6, Y0 + 1.0, YW - 0.6, Z1 + 2, Z1 + 2.06)     # 柱子正面的深藍直條
        bx(P['navy'], s, XP, XP + 0.2, BAND[0], BAND[1], ZP, Z1 + 2)
        bx(P['glow'], s, HW + 0.2, HW + 0.42, Y0 + 1.4, Y0 + 5.4, Z1 + 2.38, Z1 + 2.41)   # 門邊的藍燈（在鋼框上）
        bx(P['hazard'], s, HW, XP, Y0, Y0 + 0.9, Z1 + 2.06, Z1 + 2.08)
    plate(P['white'], [(HW - CI, YR), (XP - CP, YP), (-(XP - CP), YP), (-(HW - CI), YR)], ZP, Z1 + 2)       # 門楣
    box(P['navy'], -(HW - CI) + 1.0, (HW - CI) - 1.0, YR + 1.8, YR + 2.7, Z1 + 2, Z1 + 2.06)
    box(P['glow'], -(HW - CI) * 0.5, (HW - CI) * 0.5, YR + 2.18, YR + 2.32, Z1 + 2.06, Z1 + 2.08)

    def ring(col, d0, d1, zf):                                                          # 沿著開口邊緣的一圈框（d＝離開口邊緣多遠，zf＝凸出到哪）
        def off(d):
            return [(HW + d, Y0), (HW + d, YW + d * 0.41), (HW - CI + d * 0.41, YR + d), (-(HW - CI) - d * 0.41, YR + d), (-HW - d, YW + d * 0.41), (-HW - d, Y0)]
        a, b = off(d0), off(d1)
        for i in range(5):
            plate(P[col], [a[i], b[i], b[i + 1], a[i + 1]], Z1 + 2, zf)
    ring('steel', -0.02, 0.62, Z1 + 2.38)                                               # 設計圖：開口有兩層框，裡面一層鋼框凸出來，外面一層深色
    ring('dark', 0.62, 1.2, Z1 + 2.18)
    # 左邊門柱的盾牌與 V 字徽
    sy = Y0 + HH * 0.42
    plate(P['navy'], [(-HW - 4.6, sy), (-HW - 0.9, sy), (-HW - 0.9, sy + 5.2), (-HW - 2.75, sy + 6.6), (-HW - 4.6, sy + 5.2)], Z1 + 2, Z1 + 2.1)
    chevrons(P['white'], -HW - 2.75, sy + 0.9, 3, 1.3, Z1 + 2.1, Z1 + 2.16, None, 1.35)
    box(P['navy'], -XP - 0.12, -XP, BAND[1], YP - CP, ZP, Z1 + 2)                       # 設計圖：左邊門柱的側面上半和斜角是深藍色
    plate(P['navy'], [(-(XP - CP), YP), (-(XP - CP) - 0.085, YP + 0.085), (-XP - 0.085, YP - CP + 0.085), (-XP, YP - CP)], ZP, Z1 + 2)
    M.part('Portal', 'Root', P)
    M.finish(dict(hw=HW, z0=Z0, z1=Z1, h=HH, hatch_hinge=[0, YT, HZ], opening=[2 * XH, HLEN]))

# ==============================================================================================
# 內部設備：兩側的桁架柱、橫管、右牆的走道（欄杆、支柱、樓梯、控制台）、後牆的管制室窗與管線、屋頂下的燈條
# ==============================================================================================
if 'fit' in ONLY:
    M = Machine('hall_fit_' + ('refit' if REFIT else 'bay'), '整備庫_%d_%s_內部' % (NUM + 1, TAG), tex=2048, bevel=1.5)
    P = Pal()
    TZ = []
    z = Z0 + 5.0
    while z < ZP - 3:
        TZ.append(z)
        z += 8.0
    for s in (1, -1):
        for z in TZ:                                                                    # 桁架柱：貼牆兩根、內側兩根，中間斜撐；上段沿著斜面
            for dz in (-0.55, 0.55):
                beam(P['steel'], V(s * (HW - 0.14), Y0, z + dz), V(s * (HW - 0.14), YW, z + dz), 0.26)
                beam(P['steel'], V(s * (HW - 1.25), Y0, z + dz), V(s * (HW - 1.25), YW - 0.55, z + dz), 0.2)
                if REFIT:                                                               # 整修庫：柱子只到天車下面，頂上收一根橫桿
                    beam(P['steel'], V(s * (HW - 1.25), YW - 0.55, z + dz), V(s * (HW - 0.14), YW, z + dz), 0.2)
                else:
                    beam(P['steel'], V(s * (HW - 0.14), YW, z + dz), V(s * (HW - CI + 0.1), YR - 0.14, z + dz), 0.26)
                    beam(P['steel'], V(s * (HW - 1.25), YW - 0.55, z + dz), V(s * (HW - CI - 0.35), YR - 1.15, z + dz), 0.2)
                y, k = Y0 + 0.4, 0
                while y < YW - 2.4:                                                     # 斜撐（之字形）
                    a, b = (HW - 0.14, HW - 1.25) if k % 2 == 0 else (HW - 1.25, HW - 0.14)
                    beam(P['steel'], V(s * a, y, z + dz), V(s * b, y + 2.0, z + dz), 0.1)
                    y += 2.0
                    k += 1
            box(P['steel'], min(s * (HW - 1.45), s * (HW)), max(s * (HW - 1.45), s * HW), Y0, Y0 + 0.2, z - 0.85, z + 0.85)      # 柱腳
            bx(P['lamp'], s, HW - 1.36, HW - 1.33, YW - 5.0, YW - 2.0, z - 0.25, z + 0.25)                                  # 柱上的燈
        for y, r, col in ((Y0 + HH * 0.44, 0.24, 'white'), (Y0 + HH * 0.49, 0.16, 'navy'), (Y0 + HH * 0.66, 0.2, 'white')):   # 橫管
            cylZ(P[col], s * (HW - 0.6), y, Z0 + 0.1, ZP - 0.4, r, 12)
    M.part('Trusses', 'Root', P)
    P = Pal()
    MY, MX0, MZ1 = Y0 + HH * 0.3, HW - 4.4, ZP - 9.0                                    # 右牆的走道（整修庫的牆邊已經擺滿設備，不放）
    box(P['steel'], MX0, HW - 1.5, MY - 0.2, MY, Z0 + 0.1, MZ1 if not REFIT else Z0 + 0.2)
    beam(P['white'], V(MX0 + 0.1, MY - 0.38, Z0 + 0.1), V(MX0 + 0.1, MY - 0.38, MZ1), 0.2, 0.4)
    box(P['hazard'], MX0 - 0.012, MX0, MY - 0.56, MY, Z0 + 0.1, MZ1)
    for z in TZ:
        if z < MZ1:
            beam(P['steel'], V(MX0 + 0.2, Y0, z), V(MX0 + 0.2, MY - 0.4, z), 0.24)
            beam(P['steel'], V(MX0 + 0.2, MY - 2.2, z), V(HW - 1.4, MY - 0.4, z), 0.12)
    rz = [Z0 + 0.3 + i * (MZ1 - Z0 - 0.4) / 8 for i in range(9)]
    railing(P['steel'], [V(MX0 + 0.08, MY, z) for z in rz], 1.15, 0.045)
    for x in (MX0 + 0.3, MX0 + 2.5):                                                    # 樓梯：從走道前端往下到地面
        beam(P['white'], V(x, MY - 0.2, MZ1), V(x, Y0 + 0.1, MZ1 + (MY - Y0) * 1.05), 0.12, 0.34)
        railing(P['steel'], [V(x, MY - (MY - Y0) * t, MZ1 + (MY - Y0) * 1.05 * t) for t in (0.0, 0.33, 0.66, 1.0)], 1.1, 0.04)
    NS = int((MY - Y0) / 0.42)
    for i in range(NS):
        t = (i + 1) / (NS + 1)
        box(P['steel'], MX0 + 0.3, MX0 + 2.5, MY - (MY - Y0) * t - 0.05, MY - (MY - Y0) * t, MZ1 + (MY - Y0) * 1.05 * t - 0.17, MZ1 + (MY - Y0) * 1.05 * t + 0.17)
    for zc in (ZC - 5.0, ZC - 1.8):                                                     # 控制台
        box(P['navy'], HW - 2.7, HW - 1.6, MY, MY + 1.1, zc - 1.1, zc + 1.1)
        plate(P['navy'], [(HW - 2.7, MY + 1.1), (HW - 1.6, MY + 1.1), (HW - 1.6, MY + 2.0), (HW - 2.2, MY + 2.0)], zc - 1.1, zc + 1.1)
        Mg = Tm(HW - 2.7, MY + 1.1, zc) @ Rz(atan2(0.9, 0.5))
        box(P['glow'], 0.1, 0.9, 0.0, 0.03, -0.9, 0.9, Mg)
    if not REFIT:
        M.part('Mezzanine', 'Root', P)
    P = Pal()
    WX0, WX1, WY0, WY1 = 3.0, HW - 2.2, Y0 + HH * 0.52, Y0 + HH * 0.72                  # 後牆右上的管制室窗
    box(P['steel'], WX0 - 0.3, WX1 + 0.3, WY0 - 0.3, WY1 + 0.3, Z0, Z0 + 0.35)
    box(P['navy'], WX0, WX1, WY0, WY1, Z0 + 0.35, Z0 + 0.38)
    for i in range(4):
        x = WX0 + 0.6 + i * (WX1 - WX0 - 1.2) / 3
        box(P['glow'], x - 0.7, x + 0.7, WY0 + 0.5, WY0 + 1.3, Z0 + 0.38, Z0 + 0.4)     # 窗裡的螢幕
        box(P['steel'], x - 1.25, x - 1.15, WY0, WY1, Z0 + 0.38, Z0 + 0.44)
    if not REFIT:
        box(P['steel'], MX0, HW - 0.1, MY - 0.2, MY, Z0 + 0.1, Z0 + 2.6)                # 走道接到後牆
        box(P['navy'], -HW + 3.0, -HW + 9.0, Y0, Y0 + HH * 0.16, Z0 + 0.1, Z0 + 1.6)    # 後牆的機櫃
        for i in range(3):
            box(P['glow'], -HW + 3.5 + i * 2.0, -HW + 4.6 + i * 2.0, Y0 + HH * 0.1, Y0 + HH * 0.1 + 0.12, Z0 + 1.6, Z0 + 1.62)
    for y, r in ((Y0 + HH * 0.2, 0.3), (Y0 + HH * 0.26, 0.2), (Y0 + HH * 0.6, 0.26)):   # 後牆左半的管線
        cylX(P['white'], -HW + 0.2, 1.5, y, Z0 + 0.5, r, None, 12)
    for za, zb in ((Z0 + 2.0, HZ - 1.0), (HZ + HLEN + 0.8, ZP - 0.8)):                  # 固定屋頂下面的燈條
        box(P['lamp'], -XH * 0.8, XH * 0.8, YR - 0.3, YR - 0.2, (za + zb) / 2 - 0.4, (za + zb) / 2 + 0.4)
        box(P['steel'], -XH * 0.85, XH * 0.85, YR - 0.2, YR, (za + zb) / 2 - 0.6, (za + zb) / 2 + 0.6)
    M.part('Back_Fit', 'Root', P)
    if not REFIT:                                                                       # 設計圖：左牆有一座武器架工作站（門形架、工作台上一門拆下來的砲）
        P = Pal()
        SY, SZ = Y0, ZC + 0.5
        for z0, z1 in ((SZ - 3.6, SZ - 2.8), (SZ + 2.8, SZ + 3.6)):
            box(P['white'], -HW + 1.7, -HW + 2.8, SY, SY + 9.0, z0, z1)
            box(P['navy'], -HW + 2.8, -HW + 2.83, SY + 1.0, SY + 8.0, z0 + 0.2, z1 - 0.2)
            box(P['hazard'], -HW + 2.8, -HW + 2.812, SY, SY + 0.8, z0, z1)
            box(P['glow'], -HW + 3.4, -HW + 3.42, SY + 9.45, SY + 9.95, z0 - 0.1, z1 + 0.1)        # 橫樑兩頭的藍燈
        box(P['white'], -HW + 1.5, -HW + 3.4, SY + 9.0, SY + 10.4, SZ - 3.8, SZ + 3.8)  # 橫樑
        box(P['navy'], -HW + 3.4, -HW + 3.43, SY + 9.3, SY + 10.1, SZ - 2.2, SZ + 2.2)
        box(P['steel'], -HW + 1.6, -HW + 4.6, SY + 3.6, SY + 3.9, SZ - 2.7, SZ + 2.7)   # 工作台
        for z in (SZ - 2.5, SZ + 2.5):
            beam(P['steel'], V(-HW + 4.4, SY, z), V(-HW + 4.4, SY + 3.6, z), 0.22)
            beam(P['steel'], V(-HW + 4.4, SY + 2.0, z), V(-HW + 2.8, SY + 3.6, z), 0.12)
        box(P['navy'], -HW + 2.3, -HW + 3.9, SY + 3.9, SY + 5.1, SZ - 2.2, SZ - 0.4)    # 砲身
        box(P['white'], -HW + 2.5, -HW + 3.7, SY + 5.1, SY + 5.4, SZ - 2.0, SZ - 0.8)
        for x in (-HW + 2.75, -HW + 3.45):
            cylZ(P['steel'], x, SY + 4.55, SZ - 0.4, SZ + 2.5, 0.17, 14)
            cylZ(P['steel'], x, SY + 4.55, SZ + 2.2, SZ + 2.6, 0.23, 14)
        box(P['steel'], -HW + 2.4, -HW + 3.8, SY + 3.9, SY + 4.3, SZ + 0.6, SZ + 1.0)   # 砲管的托座
        box(P['steel'], -HW + 1.6, -HW + 4.2, SY + 1.2, SY + 1.4, SZ - 2.6, SZ + 2.6)   # 下層的架子與料箱
        for z in (SZ - 1.8, SZ - 0.3, SZ + 1.2):
            box(P['yellow'], -HW + 2.0, -HW + 3.8, SY + 1.4, SY + 2.3, z, z + 1.1)
        M.part('Weapon_Station', 'Root', P)
    M.finish(dict(mezzanine=[MX0, MY, MZ1]))

# ==============================================================================================
# 地板：大底板（地面）、機庫與停機坪的平台、機庫裡的深色地板與白框、兩條軌道、黃線、警示斜紋、V 字標誌
# ==============================================================================================
if 'floor' in ONLY:
    M = Machine('hall_floor_' + ('refit' if REFIT else 'bay'), '整備庫_%d_%s_地板' % (NUM + 2, TAG), tex=4096, bevel=2.0)
    GX, GZ0, GZ1 = HW + (8.0 if REFIT else 18.0), Z0 - 9.0, Z1 + 26.0                   # 大底板：戰艦庫 37、整修庫 38，加起來不超過機庫間距 76
    GY = 0.05                                                                           # 頂面比場地的水泥地高一點點（不然兩個面疊在一起會閃）
    PXW, PZ0, PZ1 = HW + 6.0, Z0 - T - 1.0, Z1 + 20.0                                   # 平台（跟現在的一樣大）
    P = Pal()
    c = 3.0
    plate(P['dark'], [(-GX + c, -GZ1), (GX - c, -GZ1), (GX, -GZ1 + c), (GX, -GZ0 - c), (GX - c, -GZ0), (-GX + c, -GZ0), (-GX, -GZ0 - c), (-GX, -GZ1 + c)], -0.3, GY, Rx(-pi / 2))
    for s in (1, -1):                                                                   # 底板邊緣的白邊
        bx(P['white'], s, GX - 0.9, GX - 0.3, GY, GY + 0.04, GZ0 + c, GZ1 - c)
    for z in (GZ0 + 0.3, GZ1 - 0.9):
        box(P['white'], -GX + c, GX - c, GY, GY + 0.04, z, z + 0.6)
    M.part('Ground', 'Root', P)
    P = Pal()
    box(P['steel'], -PXW, PXW, 0.0, Y0, PZ0, PZ1)
    for s in (1, -1):
        bx(P['white'], s, PXW - 0.5, PXW, Y0, Y0 + 0.05, PZ0, PZ1)
        bx(P['hazard'], s, PXW, PXW + 0.012, 0.05, Y0, Z1 + 2, PZ1)
    box(P['white'], -PXW, PXW, Y0, Y0 + 0.05, PZ1 - 0.5, PZ1)
    box(P['hazard'], -PXW, PXW, 0.05, Y0, PZ1, PZ1 + 0.012)
    x = -PXW + 4.0
    while x < PXW - 1:                                                                  # 停機坪的板縫
        box(P['dark'], x, x + 0.08, Y0, Y0 + 0.012, Z1 + 2.2, PZ1 - 0.6)
        x += 6.0
    z = Z1 + 6.0
    while z < PZ1 - 1:
        box(P['dark'], -PXW + 0.6, PXW - 0.6, Y0, Y0 + 0.012, z, z + 0.08)
        z += 6.0
    M.part('Platform', 'Root', P)
    P = Pal()
    box(P['dark'], -HW, HW, Y0, Y0 + 0.03, Z0, Z1 + 2.0)                                # 機庫裡的深色地板
    fw, fz0, fz1 = HW * 0.62, Z0 + 5.0, Z1 - 3.0                                        # 停船位的白框
    for s in (1, -1):
        bx(P['white'], s, fw - 0.25, fw, Y0 + 0.03, Y0 + 0.045, fz0, fz1)
        for xr in (HW * 0.17,):                                                         # 軌道（托架走這裡）
            bx(P['steel'], s, xr - 0.16, xr + 0.16, Y0 + 0.03, Y0 + 0.2, Z0 + 3.0, Z1 + 8.0)
            bx(P['steel'], s, xr - 0.4, xr + 0.4, Y0 + 0.03, Y0 + 0.07, Z0 + 3.0, Z1 + 8.0)
        for i in range(5):                                                              # 門口兩側的警示斜紋
            plate(P['yellow'], [(s * (HW - 6.0 + i * 1.1), -(Z1 + 3.2)), (s * (HW - 5.3 + i * 1.1), -(Z1 + 3.2)), (s * (HW - 4.5 + i * 1.1), -(Z1 + 1.4)), (s * (HW - 5.2 + i * 1.1), -(Z1 + 1.4))][::s],
                  Y0 + 0.03, Y0 + 0.045, Rx(-pi / 2))
    for z in (fz0, fz1 - 0.25):
        box(P['white'], -fw, fw, Y0 + 0.03, Y0 + 0.045, z, z + 0.25)
    box(P['yellow'], -HW + 0.5, HW - 0.5, Y0 + 0.03, Y0 + 0.045, Z1 + 0.4, Z1 + 0.7)    # 門口的黃線
    ax, az0, az1 = HW * 0.74, Z1 + 5.0, Z1 + 17.0                                       # 停機坪的黃框
    for s in (1, -1):
        bx(P['yellow'], s, ax - 0.22, ax, Y0 + 0.012, Y0 + 0.03, az0, az1)
    for z in (az0, az1 - 0.22):
        box(P['yellow'], -ax, ax, Y0 + 0.012, Y0 + 0.03, z, z + 0.22)
    chevrons(P['white'], 0.0, -(Z1 + 12.5), 2, 3.2, Y0 + 0.012, Y0 + 0.03, Rx(-pi / 2), 1.6)        # 停機坪的 V 字（尖端朝機庫外）
    M.part('Markings', 'Root', P)
    M.finish(dict(platform=[2 * PXW, PZ0, PZ1], ground=[2 * GX, GZ0, GZ1]))

# ==============================================================================================
# 屋頂艙蓋（有骨架）：鉸鏈在後緣，參數 hatch＝掀開幾度；兩支液壓桿，固定點由程式挑
# ==============================================================================================
if 'hatch' in ONLY:
    AMAX, AREST = 42.0, 36.0                                                            # 設計圖裡艙蓋掀得很高
    XA = XH - 0.9
    ACT, ACTL = {}, {}

    def fk(ang):
        W = {'Root': I4.copy(), 'Hatch': Tm(0, YT, HZ) @ Rx(-ang['hatch'] * D)}          # 局部 +z 沿著艙蓋往前
        for A, n in ((ACT, 'R'), (ACTL, 'L')):
            if A:
                W['Cyl' + n], W['Rod' + n], A['len'] = aim_pair(W, A, (1, 0, 0))
            else:
                W['Cyl' + n], W['Rod' + n] = I4.copy(), W['Hatch'].copy()
        return W

    best = search_actuator('艙蓋', fk, [dict(hatch=AMAX * i / 16) for i in range(17)], 'Root', 'Hatch',
                           [(XA, YR - y, HZ + z) for y in (0.6, 1.4, 2.4, 3.4) for z in (1.0, 2.0, 4.0, 6.0, 8.0)],
                           [(XA, -1.05, z) for z in (HLEN * 0.25, HLEN * 0.3, HLEN * 0.4, HLEN * 0.5, HLEN * 0.6)], clear=1.0, margin=0.9)
    ACT.update(best)
    ACTL.update(dict(best, tp=(-best['tp'][0], best['tp'][1], best['tp'][2]), bp=(-best['bp'][0], best['bp'][1], best['bp'][2])))
    M = Machine('hall_hatch_' + ('refit' if REFIT else 'bay'), '整備庫_%d_%s_艙蓋' % (NUM + 3, TAG), [('hatch', '艙蓋掀開', 0.0, AMAX, AREST)],
                dict(Root=None, Hatch='Root', CylR='Root', RodR='Hatch', CylL='Root', RodL='Hatch'), fk, dict(hatch=['Hatch', 'CylR', 'RodR', 'CylL', 'RodL']), tex=2048, bevel=2.5)
    P = Pal()
    HWD = XH + 0.7
    box(P['white'], -HWD, HWD, 0.06, 1.3, 0.0, HLEN + 0.6)
    box(P['navy'], -HWD * 0.22, HWD * 0.22, 1.3, 1.34, 0.0, HLEN + 0.6)                  # 中間的深藍條
    chevrons(P['white'], 0.0, -(HLEN * 0.62), 2, HWD * 0.16, 1.34, 1.4, Rx(-pi / 2), 1.5)           # 艙蓋上的 V 字
    for i in range(1, 4):                                                               # 板縫
        box(P['steel'], -HWD, HWD, 1.3, 1.33, (HLEN + 0.6) * i / 4 - 0.06, (HLEN + 0.6) * i / 4 + 0.06)
    box(P['dark'], -(XH - 0.3), XH - 0.3, -0.04, 0.06, 0.4, HLEN - 0.4)                  # 底面（深色）
    for x in (-XA, 0.0, XA):                                                            # 底下的縱肋與橫肋
        box(P['steel'], x - 0.2, x + 0.2, -0.75 if x else -0.5, -0.04, 0.6, HLEN - 0.6)
    for i in range(1, 5):
        z = HLEN * i / 5
        box(P['steel'], -(XH - 0.5), XH - 0.5, -0.4, -0.04, z - 0.12, z + 0.12)
    M.part('Hatch_Panel', 'Hatch', P)
    P = Pal()
    for s in (1, -1):                                                                   # 液壓桿在牆上的座
        bx(P['steel'], s, XA - 0.5, XH + 0.05, best['tp'][1] - 0.5, best['tp'][1] + 0.5, best['tp'][2] - 0.6, best['tp'][2] + 0.6)
    M.part('Strut_Mounts', 'Root', P, False)
    P = Pal()
    for s in (1, -1):                                                                   # 液壓桿在艙蓋底下的耳座
        bx(P['steel'], s, XA - 0.45, XA - 0.28, -1.4, -0.04, best['bp'][2] - 0.4, best['bp'][2] + 0.4)
        bx(P['steel'], s, XA + 0.28, XA + 0.45, -1.4, -0.04, best['bp'][2] - 0.4, best['bp'][2] + 0.4)
    M.part('Strut_Lugs', 'Hatch', P, False)
    for A, n in ((ACT, 'R'), (ACTL, 'L')):
        actuator_parts(M, 'Act_Hatch_' + n, A, 0.3, 0.22, 'Cyl' + n, 'Rod' + n)
    if '--no-check' not in ARGS:
        M.check()
    M.finish(dict(hinge=[0, YT, HZ], rest=AREST, max=AMAX))
