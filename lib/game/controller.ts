import * as THREE from "three";
import { boxIntersectsPlayer, sampleGround, type BoxCollider, type GroundSurface } from "./collision";
import { AVATAR_CROUCH_HEIGHT, AVATAR_HEIGHT, AVATAR_RADIUS } from "./avatars";
import type { SpawnPoint } from "./world";

export interface MoveInput {
  forward: number;
  strafe: number;
  sprint: boolean;
  jump: boolean;
  crouch: boolean;
  cameraYaw: number;
  aiming: boolean;
}

export interface ControllerResult {
  onGround: boolean;
  justLanded: boolean;
  fallDistance: number;
  horizontalSpeed: number;
  moving: boolean;
  crouching: boolean;
  yaw: number;
}

export class CharacterController {
  position = new THREE.Vector3(0, 0, 0);
  velocityY = 0;
  yaw = 0;
  pitch = 0;
  crouching = false;
  onGround = true;
  private takeoffY = 0;
  private maxY = 0;
  private smoothVelocity = new THREE.Vector2(0, 0);
  private lastFootstep = 0;

  height(): number {
    return this.crouching ? AVATAR_CROUCH_HEIGHT : AVATAR_HEIGHT;
  }

  radius(): number {
    return AVATAR_RADIUS;
  }

  teleport(spawn: SpawnPoint): void {
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.velocityY = 0;
    this.onGround = true;
    this.crouching = false;
    this.yaw = spawn.yaw;
    this.takeoffY = spawn.y;
    this.maxY = spawn.y;
    this.smoothVelocity.set(0, 0);
  }

  private collides(solids: BoxCollider[], x: number, z: number, feetY: number): boolean {
    const radius = this.radius();
    const height = this.height();
    for (const solid of solids) {
      if (boxIntersectsPlayer(solid, x, z, feetY, height, radius)) return true;
    }
    return false;
  }

  /** Highest walkable surface (floor or solid top) under the player, if any. */
  private supportAt(
    solids: BoxCollider[],
    surfaces: GroundSurface[],
    x: number,
    z: number,
    maxY: number,
  ): number | null {
    let best: number | null = null;
    const ground = sampleGround(surfaces, x, z, maxY);
    if (ground) best = ground.y;
    const radius = this.radius();
    for (const solid of solids) {
      if (
        solid.maxX <= x - radius ||
        solid.minX >= x + radius ||
        solid.maxZ <= z - radius ||
        solid.minZ >= z + radius
      ) {
        continue;
      }
      if (solid.maxY <= maxY + 0.02 && (best === null || solid.maxY > best)) {
        best = solid.maxY;
      }
    }
    return best;
  }

  /** Lowest solid underside above the player's head (for blocking jump-throughs). */
  private ceilingAt(
    solids: BoxCollider[],
    x: number,
    z: number,
    headMin: number,
    headMax: number,
  ): number | null {
    const radius = this.radius();
    let best: number | null = null;
    for (const solid of solids) {
      if (
        solid.maxX <= x - radius ||
        solid.minX >= x + radius ||
        solid.maxZ <= z - radius ||
        solid.minZ >= z + radius
      ) {
        continue;
      }
      if (solid.minY >= headMin - 0.02 && solid.minY <= headMax + 0.02) {
        if (best === null || solid.minY < best) best = solid.minY;
      }
    }
    return best;
  }

  /** Nudge the body out of any collider it is currently overlapping. */
  private resolvePenetration(solids: BoxCollider[]): void {
    const radius = this.radius();
    const height = this.height();
    for (let pass = 0; pass < 3; pass += 1) {
      let moved = false;
      for (const solid of solids) {
        if (!boxIntersectsPlayer(solid, this.position.x, this.position.z, this.position.y, height, radius)) {
          continue;
        }
        const pushLeft = this.position.x + radius - solid.minX + 0.01;
        const pushRight = solid.maxX - (this.position.x - radius) + 0.01;
        const pushBack = this.position.z + radius - solid.minZ + 0.01;
        const pushFront = solid.maxZ - (this.position.z - radius) + 0.01;
        const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (smallest === pushLeft) this.position.x -= pushLeft;
        else if (smallest === pushRight) this.position.x += pushRight;
        else if (smallest === pushBack) this.position.z -= pushBack;
        else this.position.z += pushFront;
        moved = true;
      }
      if (!moved) break;
    }
  }

