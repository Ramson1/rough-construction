import * as THREE from "three";
import { makeBox, type BoxCollider, type GroundSurface } from "./collision";
import {
  createConcreteTexture,
  createNetTexture,
  createSignTexture,
} from "./textures";

export const FLOOR_HEIGHT = 3.6;
export const LEVEL_COUNT = 6;
export const ROOF_LEVEL = 6;
export const ROOF_Y = ROOF_LEVEL * FLOOR_HEIGHT;
export const TOWER_HALF = 16;
export const ATRIUM_HALF = 4;
export const SITE_HALF = 24;

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  level: number;
}

export interface MinimapRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  kind: "wall" | "cover" | "floor" | "rail";
}

export interface MinimapFloor {
  level: number;
  y: number;
  outline: { minX: number; maxX: number; minZ: number; maxZ: number };
  hole: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  rects: MinimapRect[];
  connectors: Array<{ x: number; z: number; side: "west" | "east"; level: number }>;
}

export interface NavNode {
  id: string;
  level: number;
  x: number;
  y: number;
  z: number;
  neighbors: string[];
}

export interface WorldData {
  group: THREE.Group;
  solids: BoxCollider[];
  shotBlockers: BoxCollider[];
  surfaces: GroundSurface[];
  spawns: SpawnPoint[];
  minimap: MinimapFloor[];
  navNodes: NavNode[];
  navById: Map<string, NavNode>;
  levelY: number[];
}

const COLORS = {
  concrete: "#c9c3b5",
  concreteDark: "#989183",
  steel: "#434b57",
  steelDark: "#2c323b",
  safety: "#f5b51b",
  orange: "#ff6b1a",
  blue: "#3f78a8",
  drywall: "#d8d4c8",
  wood: "#a87842",
  asphalt: "#555b61",
};

function material(color: string, roughness = 0.88, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addBox(
  group: THREE.Group,
  meshMaterial: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  options: { cast?: boolean; receive?: boolean } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = options.receive !== false;
  group.add(mesh);
  return mesh;
}

function addCylinder(
  group: THREE.Group,
  meshMaterial: THREE.Material,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  axis: "y" | "x" | "z" = "y",
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), meshMaterial);
  mesh.position.set(x, y, z);
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCollider(
  solids: BoxCollider[],
  shotBlockers: BoxCollider[],
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  kind: BoxCollider["kind"] = "solid",
): BoxCollider {
  const box = makeBox(cx, cy, cz, sx, sy, sz, kind);
  if (kind === "rail" || kind === "solid" || kind === "cover") solids.push(box);
  shotBlockers.push(box);
  return box;
}

function addFloorRect(
  group: THREE.Group,
  concrete: THREE.Material,
  surfaces: GroundSurface[],
  shotBlockers: BoxCollider[],
  minimapFloor: MinimapFloor,
  minX: number,
  maxX: number,
  y: number,
  minZ: number,
  maxZ: number,
): void {
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  if (sx <= 0 || sz <= 0) return;
  addBox(group, concrete, (minX + maxX) / 2, y - 0.16, (minZ + maxZ) / 2, sx, 0.32, sz, {
    cast: false,
  });
  surfaces.push({ kind: "flat", minX, maxX, minZ, maxZ, y });
  shotBlockers.push(makeBox((minX + maxX) / 2, y - 0.16, (minZ + maxZ) / 2, sx, 0.34, sz, "floor"));
  minimapFloor.rects.push({ minX, maxX, minZ, maxZ, kind: "floor" });
}

