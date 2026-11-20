import * as THREE from "three";
import type { BotDifficulty, Customization, PlayerSnapshot, ShotInput, TeamId, WeaponId } from "@/lib/types";
import { CharacterController } from "./controller";
import type { WorldData } from "./world";
import { WEAPONS } from "./weapons";
import { findClearSpawn, normalize } from "./collision";
import { AVATAR_HEIGHT, AVATAR_RADIUS } from "./avatars";

interface PathNode {
  id: string;
  x: number;
  y: number;
  z: number;
}

function findPath(world: WorldData, startId: string, goalId: string): string[] {
  if (startId === goalId) return [goalId];
  const open = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, 0]]);
  const goal = world.navById.get(goalId);
  if (!goal) return [];

  while (open.size > 0) {
    let current = "";
    let best = Infinity;
    for (const id of open) {
      const score = fScore.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (!current) break;
    if (current === goalId) {
      const path = [current];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.unshift(cursor);
      }
      return path;
    }
    open.delete(current);
    const node = world.navById.get(current);
    if (!node) continue;
    for (const neighborId of node.neighbors) {
      const neighbor = world.navById.get(neighborId);
      if (!neighbor) continue;
      const tentative = (gScore.get(current) ?? Infinity) + Math.hypot(neighbor.x - node.x, neighbor.y - node.y, neighbor.z - node.z);
      if (tentative < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentative);
        fScore.set(neighborId, tentative + Math.hypot(goal.x - neighbor.x, goal.y - neighbor.y, goal.z - neighbor.z));
        open.add(neighborId);
      }
    }
  }
  return [];
}

function nearestNodeId(world: WorldData, position: THREE.Vector3): string {
  let bestId = world.navNodes[0]?.id ?? "";
  let best = Infinity;
  for (const node of world.navNodes) {
    const distance = Math.hypot(node.x - position.x, (node.y - position.y) * 1.4, node.z - position.z);
    if (distance < best) {
      best = distance;
      bestId = node.id;
    }
  }
  return bestId;
}

export interface BotShot {
  input: ShotInput;
  weapon: WeaponId;
}

export interface BotUpdateContext {
  now: number;
  dt: number;
  targetPosition: THREE.Vector3 | null;
  targetAlive: boolean;
  targetId: string | null;
  hasLineOfSight: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
}

export class BotAgent {
  id: string;
  nickname: string;
  team: TeamId;
  customization: Customization;
  controller = new CharacterController();
  health = 100;
  maxHealth = 100;
  points = 10;
  kills = 0;
  deaths = 0;
  alive = true;
  respawnAt = 0;
  spawnProtectUntil = 0;
  weapon: WeaponId = "rifle";
  ammo: Record<WeaponId, number> = {
    rifle: WEAPONS.rifle.magazine,
    pistol: WEAPONS.pistol.magazine,
    knife: 0,
  };
  reserve: Record<WeaponId, number> = {
    rifle: WEAPONS.rifle.reserve,
    pistol: WEAPONS.pistol.reserve,
    knife: 0,
  };
  reloadEndsAt = 0;
  difficulty: BotDifficulty;
  path: string[] = [];
  pathIndex = 0;
  repathAt = 0;
  fireAt = 0;
  burstLeft = 0;
  strafe = Math.random() > 0.5 ? 1 : -1;
  strafeUntil = 0;
  stuck = 0;
  lastDistance = Infinity;
  lastSeenAt = 0;
  lastKnownTarget = new THREE.Vector3();

  constructor(
    id: string,
    nickname: string,
    customization: Customization,
    team: TeamId,
    difficulty: BotDifficulty,
  ) {
    this.id = id;
    this.nickname = nickname;
    this.customization = customization;
    this.team = team;
    this.difficulty = difficulty;
  }

