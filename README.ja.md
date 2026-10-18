# 星海艦隊戦 · Star Fleet Tactics

[繁體中文](README.md) | [English](README.en.md) | **日本語**

ブラウザで遊ぶリアルタイム艦隊戦術ゲームです。Windows 用の LAN サーバーが付属しています。同じ LAN 内のプレイヤーは Chrome／Edge で接続するだけで遊べます。セーブデータと戦闘リプレイはサーバーに保存されます。

> ゲーム画面は繁体字中国語です。下記の日本語名は参考訳です。

## ディレクトリ構成

```
StarFleetServer.exe      サーバー（Node SEA 単一実行ファイル、Web 版を内蔵。git には含めない）
config.json              サーバー設定
update-and-run.bat       最新コードを取得 → Web 版をビルド → サーバー起動
build-exe.bat            Windows で StarFleetServer.exe をパッケージング
models/                  3D モデル（GLB）と models.json 一覧
web/                     ビルド済み Web 版（game.js、index.html）。サーバーはここを優先して使う
dev/
  src/                   ゲームのソース（順番に連結してから esbuild でバンドル）
  server/                サーバーのソース（server.js、models.js）
  build.mjs              Web 版のビルド（Windows／Node があればどこでも）
  build_exe.mjs          exe のパッケージング（Windows）
  build_server.py        exe のパッケージング（Linux＋Wine 用）
  web_backup/            デプロイ済み版の参照用コピー（2D 素材 assets/ を含む）
data/                    プレイヤーのアカウント、セーブ、バックアップ（実行時に自動生成。git には含めない）
```

## ワンクリックで更新して起動

**`update-and-run.bat`** をダブルクリックします（Git と Node.js が必要です）。

1. `git pull` で最新のコードを取得します。`web/` と `dev/src/_entry.js` はビルド成果物なので、pull の妨げにならないよう先に元に戻します。
2. 初回、または `package.json`／`package-lock.json` が変わったときは `npm ci` を実行し、続けて `npm run build` で Web 版をビルドします。
3. サーバーを起動します。`StarFleetServer.exe` があれば exe を使い、なければ `node dev/server/server.js --base .` で起動します。
   サーバーがすでに起動している場合、新しい Web 版はすでに反映されており（プレイヤーは再読み込みするだけ）、再起動するかどうか確認されます。

## ビルド

### 1. Web 版のビルド（普段のコード変更はこれだけでよい）

