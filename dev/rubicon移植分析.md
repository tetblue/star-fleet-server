# rubicon-protocol 動畫／特效／音效 → Star Fleet 移植分析

分析對象：https://github.com/tetblue/rubicon-protocol (commit 5c2b7c4，砲火特效 7.2 期)
日期：2026-11-04

## 0. 總結

| 項目 | rubicon 有什麼 | Star Fleet 現況 | 移植價值 |
|---|---|---|---|
| **音效** | 完整 WebAudio 引擎：取樣＋程序合成、分層武器配方、匯流排／壓縮／限幅、聲部上限、3D 定位、動態 BGM、AI 語音 | **完全沒有聲音**（無 AudioContext、無音檔、無音量設定） | ★★★ 最大缺口，幾乎可整套搬 |
| **特效** | GpuFx：解析式運動的 GPU 粒子（1 draw call／系統），30 個 preset＋編輯器、推進器 JetFx、飛彈煙帶 RibbonFx、黑洞／電漿／光柱 | 已有 GPU ring buffer：fx.webp 序列圖、光束、飛彈、碎片 | ★★ 補「粒子層」：火球＋煙、火花、推進焰、充能、黑洞 |
| **鏡頭手感** | 震動、hitstop、閃白、PointLight 爆閃 | 戰場上沒有震動（只有機庫出擊） | ★★ 小而有感 |
| **動畫** | 程序式：阻尼彈簧＋IK＋關鍵影格 clip；過場運鏡系統 | 武器 rig 在 GPU（_PART/_PIV 轉向、後座、艙門） | ★ 取彈簧後座公式、過場運鏡求值器 |

授權：程式碼 MIT（作者同為 Loren Hsu），可直接用。素材另計，見 §4。

---

## 1. 音效系統（建議優先）

### 1.1 架構（`src/audio/`）
- **synth.js**（326 行，無依賴）：初始化時用純函式算出 Float32Array，再存成 AudioBuffer（key 以 `~` 開頭）。包含 thump（次低頻）、zap（雷射）、emp、whiz（掠過）、jetLoop（可循環推進器）、stinger 等，不需要音檔。
- **recipes.js**（232 行，純資料）：武器音分層
  `near / far / body / mech / low / tail / gap / max / fb`，例：
  ```js
  laser: { near:[['lzA1','lzA2','lzA3'],0.6,1], far:[['lzB1','lzB2'],0.42,0.75],
           body:[['~zapA'],0.35,1], low:[['~thA'],0.35,1.3], tail:0.3, fb:[['laser','laser2'],0.65,1] }
  ```
  另有 `ENV.space`（太空殘響 preset）。
- **audio.js**（1449 行，單例 `SFX`）
  - `play(k, vol, rate, detune, minGap, pos, bus, delay, o)`：每次播放隨機音高 ±6%、音量 ±1.5 dB，輪流選檔且不連續重複同一檔。
  - `shot(kind,id,pos,src)`：依距離在近／遠聲之間交叉淡化；遠聲依音速延遲；對玩家有威脅的音源加權。
  - `explode(big|'huge',pos)`：分四層，並自動壓低其他聲音（ducking）。
  - 另有 `hit / hitShield / ui(kind) / tone() / loopSet / loopAt / ambient`。
  - 匯流排：sfx＋amb → world → 低頻悶音（muffle）→ duck → master → 壓縮器 → 限幅器。UI、語音、BGM 各自獨立。另有用雜訊生成脈衝的 Convolver 殘響，以及雙延遲反射。
  - **聲部上限**：全域 48、單一 key 4，依優先度搶占（12 ms 淡出）。這點對艦隊戰最關鍵，否則上千發光束同時響會爆音。
  - 3D：PannerNode（inverse），再依距離加 lowpass；超出範圍直接剔除。
  - 有獨立 RNG，不碰 `Math.random`，所以重播的決定性不受影響（本專案有 replay，這點很重要）。
- **bgm.js**：explore / alert / combat / boss 四級動態音樂；升級 0.8 s、降級 8 s，交叉淡化。
- **voice.js / data/voice.js**：語音提示，有優先度與冷卻。台詞以文字的 FNV-1a hash 當 key。

