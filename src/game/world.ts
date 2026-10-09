import { BOUNDS, PLACES, RAIL_STOP_POS } from "./osm-layout";

export type Rect = { x: number; z: number; w: number; d: number };

export type Spawn = {
  id: string;
  name: string;
  detail: string;
  x: number;
  z: number;
  yaw: number;
};

/** Playable limit, a little inside the downloaded map. */
export const MAP = {
  minX: BOUNDS.minX + 30,
  maxX: BOUNDS.maxX - 30,
  minZ: BOUNDS.minZ + 30,
  maxZ: BOUNDS.maxZ - 30,
};

const P = PLACES;

export const SPAWNS: Spawn[] = [
  { id: "shechem", name: "שער שכם", detail: "הרחבה מצפון לשער, מול החומה", x: P.shechem.x, z: P.shechem.z - 42, yaw: Math.PI },
  { id: "oldcity", name: "העיר העתיקה", detail: "בתוך החומות, רחובות אבן", x: P.oldcity.x, z: P.oldcity.z, yaw: 0 },
  { id: "kotel", name: "רחבת הכותל", detail: "מול אבני הכותל", x: P.kotel.x - 16, z: P.kotel.z, yaw: -Math.PI / 2 },
  { id: "jaffa", name: "רחוב יפו", detail: "הציר הראשי, ממערב למזרח", x: P.jaffa.x, z: P.jaffa.z, yaw: -Math.PI / 2 },
  { id: "george", name: "המלך ג׳ורג׳", detail: "ציר צפון–דרום במרכז העיר", x: P.george.x, z: P.george.z, yaw: 0 },
  { id: "mahane", name: "שוק מחנה יהודה", detail: "השוק המקורה על יפו", x: P.mahane.x, z: P.mahane.z - 16, yaw: Math.PI },
  { id: "station", name: "תחנה מרכזית", detail: "הרחבה על רחוב ירמיהו", x: P.station.x + 36, z: P.station.z, yaw: Math.PI / 2 },
  { id: "yirmiyahu", name: "רחוב ירמיהו", detail: "הרחוב שמול התחנה", x: P.yirmiyahu.x, z: P.yirmiyahu.z, yaw: 0 },
  { id: "bridge", name: "גשר המיתרים", detail: "מתחת לעמוד הלבן", x: P.bridge.x + 18, z: P.bridge.z + 20, yaw: 0 },
  { id: "sacher", name: "גן סאקר", detail: "המדשאה והאורנים", x: P.sacher.x, z: P.sacher.z, yaw: 0 },
  { id: "ramot", name: "צומת רמות", detail: "הצומת בצפון", x: P.ramot.x, z: P.ramot.z + 22, yaw: 0 },
  { id: "sport", name: "ספורטק", detail: "מגרש הכדורגל בדרום", x: P.sport.x, z: P.sport.z + 6, yaw: 0 },
];

export const LANDMARKS = {
  shop: { x: P.mahane.x + 38, z: P.mahane.z - 18 },
  tankPad: { x: P.station.x + 52, z: P.station.z + 22 },
  heliPad: { x: P.station.x + 52, z: P.station.z - 18 },
  m1: { x: P.station.x + 30, z: P.station.z + 6 },
  m1fight: { x: P.station.x + 18, z: P.station.z - 4 },
  m2: { x: P.bridge.x + 12, z: P.bridge.z + 24 },
  m2bus: { x: P.bridge.x + 8, z: P.bridge.z + 6 },
  m3: { x: P.shechem.x, z: P.shechem.z - 34 },
  m4: { x: P.sport.x, z: P.sport.z + 18 },
  m4ramot: { x: -1040, z: -3147 },
  m4bus2: { x: -1051, z: -3105 },
  m4pad: { x: -2316, z: 2842 },
  m4pad2: { x: -2165, z: 2894 },
  m4roof: { x: -2304, z: 2896 },
  safe: { x: P.cityhall.x - 16, z: P.cityhall.z + 10 },
  kotel: { x: P.kotel.x, z: P.kotel.z },
  park: { x: P.sacher.x, z: P.sacher.z },
  station: { x: P.station.x, z: P.station.z },
  bridge: { x: P.bridge.x, z: P.bridge.z },
};

export const TRACK = RAIL_STOP_POS.map((s) => ({ x: s.x, z: s.z }));

type Seg = { x1: number; z1: number; x2: number; z2: number; len: number };

let cached: { segs: Seg[]; total: number } | null = null;

export function trackData() {
  if (cached) return cached;
  const segs: Seg[] = [];
  let total = 0;
  for (let i = 0; i < TRACK.length - 1; i++) {
    const a = TRACK[i]!;
    const b = TRACK[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, len });
    total += len;
  }
  cached = { segs, total: Math.max(1, total) };
  return cached;
}

export function sampleTrack(dist: number) {
  const { segs, total } = trackData();
  let d = ((dist % total) + total) % total;
  for (const s of segs) {
    if (d <= s.len || s === segs[segs.length - 1]) {
      const t = s.len > 0 ? Math.min(1, d / s.len) : 0;
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      return {
        x: s.x1 + dx * t,
        z: s.z1 + dz * t,
        yaw: Math.atan2(-dx, -dz),
      };
    }
    d -= s.len;
  }
  return { x: TRACK[0]!.x, z: TRACK[0]!.z, yaw: 0 };
}

export function fwd(yaw: number) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rgt(yaw: number) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function dampAngle(current: number, target: number, delta: number, k = 12) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-k * delta));
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function clampMap(x: number, z: number) {
  return { x: clamp(x, MAP.minX, MAP.maxX), z: clamp(z, MAP.minZ, MAP.maxZ) };
}

export function overlaps(a: Rect, b: Rect, pad = 0) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + pad && Math.abs(a.z - b.z) * 2 < a.d + b.d + pad;
}

export function inKotelZone(x: number, z: number) {
  return Math.hypot(x - P.kotel.x, z - P.kotel.z) < 46;
}

export type Stop = { name: string; x: number; z: number };

/** קו אדום על התוואי האמיתי: גשר המיתרים ← גבעת התחמושת. נקודה בלי שם היא רק עיקול. */
export const RAIL_STOPS: Stop[] = RAIL_STOP_POS;

export const BUS_LINES: { name: string; color: number; stops: Stop[] }[] = [
  {
    name: "קו 1",
    color: 0xf7f4ea,
    stops: [
      { name: "גשר המיתרים", x: P.bridge.x + 14, z: P.bridge.z + 16 },
      { name: "תחנה מרכזית", x: P.station.x + 24, z: P.station.z + 8 },
      { name: "מחנה יהודה", x: P.mahane.x, z: P.mahane.z - 20 },
      { name: "יפו מרכז", x: P.jaffa.x, z: P.jaffa.z + 12 },
      { name: "המלך ג׳ורג׳", x: P.george.x + 12, z: P.george.z },
      { name: "שער שכם", x: P.shechem.x, z: P.shechem.z - 28 },
    ],
  },
  {
    name: "קו 2",
    color: 0x1d4e89,
    stops: [
      { name: "ספורטק", x: P.sport.x, z: P.sport.z + 78 },
      { name: "גן סאקר", x: P.sacher.x + 20, z: P.sacher.z },
      { name: "המלך ג׳ורג׳", x: P.george.x - 12, z: P.george.z },
      { name: "צומת רמות", x: P.ramot.x + 14, z: P.ramot.z },
    ],
  },
];
