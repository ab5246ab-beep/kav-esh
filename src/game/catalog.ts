export type WeaponId =
  | "rifle"
  | "pistol"
  | "knife"
  | "fists"
  | "carbine"
  | "shotgun"
  | "lmg"
  | "hmg"
  | "sniper"
  | "rpg"
  | "frag"
  | "flash"
  | "smoke"
  | "sticky"
  | "heavyfrag";

export type WeaponKind = "gun" | "melee" | "throw" | "launcher";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  short: string;
  kind: WeaponKind;
  damage: number;
  rate: number;
  spread: number;
  pellets: number;
  range: number;
  infinite: boolean;
  auto: boolean;
  speed: number;
  fuse: number;
  blast: number;
  stun: number;
  smoke: number;
  price: number;
  pack: number;
  packPrice: number;
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: { id: "rifle", name: "רובה ארוך", short: "ארוך", kind: "gun", damage: 22, rate: 0.11, spread: 0.014, pellets: 1, range: 95, infinite: true, auto: true, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 0, pack: 0, packPrice: 0 },
  pistol: { id: "pistol", name: "אקדח", short: "קצר", kind: "gun", damage: 30, rate: 0.2, spread: 0.006, pellets: 1, range: 58, infinite: true, auto: false, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 0, pack: 0, packPrice: 0 },
  knife: { id: "knife", name: "סכין", short: "סכין", kind: "melee", damage: 64, rate: 0.36, spread: 0, pellets: 1, range: 3.1, infinite: true, auto: true, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 0, pack: 0, packPrice: 0 },
  fists: { id: "fists", name: "ידיים ורגליים", short: "ידיים", kind: "melee", damage: 26, rate: 0.3, spread: 0, pellets: 1, range: 2.45, infinite: true, auto: true, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 0, pack: 0, packPrice: 0 },
  carbine: { id: "carbine", name: "קרבין", short: "קרבין", kind: "gun", damage: 24, rate: 0.09, spread: 0.01, pellets: 1, range: 100, infinite: false, auto: true, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 2000, pack: 45, packPrice: 350 },
  shotgun: { id: "shotgun", name: "שוטגאן", short: "שוטגן", kind: "gun", damage: 14, rate: 0.72, spread: 0.11, pellets: 7, range: 26, infinite: false, auto: false, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 2400, pack: 16, packPrice: 280 },
  lmg: { id: "lmg", name: "מקלע קל", short: "קל", kind: "gun", damage: 14, rate: 0.05, spread: 0.02, pellets: 1, range: 90, infinite: false, auto: true, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 4800, pack: 140, packPrice: 700 },
  hmg: { id: "hmg", name: "מקלע כבד", short: "כבד", kind: "gun", damage: 28, rate: 0.085, spread: 0.018, pellets: 1, range: 110, infinite: false, auto: true, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 7500, pack: 90, packPrice: 900 },
  sniper: { id: "sniper", name: "רובה צלפים", short: "צלפים", kind: "gun", damage: 100, rate: 0.95, spread: 0.001, pellets: 1, range: 190, infinite: false, auto: false, speed: 0, fuse: 0, blast: 0, stun: 0, smoke: 0, price: 6200, pack: 10, packPrice: 650 },
  rpg: { id: "rpg", name: "רק״ק", short: "RPG", kind: "launcher", damage: 150, rate: 1.05, spread: 0.004, pellets: 1, range: 140, infinite: false, auto: false, speed: 34, fuse: 4, blast: 5.6, stun: 0, smoke: 0, price: 9500, pack: 3, packPrice: 1200 },
  frag: { id: "frag", name: "רימון רסס", short: "רימון", kind: "throw", damage: 100, rate: 0.7, spread: 0, pellets: 1, range: 0, infinite: true, auto: false, speed: 15, fuse: 2.05, blast: 6.2, stun: 0, smoke: 0, price: 0, pack: 0, packPrice: 0 },
  flash: { id: "flash", name: "רימון הלם", short: "הלם", kind: "throw", damage: 0, rate: 0.7, spread: 0, pellets: 1, range: 0, infinite: false, auto: false, speed: 15, fuse: 1.45, blast: 8, stun: 3.6, smoke: 0, price: 400, pack: 3, packPrice: 400 },
  smoke: { id: "smoke", name: "רימון עשן", short: "עשן", kind: "throw", damage: 0, rate: 0.7, spread: 0, pellets: 1, range: 0, infinite: false, auto: false, speed: 14, fuse: 1.3, blast: 9, stun: 0, smoke: 8, price: 300, pack: 2, packPrice: 300 },
  sticky: { id: "sticky", name: "רימון דביק", short: "דביק", kind: "throw", damage: 135, rate: 0.7, spread: 0, pellets: 1, range: 0, infinite: false, auto: false, speed: 18, fuse: 1.15, blast: 5.2, stun: 0, smoke: 0, price: 650, pack: 2, packPrice: 650 },
  heavyfrag: { id: "heavyfrag", name: "רימון כבד", short: "כבד", kind: "throw", damage: 160, rate: 0.85, spread: 0, pellets: 1, range: 0, infinite: false, auto: false, speed: 13, fuse: 2.2, blast: 9.2, stun: 0, smoke: 0, price: 800, pack: 2, packPrice: 800 },
};

export const BASE_SLOTS: WeaponId[] = ["rifle", "pistol", "knife", "fists"];
export const SHOP_GUNS: WeaponId[] = ["carbine", "shotgun", "lmg", "hmg", "sniper", "rpg"];
export const SHOP_NADES: WeaponId[] = ["flash", "smoke", "sticky", "heavyfrag"];

