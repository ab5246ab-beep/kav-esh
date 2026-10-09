import * as THREE from "three";
import {
  BASE_SLOTS,
  CIVIL_FINE,
  HOSTAGE_FINE,
  KILL_PAY,
  M1_PAY,
  M2_PAY,
  M3_PAY,
  M4_PAY,
  SAVE_KEY,
  SHOP_GUNS,
  SHOP_NADES,
  START_MONEY,
  VEHICLE_SPEC,
  WEAPONS,
  emptyHud,
  type HudSnap,
  type MissionId,
  type SaveData,
  type VehicleKind,
  type WeaponId,
} from "./catalog";
import { buildCity, type Collider } from "./city";
import { makePerson, makeTrain, makeVehicle, makeViewmodel, setTrainDest, type PersonParts, type VehicleParts } from "./meshes";
import { ROAD_LINES } from "./osm-layout";
import { backFrom, guidePoint, tripMeters, type Guide } from "./route";
import { BUS_LINES, LANDMARKS, RAIL_STOPS, SPAWNS, clamp, clampMap, dampAngle, fwd, inKotelZone, rgt } from "./world";

type Mode = "foot" | "vehicle" | "train" | "bus";
type Role = "civil" | "hostile" | "hostage";

type Pax = { npc: Npc; kind: "rail" | "bus"; which: number; stop: number; aboard: boolean };
type RailRun = {
  mesh: THREE.Group;
  from: number;
  to: number;
  dir: number;
  t: number;
  phase: "move" | "dwell";
  dwell: number;
  yaw: number;
  lane: number;
};

type PubBus = {
  line: number;
  from: number;
  to: number;
  dir: number;
  t: number;
  phase: "move" | "dwell";
  dwell: number;
  request: boolean;
  x: number;
  z: number;
  yaw: number;
  parts: VehicleParts;
};

type Npc = {
  id: number;
  role: Role;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  cool: number;
  stun: number;
  dead: boolean;
  deathT: number;
  mission: boolean;
  boss: boolean;
  roam: boolean;
  hold: boolean;
  paid: boolean;
  running: boolean;
  safe: boolean;
  wander: number;
  parts: PersonParts;
  transit: boolean;
  lift: number;
  pin: boolean;
  panic: boolean;
};

type Veh = {
  id: number;
  kind: VehicleKind;
  x: number;
  z: number;
  y: number;
  yaw: number;
  speed: number;
  hp: number;
  locked: boolean;
  dead: boolean;
  qa: boolean;
  owned: boolean;
  mission: boolean;
  parts: VehicleParts;
};

type Proj = {
  kind: "rocket" | "shell" | "nade";
  weapon: WeaponId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  sticky: boolean;
  stuck: boolean;
};

type Cloud = { mesh: THREE.Mesh; x: number; y: number; z: number; life: number; r: number };
type Bit = { mesh: THREE.Mesh; life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number };
type Tracer = { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; life: number };

type Mission = {
  id: MissionId;
  phase: "go" | "fight" | "extract" | "block";
  bossId: number;
  hostageIds: number[];
  hostileIds: number[];
  clock: number;
  ramot: boolean;
  blocks: number;
  ferry: boolean;
};

const STEP = 1 / 60;
const VEH_NAME: Record<VehicleKind, string> = {
  car: "מכונית",
  sport: "מכונית ספורט",
  bus: "אוטובוס",
  truck: "משאית",
  bike: "אופנוע",
  tank: "טנק",
  heli: "מסוק",
};
const VEH_HP: Record<VehicleKind, number> = {
  car: 140,
  sport: 110,
  bus: 260,
  truck: 220,
  bike: 70,
  tank: 900,
  heli: 280,
};

export type GameOpts = {
  canvas: HTMLCanvasElement;
  map: HTMLCanvasElement;
  spawnId: string;
  resume?: boolean;
  onHud: (hud: HudSnap) => void;
  onTogglePause: () => void;
  onQuit: () => void;
  onShop: () => void;
  onBrief: (id: MissionId) => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX?: () => number;
      getZ?: () => number;
      getMode?: () => string;
      isPaused?: () => boolean;
      isWalking?: () => boolean;
      fault?: () => string;
      getPlay?: () => string;
      setKeys: (codes: string[]) => void;
      setFootKeys?: (codes: string[]) => void;
      setStick?: (x: number, y: number) => void;
      setWeapon?: (id: string) => void;
      meleeReady?: () => boolean;
      getSwings?: () => number;
      startMission?: (id: string) => void;
      warp?: (x: number, z: number) => void;
      lookAt?: (x: number, z: number) => void;
      placeBuses?: () => void;
      press?: (code: string) => void;
      missionSnap?: () => {
        id: string;
        phase: string;
        ramot: boolean;
        blocks: number;
        ferry: boolean;
        detail: string;
        left: number;
        gx: number;
        gz: number;
        money: number;
        banner: string;
        panic: number;
        buses: { x: number; z: number }[];
        boss: { x: number; z: number; lift: number; dead: boolean; hp: number; d: number; blocked: boolean } | null;
        hostiles: { x: number; z: number; hp: number; dead: boolean; blocked: boolean; boss: boolean }[];
        hostages: { x: number; z: number; safe: boolean; dead: boolean; panic: boolean }[];
      };
    };
  }
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private crashCool = 0;
  private stepAcc = 0;
  private hornAcc = 5;

  private ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    this.master = master;
    this.bed(ctx, master);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 46;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 260;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    osc.connect(filt);
    filt.connect(eg);
    eg.connect(master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = eg;
    return ctx;
  }

  go() {
    this.ensure();
  }

  stop() {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    if (ctx) void ctx.close();
  }

  private bed(ctx: AudioContext, master: GainNode) {
    const n = Math.floor(ctx.sampleRate * 2);
    const low = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = low.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < n; i++) {
      brown = brown * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[i] = brown * 5;
    }
    const src = ctx.createBufferSource();
    src.buffer = low;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 280;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start();

    const air = ctx.createBuffer(1, n, ctx.sampleRate);
    const ad = air.getChannelData(0);
    for (let i = 0; i < n; i++) ad[i] = Math.random() * 2 - 1;
    const src2 = ctx.createBufferSource();
    src2.buffer = air;
    src2.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g2 = ctx.createGain();
    g2.gain.value = 0.01;
    src2.connect(hp);
    hp.connect(g2);
    g2.connect(master);
    src2.start();
  }

  tick(dt: number, live: { driving: boolean; speed: number; walking: boolean; heli: boolean }) {
    const ctx = this.ensure();
    this.crashCool = Math.max(0, this.crashCool - dt);
    const eg = this.engineGain;
    const osc = this.engineOsc;
    if (eg && osc) {
      const vol = live.driving ? (live.heli ? 0.028 : 0.016 + Math.min(0.045, Math.abs(live.speed) * 0.0015)) : 0;
      eg.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
      osc.frequency.setTargetAtTime(live.heli ? 70 : 40 + Math.abs(live.speed) * 3.4, ctx.currentTime, 0.08);
    }
    if (live.walking) {
      this.stepAcc += dt;
      if (this.stepAcc > 0.36) {
        this.stepAcc = 0;
        this.noise(900, 0.03, 0.02);
      }
    } else this.stepAcc = 0;
    this.hornAcc -= dt;
    if (this.hornAcc <= 0) {
      this.hornAcc = 8 + Math.random() * 10;
      this.tone(160 + Math.random() * 90, 0.16, "square", 0.01);
    }
  }

  private noise(freq: number, dur: number, gain: number) {
    const ctx = this.ensure();
    const master = this.master;
    if (!master) return;
    const samples = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  tone(freq: number, dur: number, type: OscillatorType, gain: number) {
    const ctx = this.ensure();
    const master = this.master;
    if (!master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }
  gun(low = false) {
    this.tone(low ? 86 : 230, 0.05, "square", 0.04);
    this.noise(low ? 500 : 1600, 0.05, 0.045);
  }
  boom() {
    this.tone(48, 0.34, "sawtooth", 0.07);
    this.noise(180, 0.4, 0.08);
  }
  cash() {
    this.tone(880, 0.08, "square", 0.03);
    this.tone(1320, 0.12, "square", 0.025);
  }
  hit() {
    this.tone(140, 0.05, "triangle", 0.04);
    this.noise(600, 0.04, 0.02);
  }
  crash() {
    if (this.crashCool > 0) return;
    this.crashCool = 0.28;
    this.tone(70, 0.18, "sawtooth", 0.05);
    this.noise(320, 0.2, 0.07);
  }
  thud() {
    this.tone(90, 0.08, "triangle", 0.04);
    this.noise(220, 0.08, 0.03);
  }
}

const MAX_HP = 150;

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) throw new Error("empty");
    const p = JSON.parse(raw) as SaveData;
    if (p.version !== 1 || typeof p.money !== "number") throw new Error("bad");
    return p;
  } catch {
    return { version: 1, money: START_MONEY, owned: [], ammo: {}, vehicles: [], spawn: "jaffa" };
  }
}

export function readSave(): SaveData {
  return loadSave();
}

export function buySaved(id: string): { ok: boolean; message: string } {
  const save = loadSave();
  const owned = new Set(save.owned);
  const ammo = { ...save.ammo };
  const vehicles = [...save.vehicles];
  let money = save.money;
  let message = "לא קיים";
  let ok = false;
  if (id.startsWith("gun:")) {
    const wid = id.slice(4) as WeaponId;
    const w = WEAPONS[wid];
    if (!w || w.price <= 0) message = "לא למכירה";
    else if (owned.has(wid)) message = "כבר ברשותך — קנה תחמושת";
    else if (money < w.price) message = "אין מספיק כסף";
    else {
      money -= w.price;
      owned.add(wid);
      ammo[wid] = (ammo[wid] ?? 0) + Math.max(1, w.pack);
      ok = true;
      message = `נקנה: ${w.name}`;
    }
  } else if (id.startsWith("ammo:")) {
    const wid = id.slice(5) as WeaponId;
    const w = WEAPONS[wid];
    if (!w || w.packPrice <= 0) message = "אין חבילה";
    else if (!w.infinite && !owned.has(wid)) message = "קודם קונים את הנשק";
    else if (money < w.packPrice) message = "אין מספיק כסף";
    else {
      money -= w.packPrice;
      ammo[wid] = (ammo[wid] ?? 0) + w.pack;
      ok = true;
      message = `תחמושת: ${w.name}`;
    }
  } else if (id.startsWith("veh:")) {
    const kind = id.slice(4) as VehicleKind;
    const price = { sport: 8000, tank: 28000, heli: 42000 }[kind as "sport" | "tank" | "heli"];
    if (!price) message = "לא למכירה";
    else if (vehicles.includes(kind)) message = "כבר נקנה";
    else if (money < price) message = "אין מספיק כסף";
    else {
      money -= price;
      vehicles.push(kind);
      ok = true;
      message = "הכלי יחכה במגרש בכניסה למשחק";
    }
  }
  if (ok) {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, money: Math.floor(money), owned: [...owned], ammo, vehicles }));
  }
  return { ok, message };
}

