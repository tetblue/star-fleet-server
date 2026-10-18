# 星海艦隊戰 · Star Fleet Tactics

**繁體中文** | [English](README.en.md) | [日本語](README.ja.md)

在瀏覽器裡玩的即時艦隊戰術遊戲，附一個 Windows 內網伺服器：同一個內網的玩家用 Chrome／Edge 連上就能玩，存檔、戰績回放都存在伺服器上。

## 專案結構

```
StarFleetServer.exe      伺服器（Node SEA 單一執行檔，網頁內建；不在 git 裡）
config.example.json      設定範例；部署時複製成 config.json 再修改
config.json              正式設定（每台部署各自一份，不在 git 裡）
update-and-run.bat       拉取最新程式 → 建置網頁 → 啟動伺服器
update-build-restart.bat 關閉伺服器 → 拉取最新程式 → 打包 exe → 啟動
build-exe.bat            在 Windows 打包 StarFleetServer.exe
models/                  3D 模型（GLB）與 models.json 清單
web/                     建置好的網頁（game.js、index.html）；伺服器優先使用這裡的檔案
dev/
  src/                   遊戲原始碼（依序串接後由 esbuild 打包）
  server/                伺服器原始碼（server.js、models.js）
  build.mjs              網頁建置（Windows／任何有 Node 的環境）
  build_exe.mjs          打包 exe（Windows）
  build_server.py        打包 exe（Linux＋Wine 環境用）
  web_backup/            參考用的已部署版本（含 2D 素材 assets/）
data/                    玩家帳號、存檔、備份（執行時自動產生；不在 git 裡）
```

## 一鍵更新並啟動

雙擊 **`update-and-run.bat`**（需要已安裝 Git 與 Node.js）：

1. `git pull` 拉取最新程式（`web/` 與 `dev/src/_entry.js` 是建置產物，會先還原再拉）；沒有 `config.json` 時從 `config.example.json` 複製一份。
2. 第一次或 `package.json`／`package-lock.json` 有變動時執行 `npm ci`，接著 `npm run build` 建置網頁。
3. 啟動伺服器：有 `StarFleetServer.exe` 就用 exe，沒有就用 `node dev/server/server.js --base .`。
   伺服器已經在執行時，新網頁已經生效（玩家重新整理即可），會詢問是否要重新啟動。

## 一鍵關閉、更新、打包並重啟

伺服器程式（`dev/server/`）有更新時（例如多人戰鬥），雙擊 **`update-build-restart.bat`**（需要 Git 與 Node.js 22 以上）：

1. 關閉正在執行的 `StarFleetServer.exe`（正在進行的作戰會中斷）。
2. `git pull` 拉取最新程式（同 `update-and-run.bat`）。
3. `npm run build:exe`：建置網頁並打包新的 `StarFleetServer.exe`，覆蓋根目錄的 exe。
4. 啟動新的伺服器。

只改了網頁時用 `update-and-run.bat` 就夠了，不必重新打包。

## 打包

### 1. 建置網頁（平常改程式只需要這步）