  spawn(world: WorldData, now: number, spawnIndex?: number): void {
    const candidates = world.spawns.filter((spawn) => spawn.level >= 1);
    const spawn = candidates.length
      ? candidates[(spawnIndex ?? Math.floor(Math.random() * candidates.length)) % candidates.length]
      : world.spawns[0];
    const clear = findClearSpawn(
      spawn.x,
      spawn.z,
      spawn.y,
      world.solids,
      world.surfaces,
      AVATAR_HEIGHT,
      AVATAR_RADIUS,
    );
    this.controller.teleport(clear ? { ...spawn, x: clear.x, z: clear.z } : spawn);
    this.health = this.maxHealth;
    this.alive = true;
    this.respawnAt = 0;
    this.spawnProtectUntil = now + 2.2;
    this.path = [];
    this.pathIndex = 0;
    this.repathAt = 0;
    this.fireAt = now + 0.7;
    this.reloadEndsAt = 0;
    this.ammo.rifle = WEAPONS.rifle.magazine;
    this.reserve.rifle = WEAPONS.rifle.reserve;
    this.ammo.pistol = WEAPONS.pistol.magazine;
    this.reserve.pistol = WEAPONS.pistol.reserve;
    this.weapon = "rifle";
  }

  snapshot(now: number): PlayerSnapshot {
    const position = this.controller.position;
    return {
      id: this.id,
      nickname: this.nickname,
      team: this.team,
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: this.controller.yaw,
      legRot: 0,
      torsoYOffset: 0,
      crouch: this.controller.crouching,
      alive: this.alive,
      health: this.health,
      points: this.points,
      kills: this.kills,
      deaths: this.deaths,
      weapon: this.weapon,
      spawnProtect: Math.max(0, this.spawnProtectUntil - now),
      isBot: true,
      customization: this.customization,
    };
  }

