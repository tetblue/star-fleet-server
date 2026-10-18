# 星海艦隊戰 · Star Fleet Tactics

**繁體中文** | [English](README.en.md) | [日本語](README.ja.md)

在瀏覽器裡玩的即時艦隊戰術遊戲，附一個 Windows 內網伺服器：同一個內網的玩家用 Chrome／Edge 連上就能玩，存檔、戰績回放都存在伺服器上。

## 專案結構

```
StarFleetServer.exe      伺服器（Node SEA 單一執行檔，網頁內建；不在 git 裡）
config.json              伺服器設定
models/                  3D 模型（GLB）與 models.json 清單
web/                     建置好的網頁（game.js、index.html）；伺服器優先使用這裡的檔案
dev/
  src/                   遊戲原始碼（依序串接後由 esbuild 打包）
  server/                伺服器原始碼（server.js、models.js）
  build.mjs              網頁建置（Windows／任何有 Node 的環境）
  build_server.py        打包 exe（Linux＋Wine 環境用）
  web_backup/            參考用的已部署版本（含 2D 素材 assets/）
data/                    玩家帳號、存檔、備份（執行時自動產生；不在 git 裡）
```

## 一鍵更新並啟動

雙擊 **`update-and-run.bat`**（需要已安裝 Git 與 Node.js）：

1. `git pull` 拉取最新程式（`web/` 與 `dev/src/_entry.js` 是建置產物，會先還原再拉）。
2. 第一次或 `package.json`／`package-lock.json` 有變動時執行 `npm ci`，接著 `npm run build` 建置網頁。
3. 啟動伺服器：有 `StarFleetServer.exe` 就用 exe，沒有就用 `node dev/server/server.js --base .`。
   伺服器已經在執行時，新網頁已經生效（玩家重新整理即可），會詢問是否要重新啟動。

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

### 3. 打包 StarFleetServer.exe

`dev/build_server.py` 是在 Linux 上用 Wine 打包的腳本（路徑寫死在原本的建置環境，需要依你的環境修改），流程：

1. 用 esbuild 把 `dev/server/server.js` 打包成單一 `server.cjs`（target node22）。
2. 把網頁檔案當成 asset，產生 Node SEA 設定並用 `node --experimental-sea-config` 產生 blob。
3. 複製 Windows 版 `node.exe` 為 `StarFleetServer.exe`，用 `rcedit` 設定圖示與版本資訊。
4. 用 `postject` 把 blob 注入 exe。
5. 組出發行資料夾 `dist/release`：exe、`models/`、`說明.txt`、預設 `config.json`。

### 執行與設定

雙擊 `StarFleetServer.exe`，視窗會列出本機與內網網址（預設連接埠 8080）。第一次啟動時請允許 Windows 防火牆的「私人網路」。`config.json` 的其他欄位與換模型的方法請見 [說明.txt](說明.txt)。

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
| 多人戰鬥 | 內網玩家對戰（開發中） |
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

### 操作難度

| 難度 | 規則 |
|---|---|
| 一般 | 可用 2D、3D 與指揮官模式；艦隊都在同一平面，不能升降 |
| 進階 | 只能用 3D 與指揮官模式；艦隊可以上下移動 |
| 擬真 | 作戰中只能用指揮官模式（艦橋）；可上下移動；有友軍誤傷與戰爭迷霧 |

### 勝負

敵軍損失 75% 即潰走（勝利）；時間到時依雙方損失比例判定。
