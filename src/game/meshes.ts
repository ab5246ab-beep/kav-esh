import * as THREE from "three";
import type { VehicleKind, WeaponId } from "./catalog";

const skinTones = [0xc68642, 0x8d5524, 0xe0ac69, 0xa86b3c];

const geo = {
  torso: new THREE.BoxGeometry(0.52, 0.58, 0.28),
  hip: new THREE.BoxGeometry(0.48, 0.22, 0.26),
  leg: new THREE.BoxGeometry(0.18, 0.72, 0.18),
  arm: new THREE.BoxGeometry(0.14, 0.52, 0.14),
  hand: new THREE.BoxGeometry(0.12, 0.12, 0.12),
  head: new THREE.SphereGeometry(0.16, 10, 8),
  hair: new THREE.SphereGeometry(0.165, 10, 8),
  shoe: new THREE.BoxGeometry(0.18, 0.08, 0.26),
  band: new THREE.BoxGeometry(0.16, 0.08, 0.16),
  gun: new THREE.BoxGeometry(0.08, 0.08, 0.55),
  markPole: new THREE.BoxGeometry(0.18, 2.4, 0.18),
  markGem: new THREE.OctahedronGeometry(0.48, 0),
};

const mat = {
  pants: new THREE.MeshStandardMaterial({ color: 0x1c1f27, roughness: 0.9, metalness: 0.02 }),
  shoe: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55, metalness: 0.2 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.8, metalness: 0 }),
  skin: skinTones.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0 })),
  band: new THREE.MeshStandardMaterial({ color: 0xd31313, roughness: 0.7, metalness: 0 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.42, metalness: 0.72 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.32, metalness: 0.65 }),
  mark: new THREE.MeshBasicMaterial({ color: 0xff1a1a, fog: false }),
};

const shirts = new Map<number, THREE.MeshStandardMaterial>();
function shirt(color: number) {
  let m = shirts.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
    shirts.set(color, m);
  }
  return m;
}

export type PersonParts = {
  group: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  rifle: THREE.Mesh;
  knife: THREE.Mesh;
  mark: THREE.Group | null;
};

export function makePerson(opts: { shirt: number; tone: number; hostile?: boolean; hostage?: boolean; boss?: boolean }): PersonParts {
  const g = new THREE.Group();
  const skin = mat.skin[opts.tone % mat.skin.length]!;
  const cloth = shirt(opts.shirt);

  const hip = new THREE.Mesh(geo.hip, cloth);
  hip.position.y = 0.86;
  g.add(hip);

  const torso = new THREE.Mesh(geo.torso, cloth);
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(geo.head, skin);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(geo.hair, mat.hair);
  hair.position.y = 1.74;
  hair.scale.set(1, 0.55, 1);
  g.add(hair);

  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.78, 0);
  const legLm = new THREE.Mesh(geo.leg, mat.pants);
  legLm.position.y = -0.36;
  legL.add(legLm);
  const shoeL = new THREE.Mesh(geo.shoe, mat.shoe);
  shoeL.position.set(0, -0.74, -0.02);
  legL.add(shoeL);
  g.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.12, 0.78, 0);
  const legRm = new THREE.Mesh(geo.leg, mat.pants);
  legRm.position.y = -0.36;
  legR.add(legRm);
  const shoeR = new THREE.Mesh(geo.shoe, mat.shoe);
  shoeR.position.set(0, -0.74, -0.02);
  legR.add(shoeR);
  g.add(legR);

  const armL = new THREE.Group();
  armL.position.set(-0.34, 1.42, 0);
  const armLm = new THREE.Mesh(geo.arm, cloth);
  armLm.position.y = -0.26;
  armL.add(armLm);
  const handL = new THREE.Mesh(geo.hand, skin);
  handL.position.y = -0.54;
  armL.add(handL);
  g.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.34, 1.42, 0);
  const armRm = new THREE.Mesh(geo.arm, cloth);
  armRm.position.y = -0.26;
  armR.add(armRm);
  const handR = new THREE.Mesh(geo.hand, skin);
  handR.position.y = -0.54;
  armR.add(handR);
  if (opts.hostile) {
    const band = new THREE.Mesh(geo.band, mat.band);
    band.position.set(0, -0.1, 0);
    armL.add(band);
  }
  g.add(armR);

  const rifle = new THREE.Mesh(geo.gun, mat.gun);
  rifle.position.set(0.22, 1.15, -0.28);
  rifle.visible = !!opts.hostile;
  g.add(rifle);

  const knife = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.4), mat.gold);
  knife.position.set(0.4, 1.08, -0.24);
  knife.visible = false;
  g.add(knife);

  let mark: THREE.Group | null = null;
  if (opts.hostile) {
    mark = new THREE.Group();
    const pole = new THREE.Mesh(geo.markPole, mat.mark);
    pole.position.y = 3.35;
    const gem = new THREE.Mesh(geo.markGem, mat.mark);
    gem.position.y = 4.7;
    mark.add(pole, gem);
    if (opts.boss) mark.scale.setScalar(1.55);
    g.add(mark);
  }

  return { group: g, armL, armR, legL, legR, rifle, knife, mark };
}