需要 [Node.js](https://nodejs.org/) 18 以上。

```bash
cd dev
npm install        # 第一次
npm run build
```

`build.mjs` 會依序串接 `dev/src` 的模組 → esbuild 壓縮成 `web/game.js`，並把 `prelude.js` 內嵌進 `template.html` 產生 `web/index.html`。

伺服器會**優先讀 `web/` 資料夾**，找不到的檔案才用 exe 內建的版本，所以改完網頁**不必重新打包 exe**，重新整理瀏覽器即可。

> 2D 素材（`ships.webp`、`fx.webp`、`fighters.webp`）不會由 `build.mjs` 產生，已經內建在 exe 裡；需要覆蓋時從 `dev/web_backup/assets/` 複製到 `web/assets/`。

### 2. 不打包、直接用原始碼跑伺服器

需要 Node.js 22。在專案根目錄：

```bash
node dev/server/server.js --base .
```

`--base` 指定 `config.json`、`models/`、`data/`、`web/` 所在的資料夾。

### 3. 打包 StarFleetServer.exe（Windows）

需要 Node.js 22 以上（exe 會用本機的 `node.exe` 當底，所以打出來的 exe 就是這個 Node 版本）。雙擊 **`build-exe.bat`**，或：

```bash
cd dev
npm install        # 第一次
npm run build:exe
```

`dev/build_exe.mjs` 的流程：

1. `npm run build` 產生 `web/`。
2. 用 esbuild 把 `dev/server/server.js`（含 `meshoptimizer`）打包成單一 `dev/dist/server/server.cjs`。
3. 把 `web/` 的檔案和 `dev/web_backup/assets/` 的 2D 素材當成 asset，用 `node --experimental-sea-config` 產生 SEA blob。
4. 複製 `node.exe` → 用 `rcedit` 設定版本資訊（有 `dev/tools/icon.ico` 才設定圖示）→ 用 `postject` 注入 blob。
5. 輸出 `dev/dist/StarFleetServer.exe`，並複製到專案根目錄；伺服器正在執行時無法覆蓋，會提示關掉伺服器後再手動複製。

打包時出現 `The signature seems corrupted!` 是正常的：注入後 Node 原本的數位簽章會失效，不影響執行。

Linux 上可改用 `dev/build_server.py`（Wine＋rcedit＋postject，路徑寫死在原本的建置環境，需要依你的環境修改）。

### 執行與設定

雙擊 `StarFleetServer.exe`，視窗會列出本機與內網網址（預設連接埠 8080）。第一次啟動時請允許 Windows 防火牆的「私人網路」。`config.json` 的其他欄位與換模型的方法請見 [說明.txt](說明.txt)。

### 設定檔 config.json

`config.json` 是每台部署自己的設定，**不放進 git**，`git pull` 不會覆蓋它。第一次部署時建立：

```bash
copy config.example.json config.json
```

然後依需要修改。`update-and-run.bat` 在找不到 `config.json` 時也會自動從範例複製一份；直接啟動伺服器而沒有 `config.json` 時，伺服器會用內建預設值自動產生。

### 修改服務的連接埠（port）

連接埠只在 **`config.json`** 設定（和 `StarFleetServer.exe` 放在同一個資料夾；用原始碼執行時則是 `--base` 指定的資料夾），沒有命令列參數可以改：

```json
{
  "port": 8080,
  "host": "0.0.0.0"
}
```

1. 關掉伺服器視窗。
2. 把 `port` 改成想要的號碼（例如 `8090`），存檔。
3. 重新啟動伺服器，視窗列出的網址會換成新的連接埠；玩家改用新網址連線。

- `host`：`0.0.0.0`＝內網都能連；`127.0.0.1`＝只有本機能連。
- 啟動時出現「連接埠已被占用」，代表伺服器可能已經開著，或該連接埠被其他程式使用，請換一個號碼。
- `config.json` 不存在時，伺服器第一次啟動會用內建預設值（`dev/server/server.js` 的 `DEFAULT_CONFIG`，port 8080）自動產生一份；之後改這份檔案即可。
- 改完要維持正確的 JSON 格式（逗號、引號），格式錯誤時伺服器會顯示「config.json 格式錯誤」並無法啟動。

## 遊戲模式

主選單：

| 選單 | 說明 |
|---|---|
| 單人戰鬥 | 下方五種作戰模式，以及指揮官、星際酒館 |
| 多人戰鬥 | 內網玩家 1 對 1 對戰，其他人可以觀戰（見下方） |
| 戰鬥回放 | 每場戰鬥都存在伺服器，隨時重看 |
| 武器配置 | 調整、新增各艦種的武器位置（2D／3D 共用） |
| 設定 | 按鍵綁定、遊戲速度、介面資訊 |
| 遊戲測試 | 大軍畫面、效能與戰鬥數值的測試場 |

### 單人戰鬥

| 模式 | 內容 |
|---|---|
| **訓練作戰** (Training) | 固定關卡：讀作戰簡報 → 用預算編成艦隊、指派指揮官 → 部署 → 開戰。目前 3 場：邊境遭遇戰（小型）、星雲伏擊（中型）、要塞前哨突破（大型） |
| **隨機戰役** (Skirmish) | 自選規模（小／中／大型）、敵軍強度（較弱／相當／較強／隨機）、地形多寡，敵軍與地形每次隨機生成 |
| **無限戰場** (Endless) | 無限關卡，敵軍依你的指揮官等級生成，一關比一關大；記錄目前與最高關數 |
| **模擬室** (Simulator) | 自由布置雙方艦隊、指揮官與地形，用正式規則測試戰術，可接管任一方；不計戰績、不給經驗 |
| **AI 對戰觀摩** (Spectate) | 選擇雙方 AI 的難度與打法（正面推進、遠距離消耗、側翼包抄、中央突破），看 AI 互打並即時解說 |

另外還有：

- **指揮官**：升級、分配天賦。
- **星際酒館**：用功勳招募兩個陣營的指揮官、購買增援次數。

### 多人戰鬥

- **大廳 → 房間**：開房間或加入別人的房間（也可以只觀戰）。房主決定規模（預算）、地形、操作難度與速度；地形點對稱，雙方公平。
- **編成、部署**：雙方用一樣的預算各自編成、在自己的部署區部署（第一方在下方、第二方在上方），按「部署完成・準備」；雙方都準備好就開戰。陣營各自選，可以同陣營。
- **戰鬥**：不能暫停、不能調速度；「投降」要按兩次。斷線 60 秒內重新進入「多人戰鬥」就會回到戰鬥（從頭快轉追上）。觀戰看得到全部、不能下令，中途加入也會快轉追上。
- **指揮官**：只能派初始指揮官，等級與天賦是多人專用的（和單人分開存）。每位指揮官每場可以呼叫 1 次增援，不用天賦、不扣酒館的次數。
- **獎勵**：多人指揮官經驗；功勳算進單人的星際酒館。雙方的戰績紀錄都會存，可以回放。
- **同步方式**：鎖步。伺服器當時鐘，每一回合（4 個模擬 tick）把收到的命令廣播給房間裡的每個人，各瀏覽器用同樣的種子與命令各自模擬；雙方每 2 秒互比一次戰局指紋，不一致會提示「不同步」。伺服器端程式在 `dev/server/multi.js`，網頁端在 `dev/src/multi.js`。
- 多人戰鬥需要新版的伺服器程式：改過伺服器後要重新打包 `StarFleetServer.exe`（`build-exe.bat`），或用 `node dev/server/server.js --base .` 執行。

### 操作難度

| 難度 | 規則 |
|---|---|
| 一般 | 可用 2D、3D 與指揮官模式；艦隊都在同一平面，不能升降 |
| 進階 | 只能用 3D 與指揮官模式；艦隊可以上下移動 |
| 擬真 | 作戰中只能用指揮官模式（艦橋）；可上下移動；有友軍誤傷與戰爭迷霧 |

### 勝負

敵軍損失 75% 即潰走（勝利）；時間到時依雙方損失比例判定。
