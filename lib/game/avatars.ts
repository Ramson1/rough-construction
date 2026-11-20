import * as THREE from "three";
import type { Customization, WeaponId } from "@/lib/types";
import { createRoundedBox, createWomanTorsoGeometry } from "./geometry";
import { createFaceTexture } from "./textures";

export const AVATAR_HEIGHT = 1.8;
export const AVATAR_CROUCH_HEIGHT = 1.16;
export const AVATAR_RADIUS = 0.5;

export interface AvatarPivots {
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

export interface AvatarMesh {
  group: THREE.Group;
  torsoMaterial: THREE.MeshStandardMaterial;
  pantsMaterial: THREE.MeshStandardMaterial;
  skinMaterial: THREE.MeshStandardMaterial;
  pivots: AvatarPivots;
  head: THREE.Group;
  weaponAnchor: THREE.Group;
  hatGroup: THREE.Group;
  faceMesh: THREE.Mesh;
  customization: Customization;
  /** Runtime values owned by the engine. */
  currentBubble?: THREE.Sprite;
  nameTag?: THREE.Sprite;
  targetPos?: THREE.Vector3;
  targetYaw?: number;
  targetLegRot?: number;
  targetCrouch?: boolean;
  currentCrouch?: number;
  weaponId?: WeaponId;
  health?: number;
  points?: number;
}

function material(color: string, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
}

function addHat(group: THREE.Group, customization: Customization): THREE.Group {
  const hatGroup = new THREE.Group();
  const hatColor = customization.hatColor || "#ffc21c";
  const hatMaterial = material(hatColor, 0.6);

  if (customization.hat === "hardhat") {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      hatMaterial,
    );
    dome.scale.set(1, 0.8, 1);
    dome.position.y = 0.14;
    hatGroup.add(dome);
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.045, 16),
      hatMaterial,
    );
    brim.position.set(0, 0.13, 0.04);
    brim.scale.z = 1.12;
    hatGroup.add(brim);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.38), hatMaterial);
    ridge.position.set(0, 0.4, 0);
    hatGroup.add(ridge);
  } else if (customization.hat === "cap") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      hatMaterial,
    );
    cap.scale.set(1, 0.65, 1);
    cap.position.y = 0.16;
    hatGroup.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.045, 0.26), hatMaterial);
    brim.position.set(0, 0.17, 0.22);
    hatGroup.add(brim);
  } else if (customization.hat === "beanie") {
    const beanie = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hatMaterial,
    );
    beanie.position.y = 0.2;
    hatGroup.add(beanie);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.305, 0.305, 0.09, 14),
      material("#f2efe8", 0.9),
    );
    band.position.y = 0.22;
    hatGroup.add(band);
  }

  group.add(hatGroup);
  return hatGroup;
}

