import * as THREE from "three";
import type { WeaponId } from "@/lib/types";

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  magazine: number;
  reserve: number;
  damage: number;
  headMultiplier: number;
  rpm: number;
  reloadSeconds: number;
  spread: number;
  range: number;
  automatic: boolean;
  melee: boolean;
  pellets: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: "rifle",
    name: "RC-4 Carbine",
    shortName: "CARBINE",
    magazine: 30,
    reserve: 120,
    damage: 17,
    headMultiplier: 2,
    rpm: 620,
    reloadSeconds: 2.1,
    spread: 0.014,
    range: 90,
    automatic: true,
    melee: false,
    pellets: 1,
  },
  pistol: {
    id: "pistol",
    name: "Site Sidearm",
    shortName: "SIDEARM",
    magazine: 12,
    reserve: 60,
    damage: 27,
    headMultiplier: 2.2,
    rpm: 340,
    reloadSeconds: 1.5,
    spread: 0.009,
    range: 70,
    automatic: false,
    melee: false,
    pellets: 1,
  },
  knife: {
    id: "knife",
    name: "Utility Knife",
    shortName: "KNIFE",
    magazine: 0,
    reserve: 0,
    damage: 58,
    headMultiplier: 1.6,
    rpm: 90,
    reloadSeconds: 0,
    spread: 0,
    range: 2.2,
    automatic: false,
    melee: true,
    pellets: 1,
  },
};

export const WEAPON_ORDER: WeaponId[] = ["rifle", "pistol", "knife"];

export interface WeaponModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
}

const gunMetal = () => new THREE.MeshStandardMaterial({ color: "#30343b", roughness: 0.55, metalness: 0.35 });
const gunDark = () => new THREE.MeshStandardMaterial({ color: "#181b20", roughness: 0.65, metalness: 0.2 });
const gunAccent = () => new THREE.MeshStandardMaterial({ color: "#ffb01f", roughness: 0.6 });
const gunGrip = () => new THREE.MeshStandardMaterial({ color: "#24272d", roughness: 0.9 });

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  length: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 10),
    material,
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Weapon is authored with the barrel pointing along local +Z. */
export function buildWeaponModel(id: WeaponId): WeaponModel {
  const group = new THREE.Group();
  const muzzle = new THREE.Object3D();

  if (id === "rifle") {
    const metal = gunMetal();
    const dark = gunDark();
    const accent = gunAccent();
    const grip = gunGrip();
    box(group, 0.09, 0.13, 0.47, 0, 0.015, 0.08, metal);
    box(group, 0.075, 0.09, 0.22, 0, -0.02, -0.22, dark);
    box(group, 0.095, 0.025, 0.32, 0, 0.09, 0.06, dark);
    box(group, 0.07, 0.045, 0.12, 0, 0.1, 0.04, accent);
    cylinder(group, 0.022, 0.022, 0.44, 0, 0.02, 0.53, dark);
    cylinder(group, 0.035, 0.035, 0.12, 0, 0.02, 0.72, metal);
    box(group, 0.055, 0.22, 0.12, 0, -0.14, 0.0, grip);
    box(group, 0.055, 0.16, 0.08, 0, -0.12, 0.16, grip);
    const mag = box(group, 0.07, 0.24, 0.12, 0, -0.18, 0.12, dark);
    mag.rotation.x = -0.12;
    box(group, 0.08, 0.1, 0.3, 0, 0.025, -0.48, dark);
    box(group, 0.02, 0.06, 0.1, 0, 0.16, 0.1, accent);
    muzzle.position.set(0, 0.02, 0.8);
  } else if (id === "pistol") {
    const metal = gunMetal();
    const dark = gunDark();
    const accent = gunAccent();
    const grip = gunGrip();
    box(group, 0.075, 0.12, 0.33, 0, 0.03, 0.08, metal);
    cylinder(group, 0.018, 0.018, 0.22, 0, 0.045, 0.32, dark);
    box(group, 0.07, 0.25, 0.12, 0, -0.12, -0.02, grip);
    box(group, 0.08, 0.035, 0.16, 0, 0.095, 0.03, dark);
    box(group, 0.025, 0.04, 0.12, 0, 0.13, 0.12, accent);
    muzzle.position.set(0, 0.045, 0.45);
  } else {
    const handle = new THREE.MeshStandardMaterial({ color: "#3a2a1e", roughness: 0.9 });
    const blade = new THREE.MeshStandardMaterial({ color: "#c8d1d9", roughness: 0.25, metalness: 0.75 });
    const accent = gunAccent();
    box(group, 0.05, 0.12, 0.34, 0, 0, 0, handle);
    box(group, 0.055, 0.06, 0.09, 0, 0.0, 0.2, accent);
    const bladeMesh = box(group, 0.025, 0.08, 0.46, 0, 0.015, 0.48, blade);
    bladeMesh.scale.y = 0.8;
    muzzle.position.set(0, 0.02, 0.72);
  }

  group.add(muzzle);
  return { group, muzzle };
}

export function weaponSlotFor(id: WeaponId): number {
  if (id === "rifle") return 1;
  if (id === "pistol") return 2;
  return 3;
}
