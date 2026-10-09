import * as THREE from "three";
import { BOUNDS, BUILDINGS, PLACES, ROAD_LINES, WALLS } from "./osm-layout";
import { BUS_LINES, LANDMARKS, RAIL_STOPS } from "./world";

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number; h: number; stamp: number };

function lambert(color: number, opts?: { map?: THREE.Texture; opacity?: number; rough?: number }) {
  const opacity = opts?.opacity ?? 1;
  return new THREE.MeshStandardMaterial({
    color,
    ...(opts?.map ? { map: opts.map } : {}),
    roughness: opts?.rough ?? 0.86,
    metalness: 0.04,
    transparent: opacity < 1,
    opacity,
  });
}

function facade(base: string, mortar: string, windows: boolean) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = mortar;
  g.lineWidth = 2;
  for (let y = 16; y < 128; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  if (windows) {
    for (let y = 8; y < 120; y += 32) {
      for (let x = 10; x < 120; x += 32) {
        g.fillStyle = "#163044";
        g.fillRect(x, y, 14, 18);
        g.fillStyle = "#d7eef8";
        g.fillRect(x + 2, y + 2, 4, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function stoneTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e6d3ae";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#b89a72";
  g.lineWidth = 3;
  for (let y = 0; y <= 128; y += 24) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  for (let row = 0; row < 6; row++) {
    const shift = row % 2 ? 32 : 0;
    for (let x = shift; x < 128; x += 64) {
      g.beginPath();
      g.moveTo(x, row * 24);
      g.lineTo(x, row * 24 + 24);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function addCollider(list: Collider[], x: number, z: number, w: number, d: number, h: number, yaw = 0) {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const ww = w * c + d * s;
  const dd = w * s + d * c;
  list.push({ minX: x - ww / 2, maxX: x + ww / 2, minZ: z - dd / 2, maxZ: z + dd / 2, h, stamp: 0 });
}

function tileInstances(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
       #ifdef USE_INSTANCING
         vMapUv.x *= max(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz)) * 0.45;
         vMapUv.y *= length(instanceMatrix[1].xyz) * 0.55;
       #endif`,
    );
  };
  return mat;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, yaw = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute("uv");
  const tile = 2.2;
  const uscale = [d, d, w, w, w, w];
  const vscale = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * uscale[f]!) / tile, (uv.getY(idx) * vscale[f]!) / tile);
    }
  }
  uv.needsUpdate = true;
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  return m;
}

function flat(w: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function sign(text: string, x: number, y: number, z: number, yaw = 0) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#14120e";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#f5c518";
  g.font = "700 64px Rubik, Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  return m;
}