function addRail(
  group: THREE.Group,
  railMaterial: THREE.Material,
  solids: BoxCollider[],
  shotBlockers: BoxCollider[],
  minimapFloor: MinimapFloor,
  x: number,
  y: number,
  z: number,
  sx: number,
  sz: number,
): void {
  const box = addCollider(solids, shotBlockers, x, y + 0.46, z, sx, 0.92, sz, "rail");
  addBox(group, railMaterial, x, y + 0.46, z, sx, 0.05, sz);
  const postsX = sx > sz ? Math.max(2, Math.round(sx / 3)) : 1;
  const postsZ = sz > sx ? Math.max(2, Math.round(sz / 3)) : 1;
  for (let i = 0; i <= postsX; i += 1) {
    const px = sx > sz ? x - sx / 2 + (sx * i) / postsX : x;
    for (let j = 0; j <= postsZ; j += 1) {
      const pz = sz > sx ? z - sz / 2 + (sz * j) / postsZ : z;
      if (postsX > 1 || postsZ > 1) {
        addBox(group, railMaterial, px, y + 0.42, pz, 0.1, 0.9, 0.1, { cast: false });
      }
    }
  }
  minimapFloor.rects.push({
    minX: box.minX,
    maxX: box.maxX,
    minZ: box.minZ,
    maxZ: box.maxZ,
    kind: "rail",
  });
}

function addRamp(
  group: THREE.Group,
  rampMaterial: THREE.Material,
  railMaterial: THREE.Material,
  surfaces: GroundSurface[],
  shotBlockers: BoxCollider[],
  xCenter: number,
  zMin: number,
  zMax: number,
  width: number,
  baseY: number,
  topY: number,
  riseDirection: 1 | -1,
): void {
  const run = Math.abs(zMax - zMin);
  const rise = topY - baseY;
  const angle = Math.atan2(rise, run);
  const thickness = 0.18;
  const length = Math.hypot(run, rise);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length), rampMaterial);
  ramp.position.set(xCenter, (baseY + topY) / 2 - 0.06, (zMin + zMax) / 2);
  ramp.rotation.x = riseDirection > 0 ? -angle : angle;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  group.add(ramp);
  surfaces.push({
    kind: "ramp",
    minX: xCenter - width / 2,
    maxX: xCenter + width / 2,
    minZ: Math.min(zMin, zMax),
    maxZ: Math.max(zMin, zMax),
    baseY,
    topY,
    axis: "z",
    direction: riseDirection,
  });
  // The ramp itself is not a wall; its bulk still blocks shots.
  shotBlockers.push(
    makeBox(
      xCenter,
      (baseY + topY) / 2 - 0.06,
      (zMin + zMax) / 2,
      width,
      0.24,
      length,
      "floor",
    ),
  );

  // Handrails follow the ramp.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.9, length),
      railMaterial,
    );
    rail.position.set(
      xCenter + side * (width / 2 - 0.06),
      (baseY + topY) / 2 + 0.4,
      (zMin + zMax) / 2,
    );
    rail.rotation.x = ramp.rotation.x;
    rail.castShadow = false;
    group.add(rail);
  }

  // Scaffold poles and cross bars underneath.
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const z = zMin + ((zMax - zMin) * i) / steps;
    const surfaceY = riseDirection > 0
      ? baseY + (rise * (z - zMin)) / run
      : topY - (rise * (z - zMin)) / run;
    for (const side of [-1, 1]) {
      addCylinder(group, steelMaterial, 0.055, Math.max(0.2, surfaceY), xCenter + side * (width / 2 - 0.1), Math.max(0.1, surfaceY / 2), z);
    }
    addBox(group, steelMaterial, xCenter, surfaceY + 0.85, z, width, 0.05, 0.05, { cast: false });
  }
}

const concreteMaterial = new THREE.MeshStandardMaterial({
  color: COLORS.concrete,
  map: null,
  roughness: 0.93,
});
const concreteDarkMaterial = material(COLORS.concreteDark, 0.95);
const steelMaterial = material(COLORS.steel, 0.55, 0.22);
const steelDarkMaterial = material(COLORS.steelDark, 0.6, 0.25);
const safetyMaterial = material(COLORS.safety, 0.62, 0.04);
const orangeMaterial = material(COLORS.orange, 0.7);
const drywallMaterial = material(COLORS.drywall, 0.92);
const woodMaterial = material(COLORS.wood, 0.9);
const blueMaterial = material(COLORS.blue, 0.74);
const darkMaterial = material("#252a31", 0.75, 0.15);

