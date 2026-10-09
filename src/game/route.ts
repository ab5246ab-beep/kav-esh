import { BUILDINGS, PLACES, ROAD_LINES, WALLS } from "./osm-layout";

type Node = { x: number; z: number; next: { j: number; c: number }[] };
type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

const CELL = 90;
const BCELL = 80;
let nodes: Node[] | null = null;
let grid: Map<number, number[]> | null = null;
let blockers: Map<number, Box[]> | null = null;

function cellKey(x: number, z: number) {
  return Math.floor(x / CELL) * 73856093 + Math.floor(z / CELL);
}

function covered(x: number, z: number, w: number, d: number) {
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

function pushBox(list: Box[], x: number, z: number, w: number, d: number, yaw: number) {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const ww = w * c + d * s;
  const dd = w * s + d * c;
  list.push({ minX: x - ww / 2, maxX: x + ww / 2, minZ: z - dd / 2, maxZ: z + dd / 2 });
}

function blockerGrid() {
  if (blockers) return blockers;
  const list: Box[] = [];
  for (let i = 0; i < BUILDINGS.length; i += 7) {
    const x = BUILDINGS[i]!;
    const z = BUILDINGS[i + 1]!;
    const w = BUILDINGS[i + 2]!;
    const d = BUILDINGS[i + 3]!;
    const h = BUILDINGS[i + 4]!;
    const yaw = BUILDINGS[i + 5]!;
    if (h <= 4 || w * d <= 36 || covered(x, z, w, d)) continue;
    pushBox(list, x, z, w * 0.9, d * 0.9, yaw);
  }
  const fx = PLACES.sport.x;
  const fz = PLACES.sport.z;
  pushBox(list, fx - 33, fz + 50, 52, 12, 0);
  pushBox(list, fx + 33, fz + 50, 52, 12, 0);
  pushBox(list, fx - 64, fz, 8, 72, 0);
  pushBox(list, fx + 64, fz, 8, 72, 0);
  const gate = PLACES.shechem;
  for (const line of WALLS) {
    for (let i = 0; i < line.length - 2; i += 2) {
      const ax = line[i]!;
      const az = line[i + 1]!;
      const bx = line[i + 2]!;
      const bz = line[i + 3]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2) continue;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (Math.hypot(mx - gate.x, mz - gate.z) < 30) continue;
      pushBox(list, mx, mz, 4.2, len, Math.atan2(bx - ax, bz - az));
    }
  }
  const map = new Map<number, Box[]>();
  for (const b of list) {
    const x0 = Math.floor(b.minX / BCELL);
    const x1 = Math.floor(b.maxX / BCELL);
    const z0 = Math.floor(b.minZ / BCELL);
    const z1 = Math.floor(b.maxZ / BCELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = ix * 73856093 + iz;
        let bucket = map.get(key);
        if (!bucket) map.set(key, (bucket = []));
        bucket.push(b);
      }
    }
  }
  blockers = map;
  return map;
}

function segmentBlocked(x1: number, z1: number, x2: number, z2: number) {
  const map = blockerGrid();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(1, Math.ceil(len / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    const bucket = map.get(Math.floor(x / BCELL) * 73856093 + Math.floor(z / BCELL));
    if (!bucket) continue;
    for (const b of bucket) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

function build() {
  if (nodes) return;
  const made: Node[] = [];
  const index = new Map<string, number>();
  const idOf = (x: number, z: number) => {
    const key = `${Math.round(x)}:${Math.round(z)}`;
    let id = index.get(key);
    if (id == null) {
      id = made.length;
      made.push({ x, z, next: [] });
      index.set(key, id);
    }
    return id;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const ax = made[a]!.x;
    const az = made[a]!.z;
    const bx = made[b]!.x;
    const bz = made[b]!.z;
    const d = Math.hypot(ax - bx, az - bz);
    if (d < 0.4 || d > 420) return;
    if (made[a]!.next.some((e) => e.j === b)) return;
    const c = d + (segmentBlocked(ax, az, bx, bz) ? 1600 : 0);
    made[a]!.next.push({ j: b, c });
    made[b]!.next.push({ j: a, c });
  };
  for (const road of ROAD_LINES) {
    let prev = -1;
    for (let i = 0; i < road.pts.length; i += 2) {
      const id = idOf(road.pts[i]!, road.pts[i + 1]!);
      if (prev >= 0) link(prev, id);
      prev = id;
    }
  }
  const buckets = new Map<number, number[]>();
  made.forEach((n, i) => {
    const key = cellKey(n.x, n.z);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(i);
  });
  for (let i = 0; i < made.length; i++) {
    const n = made[i]!;
    const cx = Math.floor(n.x / CELL);
    const cz = Math.floor(n.z / CELL);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const bucket = buckets.get((cx + ox) * 73856093 + (cz + oz));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          if (Math.hypot(n.x - made[j]!.x, n.z - made[j]!.z) <= 36) link(i, j);
        }
      }
    }
  }
  nodes = made;
  grid = buckets;
}