### 1.2 素材管線（`scripts/`）
- `sfx-prep.py`（numpy＋imageio-ffmpeg）：從素材包切出單發（onset 偵測）→ 修尾 → 淡入淡出 → 峰值 −1 dBFS → mp3 80 kbps。
- `bgm-prep.py`：依 RMS 能量挑 90–110 s 段落，做 3 s 等功率交叉淡化成可循環，mp3 80 kbps。
- `voice-gen.py`：VoxCPM2 TTS（Apache-2.0，需 CUDA）→ faster-whisper 校稿挑最佳 take → −20 dBFS → 24 kHz 40 kbps。
- 打包：`sfx/` 以 base64 內嵌，其他資料夾產成 `lib/*.js`（`window.RUBICON_SFX2 = {...}`），用 `<script>` 延遲載入，因此 `file://` 也能用。

### 1.3 大小
sfx 1.3 MB（83 檔）＋ sfx2 1.3 MB（113 檔）＋ bgm 9.6 MB ＋ 過場音樂 9.8 MB ＋ 語音 69 MB。
**建議只取 sfx＋sfx2（約 2.6 MB）**，BGM 視需要再挑幾首。語音是機甲劇情專用，不適合直接搬。

### 1.4 移植要改的地方
1. **聽者**：`setListener` 寫死成俯視固定朝向。RTS 鏡頭改用 `setListenerCam(camera)`，或把聽者放在鏡頭注視點。
2. **距離尺度**：`DS=3`、`NEAR_D=30`、`FAR_D=90`、panner 的 ref/max、140·dk 剔除距離，都要依艦隊戰場尺度重調。
3. **聚合**：模擬是固定 tick，hit 會預排在 `pending`，高倍速時一幀會湧進大量事件。需要「每幀、每種武器、每格空間」合併成一次 `shot()`，再交給聲部上限處理。
4. **three 版本**：只有 `setListenerCam` / `netPlay` 用到 `THREE.Vector3`，r160 可直接用。
5. 拿掉 `mirrorCall`（rubicon 的網路同步）。本專案多人連線是重跑模擬，各端自己發聲即可。
6. 設定：在 `SETTINGS`（main.js:5244，並把 key 加進 :5251 的持久化清單）加 `vol / sfx / bgm`；在 settings.js `game` 分頁（:48-67）加滑桿。
7. `SFX.init()` 必須在使用者手勢內呼叫（例如開始戰鬥的按鈕）。
8. 若改用音檔而非 base64 .js：server.js:116 的 MIME 表要加 `.mp3`。

### 1.5 掛勾點（本專案）
| 事件 | 位置 | 對應 SFX |
|---|---|---|
| 艦砲開火 | `fireGun` main.js:2418（光束 2439/2497/2533） | `shot('laser'/'cannon')`，要做聚合 |
| 防空 | `fireAir` main.js:2254 | `shot('gatling')` |
| 飛彈發射 | `launchMissile` :2912、`launchMissileArea` :2965 | `shot('missile')` |
| 艦載機出擊 | `launchFighters` :3128 | `thrBurst` / flyby |
| 命中（集中處） | `processHits` :3541（護盾 :3642、艦體 :3643、攔截 :3557） | `hitShield` / `hit` |
| 擊沉 | `killShip` :2585 | `explode(big)` |
| 地面目標 | ground.js:208 / 638 / 757 / 765 | `explode` / `debrisRain` |
| 王牌飛行員 | pilot.js:813 / 846 / 890 / 896 / 481 | 2D 玩家層：`loopSet` 推進器、`warnA/B` 鎖定 |
| 艦長 | captain.js:670 / 681 / 767 / 795 | 玩家層 |
| 技能 | `useSkill` game.js:216 | `charge` / `stinger` |
| 開戰／結算 | game.js:1181 / 1280 | `cue` / `stinger` |
| 指令 | `sendCmd` main.js:4698 | `ui('ok')` |
| 每幀 | `frame()` main.js:5503 | 更新聽者、loopsAtTick |

---

## 2. 特效系統

### 2.1 GpuFx（`src/fx/gpu.js`，336 行）
- 一個系統等於一個 InstancedBufferGeometry（quad），一次 draw call。粒子只在 spawn 時寫入一次，之後每幀只更新 `uTime`。
- 運動是解析式：`p + v(1-e^{-d·age})/d − ½g·age²`，不需要 GPGPU。
- 模式：`bill`（面向鏡頭）、`stretch`（沿速度拉長，用於火花、曳光）、`ground`（平貼地面）。
- 淡出曲線 0–6；預乘 alpha，可在同一個 draw call 裡混合加法與一般混合（`occ`，0=加法、1=遮擋）。`k>1` 會吃到 bloom。
- Ring buffer 從 1024 起、每次翻倍，上限 32768，只做部分上傳。
- `emit({p,v,life,s0,s1,c0,c1,k,a,occ,cell,fade,g,drag,rot,rv,axis,asp,delay})`