[Node.js](https://nodejs.org/) 18 以上が必要です。

```bash
cd dev
npm install        # 初回のみ
npm run build
```

`build.mjs` は `dev/src` のモジュールを順番に連結し、esbuild で圧縮して `web/game.js` を出力します。さらに `prelude.js` を `template.html` に埋め込んで `web/index.html` を生成します。

サーバーは**`web/` フォルダを優先して読み込み**、見つからないファイルだけ exe 内蔵版を使います。そのため Web 版を変更しても**exe を作り直す必要はなく**、ブラウザを再読み込みするだけで反映されます。

> 2D 素材（`ships.webp`、`fx.webp`、`fighters.webp`）は `build.mjs` では生成されず、exe に内蔵済みです。差し替える場合は `dev/web_backup/assets/` から `web/assets/` にコピーしてください。

### 2. パッケージせずにソースからサーバーを起動

Node.js 22 が必要です。プロジェクトのルートで：

```bash
node dev/server/server.js --base .
```

`--base` には `config.json`、`models/`、`data/`、`web/` があるフォルダを指定します。

### 3. StarFleetServer.exe のパッケージング（Windows）

Node.js 22 以上が必要です。exe はローカルの `node.exe` をベースに作られるため、その Node のバージョンで動きます。**`build-exe.bat`** をダブルクリックするか、次を実行します。

```bash
cd dev
npm install        # 初回のみ
npm run build:exe
```

`dev/build_exe.mjs` の手順：

1. `npm run build` で `web/` を生成。
2. esbuild で `dev/server/server.js`（`meshoptimizer` を含む）を単一の `dev/dist/server/server.cjs` にバンドル。
3. `web/` のファイルと `dev/web_backup/assets/` の 2D 素材を asset として埋め込み、`node --experimental-sea-config` で SEA blob を生成。
4. `node.exe` をコピーし、`rcedit` でバージョン情報を設定（`dev/tools/icon.ico` があればアイコンも）、`postject` で blob を注入。
5. `dev/dist/StarFleetServer.exe` を出力し、プロジェクトのルートにコピー。サーバーが起動中だとルートの exe は上書きできないので、その旨が表示されます。サーバーを閉じてから手動でコピーしてください。

パッケージング中の `The signature seems corrupted!` という警告は想定どおりです。blob の注入で Node 本来のコード署名が無効になるだけで、実行には影響しません。

Linux では `dev/build_server.py`（Wine＋rcedit＋postject）を使えます。パスは元のビルド環境に固定されているので、自分の環境に合わせて修正してください。

### 起動と設定

`StarFleetServer.exe` をダブルクリックすると、ウィンドウにローカルと LAN の URL が表示されます（デフォルトのポートは 8080）。初回起動時は Windows ファイアウォールで「プライベート ネットワーク」を許可してください。`config.json` のその他の項目とモデルの差し替え方法は [說明.txt](說明.txt)（中国語）を参照してください。

### サーバーのポート番号の変更

ポートは **`config.json`** でのみ設定します。このファイルは `StarFleetServer.exe` と同じフォルダにあり、ソースから起動する場合は `--base` で指定したフォルダにあります。コマンドライン引数では変更できません。

```json
{
  "port": 8080,
  "host": "0.0.0.0"
}
```

1. サーバーのウィンドウを閉じる。
2. `port` を希望の番号（例：`8090`）に変更して保存。
3. サーバーを再起動すると、表示される URL が新しいポートになる。プレイヤーは新しい URL で接続する。

- `host`：`0.0.0.0` は LAN 全体から接続可能、`127.0.0.1` はこの PC からのみ接続可能。
- 起動時に「ポートが使用中」と表示された場合は、サーバーがすでに起動しているか、別のプログラムがそのポートを使っています。別の番号に変更してください。
- `config.json` がない場合、サーバーの初回起動時に内蔵のデフォルト値（`dev/server/server.js` の `DEFAULT_CONFIG`、ポート 8080）から自動生成されます。以降はこのファイルを編集してください。
- 編集後も正しい JSON 形式（カンマ、引用符）を保ってください。形式が正しくないと、サーバーは「config.json の形式エラー」を表示して起動しません。

## ゲームモード

メインメニュー：

| メニュー | 説明 |
|---|---|
| シングルプレイ（單人戰鬥） | 下記の 5 つの戦闘モードと、指揮官・星間酒場 |
| マルチプレイ（多人戰鬥） | LAN 内のプレイヤー同士の対戦（開発中） |
| 戦闘リプレイ（戰鬥回放） | すべての戦闘がサーバーに保存され、いつでも見返せる |
| 武装配置（武器配置） | 艦種ごとの武装位置の調整・追加（2D／3D 共通） |
| 設定（設定） | キー割り当て、ゲーム速度、UI 情報 |
| テスト場（遊戲測試） | 大艦隊の表示、パフォーマンス、戦闘数値のテスト用 |

### シングルプレイ

| モード | 内容 |
|---|---|
| **訓練作戦**（訓練作戰／Training） | 固定ステージ：作戦ブリーフィングを読む → 予算内で艦隊を編成し指揮官を割り当てる → 配置 → 開戦。全 3 ステージ：国境遭遇戦（小型）、星雲の待ち伏せ（中型）、要塞前哨突破（大型） |
| **ランダム戦役**（隨機戰役／Skirmish） | 規模（小／中／大型）、敵の強さ（弱め／同等／強め／ランダム）、地形の量を選択。敵と地形は毎回ランダム生成 |
| **無限戦場**（無限戰場／Endless） | 無限に続くステージ。敵は指揮官のレベルに応じて生成され、ステージごとに規模が大きくなる。現在と最高のステージを記録 |
| **シミュレーター**（模擬室／Simulator） | 両軍の艦隊・指揮官・地形を自由に配置し、本番と同じルールで戦術を試せる。どちらの陣営も操作可能。戦績・経験値なし |
| **AI 対戦観戦**（AI 對戰觀摩／Spectate） | 両軍 AI の難易度と戦法（正面前進、遠距離消耗、側面包囲、中央突破）を選び、リアルタイム解説付きで AI 同士の戦いを観戦 |

ほかに：

- **指揮官**（指揮官）：レベルアップと才能の割り振り。
- **星間酒場**（星際酒館）：功績で両陣営の指揮官を雇い、増援回数を購入。

### 操作難易度

| 難易度 | ルール |
|---|---|
| 一般（一般） | 2D、3D、指揮官モードすべて使用可。艦隊はすべて同一平面上（上下移動なし） |
| 上級（進階） | 3D と指揮官モードのみ。艦隊は上下に移動できる |
| リアル（擬真） | 戦闘中は指揮官モード（艦橋）のみ。上下移動あり。味方誤射と戦場の霧が有効 |

### 勝敗

敵の損失が 75% に達すると敵は潰走し、勝利になります。時間切れの場合は、双方の損失の割合で判定します。