export type VehicleParts = {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  rotor?: THREE.Object3D;
  rotorTail?: THREE.Object3D;
};

const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
wheelGeo.rotateZ(Math.PI / 2);

function paint(color: number, kind: "body" | "glass" | "dark" = "body") {
  if (kind === "glass") return new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 });
  if (kind === "dark") return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.45 });
  return new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.58 });
}

export function makeVehicle(kind: VehicleKind, color: number): VehicleParts {
  const group = new THREE.Group();
  const body = paint(color);
  const dark = paint(0x1a1c20, "dark");
  const glass = paint(0x9fd4ee, "glass");
  const wheels: THREE.Object3D[] = [];

  const addWheel = (x: number, y: number, z: number, r = 1) => {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, y, z);
    w.scale.setScalar(r);
    group.add(w);
    wheels.push(w);
  };

  if (kind === "car" || kind === "sport") {
    const len = kind === "sport" ? 4.4 : 4.15;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.48, len), body);
    hull.position.set(0, 0.62, 0);
    group.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, kind === "sport" ? 1.6 : 1.9), glass);
    cab.position.set(0, 1.02, 0.15);
    group.add(cab);
    addWheel(-0.78, 0.34, -1.35);
    addWheel(0.78, 0.34, -1.35);
    addWheel(-0.78, 0.34, 1.25);
    addWheel(0.78, 0.34, 1.25);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), paint(0xf5c518));
    nose.position.set(0, 0.7, -len / 2);
    group.add(nose);
  } else if (kind === "bus") {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.3, 9.2), body);
    shell.position.y = 1.55;
    group.add(shell);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 9.25), paint(0xf5c518));
    stripe.position.y = 1.7;
    group.add(stripe);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 7.4), glass);
    win.position.set(0, 2.15, -0.2);
    group.add(win);
    for (const z of [-3.2, -1.1, 1.1, 3.2]) {
      addWheel(-1.05, 0.38, z, 1.15);
      addWheel(1.05, 0.38, z, 1.15);
    }
  } else if (kind === "truck") {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.4), body);
    cab.position.set(0, 1.25, -2.3);
    group.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.15, 4.4), paint(0x2c3138));
    bed.position.set(0, 1.15, 1.1);
    group.add(bed);
    addWheel(-0.95, 0.4, -2.5, 1.2);
    addWheel(0.95, 0.4, -2.5, 1.2);
    addWheel(-0.95, 0.42, 0.6, 1.25);
    addWheel(0.95, 0.42, 0.6, 1.25);
    addWheel(-0.95, 0.42, 2.1, 1.25);
    addWheel(0.95, 0.42, 2.1, 1.25);
  } else if (kind === "bike") {
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 1.5), body);
    tank.position.set(0, 0.78, -0.1);
    group.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.55), dark);
    seat.position.set(0, 0.95, 0.45);
    group.add(seat);
    addWheel(0, 0.34, -0.95, 0.9);
    addWheel(0, 0.34, 0.9, 0.9);
  } else if (kind === "tank") {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 4.6), paint(0x3d4634));
    hull.position.y = 0.7;
    group.add(hull);
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.8), paint(0x2e3628));
    turret.position.set(0, 1.25, -0.1);
    group.add(turret);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.4), dark);
    barrel.position.set(0, 1.28, -1.7);
    group.add(barrel);
    const treadL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 4.5), dark);
    treadL.position.set(-1.25, 0.4, 0);
    group.add(treadL);
    const treadR = treadL.clone();
    treadR.position.x = 1.25;
    group.add(treadR);
  } else {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 3.4), paint(0x2a3430));
    hull.position.y = 1.1;
    group.add(hull);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 2.4), paint(0x24302c));
    tail.position.set(0, 1.25, 2.4);
    group.add(tail);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), dark);
    mast.position.set(0, 1.6, -0.2);
    group.add(mast);
    const rotor = new THREE.Group();
    rotor.position.set(0, 1.9, -0.2);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 4.6), dark);
      blade.rotation.y = (i * Math.PI) / 4;
      rotor.add(blade);
    }
    group.add(rotor);
    const rotorTail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.12), dark);
    rotorTail.position.set(0.35, 1.35, 3.5);
    group.add(rotorTail);
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), dark);
    skidL.position.set(-0.7, 0.45, 0);
    group.add(skidL);
    const skidR = skidL.clone();
    skidR.position.x = 0.7;
    group.add(skidR);
    group.traverse((o) => {
      o.castShadow = true;
    });
    return { group, wheels, rotor, rotorTail };
  }

  group.traverse((o) => {
    o.castShadow = true;
  });
  return { group, wheels };
}

