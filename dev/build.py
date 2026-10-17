# 產生內網伺服器用的網頁（dist/web）：index.html（含登入）＋ game.js ＋ 2D 素材
import subprocess, pathlib, shutil, time
root = pathlib.Path(__file__).parent
parts = ['main.js', 'data.js', 'mounts_default.js', 'weapons.js', 'game.js', 'campaign.js', 'tavern.js', 'overlay.js', 'tac.js', 'bridge.js', 'settings.js', 'boot.js']
entry = '\n'.join((root / 'src' / f).read_text(encoding='utf-8') for f in parts)
(root / 'src/_entry.js').write_text(entry, encoding='utf-8')
web = root / 'dist/web'; (web / 'assets').mkdir(parents=True, exist_ok=True)
subprocess.run(['npx', 'esbuild', 'src/_entry.js', '--bundle', '--minify', '--format=iife', '--outfile=dist/web/game.js', '--log-level=warning'], cwd=root, check=True)
build = time.strftime('%Y%m%d%H%M%S')
pre = (root / 'src/prelude.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
tpl = (root / 'src/template.html').read_text(encoding='utf-8')
(web / 'index.html').write_text(tpl.replace('__BUILD__', build).replace('__PRELUDE__', pre), encoding='utf-8')
for f in ['ships.webp', 'fx.webp', 'fighters.webp']: shutil.copyfile(root / 'assets' / f, web / 'assets' / f)
print('web', build, sum(p.stat().st_size for p in web.rglob('*') if p.is_file()))
