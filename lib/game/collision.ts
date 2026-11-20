export interface BoxCollider {
  id?: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind?: "solid" | "cover" | "floor" | "rail";
}

export interface FlatSurface {
  kind: "flat";
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

export interface RampSurface {
  kind: "ramp";
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height at the low end. */
  baseY: number;
  /** Height at the high end. */
  topY: number;
  /** Axis along which height rises. */
  axis: "x" | "z";
  /** Direction of the rise on that axis: +1 or -1. */
  direction: 1 | -1;
}

export type GroundSurface = FlatSurface | RampSurface;

export const EPSILON = 1e-5;

export function makeBox(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  kind: BoxCollider["kind"] = "solid",
  id?: string,
): BoxCollider {
  return {
    id,
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minY: cy - sy / 2,
    maxY: cy + sy / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
    kind,
  };
}

export function boxIntersectsPlayer(
  box: BoxCollider,
  x: number,
  z: number,
  feetY: number,
  height: number,
  radius: number,
): boolean {
  return (
    box.maxX > x - radius &&
    box.minX < x + radius &&
    box.maxZ > z - radius &&
    box.minZ < z + radius &&
    box.maxY > feetY + 0.05 &&
    box.minY < feetY + height
  );
}

export function surfaceHeightAt(surface: GroundSurface, x: number, z: number): number | null {
  if (x < surface.minX || x > surface.maxX || z < surface.minZ || z > surface.maxZ) {
    return null;
  }
  if (surface.kind === "flat") return surface.y;
  const span = surface.axis === "x" ? surface.maxX - surface.minX : surface.maxZ - surface.minZ;
  if (span <= 0) return surface.baseY;
  const value = surface.axis === "x" ? x - surface.minX : z - surface.minZ;
  const t = value / span;
  const height = surface.direction > 0 ? surface.baseY + (surface.topY - surface.baseY) * t : surface.baseY + (surface.topY - surface.baseY) * (1 - t);
  return height;
}

export function sampleGround(
  surfaces: GroundSurface[],
  x: number,
  z: number,
  maxY: number,
): { y: number; surface: GroundSurface } | null {
  let best: { y: number; surface: GroundSurface } | null = null;
  for (const surface of surfaces) {
    const height = surfaceHeightAt(surface, x, z);
    if (height === null) continue;
    if (height > maxY + EPSILON) continue;
    if (!best || height > best.y) best = { y: height, surface };
  }
  return best;
}

/**
 * Finds the nearest spot around (x, z) where a player capsule fits without
 * overlapping a solid, staying on the same floor. Returns the input position
 * when it is already clear, or null when no nearby free spot exists.
 */
export function findClearSpawn(
  x: number,
  z: number,
  y: number,
  solids: BoxCollider[],
  surfaces: GroundSurface[],
  height: number,
  radius: number,
): { x: number; z: number } | null {
  const offsets: Array<[number, number]> = [[0, 0]];
  const rings = [0.55, 1.1, 1.65, 2.2, 2.75];
  for (const ring of rings) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      offsets.push([Math.cos(angle) * ring, Math.sin(angle) * ring]);
    }
  }

  for (const [dx, dz] of offsets) {
    const nx = x + dx;
    const nz = z + dz;
    let blocked = false;
    for (const solid of solids) {
      if (boxIntersectsPlayer(solid, nx, nz, y, height, radius)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const ground = sampleGround(surfaces, nx, nz, y + 0.25);
    if (!ground || Math.abs(ground.y - y) > 0.35) continue;
    return { x: nx, z: nz };
  }
  return null;
}

export interface RayHit {
  t: number;
  box: BoxCollider;
  point: { x: number; y: number; z: number };
}

/** Slab-method ray/AABB intersection. Returns distance along `dir` or null. */
export function rayBox(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  box: BoxCollider,
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;

  const axes: Array<[number, number, number, number]> = [
    [origin.x, direction.x, box.minX, box.maxX],
    [origin.y, direction.y, box.minY, box.maxY],
    [origin.z, direction.z, box.minZ, box.maxZ],
  ];

  for (const [o, d, min, max] of axes) {
    if (Math.abs(d) < EPSILON) {
      if (o < min || o > max) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (min - o) * inv;
    let t2 = (max - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

export function raycastBoxes(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  boxes: BoxCollider[],
  maxDistance = 200,
): RayHit | null {
  let best: RayHit | null = null;
  for (const box of boxes) {
    const t = rayBox(origin, direction, box);
    if (t === null || t > maxDistance || t < 0) continue;
    if (!best || t < best.t) {
      best = {
        t,
        box,
        point: {
          x: origin.x + direction.x * t,
          y: origin.y + direction.y * t,
          z: origin.z + direction.z * t,
        },
      };
    }
  }
  return best;
}

export function normalize(v: { x: number; y: number; z: number }) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

export function distance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