function groundTex() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c9b48a";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = i % 4 === 0 ? "rgba(244,232,206,0.35)" : "rgba(110,86,52,0.18)";
    g.fillRect((i * 47) % 256, (i * 91) % 256, 4 + (i % 9), 2 + (i % 4));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function ribbon(lines: { w: number; pts: number[] }[], y: number, widen: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (const road of lines) {
    const pts = road.pts;
    const half = road.w / 2 + widen;
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i]!;
      const az = pts[i + 1]!;
      const bx = pts[i + 2]!;
      const bz = pts[i + 3]!;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * half;
      const pz = (dx / len) * half;
      pos.push(ax + px, y, az + pz, ax - px, y, az - pz, bx + px, y, bz + pz, bx - px, y, bz - pz);
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildCity(scene: THREE.Scene) {
  const root = new THREE.Group();
  const colliders: Collider[] = [];
  scene.add(root);

  const stone = lambert(0xe6d3ae, { map: stoneTex(), rough: 0.9 });
  const plaster = lambert(0xf4efe4, { map: facade("#f4efe4", "#d9cbb4", true) });
  const modern = lambert(0xd5dbe2, { map: facade("#d5dbe2", "#9aa6b2", true), rough: 0.55 });
  const deep = lambert(0xc4a67a, { map: facade("#cbb892", "#a88b62", false) });
  const mats = [stone, plaster, modern, deep].map(tileInstances);
  const geos = [0, 1, 2, 3].map(() => new THREE.BoxGeometry(1, 1, 1));
  const meshes = mats.map((mat, i) => new THREE.InstancedMesh(geos[i]!, mat, 5200));
  const counts = [0, 0, 0, 0];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < BUILDINGS.length; i += 7) {
    const x = BUILDINGS[i]!;
    const z = BUILDINGS[i + 1]!;
    const w = BUILDINGS[i + 2]!;
    const d = BUILDINGS[i + 3]!;
    const h = BUILDINGS[i + 4]!;
    const yaw = BUILDINGS[i + 5]!;
    const kind = BUILDINGS[i + 6]! | 0;
    if (coveredByLandmark(x, z, w, d)) continue;
    const mesh = meshes[kind] ?? meshes[1]!;
    const ki = meshes[kind] ? kind : 1;
    const n = counts[ki] ?? 0;
    dummy.position.set(x, h / 2, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    counts[ki] = n + 1;
    if (h > 4 && w * d > 36) addCollider(colliders, x, z, w * 0.9, d * 0.9, h, yaw);
  }
  meshes.forEach((mesh, i) => {
    mesh.count = counts[i] ?? 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (mesh.count > 0) mesh.computeBoundingSphere();
    root.add(mesh);
  });

  const gw = BOUNDS.maxX - BOUNDS.minX;
  const gd = BOUNDS.maxZ - BOUNDS.minZ;
  const gtex = groundTex();
  gtex.repeat.set(gw / 4, gd / 4);
  root.add(flat(gw, gd, lambert(0xc9b48a, { map: gtex, rough: 1 }), (BOUNDS.minX + BOUNDS.maxX) / 2, 0, (BOUNDS.minZ + BOUNDS.maxZ) / 2));
  root.add(new THREE.Mesh(ribbon(ROAD_LINES, 0.04, 1.6), lambert(0xd7c4a2, { rough: 0.96 })));
  root.add(new THREE.Mesh(ribbon(ROAD_LINES, 0.08, 0), lambert(0x2a2e33, { rough: 0.92 })));

  const wallMat = tileInstances(lambert(0xd7c3a0, { map: stoneTex() }));
  let segments = 0;
  for (const line of WALLS) segments += Math.max(0, line.length / 2 - 1);
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, Math.max(1, segments));
  const merlonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, Math.max(1, segments));
  let wn = 0;
  let mn = 0;
  const gate = PLACES.shechem;
  const dummyW = new THREE.Object3D();
  for (const line of WALLS) {
    for (let i = 0; i < line.length - 2; i += 2) {
      const ax = line[i]!;
      const az = line[i + 1]!;
      const bx = line[i + 2]!;
      const bz = line[i + 3]!;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (Math.hypot(mx - gate.x, mz - gate.z) < 30) continue;
      const yaw = Math.atan2(dx, dz);
      dummyW.position.set(mx, 6, mz);
      dummyW.rotation.set(0, yaw, 0);
      dummyW.scale.set(4.2, 12, len);
      dummyW.updateMatrix();
      wallMesh.setMatrixAt(wn++, dummyW.matrix);
      addCollider(colliders, mx, mz, 4.2, len, 12, yaw);
      if (len > 10) {
        dummyW.position.set(mx, 12.7, mz);
        dummyW.scale.set(1.4, 1.5, 1.4);
        dummyW.updateMatrix();
        merlonMesh.setMatrixAt(mn++, dummyW.matrix);
      }
    }
  }
  wallMesh.count = wn;
  merlonMesh.count = mn;
  wallMesh.instanceMatrix.needsUpdate = true;
  merlonMesh.instanceMatrix.needsUpdate = true;
  if (wn > 0) wallMesh.computeBoundingSphere();
  if (mn > 0) merlonMesh.computeBoundingSphere();
  root.add(wallMesh, merlonMesh);

  dress(root, colliders, wallMat);
  return { root, colliders };
}