function paintBoard(c: HTMLCanvasElement, text: string) {
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#120c08";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#ffb000";
  g.lineWidth = 8;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = "#ffb000";
  g.font = "700 68px Rubik, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.direction = "rtl";
  g.fillText(text, c.width / 2, c.height / 2 + 4);
}

function trainBoard(text: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  paintBoard(c, text);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 0.52), new THREE.MeshBasicMaterial({ map }));
  mesh.name = "dest";
  mesh.position.set(0, 2.42, -3.46);
  mesh.rotation.y = Math.PI;
  return mesh;
}

export function setTrainDest(group: THREE.Group, text: string) {
  const mesh = group.getObjectByName("dest") as THREE.Mesh | undefined;
  const mat = mesh?.material as THREE.MeshBasicMaterial | undefined;
  const canvas = mat?.map?.image as HTMLCanvasElement | undefined;
  if (!canvas || !mat?.map) return;
  paintBoard(canvas, text);
  mat.map.needsUpdate = true;
}

export function makeTrain(stripe = 0xf5c518, dest = "גבעת התחמושת") {
  const group = new THREE.Group();
  const colors = [0xf4f1e8, 0xd7dde3, 0xf4f1e8];
  colors.forEach((c, i) => {
    const car = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 6.4), paint(c));
    car.position.set(0, 1.5, i * 7.2);
    car.castShadow = true;
    group.add(car);
    const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.25, 6.4), paint(stripe));
    stripeMesh.position.set(0, 1.7, i * 7.2);
    group.add(stripeMesh);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 5.2), paint(0x8ec8e6));
    win.position.set(0, 2.15, i * 7.2);
    group.add(win);
  });
  group.add(trainBoard(dest));
  return group;
}

const viewMat = {
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.86, metalness: 0 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.3, metalness: 0.7 }),
  tube: new THREE.MeshStandardMaterial({ color: 0x355c32, roughness: 0.5, metalness: 0.4 }),
  nade: new THREE.MeshStandardMaterial({ color: 0x3d6b32, roughness: 0.48, metalness: 0.35 }),
};

export function makeViewmodel(id: WeaponId) {
  const g = new THREE.Group();
  const bar = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  if (id === "pistol") {
    bar(0.08, 0.16, 0.28, viewMat.dark, 0, 0, -0.05);
    bar(0.07, 0.18, 0.08, viewMat.dark, 0, -0.14, 0.08);
  } else if (id === "knife") {
    bar(0.04, 0.05, 0.42, mat.gold, 0, 0, -0.1);
    bar(0.07, 0.08, 0.14, viewMat.wood, 0, -0.02, 0.16);
  } else if (id === "fists") {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.18), mat.skin[0]!);
    hand.position.set(0, -0.02, 0);
    g.add(hand);
  } else if (id === "rpg") {
    bar(0.16, 0.16, 0.9, viewMat.tube, 0, 0, -0.2);
    bar(0.08, 0.2, 0.12, viewMat.dark, 0, -0.16, 0.1);
  } else if (id === "frag" || id === "flash" || id === "smoke" || id === "sticky" || id === "heavyfrag") {
    const color = id === "flash" ? 0xf5c518 : id === "smoke" ? 0xb7b1a4 : id === "sticky" ? 0xd31313 : 0x3d6b32;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshLambertMaterial({ color }));
    g.add(s);
  } else if (id === "sniper") {
    bar(0.07, 0.08, 1.15, viewMat.dark, 0, 0, -0.25);
    bar(0.09, 0.09, 0.2, viewMat.dark, 0, 0.08, -0.15);
    bar(0.06, 0.16, 0.1, viewMat.wood, 0, -0.12, 0.25);
  } else if (id === "shotgun") {
    bar(0.08, 0.08, 0.85, viewMat.wood, 0, 0.02, -0.15);
    bar(0.08, 0.08, 0.85, viewMat.dark, 0, -0.06, -0.15);
  } else if (id === "lmg" || id === "hmg") {
    bar(0.1, 0.12, id === "hmg" ? 1.15 : 0.95, viewMat.dark, 0, 0, -0.25);
    bar(0.16, 0.22, 0.28, viewMat.dark, 0, -0.16, 0.05);
    if (id === "hmg") bar(0.18, 0.1, 0.4, viewMat.gold, 0, 0.08, -0.1);
  } else {
    bar(0.08, 0.1, 0.85, viewMat.dark, 0, 0, -0.2);
    bar(0.07, 0.18, 0.16, viewMat.dark, 0, -0.14, 0.12);
    bar(0.09, 0.08, 0.22, viewMat.gold, 0, 0.06, 0.05);
  }
  return g;
}
