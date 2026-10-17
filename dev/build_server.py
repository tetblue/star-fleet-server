# 打包 Windows 伺服器：server.cjs ＋ 網頁（內嵌）→ Node SEA → StarFleetServer.exe，並組出發行資料夾 dist/release
import subprocess, pathlib, shutil, json, os, hashlib
root = pathlib.Path(__file__).parent
NB = pathlib.Path('/home/claude/nodebin')
WINE = ['/usr/lib/wine/wine64']; env = {**os.environ, 'WINEDEBUG': '-all', 'WINEPREFIX': '/root/wineprefix'}
out = root / 'dist/server'; out.mkdir(parents=True, exist_ok=True)
subprocess.run(['python3', 'build.py'], cwd=root, check=True)
subprocess.run(['npx', 'esbuild', 'server/server.js', '--bundle', '--platform=node', '--format=cjs', '--target=node22', '--outfile=dist/server/server.cjs', '--log-level=warning'], cwd=root, check=True)
web = root / 'dist/web'
assets = {('web/' + p.relative_to(web).as_posix()): str(p) for p in web.rglob('*') if p.is_file()}
(out / 'sea.json').write_text(json.dumps({'main': str(out / 'server.cjs'), 'output': str(out / 'sea.blob'), 'disableExperimentalSEAWarning': True, 'useCodeCache': False, 'assets': assets}, ensure_ascii=False), encoding='utf-8')
subprocess.run([str(NB / 'node-linux-x64-22.23.3/package/bin/node'), '--experimental-sea-config', str(out / 'sea.json')], check=True)
exe = out / 'StarFleetServer.exe'
shutil.copyfile(NB / 'node-win-x64-22.23.3/package/bin/node.exe', exe)
subprocess.run(WINE + [str(NB / 'rcedit/package/bin/rcedit-x64.exe'), str(exe), '--set-icon', str(root / 'tools/icon.ico'),
  '--set-version-string', 'ProductName', 'Star Fleet Tactics Server', '--set-version-string', 'FileDescription', 'Star Fleet Tactics LAN Server',
  '--set-version-string', 'CompanyName', '', '--set-version-string', 'LegalCopyright', '', '--set-version-string', 'OriginalFilename', 'StarFleetServer.exe', '--set-version-string', 'InternalName', 'StarFleetServer',
  '--set-file-version', '1.0.0', '--set-product-version', '1.0.0'], env=env, check=True)
subprocess.run(['npx', '--prefix', str(NB / 'tools'), 'postject', str(exe), 'NODE_SEA_BLOB', str(out / 'sea.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--overwrite'], check=True, capture_output=True)
# 發行資料夾
rel = root / 'dist/release'
if rel.exists(): shutil.rmtree(rel)
rel.mkdir(parents=True)
shutil.copyfile(exe, rel / 'StarFleetServer.exe')
shutil.copytree('/home/claude/release/models', rel / 'models')
shutil.copyfile(root / 'server/README.txt', rel / '說明.txt')
cfg = {'port': 8080, 'host': '0.0.0.0', 'openBrowser': True, 'modelsDir': 'models', 'dataDir': 'data', 'webDir': 'web', 'allowRegister': True, 'backup': {'minIntervalMinutes': 10, 'keepRecent': 50, 'keepDays': 60}, 'maxRecordsPerPlayer': 500}
(rel / 'config.json').write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
b = exe.read_bytes()
print('exe', len(b), hashlib.sha256(b).hexdigest()[:16])