export class Game {
  private opts: GameOpts;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.15, 460);
  private timer = new THREE.Timer();
  private colliders: Collider[] = [];
  private grid = new Map<number, Collider[]>();
  private stamp = 1;
  private sfx = new Sfx();
  private keys = new Set<string>();
  private probe = new Set<string>();
  private held: Record<string, boolean> = {};
  private edge: Record<string, boolean> = {};
  private stickX = 0;
  private stickY = 0;
  private stickSX = 0;
  private stickSY = 0;
  private pedal = 0;
  private wheelSteer = 0;
  private tiltSteer = 0;
  private driveMode: "pad" | "wheel" | "tilt" = "pad";
  private camMode: "eyes" | "back" | "high" = "eyes";
  private playMode: "pc" | "touch" = "pc";
  private rideLook = 0;
  private ridePitch = 0.18;
  private lookX = 0;
  private lookY = 0;
  private pointerNx = 0.5;
  private pointerNy = 0.5;
  private mouseLook = false;
  private paused = false;
  private acc = 0;
  private hudAcc = 0;
  private saveAcc = 0;
  private time = 0;
  private spawn = SPAWNS[0]!;
  private playerX = 0;
  private playerZ = 0;
  private yaw = 0;
  private camYaw = 0;
  private camPitch = 0.2;
  private camReady = false;
  private walking = false;
  private mode: Mode = "foot";
  private health = MAX_HP;
  private money = START_MONEY;
  private weapon: WeaponId = "rifle";
  private cool = 0;
  private meleeCool = 0;
  private owned = new Set<WeaponId>();
  private ammo: Partial<Record<WeaponId, number>> = {};
  private ownedVeh: VehicleKind[] = [];
  private dead = false;
  private dieQueued = false;
  private hurtV = 0;
  private lastHurt = -10;
  private hitMarker = 0;
  private shake = 0;
  private toast = "";
  private toastT = 0;
  private banner = "";
  private bannerT = 0;
  private noise = 0;
  private nextRoam = 8;
  private waveN = 0;
  private swing = 0;
  private swings = 0;
  private idc = 1;
  private npcs: Npc[] = [];
  private vehicles: Veh[] = [];
  private vehicle: Veh | null = null;
  private qa: Veh | null = null;
  private mission: Mission | null = null;
  private missionBus: Veh | null = null;
  private pendingAbort: string | null = null;
  private pendingWin = 0;
  private projs: Proj[] = [];
  private clouds: Cloud[] = [];
  private bits: Bit[] = [];
  private tracers: Tracer[] = [];
  private tracerArr = new Float32Array(90 * 6);
  private tracerGeo = new THREE.BufferGeometry();
  private tracerLines: THREE.LineSegments;
  private playerParts: PersonParts;
  private view = new THREE.Group();
  private viewKick = 0;
  private aim = new THREE.Vector3();
  private train = new THREE.Group();
  private trainDist = 40;
  private trainSpeed = 11;
  private trainDriven = false;
  private trainYaw = -Math.PI / 2;
  private rails: RailRun[] = [];
  private rideRail = 0;
  private rideBus = -1;
  private crouch = false;
  private buses: PubBus[] = [];
  private pax: Pax[] = [];
  private m1mark: THREE.Mesh;
  private m2mark: THREE.Mesh;
  private m3mark: THREE.Mesh;
  private m4mark: THREE.Mesh;
  private missionTrain: THREE.Group | null = null;
  private missionRear = { x: 78, z: 23 };
  private m4hub = { x: -1040, z: -3147 };
  private m4shooter = { x: -2304, z: 2896 };
  private m4pads: { x: number; z: number }[] = [
    { x: LANDMARKS.m4pad.x, z: LANDMARKS.m4pad.z },
    { x: LANDMARKS.m4pad2.x, z: LANDMARKS.m4pad2.z },
  ];
  private m4Approach = 740;
  private beacon: THREE.Mesh;
  private padMarks: THREE.Mesh[] = [];
  private guide: Guide | null = null;
  private mapCtx: CanvasRenderingContext2D | null;
  private onResize: () => void;
  private ro: ResizeObserver;
  private disposed = false;
  private fault = "";

  constructor(opts: GameOpts) {
    this.opts = opts;
    const save = loadSave();
    this.money = save.money;
    this.owned = new Set(save.owned);
    this.ammo = { ...save.ammo };
    this.ownedVeh = [...save.vehicles];
    this.spawn = SPAWNS.find((s) => s.id === opts.spawnId) ?? SPAWNS[0]!;
    this.playerX = this.spawn.x;
    this.playerZ = this.spawn.z;
    this.yaw = this.spawn.yaw;
    this.camYaw = this.spawn.yaw;
    if (opts.resume && save.resume && Number.isFinite(save.resume.x)) {
      this.playerX = save.resume.x;
      this.playerZ = save.resume.z;
      this.yaw = save.resume.yaw || 0;
      this.camYaw = this.yaw;
      this.health = clamp(save.resume.health || MAX_HP, 1, MAX_HP);
      if (save.resume.weapon && WEAPONS[save.resume.weapon]) this.weapon = save.resume.weapon;
    }

    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x9ec8ea);
    this.scene.fog = new THREE.Fog(0xd5e2ea, 80, 400);
    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x8d7b58, 1.2));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.45);
    sun.position.set(-50, 90, 30);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9ec4ff, 0.4);
    fill.position.set(40, 20, -30);
    this.scene.add(fill);

    const built = buildCity(this.scene);
    this.colliders = built.colliders;
    this.indexWorld();
    const free = this.unstuck(this.playerX, this.playerZ);
    this.playerX = free.x;
    this.playerZ = free.z;

    this.playerParts = makePerson({ shirt: 0x14181f, tone: 0 });
    this.scene.add(this.playerParts.group);
    this.camera.add(this.view);
    this.view.position.set(0.36, -0.28, -0.58);
    this.scene.add(this.camera);
    this.refreshView();

    this.tracerGeo.setAttribute("position", new THREE.BufferAttribute(this.tracerArr, 3));
    this.tracerLines = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe7a0 }));
    this.scene.add(this.tracerLines);

    const markMat = new THREE.MeshLambertMaterial({ color: 0xf5c518, emissive: 0xf5c518, emissiveIntensity: 0.55 });
    this.m1mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), markMat);
    this.m2mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), markMat.clone());
    this.m3mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), markMat.clone());
    this.m4mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), markMat.clone());
    this.m1mark.position.set(LANDMARKS.m1.x, 2.4, LANDMARKS.m1.z);
    this.m2mark.position.set(LANDMARKS.m2.x, 2.4, LANDMARKS.m2.z);
    this.m3mark.position.set(LANDMARKS.m3.x, 2.4, LANDMARKS.m3.z);
    this.m4mark.position.set(LANDMARKS.m4.x, 2.4, LANDMARKS.m4.z);
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 52, 10),
      new THREE.MeshBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.88, depthWrite: false }),
    );
    this.beacon.visible = false;
    this.scene.add(this.m1mark, this.m2mark, this.m3mark, this.m4mark, this.beacon);
    const padMat = new THREE.MeshBasicMaterial({ color: 0xf5c518, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.9 });
    for (const p of [LANDMARKS.m4pad, LANDMARKS.m4pad2]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(7, 10, 28), padMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.45, p.z);
      ring.visible = false;
      this.scene.add(ring);
      this.padMarks.push(ring);
    }

    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshLambertMaterial({ color: 0xff8a2a }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.bits.push({ mesh, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }

    this.spawnParked();
    this.spawnCivilians();
    for (const kind of this.ownedVeh) this.spawnOwned(kind);
    this.initTransit();

    this.mapCtx = opts.map.getContext("2d");
    opts.map.width = 256;
    opts.map.height = 256;

    this.onResize = () => {
      const w = opts.canvas.clientWidth || window.innerWidth;
      const h = opts.canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    };
    this.onResize();
    this.ro = new ResizeObserver(this.onResize);
    this.ro.observe(opts.canvas);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    opts.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    opts.canvas.addEventListener("contextmenu", this.onContext);

    this.timer.connect(document);
    window.__controlsTest = {
      getYaw: () => this.getYaw(),
      getSpeed: () => this.getSpeed(),
      getX: () => this.playerX,
      getZ: () => this.playerZ,
      getMode: () => this.mode,
      isPaused: () => this.paused,
      isWalking: () => this.walking,
      fault: () => this.fault,
      getPlay: () => this.playMode,
      setKeys: (codes) => this.setKeys(codes),
      setFootKeys: (codes: string[]) => {
        this.probe = new Set(codes);
      },
      setStick: (x: number, y: number) => this.setStick(x, y),
      setWeapon: (id: string) => {
        if (id in WEAPONS) {
          this.weapon = id as WeaponId;
          this.refreshView();
        }
      },
      meleeReady: () => this.swing > 0,
      getSwings: () => this.swings,
      startMission: (id: string) => this.startMission(id as MissionId),
      warp: (x: number, z: number) => {
        const spot = this.unstuck(x, z);
        this.playerX = spot.x;
        this.playerZ = spot.z;
        if (this.vehicle) {
          this.vehicle.x = spot.x;
          this.vehicle.z = spot.z;
          this.vehicle.speed = 0;
        }
        this.refreshGuide();
      },
      lookAt: (x: number, z: number) => {
        const dx = x - this.playerX;
        const dz = z - this.playerZ;
        this.camYaw = Math.atan2(-dx, -dz);
        this.yaw = this.camYaw;
        this.camPitch = 0;
      },
      press: (code: string) => {
        if (code === "KeyF" || code === "KeyE") this.edge.interact = true;
        if (code === "Space") this.edge.fire = true;
      },
      placeBuses: () => {
        this.missionBuses().forEach((v, i) => {
          const p = this.m4pads[i];
          if (!p) return;
          v.x = p.x;
          v.z = p.z;
          v.speed = 0;
        });
      },
      missionSnap: () => {
        const boss = this.mission ? this.npcById(this.mission.bossId) : undefined;
        const alive = (n: Npc) => !n.dead && n.mission && n.role === "hostile";
        return {
          id: this.mission?.id ?? "",
          phase: this.mission?.phase ?? "",
          ramot: !!this.mission?.ramot,
          blocks: this.mission?.blocks ?? 0,
          ferry: !!this.mission?.ferry,
          detail: this.mission ? this.missionLine(this.mission) : "",
          left: this.guide?.left ?? -1,
          gx: this.guide?.x ?? 0,
          gz: this.guide?.z ?? 0,
          money: Math.floor(this.money),
          banner: this.bannerT > 0 ? this.banner : "",
          panic: this.npcs.filter((n) => n.panic && !n.dead).length,
          buses: this.missionBuses().map((v) => ({ x: Math.round(v.x), z: Math.round(v.z) })),
          boss: boss
            ? {
                x: Math.round(boss.x),
                z: Math.round(boss.z),
                lift: boss.lift,
                dead: boss.dead,
                hp: Math.round(boss.hp),
                d: Math.round(Math.hypot(boss.x - this.playerX, boss.z - this.playerZ)),
                blocked: this.pointBlocked(boss.x, 1.1, boss.z),
              }
            : null,
          hostiles: this.npcs.filter(alive).map((n) => ({
            x: Math.round(n.x),
            z: Math.round(n.z),
            hp: Math.round(n.hp),
            dead: n.dead,
            blocked: this.pointBlocked(n.x, 1.1, n.z),
            boss: n.boss,
          })),
          hostages: (this.mission?.hostageIds ?? []).map((id) => {
            const n = this.npcById(id);
            if (!n) return null;
            return { x: Math.round(n.x), z: Math.round(n.z), safe: n.safe, dead: n.dead, panic: n.panic };
          }).filter((n): n is { x: number; z: number; safe: boolean; dead: boolean; panic: boolean } => !!n),
        };
      },
    };
    this.renderer.setAnimationLoop(() => this.frame());
    this.sfx.go();
    this.emit();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.timer.disconnect();
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.opts.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.opts.canvas.removeEventListener("contextmenu", this.onContext);
    window.__controlsTest = undefined;
    this.renderer.dispose();
    this.sfx.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    this.save();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.keys.clear();
      this.mouseLook = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  isPaused() {
    return this.paused;
  }

  setKeys(codes: string[]) {
    this.probe = new Set(codes);
    if (codes.length) this.ensureQa();
  }

  getYaw() {
    if (this.mode === "vehicle" && this.vehicle) return this.vehicle.yaw;
    if (this.mode === "train") return this.trainYaw;
    return this.yaw;
  }

  getSpeed() {
    if (this.mode === "vehicle" && this.vehicle) return Math.abs(this.vehicle.speed);
    if (this.mode === "train") return Math.abs(this.trainSpeed);
    return 0;
  }

  setStick(x: number, y: number) {
    this.stickX = x;
    this.stickY = y;
    if (x !== 0 || y !== 0) this.mouseLook = false;
  }

  setPedal(v: number) {
    this.pedal = clamp(v, -1, 1);
  }

  setWheelSteer(v: number) {
    this.wheelSteer = clamp(v, -1, 1);
  }

  setTiltSteer(v: number) {
    this.tiltSteer = clamp(v, -1, 1);
  }

  setDriveMode(mode: "pad" | "wheel" | "tilt") {
    this.driveMode = mode;
    this.wheelSteer = 0;
    this.tiltSteer = 0;
  }

  setPlayMode(mode: "pc" | "touch") {
    if (this.playMode === mode) return;
    this.playMode = mode;
    this.camMode = mode === "pc" ? "eyes" : "back";
    this.stickX = 0;
    this.stickY = 0;
    this.stickSX = 0;
    this.stickSY = 0;
    this.say(mode === "pc" ? "מחשב: מקלדת ועכבר" : "טלפון: עיגול שמאל, גרירה ימין");
    this.emit();
  }

  cycleCam() {
    const order = ["eyes", "back", "high"] as const;
    this.setCam(order[(order.indexOf(this.camMode) + 1) % order.length]!);
  }

  setCam(mode: "eyes" | "back" | "high") {
    if (this.camMode === mode) return;
    this.camMode = mode;
    this.say(mode === "eyes" ? "מבט מהעיניים" : mode === "high" ? "מבט מלמעלה" : "מבט מאחור");
    this.emit();
  }

  setEyes(on: boolean) {
    this.setCam(on ? "eyes" : "back");
  }

  addLook(dx: number, dy: number) {
    this.lookX += dx;
    this.lookY += dy;
  }

  setHeld(action: string, down: boolean) {
    if (down && !this.held[action]) this.edge[action] = true;
    this.held[action] = down;
  }

  respawn() {
    this.dead = false;
    this.dieQueued = false;
    this.health = MAX_HP;
    this.mode = "foot";
    this.vehicle = null;
    this.trainDriven = false;
    const back = this.unstuck(this.spawn.x, this.spawn.z);
    this.playerX = back.x;
    this.playerZ = back.z;
    this.yaw = this.spawn.yaw;
    this.camYaw = this.spawn.yaw;
    this.camPitch = 0.18;
    this.banner = "חזרת לרחוב";
    this.bannerT = 2;
    this.toast = "";
    this.playerParts.group.visible = true;
    this.emit();
  }

  buy(id: string): { ok: boolean; message: string } {
    if (id.startsWith("gun:")) {
      const wid = id.slice(4) as WeaponId;
      const w = WEAPONS[wid];
      if (!w || w.price <= 0) return { ok: false, message: "לא למכירה" };
      if (this.owned.has(wid)) return { ok: false, message: "כבר ברשותך — קנה תחמושת" };
      if (this.money < w.price) return { ok: false, message: "אין מספיק כסף" };
      this.money -= w.price;
      this.owned.add(wid);
      this.ammo[wid] = (this.ammo[wid] ?? 0) + Math.max(1, w.pack);
      return this.bought(`נקנה: ${w.name}`);
    }
    if (id.startsWith("ammo:")) {
      const wid = id.slice(5) as WeaponId;
      const w = WEAPONS[wid];
      if (!w || w.packPrice <= 0) return { ok: false, message: "אין חבילה" };
      if (!w.infinite && !this.owned.has(wid)) return { ok: false, message: "קודם קונים את הנשק" };
      if (this.money < w.packPrice) return { ok: false, message: "אין מספיק כסף" };
      this.money -= w.packPrice;
      this.ammo[wid] = (this.ammo[wid] ?? 0) + w.pack;
      return this.bought(`תחמושת: ${w.name}`);
    }
    if (id.startsWith("veh:")) {
      const kind = id.slice(4) as VehicleKind;
      const spec = { sport: 8000, tank: 28000, heli: 42000 }[kind as "sport" | "tank" | "heli"];
      if (!spec) return { ok: false, message: "לא למכירה" };
      if (this.vehicles.some((v) => v.kind === kind && v.owned && !v.dead)) return { ok: false, message: "כבר מחכה במגרש" };
      if (this.money < spec) return { ok: false, message: "אין מספיק כסף" };
      this.money -= spec;
      if (!this.ownedVeh.includes(kind)) this.ownedVeh.push(kind);
      this.spawnOwned(kind);
      return this.bought(`${VEH_NAME[kind]} מוכן במגרש ליד התחנה`);
    }
    return { ok: false, message: "לא קיים" };
  }

  startMission(id: MissionId) {
    if (this.dead) return;
    if (this.mission) {
      this.say("משימה כבר פעילה");
      return;
    }
    this.clearMissionPawns(true);
    const open = (x: number, z: number) => this.unstuck(x, z);
    if (id === "m1") {
      const o = LANDMARKS.m1fight;
      const bossAt = open(o.x, o.z);
      const boss = this.spawnNpc({ role: "hostile", x: bossAt.x, z: bossAt.z, shirt: 0xe10600, boss: true, mission: true, hold: true, hp: 340 });
      const g1 = open(o.x + 9, o.z + 5);
      const g2 = open(o.x - 9, o.z + 4);
      const g3 = open(o.x + 2, o.z + 12);
      const h1 = open(o.x - 4, o.z - 8);
      const h2 = open(o.x + 5, o.z - 9);
      const h3 = open(o.x + 10, o.z - 6);
      const a = this.spawnNpc({ role: "hostile", x: g1.x, z: g1.z, mission: true, hold: true, hp: 120 });
      const b = this.spawnNpc({ role: "hostile", x: g2.x, z: g2.z, mission: true, hold: true, hp: 120 });
      const c = this.spawnNpc({ role: "hostile", x: g3.x, z: g3.z, mission: true, hold: true, hp: 120 });
      const p1 = this.spawnNpc({ role: "hostage", x: h1.x, z: h1.z, mission: true, shirt: 0xf4f4f4 });
      const p2 = this.spawnNpc({ role: "hostage", x: h2.x, z: h2.z, mission: true, shirt: 0xd9d3c7 });
      const p3 = this.spawnNpc({ role: "hostage", x: h3.x, z: h3.z, mission: true, shirt: 0xf7f7f2 });
      this.mission = this.blankMission("m1", boss.id, [p1.id, p2.id, p3.id], [boss.id, a.id, b.id, c.id]);
      this.say("משימה: חוטף בתחנה המרכזית");
    } else if (id === "m2") {
      const b = LANDMARKS.m2bus;
      this.missionBus = this.spawnVehicle("bus", b.x, b.z, Math.PI, 0x4a2424, true);
      this.missionBus.mission = true;
      this.missionBus.hp = 520;
      const hs: number[] = [];
      const gs: number[] = [];
      for (let i = 0; i < 4; i++) {
        const spot = open(b.x - 14, b.z + (i - 1.5) * 1.6);
        const h = this.spawnNpc({ role: "hostage", x: spot.x, z: spot.z, mission: true, shirt: 0xf4f1e8 });
        hs.push(h.id);
      }
      const spots = [
        [b.x, b.z + 9],
        [b.x + 9, b.z],
        [b.x + 5, b.z - 9],
        [b.x, b.z - 8],
        [b.x + 7, b.z + 7],
      ];
      for (const [x, z] of spots) {
        const spot = open(x!, z!);
        const g = this.spawnNpc({ role: "hostile", x: spot.x, z: spot.z, mission: true, hold: true, hp: 130 });
        gs.push(g.id);
      }
      this.mission = this.blankMission("m2", gs[0]!, hs, gs);
      this.say("משימה: אוטובוס חטוף בגשר המיתרים");
    } else if (id === "m3") {
      const ib = Math.max(1, RAIL_STOPS.findIndex((s) => s.name === "שער שכם"));
      const a = RAIL_STOPS[ib - 1]!;
      const b = RAIL_STOPS[ib]!;
      const x = a.x + (b.x - a.x) * 0.72;
      const z = a.z + (b.z - a.z) * 0.72;
      const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const train = makeTrain(0xf5c518, "שער שכם");
      train.position.set(x, 0.15, z);
      train.rotation.y = yaw;
      this.scene.add(train);
      this.missionTrain = train;
      const f = fwd(yaw);
      this.missionRear = { x: x - f.x * 14.4, z: z - f.z * 14.4 };
      const rgtSide = rgt(yaw);
      const hs: number[] = [];
      const gs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const cx = x - f.x * i * 7.2;
        const cz = z - f.z * i * 7.2;
        const h = this.spawnNpc({ role: "hostage", x: cx + rgtSide.x * 3.1, z: cz + rgtSide.z * 3.1, mission: true, hold: true, shirt: 0xf4f1e8 });
        h.transit = true;
        hs.push(h.id);
        if (i < 2) {
          const spot = open(cx - rgtSide.x * 4.2, cz - rgtSide.z * 4.2);
          const g = this.spawnNpc({ role: "hostile", x: spot.x, z: spot.z, mission: true, hold: true, hp: 140 });
          gs.push(g.id);
        }
      }
      this.mission = this.blankMission("m3", gs[0]!, hs, gs);
      this.mission.clock = 85;
      this.say("משימה: הרכבת עצורה. עלה מהקרון האחורי");
    } else {
      const near = { x: LANDMARKS.m4pad.x, z: LANDMARKS.m4pad.z };
      const from = LANDMARKS.m4ramot;
      const far = backFrom(from.x, from.z, near.x, near.z, 46);
      const hub = backFrom(from.x, from.z, near.x, near.z, 230);
      const hub2 = backFrom(from.x, from.z, near.x, near.z, 190);
      this.m4hub = hub;
      this.m4pads = [far, near];
      this.padMarks.forEach((mark, i) => {
        const p = this.m4pads[i];
        if (p) mark.position.set(p.x, 0.45, p.z);
      });
      const yaw = Math.atan2(-(near.x - hub.x), -(near.z - hub.z));
      const b1 = this.spawnVehicle("bus", hub.x, hub.z, yaw, 0xf7f4ea, false);
      const b2 = this.spawnVehicle("bus", hub2.x, hub2.z, yaw, 0x1d4e89, false);
      b1.mission = true;
      b2.mission = true;
      const along = backFrom(from.x, from.z, near.x, near.z, 30);
      const rdx = near.x - along.x;
      const rdz = near.z - along.z;
      const rlen = Math.hypot(rdx, rdz) || 1;
      const fx = rdx / rlen;
      const fz = rdz / rlen;
      const lx = -fz;
      const lz = fx;
      const shoot = open(near.x + fx * 26 + lx * 18, near.z + fz * 26 + lz * 18);
      this.m4shooter = shoot;
      const boss = this.spawnNpc({ role: "hostile", x: shoot.x, z: shoot.z, shirt: 0xff2a2a, boss: true, mission: true, hold: true, hp: 280, pin: true });
      const crowd: number[] = [];
      const beside = [
        [8, 0],
        [12, 0],
        [9, 5],
        [9, -5],
        [13, 3],
        [13, -3],
      ];
      beside.forEach(([side, fwdM], i) => {
        const spot = open(shoot.x + lx * side + fx * fwdM, shoot.z + lz * side + fz * fwdM);
        const h = this.spawnNpc({
          role: "hostage",
          x: spot.x,
          z: spot.z,
          mission: true,
          hold: true,
          shirt: i % 2 ? 0xf4f4f4 : 0x1d4e89,
        });
        crowd.push(h.id);
      });
      const rest = tripMeters(hub.x, hub.z, far.x, far.z) + tripMeters(far.x, far.z, near.x, near.z) + tripMeters(near.x, near.z, shoot.x, shoot.z) + 40;
      this.m4Approach = Math.max(60, Math.min(700, 760 - rest));
      this.mission = this.blankMission("m4", boss.id, crowd, [boss.id]);
      this.say("משימה: אוטובוסים על הכביש לספורטק");
    }
    const goal = this.missionAnchor();
    if (goal && this.bringWithin(goal.x, goal.z, this.mission?.id === "m4" ? this.m4Approach : 740)) {
      this.say(`${this.toast} · עד 800 מטר`);
    }
    this.refreshGuide();
    this.banner = this.toast;
    this.bannerT = 3.4;
    this.emit();
  }

  private blankMission(id: MissionId, bossId: number, hostageIds: number[], hostileIds: number[]): Mission {
    return { id, phase: "go", bossId, hostageIds, hostileIds, clock: 0, ramot: false, blocks: 0, ferry: false };
  }

  private offerMission(id: MissionId) {
    if (this.mission) {
      this.say("משימה כבר פעילה");
      return;
    }
    this.paused = true;
    this.opts.onBrief(id);
  }

  private bought(message: string) {
    this.toast = message;
    this.toastT = 2.4;
    this.sfx.cash();
    this.save();
    this.emit();
    return { ok: true, message };
  }

  private say(text: string) {
    this.toast = text;
    this.toastT = 2.6;
  }

  private eventCode(e: KeyboardEvent) {
    if (e.code) return e.code;
    const k = (e.key || "").toLowerCase();
    const map: Record<string, string> = {
      w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD",
      q: "KeyQ", e: "KeyE", f: "KeyF", g: "KeyG", v: "KeyV", b: "KeyB", c: "KeyC", x: "KeyX", z: "KeyZ",
      " ": "Space",
      arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
      escape: "Escape", backspace: "Backspace", tab: "Tab", enter: "Enter",
      control: "ControlLeft", shift: "ShiftLeft",
    };
    return map[k] || "";
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const code = this.eventCode(e);
    if (!code) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) e.preventDefault();
    if (code === "Escape") {
      e.preventDefault();
      if (!e.repeat) this.opts.onTogglePause();
      return;
    }
    if (code === "Backspace") {
      e.preventDefault();
      if (!e.repeat) this.opts.onQuit();
      return;
    }
    if (this.paused) {
      if (code === "Enter" && this.dead && !e.repeat) this.respawn();
      return;
    }
    this.keys.add(code);
    if (e.repeat || this.dead) {
      if (code === "Enter" && this.dead) this.respawn();
      return;
    }
    if (code === "KeyG") this.edge.grenade = true;
    if (code === "KeyF" || code === "KeyE") this.edge.interact = true;
    if (code === "Space") this.edge.fire = true;
    if (code === "KeyZ") this.edge.punch = true;
    if (code === "KeyX") this.edge.kick = true;
    if (code === "KeyC") this.edge.choke = true;
    if (code === "KeyV") {
      const order = ["eyes", "back", "high"] as const;
      this.setCam(order[(order.indexOf(this.camMode) + 1) % order.length]!);
      return;
    }
    if (code === "KeyB") this.requestStop();
    if (code === "KeyQ" || code === "Tab") {
      if (code === "Tab") e.preventDefault();
      this.edge.next = true;
    }
    if (code.startsWith("Digit")) {
      const n = Number(code.slice(5));
      const list = this.loadout();
      const pick = list[n - 1];
      if (pick) {
        this.weapon = pick;
        this.refreshView();
      }
    }
    if (code === "Enter" && this.dead) this.respawn();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const code = this.eventCode(e);
    if (code) this.keys.delete(code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.stickX = 0;
    this.stickY = 0;
    this.stickSX = 0;
    this.stickSY = 0;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.dead) return;
    if (e.button !== 0 && e.button !== 2) return;
    try {
      this.opts.canvas.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    if (this.playMode !== "pc" || e.button !== 0) return;
    try {
      const lock = this.opts.canvas.requestPointerLock();
      void Promise.resolve(lock).catch(() => {});
    } catch {
      /* preview frame may block the lock; mouse still looks */
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.paused) return;
    const touchMouse = (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents;
    if (touchMouse) return;
    const target = e.target;
    if (target instanceof Element && target.closest("button, a, input, textarea, .side-stick, .stick-zone, .lookpad, .touch-ui, .cam-bar, .drive-dock")) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
    const rect = this.opts.canvas.getBoundingClientRect();
    this.pointerNx = (e.clientX - rect.left) / Math.max(1, rect.width);
    this.pointerNy = (e.clientY - rect.top) / Math.max(1, rect.height);
    this.mouseLook = true;
  };

  private onContext = (e: Event) => e.preventDefault();

  private down(code: string) {
    return this.keys.has(code) || this.probe.has(code);
  }

  private frame() {
    if (this.disposed) return;
    try {
      this.frameInner();
    } catch (err) {
      this.fault = err instanceof Error ? err.message : String(err);
    }
  }

  private frameInner() {
    if (this.disposed) return;
    this.timer.update();
    const frameDt = Math.min(this.timer.getDelta(), 0.1);
    if (!this.paused) {
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
    } else this.acc = 0;
    this.renderWorld(frameDt);
    const driving = !this.paused && !this.dead && (this.mode === "vehicle" || this.mode === "train");
    const speed = this.mode === "vehicle" && this.vehicle ? this.vehicle.speed : this.trainSpeed;
    this.sfx.tick(frameDt, {
      driving,
      speed: driving ? speed : 0,
      walking: !this.paused && !this.dead && this.mode === "foot" && this.walking,
      heli: driving && this.mode === "vehicle" && this.vehicle?.kind === "heli",
    });
    this.hudAcc += frameDt;
    if (this.hudAcc >= 0.15) {
      this.hudAcc = 0;
      this.emit();
    }
    this.saveAcc += frameDt;
    if (this.saveAcc >= 2) {
      this.saveAcc = 0;
      this.save();
    }
  }

  private step(dt: number) {
    this.time += dt;
    this.applyLook();
    if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt);
    if (this.bannerT > 0) this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.hurtV > 0) this.hurtV = Math.max(0, this.hurtV - dt * 1.4);
    if (this.hitMarker > 0) this.hitMarker = Math.max(0, this.hitMarker - dt);
    if (this.noise > 0) this.noise = Math.max(0, this.noise - dt);
    this.cool = Math.max(0, this.cool - dt);
    this.meleeCool = Math.max(0, this.meleeCool - dt);

    this.updateTrain(dt);
    this.updateBuses(dt);
    if (this.dead) {
      this.consumeEdges();
      return;
    }

    if (this.mode !== "foot") this.crouch = false;
    if (this.mode === "foot") this.simFoot(dt);
    else if (this.mode === "vehicle" && this.vehicle) this.simVehicle(dt);
    else if (this.mode === "train" || this.mode === "bus") this.rideTransit();

    this.simNpcs(dt);
    this.simProjectiles(dt);
    this.simBits(dt);
    this.combat(dt);
    this.updateMission(dt);
    this.roam(dt);
    if (this.time - this.lastHurt > 3.2 && this.health > 0 && this.health < MAX_HP) {
      this.health = Math.min(MAX_HP, this.health + 11 * dt);
    }
    if (this.pendingAbort) this.flushAbort();
    else if (this.pendingWin) this.flushWin();
    if (this.dieQueued && !this.dead) this.die();
    this.reap();
    this.consumeEdges();
  }

  private consumeEdges() {
    this.edge = {};
  }

  private applyLook() {
    const dx = this.lookX;
    const dy = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    if (!dx && !dy) return;
    if (this.mode === "foot") {
      this.camYaw -= dx * 0.0022;
      this.camPitch = clamp(this.camPitch - dy * 0.0022, -1.15, 1.15);
      return;
    }
    this.rideLook = clamp(this.rideLook - dx * 0.0026, -1.5, 1.5);
    this.ridePitch = clamp(this.ridePitch - dy * 0.0022, -0.75, 1.1);
  }

  private resetRideLook() {
    this.rideLook = 0;
    this.ridePitch = 0.18;
  }

  private stickAxis(v: number) {
    const a = Math.abs(v);
    if (a < 0.08) return 0;
    const t = (a - 0.08) / 0.92;
    return Math.sign(v) * t;
  }

  private smoothStick(dt: number) {
    this.stickSX = THREE.MathUtils.damp(this.stickSX, this.stickX, 24, dt);
    this.stickSY = THREE.MathUtils.damp(this.stickSY, this.stickY, 24, dt);
  }

  private simFoot(dt: number) {
    this.smoothStick(dt);
    const f = fwd(this.camYaw);
    const r = rgt(this.camYaw);
    let ix = 0;
    let iz = 0;
    if (this.down("KeyW") || this.down("ArrowUp")) {
      ix += f.x;
      iz += f.z;
    }
    if (this.down("KeyS") || this.down("ArrowDown")) {
      ix -= f.x;
      iz -= f.z;
    }
    if (this.down("KeyD") || this.down("ArrowRight")) {
      ix += r.x;
      iz += r.z;
    }
    if (this.down("KeyA") || this.down("ArrowLeft")) {
      ix -= r.x;
      iz -= r.z;
    }
    const sx = this.stickAxis(this.stickSX);
    const sy = this.stickAxis(this.stickSY);
    if (this.playMode === "touch") {
      ix += f.x * sy + r.x * sx;
      iz += f.z * sy + r.z * sx;
    }
    const len = Math.hypot(ix, iz) || 1;
    if (Math.hypot(ix, iz) > 1) {
      ix /= len;
      iz /= len;
    }
    this.crouch = this.mode === "foot" && (!!this.held.crouch || this.down("ControlLeft") || this.down("ControlRight"));
    if (this.held.up) this.camPitch = clamp(this.camPitch + dt * 1.2, -1.05, 0.95);
    if (this.held.down) this.camPitch = clamp(this.camPitch - dt * 1.2, -1.05, 0.95);
    const moving = Math.hypot(ix, iz) > 0.08;
    this.walking = moving;
    const stickWalk = this.playMode === "touch" && Math.hypot(sx, sy) > 0.2;
    if (stickWalk && this.camMode !== "eyes") this.yaw = dampAngle(this.yaw, Math.atan2(-ix, -iz), dt, 12);
    else this.yaw = this.camYaw;
    const speed = this.down("ShiftLeft") || this.down("ShiftRight") ? 9.3 : 6.2;
    if (moving) {
      const hit = this.collide(this.playerX, this.playerZ, 0.42, this.playerX + ix * speed * dt, this.playerZ + iz * speed * dt, 0);
      const placed = clampMap(hit.x, hit.z);
      this.playerX = placed.x;
      this.playerZ = placed.z;
    }
    this.animPerson(this.playerParts, moving ? this.time * 10 : this.time * 2, moving);
  }

  private simVehicle(dt: number) {
    const veh = this.vehicle!;
    const spec = VEHICLE_SPEC[veh.kind];
    this.smoothStick(dt);
    let throttle = (this.down("KeyW") || this.down("ArrowUp") ? 1 : 0) - (this.down("KeyS") || this.down("ArrowDown") ? 1 : 0);
    throttle = clamp(throttle + this.stickAxis(this.stickSY) + this.pedal, -1, 1);
    let steer = (this.down("KeyA") || this.down("ArrowLeft") ? 1 : 0) - (this.down("KeyD") || this.down("ArrowRight") ? 1 : 0);
    steer = clamp(steer - this.stickAxis(this.stickSX), -1, 1);
    steer = clamp(steer, -1, 1);
    if (!spec.heli && (this.down("ShiftLeft") || this.down("ShiftRight") || this.held.down)) {
      veh.speed = THREE.MathUtils.damp(veh.speed, 0, 8, dt);
    }
    if (spec.heli) {
      if (this.down("ShiftLeft") || this.down("ShiftRight") || this.held.up) veh.y += 11 * dt;
      if (this.down("ControlLeft") || this.down("ControlRight") || this.held.down) veh.y -= 11 * dt;
      veh.y = clamp(veh.y, 0, 52);
    }
    if (throttle > 0) veh.speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      if (veh.speed > 0) veh.speed -= spec.brake * dt;
      else veh.speed -= spec.accel * 0.55 * dt;
    } else if (Math.abs(veh.speed) < spec.friction * dt) veh.speed = 0;
    else veh.speed -= Math.sign(veh.speed) * spec.friction * dt;
    veh.speed = clamp(veh.speed, -spec.reverse, spec.max);
    const reverse = veh.speed >= 0 ? 1 : -1;
    const sp = spec.heli ? 1 : Math.max(0.35, Math.min(1, Math.abs(veh.speed) / 6));
    if (spec.heli || Math.abs(veh.speed) > 0.3) veh.yaw += steer * spec.turn * sp * (spec.heli ? 1 : reverse) * dt;
    const f = fwd(veh.yaw);
    let nx = veh.x + f.x * veh.speed * dt;
    let nz = veh.z + f.z * veh.speed * dt;
    const prev = veh.speed;
    if (!veh.qa) {
      const alt = spec.heli ? veh.y + 1.3 : 0;
      const hit = this.collide(veh.x, veh.z, spec.radius, nx, nz, alt);
      if (hit.hit) this.crashIntoWorld(veh, prev);
      nx = hit.x;
      nz = hit.z;
    }
    const lim = clampMap(nx, nz);
    veh.x = lim.x;
    veh.z = lim.z;
    if (!veh.qa && !veh.dead) this.ramActors(veh, prev);
    const lim2 = clampMap(veh.x, veh.z);
    veh.x = lim2.x;
    veh.z = lim2.z;
    this.playerX = veh.x;
    this.playerZ = veh.z;
    this.yaw = veh.yaw;
  }

  private crashIntoWorld(veh: Veh, prev: number) {
    const speed = Math.abs(prev);
    if (speed < 4.5) {
      veh.speed *= 0.25;
      return;
    }
    const heli = VEHICLE_SPEC[veh.kind].heli;
    this.sfx.crash();
    this.shake = Math.max(this.shake, Math.min(0.55, speed * 0.02));
    veh.hp -= speed * (veh.kind === "tank" ? 0.4 : heli ? 1.1 : 2.1);
    if (!heli) this.hurt(Math.min(16, speed * 0.2));
    if (speed > 8) this.burst(veh.x, 0.7, veh.z, 0xffe08a, 5, 3);
    veh.speed = -Math.sign(prev || 1) * Math.min(4.5, speed * 0.2);
    if (veh.hp <= 0) this.wreck(veh);
  }

  private ramActors(veh: Veh, prev: number) {
    const spec = VEHICLE_SPEC[veh.kind];
    if (spec.heli && veh.y > 2.2) return;
    const speed = Math.abs(prev);
    this.ramPeople(veh, speed, spec.radius);
    this.ramVehicles(veh, speed, spec.radius);
  }

  private ramPeople(veh: Veh, speed: number, radius: number) {
    if (speed < 2.6) return;
    const reach = radius + 0.65;
    for (const n of this.npcs) {
      if (n.dead || n.stun > 0) continue;
      const dx = n.x - veh.x;
      const dz = n.z - veh.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      const dmg = speed > 7 ? 70 + speed * 7 : 18 + speed * 5;
      this.damageNpc(n, dmg, true);
      const len = Math.hypot(dx, dz) || 1;
      const pushed = this.collide(n.x, n.z, 0.35, n.x + (dx / len) * 1.5, n.z + (dz / len) * 1.5, 0);
      n.x = pushed.x;
      n.z = pushed.z;
      n.stun = 0.55;
      this.sfx.thud();
      this.shake = Math.max(this.shake, 0.16);
      if (veh.kind !== "tank") veh.speed *= 0.78;
    }
  }

  private ramVehicles(veh: Veh, speed: number, radius: number) {
    for (const other of this.vehicles) {
      if (other === veh || other.dead) continue;
      const otherSpec = VEHICLE_SPEC[other.kind];
      if (otherSpec.heli && other.y > 2.2) continue;
      const dx = veh.x - other.x;
      const dz = veh.z - other.z;
      const need = radius + otherSpec.radius * 0.9;
      const dist = Math.hypot(dx, dz);
      if (dist >= need || dist < 0.02) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      veh.x += nx * (need - dist);
      veh.z += nz * (need - dist);
      if (speed < 2.4) {
        veh.speed *= 0.2;
        continue;
      }
      this.sfx.crash();
      this.shake = Math.max(this.shake, Math.min(0.5, speed * 0.018));
      other.hp -= speed * (veh.kind === "tank" ? 9 : 4);
      if (veh.kind !== "tank") veh.hp -= speed * 1.7;
      other.x -= nx * Math.min(1.4, speed * 0.04);
      other.z -= nz * Math.min(1.4, speed * 0.04);
      veh.speed *= veh.kind === "tank" ? 0.72 : 0.32;
      this.hurt(veh.kind === "bike" ? Math.min(20, speed * 0.45) : Math.min(8, speed * 0.12));
      if (speed > 7) this.burst((veh.x + other.x) / 2, 0.8, (veh.z + other.z) / 2, 0xffb020, 6, 4);
      if (other.hp <= 0) this.wreck(other);
      if (veh.hp <= 0) {
        this.wreck(veh);
        break;
      }
    }
  }

  private rideTransit() {
    if (this.mode === "train") {
      const rail = this.rails[this.rideRail];
      if (!rail) {
        this.mode = "foot";
        return;
      }
      this.playerX = rail.mesh.position.x;
      this.playerZ = rail.mesh.position.z;
      this.yaw = rail.yaw;
      this.trainYaw = rail.yaw;
      return;
    }
    const bus = this.buses[this.rideBus];
    if (!bus) {
      this.mode = "foot";
      return;
    }
    this.playerX = bus.x;
    this.playerZ = bus.z;
    this.yaw = bus.yaw;
  }

  private updateTrain(dt: number) {
    for (const rail of this.rails) this.stepRail(rail, dt);
    const riding = this.mode === "train" ? this.rails[this.rideRail] : this.rails[0];
    this.trainSpeed = riding && riding.phase === "move" ? 13 : 0;
    this.trainYaw = riding?.yaw ?? this.trainYaw;
    if (riding) this.train = riding.mesh;
    this.stickPax();
  }

  private stepRail(rail: RailRun, dt: number) {
    const stops = RAIL_STOPS;
    const a = stops[rail.from]!;
    const b = stops[rail.to] ?? a;
    if (rail.phase === "dwell") {
      rail.dwell -= dt;
      if (rail.dwell <= 0) {
        rail.phase = "move";
        rail.t = 0;
      }
    } else {
      const len = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
      rail.t += (13 * dt) / len;
      if (rail.t >= 1) {
        rail.from = rail.to;
        let next = rail.from + rail.dir;
        if (next < 0 || next >= stops.length) {
          rail.dir *= -1;
          next = rail.from + rail.dir;
          setTrainDest(rail.mesh, rail.dir > 0 ? "גבעת התחמושת" : "גשר המיתרים");
        }
        rail.to = next;
        rail.phase = "dwell";
        rail.dwell = stops[rail.from]!.name ? 4.2 : 0.25;
        this.exchange("rail", this.rails.indexOf(rail), rail.from);
      }
    }
    this.placeRail(rail);
    if (rail.phase === "move") this.hitRail(rail);
  }

  private placeRail(rail: RailRun) {
    const stops = RAIL_STOPS;
    const a = stops[rail.from]!;
    const b = stops[rail.to] ?? a;
    const lo = Math.min(rail.from, rail.to);
    const hi = Math.max(rail.from, rail.to);
    const s0 = stops[lo]!;
    const s1 = stops[hi] ?? s0;
    const dx = s1.x - s0.x;
    const dz = s1.z - s0.z;
    const span = Math.hypot(dx, dz) || 1;
    const t = rail.phase === "dwell" ? 0 : Math.min(1, rail.t);
    rail.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    rail.mesh.position.set(a.x + (b.x - a.x) * t + (dz / span) * rail.lane, 0.15, a.z + (b.z - a.z) * t + (-dx / span) * rail.lane);
    rail.mesh.rotation.set(0, rail.yaw, 0);
  }

  private hitRail(rail: RailRun) {
    const ridingThis = this.mode === "train" && this.rails[this.rideRail] === rail;
    for (const c of this.carsOf(rail)) {
      for (const n of this.npcs) {
        if (n.dead || n.stun > 0 || n.transit || n.mission) continue;
        if (Math.hypot(n.x - c.x, n.z - c.z) < 2.3) {
          this.damageNpc(n, 220, ridingThis);
          n.stun = 0.8;
          this.sfx.thud();
        }
      }
      if (!ridingThis && Math.hypot(this.playerX - c.x, this.playerZ - c.z) < 2.15 && (this.mode === "foot" || (this.vehicle && !VEHICLE_SPEC[this.vehicle.kind].heli))) {
        this.hurt(28);
        const r = rgt(rail.yaw);
        this.playerX += r.x * 2;
        this.playerZ += r.z * 2;
        this.shake = Math.max(this.shake, 0.4);
        this.sfx.crash();
      }
    }
  }

  private updateBuses(dt: number) {
    for (const bus of this.buses) {
      const stops = BUS_LINES[bus.line]!.stops;
      const a = stops[bus.from]!;
      const b = stops[bus.to] ?? a;
      if (bus.phase === "dwell") {
        bus.x = a.x;
        bus.z = a.z;
        bus.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
        bus.dwell -= dt;
        if (bus.dwell <= 0) {
          bus.phase = "move";
          bus.t = 0;
          if (!bus.request) {
            const riding = this.pax.some((p) => p.kind === "bus" && p.which === bus.line && p.aboard);
            if (riding && Math.random() < 0.4) bus.request = true;
          }
        }
      } else {
        const len = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
        bus.t += (11 * dt) / len;
        const t = Math.min(1, bus.t);
        bus.x = a.x + (b.x - a.x) * t;
        bus.z = a.z + (b.z - a.z) * t;
        bus.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
        if (bus.t >= 1) {
          bus.from = bus.to;
          let next = bus.from + bus.dir;
          if (next < 0 || next >= stops.length) {
            bus.dir *= -1;
            next = bus.from + bus.dir;
          }
          bus.to = next;
          bus.phase = "dwell";
          bus.dwell = 3.4;
          this.exchange("bus", bus.line, bus.from);
        }
      }
      bus.parts.group.position.set(bus.x, 0, bus.z);
      bus.parts.group.rotation.set(0, bus.yaw, 0);
    }
    this.stickPax();
  }

  private initTransit() {
    const last = RAIL_STOPS.length - 1;
    this.rails = [
      this.makeRail(0, 1, 1, 0, 0xf5c518, "גבעת התחמושת"),
      this.makeRail(last, last - 1, -1, 2.6, 0x7ec8ff, "גשר המיתרים"),
    ];
    this.train = this.rails[0]!.mesh;
    BUS_LINES.forEach((line, lineIndex) => {
      const first = line.stops[0]!;
      const next = line.stops[1] ?? first;
      const parts = makeVehicle("bus", line.color);
      this.scene.add(parts.group);
      const bus: PubBus = {
        line: lineIndex,
        from: 0,
        to: line.stops.length > 1 ? 1 : 0,
        dir: 1,
        t: 0,
        phase: "dwell",
        dwell: 2 + lineIndex,
        request: false,
        x: first.x,
        z: first.z,
        yaw: Math.atan2(-(next.x - first.x), -(next.z - first.z)),
        parts,
      };
      parts.group.position.set(bus.x, 0, bus.z);
      this.buses.push(bus);
      line.stops.forEach((stop, stopIndex) => {
        const npc = this.spawnNpc({ role: "civil", x: stop.x + 1.4, z: stop.z + 1.2, shirt: stopIndex % 2 ? 0xf4f4f4 : 0x2f6fed });
        npc.transit = true;
        this.pax.push({ npc, kind: "bus", which: lineIndex, stop: stopIndex, aboard: false });
      });
    });
    RAIL_STOPS.forEach((stop, stopIndex) => {
      if (!stop.name || stopIndex % 2) return;
      const npc = this.spawnNpc({ role: "civil", x: stop.x + 1.6, z: stop.z + 1.4, shirt: 0x9aa0a6 });
      npc.transit = true;
      this.pax.push({ npc, kind: "rail", which: stopIndex % 2, stop: stopIndex, aboard: false });
    });
  }

  private exchange(kind: "rail" | "bus", which: number, stop: number) {
    for (const p of this.pax) {
      if (p.kind !== kind || p.which !== which || p.npc.dead) continue;
      if (p.aboard && Math.random() < 0.5) {
        p.aboard = false;
        p.stop = stop;
      } else if (!p.aboard && p.stop === stop) p.aboard = true;
    }
    if (kind === "bus") {
      const bus = this.buses.find((b) => b.line === which);
      if (bus && this.pax.some((p) => p.kind === "bus" && p.which === which && p.aboard) && Math.random() < 0.45) bus.request = true;
    }
  }

  private stickPax() {
    for (const p of this.pax) {
      if (p.npc.dead) continue;
      if (p.aboard) {
        const pos = p.kind === "rail" ? this.rails[p.which]?.mesh.position : this.buses[p.which];
        if (!pos) continue;
        p.npc.x = pos.x;
        p.npc.z = pos.z;
        p.npc.parts.group.visible = false;
      } else {
        const stop = p.kind === "rail" ? RAIL_STOPS[p.stop] : BUS_LINES[p.which]?.stops[p.stop];
        if (!stop) continue;
        p.npc.x = stop.x + 1.4;
        p.npc.z = stop.z + 1.2;
        p.npc.parts.group.visible = true;
      }
    }
  }

  requestStop() {
    const bus = this.buses[this.rideBus];
    if (this.mode !== "bus" || !bus) return;
    bus.request = true;
    this.say("ביקשת עצירה בתחנה הבאה");
    this.emit();
  }

  private tryTransit() {
    if (this.mode === "vehicle") return false;
    if (this.mode === "train") {
      const rail = this.rails[this.rideRail];
      if (!rail || rail.phase !== "dwell") {
        this.say("הרכבת עוצרת בכל תחנה");
        return true;
      }
      this.hopOff(RAIL_STOPS[rail.from]!);
      this.mode = "foot";
      this.say(`ירדת · ${RAIL_STOPS[rail.from]!.name || "בין תחנות"}`);
      return true;
    }
    if (this.mode === "bus") {
      const bus = this.buses[this.rideBus];
      if (!bus) return true;
      if (bus.phase !== "dwell" || !bus.request) {
        this.say(bus.request ? "העצירה בתחנה הבאה" : "לחץ עצירה כדי לרדת, אלא אם נוסע ביקש");
        return true;
      }
      const stop = BUS_LINES[bus.line]!.stops[bus.from]!;
      this.hopOff(stop);
      this.mode = "foot";
      this.rideBus = -1;
      bus.request = false;
      this.say(`ירדת · ${stop.name}`);
      return true;
    }
    for (let i = 0; i < this.rails.length; i++) {
      const rail = this.rails[i]!;
      if (rail.phase !== "dwell") continue;
      const stop = RAIL_STOPS[rail.from]!;
      if (!stop.name) continue;
      if (Math.hypot(this.playerX - rail.mesh.position.x, this.playerZ - rail.mesh.position.z) < 12) {
        this.mode = "train";
        this.rideRail = i;
        this.resetRideLook();
        this.trainDriven = false;
        this.playerParts.group.visible = false;
        const way = rail.dir > 0 ? "מגשר המיתרים לגבעת התחמושת" : "מגבעת התחמושת לגשר המיתרים";
        this.say(`רכבת קלה ${way} · ${stop.name} · F לרדת`);
        return true;
      }
    }
    for (let i = 0; i < this.buses.length; i++) {
      const bus = this.buses[i]!;
      if (bus.phase !== "dwell") continue;
      if (Math.hypot(this.playerX - bus.x, this.playerZ - bus.z) < 8) {
        this.mode = "bus";
        this.rideBus = i;
        this.resetRideLook();
        this.playerParts.group.visible = false;
        this.say(`${BUS_LINES[bus.line]!.name} · B או עצירה כדי לרדת`);
        return true;
      }
    }
    return false;
  }

  private hopOff(stop: { x: number; z: number }) {
    const spot = this.unstuck(stop.x + 3.2, stop.z + 3.2);
    this.playerX = spot.x;
    this.playerZ = spot.z;
    this.playerParts.group.visible = true;
    this.view.visible = true;
  }

  private combat(_dt: number) {
    if (this.edge.next) {
      const list = this.loadout();
      const i = list.indexOf(this.weapon);
      this.weapon = list[(i + 1) % list.length] ?? "rifle";
      this.refreshView();
    }
    if (this.edge.grenade) this.throwCurrent(false);
    if (this.edge.punch) this.melee(1.6, 18, 0.25);
    if (this.edge.kick) this.melee(2.05, 30, 0.15);
    if (this.edge.choke) this.tryChoke();
    if (this.edge.interact) this.interact();

    const fireEdge = !!this.edge.fire;
    const fireHeld = this.down("Space") || !!this.held.fire;
    if (this.mode === "vehicle" && this.vehicle) {
      const kind = this.vehicle.kind;
      if (kind === "heli" && fireHeld && this.cool <= 0) {
        this.cool = 0.06;
        const f = fwd(this.vehicle.yaw);
        this.hitscan(this.vehicle.x + f.x * 2, this.vehicle.y + 1.4, this.vehicle.z + f.z * 2, f.x, -0.08, f.z, 16, 0.02, 90, true);
        this.sfx.gun(true);
      } else if (kind === "tank" && fireEdge && this.cool <= 0) {
        this.cool = 0.9;
        const f = fwd(this.vehicle.yaw);
        this.projs.push({
          kind: "shell",
          weapon: "rpg",
          x: this.vehicle.x + f.x * 2.4,
          y: 1.5,
          z: this.vehicle.z + f.z * 2.4,
          vx: f.x * 42,
          vy: 1.5,
          vz: f.z * 42,
          fuse: 3,
          sticky: false,
          stuck: false,
        });
        this.sfx.gun(true);
        this.shake = Math.max(this.shake, 0.25);
      } else if (kind !== "heli" && kind !== "tank") {
        this.firePersonal(fireHeld, fireEdge, fwd(this.vehicle.yaw), this.vehicle.x, 1.4, this.vehicle.z);
      }
      return;
    }
    if (this.mode === "foot") {
      const dir = this.lookDir();
      const oy = this.crouch ? 1.05 : 1.45;
      this.firePersonal(fireHeld, fireEdge, dir, this.playerX + dir.x * 0.55, oy, this.playerZ + dir.z * 0.55, dir.y);
    }
  }

  private lookDir() {
    const yaw = this.camYaw;
    if (this.camMode === "eyes") {
      const cy = Math.cos(this.camPitch);
      return { x: -Math.sin(yaw) * cy, y: Math.sin(this.camPitch), z: -Math.cos(yaw) * cy };
    }
    const ahead = this.camMode === "high" ? 16 : 11;
    const ox = this.playerX;
    const oy = this.crouch ? 1.05 : 1.45;
    const oz = this.playerZ;
    const tx = ox - Math.sin(yaw) * ahead;
    const ty = (this.crouch ? 1.0 : 1.35) + Math.sin(this.camPitch) * (this.camMode === "high" ? 8 : 6);
    const tz = oz - Math.cos(yaw) * ahead;
    const len = Math.hypot(tx - ox, ty - oy, tz - oz) || 1;
    return { x: (tx - ox) / len, y: (ty - oy) / len, z: (tz - oz) / len };
  }

  private firePersonal(held: boolean, edge: boolean, flat: { x: number; z: number }, ox: number, oy: number, oz: number, dy = 0) {
    const w = WEAPONS[this.weapon];
    const trigger = w.auto ? held : edge;
    if (!trigger || this.cool > 0) return;
    if (w.kind === "melee") {
      this.cool = w.rate;
      this.yaw = this.camYaw;
      this.melee(w.range, w.damage, -0.15);
      return;
    }
    if (w.kind === "throw") {
      this.cool = w.rate;
      this.throwWeapon(this.weapon, flat, dy);
      return;
    }
    if (!this.takeAmmo(w.id)) return;
    this.cool = w.rate;
    this.noise = 1.4;
    this.viewKick = 0.12;
    if (w.kind === "launcher") {
      const len = Math.hypot(flat.x, dy, flat.z) || 1;
      this.projs.push({
        kind: "rocket",
        weapon: w.id,
        x: this.playerX + (flat.x / len) * 1.2,
        y: 1.45,
        z: this.playerZ + (flat.z / len) * 1.2,
        vx: (flat.x / len) * w.speed,
        vy: (dy / len) * w.speed + 2,
        vz: (flat.z / len) * w.speed,
        fuse: w.fuse,
        sticky: false,
        stuck: false,
      });
      this.sfx.gun(true);
      return;
    }
    const len = Math.hypot(flat.x, dy, flat.z) || 1;
    this.hitscan(ox, oy, oz, flat.x / len, dy / len, flat.z / len, w.damage, w.spread, w.range, true, w.pellets);
    this.sfx.gun(w.id === "hmg" || w.id === "lmg");
  }

  private throwCurrent(_forceFrag: boolean) {
    const w = WEAPONS[this.weapon];
    const id: WeaponId = w.kind === "throw" ? w.id : "frag";
    if (this.mode === "foot") {
      this.camera.getWorldDirection(this.aim);
      this.throwWeapon(id, { x: this.aim.x, z: this.aim.z }, this.aim.y);
    } else if (this.vehicle) {
      const f = fwd(this.vehicle.yaw);
      this.throwWeapon(id, f, 0.15);
    } else {
      const f = fwd(this.yaw);
      this.throwWeapon(id, f, 0.2);
    }
  }

  private throwWeapon(id: WeaponId, flat: { x: number; z: number }, dy: number) {
    const w = WEAPONS[id];
    if (!this.takeAmmo(id)) return;
    const len = Math.hypot(flat.x, dy, flat.z) || 1;
    this.projs.push({
      kind: "nade",
      weapon: id,
      x: this.playerX + (flat.x / len) * 0.8,
      y: 1.5,
      z: this.playerZ + (flat.z / len) * 0.8,
      vx: (flat.x / len) * w.speed,
      vy: 6 + Math.max(0, dy) * 6,
      vz: (flat.z / len) * w.speed,
      fuse: w.fuse,
      sticky: id === "sticky",
      stuck: false,
    });
    this.sfx.hit();
  }

  private takeAmmo(id: WeaponId) {
    const w = WEAPONS[id];
    if (w.infinite) return true;
    const n = this.ammo[id] ?? 0;
    if (n <= 0) {
      this.say("נגמרה תחמושת");
      return false;
    }
    this.ammo[id] = n - 1;
    return true;
  }

  private hitscan(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, damage: number, spread: number, range: number, byPlayer: boolean, pellets = 1) {
    for (let p = 0; p < pellets; p++) {
      let rx = dx + (Math.random() - 0.5) * spread;
      let ry = dy + (Math.random() - 0.5) * spread;
      let rz = dz + (Math.random() - 0.5) * spread;
      const len = Math.hypot(rx, ry, rz) || 1;
      rx /= len;
      ry /= len;
      rz /= len;
      const hit = this.raycast(ox, oy, oz, rx, ry, rz, range, 0.6);
      const endX = hit ? hit.x : ox + rx * range;
      const endY = hit ? hit.y : oy + ry * range;
      const endZ = hit ? hit.z : oz + rz * range;
      this.tracers.push({ x1: ox, y1: oy, z1: oz, x2: endX, y2: endY, z2: endZ, life: 0.06 });
      if (hit?.npc) this.damageNpc(hit.npc, damage, byPlayer);
      if (hit && !hit.npc) this.burst(endX, endY, endZ, 0xffe08a, 2, 2);
    }
    this.burst(ox, oy, oz, 0xfff1c4, 1, 1);
  }

  private melee(range: number, damage: number, minDot: number) {
    if (this.meleeCool > 0 || this.mode !== "foot") return;
    this.meleeCool = this.weapon === "knife" ? 0.36 : 0.28;
    this.swing = 0.34;
    this.swings += 1;
    const f = fwd(this.camYaw);
    this.yaw = this.camYaw;
    let hit = false;
    for (const n of this.npcs) {
      if (n.dead) continue;
      const dx = n.x - this.playerX;
      const dz = n.z - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.001) continue;
      if ((dx * f.x + dz * f.z) / dist < minDot) continue;
      this.damageNpc(n, damage, true);
      hit = true;
    }
    this.burst(this.playerX + f.x * 1.15, this.crouch ? 0.85 : 1.25, this.playerZ + f.z * 1.15, this.weapon === "knife" ? 0xf5c518 : 0xffd2b0, hit ? 6 : 3, hit ? 3 : 1.4);
    this.sfx.hit();
    if (hit) this.shake = Math.max(this.shake, 0.1);
  }

  private tryChoke() {
    if (this.mode !== "foot") return;
    for (const n of this.npcs) {
      if (n.dead || n.role !== "hostile") continue;
      const dx = this.playerX - n.x;
      const dz = this.playerZ - n.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.65 || dist < 0.05) continue;
      const f = fwd(n.yaw);
      if ((f.x * dx + f.z * dz) / dist > -0.45) continue;
      this.damageNpc(n, 999, true);
      this.say("חניקה");
      this.sfx.hit();
      return;
    }
    this.say("אין מטרה מאחור");
  }

  private interact() {
    if (this.freeMission()) return;
    if (this.tryTransit()) return;
    if (this.mode === "vehicle") {
      this.exitVehicle();
      return;
    }
    if (this.mission?.phase === "extract" && this.missionBus) {
      const d = Math.hypot(this.playerX - this.missionBus.x, this.playerZ - this.missionBus.z);
      if (d < 9) {
        this.releaseHostages();
        this.say("החטופים שוחררו");
        return;
      }
    }
    let best: Veh | null = null;
    let bestD = 6.4;
    for (const v of this.vehicles) {
      if (v.dead || v.locked) continue;
      const d = Math.hypot(this.playerX - v.x, this.playerZ - v.z);
      const limit = v.kind === "bus" ? 7 : v.kind === "heli" || v.kind === "tank" ? 6 : 4.6;
      if (d < limit && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    if (best) {
      this.mode = "vehicle";
      this.vehicle = best;
      this.resetRideLook();
      this.playerParts.group.visible = false;
      this.view.visible = false;
      this.say(VEH_NAME[best.kind]);
      return;
    }
    if (Math.hypot(this.playerX - LANDMARKS.shop.x, this.playerZ - LANDMARKS.shop.z) < 12) {
      this.paused = true;
      this.opts.onShop();
      return;
    }
    if (!this.mission && Math.hypot(this.playerX - LANDMARKS.m1.x, this.playerZ - LANDMARKS.m1.z) < 18) {
      this.offerMission("m1");
      return;
    }
    if (!this.mission && Math.hypot(this.playerX - LANDMARKS.m2.x, this.playerZ - LANDMARKS.m2.z) < 18) {
      this.offerMission("m2");
      return;
    }
    if (!this.mission && Math.hypot(this.playerX - LANDMARKS.m3.x, this.playerZ - LANDMARKS.m3.z) < 22) {
      this.offerMission("m3");
      return;
    }
    if (!this.mission && this.nearSportBrief()) {
      this.offerMission("m4");
      return;
    }
  }

  private freeMission() {
    const m = this.mission;
    if (!m || this.mode !== "foot") return false;
    if (m.id === "m3") {
      let freedNow = false;
      for (const id of m.hostageIds) {
        const n = this.npcById(id);
        if (!n || n.dead || n.safe) continue;
        if (Math.hypot(this.playerX - n.x, this.playerZ - n.z) > 6) continue;
        n.safe = true;
        n.running = true;
        n.hold = false;
        n.transit = false;
        freedNow = true;
        if (m.phase === "go") m.phase = "fight";
      }
      if (!freedNow) return false;
      const left = m.hostageIds.filter((id) => !this.npcById(id)?.safe).length;
      this.say(left === 0 ? "כל הנוסעים בחוץ" : `נוסע שוחרר. נשארו ${left}`);
      return true;
    }
    if (m.id === "m2" && m.phase === "extract" && this.missionBus) {
      if (Math.hypot(this.playerX - this.missionBus.x, this.playerZ - this.missionBus.z) > 9) return false;
      this.releaseHostages();
      this.say("החטופים שוחררו");
      return true;
    }
    return false;
  }

  private releaseHostages() {
    if (!this.mission) return;
    for (const id of this.mission.hostageIds) {
      const n = this.npcById(id);
      if (!n || n.dead) continue;
      n.safe = true;
      n.running = true;
      n.hold = false;
      n.transit = false;
    }
  }

  private exitVehicle() {
    if (!this.vehicle) return;
    const v = this.vehicle;
    const r = rgt(v.yaw);
    this.playerX = v.x + r.x * (VEHICLE_SPEC[v.kind].radius + 1.3);
    this.playerZ = v.z + r.z * (VEHICLE_SPEC[v.kind].radius + 1.3);
    this.mode = "foot";
    this.vehicle = null;
    this.playerParts.group.visible = true;
    this.camYaw = v.yaw;
    this.yaw = v.yaw;
  }

  private simNpcs(dt: number) {
    for (const n of this.npcs) {
      if (n.dead) {
        n.deathT += dt;
        continue;
      }
      if (n.stun > 0) {
        n.stun -= dt;
        continue;
      }
      if (n.role === "hostage" && !n.running) {
        const threat = this.nearest(n, "hostile", 60);
        n.panic = !!threat;
        if (threat) {
          const dx = threat.x - n.x;
          const dz = threat.z - n.z;
          const dist = Math.hypot(dx, dz) || 1;
          n.yaw = Math.atan2(-dx, -dz);
          if (!n.transit && dist < 11) {
            const f = fwd(n.yaw);
            const step = 1.2 * dt;
            const hit = this.collide(n.x, n.z, 0.4, n.x - f.x * step, n.z - f.z * step, 0);
            n.x = hit.x;
            n.z = hit.z;
          }
        }
        continue;
      }
      if (n.transit) continue;
      if (n.running) {
        const dx = LANDMARKS.safe.x - n.x;
        const dz = LANDMARKS.safe.z - n.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.2) n.safe = true;
        else {
          n.yaw = Math.atan2(-dx, -dz);
          this.moveNpc(n, 4.6 * dt);
        }
        continue;
      }
      if (n.role === "civil") {
        const threat = this.nearest(n, "hostile", 42);
        n.panic = !!threat;
        if (n.panic || (this.noise > 0 && Math.hypot(n.x - this.playerX, n.z - this.playerZ) < 18)) {
          const sx = threat ? threat.x : this.playerX;
          const sz = threat ? threat.z : this.playerZ;
          const dx = n.x - sx;
          const dz = n.z - sz;
          n.yaw = Math.atan2(-dx, -dz);
          this.moveNpc(n, 4.2 * dt);
        } else {
          n.wander -= dt;
          if (n.wander <= 0) {
            n.yaw = Math.random() * Math.PI * 2;
            n.wander = 1.6 + Math.random() * 3;
          }
          this.moveNpc(n, 1.5 * dt);
        }
        continue;
      }
      const pd = Math.hypot(n.x - this.playerX, n.z - this.playerZ);
      if (n.pin) {
        if (pd < 110) {
          const dx = this.playerX - n.x;
          const dz = this.playerZ - n.z;
          n.yaw = dampAngle(n.yaw, Math.atan2(-dx, -dz), dt, 6);
          n.cool -= dt;
          if (n.cool <= 0 && pd > 8 && pd < 90 && !this.blocked(n.x, n.z, this.playerX, this.playerZ)) {
            n.cool = 0.85;
            this.tracers.push({ x1: n.x, y1: 1.35 + n.lift, z1: n.z, x2: this.playerX, y2: 1.2, z2: this.playerZ, life: 0.08 });
            if (Math.random() < 0.16 && !this.inCover(n.x, n.z)) this.hurt(10);
          }
        }
        continue;
      }
      if (n.hold && pd < 32) n.hold = false;
      if (n.hold) {
        const victim = this.nearest(n, "hostage", 40) ?? this.nearest(n, "civil", 30);
        if (victim) n.yaw = dampAngle(n.yaw, Math.atan2(-(victim.x - n.x), -(victim.z - n.z)), dt, 5);
        continue;
      }
      let tx = 0;
      let tz = 0;
      let has = false;
      const seeP = pd < 48 && !this.blocked(n.x, n.z, this.playerX, this.playerZ);
      if (seeP && !n.hold) {
        tx = this.playerX;
        tz = this.playerZ;
        has = true;
      } else if (n.roam) {
        const civ = this.nearest(n, "civil", 28);
        if (civ) {
          tx = civ.x;
          tz = civ.z;
          has = true;
        }
      }
      if (!has) {
        n.wander -= dt;
        if (n.wander <= 0) {
          n.yaw += 1.2;
          n.wander = 1.5;
        }
        continue;
      }
      const dx = tx - n.x;
      const dz = tz - n.z;
      const dist = Math.hypot(dx, dz) || 1;
      n.yaw = dampAngle(n.yaw, Math.atan2(-dx, -dz), dt, 8);
      if (dist > 8) this.moveNpc(n, 3.3 * dt);
      n.cool -= dt;
      const smoked = this.inSmoke(n.x, n.z);
      if (n.cool <= 0 && dist < 36 && !this.blocked(n.x, n.z, tx, tz)) {
        n.cool = 0.42 + Math.random() * 0.45;
        const acc = (smoked ? 0.05 : 0.2) * (n.boss ? 1.25 : 1);
        const f = fwd(n.yaw);
        this.tracers.push({ x1: n.x, y1: 1.35, z1: n.z, x2: tx, y2: 1.2, z2: tz, life: 0.05 });
        if (Math.random() < acc) {
          if (Math.hypot(tx - this.playerX, tz - this.playerZ) < 1.2 && !this.inCover(n.x, n.z)) this.hurt(n.boss ? 12 : 8);
          else {
            const victim = this.npcs.find((c) => !c.dead && c.role !== "hostile" && Math.hypot(c.x - tx, c.z - tz) < 1.3);
            if (victim) {
              this.damageNpc(victim, 14, false);
              if (victim.hp <= 0) this.say("מחבל פגע באזרח");
            }
          }
        }
        void f;
      }
    }
  }

  private moveNpc(n: Npc, dist: number) {
    const f = fwd(n.yaw);
    const beforeX = n.x;
    const beforeZ = n.z;
    const hit = this.collide(n.x, n.z, 0.4, n.x + f.x * dist, n.z + f.z * dist, 0);
    n.x = hit.x;
    n.z = hit.z;
    if (Math.hypot(n.x - beforeX, n.z - beforeZ) < dist * 0.25) n.yaw += 1.7;
  }

  private nearest(from: Npc, role: Role, max: number) {
    let best: Npc | null = null;
    let bestD = max;
    for (const n of this.npcs) {
      if (n === from || n.dead || n.role !== role) continue;
      const d = Math.hypot(n.x - from.x, n.z - from.z);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private simProjectiles(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]!;
      if (!p.stuck) {
        p.vy -= (p.kind === "nade" ? 14 : 6) * dt;
        const steps = 2;
        let boom = false;
        for (let s = 0; s < steps && !boom; s++) {
          p.x += (p.vx * dt) / steps;
          p.y += (p.vy * dt) / steps;
          p.z += (p.vz * dt) / steps;
          if (p.y <= 0.25) {
            p.y = 0.25;
            if (p.sticky || p.kind !== "nade") {
              p.stuck = p.sticky;
              if (p.kind !== "nade") boom = true;
              else {
                p.vy = Math.abs(p.vy) * 0.35;
                p.vx *= 0.55;
                p.vz *= 0.55;
              }
            } else {
              p.vy = Math.abs(p.vy) * 0.35;
              p.vx *= 0.6;
              p.vz *= 0.6;
            }
          }
          if (this.pointBlocked(p.x, p.y, p.z)) {
            if (p.sticky) {
              p.stuck = true;
              p.vx = p.vy = p.vz = 0;
            } else boom = true;
          }
        }
        if (boom) {
          this.explode(p);
          this.projs.splice(i, 1);
          continue;
        }
      }
      p.fuse -= dt;
      if (p.fuse <= 0) {
        this.explode(p);
        this.projs.splice(i, 1);
      }
    }
    for (const c of this.clouds) c.life -= dt;
    this.clouds = this.clouds.filter((c) => {
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        return false;
      }
      c.mesh.position.set(c.x, c.y + (8 - c.life) * 0.15, c.z);
      const s = c.r * (0.55 + (1 - c.life / 8) * 0.5);
      c.mesh.scale.setScalar(s);
      return true;
    });
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i]!.life -= dt;
      if (this.tracers[i]!.life <= 0) this.tracers.splice(i, 1);
    }
  }

  private explode(p: Proj) {
    const w = WEAPONS[p.weapon];
    if (w.stun > 0) {
      for (const n of this.npcs) {
        if (n.dead) continue;
        if (Math.hypot(n.x - p.x, n.z - p.z) < w.blast) n.stun = Math.max(n.stun, w.stun);
      }
      this.burst(p.x, p.y, p.z, 0xf5c518, 8, 6);
      this.sfx.boom();
      return;
    }
    if (w.smoke > 0) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xc8c2b4, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      mesh.position.set(p.x, 1, p.z);
      this.scene.add(mesh);
      this.clouds.push({ mesh, x: p.x, y: 1, z: p.z, life: w.smoke, r: 1 });
      return;
    }
    const radius = p.kind === "shell" ? 5.2 : w.blast || 5;
    const damage = p.kind === "shell" ? 170 : w.damage;
    for (const n of this.npcs) {
      if (n.dead) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < radius) this.damageNpc(n, damage * (1 - d / radius), true);
    }
    const pd = Math.hypot(this.playerX - p.x, this.playerZ - p.z);
    if (pd < radius) this.hurt(damage * (1 - pd / radius) * 0.42);
    for (const v of this.vehicles) {
      if (v.dead || v.qa) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < radius + 1) {
        v.hp -= damage * (1 - d / (radius + 1));
        if (v.hp <= 0) this.wreck(v);
      }
    }
    this.burst(p.x, p.y, p.z, 0xff6a1a, 12, 8);
    this.sfx.boom();
    this.shake = Math.max(this.shake, 0.45);
  }

  private wreck(v: Veh) {
    if (v.dead) return;
    v.dead = true;
    v.speed = 0;
    v.parts.group.visible = false;
    this.burst(v.x, 1, v.z, 0xff4a1a, 14, 9);
    if (this.vehicle === v) {
      this.exitVehicle();
      this.hurt(30);
    }
    if (v === this.missionBus || (v.mission && this.mission?.id === "m4")) this.pendingAbort = "המשימה נכשלה — האוטובוס הושמד";
  }

  private simBits(dt: number) {
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy -= 9 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y < 0.1) b.y = 0.1;
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.visible = b.life > 0;
    }
  }

  private burst(x: number, y: number, z: number, color: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const b = this.bits.find((bit) => bit.life <= 0);
      if (!b) return;
      b.life = 0.25 + Math.random() * 0.35;
      b.x = x;
      b.y = y;
      b.z = z;
      b.vx = (Math.random() - 0.5) * speed;
      b.vy = Math.random() * speed;
      b.vz = (Math.random() - 0.5) * speed;
      (b.mesh.material as THREE.MeshLambertMaterial).color.setHex(color);
      b.mesh.visible = true;
    }
  }

  private updateMission(dt: number) {
    void dt;
    const m = this.mission;
    if (!m || this.pendingAbort) return;
    const hostageDead = m.hostageIds.some((id) => {
      const n = this.npcById(id);
      return !n || n.dead;
    });
    if (hostageDead) {
      this.pendingAbort = "המשימה נכשלה — חטוף נהרג";
      return;
    }
    const anchor = this.missionAnchor();
    if ((m.id === "m1" || m.id === "m2") && m.phase === "go" && anchor && Math.hypot(this.playerX - anchor.x, this.playerZ - anchor.z) < 26) m.phase = "fight";
    if (m.id === "m1") {
      const boss = this.npcById(m.bossId);
      if (!boss || boss.dead) this.pendingWin = M1_PAY;
      return;
    }
    if (m.id === "m3") {
      const freed = m.hostageIds.filter((id) => this.npcById(id)?.safe).length;
      if (m.hostageIds.length > 0 && freed === m.hostageIds.length) {
        this.pendingWin = M3_PAY;
        return;
      }
      const near = Math.hypot(this.playerX - this.missionRear.x, this.playerZ - this.missionRear.z) < 12
        || m.hostageIds.some((id) => {
          const n = this.npcById(id);
          return !!n && !n.dead && Math.hypot(this.playerX - n.x, this.playerZ - n.z) < 8;
        });
      if (m.phase === "go" && near) {
        m.phase = "fight";
        this.say("F ליד כל נוסע, לפני שהרכבת זזה");
      }
      if (m.phase !== "go") {
        m.clock -= dt;
        if (m.clock <= 0) {
          this.pendingAbort = "הרכבת זזה לפני ששחררת את כולם";
          return;
        }
      }
      return;
    }
    if (m.id === "m4") {
      if (!m.ramot && Math.hypot(this.playerX - this.m4hub.x, this.playerZ - this.m4hub.z) < 42) {
        m.ramot = true;
        m.phase = "block";
        this.say("האוטובוסים כאן. לחץ F ועלה");
      }
      const pads = this.m4pads;
      const buses = this.missionBuses();
      const used = new Set<number>();
      for (const v of buses) {
        pads.forEach((p, i) => {
          if (used.has(i)) return;
          if (Math.hypot(v.x - p.x, v.z - p.z) < 18 && Math.abs(v.speed) < 4) used.add(i);
        });
      }
      if (m.ramot) {
        m.blocks = used.size;
        if (m.blocks === 1 && !m.ferry) {
          const loose = buses.find((v) => v !== this.vehicle && !this.busOnPad(v, pads));
          const free = pads.find((_, i) => !used.has(i));
          if (loose && free && Math.hypot(loose.x - this.playerX, loose.z - this.playerZ) > 70) {
            this.deliverBus(loose, free);
            m.ferry = true;
            this.say("האוטובוס השני הופיע לידך. לחץ F ועלה עליו");
          }
        }
        if (m.blocks >= 2 && m.phase !== "fight") {
          m.phase = "fight";
          const boss = this.npcById(m.bossId);
          if (boss && !boss.dead) this.say("היורה מולך, סימן אדום מעל הראש");
        }
      }
      const boss = this.npcById(m.bossId);
      if (m.phase === "fight" && (!boss || boss.dead)) this.pendingWin = M4_PAY;
      return;
    }
    const guards = m.hostileIds.some((id) => {
      const n = this.npcById(id);
      return n && !n.dead;
    });
    if (!guards && m.phase !== "extract") m.phase = "extract";
    if (m.phase === "extract") {
      const ready = m.hostageIds.every((id) => this.npcById(id)?.safe);
      if (ready) this.pendingWin = M2_PAY;
    }
  }

  private missionAnchor() {
    const m = this.mission;
    if (!m) return null;
    if (m.id === "m1") return LANDMARKS.m1fight;
    if (m.id === "m2") return LANDMARKS.m2bus;
    if (m.id === "m3") {
      if (m.phase === "go") return this.missionRear;
      const next = m.hostageIds.map((id) => this.npcById(id)).find((n) => n && !n.dead && !n.safe);
      return next ? { x: next.x, z: next.z } : this.missionRear;
    }
    if (!m.ramot) return this.m4hub;
    if (m.blocks >= 2 || m.phase === "fight") return this.m4shooter;
    const pads = this.m4pads;
    const buses = this.missionBuses();
    const driving = this.vehicle && buses.includes(this.vehicle) && !this.busOnPad(this.vehicle, pads);
    if (driving) return this.freePad(pads);
    let best: Veh | null = null;
    let bestD = 1e12;
    for (const v of buses) {
      if (this.busOnPad(v, pads)) continue;
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    if (best) return { x: best.x, z: best.z };
    return this.freePad(pads);
  }

  private missionBuses() {
    return this.vehicles.filter((v) => v.mission && v.kind === "bus" && !v.dead);
  }

  private busOnPad(v: Veh, pads: { x: number; z: number }[]) {
    return pads.some((p) => Math.hypot(v.x - p.x, v.z - p.z) < 18 && Math.abs(v.speed) < 4);
  }

  private freePad(pads: { x: number; z: number }[]) {
    const open = pads.find((p) => !this.missionBuses().some((v) => v !== this.vehicle && Math.hypot(v.x - p.x, v.z - p.z) < 18 && Math.abs(v.speed) < 4));
    return open ?? pads[0]!;
  }

  private deliverBus(v: Veh, pad: { x: number; z: number }) {
    const dx = this.playerX - pad.x;
    const dz = this.playerZ - pad.z;
    const len = Math.hypot(dx, dz) || 1;
    const sideX = -dz / len;
    const sideZ = dx / len;
    let drop = this.unstuck(this.playerX + sideX * 24, this.playerZ + sideZ * 24);
    if (Math.hypot(drop.x - pad.x, drop.z - pad.z) < 20) drop = this.unstuck(this.playerX + sideX * 36, this.playerZ + sideZ * 36);
    v.x = drop.x;
    v.z = drop.z;
    v.speed = 0;
    v.yaw = Math.atan2(-(pad.x - drop.x), -(pad.z - drop.z));
  }

  private nearSportBrief() {
    if (Math.hypot(this.playerX - LANDMARKS.m4.x, this.playerZ - LANDMARKS.m4.z) < 26) return true;
    if (Math.hypot(this.playerX - LANDMARKS.m4ramot.x, this.playerZ - LANDMARKS.m4ramot.z) < 42) return true;
    const ramot = SPAWNS.find((s) => s.id === "ramot");
    return !!ramot && Math.hypot(this.playerX - ramot.x, this.playerZ - ramot.z) < 32;
  }

  private bringWithin(tx: number, tz: number, maxLeft: number) {
    if (tripMeters(this.playerX, this.playerZ, tx, tz) <= maxLeft + 15) return false;
    const spot = backFrom(this.playerX, this.playerZ, tx, tz, maxLeft);
    const free = this.unstuck(spot.x, spot.z);
    this.playerX = free.x;
    this.playerZ = free.z;
    const yaw = Math.atan2(-(tx - free.x), -(tz - free.z));
    this.yaw = yaw;
    this.camYaw = yaw;
    if (this.mode === "train" || this.mode === "bus") {
      this.mode = "foot";
      this.trainDriven = false;
      this.rideBus = -1;
      this.playerParts.group.visible = true;
    }
    if (this.vehicle) {
      this.vehicle.x = free.x;
      this.vehicle.z = free.z;
      this.vehicle.speed = 0;
      this.vehicle.yaw = yaw;
    }
    return true;
  }

  private refreshGuide() {
    const a = this.missionAnchor();
    this.guide = a ? guidePoint(this.playerX, this.playerZ, a.x, a.z) : null;
  }

  private flushAbort() {
    const reason = this.pendingAbort;
    this.pendingAbort = null;
    this.pendingWin = 0;
    if (!this.mission) return;
    this.clearMissionPawns(true);
    this.mission = null;
    this.banner = reason ?? "המשימה נכשלה";
    this.bannerT = 3.5;
    this.toast = this.banner;
    this.toastT = 3.5;
    this.save();
    this.emit();
  }

  private flushWin() {
    const pay = this.pendingWin;
    this.pendingWin = 0;
    if (!this.mission) return;
    const done = this.mission;
    this.money += pay;
    this.releaseSurvivors();
    if (this.missionBus) this.missionBus.locked = false;
    if (this.missionTrain) {
      this.scene.remove(this.missionTrain);
      this.missionTrain = null;
    }
    this.mission = null;
    const title = done.id === "m1" ? "חיסול בתחנה" : done.id === "m2" ? "חילוץ האוטובוס" : done.id === "m3" ? "חילוץ הרכבת" : "הגמר בספורטק";
    this.banner = `${title} הושלמה · +₪${pay.toLocaleString("he-IL")}`;
    this.bannerT = 6;
    this.toast = this.banner;
    this.toastT = 6;
    this.sfx.cash();
    this.save();
    this.emit();
  }

  private roam(dt: number) {
    void dt;
    if (this.mission) return;
    if (this.time < this.nextRoam) return;
    for (const n of this.npcs) {
      if (n.role === "hostile" && n.roam && !n.dead && Math.hypot(n.x - this.playerX, n.z - this.playerZ) > 150) this.killNpc(n, "world");
    }
    const alive = this.npcs.filter((n) => n.role === "hostile" && !n.dead && n.roam).length;
    if (alive > 0) {
      this.nextRoam = this.time + 1.5;
      return;
    }
    this.waveN += 1;
    const surge = this.waveN % 10 === 0;
    const count = surge ? 4 : 2;
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 26 + Math.random() * 18;
      const x = this.playerX + Math.cos(a) * dist;
      const z = this.playerZ + Math.sin(a) * dist;
      if (inKotelZone(x, z)) continue;
      const spot = this.unstuck(x, z);
      this.spawnNpc({ role: "hostile", x: spot.x, z: spot.z, roam: true, mission: false, hold: false });
      placed++;
    }
    if (!placed) {
      this.nextRoam = this.time + 4;
      return;
    }
    this.say(surge ? "דיווח: ארבעה מחבלים באזור" : "דיווח: שני מחבלים חמושים");
    this.nextRoam = this.time + 6;
  }

  private renderWorld(dt: number) {
    this.refreshGuide();
    const onFoot = this.mode === "foot" && !this.dead;
    const eyes = this.camMode === "eyes" && onFoot;
    const high = this.camMode === "high";
    const fov = eyes ? 78 : high ? 64 : this.mode === "foot" ? 70 : 62;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    let tx = this.playerX;
    let ty = 1.45;
    let tz = this.playerZ;
    let yaw = this.camYaw;
    let dist = 5.5;
    if (this.mode === "vehicle" && this.vehicle) {
      yaw = this.vehicle.yaw + this.rideLook;
      const heli = VEHICLE_SPEC[this.vehicle.kind].heli;
      dist = heli ? 12 : this.vehicle.kind === "tank" ? 9 : this.vehicle.kind === "bus" ? 11 : 7.2;
      ty = heli ? this.vehicle.y + 3.2 : 2.4;
    } else if (this.mode === "train" || this.mode === "bus") {
      yaw = (this.mode === "train" ? (this.rails[this.rideRail]?.yaw ?? this.yaw) : (this.buses[this.rideBus]?.yaw ?? this.yaw)) + this.rideLook;
      dist = this.mode === "train" ? 12 : 11;
      ty = 3;
    }
    const pitch = this.mode === "foot" ? this.camPitch : this.ridePitch;
    const cy = Math.cos(pitch);
    const sy = Math.sin(pitch);
    const fx = -Math.sin(yaw) * cy;
    const fy = sy;
    const fz = -Math.cos(yaw) * cy;
    let cx: number;
    let cyw: number;
    let cz: number;
    let lookX: number;
    let lookY: number;
    let lookZ: number;
    if (eyes) {
      const bob = this.walking && !this.crouch ? Math.sin(this.time * 10) * 0.04 : 0;
      const eye = (this.crouch ? 1.02 : 1.62) + bob;
      cx = this.playerX;
      cyw = eye;
      cz = this.playerZ;
      lookX = cx + fx;
      lookY = cyw + fy;
      lookZ = cz + fz;
      this.camera.position.set(cx, cyw, cz);
    } else if (this.camMode === "eyes") {
      const hx = -Math.sin(yaw);
      const hz = -Math.cos(yaw);
      cx = tx - hx * 0.35;
      cz = tz - hz * 0.35;
      cyw = ty + 0.45;
      lookX = cx + fx * 8;
      lookY = cyw + fy * 8;
      lookZ = cz + fz * 8;
      this.camera.position.set(cx, cyw, cz);
    } else if (this.mode === "foot") {
      const orbit = clamp(this.camPitch, -0.25, 0.85);
      const back = high ? 7.6 : 4.5;
      cx = tx + Math.sin(yaw) * back;
      cz = tz + Math.cos(yaw) * back;
      cyw = (high ? 4.35 : 1.85) + orbit * (high ? 0.45 : 0.9) + (this.crouch ? -0.35 : 0);
      const clipped = this.clipCam(tx, tz, cx, cz);
      cx = clipped.x;
      cz = clipped.z;
      const k = this.camReady ? 1 - Math.exp(-10 * dt) : 1;
      this.camera.position.x += (cx - this.camera.position.x) * k;
      this.camera.position.y += (cyw - this.camera.position.y) * k;
      this.camera.position.z += (cz - this.camera.position.z) * k;
      const ahead = high ? 16 : 11;
      lookX = tx - Math.sin(yaw) * ahead;
      lookY = (this.crouch ? 1.0 : 1.35) + Math.sin(this.camPitch) * (high ? 8 : 6);
      lookZ = tz - Math.cos(yaw) * ahead;
    } else {
      const chase = high ? dist + 5.2 : dist;
      const lift = high ? 3.4 : 0.4;
      cx = tx - fx * chase;
      cyw = ty - fy * chase + lift;
      cz = tz - fz * chase;
      const clipped = this.clipCam(tx, tz, cx, cz);
      cx = clipped.x;
      cz = clipped.z;
      const k = this.camReady ? 1 - Math.exp(-8 * dt) : 1;
      this.camera.position.x += (cx - this.camera.position.x) * k;
      this.camera.position.y += (cyw - this.camera.position.y) * k;
      this.camera.position.z += (cz - this.camera.position.z) * k;
      lookX = tx;
      lookY = ty;
      lookZ = tz;
    }
    this.camReady = true;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.camera.lookAt(lookX, lookY, lookZ);

    this.playerParts.group.visible = (this.mode === "foot" || this.dead) && (this.camMode !== "eyes" || this.dead);
    this.playerParts.group.position.set(this.playerX, this.crouch ? -0.48 : 0, this.playerZ);
    this.playerParts.group.rotation.set(0, this.yaw, 0);
    if (this.swing > 0) {
      const k = this.swing / 0.34;
      this.playerParts.armR.rotation.x = -1.45 * k;
      if (this.weapon === "fists") this.playerParts.armL.rotation.x = -1.15 * k;
      this.swing = Math.max(0, this.swing - dt);
    } else if (this.weapon === "fists" && this.mode === "foot") {
      this.playerParts.armL.rotation.x = -0.85;
      this.playerParts.armR.rotation.x = -0.85;
    }
    this.view.visible = eyes;
    this.view.position.z = -0.58 - this.viewKick;
    this.viewKick = Math.max(0, this.viewKick - dt * 3);

    for (const n of this.npcs) {
      n.parts.group.position.set(n.x, (n.dead ? 0.35 : 0) + n.lift, n.z);
      const cower = !n.dead && n.panic && n.role === "hostage" && !n.running;
      n.parts.group.rotation.set(n.dead ? -1.2 : cower ? 0.32 : 0, n.yaw, 0);
      const moving = !n.dead && !cower && (n.role === "civil" || n.role === "hostile" || n.running);
      this.animPerson(n.parts, moving ? this.time * (n.role === "civil" ? 8 : 11) : this.time * 2, moving, cower);
      n.parts.rifle.visible = n.role === "hostile" && !n.dead;
      if (n.parts.mark) {
        n.parts.mark.visible = n.role === "hostile" && !n.dead;
        n.parts.mark.position.y = Math.sin(this.time * 4 + n.id) * 0.18;
      }
    }
    for (const v of this.vehicles) {
      v.parts.group.position.set(v.x, v.kind === "heli" ? v.y : 0, v.z);
      v.parts.group.rotation.set(0, v.yaw, 0);
      for (const w of v.parts.wheels) w.rotation.x += v.speed * dt * 1.4;
      if (v.parts.rotor) v.parts.rotor.rotation.y += dt * (v.kind === "heli" && (this.vehicle === v || v.y > 0.4) ? 18 : 2);
      if (v.parts.rotorTail) v.parts.rotorTail.rotation.x += dt * 16;
    }
    for (const p of this.projs) {
      /* drawn as bursts only; a tiny mesh would be nicer — reuse bits via position stored */
      void p;
    }
    this.drawProjectiles();
    this.drawTracers();

    const spin = this.time * 1.6;
    this.m1mark.rotation.y = spin;
    this.m2mark.rotation.y = spin;
    this.m3mark.rotation.y = spin;
    this.m4mark.rotation.y = spin;
    this.m1mark.position.y = 2.2 + Math.sin(this.time * 3) * 0.25;
    this.m2mark.position.y = 2.2 + Math.sin(this.time * 3 + 1) * 0.25;
    this.m3mark.position.y = 2.2 + Math.sin(this.time * 3 + 2) * 0.25;
    this.m4mark.position.y = 2.2 + Math.sin(this.time * 3 + 3) * 0.25;
    const showMarks = !this.mission;
    this.m1mark.visible = showMarks;
    this.m2mark.visible = showMarks;
    this.m3mark.visible = showMarks;
    this.m4mark.visible = showMarks;
    const g = this.guide;
    if (g) {
      this.beacon.visible = true;
      this.beacon.position.set(g.x, 26, g.z);
    } else this.beacon.visible = false;
    const showPads = this.mission?.id === "m4" && this.mission.ramot && this.mission.blocks < 2;
    this.padMarks.forEach((mark, i) => {
      mark.visible = !!showPads;
      mark.position.y = 0.5 + Math.sin(this.time * 3 + i) * 0.1;
    });

    this.drawMap();
    this.renderer.render(this.scene, this.camera);
  }

  private projPool: THREE.Mesh[] = [];
  private drawProjectiles() {
    while (this.projPool.length < this.projs.length) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshLambertMaterial({ color: 0x3d6b32 }));
      this.scene.add(mesh);
      this.projPool.push(mesh);
    }
    this.projPool.forEach((mesh, i) => {
      const p = this.projs[i];
      mesh.visible = !!p;
      if (!p) return;
      mesh.position.set(p.x, p.y, p.z);
      const col = p.kind === "nade" ? 0x3d6b32 : 0xff8a2a;
      (mesh.material as THREE.MeshLambertMaterial).color.setHex(col);
    });
  }

  private drawTracers() {
    const arr = this.tracerArr;
    let n = 0;
    for (const t of this.tracers) {
      if (n >= 80) break;
      const o = n * 6;
      arr[o] = t.x1;
      arr[o + 1] = t.y1;
      arr[o + 2] = t.z1;
      arr[o + 3] = t.x2;
      arr[o + 4] = t.y2;
      arr[o + 5] = t.z2;
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position!.needsUpdate = true;
  }

  private drawMap() {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const w = 256;
    const h = 256;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#10281c";
    ctx.fillRect(0, 0, w, h);
    const yaw = this.mode === "vehicle" && this.vehicle ? this.vehicle.yaw : this.mode === "train" ? this.trainYaw : this.mode === "bus" ? (this.buses[this.rideBus]?.yaw ?? this.camYaw) : this.camYaw;
    const f = fwd(yaw);
    const r = rgt(yaw);
    const scale = 0.72;
    const project = (x: number, z: number) => {
      const dx = x - this.playerX;
      const dz = z - this.playerZ;
      return {
        x: w / 2 + (dx * r.x + dz * r.z) * scale,
        y: h / 2 - (dx * f.x + dz * f.z) * scale,
      };
    };
    ctx.strokeStyle = "#6a6254";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (const road of ROAD_LINES) {
      const pts = road.pts;
      for (let i = 0; i < pts.length - 2; i += 2) {
        const ax = pts[i]!;
        const az = pts[i + 1]!;
        const bx = pts[i + 2]!;
        const bz = pts[i + 3]!;
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        if (Math.hypot(mx - this.playerX, mz - this.playerZ) > 180) continue;
        const pa = project(ax, az);
        const pb = project(bx, bz);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
    const dot = (x: number, z: number, color: string, rad: number) => {
      const p = project(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(LANDMARKS.kotel.x, LANDMARKS.kotel.z, "#f5c518", 4);
    dot(LANDMARKS.station.x, LANDMARKS.station.z, "#f4f1e8", 4);
    dot(LANDMARKS.bridge.x, LANDMARKS.bridge.z, "#d8e6ff", 4);
    dot(LANDMARKS.park.x, LANDMARKS.park.z, "#7dffa2", 3);
    for (const bus of this.buses) {
      const p = project(bus.x, bus.z);
      ctx.fillStyle = "#7ec8ff";
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    }
    for (const rail of this.rails) {
      const p = project(rail.mesh.position.x, rail.mesh.position.z);
      ctx.fillStyle = rail.dir > 0 ? "#ff5a1f" : "#7ec8ff";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x + 5, p.y + 4);
      ctx.lineTo(p.x - 5, p.y + 4);
      ctx.closePath();
      ctx.fill();
    }
    for (const n of this.npcs) {
      if (n.dead) continue;
      dot(n.x, n.z, n.role === "hostile" ? "#ff2d2d" : n.role === "hostage" ? "#f5c518" : "#f4f1e8", n.role === "hostile" ? 4 : 2.4);
    }
    if (this.mission) this.drawObjective(ctx, project, w, h, f, r);
    ctx.fillStyle = "#f5c518";
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 9);
    ctx.lineTo(w / 2 + 7, h / 2 + 8);
    ctx.lineTo(w / 2 - 7, h / 2 + 8);
    ctx.closePath();
    ctx.fill();
  }

  private drawObjective(
    ctx: CanvasRenderingContext2D,
    project: (x: number, z: number) => { x: number; y: number },
    w: number,
    h: number,
    f: { x: number; z: number },
    r: { x: number; z: number },
  ) {
    const g = this.guide;
    if (!g) return;
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    for (const p of g.ahead) {
      const s = project(p.x, p.z);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    const dx = g.x - this.playerX;
    const dz = g.z - this.playerZ;
    const sx = dx * r.x + dz * r.z;
    const sy = -(dx * f.x + dz * f.z);
    const len = Math.hypot(sx, sy) || 1;
    const ux = sx / len;
    const uy = sy / len;
    const rim = 104;
    const tipX = w / 2 + ux * rim;
    const tipY = h / 2 + uy * rim;
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w / 2 + ux * 22, h / 2 + uy * 22);
    ctx.lineTo(w / 2 + ux * 78, h / 2 + uy * 78);
    ctx.stroke();
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = "#f5c518";
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-16, 14);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-16, -14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const a = this.missionAnchor();
    if (a) {
      const p = project(a.x, a.z);
      if (Math.hypot(p.x - w / 2, p.y - h / 2) < 96) {
        ctx.fillStyle = "#fff4b0";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private emit() {
    const list = this.loadout();
    const w = WEAPONS[this.weapon];
    const ammo = w.infinite ? "∞" : String(this.ammo[w.id] ?? 0);
    let missionTitle = "סיור חופשי";
    let missionDetail = "מחבלים חמושים צצים בעיר. כסף רק על חיסול שלהם";
    const m = this.mission;
    if (m) {
      missionTitle = m.id === "m1" ? "חיסול בתחנה המרכזית" : m.id === "m2" ? "חילוץ אוטובוס בגשר המיתרים" : m.id === "m3" ? "רכבת עצורה בשער שכם" : "הגמר בספורטק";
      missionDetail = this.missionLine(m);
    }
    let alert = 0;
    for (const n of this.npcs) {
      if (n.role === "hostile" && !n.dead && Math.hypot(n.x - this.playerX, n.z - this.playerZ) < 70) alert++;
    }
    const driving = this.mode === "train" ? "רכבת קלה" : this.mode === "bus" ? BUS_LINES[this.buses[this.rideBus]?.line ?? 0]?.name ?? "אוטובוס" : this.mode === "vehicle" && this.vehicle ? VEH_NAME[this.vehicle.kind] : "";
    const hud: HudSnap = {
      ...emptyHud(),
      health: Math.round((Math.max(0, this.health) / MAX_HP) * 100),
      money: Math.floor(this.money),
      weaponName: w.name,
      weaponShort: w.short,
      ammo,
      slots: list.map((id) => ({
        id,
        name: WEAPONS[id].short,
        ammo: WEAPONS[id].infinite ? "∞" : String(this.ammo[id] ?? 0),
        active: id === this.weapon,
      })),
      missionTitle,
      missionDetail,
      alert: Math.min(5, alert),
      toast: this.toastT > 0 ? this.toast : "",
      banner: this.bannerT > 0 ? this.banner : "",
      driving,
      hint: this.hint(),
      hurt: this.hurtV,
      dead: this.dead,
      eyes: this.camMode === "eyes",
      cam: this.camMode,
      craft: this.mode === "vehicle" && this.vehicle?.kind === "heli" ? "heli" : this.mode === "vehicle" ? "drive" : this.mode === "foot" ? "foot" : "transit",
      busRide: this.mode === "bus",
      owned: [...this.owned],
      ammoMap: { ...this.ammo },
      vehicles: [...this.ownedVeh],
    };
    this.opts.onHud(hud);
  }

  private missionLine(m: Mission) {
    const left = Math.round(this.guide?.left ?? 0);
    const arrow = left > 40 ? `החץ הצהוב מראה את הדרך הפנויה. עוד ${left} מטר.` : "היעד מולך.";
    if (m.id === "m1") {
      return m.phase === "go" ? `סע בכביש לתחנה המרכזית. ${arrow}` : "חסל את החוטף עם הסימן האדום. האנשים מתכופפים — אל תירה בהם.";
    }
    if (m.id === "m2") {
      if (m.phase === "go") return `סע בכביש אל מתחת לגשר המיתרים. ${arrow}`;
      if (m.phase === "extract") return "גש לאוטובוס ולחץ F. החטופים יצאו והמשימה תיסגר.";
      return "חסל את המחבלים עם הסימן האדום סביב האוטובוס. אל תפגע בחטופים.";
    }
    if (m.id === "m3") {
      const freed = m.hostageIds.filter((id) => this.npcById(id)?.safe).length;
      if (m.phase === "go") return `סע בכביש לרכבת בשער שכם ועלה מהקרון האחורי. ${arrow}`;
      return `סימן אדום = מחבל, אפשר לירות. F ליד נוסע. ${freed} מתוך ${m.hostageIds.length}. עוד ${Math.max(0, Math.ceil(m.clock))} שנ׳.`;
    }
    if (!m.ramot) return `סע לאוטובוסים על הכביש לספורטק. ${arrow}`;
    if (m.blocks < 2) {
      const pads = this.m4pads;
      const veh = this.vehicle;
      const inBus = !!veh && this.missionBuses().includes(veh);
      if (inBus && veh && this.busOnPad(veh, pads)) return `רד עם F. האוטובוס השני לידך — עלה עליו וסע לעיגול הצהוב. ${m.blocks} מתוך 2.`;
      if (inBus) return `סע עם האוטובוס בכביש לספורטק ועצור בעיגול הצהוב. ${m.blocks} מתוך 2. ${arrow}`;
      return `לחץ F ועלה על האוטובוס. עצור אותו בעיגול הצהוב בדרך לספורטק. ${m.blocks} מתוך 2.`;
    }
    return "היורה מולך בצד הדרך, חולצה אדומה וסימן אדום מעל הראש. חסל אותו ואל תירה באנשים לידו.";
  }

  private hint() {
    if (this.dead) return "Enter לחזור לרחוב";
    if (this.mode === "vehicle" && this.vehicle) {
      const heli = this.vehicle.kind === "heli";
      if (this.playMode === "touch") return heli ? "טלפון · עיגול מטיס · עלה ורד בימין · F יציאה" : "טלפון · עיגול למעלה גז, לצדדים פונים · F יציאה";
      return heli ? "מחשב · WASD טיסה · Shift עלייה · Ctrl ירידה · F יציאה" : "מחשב · W גז · S בלם · A שמאלה · D ימינה · F יציאה";
    }
    if (this.mode === "train") {
      const rail = this.rails[this.rideRail];
      return rail?.phase === "dwell" ? "F לרדת בתחנה" : "הרכבת עוצרת בכל תחנה";
    }
    if (this.mode === "bus") {
      const bus = this.buses[this.rideBus];
      return bus?.request ? "עצירה התבקשה · F בתחנה" : "B או כפתור עצירה כדי לרדת";
    }
    if (Math.hypot(this.playerX - LANDMARKS.shop.x, this.playerZ - LANDMARKS.shop.z) < 12) return "F נשקייה";
    if (!this.mission && Math.hypot(this.playerX - LANDMARKS.m1.x, this.playerZ - LANDMARKS.m1.z) < 18) return "F משימת התחנה";
    if (!this.mission && Math.hypot(this.playerX - LANDMARKS.m2.x, this.playerZ - LANDMARKS.m2.z) < 18) return "F משימת הגשר";
    if (!this.mission && Math.hypot(this.playerX - LANDMARKS.m3.x, this.playerZ - LANDMARKS.m3.z) < 22) return "F משימת הרכבת";
    if (!this.mission && this.nearSportBrief()) return "F משימת הספורטק";
    if (this.mission?.id === "m4" && this.mission.ramot && this.mode === "foot" && this.mission.blocks < 2) {
      const nearBus = this.missionBuses().some((v) => Math.hypot(this.playerX - v.x, this.playerZ - v.z) < 9);
      if (nearBus) return "F לעלות לאוטובוס";
    }
    if (this.mission?.id === "m3") return "F ליד נוסע כדי לשחרר";
    if (this.mission?.phase === "extract") return "F ליד האוטובוס סוגר את המשימה";
    if (this.playMode === "pc") return "מחשב · WASD הליכה · עכבר מבט · רווח ירי · V מבט · F כלי";
    return this.camMode === "eyes"
      ? "טלפון · עיגול לאן הולכים · גרירה ימין לאן מסתכלים"
      : "טלפון · דוחפים את העיגול לכיוון ההליכה · גרירה ימין למבט";
  }

  private loadout(): WeaponId[] {
    return BASE_SLOTS.concat([...SHOP_GUNS, ...SHOP_NADES].filter((id) => this.owned.has(id)));
  }

  private refreshView() {
    this.view.clear();
    this.view.add(makeViewmodel(this.weapon));
    const kind = WEAPONS[this.weapon].kind;
    this.playerParts.rifle.visible = kind === "gun" || kind === "launcher";
    this.playerParts.knife.visible = this.weapon === "knife";
  }

  private ensureQa() {
    if (!this.qa || this.qa.dead) {
      this.qa = this.spawnVehicle("car", -10, 0, -Math.PI / 2, 0x1d4e89, false);
      this.qa.qa = true;
      this.qa.hp = 99999;
    }
    if (this.vehicle !== this.qa) {
      this.mode = "vehicle";
      this.vehicle = this.qa;
      this.resetRideLook();
      this.playerParts.group.visible = false;
      this.trainDriven = false;
    }
  }

  private spawnParked() {
    const j = SPAWNS.find((s) => s.id === "jaffa")!;
    const g = SPAWNS.find((s) => s.id === "george")!;
    const rows: { kind: VehicleKind; x: number; z: number; yaw: number; color: number }[] = [
      { kind: "car", x: j.x - 18, z: j.z + 8, yaw: -Math.PI / 2, color: 0xc23b3b },
      { kind: "car", x: j.x + 14, z: j.z - 8, yaw: Math.PI / 2, color: 0xf4f1e8 },
      { kind: "car", x: g.x + 8, z: g.z - 16, yaw: 0, color: 0x1d4e89 },
      { kind: "car", x: LANDMARKS.shop.x - 12, z: LANDMARKS.shop.z, yaw: Math.PI, color: 0x22262c },
      { kind: "bike", x: j.x + 6, z: j.z + 7, yaw: -Math.PI / 2, color: 0x111111 },
      { kind: "bike", x: LANDMARKS.station.x + 20, z: LANDMARKS.station.z + 14, yaw: Math.PI / 2, color: 0xf5c518 },
      { kind: "bus", x: LANDMARKS.station.x + 30, z: LANDMARKS.station.z - 10, yaw: Math.PI / 2, color: 0xf7f7f2 },
      { kind: "truck", x: LANDMARKS.bridge.x + 24, z: LANDMARKS.bridge.z - 8, yaw: -Math.PI / 2, color: 0x355c3b },
    ];
    for (const row of rows) this.spawnVehicle(row.kind, row.x, row.z, row.yaw, row.color, false);
  }

  private spawnCivilians() {
    const spots = SPAWNS.map((s) => ({ x: s.x + 6, z: s.z + 4 }));
    const shirts = [0x2f6fed, 0xf4f4f4, 0x6b4f3a, 0x1f6b4a, 0x9aa0a6, 0xc4552a];
    spots.forEach((s, i) => {
      const n = this.spawnNpc({ role: "civil", x: s.x, z: s.z, shirt: shirts[i % shirts.length]! });
      n.yaw = Math.random() * Math.PI * 2;
    });
  }

  private spawnOwned(kind: VehicleKind) {
    const color = kind === "tank" ? 0x3d4634 : kind === "heli" ? 0x24302c : 0xc23b3b;
    const spot = kind === "heli" ? LANDMARKS.heliPad : kind === "sport" ? { x: LANDMARKS.tankPad.x + 8, z: LANDMARKS.tankPad.z } : LANDMARKS.tankPad;
    const v = this.spawnVehicle(kind, spot.x, spot.z, -Math.PI / 2, color, false);
    v.owned = true;
  }

  private spawnVehicle(kind: VehicleKind, x: number, z: number, yaw: number, color: number, locked: boolean) {
    const parts = makeVehicle(kind, color);
    const v: Veh = {
      id: this.idc++,
      kind,
      x,
      z,
      y: 0,
      yaw,
      speed: 0,
      hp: VEH_HP[kind],
      locked,
      dead: false,
      qa: false,
      owned: false,
      mission: false,
      parts,
    };
    parts.group.position.set(x, 0, z);
    parts.group.rotation.y = yaw;
    this.scene.add(parts.group);
    this.vehicles.push(v);
    return v;
  }

  private spawnNpc(o: { role: Role; x: number; z: number; shirt?: number; boss?: boolean; mission?: boolean; hold?: boolean; roam?: boolean; hp?: number; lift?: number; pin?: boolean }) {
    const hostile = o.role === "hostile";
    const parts = makePerson({
      shirt: o.shirt ?? (hostile ? 0x3d4a32 : 0x2f6fed),
      tone: (this.idc + 1) % 4,
      hostile,
      hostage: o.role === "hostage",
      boss: !!o.boss,
    });
    const n: Npc = {
      id: this.idc++,
      role: o.role,
      x: o.x,
      z: o.z,
      yaw: 0,
      hp: o.hp ?? (o.role === "hostage" ? 80 : hostile ? 100 : 70),
      cool: 0.4,
      stun: 0,
      dead: false,
      deathT: 0,
      mission: !!o.mission,
      boss: !!o.boss,
      roam: !!o.roam,
      hold: !!o.hold,
      paid: false,
      running: false,
      safe: false,
      wander: Math.random() * 2,
      parts,
      transit: false,
      lift: o.lift ?? 0,
      pin: !!o.pin,
      panic: false,
    };
    this.scene.add(parts.group);
    this.npcs.push(n);
    return n;
  }

  private npcById(id: number) {
    return this.npcs.find((n) => n.id === id);
  }

  private damageNpc(n: Npc, dmg: number, byPlayer: boolean) {
    if (n.dead || dmg <= 0) return;
    n.hp -= dmg;
    if (byPlayer) this.hitMarker = 0.14;
    if (n.hp <= 0) this.killNpc(n, byPlayer ? "player" : "world");
  }

  private killNpc(n: Npc, by: "player" | "world") {
    if (n.dead) return;
    n.dead = true;
    n.deathT = 0;
    if (n.role === "hostile" && by === "player" && !n.paid) {
      n.paid = true;
      this.money += KILL_PAY;
      this.say(`+₪${KILL_PAY} מחבל חמוש`);
      this.sfx.cash();
      this.save();
    }
    if ((n.role === "civil" || n.role === "hostage") && by === "player") {
      const fine = n.role === "hostage" ? HOSTAGE_FINE : CIVIL_FINE;
      this.money = Math.max(0, this.money - fine);
      this.say(n.role === "hostage" ? `פגעת בחטוף −₪${fine}` : `פגעת באזרח −₪${fine}`);
      this.save();
      if (n.role === "hostage") this.pendingAbort = "המשימה נכשלה — חטוף נהרג";
    }
  }

  private hurt(amount: number) {
    if (this.dead || this.dieQueued || amount <= 0) return;
    this.health -= amount * 0.72;
    this.hurtV = 1;
    this.lastHurt = this.time;
    this.shake = Math.max(this.shake, 0.2);
    if (this.health <= 0) this.dieQueued = true;
  }

  private die() {
    this.dieQueued = false;
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    if (this.mission) {
      this.clearMissionPawns(true);
      this.mission = null;
      this.pendingAbort = null;
      this.pendingWin = 0;
    }
    if (this.mode === "vehicle") this.exitVehicle();
    if (this.mode === "train" || this.mode === "bus") {
      this.trainDriven = false;
      this.rideBus = -1;
      this.mode = "foot";
      this.playerParts.group.visible = true;
    }
    this.money = Math.max(0, this.money - 500);
    this.banner = "נפלת";
    this.bannerT = 8;
    this.toast = "Enter לחזור לרחוב";
    this.toastT = 8;
    this.save();
    this.emit();
  }

  private clearMissionPawns(removeBus: boolean) {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i]!;
      if (!n.mission || n.dead) continue;
      this.scene.remove(n.parts.group);
      this.npcs.splice(i, 1);
    }
    if (removeBus) {
      this.vehicles = this.vehicles.filter((v) => {
        if (!v.mission) return true;
        this.scene.remove(v.parts.group);
        return false;
      });
      this.missionBus = null;
      if (this.missionTrain) {
        this.scene.remove(this.missionTrain);
        this.missionTrain = null;
      }
    }
  }

  private releaseSurvivors() {
    for (const n of this.npcs) {
      if (!n.mission) continue;
      n.mission = false;
      n.hold = false;
      if (n.role === "hostage" && !n.dead) n.role = "civil";
      if (n.role === "hostile" && !n.dead) n.roam = true;
    }
  }

  private reap() {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i]!;
      if (n.dead && n.deathT > 7) {
        this.scene.remove(n.parts.group);
        this.npcs.splice(i, 1);
      }
    }
  }

  private animPerson(p: PersonParts, phase: number, moving: boolean, cower = false) {
    if (cower) {
      p.legL.rotation.x = 0.28;
      p.legR.rotation.x = 0.22;
      p.armL.rotation.x = -2.55;
      p.armR.rotation.x = -2.55;
      return;
    }
    const s = moving ? Math.sin(phase) : 0;
    const idle = moving ? 0 : Math.sin(phase) * 0.06;
    p.legL.rotation.x = s * 0.7;
    p.legR.rotation.x = -s * 0.7;
    p.armL.rotation.x = -s * 0.5 + idle;
    p.armR.rotation.x = s * 0.5 - idle;
  }

  private indexWorld() {
    const cell = 48;
    for (const b of this.colliders) {
      const x0 = Math.floor(b.minX / cell);
      const x1 = Math.floor(b.maxX / cell);
      const z0 = Math.floor(b.minZ / cell);
      const z1 = Math.floor(b.maxZ / cell);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = ix * 73856093 + iz;
          let bucket = this.grid.get(k);
          if (!bucket) this.grid.set(k, (bucket = []));
          bucket.push(b);
        }
      }
    }
  }

  private touch(minX: number, maxX: number, minZ: number, maxZ: number, fn: (b: Collider) => void) {
    const cell = 48;
    const x0 = Math.floor(minX / cell);
    const x1 = Math.floor(maxX / cell);
    const z0 = Math.floor(minZ / cell);
    const z1 = Math.floor(maxZ / cell);
    const stamp = ++this.stamp;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const bucket = this.grid.get(ix * 73856093 + iz);
        if (!bucket) continue;
        for (const b of bucket) {
          if (b.stamp === stamp) continue;
          b.stamp = stamp;
          fn(b);
        }
      }
    }
  }

  private unstuck(x: number, z: number) {
    if (!this.pointBlocked(x, 1.1, z)) return { x, z };
    for (let r = 2; r <= 28; r += 2) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const nx = x + Math.cos(a) * r;
        const nz = z + Math.sin(a) * r;
        if (!this.pointBlocked(nx, 1.1, nz)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  private collide(x: number, z: number, r: number, nx: number, nz: number, altitude: number) {
    let cx = nx;
    let cz = nz;
    let hit = false;
    const pad = r + 1.5;
    for (let iter = 0; iter < 2; iter++) {
      this.touch(Math.min(x, cx) - pad, Math.max(x, cx) + pad, Math.min(z, cz) - pad, Math.max(z, cz) + pad, (b) => {
        if (b.h < altitude) return;
        const qx = clamp(cx, b.minX, b.maxX);
        const qz = clamp(cz, b.minZ, b.maxZ);
        const dx = cx - qx;
        const dz = cz - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          cx += (dx / d) * (r - d);
          cz += (dz / d) * (r - d);
        } else {
          const left = cx - b.minX;
          const right = b.maxX - cx;
          const up = cz - b.minZ;
          const down = b.maxZ - cz;
          const m = Math.min(left, right, up, down);
          if (m === left) cx = b.minX - r;
          else if (m === right) cx = b.maxX + r;
          else if (m === up) cz = b.minZ - r;
          else cz = b.maxZ + r;
        }
      });
    }
    return { x: cx, z: cz, hit };
  }

  private clipCam(px: number, pz: number, cx: number, cz: number) {
    this.touch(Math.min(px, cx) - 1, Math.max(px, cx) + 1, Math.min(pz, cz) - 1, Math.max(pz, cz) + 1, (b) => {
      if (b.h < 2) return;
      if (cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ) {
        cx = px + (cx - px) * 0.65;
        cz = pz + (cz - pz) * 0.65;
      }
    });
    return { x: cx, z: cz };
  }

  private blocked(x1: number, z1: number, x2: number, z2: number) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 1; i < steps; i++) {
      const x = x1 + (dx * i) / steps;
      const z = z1 + (dz * i) / steps;
      if (this.pointBlocked(x, 1.2, z)) return true;
    }
    return false;
  }

  private pointBlocked(x: number, y: number, z: number) {
    let blocked = false;
    this.touch(x - 0.4, x + 0.4, z - 0.4, z + 0.4, (b) => {
      if (blocked || y > b.h) return;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) blocked = true;
    });
    return blocked;
  }

  private raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, minT: number) {
    let bestT = maxDist;
    const found: { hit: { x: number; y: number; z: number; npc: Npc | null } | null } = { hit: null };
    const consider = (t: number, npc: Npc | null) => {
      if (t > minT && t < bestT) {
        bestT = t;
        found.hit = { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, npc };
      }
    };
    if (dy < -1e-4) consider(-oy / dy, null);
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    this.touch(Math.min(ox, ex) - 1, Math.max(ox, ex) + 1, Math.min(oz, ez) - 1, Math.max(oz, ez) + 1, (b) => {
      const t = slab(ox, oy, oz, dx, dy, dz, b.minX, b.maxX, 0, b.h, b.minZ, b.maxZ);
      if (t != null) consider(t, null);
    });
    for (const n of this.npcs) {
      if (n.dead) continue;
      const t = sphere(ox, oy, oz, dx, dy, dz, n.x, 1.15 + n.lift, n.z, 0.55);
      if (t != null) consider(t, n);
    }
    return found.hit;
  }

  private inSmoke(x: number, z: number) {
    return this.clouds.some((c) => c.life > 0 && Math.hypot(c.x - x, c.z - z) < 4.5 + c.r);
  }

  private carsOf(rail: RailRun) {
    const f = fwd(rail.yaw);
    const s = rail.mesh.position;
    return [0, 1, 2].map((i) => ({ x: s.x - f.x * i * 7.2, z: s.z - f.z * i * 7.2, yaw: rail.yaw }));
  }

  private makeRail(from: number, to: number, dir: number, lane: number, stripe: number, dest: string): RailRun {
    const mesh = makeTrain(stripe, dest);
    this.scene.add(mesh);
    const rail: RailRun = { mesh, from, to, dir, t: 0, phase: "dwell", dwell: 2.2, yaw: 0, lane };
    this.placeRail(rail);
    return rail;
  }

  private inCover(fromX: number, fromZ: number) {
    const px = this.playerX;
    const pz = this.playerZ;
    const dx = fromX - px;
    const dz = fromZ - pz;
    let covered = false;
    const near = (qx: number, qz: number, tall: boolean) => {
      const dist = Math.hypot(px - qx, pz - qz);
      const limit = this.crouch ? 2.6 : 1.45;
      if (!tall && !this.crouch) return false;
      if (dist > limit) return false;
      return (qx - px) * dx + (qz - pz) * dz > 0;
    };
    this.touch(px - 3, px + 3, pz - 3, pz + 3, (b) => {
      const tall = b.h >= 1.6;
      if (!tall && !this.crouch) return;
      const qx = clamp(px, b.minX, b.maxX);
      const qz = clamp(pz, b.minZ, b.maxZ);
      if (near(qx, qz, tall)) covered = true;
    });
    for (const v of this.vehicles) {
      if (v.dead) continue;
      if (near(v.x, v.z, false)) return true;
    }
    for (const bus of this.buses) {
      if (near(bus.x, bus.z, false)) return true;
    }
    return covered;
  }

  private save() {
    const data: SaveData = {
      version: 1,
      money: Math.floor(this.money),
      owned: [...this.owned],
      ammo: this.ammo,
      vehicles: this.ownedVeh,
      spawn: this.spawn.id,
      resume: this.dead
        ? null
        : { x: this.playerX, z: this.playerZ, yaw: this.yaw, health: this.health, weapon: this.weapon },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }
}

function slab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) {
  let tmin = 0;
  let tmax = 1e9;
  const axes: [number, number, number, number][] = [
    [minX, maxX, ox, dx],
    [minY, maxY, oy, dy],
    [minZ, maxZ, oz, dz],
  ];
  for (const [mn, mx, o, d] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmin > 0) return tmin;
  return tmax > 0 ? tmax : null;
}

function sphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  const thc = Math.sqrt(r * r - d2);
  const t0 = tca - thc;
  return t0 > 0 ? t0 : tca + thc;
}

export function startGame(opts: GameOpts) {
  return new Game(opts);
}