/** Builds a human-scale, Roblox-style R15-ish avatar from a customization. */
export function buildAvatarMesh(customization: Customization): AvatarMesh {
  const group = new THREE.Group();
  const isFemale = customization.body === "female";

  const skinMaterial = material(customization.skin || "#e8b589", 0.8);
  const shirtMaterial = material(customization.shirt || "#ff7a1a");
  const pantsMaterial = material(customization.pants || "#394b66");
  const shoeMaterial = material(customization.shoes || "#22262e", 0.6);
  const stripeMaterial = material("#e8e4d8", 0.9);

  const torsoGeometry = isFemale
    ? createWomanTorsoGeometry()
    : createRoundedBox(0.62, 0.62, 0.34, 0.08, 3);
  const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
  if (isFemale) torso.scale.set(0.46, 0.44, 0.52);
  torso.position.y = 1.18;
  group.add(torso);

  // High-vis vest bands.
  const bandFront = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), stripeMaterial);
  bandFront.position.set(0, 1.25, 0.18);
  group.add(bandFront);
  const bandBack = bandFront.clone();
  bandBack.position.z = -0.18;
  group.add(bandBack);
  const vestPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.4, 0.02),
    material("#ffb01f", 0.75),
  );
  vestPanel.position.set(0, 1.15, 0.181);
  group.add(vestPanel);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), skinMaterial);
  neck.position.y = 1.52;
  group.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.67;
  const headMesh = new THREE.Mesh(
    createRoundedBox(0.42, 0.42, 0.4, 0.07, 3),
    skinMaterial,
  );
  headGroup.add(headMesh);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({
      map: createFaceTexture(customization.face || "confident", customization.skin || "#e8b589"),
    }),
  );
  face.position.set(0, -0.01, 0.204);
  headGroup.add(face);
  group.add(headGroup);
  const hatGroup = addHat(headGroup, customization);

  function limb(
    x: number,
    y: number,
    width: number,
    length: number,
    depth: number,
    mat: THREE.Material,
    shoe: boolean,
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, depth), mat);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    if (shoe) {
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.03, 0.17, depth + 0.1),
        shoeMaterial,
      );
      boot.position.set(0, -length + 0.08, 0.05);
      pivot.add(boot);
    }
    group.add(pivot);
    return pivot;
  }

  const leftArm = limb(-0.4, 1.42, 0.17, 0.6, 0.19, skinMaterial, false);
  const rightArm = limb(0.4, 1.42, 0.17, 0.6, 0.19, skinMaterial, false);
  const sleeveLeft = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.25, 0.21), shirtMaterial);
  sleeveLeft.position.set(0, -0.12, 0);
  leftArm.add(sleeveLeft);
  const sleeveRight = sleeveLeft.clone();
  rightArm.add(sleeveRight);

  const leftLeg = limb(-0.16, 0.9, 0.22, 0.72, 0.24, pantsMaterial, true);
  const rightLeg = limb(0.16, 0.9, 0.22, 0.72, 0.24, pantsMaterial, true);

  // Weapon anchor sits at the right hand. The arm rotation points its local -Y
  // forward, so the anchor rotates +90° to align the weapon barrel with +Z.
  const weaponAnchor = new THREE.Group();
  weaponAnchor.position.set(0, -0.6, 0);
  weaponAnchor.rotation.x = Math.PI / 2;
  rightArm.add(weaponAnchor);

  return {
    group,
    torsoMaterial: shirtMaterial,
    pantsMaterial,
    skinMaterial,
    pivots: { leftArm, rightArm, leftLeg, rightLeg },
    head: headGroup,
    weaponAnchor,
    hatGroup,
    faceMesh: face,
    customization,
  };
}

export function applyCustomization(avatar: AvatarMesh, customization: Customization): void {
  avatar.customization = customization;
  avatar.torsoMaterial.color.set(customization.shirt);
  avatar.pantsMaterial.color.set(customization.pants);
  avatar.skinMaterial.color.set(customization.skin);
  const faceMaterial = avatar.faceMesh.material as THREE.MeshBasicMaterial;
  const newTexture = createFaceTexture(customization.face, customization.skin);
  if (faceMaterial.map) faceMaterial.map.dispose();
  faceMaterial.map = newTexture;
  faceMaterial.needsUpdate = true;
  // Rebuild the hat in place (the head group also holds the face).
  const parent = avatar.hatGroup.parent;
  if (parent) {
    avatar.hatGroup.removeFromParent();
    avatar.hatGroup = addHat(parent as THREE.Group, customization);
  }
}

export function generateAvatarHeadshotUrl(customization: Customization): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const bg = ctx.createLinearGradient(0, 0, 128, 128);
  bg.addColorStop(0, "#152033");
  bg.addColorStop(1, "#0a0e15");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = customization.shirt || "#ff7a1a";
  ctx.beginPath();
  ctx.moveTo(18, 128);
  ctx.lineTo(34, 86);
  ctx.lineTo(94, 86);
  ctx.lineTo(110, 128);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffb01f";
  ctx.fillRect(52, 94, 24, 26);
  ctx.fillStyle = customization.skin || "#e8b589";
  ctx.fillRect(44, 42, 40, 42);
  ctx.fillStyle = "#1b1c21";
  ctx.fillRect(52, 58, 7, 9);
  ctx.fillRect(69, 58, 7, 9);
  ctx.fillRect(58, 72, 13, 4);
  if (customization.hat !== "none") {
    ctx.fillStyle = customization.hatColor || "#ffc21c";
    ctx.fillRect(38, 34, 52, 12);
    ctx.fillRect(44, 24, 40, 12);
    if (customization.hat === "hardhat") {
      ctx.fillRect(32, 44, 64, 6);
    }
  }
  return canvas.toDataURL();
}