function dress(root: THREE.Group, colliders: Collider[], wallMat: THREE.Material) {
  const p = PLACES;
  const stone = lambert(0xe4d0aa, { map: stoneTex() });
  const pines = grove();
  void wallMat;

  root.add(flat(42, 28, lambert(0xe6d7b4), p.shechem.x, 0.12, p.shechem.z - 18));
  for (let step = 0; step < 4; step++) {
    root.add(box(14 - step, 0.28, 2.2, stone, p.shechem.x, 0.2 + step * 0.28, p.shechem.z - 6 - step * 2.1));
  }
  for (const side of [-1, 1]) {
    const x = p.shechem.x + side * 12;
    root.add(box(7, 18, 8, stone, x, 9, p.shechem.z));
    root.add(box(8, 1.2, 9, stone, x, 18.4, p.shechem.z));
    addCollider(colliders, x, p.shechem.z, 7, 8, 18);
    for (const mz of [-2.2, 0, 2.2]) root.add(box(1.1, 1.3, 1.1, stone, x, 19.4, p.shechem.z + mz));
  }
  root.add(box(17, 3.2, 5, stone, p.shechem.x, 14.2, p.shechem.z));
  root.add(box(8.5, 7.2, 1.2, lambert(0x16130f), p.shechem.x, 4.2, p.shechem.z + 1.6));
  root.add(box(9.2, 1.1, 1.4, stone, p.shechem.x, 8.2, p.shechem.z + 1.5));
  root.add(sign("שער שכם", p.shechem.x, 20, p.shechem.z - 10, Math.PI));

  root.add(flat(34, 62, lambert(0xe7dcc0), p.kotel.x - 18, 0.11, p.kotel.z));
  root.add(box(2.6, 19, 58, stone, p.kotel.x, 9.5, p.kotel.z));
  addCollider(colliders, p.kotel.x, p.kotel.z, 2.6, 58, 19);
  root.add(box(0.25, 1.5, 36, lambert(0xc8b48a), p.kotel.x - 9, 0.9, p.kotel.z));
  root.add(sign("הכותל", p.kotel.x - 14, 6, p.kotel.z, Math.PI / 2));

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.7, 78, 6), lambert(0xf4f7f8, { rough: 0.35 }));
  mast.position.set(p.bridge.x - 24, 36, p.bridge.z);
  mast.rotation.z = -0.46;
  root.add(mast);
  addCollider(colliders, p.bridge.x - 24, p.bridge.z, 4, 4, 8);
  root.add(box(86, 1.1, 18, lambert(0xe7edf2, { rough: 0.45 }), p.bridge.x + 8, 11, p.bridge.z));
  const topX = p.bridge.x - 24 + Math.sin(0.46) * 39;
  const topY = 36 + Math.cos(0.46) * 39;
  const cables: number[] = [];
  for (let i = -4; i <= 4; i++) cables.push(topX, topY, p.bridge.z, p.bridge.x + 6 + i * 6, 11.7, p.bridge.z + (i % 2 ? 5 : -5));
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute("position", new THREE.Float32BufferAttribute(cables, 3));
  root.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0xf7fbff })));
  root.add(sign("גשר המיתרים", p.bridge.x, 16, p.bridge.z + 16, 0));

  const sx = p.station.x - 48;
  root.add(box(78, 24, 52, lambert(0xc9c3b4, { rough: 0.72 }), sx, 12, p.station.z));
  root.add(box(78, 1.2, 52, lambert(0x8d8678), sx, 23.2, p.station.z));
  root.add(box(20, 6, 8, lambert(0x9ec4d6, { opacity: 0.55, rough: 0.12 }), sx + 10, 16, p.station.z - 22));
  addCollider(colliders, sx, p.station.z, 78, 52, 24);
  root.add(flat(40, 22, lambert(0xb7b1a4), p.station.x + 10, 0.1, p.station.z));
  root.add(sign("תחנה מרכזית", p.station.x + 6, 8, p.station.z - 16, 0));
  root.add(sign("ירמיהו", p.yirmiyahu.x, 5.5, p.yirmiyahu.z, Math.PI / 2));

  for (let row = 0; row < 2; row++) {
    for (let i = -4; i <= 4; i++) {
      const x = p.mahane.x + i * 8.4;
      const z = p.mahane.z + (row ? 7.4 : -7.4);
      root.add(box(5.2, 2.7, 4.2, lambert(0xe7dcc4), x, 1.35, z));
      root.add(box(5.4, 0.22, 4.6, lambert(i % 2 ? 0xc4552a : 0xf6f1e6), x, 2.85, z));
      addCollider(colliders, x, z, 5.2, 4.2, 3);
    }
  }
  root.add(sign("מחנה יהודה", p.mahane.x, 6.5, p.mahane.z - 16, Math.PI));
  root.add(sign("רחוב יפו", p.jaffa.x, 5.6, p.jaffa.z - 14, Math.PI));
  root.add(sign("המלך ג׳ורג׳", p.george.x + 14, 5.6, p.george.z, Math.PI / 2));

  root.add(flat(210, 140, lambert(0x3e8f45, { rough: 1 }), p.sacher.x, 0.07, p.sacher.z));
  root.add(flat(90, 7, lambert(0xe6d7b4), p.sacher.x, 0.1, p.sacher.z));
  plant(pines, colliders, p.sacher.x, p.sacher.z, 32, 90, 55);
  root.add(pines.trunks, pines.crowns);
  root.add(sign("גן סאקר", p.sacher.x, 6, p.sacher.z - 62, Math.PI));

  const fx = p.sport.x;
  const fz = p.sport.z;
  root.add(flat(128, 92, lambert(0x2a6b34, { rough: 1 }), fx, 0.06, fz));
  root.add(flat(108, 72, lambert(0x3e9a48, { rough: 1 }), fx, 0.09, fz));
  const line = lambert(0xf7f4ea);
  line.polygonOffset = true;
  line.polygonOffsetFactor = -3;
  line.polygonOffsetUnits = -3;
  const stripe = (w: number, d: number, x: number, z: number) => root.add(flat(w, d, line, x, 0.14, z));
  stripe(105, 0.45, fx, fz - 34);
  stripe(105, 0.45, fx, fz + 34);
  stripe(0.45, 68, fx - 52.5, fz);
  stripe(0.45, 68, fx + 52.5, fz);
  stripe(0.4, 68, fx, fz);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9.15, 9.55, 48), line);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(fx, 0.15, fz);
  root.add(ring);
  const boxLines = (w: number, d: number, z: number) => {
    stripe(w, 0.32, fx, z - d / 2);
    stripe(w, 0.32, fx, z + d / 2);
    stripe(0.32, d, fx - w / 2, z);
    stripe(0.32, d, fx + w / 2, z);
  };
  boxLines(40.3, 16.5, fz - 34 + 8.25);
  boxLines(40.3, 16.5, fz + 34 - 8.25);
  boxLines(18.3, 5.5, fz - 34 + 2.75);
  boxLines(18.3, 5.5, fz + 34 - 2.75);
  const post = lambert(0xf7f4ea);
  for (const gz of [fz - 34, fz + 34]) {
    const dir = gz < fz ? -1 : 1;
    root.add(box(0.18, 2.44, 0.18, post, fx - 3.66, 1.22, gz));
    root.add(box(0.18, 2.44, 0.18, post, fx + 3.66, 1.22, gz));
    root.add(box(7.5, 0.16, 0.16, post, fx, 2.44, gz));
    root.add(box(7.32, 2.2, 1.6, lambert(0xf4f7fb, { opacity: 0.35, rough: 0.15 }), fx, 1.15, gz + dir * 1.1));
  }
  for (const side of [-1, 1]) {
    root.add(box(52, 7, 12, lambert(0xd9d0be), fx + side * 33, 3.5, fz + 50));
    root.add(box(52, 0.45, 14, lambert(0xcfc6b2), fx + side * 33, 7.2, fz + 50));
    root.add(box(40, 0.35, 8, lambert(0xb23a2a), fx + side * 33, 7.5, fz + 50));
    addCollider(colliders, fx + side * 33, fz + 50, 52, 12, 7.4);
  }
  root.add(box(8, 3.2, 72, lambert(0xd9d0be), fx - 64, 1.6, fz));
  root.add(box(8, 3.2, 72, lambert(0xd9d0be), fx + 64, 1.6, fz));
  addCollider(colliders, fx - 64, fz, 8, 72, 3.2);
  addCollider(colliders, fx + 64, fz, 8, 72, 3.2);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const px = fx + side * 58;
      const pz = fz + end * 36;
      root.add(box(0.35, 16, 0.35, lambert(0xd5dbe2), px, 8, pz));
      root.add(box(2.2, 0.4, 1.2, lambert(0xf4f7fb), px, 16, pz));
    }
  }
  root.add(sign("ספורטק", fx, 11, fz + 58, 0));
  root.add(sign("מגרש כדורגל", fx, 4.2, fz + 40, Math.PI));

  root.add(flat(46, 46, lambert(0x3a4046), p.ramot.x, 0.08, p.ramot.z));
  const island = new THREE.Mesh(new THREE.CircleGeometry(7, 24), lambert(0x3e8f45));
  island.rotation.x = -Math.PI / 2;
  island.position.set(p.ramot.x, 0.12, p.ramot.z);
  root.add(island);
  addCollider(colliders, p.ramot.x, p.ramot.z, 4, 4, 1.2);
  root.add(sign("צומת רמות", p.ramot.x, 6, p.ramot.z + 16, Math.PI));

  root.add(box(7, 3.6, 5.5, lambert(0x16130f), LANDMARKS.shop.x, 1.8, LANDMARKS.shop.z));
  root.add(box(7.4, 0.35, 0.45, lambert(0xf5c518), LANDMARKS.shop.x, 3.7, LANDMARKS.shop.z + 2.8));
  addCollider(colliders, LANDMARKS.shop.x, LANDMARKS.shop.z, 7, 5.5, 3.6);
  root.add(sign("נשקייה", LANDMARKS.shop.x, 5.6, LANDMARKS.shop.z, 0));

  root.add(flat(18, 14, lambert(0x8e98a2), LANDMARKS.tankPad.x, 0.12, LANDMARKS.tankPad.z));
  root.add(flat(18, 14, lambert(0x8e98a2), LANDMARKS.heliPad.x, 0.12, LANDMARKS.heliPad.z));
  root.add(sign("H", LANDMARKS.heliPad.x, 3.2, LANDMARKS.heliPad.z, 0));

  const railBed = lambert(0x4a4036, { rough: 0.7 });
  const railMat = lambert(0xc4552a, { rough: 0.4 });
  for (let i = 0; i < RAIL_STOPS.length - 1; i++) {
    const a = RAIL_STOPS[i]!;
    const b = RAIL_STOPS[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    root.add(box(3.4, 0.08, len, railBed, mx, 0.12, mz, yaw));
    root.add(box(0.28, 0.1, len, railMat, mx, 0.18, mz, yaw));
  }
  for (const stop of RAIL_STOPS) {
    if (!stop.name) continue;
    root.add(box(14, 0.35, 3.2, lambert(0xd5dbe0), stop.x, 0.28, stop.z));
    root.add(sign(stop.name, stop.x, 3.6, stop.z, 0));
  }
  for (const line of BUS_LINES) {
    for (const stop of line.stops) {
      root.add(box(0.16, 2.5, 0.16, lambert(0x22262c), stop.x + 5, 1.25, stop.z));
      root.add(box(3.4, 0.12, 1.5, lambert(line.color), stop.x + 5, 2.55, stop.z));
    }
  }
}