export type VehicleKind = "car" | "sport" | "bus" | "truck" | "bike" | "tank" | "heli";

export type VehicleSpec = {
  accel: number;
  brake: number;
  max: number;
  reverse: number;
  turn: number;
  friction: number;
  radius: number;
  heli: boolean;
};

export const VEHICLE_SPEC: Record<VehicleKind, VehicleSpec> = {
  car: { accel: 24, brake: 38, max: 28, reverse: 8, turn: 1.85, friction: 7, radius: 1.2, heli: false },
  sport: { accel: 34, brake: 42, max: 40, reverse: 10, turn: 2.05, friction: 5.5, radius: 1.15, heli: false },
  bus: { accel: 11, brake: 20, max: 16, reverse: 5, turn: 0.95, friction: 4, radius: 1.85, heli: false },
  truck: { accel: 10, brake: 18, max: 15, reverse: 4.5, turn: 0.9, friction: 4, radius: 1.7, heli: false },
  bike: { accel: 30, brake: 34, max: 36, reverse: 6, turn: 2.45, friction: 8, radius: 0.65, heli: false },
  tank: { accel: 8, brake: 16, max: 11, reverse: 5, turn: 0.85, friction: 3.2, radius: 1.9, heli: false },
  heli: { accel: 20, brake: 16, max: 38, reverse: 16, turn: 1.35, friction: 3, radius: 2.3, heli: true },
};

export const VEHICLE_SHOP: { id: VehicleKind; name: string; price: number; blurb: string }[] = [
  { id: "sport", name: "מכונית ספורט", price: 8000, blurb: "מופיעה במגרש ליד התחנה" },
  { id: "tank", name: "טנק", price: 28000, blurb: "תותח איטי והרסני" },
  { id: "heli", name: "מסוק", price: 42000, blurb: "מקלע אווירי, טס מעל הגגות" },
];

export const KILL_PAY = 400;
export const CIVIL_FINE = 700;
export const HOSTAGE_FINE = 1800;
export const M1_PAY = 6500;
export const M2_PAY = 9000;
export const M3_PAY = 11000;
export const M4_PAY = 14000;
export const START_MONEY = 2500;

export const MISSION_INFO = {
  m1: {
    title: "חיסול בתחנה המרכזית",
    pay: M1_PAY,
    body: "מחבל חטף אנשים בתחנה המרכזית. אם אתה רחוק, המשחק מקרב אותך. נוסעים עד 800 מטר, מחסלים את החוטף עם הסימן האדום, ולא פוגעים בחטופים שמתכופפים.",
  },
  m2: {
    title: "חילוץ אוטובוס בגשר המיתרים",
    pay: M2_PAY,
    body: "מחבלים עצרו אוטובוס מתחת לגשר המיתרים. הנסיעה עד 800 מטר. מחסלים את השומרים עם הסימן האדום, ואז F ליד האוטובוס. אסור לפגוע בחטופים.",
  },
  m3: {
    title: "רכבת עצורה בשער שכם",
    pay: M3_PAY,
    body: "חוטפים עצרו קרון ליד שער שכם. ההגעה עד 800 מטר. אפשר לירות במחבלים עם הסימן האדום, ו-F ליד כל נוסע משחרר אותו. אם הרכבת זזה לפני שכולם בחוץ, המשימה נכשלת.",
  },
  m4: {
    title: "הגמר בספורטק",
    pay: M4_PAY,
    body: "האוטובוסים מחכים על הכביש ממש לפני הספורטק. F לעלות, עוצרים בעיגול הצהוב, והאוטובוס השני מגיע אליך. היורה עומד מולך בצד הדרך, חולצה אדומה וסימן אדום. כל הנסיעה וההליכה עד 800 מטר.",
  },
} as const;

export type MissionId = keyof typeof MISSION_INFO;

export type HudSnap = {
  health: number;
  money: number;
  weaponName: string;
  weaponShort: string;
  ammo: string;
  slots: { id: WeaponId; name: string; ammo: string; active: boolean }[];
  missionTitle: string;
  missionDetail: string;
  alert: number;
  toast: string;
  banner: string;
  driving: string;
  hint: string;
  hurt: number;
  dead: boolean;
  eyes: boolean;
  cam: "eyes" | "back" | "high";
  craft: "foot" | "drive" | "heli" | "transit";
  busRide: boolean;
  owned: WeaponId[];
  ammoMap: Partial<Record<WeaponId, number>>;
  vehicles: VehicleKind[];
};

export const SAVE_KEY = "kav-esh-save-v1";

export type SaveData = {
  version: 1;
  money: number;
  owned: WeaponId[];
  ammo: Partial<Record<WeaponId, number>>;
  vehicles: VehicleKind[];
  spawn: string;
  resume?: ResumePoint | null;
};

export type ResumePoint = {
  x: number;
  z: number;
  yaw: number;
  health: number;
  weapon: WeaponId;
};

export function emptyHud(): HudSnap {
  return {
    health: 100,
    money: START_MONEY,
    weaponName: "רובה ארוך",
    weaponShort: "ארוך",
    ammo: "∞",
    slots: [],
    missionTitle: "סיור חופשי",
    missionDetail: "חסל מחבלים חמושים שמאיימים על אזרחים",
    alert: 0,
    toast: "",
    banner: "",
    driving: "",
    hint: "WASD תנועה · עכבר מבט · רווח ירי",
    hurt: 0,
    dead: false,
    eyes: true,
    cam: "eyes",
    craft: "foot",
    busRide: false,
    owned: [],
    ammoMap: {},
    vehicles: [],
  };
}