  update(
    dt: number,
    input: MoveInput,
    solids: BoxCollider[],
    surfaces: GroundSurface[],
  ): ControllerResult {
    const wasCrouching = this.crouching;
    this.crouching = input.crouch;
    const height = this.height();
    this.resolvePenetration(solids);

    const forward = new THREE.Vector3(Math.sin(input.cameraYaw), 0, Math.cos(input.cameraYaw));
    const right = new THREE.Vector3(Math.cos(input.cameraYaw), 0, -Math.sin(input.cameraYaw));
    const move = new THREE.Vector3();
    move.addScaledVector(forward, input.forward);
    move.addScaledVector(right, input.strafe);
    const hasInput = move.lengthSq() > 0.001;
    if (hasInput) move.normalize();

    let speed = 8.4;
    if (input.sprint && !this.crouching && input.forward > 0.1) speed = 12.6;
    if (this.crouching) speed = 4.2;
    if (input.aiming) speed *= 0.78;

    const targetVx = hasInput ? move.x * speed : 0;
    const targetVz = hasInput ? move.z * speed : 0;
    const accel = this.onGround ? 22 : 7;
    const blend = 1 - Math.exp(-accel * dt);
    this.smoothVelocity.x += (targetVx - this.smoothVelocity.x) * blend;
    this.smoothVelocity.y += (targetVz - this.smoothVelocity.y) * blend;

    const stepX = this.smoothVelocity.x * dt;
    const stepZ = this.smoothVelocity.y * dt;

    // Resolve horizontal movement one axis at a time so walls slide naturally.
    let nx = this.position.x + stepX;
    if (!this.collides(solids, nx, this.position.z, this.position.y)) {
      this.position.x = nx;
    } else {
      this.smoothVelocity.x *= 0.2;
    }
    let nz = this.position.z + stepZ;
    if (!this.collides(solids, this.position.x, nz, this.position.y)) {
      this.position.z = nz;
    } else {
      this.smoothVelocity.y *= 0.2;
    }

    // Keep the player inside the street boundary even if they jump a fence.
    this.position.x = THREE.MathUtils.clamp(this.position.x, -30, 30);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -30, 30);

    let justLanded = false;
    let fallDistance = 0;

    if (this.onGround) {
      const support = this.supportAt(
        solids,
        surfaces,
        this.position.x,
        this.position.z,
        this.position.y + 0.62,
      );
      if (support !== null && Math.abs(this.position.y - support) < 0.62) {
        this.position.y = support;
      } else {
        this.onGround = false;
        this.takeoffY = this.position.y;
        this.maxY = this.position.y;
      }
      if (input.jump && this.onGround) {
        this.velocityY = 9.0;
        this.onGround = false;
        this.takeoffY = this.position.y;
        this.maxY = this.position.y;
      }
      if (this.onGround) this.velocityY = 0;
    }

    if (!this.onGround) {
      this.velocityY -= 19 * dt;
      const previousY = this.position.y;
      this.position.y += this.velocityY * dt;
      this.maxY = Math.max(this.maxY, this.position.y);

      // Stop upward motion at solid undersides so players cannot jump through
      // crates, rails or upper floors.
      if (this.velocityY > 0) {
        const ceiling = this.ceilingAt(
          solids,
          this.position.x,
          this.position.z,
          previousY + height,
          this.position.y + height,
        );
        if (ceiling !== null && this.position.y + height > ceiling) {
          this.position.y = ceiling - height;
          this.velocityY = 0;
        }
      }

      const support = this.supportAt(
        solids,
        surfaces,
        this.position.x,
        this.position.z,
        this.position.y + 0.08,
      );
      if (support !== null && this.position.y <= support + 0.02 && this.velocityY <= 0) {
        this.position.y = support;
        justLanded = true;
        fallDistance = Math.max(0, this.maxY - support);
        this.velocityY = 0;
        this.onGround = true;
        this.takeoffY = support;
        this.maxY = support;
      }
      if (this.position.y < -8) {
        fallDistance = 999;
        this.onGround = true;
        this.position.y = 0;
      }
    }

    const horizontalSpeed = Math.hypot(this.smoothVelocity.x, this.smoothVelocity.y);
    const moving = horizontalSpeed > 0.25 && (Math.abs(input.forward) + Math.abs(input.strafe) > 0.1);

    // Face movement direction, unless the caller will override the yaw for aiming.
    if (moving && !input.aiming) {
      const targetYaw = Math.atan2(this.smoothVelocity.x, this.smoothVelocity.y);
      let diff = targetYaw - this.yaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.yaw += diff * Math.min(1, 12 * dt);
    }

    if (wasCrouching !== this.crouching) {
      // If standing up would intersect a low collider, remain crouched.
      if (!this.collides(solids, this.position.x, this.position.z, this.position.y)) {
        // fine
      } else {
        this.crouching = true;
      }
    }

    return {
      onGround: this.onGround,
      justLanded,
      fallDistance,
      horizontalSpeed,
      moving,
      crouching: this.crouching,
      yaw: this.yaw,
    };
  }

  eyeHeight(firstPerson: boolean): number {
    return this.crouching ? 0.98 : firstPerson ? 1.58 : 1.48;
  }

  get feetY(): number {
    return this.position.y;
  }

  headHeight(): number {
    return this.height();
  }
}