function nearest(x: number, z: number) {
  build();
  let best = -1;
  let bestD = 1e12;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let ring = 0; ring <= 8; ring++) {
    if (best >= 0 && ring * CELL > bestD) break;
    for (let ox = -ring; ox <= ring; ox++) {
      for (let oz = -ring; oz <= ring; oz++) {
        if (ring > 0 && Math.abs(ox) !== ring && Math.abs(oz) !== ring) continue;
        const bucket = grid!.get((cx + ox) * 73856093 + (cz + oz));
        if (!bucket) continue;
        for (const i of bucket) {
          const d = Math.hypot(nodes![i]!.x - x, nodes![i]!.z - z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
  }
  return best;
}

const heap: { i: number; d: number }[] = [];
function heapPush(item: { i: number; d: number }) {
  heap.push(item);
  let n = heap.length - 1;
  while (n > 0) {
    const p = (n - 1) >> 1;
    if (heap[p]!.d <= heap[n]!.d) break;
    const tmp = heap[p]!;
    heap[p] = heap[n]!;
    heap[n] = tmp;
    n = p;
  }
}
function heapPop() {
  const top = heap[0];
  const last = heap.pop();
  if (!top || !last || heap.length === 0) return top;
  heap[0] = last;
  let n = 0;
  for (;;) {
    const l = n * 2 + 1;
    const r = l + 1;
    let m = n;
    if (l < heap.length && heap[l]!.d < heap[m]!.d) m = l;
    if (r < heap.length && heap[r]!.d < heap[m]!.d) m = r;
    if (m === n) break;
    const tmp = heap[n]!;
    heap[n] = heap[m]!;
    heap[m] = tmp;
    n = m;
  }
  return top;
}

let cacheFrom = -1;
let cacheTo = -1;
let cachePath: number[] = [];
let routeTx = 0;
let routeTz = 0;
let routePts: { x: number; z: number }[] = [];

let cacheOk = false;

function pathBetween(from: number, to: number) {
  if (from === cacheFrom && to === cacheTo && cacheOk) return cachePath;
  const list = nodes!;
  const dist = new Float64Array(list.length);
  const prev = new Int32Array(list.length);
  dist.fill(1e15);
  prev.fill(-1);
  dist[from] = 0;
  heap.length = 0;
  heapPush({ i: from, d: 0 });
  const seen = new Uint8Array(list.length);
  while (heap.length) {
    const cur = heapPop();
    if (!cur || seen[cur.i]) continue;
    seen[cur.i] = 1;
    if (cur.i === to) break;
    const base = dist[cur.i]!;
    for (const e of list[cur.i]!.next) {
      const nd = base + e.c;
      if (nd < dist[e.j]!) {
        dist[e.j] = nd;
        prev[e.j] = cur.i;
        const left = Math.hypot(list[e.j]!.x - list[to]!.x, list[e.j]!.z - list[to]!.z);
        heapPush({ i: e.j, d: nd + left });
      }
    }
  }
  const out: number[] = [];
  if (dist[to]! < 1e14) {
    for (let n = to; n >= 0; n = prev[n]!) out.push(n);
    out.reverse();
  }
  cacheFrom = from;
  cacheTo = to;
  cachePath = out;
  cacheOk = true;
  return out;
}

function projectRoute(px: number, pz: number) {
  let bestI = 0;
  let bestT = 0;
  let bestD = 1e12;
  for (let i = 0; i < routePts.length - 1; i++) {
    const a = routePts[i]!;
    const b = routePts[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
    const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestT = t;
    }
  }
  return { bestI, bestT, bestD };
}

export type Guide = { x: number; z: number; left: number; ahead: { x: number; z: number }[] };

/** Next point along the roads toward the goal. Falls back to a straight line. */
export function guidePoint(px: number, pz: number, tx: number, tz: number): Guide {
  const straight = Math.hypot(tx - px, tz - pz);
  const here = { x: tx, z: tz, left: straight, ahead: [{ x: tx, z: tz }] };
  if (straight < 46) {
    routePts = [];
    return here;
  }
  build();
  const stale = routePts.length < 2 || Math.hypot(routeTx - tx, routeTz - tz) > 35;
  const off = stale ? 1e9 : projectRoute(px, pz).bestD;
  if (stale || off > 80) {
    const from = nearest(px, pz);
    const to = nearest(tx, tz);
    const path = from < 0 || to < 0 ? [] : pathBetween(from, to);
    routePts = path.map((i) => ({ x: nodes![i]!.x, z: nodes![i]!.z }));
    const last = routePts[routePts.length - 1];
    if (!last || Math.hypot(last.x - tx, last.z - tz) > 8) routePts.push({ x: tx, z: tz });
    routeTx = tx;
    routeTz = tz;
  }
  if (routePts.length < 2) return here;
  const road = nearest(px, pz);
  if (road >= 0 && Math.hypot(nodes![road]!.x - px, nodes![road]!.z - pz) > 90 && off > 90) {
    const n = nodes![road]!;
    return { x: n.x, z: n.z, left: straight, ahead: [{ x: n.x, z: n.z }] };
  }
  const proj = projectRoute(px, pz);
  let left = 0;
  let remain = 60;
  let gx = tx;
  let gz = tz;
  let placed = false;
  const ahead: { x: number; z: number }[] = [];
  let drawn = 0;
  for (let i = proj.bestI; i < routePts.length - 1; i++) {
    const a = routePts[i]!;
    const b = routePts[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const seg = Math.hypot(dx, dz) || 1;
    const start = i === proj.bestI ? proj.bestT * seg : 0;
    const avail = seg - start;
    left += avail;
    if (!placed && avail >= remain) {
      const t = (start + remain) / seg;
      gx = a.x + dx * t;
      gz = a.z + dz * t;
      placed = true;
    } else if (!placed) remain -= avail;
    if (drawn < 170) {
      ahead.push({ x: b.x, z: b.z });
      drawn += avail;
    }
  }
  if (!ahead.length) ahead.push({ x: tx, z: tz });
  if (straight < 820 && left > straight + 70 && !segmentBlocked(px, pz, tx, tz)) {
    return { x: tx, z: tz, left: straight, ahead: [{ x: tx, z: tz }] };
  }
  return { x: gx, z: gz, left, ahead };
}

function fillRoute(px: number, pz: number, tx: number, tz: number) {
  const straight = Math.hypot(tx - px, tz - pz);
  guidePoint(px, pz, tx, tz);
  if (routePts.length < 2 || straight < 46) routePts = [{ x: px, z: pz }, { x: tx, z: tz }];
}

/** Road distance from the player to the goal, including the hop onto the road. */
export function routeLength(px: number, pz: number, tx: number, tz: number) {
  fillRoute(px, pz, tx, tz);
  const proj = projectRoute(px, pz);
  const a0 = routePts[proj.bestI]!;
  const b0 = routePts[proj.bestI + 1]!;
  const dx = b0.x - a0.x;
  const dz = b0.z - a0.z;
  const seg0 = Math.hypot(dx, dz) || 1;
  const qx = a0.x + dx * proj.bestT;
  const qz = a0.z + dz * proj.bestT;
  let left = Math.hypot(px - qx, pz - qz);
  for (let i = proj.bestI; i < routePts.length - 1; i++) {
    const a = routePts[i]!;
    const b = routePts[i + 1]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const start = i === proj.bestI ? proj.bestT * seg : 0;
    left += Math.max(0, seg - start);
  }
  return left;
}

/** A point on the route with about `back` meters still left to the goal. */
export function backFrom(px: number, pz: number, tx: number, tz: number, back: number) {
  const left = routeLength(px, pz, tx, tz);
  if (left <= back) return { x: px, z: pz };
  let need = back;
  for (let i = routePts.length - 1; i > 0; i--) {
    const b = routePts[i]!;
    const a = routePts[i - 1]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg >= need) {
      const t = seg > 0 ? need / seg : 0;
      return { x: b.x + (a.x - b.x) * t, z: b.z + (a.z - b.z) * t };
    }
    need -= seg;
  }
  const first = routePts[0]!;
  return { x: first.x, z: first.z };
}

/** Distance the arrow will actually ask the player to travel. */
export function tripMeters(px: number, pz: number, tx: number, tz: number) {
  const straight = Math.hypot(tx - px, tz - pz);
  const road = routeLength(px, pz, tx, tz);
  if (straight < 820 && road > straight + 70 && !segmentBlocked(px, pz, tx, tz)) return straight;
  return road;
}