**與本專案的關係**：設計理念和 main.js 的 fxMat／beamMat 相同（GPU ring buffer＋uTime），所以很合得來。差別在於本專案的 fxMat 只播 fx.webp 序列圖，沒有「帶速度、阻力、尺寸與顏色漸變的粒子」。
→ 建議把 GpuFx 當成**第二層粒子**，和 fx.webp 並存：序列圖負責爆炸主體，粒子負責飛濺火花、殘煙、碎光與充能吸入。

### 2.2 其他可直接拿的
| 模組 | 用途 | 適配 Star Fleet |
|---|---|---|
| `presets.js` + `presets.json`（30 個） | 多層發射器資料，`emitPreset(sys,id,pos,{S,color})` | fireball、gather、arc、star、overload、zapSmall、dmgSpark、dmgFire、dmgSmoke、laserGlow |
| `jet.js` JetFx | 白熱核心＋火焰＋馬赫環的推進焰（shader），上限 512 | 3D 艦艇／艦載機／王牌飛行員的引擎尾焰 |
| `trail.js` RibbonFx | 面向鏡頭的彎曲煙帶 | 飛彈尾煙（目前是用 beam 畫的直線段） |
| `atlas.js` | Kenney 粒子包（CC0）的 96 格灰階 atlas，加上程序生成的形狀；載不到圖時可整張程序生成 | 可直接沿用 atlas.png（1 MB），或只用程序生成版（0 KB） |
| `effects.js` 的函式 | explosion（7 層）、plasmaBlast、vortex（黑洞）、pillarStrike（軌道光柱）、muzzle、spark、gather、empBeam、shockwave | 參考層次組合，針對太空改寫（shockwave 要從平貼地面改成 billboard） |
| `library/vfx.js` | preset 即時調參編輯器 | 依附 rubicon 的模型庫舞台，要移植到 modeltool 才能用 |

### 2.3 r128 → r160 要改的 API
- `attr.updateRange.offset/count` → `attr.addUpdateRange(start,count)`（gpu.js:300、batch.js:191、jet.js:162）
- `#include <encodings_fragment>` → `#include <colorspace_fragment>`（gpu.js:140）
- 顏色：r160 預設會做色彩管理，`setHex` 會被當作 sRGB 轉成 linear，亮度可能偏暗，要確認。
- 全域 `window.THREE` 改成 `import * as THREE from 'three'`

### 2.4 鏡頭手感（juice）
- 震動：`camShake` 數值線性衰減，做隨機 XYZ 位移（camera.js:394）
- hitstop：`dt *= 0.25`（game.js:411）。本專案模擬是固定 tick，只建議用在王牌飛行員／艦長模式。
- 閃白與色差：全螢幕 canvas 疊層（juice.js:338-386）
- 爆炸時打一盞短暫 PointLight

艦隊戰建議：只在旗艦被擊沉、大型爆炸、鏡頭夠近時才震動，強度依距離衰減。

---

## 3. 動畫系統

rubicon 的機甲動畫是 CPU 端程序式（每幀改 Object3D），本專案的艦艇與砲塔全在 GPU instanced shader 裡，所以**大多不能直接搬**，取的是概念與小模組：

| 模組 | 內容 | 用法 |
|---|---|---|
| `mech-spring.js`（62 行，無依賴） | 阻尼彈簧 `spring / kick / springSet`，ω/ζ preset | ① CPU 端：艦長／王牌模式的單艦（數量少）直接用。② GPU 端：把彈簧的解析解 `A·e^{-ζωt}·sin(ω_d t)` 寫進 `RIG_HEAD` 的後座，取代線性回位，砲管會有「回彈」感 |
| `mech-fire.js` FIRE 表 | 每種武器的後座衝量 `arm / torso / brace / jit` | 改成 `WEAPON_RIG` 每種砲的 `recoil / hullKick` 參數，大口徑主砲打時艦體輕微後仰 |
| `melee-anim.js` 求值器 | 關鍵影格 `{t, e:ease, p:{joint:[deg]}}`，逐關節軌道，6 種 ease | 艦長模式特殊戰艦的變形、展開、艙門序列 |
| `mech-ik.js` `aimQuat` | 帶權重與角度上限的最短弧瞄準 | 砲塔瞄準限制（射界） |
| `mesh-merge.js` | 剛體零件合併成一個 SkinnedMesh，每個錨點一根骨頭 | 艦長、機庫的多零件模型降低 draw call |
| `cine.js` `cineCamera`（939-1037） | 關鍵影格運鏡：位置／注視點、ease、跟隨、手持晃動、震動、roll、fov；點位可相對於演員 | **雙星記劇情過場**、開戰運鏡。拿掉地形碰撞、DOF、stylePipe 即可獨立使用 |
| `rubicon_apng_gen/` | 文字動畫產生器：23 種進場、18 種退場、9 種待機，輸出 APNG／animated WebP | 可擴充 cutin.js 的文字特效（本專案 cut-in 已輸出 APNG） |

