// 戰艦組裝素材庫：把「戰艦建模」資料夾的整艦 GLB 與零件庫匯入 models/戰艦組裝/，寫 library.json。
//   node tools/shipyard/import.mjs [戰艦建模資料夾] [--blender <blender.exe>]
// 每艘船：
//   <艦名>/<塗裝>.glb   整艦（各塗裝版本原檔複製；編輯器依節點名稱拆成部件，名稱 .R 結尾的是鏡像到另一舷的那一半）
//   <艦名>/零件庫.glb、零件庫_機戰風.glb   component_library＋detail_library（Blender 匯出，不含貼圖；編輯器依材質名稱換成所選塗裝的材質）
// 「鋼鐵」版當作「標準」；沒有鋼鐵版時用不帶後綴的那個；「無貼圖」不匯入。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const BLENDER = opt('--blender', 'F:/tools/Blender/blender-5.2.3-windows-x64/blender.exe');
const SRC = path.resolve(args[0] || path.join(here, '../../../../戰艦建模'));
const OUT = path.resolve(here, '../../../models/戰艦組裝');

const ships = [];
for (const dir of fs.readdirSync(SRC).sort()) {
  const m = dir.match(/^(.+?)(\d+)m_建模$/); if (!m) continue;
  const [, name, len] = m, mdir = path.join(SRC, dir, '模型');
  if (!fs.existsSync(mdir)) continue;
  const kit = fs.readFileSync(path.join(SRC, dir, 'kit.py'), 'utf8').match(/^PARTS\s*=\s*\[([^\]]*)\]/m);
  const parts = kit ? [...kit[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const files = fs.readdirSync(mdir).filter((f) => f.endsWith('.glb'));
  const re = new RegExp(`^${name}_${len}m(?:_(.+))?\\.glb$`);
  const found = {};
  for (const f of files) { const r = f.match(re); if (r) found[r[1] || ''] = f; }
  const pick = [];
  if (found['鋼鐵']) pick.push(['標準', found['鋼鐵']]); else if (found['']) pick.push(['標準', found['']]);
  for (const [suf, f] of Object.entries(found)) if (suf && suf !== '鋼鐵' && suf !== '無貼圖') pick.push([suf, f]);
  const order = ['標準', '帝國', '聯盟', '機戰風', '機戰風_帝國', '機戰風_聯盟', '賽璐璐', '賽璐璐_帝國', '賽璐璐_聯盟'];
  pick.sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  const id = `${name}${len}m`, odir = path.join(OUT, id); fs.mkdirSync(odir, { recursive: true });
  const variants = [];
  for (const [v, f] of pick) {
    fs.copyFileSync(path.join(mdir, f), path.join(odir, v + '.glb'));
    variants.push({ name: v, file: `${id}/${v}.glb` });
  }
  const libs = {};
  for (const [style, sub] of [['標準', '部件'], ['機戰風', '部件_機戰風']]) {
    const pdir = path.join(mdir, sub);
    if (!fs.existsSync(path.join(pdir, 'component_library.blend'))) continue;
    const out = path.join(odir, style === '標準' ? '零件庫.glb' : '零件庫_機戰風.glb');
    const log = execFileSync(BLENDER, ['-b', '--factory-startup', '--python', path.join(here, 'export_lib.py'), '--', pdir, out], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (!/EXPORTED/.test(log)) throw new Error('Blender 匯出失敗：' + pdir + '\n' + log.slice(-2000));
    libs[style] = `${id}/${path.basename(out)}`;
  }
  ships.push({ id, name: `${name} ${len}m`, length: +len, parts, variants, libs });
  console.log(name, len + 'm', variants.map((v) => v.name).join('／'), Object.keys(libs).join('＋'));
}
fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify({
  說明: '戰艦組裝編輯器的素材庫（由 dev/tools/shipyard/import.mjs 從「戰艦建模」資料夾產生，重跑會覆蓋）。座標：+x 船首、+y 上，單位公尺。',
  version: 1, ships,
}, null, 1));
console.log('→', OUT);
