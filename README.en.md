# Star Fleet Tactics · 星海艦隊戰

[繁體中文](README.md) | **English** | [日本語](README.ja.md)

A real-time fleet tactics game that runs in the browser, with a Windows LAN server. Players on the same network connect with Chrome or Edge. Saves and battle replays are stored on the server.

> The game UI is in Traditional Chinese. English names below are given for reference.

## Project layout

```
StarFleetServer.exe      Server (Node SEA single executable with the web app embedded; not in git)
config.json              Server settings
models/                  3D models (GLB) and the models.json manifest
web/                     Built web app (game.js, index.html); the server prefers these files
dev/
  src/                   Game source (concatenated in order, then bundled by esbuild)
  server/                Server source (server.js, models.js)
  build.mjs              Web build (Windows / any environment with Node)
  build_server.py        Builds the exe (for Linux + Wine)
  web_backup/            Reference copy of the deployed build (includes the 2D assets/)
data/                    Player accounts, saves, backups (created at runtime; not in git)
```

## Building

### 1. Build the web app (all you need for normal code changes)

Requires [Node.js](https://nodejs.org/) 18 or later.

```bash
cd dev
npm install        # first time only
npm run build
```

`build.mjs` concatenates the modules in `dev/src` in order, bundles and minifies them with esbuild into `web/game.js`, and inlines `prelude.js` into `template.html` to produce `web/index.html`.

The server **reads from the `web/` folder first** and falls back to the copy embedded in the exe only for files it can't find. So after changing the web app you **don't need to rebuild the exe**; just reload the browser.

> The 2D sprites (`ships.webp`, `fx.webp`, `fighters.webp`) aren't produced by `build.mjs`; they are already embedded in the exe. To override them, copy them from `dev/web_backup/assets/` into `web/assets/`.

### 2. Run the server from source (no packaging)

Requires Node.js 22. From the project root:

```bash
node dev/server/server.js --base .
```

`--base` is the folder that contains `config.json`, `models/`, `data/` and `web/`.

### 3. Package StarFleetServer.exe

`dev/build_server.py` packages the exe on Linux using Wine. Its paths are hard-coded to the original build machine, so adjust them for your environment. The steps are:

1. Bundle `dev/server/server.js` into a single `server.cjs` with esbuild (target node22).
2. Add the web files as assets, write a Node SEA config, and generate the blob with `node --experimental-sea-config`.
3. Copy the Windows `node.exe` to `StarFleetServer.exe` and set its icon and version info with `rcedit`.
4. Inject the blob into the exe with `postject`.
5. Assemble the release folder `dist/release`: the exe, `models/`, `說明.txt` and a default `config.json`.

### Running and configuration

Double-click `StarFleetServer.exe`. The window lists the local and LAN URLs (default port 8080). On first launch, allow it through Windows Firewall on private networks. See [說明.txt](說明.txt) (Chinese) for the other `config.json` fields and how to swap models.

### Changing the server port

The port is set only in **`config.json`**. It is in the same folder as `StarFleetServer.exe`, or in the `--base` folder when running from source. There is no command-line option for it.

```json
{
  "port": 8080,
  "host": "0.0.0.0"
}
```

1. Close the server window.
2. Change `port` to the number you want (for example `8090`) and save.
3. Restart the server. The URLs it prints will use the new port; players connect with the new URL.

- `host`: `0.0.0.0` allows connections from the whole LAN; `127.0.0.1` allows only this computer.
- If startup reports that the port is already in use, the server may already be running or another program is using that port; pick a different number.
- If `config.json` doesn't exist, the server creates one on first launch from its built-in defaults (`DEFAULT_CONFIG` in `dev/server/server.js`, port 8080). Edit that file afterwards.
- Keep the file valid JSON (commas, quotes). If it isn't, the server reports a `config.json` format error and won't start.

## Game modes

Main menu:

| Menu | Description |
|---|---|
| Single Player (單人戰鬥) | The five battle modes below, plus Commanders and the Tavern |
| Multiplayer (多人戰鬥) | LAN player-vs-player (in development) |
| Replays (戰鬥回放) | Every battle is stored on the server and can be rewatched |
| Weapon Layout (武器配置) | Adjust or add weapon mounts for each ship class (shared by 2D and 3D) |
| Settings (設定) | Key bindings, game speed, interface info |
| Test Range (遊戲測試) | Test field for large-fleet visuals, performance and combat numbers |

### Single Player

| Mode | Description |
|---|---|
| **Training** (訓練作戰) | Fixed missions: read the briefing → build fleets on a budget and assign commanders → deploy → fight. There are 3 missions: Border Encounter (small), Nebula Ambush (medium) and Fortress Outpost Breakthrough (large) |
| **Skirmish** (隨機戰役) | Pick the size (small / medium / large), enemy strength (weaker / even / stronger / random) and amount of terrain. Enemies and terrain are generated randomly each time |
| **Endless** (無限戰場) | Endless stages. Enemies scale with your commanders' levels and each stage is larger than the last. Your current and best stage are tracked |
| **Simulator** (模擬室) | Freely place both sides' fleets, commanders and terrain, and test tactics under the real rules. You can take control of either side. No records or XP |
| **Spectate** (AI 對戰觀摩) | Choose each AI's difficulty and tactic (frontal push, long-range attrition, flanking, central breakthrough) and watch them fight with live commentary |

Also available:

- **Commanders** (指揮官): level up commanders and assign talents.
- **Star Tavern** (星際酒館): spend merit to recruit commanders from both factions and buy reinforcement calls.

### Control difficulty

| Level | Rules |
|---|---|
| Normal (一般) | 2D, 3D and commander view are all available. All fleets stay on one plane (no vertical movement) |
| Advanced (進階) | Only 3D and commander view. Fleets can move up and down |
| Realistic (擬真) | Only commander (bridge) view during battle. Fleets can move up and down. Friendly fire and fog of war are on |

### Winning

The enemy routs when it has lost 75% of its force, which counts as a win. If time runs out, the side with the smaller share of losses wins.