---

## 4. 素材授權

- 程式碼：MIT。
- 音效：只收 CC0／CC-BY（設計文件明確排除 NC/SA、Pixabay、ZapSplat 等）。
  - CC0：Kenney、Still North Media、Black Lodge Games、rubberduck、qubodup 等。
  - **CC-BY（需署名）**：Michel Baradari（槍聲、爆炸）、Lee Barkovich、Blender Foundation "Big Explosion"、JC Sounds（CC-BY 4.0）、dklon（CC-BY 3.0）。
  - 清單在 `src/assets/sfx2/CREDITS.txt` 與 `src/audio/sfx-data.js:1-3`。
- BGM／過場音樂：Kevin MacLeod、Gregor Quendel（CC-BY 4.0，需署名）。
- 特效 atlas：Kenney Particle Pack（CC0）。
- 語音：VoxCPM2 生成（Apache-2.0）。

→ 搬音效時要一起帶 CREDITS，並在遊戲裡加「製作名單／授權」頁。

---

## 5. 建議分期

**第 1 期：音效核心**（最大缺口）
1. 新增 `dev/src/audio.js`：移植 synth.js、recipes.js、audio.js（拿掉網路同步，聽者改用鏡頭）
2. sfx＋sfx2 用 base64 打包（沿用 rubicon 的 `window.X = {...}` 延遲載入，或改用 web/assets＋MIME）
3. 依 §1.5 掛勾，每幀做聚合與節流
4. 設定加主音量、音效、BGM，以及靜音鍵
5. 驗收：倍速 ×4 大戰不爆音，replay 結果不變（smoke test）

**第 2 期：粒子層＋手感**
1. 移植 gpu.js、presets.js、atlas.js（先用程序生成版），改成 r160 API
2. 爆炸疊加火花與殘煙、護盾命中火花、充能吸入
3. JetFx 推進焰（3D 艦／戰機），RibbonFx 飛彈煙帶
4. 鏡頭震動（依距離）、大爆炸 PointLight
5. 驗收：`npm run bench` 跟基準比較

**進度（2026-11-04）**
- 第 1 期完成：`dev/src/audio.js`、`dev/sfx/`（commit dc3914e）。
- 第 2 期完成：`dev/src/particles.js`，GPU 粒子層（移植 gpu.js，改成 r160；圖集用程式產生，不需要 Kenney 圖）。
  - 疊在原本的序列圖上：火球、火花、餘燼、殘煙、大船／旗艦的衝擊環、旗艦的二次爆炸；船體、護盾（陣營顏色的電弧）、飛彈、攔截、艦載機、岩石的命中。
  - 拉遠時（投影後小於 3 px）、畫面外不產生；每幀有預算。
  - 鏡頭震動依距離衰減：附近的大船或旗艦沉沒時震動，駕駛的機受損時也會震。
  - 設定在「遊戲 → 特效」：粒子特效（完整／精簡／關閉）、鏡頭震動。
  - 驗證：戰局指紋不變；1.5 萬艘的測試場 GPU 每幀差異在誤差內（約 7 ms）。
- 第 2 期刻意沒做：
  - JetFx 推進焰：要每艘船的噴口位置，現在的 glowMat 已經有引擎光。
  - RibbonFx 飛彈煙帶：太空戰不做（現有的飛彈尾跡已是 GPU 貝茲曲線）。**近地作戰有做**：particles.js 的 `pfxRibbons`。
    - 所有帶子合併成一個網格，跟著飛彈的貝茲曲線。
    - 越舊越寬、越淡、慢慢往上飄。
    - 王牌飛行員自己的飛彈也有。
    - 跟著「粒子特效」設定：精簡＝比較短、關閉＝不畫。
  - PointLight 爆閃：動態光源數量改變會讓所有受光材質重新編譯 shader，改用粒子核心＋bloom 代替。

**第 3 期：動畫**
1. RIG_HEAD 後座改成彈簧解析解，WEAPON_RIG 加後座參數
2. 移植 cineCamera 給劇情過場
3. 動態 BGM 分級（依戰況：交戰艦數、旗艦血量）