  applyDamage(damage: number, now: number): { killed: boolean } {
    if (!this.alive || now < this.spawnProtectUntil) return { killed: false };
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.alive = false;
      this.deaths += 1;
      this.respawnAt = now + 4000;
      return { killed: true };
    }
    return { killed: false };
  }

  update(context: BotUpdateContext, world: WorldData): BotShot | null {
    const { now, dt, targetPosition, targetAlive, targetId } = context;
    if (!this.alive) return null;
    if (this.controller.position.y < -4) {
      this.health = 0;
      this.alive = false;
      this.deaths += 1;
      this.respawnAt = now + 3000;
      return null;
    }

    const difficultySettings = {
      easy: { reaction: 0.7, spread: 0.055, range: 32, damageScale: 0.75, strafeChance: 0.25 },
      normal: { reaction: 0.32, spread: 0.032, range: 42, damageScale: 1, strafeChance: 0.55 },
      hard: { reaction: 0.16, spread: 0.017, range: 55, damageScale: 1.12, strafeChance: 0.8 },
    }[this.difficulty];

    this.controller.crouching = false;
    let inputForward = 0;
    let inputStrafe = 0;
    let cameraYaw = this.controller.yaw;
    let aiming = false;
    let shot: BotShot | null = null;

    if (now < this.reloadEndsAt) {
      // Reloading: keep moving toward cover / patrol.
    } else if (!targetAlive || !targetPosition || !targetId) {
      this.patrol(world, now, dt);
      if (this.path.length > 0) {
        cameraYaw = this.steerAlongPath(world, dt);
        if (cameraYaw !== null) {
          inputForward = 1;
        }
      }
    } else {
      const botEye = new THREE.Vector3(
        this.controller.position.x,
        this.controller.position.y + 1.45,
        this.controller.position.z,
      );
      const targetChest = new THREE.Vector3(
        targetPosition.x,
        targetPosition.y + 1.1,
        targetPosition.z,
      );
      const distance = botEye.distanceTo(targetChest);
      const visible = distance < difficultySettings.range && context.hasLineOfSight(botEye, targetChest);
      if (visible) {
        this.lastSeenAt = now;
        this.lastKnownTarget.copy(targetPosition);
        aiming = true;
        cameraYaw = Math.atan2(targetPosition.x - this.controller.position.x, targetPosition.z - this.controller.position.z);

        if (now > this.strafeUntil) {
          this.strafe *= -1;
          this.strafeUntil = now + 800 + Math.random() * 1200;
        }
        if (Math.random() < difficultySettings.strafeChance) {
          inputStrafe = this.strafe * (distance < 7 ? 1 : 0.4);
        }
        if (distance > 30) inputForward = 1;
        else if (distance < 7) inputForward = -0.6;

        if (now >= this.fireAt) {
          if (this.weapon !== "rifle") this.weapon = "rifle";
          if (this.ammo.rifle <= 0) {
            this.beginReload(now);
          } else {
            const spec = WEAPONS.rifle;
            const origin = {
              x: botEye.x,
              y: botEye.y - 0.15,
              z: botEye.z,
            };
            const dir = normalize({
              x: targetChest.x - origin.x + (Math.random() - 0.5) * difficultySettings.spread * 20,
              y: targetChest.y - origin.y + (Math.random() - 0.5) * difficultySettings.spread * 15,
              z: targetChest.z - origin.z + (Math.random() - 0.5) * difficultySettings.spread * 20,
            });
            this.ammo.rifle -= 1;
            this.fireAt = now + 60000 / spec.rpm + (this.difficulty === "easy" ? 220 : 80);
            if (this.ammo.rifle <= 0) this.beginReload(now);
            shot = { input: { origin, direction: dir, weapon: this.weapon }, weapon: this.weapon };
          }
        }
      } else {
        // Chase the last known position / climb toward the target.
        if (now > this.repathAt) {
          this.repathTo(world, new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z));
          this.repathAt = now + 1200 + Math.random() * 600;
        }
        if (this.path.length > 0) {
          const yaw = this.steerAlongPath(world, dt);
          if (yaw !== null) {
            cameraYaw = yaw;
            inputForward = 1;
          }
        }
      }
    }

    if (this.reserve.rifle > 0 && this.ammo.rifle <= 0 && now >= this.reloadEndsAt) {
      this.beginReload(now);
    }

    const result = this.controller.update(
      dt,
      {
        forward: inputForward,
        strafe: inputStrafe,
        sprint: inputForward > 0 && !aiming,
        jump: false,
        crouch: false,
        cameraYaw,
        aiming,
      },
      world.solids,
      world.surfaces,
    );
    if (aiming) {
      this.controller.yaw = cameraYaw;
    }

    return shot;
  }

  private beginReload(now: number): void {
    if (this.reloadEndsAt > now) return;
    this.reloadEndsAt = now + WEAPONS.rifle.reloadSeconds * 1000;
    const needed = WEAPONS.rifle.magazine - this.ammo.rifle;
    const moved = Math.min(needed, this.reserve.rifle);
    this.ammo.rifle += moved;
    this.reserve.rifle -= moved;
  }

  private patrol(world: WorldData, now: number, dt: number): void {
    if (this.path.length === 0 && now > this.repathAt) {
      const candidates = world.navNodes.filter((node) => node.level === Math.max(0, Math.min(6, Math.round(this.controller.position.y / 3.6))));
      const node = candidates[Math.floor(Math.random() * candidates.length)] || world.navNodes[0];
      this.repathTo(world, new THREE.Vector3(node.x, node.y, node.z));
      this.repathAt = now + 5000 + Math.random() * 4000;
    }
  }

  private repathTo(world: WorldData, destination: THREE.Vector3): void {
    const start = nearestNodeId(world, this.controller.position);
    const goal = nearestNodeId(world, destination);
    const path = findPath(world, start, goal);
    this.path = path;
    this.pathIndex = Math.min(1, path.length - 1);
    this.stuck = 0;
    this.lastDistance = Infinity;
  }

  private steerAlongPath(world: WorldData, dt: number): number | null {
    if (this.path.length === 0) return null;
    let node = world.navById.get(this.path[this.pathIndex]);
    if (!node) {
      this.path = [];
      return null;
    }
    let distance = Math.hypot(node.x - this.controller.position.x, node.z - this.controller.position.z);
    if (distance < 0.8) {
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) {
        this.path = [];
        return null;
      }
      node = world.navById.get(this.path[this.pathIndex])!;
      distance = Math.hypot(node.x - this.controller.position.x, node.z - this.controller.position.z);
    }

    if (Math.abs(distance - this.lastDistance) < 0.02) {
      this.stuck += dt;
      if (this.stuck > 1.4) {
        this.pathIndex += 1;
        this.stuck = 0;
        if (this.pathIndex >= this.path.length) this.path = [];
      }
    } else {
      this.stuck = 0;
    }
    this.lastDistance = distance;

    return Math.atan2(node.x - this.controller.position.x, node.z - this.controller.position.z);
  }
}
