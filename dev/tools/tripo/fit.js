// 掛點調整輔助：load 之後，surf(x,z) 由上往下打到船身表面；side(y,z,sign) 從側面打；mark(list) 畫出掛點
import * as THREE from 'three';
const rc = new THREE.Raycaster();
window.surf = (x, z, from = 2) => { rc.set(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0)); const h = rc.intersectObject(window.root, true); return h.length ? +h[0].point.y.toFixed(4) : null; };
window.side = (y, z, sgn) => { rc.set(new THREE.Vector3(sgn * 2, y, z), new THREE.Vector3(-sgn, 0, 0)); const h = rc.intersectObject(window.root, true); return h.length ? +h[0].point.x.toFixed(4) : null; };
let marks = [];
window.mark = (list) => { for (const m of marks) window.root.parent.remove(m); marks = [];
  const cols = [0xff2020, 0x20ff20, 0x2080ff, 0xffff20, 0xff20ff, 0x20ffff];
  for (const m of list) { const g = new THREE.Mesh(new THREE.ConeGeometry(m.s * 0.35, m.s * 0.5, 12).rotateX(Math.PI / 2).translate(0, m.s * 0.15, m.s * 0.1), new THREE.MeshBasicMaterial({ color: cols[m.w] }));
    g.position.fromArray(m.p); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeRotationZ((m.t || 0) * Math.PI / 180).multiply(new THREE.Matrix4().makeRotationY((m.r || 0) * Math.PI / 180))); window.root.parent.add(g); marks.push(g); } };