function addCoverProps(
  group: THREE.Group,
  level: number,
  y: number,
  layout: Array<{ type: string; x: number; z: number; rot?: number }>,
  solids: BoxCollider[],
  shotBlockers: BoxCollider[],
  minimapFloor: MinimapFloor,
): void {
  for (const item of layout) {
    const z = item.z;
    const x = item.x;
    if (item.type === "barrier") {
      const width = 2.6;
      const depth = 0.44;
      const mesh = addBox(group, concreteDarkMaterial, x, y + 0.55, z, width, 1.1, depth);
      if (item.rot) mesh.rotation.y = item.rot;
      addBox(group, safetyMaterial, x, y + 0.94, z, width + 0.02, 0.1, depth + 0.02);
      addCollider(solids, shotBlockers, x, y + 0.55, z, item.rot ? depth : width, 1.1, item.rot ? width : depth, "cover");
      minimapFloor.rects.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, kind: "cover" });
    } else if (item.type === "crate") {
      addBox(group, woodMaterial, x, y + 0.55, z, 1.12, 1.1, 1.12);
      addBox(group, safetyMaterial, x, y + 1.08, z, 1.14, 0.06, 1.14, { cast: false });
      addCollider(solids, shotBlockers, x, y + 0.55, z, 1.12, 1.1, 1.12, "cover");
      minimapFloor.rects.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6, kind: "cover" });
    } else if (item.type === "barrel") {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.0, 12), orangeMaterial);
      barrel.position.set(x, y + 0.5, z);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      group.add(barrel);
      addBox(group, safetyMaterial, x, y + 0.82, z, 0.72, 0.1, 0.72, { cast: false });
      addCollider(solids, shotBlockers, x, y + 0.5, z, 0.72, 1, 0.72, "cover");
      minimapFloor.rects.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4, kind: "cover" });
    } else if (item.type === "pipes") {
      for (let i = 0; i < 3; i += 1) {
        addCylinder(group, blueMaterial, 0.18, 2.2, x, y + 0.25 + i * 0.36, z, "z");
      }
      addCollider(solids, shotBlockers, x, y + 0.55, z, 1.7, 1.1, 0.9, "cover");
      minimapFloor.rects.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.5, maxZ: z + 0.5, kind: "cover" });
    } else if (item.type === "generator") {
      addBox(group, darkMaterial, x, y + 0.62, z, 1.5, 1.2, 0.9);
      addBox(group, safetyMaterial, x, y + 1.18, z, 1.55, 0.11, 0.95, { cast: false });
      addBox(group, orangeMaterial, x + 0.3, y + 0.8, z + 0.46, 0.7, 0.2, 0.04, { cast: false });
      addCollider(solids, shotBlockers, x, y + 0.62, z, 1.5, 1.2, 0.9, "cover");
      minimapFloor.rects.push({ minX: x - 0.78, maxX: x + 0.78, minZ: z - 0.48, maxZ: z + 0.48, kind: "cover" });
    } else if (item.type === "drywall") {
      addBox(group, drywallMaterial, x, y + 0.62, z, 2.2, 1.24, 0.5);
      addCollider(solids, shotBlockers, x, y + 0.62, z, 2.2, 1.24, 0.5, "cover");
      minimapFloor.rects.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.28, maxZ: z + 0.28, kind: "cover" });
    } else if (item.type === "pallet") {
      addBox(group, woodMaterial, x, y + 0.08, z, 1.5, 0.16, 1.1, { cast: false });
      addBox(group, woodMaterial, x, y + 0.03, z - 0.42, 1.4, 0.08, 0.14, { cast: false });
      addBox(group, woodMaterial, x, y + 0.03, z + 0.42, 1.4, 0.08, 0.14, { cast: false });
    }
  }
}

function addPartition(
  group: THREE.Group,
  level: number,
  y: number,
  x: number,
  z: number,
  sx: number,
  sz: number,
  solids: BoxCollider[],
  shotBlockers: BoxCollider[],
  minimapFloor: MinimapFloor,
): void {
  const height = 2.9;
  addBox(group, drywallMaterial, x, y + height / 2, z, sx, height, sz);
  addCollider(solids, shotBlockers, x, y + height / 2, z, sx, height, sz, "solid");
  minimapFloor.rects.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, kind: "wall" });
}