function coveredByLandmark(x: number, z: number, w = 0, d = 0) {
  const p = PLACES;
  const reach = Math.hypot(w, d) * 0.5;
  const spots: [number, number, number][] = [
    [p.shechem.x, p.shechem.z, 36],
    [p.kotel.x - 8, p.kotel.z, 42],
    [p.station.x - 20, p.station.z, 78],
    [p.sport.x, p.sport.z, 100],
    [p.mahane.x, p.mahane.z, 52],
    [p.bridge.x, p.bridge.z, 58],
    [p.sacher.x, p.sacher.z, 90],
    [p.ramot.x, p.ramot.z, 42],
    [p.oldcity.x, p.oldcity.z, 30],
    [p.jaffa.x, p.jaffa.z, 18],
    [p.george.x, p.george.z, 18],
    [p.yirmiyahu.x, p.yirmiyahu.z, 18],
  ];
  return spots.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r + reach);
}

function grove() {
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 6), lambert(0x6a452c), 40);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 6.2, 7), lambert(0x1e6a34), 40);
  return { trunks, crowns, n: 0 };
}

function plant(g: ReturnType<typeof grove>, colliders: Collider[], ox: number, oz: number, count: number, spreadX: number, spreadZ: number) {
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count && g.n < 40; i++) {
    const x = ox - spreadX / 2 + (((i * 37) % 100) / 100) * spreadX;
    const z = oz - spreadZ / 2 + (((i * 67) % 100) / 100) * spreadZ;
    if (Math.abs(z - oz) < 6 && Math.abs(x - ox) < 40) continue;
    dummy.position.set(x, 1.6, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 0.85 + (i % 5) * 0.08, 1);
    dummy.updateMatrix();
    g.trunks.setMatrixAt(g.n, dummy.matrix);
    dummy.position.set(x, 5.2, z);
    dummy.updateMatrix();
    g.crowns.setMatrixAt(g.n, dummy.matrix);
    addCollider(colliders, x, z, 0.7, 0.7, 4);
    g.n++;
  }
  g.trunks.count = g.n;
  g.crowns.count = g.n;
  g.trunks.instanceMatrix.needsUpdate = true;
  g.crowns.instanceMatrix.needsUpdate = true;
}
