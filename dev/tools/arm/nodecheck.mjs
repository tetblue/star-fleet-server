// 不開瀏覽器的檢查：node tools/arm/nodecheck.mjs（幾何、油壓缸固定點、互穿）
import { buildArm } from './machine.js'; import { runCheck } from './checks.js';
const M = buildArm(), I = M.info();
console.log('零件', I.parts.length, '三角面', I.tris, '骨頭', I.bones.length);
console.log('油壓缸', JSON.stringify(I.actuators));
const R = runCheck(M); console.log(JSON.stringify(R, null, 1));