function addColumns(
  group: THREE.Group,
  y: number,
  solids: BoxCollider[],
  shotBlockers: BoxCollider[],
  minimapFloor: MinimapFloor,
): void {
  const positions = [
    [-10, -10],
    [10, -10],
    [-10, 10],
    [10, 10],
  ];
  for (const [x, z] of positions) {
    addBox(group, concreteDarkMaterial, x, y + FLOOR_HEIGHT / 2, z, 0.58, FLOOR_HEIGHT, 0.58);
    addCollider(solids, shotBlockers, x, y + FLOOR_HEIGHT / 2, z, 0.58, FLOOR_HEIGHT, 0.58, "solid");
    minimapFloor.rects.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, kind: "wall" });
    addBox(group, safetyMaterial, x, y + 0.55, z, 0.64, 0.08, 0.64, { cast: false });
  }
}

function addSkyline(group: THREE.Group): void {
  const cityMat = material("#65737f", 0.9);
  const cityMat2 = material("#78868f", 0.9);
  const cityMat3 = material("#56636f", 0.92);
  const windowMat = new THREE.MeshBasicMaterial({ color: "#c9e4f2" });
  const buildings = [
    [-46, 20, 10, 28, 10], [-58, -18, 16, 44, 14], [-38, -48, 12, 34, 12],
    [44, 26, 14, 38, 12], [58, -8, 12, 26, 12], [34, -50, 10, 44, 16],
    [12, 56, 16, 34, 12], [-18, 62, 14, 22, 10], [62, 54, 18, 30, 14],
    [-68, 42, 14, 24, 14], [72, 12, 16, 20, 12], [-30, -66, 16, 32, 12],
  ];
  for (let i = 0; i < buildings.length; i += 1) {
    const [x, z, w, h, d] = buildings[i];
    const mat = i % 3 === 0 ? cityMat : i % 3 === 1 ? cityMat2 : cityMat3;
    addBox(group, mat, x, h / 2 - 2, z, w, h, d, { cast: false, receive: false });
    for (let row = 0; row < Math.floor(h / 4); row += 1) {
      for (let col = 0; col < Math.floor(w / 3); col += 2) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.04), windowMat);
        window.position.set(x - w / 2 + 1.5 + col * 3, 2.5 + row * 4, z + d / 2 + 0.03);
        group.add(window);
      }
    }
  }
}

function addCrane(group: THREE.Group, x: number, z: number): void {
  const mastHeight = 16;
  addBox(group, safetyMaterial, x, ROOF_Y + mastHeight / 2, z, 1.6, mastHeight, 1.6);
  addBox(group, steelDarkMaterial, x, ROOF_Y + mastHeight + 0.8, z, 1.9, 1.6, 1.9);
  addBox(group, safetyMaterial, x, ROOF_Y + mastHeight + 1.2, z - 7, 1.0, 0.7, 14);
  addBox(group, safetyMaterial, x, ROOF_Y + mastHeight + 1.2, z + 5.5, 1.0, 0.7, 4);
  addBox(group, steelDarkMaterial, x, ROOF_Y + mastHeight + 0.3, z - 12.5, 2.1, 1.3, 2.1);
  addCylinder(group, steelDarkMaterial, 0.05, 8, x, ROOF_Y + mastHeight - 3.5, z - 12.5);
  addBox(group, concreteDarkMaterial, x, ROOF_Y + mastHeight - 7.6, z - 12.5, 0.7, 0.7, 0.7);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4),
    new THREE.MeshBasicMaterial({ map: createSignTexture({ title: "ROUGH CONSTRUCTION", subtitle: "SITE 07 · TOWER 1" }), side: THREE.DoubleSide }),
  );
  sign.position.set(x, ROOF_Y + mastHeight - 1.8, z + 2.2);
  sign.rotation.y = Math.PI;
  group.add(sign);
}

export function buildWorld(): WorldData {
  const group = new THREE.Group();
  const solids: BoxCollider[] = [];
  const shotBlockers: BoxCollider[] = [];
  const surfaces: GroundSurface[] = [];
  const spawns: SpawnPoint[] = [];
  const minimap: MinimapFloor[] = [];
  const levelY = Array.from({ length: ROOF_LEVEL + 1 }, (_, level) => level * FLOOR_HEIGHT);

  const concreteTexture = createConcreteTexture();
  concreteMaterial.map = concreteTexture;
  concreteMaterial.needsUpdate = true;

  // Street and surrounding site.
  const asphaltMat = material(COLORS.asphalt, 0.98);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), asphaltMat);
  street.rotation.x = -Math.PI / 2;
  street.position.y = -0.03;
  street.receiveShadow = true;
  group.add(street);
  surfaces.push({ kind: "flat", minX: -34, maxX: 34, minZ: -34, maxZ: 34, y: 0 });
  shotBlockers.push(makeBox(0, -0.2, 0, 80, 0.3, 80, "floor"));

  // Road markings.
  for (let i = -30; i <= 30; i += 6) {
    addBox(group, safetyMaterial, i, 0.005, -30, 2.6, 0.01, 0.24, { cast: false });
    addBox(group, safetyMaterial, -30, 0.005, i, 0.24, 0.01, 2.6, { cast: false });
  }

  // Site fence at the play boundary.
  const fenceTexture = createNetTexture("#ff7a1a");
  const fenceMaterial = new THREE.MeshStandardMaterial({
    map: fenceTexture,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  for (const [x, z, sx, sz] of [
    [0, -SITE_HALF, SITE_HALF * 2, 0.2],
    [0, SITE_HALF, SITE_HALF * 2, 0.2],
    [-SITE_HALF, 0, 0.2, SITE_HALF * 2],
    [SITE_HALF, 0, 0.2, SITE_HALF * 2],
  ]) {
    addBox(group, steelMaterial, x, 1.25, z, sx, 2.5, sz);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(sx, sz), 2.5), fenceMaterial);
    panel.position.set(x, 1.25, z);
    if (sx > sz) panel.rotation.y = 0;
    else panel.rotation.y = Math.PI / 2;
    group.add(panel);
    addCollider(solids, shotBlockers, x, 1.4, z, sx, 2.8, sz, "solid");
  }

  addSkyline(group);

  // Floors.
  for (let level = 0; level <= ROOF_LEVEL; level += 1) {
    const y = levelY[level];
    const floorMap: MinimapFloor = {
      level,
      y,
      outline: { minX: -TOWER_HALF, maxX: TOWER_HALF, minZ: -TOWER_HALF, maxZ: TOWER_HALF },
      hole: level > 0 && level < ROOF_LEVEL ? { minX: -ATRIUM_HALF, maxX: ATRIUM_HALF, minZ: -ATRIUM_HALF, maxZ: ATRIUM_HALF } : null,
      rects: [],
      connectors: [
        { x: -17.1, z: -12, side: "west", level },
        { x: -17.1, z: 12, side: "west", level },
        { x: 17.1, z: -12, side: "east", level },
        { x: 17.1, z: 12, side: "east", level },
      ],
    };

    if (level === 0 || level === ROOF_LEVEL) {
      addFloorRect(group, concreteMaterial, surfaces, shotBlockers, floorMap, -TOWER_HALF, TOWER_HALF, y, -TOWER_HALF, TOWER_HALF);
    } else {
      addFloorRect(group, concreteMaterial, surfaces, shotBlockers, floorMap, -TOWER_HALF, -ATRIUM_HALF, y, -TOWER_HALF, TOWER_HALF);
      addFloorRect(group, concreteMaterial, surfaces, shotBlockers, floorMap, ATRIUM_HALF, TOWER_HALF, y, -TOWER_HALF, TOWER_HALF);
      addFloorRect(group, concreteMaterial, surfaces, shotBlockers, floorMap, -ATRIUM_HALF, ATRIUM_HALF, y, -TOWER_HALF, -ATRIUM_HALF);
      addFloorRect(group, concreteMaterial, surfaces, shotBlockers, floorMap, -ATRIUM_HALF, ATRIUM_HALF, y, ATRIUM_HALF, TOWER_HALF);
      // Atrium safety curb.
      for (const [x, z, sx, sz] of [
        [0, -ATRIUM_HALF, ATRIUM_HALF * 2, 0.24],
        [0, ATRIUM_HALF, ATRIUM_HALF * 2, 0.24],
        [-ATRIUM_HALF, 0, 0.24, ATRIUM_HALF * 2],
        [ATRIUM_HALF, 0, 0.24, ATRIUM_HALF * 2],
      ]) {
        addBox(group, safetyMaterial, x, y + 0.13, z, sx, 0.26, sz);
      }
    }

    // Perimeter guardrails with scaffold openings.
    const railY = y + 0.01;
    addRail(group, steelMaterial, solids, shotBlockers, floorMap, 0, railY, -TOWER_HALF, TOWER_HALF * 2, 0.18);
    addRail(group, steelMaterial, solids, shotBlockers, floorMap, 0, railY, TOWER_HALF, TOWER_HALF * 2, 0.18);
    // Openings at z = ±12 let players reach the scaffold stair towers.
    for (const side of [-1, 1]) {
      const sideX = side * TOWER_HALF;
      addRail(group, steelMaterial, solids, shotBlockers, floorMap, sideX, railY, -14.8, 0.18, 2.4);
      addRail(group, steelMaterial, solids, shotBlockers, floorMap, sideX, railY, 14.8, 0.18, 2.4);
      addRail(group, steelMaterial, solids, shotBlockers, floorMap, sideX, railY, 0, 0.18, 20.8);
    }

    // Columns.
    addColumns(group, y, solids, shotBlockers, floorMap);

    // Drywall partitions.
    const partitions: Array<[number, number, number, number]> =
      level === 0
        ? [[-8, 6, 6, 0.2], [7, -5, 0.2, 7]]
        : level % 2 === 0
          ? [[-7, -8, 0.2, 6], [7, 7, 6, 0.2]]
          : [[-7, 7, 6, 0.2], [8, -7, 0.2, 6]];
    for (const [x, z, sx, sz] of partitions) {
      addPartition(group, level, y, x, z, sx, sz, solids, shotBlockers, floorMap);
    }

    // Cover props, varied per level.
    const covers = [
      { type: "barrier", x: -8, z: 0 },
      { type: "crate", x: 8, z: 1 },
      { type: "barrel", x: -2, z: -10 },
      { type: "pipes", x: 10, z: 10 },
      { type: "generator", x: -12, z: -7 },
      { type: "drywall", x: 6, z: -11, rot: Math.PI / 2 },
      { type: "pallet", x: 0, z: 11 },
    ].map((item, index) => {
      if (level % 2 === 1) {
        if (index % 2 === 0) return { ...item, x: -item.x, z: -item.z };
        return { ...item, z: item.z + (index % 3 === 0 ? 2 : -2) };
      }
      return item;
    });
    addCoverProps(group, level, y, covers, solids, shotBlockers, floorMap);

    // Spawn points.
    const spawnSpots = level === 0
      ? [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, 12], [0, -12]]
      : [[-12, -12], [12, -12], [-12, 12], [12, 12]];
    for (const [x, z] of spawnSpots) {
      spawns.push({ x, y, z, yaw: Math.atan2(-x, -z), level });
    }

    minimap.push(floorMap);
  }

  // Scaffold ramp towers.
  for (let level = 0; level < ROOF_LEVEL; level += 1) {
    const y = levelY[level];
    const topY = levelY[level + 1];
    const westDir: 1 | -1 = level % 2 === 0 ? 1 : -1;
    const eastDir: 1 | -1 = level % 2 === 0 ? -1 : 1;

    // Platforms at both ends.
    for (const sideX of [-17.1, 17.1]) {
      for (const z of [-12, 12]) {
        const platformY = y;
        const platformMesh = addBox(group, steelMaterial, sideX, platformY - 0.11, z, 3.1, 0.22, 3.1);
        platformMesh.material = steelMaterial;
        surfaces.push({ kind: "flat", minX: sideX - 1.55, maxX: sideX + 1.55, minZ: z - 1.55, maxZ: z + 1.55, y: platformY });
        shotBlockers.push(makeBox(sideX, platformY - 0.11, z, 3.1, 0.24, 3.1, "floor"));
      }
    }

    addRamp(group, steelDarkMaterial, safetyMaterial, surfaces, shotBlockers, -17.1, -12, 12, 3.0, y, topY, westDir);
    addRamp(group, steelDarkMaterial, safetyMaterial, surfaces, shotBlockers, 17.1, -12, 12, 3.0, y, topY, eastDir);
  }

  // Roof landings for the top of each scaffold ramp tower.
  for (const sideX of [-17.1, 17.1]) {
    for (const z of [-12, 12]) {
      addBox(group, steelMaterial, sideX, ROOF_Y - 0.11, z, 3.1, 0.22, 3.1);
      surfaces.push({ kind: "flat", minX: sideX - 1.55, maxX: sideX + 1.55, minZ: z - 1.55, maxZ: z + 1.55, y: ROOF_Y });
      shotBlockers.push(makeBox(sideX, ROOF_Y - 0.11, z, 3.1, 0.24, 3.1, "floor"));
    }
  }

  // Roof: crane, AC units, roof sign.
  addCrane(group, 7, -3);
  for (const [x, z] of [[-9, 7], [9, 8], [-9, -9]]) {
    addBox(group, steelMaterial, x, ROOF_Y + 0.7, z, 2.4, 1.4, 1.5);
    addBox(group, darkMaterial, x, ROOF_Y + 1.2, z, 2.0, 0.3, 1.1, { cast: false });
    addCollider(solids, shotBlockers, x, ROOF_Y + 0.7, z, 2.4, 1.4, 1.5, "cover");
  }

  const roofSign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 5.5),
    new THREE.MeshBasicMaterial({
      map: createSignTexture({
        title: "ROUGH CONSTRUCTION",
        subtitle: "BUILD. HIDE. STRIKE.",
        background: "#ffb01f",
        foreground: "#171a20",
        accent: "#ff6b1a",
      }),
      side: THREE.DoubleSide,
    }),
  );
  roofSign.position.set(-11, ROOF_Y + 3.2, -15.6);
  roofSign.rotation.y = 0;
  group.add(roofSign);
  addBox(group, steelMaterial, -11, ROOF_Y + 3.2, -15.8, 11.2, 5.7, 0.12, { cast: false });

  // Ground floor site office and studio plaque.
  const siteSign = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3.5),
    new THREE.MeshBasicMaterial({
      map: createSignTexture({
        title: "SITE 07",
        subtitle: "ROUGH CONSTRUCTION · TOWER 1",
        background: "#f5b51b",
        foreground: "#171a20",
        accent: "#ff6b1a",
      }),
      side: THREE.DoubleSide,
    }),
  );
  siteSign.position.set(0, 2.2, -15.7);
  group.add(siteSign);
  addBox(group, steelMaterial, 0, 2.2, -15.85, 7.2, 3.7, 0.12, { cast: false });

  const safetyPlaque = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 1.8),
    new THREE.MeshBasicMaterial({
      map: createSignTexture({
        title: "SITE NOTICE",
        subtitle: "HARD HAT AREA · AUTHORIZED CREW ONLY",
        background: "#f5b51b",
        foreground: "#171a20",
        accent: "#171a20",
      }),
      side: THREE.DoubleSide,
    }),
  );
  safetyPlaque.position.set(13, 1.55, -15.7);
  group.add(safetyPlaque);
  addBox(group, steelDarkMaterial, 13, 1.55, -15.85, 3.8, 2, 0.1, { cast: false });

  // Safety nets under the scaffold towers.
  for (const sideX of [-17.1, 17.1]) {
    for (let level = 1; level <= ROOF_LEVEL; level += 1) {
      const net = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 24),
        new THREE.MeshStandardMaterial({
          map: createNetTexture("#ff7a1a"),
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      net.position.set(sideX, levelY[level] - 0.5, 0);
      net.rotation.x = -Math.PI / 2;
      group.add(net);
    }
  }

  // Sparse construction lights.
  for (const [x, z] of [[-14, -14], [14, 14], [-14, 14], [14, -14]]) {
    addCylinder(group, steelDarkMaterial, 0.05, 2.6, x, 1.3, z);
    addBox(group, safetyMaterial, x, 2.7, z, 0.7, 0.18, 0.4, { cast: false });
  }

  // Navigation graph.
  const navNodes: NavNode[] = [];
  const navById = new Map<string, NavNode>();
  const addNode = (id: string, level: number, x: number, z: number): NavNode => {
    const node: NavNode = { id, level, x, y: levelY[level], z, neighbors: [] };
    navNodes.push(node);
    navById.set(id, node);
    return node;
  };
  const connect = (a: string, b: string) => {
    const nodeA = navById.get(a);
    const nodeB = navById.get(b);
    if (!nodeA || !nodeB) return;
    if (!nodeA.neighbors.includes(b)) nodeA.neighbors.push(b);
    if (!nodeB.neighbors.includes(a)) nodeB.neighbors.push(a);
  };

  for (let level = 0; level <= ROOF_LEVEL; level += 1) {
    const ring = [
      [-11, -11], [0, -11], [11, -11], [11, 0], [11, 11], [0, 11], [-11, 11], [-11, 0],
    ];
    const ids: string[] = [];
    for (let i = 0; i < ring.length; i += 1) {
      const [x, z] = ring[i];
      const id = `f${level}_${i}`;
      addNode(id, level, x, z);
      ids.push(id);
    }
    if (level > 0 && level < ROOF_LEVEL) {
      const inner = [[-6, -6], [6, -6], [6, 6], [-6, 6]];
      inner.forEach(([x, z], index) => {
        const id = `f${level}_i${index}`;
        addNode(id, level, x, z);
        connect(id, ids[(index * 2 + 1) % ids.length]);
        connect(id, ids[(index * 2 + 2) % ids.length]);
      });
    }
    for (let i = 0; i < ids.length; i += 1) {
      connect(ids[i], ids[(i + 1) % ids.length]);
    }
    for (const side of ["west", "east"] as const) {
      const sideX = side === "west" ? -17.1 : 17.1;
      for (const z of [-12, 12]) {
        const id = `${side}${level}_${z > 0 ? "s" : "n"}`;
        addNode(id, level, sideX, z);
        const floorNodeId = z < 0
          ? level % 2 === 0 ? ids[0] : ids[2]
          : level % 2 === 0 ? ids[4] : ids[6];
        connect(id, floorNodeId);
        connect(id, `f${level}_${z < 0 ? 1 : 5}`);
      }
    }
  }

  // Ramps connect opposite ends of the scaffold between adjacent levels.
  for (let level = 0; level < ROOF_LEVEL; level += 1) {
    const westDir: 1 | -1 = level % 2 === 0 ? 1 : -1;
    const eastDir: 1 | -1 = level % 2 === 0 ? -1 : 1;
    connect(
      `west${level}_${westDir > 0 ? "n" : "s"}`,
      `west${level + 1}_${westDir > 0 ? "s" : "n"}`,
    );
    connect(
      `east${level}_${eastDir > 0 ? "n" : "s"}`,
      `east${level + 1}_${eastDir > 0 ? "s" : "n"}`,
    );
  }

  // Sparse decorative city cranes.
  for (const [x, z] of [[-42, 28], [44, -34]]) {
    addBox(group, safetyMaterial, x, 14, z, 1.2, 28, 1.2, { cast: false });
    addBox(group, safetyMaterial, x, 27.5, z - 5, 0.8, 0.5, 10, { cast: false });
  }

  return {
    group,
    solids,
    shotBlockers,
    surfaces,
    spawns,
    minimap,
    navNodes,
    navById,
    levelY,
  };
}

export function floorName(level: number): string {
  if (level === ROOF_LEVEL) return "ROOFTOP";
  if (level === 0) return "GROUND FLOOR";
  return `LEVEL ${level}`;
}

export function nearestSpawn(
  spawns: SpawnPoint[],
  filter?: (spawn: SpawnPoint) => boolean,
): SpawnPoint {
  const candidates = filter ? spawns.filter(filter) : spawns;
  return candidates[Math.floor(Math.random() * Math.max(1, candidates.length))] || spawns[0];
}
