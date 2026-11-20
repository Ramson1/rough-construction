import * as THREE from "three";
import { MATCH_RULES, NETWORK_CONFIG } from "@/lib/config";
import type {
  Customization,
  GameMode,
  HitEvent,
  KillEvent,
  MatchResults,
  PlayerSnapshot,
  Profile,
  Settings,
  ShotInput,
  TeamId,
  WeaponId,
} from "@/lib/types";
import { DEFAULT_CUSTOMIZATION, GAME_MODES } from "@/lib/types";
import { AVATAR_CROUCH_HEIGHT, AVATAR_HEIGHT, AVATAR_RADIUS, buildAvatarMesh, type AvatarMesh } from "./avatars";
import { BotAgent } from "./bots";
import {
  boxIntersectsPlayer,
  findClearSpawn,
  normalize,
  rayBox,
  raycastBoxes,
  type BoxCollider,
} from "./collision";
import { CharacterController } from "./controller";
import type {
  EngineEvent,
  EngineNetMessage,
  EngineOptions,
  EngineRole,
  HudState,
  KillFeedEntry,
  MatchPhase,
  MinimapPlayer,
  ScoreRow,
  ShotFx,
  TeamScores,
  WorldInfo,
} from "./engineTypes";
import { createChatBubbleTexture, createMuzzleFlashTexture, createNameTagTexture } from "./textures";
import { buildWeaponModel, WEAPONS, WEAPON_ORDER, type WeaponModel } from "./weapons";
import {
  buildWorld,
  FLOOR_HEIGHT,
  floorName,
  ROOF_LEVEL,
  type MinimapFloor,
  type SpawnPoint,
  type WorldData,
} from "./world";

export * from "./engineTypes";

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export const TEAM_COLORS: Record<TeamId, string> = {
  alpha: "#4aa9ff",
  bravo: "#ff6b4a",
  solo: "#ffc21c",
  bots: "#b98cff",
};

export const TEAM_NAMES: Record<TeamId, string> = {
  alpha: "ALPHA CREW",
  bravo: "BRAVO CREW",
  solo: "LONE WOLF",
  bots: "SITE BOTS",
};

const BOT_NAMES = [
  "Mason",
  "Rook",
  "Cutter",
  "Vega",
  "Bolt",
  "Sable",
  "Pike",
  "Deck",
  "Nash",
  "Krane",
];

const BOT_SHIRTS = ["#ff7a1a", "#3c78b4", "#d7b12b", "#5c9e6e", "#b25a45", "#6f63b8"];
const BOT_PANTS = ["#394b66", "#2e343c", "#54523e", "#3d3348"];
const BOT_SKINS = ["#e8b589", "#c98d5f", "#8d5a3a", "#f2c9a3", "#6d432c"];
const BOT_HATS: Array<Customization["hat"]> = ["hardhat", "cap", "beanie", "hardhat"];
const BOT_FACES: Array<Customization["face"]> = ["confident", "focused", "happy"];

function makeBotCustomization(index: number): Customization {
  return {
    ...DEFAULT_CUSTOMIZATION,
    body: index % 5 === 0 ? "female" : "male",
    skin: BOT_SKINS[index % BOT_SKINS.length],
    shirt: BOT_SHIRTS[index % BOT_SHIRTS.length],
    pants: BOT_PANTS[index % BOT_PANTS.length],
    shoes: "#22262e",
    hat: BOT_HATS[index % BOT_HATS.length],
    hatColor: index % 2 === 0 ? "#ffc21c" : "#f0ede2",
    face: BOT_FACES[index % BOT_FACES.length],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

function pointDistance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function applySpread(
  direction: { x: number; y: number; z: number },
  spread: number,
): { x: number; y: number; z: number } {
  if (spread <= 0) return normalize(direction);
  const dir = normalize(direction);
  const up = Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalize({
    x: dir.y * up.z - dir.z * up.y,
    y: dir.z * up.x - dir.x * up.z,
    z: dir.x * up.y - dir.y * up.x,
  });
  const localUp = normalize({
    x: right.y * dir.z - right.z * dir.y,
    y: right.z * dir.x - right.x * dir.z,
    z: right.x * dir.y - right.y * dir.x,
  });
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * spread;
  return normalize({
    x: dir.x + Math.cos(angle) * radius * right.x + Math.sin(angle) * radius * localUp.x,
    y: dir.y + Math.cos(angle) * radius * right.y + Math.sin(angle) * radius * localUp.y,
    z: dir.z + Math.cos(angle) * radius * right.z + Math.sin(angle) * radius * localUp.z,
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    if (Array.isArray(material)) {
      material.forEach((entry) => materials.add(entry));
    } else if (material) {
      materials.add(material);
    }
  });
  materials.forEach((material) => {
    const withMap = material as THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };
    if (withMap.map) textures.add(withMap.map);
    if (withMap.alphaMap) textures.add(withMap.alphaMap);
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
}

function inFrontRange(value: number, max: number): boolean {
  return value >= 0 && value <= max;
}

// ---------------------------------------------------------------------------
// Internal combatant model
// ---------------------------------------------------------------------------

interface Combatant {
  id: string;
  nickname: string;
  team: TeamId;
  isBot: boolean;
  isLocal: boolean;
  customization: Customization;

  avatar: AvatarMesh;
  weaponModels: Record<WeaponId, WeaponModel>;
  nameTag: THREE.Sprite;
  nameTagHealth: number;
  nameTagPoints: number;
  nameTagAt: number;
  chatBubble: { sprite: THREE.Sprite; texture: THREE.CanvasTexture; until: number } | null;

  controller?: CharacterController;
  bot?: BotAgent;

  position: THREE.Vector3;
  visualPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  yaw: number;
  visualYaw: number;
  targetYaw: number;
  crouch: boolean;
  visualCrouch: number;

  health: number;
  maxHealth: number;
  points: number;
  kills: number;
  deaths: number;
  alive: boolean;
  eliminated: boolean;
  spawnProtectUntil: number;
  respawnAt: number;

  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  reloading: WeaponId | null;
  reloadEndsAt: number;
  lastShotAt: number;

  legPhase: number;
  moveBlend: number;
  lastHitAt: number;
  lastSnapshotAt: number;
  botIndex: number;
}

interface TracerEffect {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  life: number;
  maxLife: number;
}

interface SpriteEffect {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
  maxLife: number;
  grow: number;
}

interface RingEffect {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ShotOutcome {
  target: Combatant | null;
  end: { x: number; y: number; z: number };
  headshot: boolean;
  blocked: boolean;
}

// ---------------------------------------------------------------------------
// Match engine
// ---------------------------------------------------------------------------

export class MatchEngine {
  private options: EngineOptions;
  private container: HTMLElement;
  private role: EngineRole;
  private matchId: string;

  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: WorldData;
  private sun: THREE.DirectionalLight;
  private viewModels: Partial<Record<WeaponId, WeaponModel>> = {};
  private sharedMuzzleTexture: THREE.CanvasTexture;
  private skyTexture: THREE.CanvasTexture | null = null;

  private combatants: Combatant[] = [];
  private byId = new Map<string, Combatant>();
  private local!: Combatant;
  private localController!: CharacterController;
  private botNameCounter = 0;

  private phase: MatchPhase = "countdown";
  private phaseEndsAt = 0;
  private lastCountdownSecond = 4;
  private timeLeftMs: number;
  private results: MatchResults | null = null;
  private endedAt = 0;

  private keys = new Set<string>();
  private pointerLocked = false;
  private lookFallback = false;
  private pointerLockAttemptAt = 0;
  private inputEnabled = true;
  private firing = false;
  private fireRequested = false;
  private aiming = false;
  private crouchToggle = false;
  private scoreboardHeld = false;
  private firstPerson: boolean;
  private sensitivity: number;
  private viewYaw = 0;
  private viewPitch = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private cameraShake = 0;
  private currentFov = 68;
  private footstepTimer = 0;
  private sprinting = false;
  private wasOnGround = true;
  private aimUntil = 0;
  private lastLocalSpawnAt = 0;
  private lastLocalHitAt = 0;
  private lastDamageAt = 0;
  private lastHitMarkerAt = 0;
  private spectateId: string | null = null;
  private spectateCheckAt = 0;

  private killFeed: KillFeedEntry[] = [];
  private killFeedCounter = 0;
  private lastHudAt = 0;
  private lastAudioUpdate = 0;
  private fps = 60;

  private tracers: TracerEffect[] = [];
  private spriteEffects: SpriteEffect[] = [];
  private ringEffects: RingEffect[] = [];

  private lastSnapshotSentAt = 0;
  private lastClientSnapshotAt = 0;
  private lastRemoteShotAt = new Map<string, number>();

  private disposed = false;
  private frameId = 0;
  private lastFrameTime = 0;

  private resizeHandler = () => this.onResize();
  private mouseMoveHandler = (event: MouseEvent) => this.onMouseMove(event);
  private mouseDownHandler = (event: MouseEvent) => this.onMouseDown(event);
  private mouseUpHandler = (event: MouseEvent) => this.onMouseUp(event);
  private keyDownHandler = (event: KeyboardEvent) => this.onKeyDown(event);
  private keyUpHandler = (event: KeyboardEvent) => this.onKeyUp(event);
  private blurHandler = () => this.onBlur();
  private pointerLockHandler = () => this.onPointerLockChange();
  private pointerLockErrorHandler = () => this.enableLookFallback();
  private contextMenuHandler = (event: Event) => event.preventDefault();
  private wheelHandler = (event: WheelEvent) => this.onWheel(event);

  constructor(options: EngineOptions) {
    this.options = options;
    this.container = options.container;
    this.role = options.role;
    this.matchId = options.matchId || `match_${Date.now().toString(36)}`;
    this.firstPerson = options.firstPerson;
    this.sensitivity = Math.max(0.2, options.mouseSensitivity || 1);
    this.timeLeftMs =
      Math.max(30, options.settings.timeLimitSec || MATCH_RULES.matchTimeSeconds) * 1000;
    this.sharedMuzzleTexture = createMuzzleFlashTexture();

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(68, width / Math.max(1, height), 0.08, 400);
    this.camera.position.set(0, 20, 28);

    const high = options.graphics === "high";
    const low = options.graphics === "low";
    this.renderer = new THREE.WebGLRenderer({
      antialias: !low,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      low ? 1 : Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "match-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);

    this.setupEnvironment(options.graphics);
    this.world = buildWorld();
    this.scene.add(this.world.group);

    this.setupViewModels();
    this.createRoster();
    this.initialSpawns(performance.now());
    this.installDebugProbe();

    const info: WorldInfo = { minimap: this.world.minimap, levelY: this.world.levelY };
    this.options.onWorldReady?.(info);

    this.attachEvents();
    this.onResize();

    this.options.audio.setScene("match");
    this.options.audio.setIntensity(0.25);

    const now = performance.now();
    this.phase = "countdown";
    this.phaseEndsAt = now + 3200;
    this.lastFrameTime = now;
    this.local.lastSnapshotAt = now;

    this.refreshAllNameTags(now);
    this.emitHud(true);
    this.frameId = requestAnimationFrame(this.animate);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getLocalId(): string {
    return this.local.id;
  }

  /** Dev-only read-only snapshot used by the browser smoke tests. */
  private installDebugProbe(): void {
    if (process.env.NODE_ENV === "production") return;
    const host = window as unknown as { __rcDebug?: () => unknown };
    host.__rcDebug = () => ({
      phase: this.phase,
      alive: this.local?.alive ?? false,
      health: this.local?.health ?? 0,
      lookActive: this.isLookActive(),
      pointerLocked: this.pointerLocked,
      viewYaw: this.viewYaw,
      viewPitch: this.viewPitch,
      x: this.local?.position.x ?? 0,
      y: this.local?.position.y ?? 0,
      z: this.local?.position.z ?? 0,
      onGround: this.local?.controller?.onGround ?? true,
      velocityY: this.local?.controller?.velocityY ?? 0,
    });
  }

  getRole(): EngineRole {
    return this.role;
  }

  getPhase(): MatchPhase {
    return this.phase;
  }

  getResults(): MatchResults | null {
    return this.results;
  }

  setFirstPerson(value: boolean): void {
    this.firstPerson = value;
    this.updateAvatarVisibility();
  }

  toggleFirstPerson(): void {
    this.firstPerson = !this.firstPerson;
    this.updateAvatarVisibility();
    this.options.onFirstPersonChange?.(this.firstPerson);
    this.options.audio.click();
    this.emitHud(true);
  }

  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0.2, value || 1);
  }

  setGraphicsQuality(graphics: Settings["graphics"]): void {
    const low = graphics === "low";
    const high = graphics === "high";
    this.renderer.setPixelRatio(
      low ? 1 : Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5),
    );
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    const size = high ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.onResize();
  }

  setVolumes(music: number, sfx: number): void {
    this.options.audio.setVolumes(music, sfx);
  }

  removeCombatant(id: string): void {
    const combatant = this.byId.get(id);
    if (!combatant || combatant.isLocal) return;
    this.byId.delete(id);
    const index = this.combatants.indexOf(combatant);
    if (index >= 0) this.combatants.splice(index, 1);
    this.disposeCombatant(combatant);
    this.updateAvatarVisibility();
    this.emitHud(true);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.firing = false;
      this.aiming = false;
    }
  }

  isLookActive(): boolean {
    return this.pointerLocked || this.lookFallback;
  }

  private enableLookFallback(): void {
    this.pointerLockAttemptAt = 0;
    if (this.lookFallback) return;
    this.lookFallback = true;
    this.emitHud(true);
  }

  requestPointerLock(): void {
    const canvas = this.renderer.domElement;
    if (document.pointerLockElement === canvas) return;
    this.options.audio.ensure();
    if (typeof canvas.requestPointerLock !== "function") {
      this.enableLookFallback();
      return;
    }
    this.pointerLockAttemptAt = performance.now();
    try {
      const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => this.enableLookFallback());
      }
    } catch {
      this.enableLookFallback();
    }
  }

  showChatBubble(playerId: string, text: string): void {
    const combatant = this.byId.get(playerId);
    if (!combatant || combatant.isLocal || !text.trim()) return;
    if (combatant.chatBubble) {
      combatant.chatBubble.sprite.removeFromParent();
      combatant.chatBubble.texture.dispose();
      (combatant.chatBubble.sprite.material as THREE.SpriteMaterial).dispose();
    }
    const clean = text.trim().slice(0, 110);
    const { texture, aspect } = createChatBubbleTexture(clean);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 2.55, 0);
    sprite.scale.set(0.42 * Math.min(5.5, aspect), 0.42, 1);
    combatant.avatar.group.add(sprite);
    combatant.chatBubble = { sprite, texture, until: performance.now() + 4500 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.detachEvents();
    if (document.pointerLockElement === this.renderer.domElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    this.options.audio.setScene("menu");
    this.clearEffects();
    this.combatants.forEach((combatant) => {
      this.disposeCombatant(combatant);
    });
    this.combatants = [];
    this.byId.clear();
    Object.values(this.viewModels).forEach((model) => {
      if (!model) return;
      model.group.removeFromParent();
      disposeObject(model.group);
    });
    this.viewModels = {};
    this.world.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.world.group.removeFromParent();
    this.skyTexture?.dispose();
    this.sharedMuzzleTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // -------------------------------------------------------------------------
  // World / scene setup
  // -------------------------------------------------------------------------

  private setupEnvironment(graphics: Settings["graphics"]): void {
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 16;
    skyCanvas.height = 256;
    const ctx = skyCanvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, "#4f8fc9");
      gradient.addColorStop(0.48, "#9dc7e3");
      gradient.addColorStop(0.75, "#d5e7ef");
      gradient.addColorStop(1, "#eef0e6");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 256);
    }
    this.skyTexture = new THREE.CanvasTexture(skyCanvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(260, 24, 16),
      new THREE.MeshBasicMaterial({
        map: this.skyTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xc4d9e7, 55, 175);

    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x726752, 1.25);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xfff6e8, 0.32);
    this.scene.add(ambient);

    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.35);
    this.sun.position.set(34, 48, 22);
    this.sun.castShadow = graphics !== "low";
    const shadowSize = graphics === "high" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.left = -34;
    this.sun.shadow.camera.right = 34;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -20;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 130;
    this.sun.shadow.bias = -0.0006;
    this.sun.target.position.set(0, 12, 0);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(this.camera);
  }

  private setupViewModels(): void {
    for (const id of WEAPON_ORDER) {
      const model = buildWeaponModel(id);
      const group = model.group;
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        }
      });
      group.rotation.y = Math.PI;
      if (id === "rifle") {
        group.position.set(0.33, -0.31, -0.62);
        group.scale.setScalar(0.95);
      } else if (id === "pistol") {
        group.position.set(0.28, -0.29, -0.52);
        group.scale.setScalar(1.04);
      } else {
        group.position.set(0.3, -0.27, -0.46);
        group.rotation.z = 0.3;
        group.scale.setScalar(1.1);
      }
      group.visible = false;
      this.camera.add(group);
      this.viewModels[id] = model;
    }
  }

  // -------------------------------------------------------------------------
  // Roster creation
  // -------------------------------------------------------------------------

  private createRoster(): void {
    const mode = this.options.mode;
    const modeInfo = GAME_MODES.find((entry) => entry.id === mode);
    const maxHumans = mode === "training" ? 1 : modeInfo?.maxPlayers ?? 8;
    const humans: Array<Profile & { team?: TeamId }> = [];
    const seen = new Set<string>();

    for (const player of this.options.players || []) {
      if (!player || !player.id || player.isBot || seen.has(player.id)) continue;
      seen.add(player.id);
      humans.push(player);
    }
    if (!seen.has(this.options.localProfile.id)) {
      humans.unshift(this.options.localProfile);
      seen.add(this.options.localProfile.id);
    }
    while (humans.length > maxHumans) humans.pop();

    this.assignHumanTeams(humans);

    for (const profile of humans) {
      const team = this.humanTeam(profile.id);
      const isLocal = profile.id === this.options.localProfile.id;
      const combatant = this.createCombatant(
        profile,
        team,
        false,
        isLocal,
        profile.isBot,
      );
      if (isLocal) {
        this.local = combatant;
        this.localController = combatant.controller!;
      }
    }

    this.addBots();
    this.applyInitialStats();
  }

  private normalizedTeamAssignments = new Map<string, TeamId>();

  private assignHumanTeams(humans: Array<Profile & { team?: TeamId }>): void {
    const mode = this.options.mode;
    this.normalizedTeamAssignments.clear();
    if (mode === "training") {
      humans.forEach((player, index) => {
        this.normalizedTeamAssignments.set(
          player.id,
          index === 0 || player.id === this.options.localProfile.id ? "alpha" : "bravo",
        );
      });
      return;
    }
    if (mode === "duel") {
      humans.forEach((player, index) => {
        this.normalizedTeamAssignments.set(player.id, index === 0 ? "alpha" : "bravo");
      });
      return;
    }
    if (mode === "lonewolf") {
      const solo = humans.find((player) => player.team === "solo") || humans[0];
      humans.forEach((player) => {
        this.normalizedTeamAssignments.set(
          player.id,
          solo && player.id === solo.id ? "solo" : "bravo",
        );
      });
      return;
    }
    const hasAlpha = humans.some((player) => player.team === "alpha");
    const hasBravo = humans.some((player) => player.team === "bravo");
    humans.forEach((player, index) => {
      if (!hasAlpha && !hasBravo) {
        this.normalizedTeamAssignments.set(player.id, index % 2 === 0 ? "alpha" : "bravo");
      } else if (!hasAlpha) {
        this.normalizedTeamAssignments.set(player.id, "alpha");
      } else if (!hasBravo) {
        this.normalizedTeamAssignments.set(player.id, "bravo");
      } else {
        this.normalizedTeamAssignments.set(
          player.id,
          player.team === "bravo" ? "bravo" : "alpha",
        );
      }
    });
  }

  private humanTeam(id: string): TeamId {
    return this.normalizedTeamAssignments.get(id) || "alpha";
  }

  private get localTeam(): TeamId {
    return this.local?.team || this.humanTeam(this.options.localProfile.id);
  }

  private addBots(): void {
    if (this.role === "client") return;
    const mode = this.options.mode;
    const info = GAME_MODES.find((entry) => entry.id === mode);
    const limit = mode === "training" ? 2 : mode === "duel" ? 2 : info?.maxPlayers ?? 8;
    let desired = Math.max(0, Math.floor(this.options.settings.botCount || 0));

    if (mode === "training") desired = Math.max(1, desired);
    if (mode === "duel") desired = this.combatants.length < 2 ? Math.max(1, desired) : 0;

    let room = Math.max(0, limit - this.combatants.length);
    let count = Math.min(desired, room);
    const enemyExists = this.combatants.some(
      (combatant) => combatant.team !== this.localTeam,
    );
    if (!enemyExists && mode !== "training" && this.combatants.length > 0) count = Math.max(1, count);
    if (mode === "training") count = Math.max(1, count);
    count = Math.min(count, room);

    for (let i = 0; i < count; i += 1) {
      const team = this.botTeam(mode);
      const profile: Profile = {
        id: `bot_${this.matchId}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        nickname: BOT_NAMES[this.botNameCounter % BOT_NAMES.length],
        gender: "custom",
        customization: makeBotCustomization(this.botNameCounter),
      };
      this.botNameCounter += 1;
      const combatant = this.createCombatant(profile, team, true, false, true);
      const bot = new BotAgent(
        combatant.id,
        combatant.nickname,
        combatant.customization,
        team,
        this.options.settings.difficulty,
      );
      combatant.bot = bot;
      combatant.controller = bot.controller;
      combatant.botIndex = this.combatants.length;
    }

    if (
      this.combatants.length > 0 &&
      !this.combatants.some((combatant) => combatant.team !== this.localTeam) &&
      mode !== "training" &&
      this.combatants.length < limit
    ) {
      const profile: Profile = {
        id: `bot_${this.matchId}_pickup`,
        nickname: BOT_NAMES[this.botNameCounter % BOT_NAMES.length],
        gender: "custom",
        customization: makeBotCustomization(this.botNameCounter),
      };
      const team = this.botTeam(mode);
      const combatant = this.createCombatant(profile, team, true, false, true);
      const bot = new BotAgent(
        combatant.id,
        combatant.nickname,
        combatant.customization,
        team,
        this.options.settings.difficulty,
      );
      combatant.bot = bot;
      combatant.controller = bot.controller;
      combatant.botIndex = this.combatants.length;
    }
  }

  private botTeam(mode: GameMode): TeamId {
    if (mode === "team") {
      const alpha = this.combatants.filter((combatant) => combatant.team === "alpha").length;
      const bravo = this.combatants.filter((combatant) => combatant.team === "bravo").length;
      const localIsAlpha = this.localTeam === "alpha";
      if (alpha === bravo) return localIsAlpha ? "bravo" : "alpha";
      return alpha < bravo ? "alpha" : "bravo";
    }
    return "bravo";
  }

  private createCombatant(
    profile: Profile,
    team: TeamId,
    isBot: boolean,
    isLocal: boolean,
    fromSeed?: boolean,
  ): Combatant {
    const customization = profile.customization || DEFAULT_CUSTOMIZATION;
    const avatar = buildAvatarMesh(customization);
    avatar.group.visible = !isLocal || !this.firstPerson;
    avatar.group.position.set(0, 0, 0);
    this.scene.add(avatar.group);

    const weaponModels = {} as Record<WeaponId, WeaponModel>;
    for (const id of WEAPON_ORDER) {
      const model = buildWeaponModel(id);
      model.group.visible = id === "rifle";
      if (isLocal) model.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
        }
      });
      avatar.weaponAnchor.add(model.group);
      weaponModels[id] = model;
    }

    const nameTag = this.makeNameTagSprite(profile.nickname, team, 100, 10);
    nameTag.visible = !isLocal;
    nameTag.position.set(0, 2.2, 0);
    avatar.group.add(nameTag);

    const controller = isLocal ? new CharacterController() : undefined;

    const combatant: Combatant = {
      id: profile.id,
      nickname: profile.nickname,
      team,
      isBot,
      isLocal,
      customization,
      avatar,
      weaponModels,
      nameTag,
      nameTagHealth: -1,
      nameTagPoints: -1,
      nameTagAt: 0,
      chatBubble: null,
      controller,
      position: new THREE.Vector3(),
      visualPosition: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      yaw: 0,
      visualYaw: 0,
      targetYaw: 0,
      crouch: false,
      visualCrouch: 0,
      health: MATCH_RULES.maxHealth,
      maxHealth: MATCH_RULES.maxHealth,
      points: MATCH_RULES.startingPoints,
      kills: 0,
      deaths: 0,
      alive: true,
      eliminated: false,
      spawnProtectUntil: 0,
      respawnAt: 0,
      weapon: "rifle",
      ammo: {
        rifle: WEAPONS.rifle.magazine,
        pistol: WEAPONS.pistol.magazine,
        knife: 0,
      },
      reserve: {
        rifle: WEAPONS.rifle.reserve,
        pistol: WEAPONS.pistol.reserve,
        knife: 0,
      },
      reloading: null,
      reloadEndsAt: 0,
      lastShotAt: 0,
      legPhase: 0,
      moveBlend: 0,
      lastHitAt: 0,
      lastSnapshotAt: 0,
      botIndex: 0,
    };

    if (fromSeed) {
      // Nothing extra: remote combatants are created at match start by their
      // host-provided profile.
    }

    this.combatants.push(combatant);
    this.byId.set(combatant.id, combatant);
    return combatant;
  }

  private applyInitialStats(): void {
    for (const combatant of this.combatants) {
      const loneWolf = this.options.mode === "lonewolf" && combatant.team === "solo";
      const points = loneWolf
        ? MATCH_RULES.startingPoints * MATCH_RULES.loneWolfPointMultiplier
        : MATCH_RULES.startingPoints;
      const health = loneWolf ? MATCH_RULES.loneWolfHealth : MATCH_RULES.maxHealth;
      combatant.points = points;
      combatant.maxHealth = health;
      combatant.health = health;
      combatant.eliminated = false;
      if (combatant.bot) {
        combatant.bot.maxHealth = health;
        combatant.bot.health = health;
        combatant.bot.points = points;
        combatant.bot.alive = true;
      }
    }
  }

  private initialSpawns(now: number): void {
    let botIndex = 0;
    for (const combatant of this.combatants) {
      if (combatant.isLocal) {
        const spawn = this.pickSpawn(combatant.team, (candidate) => candidate.level === 0);
        this.placeHumanAtSpawn(combatant, spawn);
        this.viewYaw = spawn.yaw;
        this.viewPitch = -0.03;
      } else if (combatant.bot) {
        combatant.bot.spawn(this.world, now, botIndex);
        botIndex += 1;
        this.syncBotToCombatant(combatant);
      } else {
        const spawn = this.pickSpawn(combatant.team, (candidate) => candidate.level <= 2);
        this.placeHumanAtSpawn(combatant, spawn);
      }
      combatant.spawnProtectUntil = now + 4000;
      combatant.respawnAt = 0;
      combatant.alive = true;
      combatant.eliminated = false;
      combatant.avatar.group.visible = !combatant.isLocal || !this.firstPerson;
    }
    this.updateAvatarVisibility();
  }

  private placeHumanAtSpawn(combatant: Combatant, spawn: SpawnPoint): void {
    const clear = findClearSpawn(
      spawn.x,
      spawn.z,
      spawn.y,
      this.world.solids,
      this.world.surfaces,
      AVATAR_HEIGHT,
      AVATAR_RADIUS,
    );
    const x = clear?.x ?? spawn.x;
    const z = clear?.z ?? spawn.z;
    const safeSpawn: SpawnPoint = { ...spawn, x, z };
    combatant.position.set(x, spawn.y, z);
    combatant.visualPosition.copy(combatant.position);
    combatant.targetPosition.copy(combatant.position);
    combatant.yaw = spawn.yaw;
    combatant.visualYaw = spawn.yaw;
    combatant.targetYaw = spawn.yaw;
    combatant.avatar.group.position.copy(combatant.position);
    combatant.avatar.group.rotation.y = spawn.yaw;
    if (combatant.controller) {
      combatant.controller.teleport(safeSpawn);
    }
  }

  private spawnBlocked(spawn: SpawnPoint): boolean {
    return this.world.solids.some((solid) =>
      boxIntersectsPlayer(solid, spawn.x, spawn.z, spawn.y, AVATAR_HEIGHT, AVATAR_RADIUS),
    );
  }

  private pickSpawn(
    team: TeamId,
    filter?: (spawn: SpawnPoint) => boolean,
  ): SpawnPoint {
    const enemies = this.combatants.filter(
      (combatant) =>
        combatant.alive && combatant.id !== this.local?.id && combatant.team !== team,
    );
    let candidates = this.world.spawns.filter((spawn) => (filter ? filter(spawn) : true));
    const clear = candidates.filter((spawn) => !this.spawnBlocked(spawn));
    if (clear.length > 0) candidates = clear;
    if (candidates.length === 0) candidates = this.world.spawns;
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const spawn of candidates) {
      let minDistance = 40;
      for (const enemy of enemies) {
        minDistance = Math.min(
          minDistance,
          Math.hypot(enemy.position.x - spawn.x, enemy.position.y - spawn.y, enemy.position.z - spawn.z),
        );
      }
      const score = Math.min(minDistance, 26) + Math.random() * 4;
      if (score > bestScore) {
        bestScore = score;
        best = spawn;
      }
    }
    return best;
  }

  private syncBotToCombatant(combatant: Combatant): void {
    const bot = combatant.bot;
    if (!bot) return;
    const position = bot.controller.position;
    combatant.position.set(position.x, position.y, position.z);
    combatant.visualPosition.copy(combatant.position);
    combatant.targetPosition.copy(combatant.position);
    combatant.yaw = bot.controller.yaw;
    combatant.visualYaw = bot.controller.yaw;
    combatant.targetYaw = bot.controller.yaw;
    combatant.crouch = bot.controller.crouching;
    combatant.health = bot.health;
    combatant.alive = bot.alive;
    combatant.deaths = bot.deaths;
    combatant.points = bot.points;
    combatant.avatar.group.position.copy(combatant.position);
    combatant.avatar.group.rotation.y = combatant.yaw;
  }

  private makeNameTagSprite(
    nickname: string,
    team: TeamId,
    health: number,
    points: number,
  ): THREE.Sprite {
    const texture = createNameTagTexture(nickname, TEAM_COLORS[team], health, points);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.65, 0.42, 1);
    return sprite;
  }

  private refreshAllNameTags(now: number): void {
    for (const combatant of this.combatants) {
      this.refreshNameTag(combatant, now, true);
    }
  }

  private refreshNameTag(combatant: Combatant, now: number, force = false): void {
    if (combatant.isLocal) return;
    if (!force && now - combatant.nameTagAt < 380) return;
    if (
      !force &&
      Math.abs(combatant.nameTagHealth - combatant.health) < 1 &&
      combatant.nameTagPoints === combatant.points
    ) {
      return;
    }
    combatant.nameTagAt = now;
    combatant.nameTagHealth = combatant.health;
    combatant.nameTagPoints = combatant.points;
    const texture = createNameTagTexture(
      combatant.nickname,
      TEAM_COLORS[combatant.team],
      Math.max(0, combatant.health),
      combatant.points,
    );
    const material = combatant.nameTag.material as THREE.SpriteMaterial;
    if (material.map) material.map.dispose();
    material.map = texture;
    material.needsUpdate = true;
  }

  private updateAvatarVisibility(): void {
    if (!this.local) return;
    for (const combatant of this.combatants) {
      const visible =
        combatant.alive &&
        (!combatant.isLocal || !this.firstPerson);
      combatant.avatar.group.visible = visible;
      for (const id of WEAPON_ORDER) {
        combatant.weaponModels[id].group.visible =
          combatant.alive && combatant.weapon === id;
      }
    }
    this.updateViewmodelWeapon();
  }

  private updateViewmodelWeapon(): void {
    for (const id of WEAPON_ORDER) {
      const model = this.viewModels[id];
      if (model) {
        model.group.visible =
          this.firstPerson &&
          this.local.alive &&
          this.phase !== "ended" &&
          this.local.weapon === id;
      }
    }
  }

  private disposeCombatant(combatant: Combatant): void {
    combatant.avatar.group.removeFromParent();
    disposeObject(combatant.avatar.group);
    if (combatant.chatBubble) {
      combatant.chatBubble.texture.dispose();
    }
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  private attachEvents(): void {
    window.addEventListener("resize", this.resizeHandler);
    document.addEventListener("mousemove", this.mouseMoveHandler);
    document.addEventListener("mouseup", this.mouseUpHandler);
    document.addEventListener("pointerlockchange", this.pointerLockHandler);
    document.addEventListener("pointerlockerror", this.pointerLockErrorHandler);
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    window.addEventListener("blur", this.blurHandler);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("mousedown", this.mouseDownHandler);
    canvas.addEventListener("contextmenu", this.contextMenuHandler);
    canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
  }

  private detachEvents(): void {
    window.removeEventListener("resize", this.resizeHandler);
    document.removeEventListener("mousemove", this.mouseMoveHandler);
    document.removeEventListener("mouseup", this.mouseUpHandler);
    document.removeEventListener("pointerlockchange", this.pointerLockHandler);
    document.removeEventListener("pointerlockerror", this.pointerLockErrorHandler);
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("blur", this.blurHandler);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("mousedown", this.mouseDownHandler);
    canvas.removeEventListener("contextmenu", this.contextMenuHandler);
    canvas.removeEventListener("wheel", this.wheelHandler);
  }

  private onResize(): void {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.inputEnabled) return;
    if (!this.isLookActive()) return;
    const scale = -0.0021 * this.sensitivity;
    this.viewYaw += event.movementX * scale;
    this.viewPitch = clamp(this.viewPitch - event.movementY * scale, -1.32, 1.32);
  }

  private onMouseDown(event: MouseEvent): void {
    if (!this.inputEnabled || isTypingTarget(event.target)) return;
    this.options.audio.ensure();
    if (event.button === 0 && !this.isLookActive()) {
      this.requestPointerLock();
      return;
    }
    if (event.button === 0) {
      this.firing = true;
      this.fireRequested = true;
      if (this.phase === "live" && this.local.alive) event.preventDefault();
    } else if (event.button === 2) {
      this.aiming = true;
      event.preventDefault();
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) this.firing = false;
    if (event.button === 2) this.aiming = false;
  }

  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLockAttemptAt = 0;
    if (this.pointerLocked) this.options.audio.ensure();
    if (!this.pointerLocked) {
      this.firing = false;
      this.aiming = false;
      this.fireRequested = false;
    }
    this.emitHud(true);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.inputEnabled || isTypingTarget(event.target)) return;
    const code = event.code;
    if (code === "Tab") {
      event.preventDefault();
      this.scoreboardHeld = true;
      this.emitHud(true);
      return;
    }
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyR", "KeyV"].includes(code)) {
      if (this.isLookActive() || code !== "Space") {
        event.preventDefault();
      }
    }
    if (event.repeat) {
      if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(code)) {
        this.keys.add(code);
      }
      return;
    }
    this.keys.add(code);
    if (code === "KeyV") {
      this.toggleFirstPerson();
    } else if (code === "KeyC") {
      this.crouchToggle = !this.crouchToggle;
    } else if (code === "KeyR") {
      this.startReload(performance.now());
    } else if (code === "Digit1") {
      this.switchWeapon("rifle");
    } else if (code === "Digit2") {
      this.switchWeapon("pistol");
    } else if (code === "Digit3") {
      this.switchWeapon("knife");
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;
    this.keys.delete(event.code);
    if (event.code === "Tab") {
      this.scoreboardHeld = false;
      this.emitHud(true);
    }
  }

  private onBlur(): void {
    this.keys.clear();
    this.firing = false;
    this.aiming = false;
    this.scoreboardHeld = false;
  }

  private onWheel(event: WheelEvent): void {
    if (!this.inputEnabled || this.phase !== "live" || !this.local.alive) return;
    event.preventDefault();
    if (this.local.reloading) return;
    const index = WEAPON_ORDER.indexOf(this.local.weapon);
    const next = (index + (event.deltaY > 0 ? 1 : WEAPON_ORDER.length - 1)) % WEAPON_ORDER.length;
    this.switchWeapon(WEAPON_ORDER[next]);
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  private animate = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    const rawDt = (now - this.lastFrameTime) / 1000;
    const dt = clamp(rawDt, 0.0001, 0.05);
    this.lastFrameTime = now;
    this.fps = this.fps * 0.92 + (1 / Math.max(dt, 0.0001)) * 0.08;
    if (
      this.pointerLockAttemptAt > 0 &&
      now - this.pointerLockAttemptAt > 1200 &&
      document.pointerLockElement !== this.renderer.domElement
    ) {
      this.enableLookFallback();
    }
    this.update(now, dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(now: number, dt: number): void {
    this.updatePhase(now, dt);
    this.updateLocal(now, dt);
    if (this.role !== "client") this.updateBots(now, dt);
    this.updateRespawns(now);
    this.updateRemoteVisuals(now, dt);
    this.updateEffects(dt);
    this.updateChatBubbles(now);
    this.updateNameTags(now);
    this.updateNetwork(now);
    this.updateCamera(now, dt);
    this.updateAudio(now);
    this.pruneKillFeed(now);
    this.emitHud(false);
  }

  private updatePhase(now: number, dt: number): void {
    if (this.phase === "countdown") {
      const remaining = Math.max(0, (this.phaseEndsAt - now) / 1000);
      const second = Math.ceil(remaining);
      if (second !== this.lastCountdownSecond) {
        this.lastCountdownSecond = second;
        if (second > 0 && second <= 3) {
          this.options.audio.countdown(second === 1);
        }
        this.emitHud(true);
      }
      if (now >= this.phaseEndsAt) {
        this.phase = "live";
        this.options.audio.countdown(true);
        for (const combatant of this.combatants) {
          if (combatant.alive) {
            combatant.spawnProtectUntil =
              now + MATCH_RULES.spawnProtectionSeconds * 1000;
          }
        }
        this.options.onEvent({
          type: "notice",
          text: "BUILD. HIDE. STRIKE. MATCH LIVE.",
          tone: "good",
        });
        this.emitHud(true);
      }
      return;
    }
    if (this.phase === "live") {
      const before = this.timeLeftMs;
      this.timeLeftMs = Math.max(0, this.timeLeftMs - dt * 1000);
      if (before > 0 && this.timeLeftMs <= 0) {
        this.maybeEndMatch(now, true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Local player
  // -------------------------------------------------------------------------

  private updateLocal(now: number, dt: number): void {
    const local = this.local;
    if (!local) return;

    if (this.phase === "live" && local.alive) {
      const forward =
        (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
      const strafe =
        (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
      const crouch =
        this.crouchToggle ||
        this.keys.has("ControlLeft") ||
        this.keys.has("ControlRight");
      const sprint =
        (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
        forward > 0 &&
        !crouch;
      const jump = this.keys.has("Space");
      const aiming = this.aiming || now < this.aimUntil;
      const cameraYaw = this.viewYaw + this.recoilYaw;
      const controller = local.controller!;
      const wasGrounded = controller.onGround;

      const result = controller.update(
        dt,
        {
          forward,
          strafe,
          sprint,
          jump,
          crouch,
          cameraYaw,
          aiming,
        },
        this.world.solids,
        this.world.surfaces,
      );

      if (aiming) {
        controller.yaw = cameraYaw;
      }

      local.position.copy(controller.position);
      local.visualPosition.copy(controller.position);
      local.crouch = controller.crouching;
      local.yaw = controller.yaw;
      local.visualYaw = controller.yaw;
      local.targetYaw = controller.yaw;
      local.moveBlend = clamp(result.horizontalSpeed / 12.6, 0, 1);
      this.sprinting = sprint && result.moving;

      if (jump && wasGrounded && !result.onGround) {
        this.options.audio.jump();
      }
      if (result.justLanded && result.fallDistance > 6) {
        this.applyFallDamage(local, result.fallDistance, now);
      }

      if (result.moving && result.onGround) {
        this.footstepTimer -= dt;
        if (this.footstepTimer <= 0) {
          this.options.audio.footstep();
          this.footstepTimer = sprint ? 0.24 : 0.34;
        }
      } else {
        this.footstepTimer = Math.min(this.footstepTimer, 0.1);
      }

      const spec = WEAPONS[local.weapon];
      if (
        this.firing &&
        this.inputEnabled &&
        (this.fireRequested || spec.automatic)
      ) {
        this.fireRequested = false;
        this.tryFire(now);
      } else if (!this.firing) {
        this.fireRequested = false;
      }
    } else {
      this.sprinting = false;
      this.fireRequested = false;
      if (!local.alive) {
        local.visualPosition.copy(local.position);
      }
    }

    if (local.reloading && now >= local.reloadEndsAt) {
      this.completeReload(now);
    }
    local.crouch = local.alive ? local.controller?.crouching ?? local.crouch : local.crouch;
  }

  private tryFire(now: number): void {
    const local = this.local;
    if (!local || !local.alive || this.phase !== "live" || !this.inputEnabled) return;
    if (!this.isLookActive()) return;
    const weapon = local.weapon;
    const spec = WEAPONS[weapon];
    if (local.reloading) return;
    if (now < local.reloadEndsAt) return;
    if (now - local.lastShotAt < 60000 / spec.rpm) return;

    if (!spec.melee) {
      if (local.ammo[weapon] <= 0) {
        this.options.audio.empty();
        this.startReload(now);
        return;
      }
    }

    local.lastShotAt = now;
    if (!spec.melee) {
      local.ammo[weapon] = Math.max(0, local.ammo[weapon] - 1);
    }

    const aim = this.getAimRay();
    const movingPenalty = this.sprinting ? 1.55 : 1;
    const crouchBonus = local.crouch ? 0.7 : 1;
    const aimBonus = this.aiming ? 0.4 : 1;
    const spread = spec.melee ? 0 : spec.spread * movingPenalty * crouchBonus * aimBonus;
    const direction = applySpread(aim.direction, spread);
    const input: ShotInput = { origin: aim.origin, direction, weapon };

    this.aimUntil = now + 1500;
    this.spawnMuzzleFlash(this.getMuzzlePosition(local));
    if (spec.melee) {
      this.options.audio.knifeSwing();
    } else {
      this.options.audio.shoot(weapon === "rifle" ? "rifle" : "pistol");
    }

    const outcome = this.computeShot(local, input);
    this.renderTracer(local, input, outcome.end);
    if (outcome.target) this.spawnImpact(outcome.end, outcome.headshot);

    if (this.role === "client") {
      this.network({
        t: "shot",
        shooterId: local.id,
        input,
        clientTime: now,
      });
    } else {
      if (outcome.target) {
        const damage = spec.damage * (outcome.headshot ? spec.headMultiplier : 1);
        this.damageCombatant(
          outcome.target,
          damage,
          local,
          weapon,
          outcome.headshot,
          now,
          false,
        );
      }
      if (this.role === "host") {
        this.network({
          t: "shotFx",
          fx: {
            shooterId: local.id,
            weapon,
            origin: this.getMuzzlePosition(local),
            end: outcome.end,
            hitPlayerId: outcome.target?.id,
            headshot: outcome.headshot,
          },
        });
      }
    }

    const recoil = spec.melee ? 0.002 : weapon === "pistol" ? 0.006 : 0.0045;
    this.recoilPitch += recoil + Math.random() * 0.0025;
    this.recoilYaw += (Math.random() - 0.5) * 0.004;

    if (!spec.melee && local.ammo[weapon] <= 0 && local.reserve[weapon] > 0) {
      this.startReload(now);
    }
    this.emitHud(true);
  }

  private startReload(now: number): void {
    const local = this.local;
    if (!local || !local.alive || this.phase !== "live") return;
    const spec = WEAPONS[local.weapon];
    if (spec.melee || local.reloading) return;
    if (local.ammo[local.weapon] >= spec.magazine) return;
    if (local.reserve[local.weapon] <= 0 && local.ammo[local.weapon] > 0) return;
    if (local.reserve[local.weapon] <= 0) return;
    local.reloading = local.weapon;
    local.reloadEndsAt = now + spec.reloadSeconds * 1000;
    this.options.audio.reload();
    this.emitHud(true);
  }

  private completeReload(now: number): void {
    const local = this.local;
    if (!local || !local.reloading) return;
    const weapon = local.reloading;
    const spec = WEAPONS[weapon];
    const needed = spec.magazine - local.ammo[weapon];
    const moved = Math.min(needed, local.reserve[weapon]);
    local.ammo[weapon] += moved;
    local.reserve[weapon] -= moved;
    local.reloading = null;
    local.reloadEndsAt = 0;
    this.options.audio.click();
    this.emitHud(true);
  }

  private switchWeapon(weapon: WeaponId): void {
    const local = this.local;
    if (!local || !local.alive || this.phase !== "live") return;
    if (local.weapon === weapon) return;
    local.weapon = weapon;
    local.reloading = null;
    local.reloadEndsAt = 0;
    this.updateAvatarVisibility();
    this.syncWeaponVisibility(local);
    this.options.audio.click();
    this.emitHud(true);
  }

  private syncWeaponVisibility(combatant: Combatant): void {
    for (const id of WEAPON_ORDER) {
      combatant.weaponModels[id].group.visible =
        combatant.alive && combatant.weapon === id;
    }
  }

  private getLookDirection(): { x: number; y: number; z: number } {
    const yaw = this.viewYaw + this.recoilYaw;
    const pitch = clamp(this.viewPitch + this.recoilPitch, -1.42, 1.42);
    return {
      x: Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: Math.cos(yaw) * Math.cos(pitch),
    };
  }

  private getAimRay(): {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  } {
    const local = this.local;
    const direction = this.getLookDirection();
    const eyeHeight = local.crouch ? 1.0 : 1.55;
    const eye = {
      x: local.position.x,
      y: local.position.y + eyeHeight,
      z: local.position.z,
    };
    if (this.firstPerson || !local.alive) {
      return { origin: eye, direction };
    }
    const cameraPosition = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };
    const worldHit = raycastBoxes(
      cameraPosition,
      direction,
      this.world.shotBlockers,
      150,
    );
    const distance = worldHit ? Math.max(2, worldHit.t) : 150;
    const aimPoint = {
      x: cameraPosition.x + direction.x * distance,
      y: cameraPosition.y + direction.y * distance,
      z: cameraPosition.z + direction.z * distance,
    };
    const corrected = normalize({
      x: aimPoint.x - eye.x,
      y: aimPoint.y - eye.y,
      z: aimPoint.z - eye.z,
    });
    return { origin: eye, direction: corrected };
  }

  private getMuzzlePosition(combatant: Combatant): THREE.Vector3 {
    const position = new THREE.Vector3();
    if (combatant.isLocal && this.firstPerson) {
      const viewModel = this.viewModels[combatant.weapon];
      if (viewModel) {
        this.camera.updateMatrixWorld(true);
        viewModel.muzzle.getWorldPosition(position);
        return position;
      }
    }
    const model = combatant.weaponModels[combatant.weapon];
    combatant.avatar.group.updateMatrixWorld(true);
    model.muzzle.getWorldPosition(position);
    return position;
  }

  // -------------------------------------------------------------------------
  // Hit detection
  // -------------------------------------------------------------------------

  private hitBoxes(combatant: Combatant): { body: BoxCollider; head: BoxCollider } {
    const x = combatant.position.x;
    const y = combatant.position.y;
    const z = combatant.position.z;
    const crouch = combatant.crouch;
    const body: BoxCollider = {
      minX: x - 0.36,
      maxX: x + 0.36,
      minY: y + 0.04,
      maxY: y + (crouch ? 0.88 : 1.5),
      minZ: z - 0.3,
      maxZ: z + 0.3,
    };
    const head: BoxCollider = {
      minX: x - 0.23,
      maxX: x + 0.23,
      minY: y + (crouch ? 0.84 : 1.47),
      maxY: y + (crouch ? 1.18 : 1.91),
      minZ: z - 0.23,
      maxZ: z + 0.23,
    };
    return { body, head };
  }

  private computeShot(shooter: Combatant, input: ShotInput): ShotOutcome {
    const spec = WEAPONS[input.weapon];
    const direction = normalize(input.direction);
    const origin = input.origin;
    const worldHit = raycastBoxes(origin, direction, this.world.shotBlockers, spec.range);
    let maxDistance = worldHit && inFrontRange(worldHit.t, spec.range) ? worldHit.t : spec.range;
    let target: Combatant | null = null;
    let targetDistance = Infinity;
    let headshot = false;

    for (const combatant of this.combatants) {
      if (
        combatant.id === shooter.id ||
        !combatant.alive ||
        combatant.team === shooter.team
      ) {
        continue;
      }
      const boxes = this.hitBoxes(combatant);
      const bodyT = rayBox(origin, direction, boxes.body);
      const headT = rayBox(origin, direction, boxes.head);
      let nearest = Infinity;
      let isHead = false;
      if (bodyT !== null && bodyT >= 0) {
        nearest = bodyT;
      }
      if (headT !== null && headT >= 0 && headT < nearest) {
        nearest = headT;
        isHead = true;
      }
      if (
        nearest < Infinity &&
        nearest < maxDistance &&
        nearest < targetDistance
      ) {
        targetDistance = nearest;
        target = combatant;
        headshot = isHead;
      }
    }

    if (target) {
      return {
        target,
        headshot,
        blocked: false,
        end: {
          x: origin.x + direction.x * targetDistance,
          y: origin.y + direction.y * targetDistance,
          z: origin.z + direction.z * targetDistance,
        },
      };
    }

    if (worldHit && inFrontRange(worldHit.t, spec.range)) {
      return {
        target: null,
        headshot: false,
        blocked: true,
        end: worldHit.point,
      };
    }

    return {
      target: null,
      headshot: false,
      blocked: false,
      end: {
        x: origin.x + direction.x * spec.range,
        y: origin.y + direction.y * spec.range,
        z: origin.z + direction.z * spec.range,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  private renderTracer(
    shooter: Combatant,
    input: ShotInput,
    end: { x: number; y: number; z: number },
  ): void {
    if (input.weapon === "knife") return;
    this.renderTracerPoints(this.getMuzzlePosition(shooter), end);
  }

  private renderTracerPoints(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
  ): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffd88a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, material, life: 0.08, maxLife: 0.08 });
  }

  private spawnMuzzleFlash(position: THREE.Vector3): void {
    const material = new THREE.SpriteMaterial({
      map: this.sharedMuzzleTexture,
      color: 0xffe4a3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(0.55);
    this.scene.add(sprite);
    this.spriteEffects.push({
      sprite,
      material,
      life: 0.065,
      maxLife: 0.065,
      grow: 2.2,
    });
  }

  private spawnImpact(
    point: { x: number; y: number; z: number },
    headshot: boolean,
  ): void {
    const material = new THREE.SpriteMaterial({
      map: this.sharedMuzzleTexture,
      color: headshot ? 0xff4f3d : 0xffce8c,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(point.x, point.y, point.z);
    sprite.scale.setScalar(headshot ? 0.3 : 0.18);
    this.scene.add(sprite);
    this.spriteEffects.push({
      sprite,
      material,
      life: 0.22,
      maxLife: 0.22,
      grow: 2.6,
    });
  }

  private spawnSpawnRing(position: THREE.Vector3): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0x73e2ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 26), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, position.y + 0.06, position.z);
    this.scene.add(mesh);
    this.ringEffects.push({ mesh, material, life: 0.8, maxLife: 0.8 });
  }

  private updateEffects(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const effect = this.tracers[i];
      effect.life -= dt;
      effect.material.opacity = Math.max(0, effect.life / effect.maxLife) * 0.9;
      if (effect.life <= 0) {
        effect.line.removeFromParent();
        effect.line.geometry.dispose();
        effect.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.spriteEffects.length - 1; i >= 0; i -= 1) {
      const effect = this.spriteEffects[i];
      effect.life -= dt;
      const t = Math.max(0, effect.life / effect.maxLife);
      effect.material.opacity = t;
      effect.sprite.scale.multiplyScalar(1 + dt * effect.grow * 6);
      if (effect.life <= 0) {
        effect.sprite.removeFromParent();
        effect.material.dispose();
        this.spriteEffects.splice(i, 1);
      }
    }
    for (let i = this.ringEffects.length - 1; i >= 0; i -= 1) {
      const effect = this.ringEffects[i];
      effect.life -= dt;
      const t = Math.max(0, effect.life / effect.maxLife);
      effect.material.opacity = t * 0.85;
      effect.mesh.scale.setScalar(1 + (1 - t) * 2.4);
      if (effect.life <= 0) {
        effect.mesh.removeFromParent();
        effect.mesh.geometry.dispose();
        effect.material.dispose();
        this.ringEffects.splice(i, 1);
      }
    }
  }

  private clearEffects(): void {
    for (const effect of this.tracers) {
      effect.line.removeFromParent();
      effect.line.geometry.dispose();
      effect.material.dispose();
    }
    this.tracers = [];
    for (const effect of this.spriteEffects) {
      effect.sprite.removeFromParent();
      effect.material.dispose();
    }
    this.spriteEffects = [];
    for (const effect of this.ringEffects) {
      effect.mesh.removeFromParent();
      effect.mesh.geometry.dispose();
      effect.material.dispose();
    }
    this.ringEffects = [];
  }

  // -------------------------------------------------------------------------
  // Damage, deaths and points
  // -------------------------------------------------------------------------

  private damageCombatant(
    victim: Combatant,
    damage: number,
    attacker: Combatant | null,
    weapon: WeaponId,
    headshot: boolean,
    now: number,
    environment: boolean,
  ): HitEvent | null {
    if (!victim.alive || this.phase !== "live") return null;
    if (now < victim.spawnProtectUntil) return null;
    if (attacker && attacker.id !== victim.id && attacker.team === victim.team) {
      return null;
    }

    const applied = Math.max(1, Math.round(damage));
    victim.health = Math.max(0, victim.health - applied);
    victim.lastHitAt = now;
    const killed = victim.health <= 0;
    let transfer = 0;
    let killPayload:
      | {
          kill: KillEvent;
          killerName: string;
          victimName: string;
          points: number;
          environment: boolean;
        }
      | null = null;

    if (killed) {
      transfer = environment ? 0 : Math.min(1, victim.points);
      victim.points = Math.max(0, victim.points - (victim.points > 0 ? 1 : 0));
      if (!environment && attacker) attacker.points += transfer;
      victim.deaths += 1;
      victim.alive = false;
      victim.health = 0;
      victim.eliminated = victim.points <= 0;
      victim.respawnAt = now + MATCH_RULES.respawnSeconds * 1000;
      if (attacker) attacker.kills += 1;
      if (victim.bot) {
        victim.bot.health = 0;
        victim.bot.alive = false;
        victim.bot.deaths = victim.deaths;
        victim.bot.points = victim.points;
        victim.bot.respawnAt = victim.respawnAt;
      }
      const killerName = environment ? "SITE 07" : attacker?.nickname || "SITE 07";
      killPayload = {
        kill: {
          killerId: attacker?.id || "",
          victimId: victim.id,
          weapon,
          headshot,
          points: transfer,
          environment,
        },
        killerName,
        victimName: victim.nickname,
        points: transfer,
        environment,
      };
    } else if (victim.bot) {
      victim.bot.health = victim.health;
    }

    const hit: HitEvent = {
      shooterId: attacker?.id || victim.id,
      victimId: victim.id,
      damage: applied,
      headshot,
      victimHealth: victim.health,
      killed,
      weapon,
      pointTransfer: transfer,
      victimPoints: victim.points,
      shooterPoints: attacker?.points ?? 0,
      environment,
    };

    if (attacker?.isLocal) {
      this.lastHitMarkerAt = now;
      this.options.audio.hit(headshot);
      if (killed) this.options.audio.eliminate();
    }
    if (victim.isLocal) {
      this.lastDamageAt = now;
      this.lastLocalHitAt = now;
      this.cameraShake = Math.min(1.4, this.cameraShake + (killed ? 1 : 0.45));
      this.options.audio.hurt();
      if (killed) this.options.audio.eliminate();
    }
    if (killed) {
      this.spawnImpact(
        { x: victim.position.x, y: victim.position.y + 1.1, z: victim.position.z },
        false,
      );
      this.addKillFeed(
        environment ? "SITE 07" : attacker?.nickname || "SITE 07",
        victim.nickname,
        environment ? "fall" : weapon,
        headshot,
        transfer,
        environment,
        now,
      );
      if (killPayload) {
        this.options.onEvent({
          type: "kill",
          kill: killPayload.kill,
          killerName: killPayload.killerName,
          victimName: killPayload.victimName,
          points: killPayload.points,
          environment: killPayload.environment,
        });
      }
      if (victim.isLocal) {
        this.spectateCheckAt = 0;
        this.options.onEvent({
          type: "notice",
          text:
            victim.points > 0
              ? `YOU WERE DROPPED · ${victim.points} POINT${victim.points === 1 ? "" : "S"} LEFT`
              : "ELIMINATED — OUT OF POINTS",
          tone: "danger",
        });
      } else if (attacker?.isLocal) {
        this.options.onEvent({
          type: "notice",
          text: `ELIMINATED ${victim.nickname.toUpperCase()}${transfer > 0 ? ` · +${transfer} POINT` : ""}`,
          tone: "good",
        });
      }
      this.updateAvatarVisibility();
    }

    this.refreshNameTag(victim, now, true);
    if (this.role === "host") {
      this.network({ t: "hit", hit });
      if (killPayload) this.network({ t: "kill", ...killPayload });
    }
    if (killed) this.maybeEndMatch(now, false);
    this.emitHud(true);
    return hit;
  }

  private applyFallDamage(combatant: Combatant, fallDistance: number, now: number): void {
    if (!combatant.alive || this.phase !== "live") return;
    if (this.role === "client") {
      if (combatant.isLocal) {
        this.network({ t: "fall", playerId: combatant.id, fallDistance });
      }
      return;
    }
    const distance = Math.max(0, fallDistance);
    if (distance < 6) return;
    const damage = distance > 40 ? 999 : Math.round((distance - 6) * 13);
    if (damage <= 0) return;
    this.damageCombatant(combatant, damage, null, "knife", false, now, true);
  }

  private botVoidDeath(combatant: Combatant, now: number): void {
    if (!combatant.alive) return;
    const bot = combatant.bot;
    combatant.health = 0;
    combatant.alive = false;
    combatant.deaths += 1;
    combatant.points = Math.max(0, combatant.points - 1);
    combatant.eliminated = combatant.points <= 0;
    combatant.respawnAt = now + MATCH_RULES.respawnSeconds * 1000;
    if (bot) {
      bot.health = 0;
      bot.alive = false;
      bot.deaths = combatant.deaths;
      bot.points = combatant.points;
      bot.respawnAt = combatant.respawnAt;
    }
    const hit: HitEvent = {
      shooterId: combatant.id,
      victimId: combatant.id,
      damage: 999,
      headshot: false,
      victimHealth: 0,
      killed: true,
      weapon: "knife",
      pointTransfer: 0,
      victimPoints: combatant.points,
      shooterPoints: 0,
      environment: true,
    };
    const kill: KillEvent = {
      killerId: "",
      victimId: combatant.id,
      weapon: "knife",
      headshot: false,
      points: 0,
      environment: true,
    };
    const payload = {
      kill,
      killerName: "SITE 07",
      victimName: combatant.nickname,
      points: 0,
      environment: true,
    };
    this.addKillFeed("SITE 07", combatant.nickname, "fall", false, 0, true, now);
    this.options.onEvent({
      type: "kill",
      kill,
      killerName: "SITE 07",
      victimName: combatant.nickname,
      points: 0,
      environment: true,
    });
    if (this.role === "host") {
      this.network({ t: "hit", hit });
      this.network({ t: "kill", ...payload });
    }
    this.refreshNameTag(combatant, now, true);
    this.updateAvatarVisibility();
    this.maybeEndMatch(now, false);
    this.emitHud(true);
  }

  // -------------------------------------------------------------------------
  // Bots
  // -------------------------------------------------------------------------

  private updateBots(now: number, dt: number): void {
    if (this.phase !== "live") return;
    for (const combatant of this.combatants) {
      const bot = combatant.bot;
      if (!bot || combatant.isLocal || !combatant.alive) continue;

      bot.alive = true;
      bot.health = combatant.health;
      bot.maxHealth = combatant.maxHealth;
      bot.points = combatant.points;
      bot.deaths = combatant.deaths;

      const target = this.findNearestEnemy(combatant);
      const targetPosition = target ? target.position.clone() : null;
      const shot = bot.update(
        {
          now,
          dt,
          targetPosition,
          targetAlive: !!target?.alive,
          targetId: target?.id ?? null,
          hasLineOfSight: (from, to) => this.hasLineOfSight(from, to),
        },
        this.world,
      );

      if (!bot.alive && combatant.alive) {
        this.botVoidDeath(combatant, now);
        continue;
      }

      combatant.health = bot.health;
      combatant.alive = bot.alive;
      combatant.deaths = bot.deaths;
      combatant.position.copy(bot.controller.position);
      combatant.yaw = bot.controller.yaw;
      combatant.crouch = bot.controller.crouching;
      combatant.visualYaw = combatant.yaw;
      if (shot) this.handleBotShot(combatant, shot.input, now);
    }
  }

  private findNearestEnemy(combatant: Combatant): Combatant | null {
    let best: Combatant | null = null;
    let bestDistance = Infinity;
    for (const other of this.combatants) {
      if (!other.alive || other.id === combatant.id || other.team === combatant.team) {
        continue;
      }
      const distance = pointDistance(combatant.position, other.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = other;
      }
    }
    return best;
  }

  private hasLineOfSight(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): boolean {
    const direction = normalize({
      x: to.x - from.x,
      y: to.y - from.y,
      z: to.z - from.z,
    });
    const distance = pointDistance(from, to);
    const hit = raycastBoxes(from, direction, this.world.shotBlockers, distance);
    return !hit || hit.t >= distance - 0.15;
  }

  private handleBotShot(bot: Combatant, input: ShotInput, now: number): void {
    const spec = WEAPONS[input.weapon];
    const outcome = this.computeShot(bot, input);
    this.spawnMuzzleFlash(this.getMuzzlePosition(bot));
    this.renderTracer(bot, input, outcome.end);
    if (outcome.target) this.spawnImpact(outcome.end, outcome.headshot);
    if (!bot.bot) return;

    const distanceToLocal = pointDistance(bot.position, this.local.position);
    if (distanceToLocal < 46 && input.weapon !== "knife") {
      this.options.audio.shoot(input.weapon === "rifle" ? "rifle" : "pistol");
    }

    if (outcome.target) {
      this.damageCombatant(
        outcome.target,
        spec.damage * (outcome.headshot ? spec.headMultiplier : 1),
        bot,
        input.weapon,
        outcome.headshot,
        now,
        false,
      );
    }

    if (this.role === "host") {
      this.network({
        t: "shotFx",
        fx: {
          shooterId: bot.id,
          weapon: input.weapon,
          origin: this.getMuzzlePosition(bot),
          end: outcome.end,
          hitPlayerId: outcome.target?.id,
          headshot: outcome.headshot,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Respawns
  // -------------------------------------------------------------------------

  private updateRespawns(now: number): void {
    if (this.phase !== "live") return;
    const local = this.local;
    if (!local.alive && local.points > 0 && now >= local.respawnAt) {
      this.respawnLocal(now);
    }
    if (this.role === "client") return;
    for (const combatant of this.combatants) {
      if (!combatant.bot || combatant.isLocal) continue;
      if (
        !combatant.alive &&
        combatant.points > 0 &&
        combatant.respawnAt > 0 &&
        now >= combatant.respawnAt
      ) {
        this.respawnBot(combatant, now);
      }
    }
  }

  private respawnLocal(now: number): void {
    const local = this.local;
    if (!local || local.points <= 0) return;
    const spawn = this.pickSpawn(local.team, (candidate) => candidate.level <= 2);
    this.placeHumanAtSpawn(local, spawn);
    local.alive = true;
    local.health = local.maxHealth;
    local.eliminated = false;
    local.respawnAt = 0;
    local.spawnProtectUntil = now + MATCH_RULES.spawnProtectionSeconds * 1000;
    local.reloading = null;
    local.reloadEndsAt = 0;
    local.weapon = "rifle";
    local.ammo.rifle = WEAPONS.rifle.magazine;
    local.reserve.rifle = WEAPONS.rifle.reserve;
    local.ammo.pistol = WEAPONS.pistol.magazine;
    local.reserve.pistol = WEAPONS.pistol.reserve;
    this.viewYaw = spawn.yaw;
    this.viewPitch = -0.02;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.spectateId = null;
    this.spectateCheckAt = 0;
    this.lastLocalSpawnAt = now;
    this.spawnSpawnRing(local.position);
    this.updateAvatarVisibility();
    this.syncWeaponVisibility(local);
    this.refreshNameTag(local, now, true);
    this.options.onEvent({
      type: "notice",
      text: local.points > 1 ? "BACK ON SITE — GET TO COVER" : "FINAL LIFE — MAKE IT COUNT",
      tone: "info",
    });
    if (this.role === "client") {
      this.network({ t: "respawn", playerId: local.id });
    }
    this.emitHud(true);
  }

  private respawnBot(combatant: Combatant, now: number): void {
    const bot = combatant.bot;
    if (!bot) return;
    bot.maxHealth = combatant.maxHealth;
    bot.spawn(this.world, now, combatant.botIndex);
    bot.points = combatant.points;
    bot.deaths = combatant.deaths;
    bot.health = combatant.maxHealth;
    bot.alive = true;
    combatant.alive = true;
    combatant.health = combatant.maxHealth;
    combatant.eliminated = false;
    combatant.respawnAt = 0;
    combatant.spawnProtectUntil = now + MATCH_RULES.spawnProtectionSeconds * 1000;
    combatant.crouch = false;
    combatant.weapon = "rifle";
    combatant.reloading = null;
    this.syncBotToCombatant(combatant);
    combatant.alive = true;
    combatant.health = combatant.maxHealth;
    this.spawnSpawnRing(combatant.position);
    this.refreshNameTag(combatant, now, true);
    this.emitHud(true);
  }

  // -------------------------------------------------------------------------
  // Networking
  // -------------------------------------------------------------------------

  private network(message: EngineNetMessage): void {
    if (this.role === "solo") return;
    this.options.onNetwork?.(message);
  }

  private snapshotOf(combatant: Combatant, now: number): PlayerSnapshot {
    return {
      id: combatant.id,
      nickname: combatant.nickname,
      team: combatant.team,
      x: combatant.position.x,
      y: combatant.position.y,
      z: combatant.position.z,
      yaw: combatant.yaw,
      legRot: combatant.legPhase,
      torsoYOffset: 0,
      crouch: combatant.crouch,
      alive: combatant.alive,
      health: combatant.health,
      points: combatant.points,
      kills: combatant.kills,
      deaths: combatant.deaths,
      weapon: combatant.weapon,
      spawnProtect: Math.max(0, (combatant.spawnProtectUntil - now) / 1000),
      isBot: combatant.isBot || undefined,
      customization: combatant.customization,
    };
  }

  private updateNetwork(now: number): void {
    if (this.role === "host") {
      if (now - this.lastSnapshotSentAt < 1000 / NETWORK_CONFIG.snapshotHz) return;
      this.lastSnapshotSentAt = now;
      this.network({
        t: "snapshot",
        players: this.combatants.map((combatant) => this.snapshotOf(combatant, now)),
        timeLeft: this.timeLeftMs,
        phase: this.phase,
      });
    } else if (this.role === "client") {
      if (!this.local.alive) return;
      if (now - this.lastClientSnapshotAt < 1000 / NETWORK_CONFIG.stateHz) return;
      this.lastClientSnapshotAt = now;
      this.network({ t: "clientSnapshot", snapshot: this.snapshotOf(this.local, now) });
    }
  }

  handleNet(message: EngineNetMessage): void {
    if (this.disposed) return;
    switch (message.t) {
      case "snapshot":
        if (this.role === "client") {
          this.applySnapshot(message.players, message.timeLeft, message.phase);
        }
        break;
      case "clientSnapshot":
        if (this.role === "host") this.handleClientSnapshot(message.snapshot);
        break;
      case "shot":
        if (this.role === "host") {
          this.handleClientShot(message.shooterId, message.input, message.clientTime);
        }
        break;
      case "respawn":
        if (this.role === "host") this.handleClientRespawn(message.playerId);
        break;
      case "fall":
        if (this.role === "host") {
          const victim = this.byId.get(message.playerId);
          if (victim) this.applyFallDamage(victim, message.fallDistance, performance.now());
        }
        break;
      case "hit":
        if (this.role === "client") this.applyRemoteHit(message.hit);
        break;
      case "kill":
        if (this.role === "client") {
          this.applyRemoteKill(
            message.kill,
            message.killerName,
            message.victimName,
            message.points,
            message.environment,
          );
        }
        break;
      case "shotFx":
        if (this.role === "client") this.renderShotFx(message.fx);
        break;
      case "matchEnd":
        if (this.role === "client") this.applyMatchEnd(message.results);
        break;
      default:
        break;
    }
  }

  private applySnapshot(
    snapshots: PlayerSnapshot[],
    timeLeft: number,
    phase: MatchPhase,
  ): void {
    if (this.phase === "ended") return;
    const now = performance.now();
    this.timeLeftMs = Math.max(0, timeLeft);
    if (phase === "live" && this.phase === "countdown") {
      this.phase = "live";
      this.options.audio.countdown(true);
      this.options.onEvent({
        type: "notice",
        text: "BUILD. HIDE. STRIKE. MATCH LIVE.",
        tone: "good",
      });
    }

    for (const snapshot of snapshots) {
      if (!snapshot || !snapshot.id) continue;
      let combatant = this.byId.get(snapshot.id);
      if (!combatant) {
        combatant = this.createRemoteFromSnapshot(snapshot);
      }
      if (combatant.isLocal) {
        this.applyLocalSnapshot(combatant, snapshot, now);
        continue;
      }
      const wasAlive = combatant.alive;
      combatant.position.set(snapshot.x, snapshot.y, snapshot.z);
      combatant.targetPosition.copy(combatant.position);
      combatant.yaw = snapshot.yaw;
      combatant.targetYaw = snapshot.yaw;
      combatant.crouch = snapshot.crouch;
      combatant.health = snapshot.health;
      combatant.points = snapshot.points;
      combatant.kills = snapshot.kills;
      combatant.deaths = snapshot.deaths;
      combatant.alive = snapshot.alive;
      combatant.eliminated = snapshot.points <= 0;
      combatant.weapon = snapshot.weapon;
      combatant.spawnProtectUntil = now + Math.max(0, snapshot.spawnProtect) * 1000;
      combatant.lastSnapshotAt = now;
      if (wasAlive && !snapshot.alive) {
        this.spawnImpact(
          { x: snapshot.x, y: snapshot.y + 1.1, z: snapshot.z },
          false,
        );
      }
      this.syncWeaponVisibility(combatant);
      this.refreshNameTag(combatant, now, true);
    }
    this.updateAvatarVisibility();
    this.emitHud(false);
  }

  private applyLocalSnapshot(
    combatant: Combatant,
    snapshot: PlayerSnapshot,
    now: number,
  ): void {
    combatant.points = snapshot.points;
    combatant.kills = snapshot.kills;
    combatant.deaths = snapshot.deaths;
    combatant.eliminated = snapshot.points <= 0;
    combatant.spawnProtectUntil = now + Math.max(0, snapshot.spawnProtect) * 1000;
    if (snapshot.alive) {
      if (!combatant.alive && now - this.lastLocalSpawnAt > 1200) {
        combatant.alive = true;
        combatant.health = snapshot.health;
        combatant.respawnAt = 0;
        this.updateAvatarVisibility();
      } else if (combatant.alive && now - this.lastLocalHitAt > 260) {
        combatant.health = snapshot.health;
      }
    } else if (combatant.alive && now - this.lastLocalSpawnAt > 1200) {
      combatant.alive = false;
      combatant.health = 0;
      combatant.respawnAt = now + MATCH_RULES.respawnSeconds * 1000;
      this.updateAvatarVisibility();
    }
    combatant.lastSnapshotAt = now;
  }

  private createRemoteFromSnapshot(snapshot: PlayerSnapshot): Combatant {
    const profile: Profile = {
      id: snapshot.id,
      nickname: snapshot.nickname,
      gender: "custom",
      customization: snapshot.customization || DEFAULT_CUSTOMIZATION,
      isBot: snapshot.isBot,
    };
    const combatant = this.createCombatant(
      profile,
      snapshot.team,
      !!snapshot.isBot,
      false,
      false,
    );
    combatant.maxHealth = this.maxHealthFor(snapshot.team);
    combatant.health = snapshot.health;
    combatant.points = snapshot.points;
    combatant.kills = snapshot.kills;
    combatant.deaths = snapshot.deaths;
    combatant.alive = snapshot.alive;
    combatant.eliminated = snapshot.points <= 0;
    combatant.weapon = snapshot.weapon;
    combatant.position.set(snapshot.x, snapshot.y, snapshot.z);
    combatant.visualPosition.copy(combatant.position);
    combatant.targetPosition.copy(combatant.position);
    combatant.yaw = snapshot.yaw;
    combatant.visualYaw = snapshot.yaw;
    combatant.targetYaw = snapshot.yaw;
    combatant.crouch = snapshot.crouch;
    combatant.spawnProtectUntil =
      performance.now() + Math.max(0, snapshot.spawnProtect) * 1000;
    combatant.avatar.group.position.copy(combatant.position);
    combatant.avatar.group.rotation.y = snapshot.yaw;
    this.syncWeaponVisibility(combatant);
    this.refreshNameTag(combatant, performance.now(), true);
    return combatant;
  }

  private maxHealthFor(team: TeamId): number {
    return this.options.mode === "lonewolf" && team === "solo"
      ? MATCH_RULES.loneWolfHealth
      : MATCH_RULES.maxHealth;
  }

  private handleClientSnapshot(snapshot: PlayerSnapshot): void {
    const combatant = this.byId.get(snapshot.id);
    if (!combatant || combatant.isLocal) return;
    const now = performance.now();
    if (snapshot.alive && !combatant.alive && combatant.points > 0) {
      combatant.alive = true;
      combatant.health = combatant.maxHealth;
      combatant.eliminated = false;
      combatant.respawnAt = 0;
      combatant.spawnProtectUntil = now + MATCH_RULES.spawnProtectionSeconds * 1000;
    }
    combatant.position.set(snapshot.x, snapshot.y, snapshot.z);
    combatant.targetPosition.copy(combatant.position);
    combatant.yaw = snapshot.yaw;
    combatant.targetYaw = snapshot.yaw;
    combatant.crouch = snapshot.crouch;
    combatant.weapon = snapshot.weapon;
    combatant.lastSnapshotAt = now;
    this.syncWeaponVisibility(combatant);
  }

  private handleClientShot(
    shooterId: string,
    input: ShotInput,
    _clientTime: number,
  ): void {
    if (this.role !== "host" || this.phase !== "live") return;
    const shooter = this.byId.get(shooterId);
    if (!shooter || !shooter.alive || shooter.isLocal) return;
    const weapon = input.weapon;
    const spec = WEAPONS[weapon];
    if (!spec) return;
    const now = performance.now();
    const last = this.lastRemoteShotAt.get(shooterId) ?? 0;
    if (now - last < (60000 / Math.max(30, spec.rpm)) * 0.55) return;
    this.lastRemoteShotAt.set(shooterId, now);
    if (pointDistance(input.origin, shooter.position) > 5.5) return;
    const direction = normalize(input.direction);
    if (Math.hypot(direction.x, direction.y, direction.z) < 0.2) return;
    const shotInput: ShotInput = { origin: input.origin, direction, weapon };
    const outcome = this.computeShot(shooter, shotInput);
    const origin = {
      x: input.origin.x + direction.x * 0.3,
      y: input.origin.y + direction.y * 0.3,
      z: input.origin.z + direction.z * 0.3,
    };
    const fx: ShotFx = {
      shooterId,
      weapon,
      origin,
      end: outcome.end,
      hitPlayerId: outcome.target?.id,
      headshot: outcome.headshot,
    };
    this.renderShotFx(fx);
    this.network({ t: "shotFx", fx });
    if (outcome.target && weapon !== "knife") {
      const specHit = WEAPONS[weapon];
      this.damageCombatant(
        outcome.target,
        specHit.damage * (outcome.headshot ? specHit.headMultiplier : 1),
        shooter,
        weapon,
        outcome.headshot,
        now,
        false,
      );
    } else if (outcome.target) {
      this.damageCombatant(
        outcome.target,
        spec.damage * (outcome.headshot ? spec.headMultiplier : 1),
        shooter,
        weapon,
        outcome.headshot,
        now,
        false,
      );
    }
  }

  private handleClientRespawn(playerId: string): void {
    const combatant = this.byId.get(playerId);
    if (!combatant || combatant.isLocal || combatant.points <= 0) return;
    if (!combatant.alive) {
      combatant.alive = true;
      combatant.health = combatant.maxHealth;
      combatant.eliminated = false;
      combatant.respawnAt = 0;
      combatant.spawnProtectUntil =
        performance.now() + MATCH_RULES.spawnProtectionSeconds * 1000;
    }
    this.refreshNameTag(combatant, performance.now(), true);
  }

  private renderShotFx(fx: ShotFx): void {
    if (fx.shooterId === this.local.id) return;
    if (fx.weapon !== "knife") {
      this.spawnMuzzleFlash(new THREE.Vector3(fx.origin.x, fx.origin.y, fx.origin.z));
      this.renderTracerPoints(fx.origin, fx.end);
    }
    if (fx.hitPlayerId) {
      this.spawnImpact(fx.end, !!fx.headshot);
    }
    const distance = pointDistance(this.local.position, fx.origin);
    if (distance < 50) {
      if (fx.weapon === "knife") this.options.audio.knifeSwing();
      else this.options.audio.shoot(fx.weapon === "rifle" ? "rifle" : "pistol");
    }
  }

  private applyRemoteHit(hit: HitEvent): void {
    if (this.phase === "ended") return;
    const now = performance.now();
    const shooter = this.byId.get(hit.shooterId);
    const victim = this.byId.get(hit.victimId);

    if (shooter) {
      shooter.points = hit.shooterPoints;
      if (hit.killed && hit.shooterId !== hit.victimId) shooter.kills += 1;
    }
    if (victim) {
      victim.points = hit.victimPoints;
      victim.health = hit.victimHealth;
      victim.eliminated = hit.victimPoints <= 0;
      if (hit.killed) {
        victim.alive = false;
        victim.deaths += 1;
        victim.respawnAt = now + MATCH_RULES.respawnSeconds * 1000;
      }
      if (!victim.isLocal) {
        this.syncWeaponVisibility(victim);
        this.refreshNameTag(victim, now, true);
      }
    }

    if (hit.shooterId === this.local.id) {
      this.lastHitMarkerAt = now;
      this.options.audio.hit(hit.headshot);
      if (hit.killed) {
        this.options.audio.eliminate();
        this.options.onEvent({
          type: "notice",
          text: `ELIMINATED ${victim?.nickname?.toUpperCase() || "RIVAL"} · +${hit.pointTransfer} POINT`,
          tone: "good",
        });
      }
    }

    if (hit.victimId === this.local.id) {
      const local = this.local;
      this.lastDamageAt = now;
      this.lastLocalHitAt = now;
      this.cameraShake = Math.min(1.4, this.cameraShake + (hit.killed ? 1 : 0.45));
      this.options.audio.hurt();
      local.points = hit.victimPoints;
      local.health = hit.victimHealth;
      if (hit.killed) {
        local.alive = false;
        local.health = 0;
        local.deaths += 1;
        local.eliminated = hit.victimPoints <= 0;
        local.respawnAt = now + MATCH_RULES.respawnSeconds * 1000;
        this.spectateCheckAt = 0;
        this.options.audio.eliminate();
        this.options.onEvent({
          type: "notice",
          text:
            hit.victimPoints > 0
              ? `YOU WERE DROPPED · ${hit.victimPoints} POINT${hit.victimPoints === 1 ? "" : "S"} LEFT`
              : "ELIMINATED — OUT OF POINTS",
          tone: "danger",
        });
      }
      this.updateAvatarVisibility();
    }

    this.emitHud(true);
  }

  private applyRemoteKill(
    kill: KillEvent,
    killerName: string,
    victimName: string,
    points: number,
    environment: boolean,
  ): void {
    this.addKillFeed(
      killerName,
      victimName,
      environment ? "fall" : kill.weapon,
      kill.headshot,
      points,
      environment,
      performance.now(),
    );
    this.options.onEvent({
      type: "kill",
      kill,
      killerName,
      victimName,
      points,
      environment,
    });
    this.emitHud(true);
  }

  // -------------------------------------------------------------------------
  // Visuals
  // -------------------------------------------------------------------------

  private updateRemoteVisuals(_now: number, dt: number): void {
    const blend = 1 - Math.exp(-14 * dt);
    for (const combatant of this.combatants) {
      const previousX = combatant.visualPosition.x;
      const previousZ = combatant.visualPosition.z;
      const isHostBot = !!combatant.bot && this.role !== "client";

      if (!combatant.isLocal) {
        const moved = Math.hypot(
          combatant.position.x - combatant.visualPosition.x,
          combatant.position.z - combatant.visualPosition.z,
        );
        combatant.visualPosition.lerp(combatant.position, isHostBot ? 1 : blend);
        combatant.visualYaw = lerpAngle(
          combatant.visualYaw,
          combatant.yaw,
          Math.min(1, blend * 1.4),
        );
        const speed = moved / Math.max(dt, 0.001);
        combatant.moveBlend = lerp(
          combatant.moveBlend,
          clamp(speed / 12.6, 0, 1),
          1 - Math.exp(-8 * dt),
        );
      } else {
        combatant.visualPosition.copy(combatant.position);
        combatant.visualYaw = combatant.yaw;
      }

      combatant.visualCrouch = lerp(
        combatant.visualCrouch,
        combatant.crouch ? 1 : 0,
        1 - Math.exp(-12 * dt),
      );
      combatant.legPhase += dt * (2.2 + combatant.moveBlend * 11);

      combatant.avatar.group.position.copy(combatant.visualPosition);
      combatant.avatar.group.rotation.y = combatant.isLocal
        ? combatant.yaw
        : combatant.visualYaw;
      combatant.avatar.group.scale.set(
        1,
        lerp(1, 0.72, combatant.visualCrouch),
        1,
      );
      combatant.avatar.group.visible =
        combatant.alive && (!combatant.isLocal || !this.firstPerson);
      combatant.nameTag.visible = combatant.alive && !combatant.isLocal;

      const swing = Math.sin(combatant.legPhase) * 0.62 * combatant.moveBlend;
      combatant.avatar.pivots.leftLeg.rotation.x = swing;
      combatant.avatar.pivots.rightLeg.rotation.x = -swing;
      combatant.avatar.pivots.leftArm.rotation.x = -1.28 - swing * 0.08;
      combatant.avatar.pivots.rightArm.rotation.x = -1.14 + swing * 0.08;
      combatant.avatar.pivots.leftArm.rotation.z = 0.17;
      combatant.avatar.pivots.rightArm.rotation.z = -0.06;

      this.syncWeaponVisibility(combatant);
      if (!combatant.isLocal) {
        this.refreshNameTag(combatant, _now, false);
      }

      // Keep the far visual and the authoritative position in sync enough for
      // interpolation without accumulating float drift.
      if (Math.abs(previousX - combatant.visualPosition.x) > 12) {
        combatant.visualPosition.copy(combatant.position);
      }
      if (Math.abs(previousZ - combatant.visualPosition.z) > 12) {
        combatant.visualPosition.copy(combatant.position);
      }
    }
    this.updateViewmodelWeapon();
  }

  private updateCamera(now: number, dt: number): void {
    this.recoilPitch *= Math.exp(-dt * 10);
    this.recoilYaw *= Math.exp(-dt * 10);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);

    let anchor: Combatant | null = this.local;
    if (this.local && !this.local.alive) {
      if (now > this.spectateCheckAt) {
        this.spectateCheckAt = now + 1500;
        const target = this.findSpectateTarget();
        this.spectateId = target?.id ?? null;
      }
      const spectate = this.spectateId ? this.byId.get(this.spectateId) : null;
      anchor = spectate && spectate.alive ? spectate : null;
    }

    if (!anchor) {
      const angle = this.viewYaw;
      const radius = 28;
      const centerY = 12 + this.viewPitch * 8;
      this.camera.position.set(
        Math.sin(angle) * radius,
        centerY + 8,
        Math.cos(angle) * radius,
      );
      this.camera.lookAt(0, 10, 0);
      this.updateViewmodelWeapon();
      return;
    }

    const firstPersonView =
      anchor.isLocal && anchor.alive && this.firstPerson && this.phase !== "ended";
    const eyeHeight = anchor.crouch ? 0.98 : firstPersonView ? 1.58 : 1.48;
    const pivot = new THREE.Vector3(
      anchor.visualPosition.x,
      anchor.visualPosition.y + eyeHeight,
      anchor.visualPosition.z,
    );
    const yaw = this.viewYaw + this.recoilYaw;
    const pitch = clamp(this.viewPitch + this.recoilPitch, -1.42, 1.42);
    const direction = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    let cameraPosition: THREE.Vector3;
    if (firstPersonView) {
      cameraPosition = new THREE.Vector3(
        pivot.x + right.x * 0.08,
        pivot.y,
        pivot.z + right.z * 0.08,
      );
    } else {
      const zoomed = anchor.isLocal && this.aiming;
      const distance = zoomed ? 2.6 : 4.6;
      const shoulder = zoomed ? 0.85 : 1.05;
      const desired = new THREE.Vector3(
        pivot.x - right.x * shoulder - direction.x * distance,
        pivot.y - direction.y * distance,
        pivot.z - right.z * shoulder - direction.z * distance,
      );
      const offset = desired.clone().sub(pivot);
      const length = offset.length();
      if (length > 0.1) {
        const rayDir = offset.clone().divideScalar(length);
        const hit = raycastBoxes(
          { x: pivot.x, y: pivot.y, z: pivot.z },
          { x: rayDir.x, y: rayDir.y, z: rayDir.z },
          this.world.shotBlockers,
          length,
        );
        if (hit) {
          const safe = Math.max(0.42, hit.t - 0.3);
          desired.copy(pivot).addScaledVector(rayDir, safe);
        }
      }
      if (desired.y < anchor.position.y + 0.18) {
        desired.y = anchor.position.y + 0.18;
      }
      cameraPosition = desired;
    }

    if (this.cameraShake > 0.01) {
      const strength = this.cameraShake * 0.11;
      cameraPosition.x += (Math.random() - 0.5) * strength;
      cameraPosition.y += (Math.random() - 0.5) * strength;
      cameraPosition.z += (Math.random() - 0.5) * strength;
    }

    this.camera.position.copy(cameraPosition);
    this.camera.lookAt(
      cameraPosition.x + direction.x,
      cameraPosition.y + direction.y,
      cameraPosition.z + direction.z,
    );

    const targetFov = firstPersonView
      ? this.aiming
        ? 58
        : 72
      : this.aiming && anchor.isLocal
        ? 52
        : 68;
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-9 * dt));
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    if (firstPersonView) {
      const model = this.viewModels[this.local.weapon];
      if (model) {
        const id = this.local.weapon;
        const baseX = id === "rifle" ? 0.33 : id === "pistol" ? 0.28 : 0.3;
        const baseY = id === "rifle" ? -0.31 : id === "pistol" ? -0.29 : -0.27;
        const baseZ = id === "rifle" ? -0.62 : id === "pistol" ? -0.52 : -0.46;
        const bob = this.local.moveBlend;
        model.group.position.set(
          baseX + Math.sin(now * 0.008) * 0.007 * bob,
          baseY + Math.abs(Math.cos(now * 0.008)) * 0.007 * bob,
          baseZ,
        );
        model.group.rotation.x = -this.recoilPitch * 0.55;
      }
    }
    this.updateViewmodelWeapon();
  }

  private findSpectateTarget(): Combatant | null {
    const local = this.local;
    if (!local) return null;
    const candidates = this.combatants.filter(
      (combatant) => combatant.alive && !combatant.isLocal,
    );
    const allies = candidates.filter((combatant) => combatant.team === local.team);
    const pool = allies.length > 0 ? allies : candidates;
    if (pool.length === 0) return null;
    let best = pool[0];
    let bestDistance = Infinity;
    for (const candidate of pool) {
      const distance = pointDistance(candidate.position, local.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  private updateNameTags(now: number): void {
    for (const combatant of this.combatants) {
      if (combatant.isLocal) {
        combatant.nameTag.visible = false;
        continue;
      }
      combatant.nameTag.visible = combatant.alive;
      this.refreshNameTag(combatant, now, false);
    }
  }

  private updateChatBubbles(now: number): void {
    for (const combatant of this.combatants) {
      const bubble = combatant.chatBubble;
      if (!bubble) continue;
      if (now >= bubble.until) {
        bubble.sprite.removeFromParent();
        bubble.texture.dispose();
        (bubble.sprite.material as THREE.SpriteMaterial).dispose();
        combatant.chatBubble = null;
      }
    }
  }

  private updateAudio(now: number): void {
    if (now - this.lastAudioUpdate < 500) return;
    this.lastAudioUpdate = now;
    const local = this.local;
    let nearest = 60;
    for (const combatant of this.combatants) {
      if (!combatant.alive || combatant.team === local.team) continue;
      nearest = Math.min(nearest, pointDistance(combatant.position, local.position));
    }
    const intensity = local.alive
      ? clamp(1 - nearest / 52, 0, 1) * 0.85 + 0.12
      : 0.2;
    this.options.audio.setIntensity(intensity);
  }

  // -------------------------------------------------------------------------
  // Match end
  // -------------------------------------------------------------------------

  private maybeEndMatch(now: number, timeUp: boolean): void {
    if (this.phase !== "live") return;
    const sides = new Map<TeamId, { points: number; kills: number; players: number }>();
    for (const combatant of this.combatants) {
      const side = sides.get(combatant.team) || { points: 0, kills: 0, players: 0 };
      side.points += combatant.points;
      side.kills += combatant.kills;
      side.players += 1;
      sides.set(combatant.team, side);
    }
    if (sides.size < 2) return;

    if (timeUp) {
      const ranked = [...sides.entries()].sort(
        (a, b) => b[1].points - a[1].points || b[1].kills - a[1].kills,
      );
      if (
        ranked.length > 1 &&
        ranked[0][1].points === ranked[1][1].points &&
        ranked[0][1].kills === ranked[1][1].kills
      ) {
        this.finishMatch("draw", now);
      } else {
        this.finishMatch(ranked[0][0], now);
      }
      return;
    }

    const remaining = [...sides.entries()].filter(([, side]) => side.points > 0);
    if (remaining.length === 0) {
      this.finishMatch("draw", now);
    } else if (remaining.length === 1) {
      this.finishMatch(remaining[0][0], now);
    }
  }

  private finishMatch(winnerTeam: TeamId | "draw", now: number): void {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.endedAt = now;
    this.firing = false;
    this.aiming = false;
    this.scoreboardHeld = false;
    const results: MatchResults = {
      mode: this.options.mode,
      winnerTeam,
      players: this.combatants.map((combatant) => this.snapshotOf(combatant, now)),
      endedAt: Date.now(),
    };
    this.results = results;
    this.options.audio.setScene("results");
    this.updateViewmodelWeapon();
    if (document.pointerLockElement === this.renderer.domElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    if (this.role === "host") {
      this.network({ t: "matchEnd", results });
    }
    this.options.onEvent({ type: "matchEnd", results });
    this.options.onMatchEnd(results);
    this.emitHud(true);
  }

  private applyMatchEnd(results: MatchResults): void {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.endedAt = performance.now();
    this.results = results;
    this.firing = false;
    this.aiming = false;
    this.scoreboardHeld = false;
    this.options.audio.setScene("results");
    this.updateViewmodelWeapon();
    if (document.pointerLockElement === this.renderer.domElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    this.options.onEvent({ type: "matchEnd", results });
    this.options.onMatchEnd(results);
    this.emitHud(true);
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  private addKillFeed(
    killerName: string,
    victimName: string,
    weapon: WeaponId | "fall",
    headshot: boolean,
    points: number,
    environment: boolean,
    now: number,
  ): void {
    this.killFeedCounter += 1;
    this.killFeed.push({
      id: `feed_${this.killFeedCounter}_${Math.floor(now)}`,
      killerName,
      victimName,
      weapon,
      headshot,
      points,
      environment,
      at: now,
    });
    if (this.killFeed.length > 8) this.killFeed.shift();
  }

  private pruneKillFeed(now: number): void {
    if (this.killFeed.length === 0) return;
    const next = this.killFeed.filter((entry) => now - entry.at < 9000);
    if (next.length !== this.killFeed.length) this.killFeed = next;
  }

  private levelOf(y: number): number {
    return clamp(Math.round(y / FLOOR_HEIGHT), 0, ROOF_LEVEL);
  }

  private emitHud(force: boolean): void {
    if (!this.local) return;
    const now = performance.now();
    if (!force && now - this.lastHudAt < 90) return;
    this.lastHudAt = now;
    const local = this.local;
    const level = this.levelOf(local.position.y);
    const teamScores: TeamScores = { alpha: 0, bravo: 0, solo: 0, bots: 0 };
    for (const combatant of this.combatants) {
      teamScores[combatant.team] += combatant.points;
    }
    const teamRank: Record<TeamId, number> = {
      alpha: 0,
      bravo: 1,
      solo: 2,
      bots: 3,
    };
    const scoreboard: ScoreRow[] = [...this.combatants]
      .sort((a, b) => {
        if (teamRank[a.team] !== teamRank[b.team]) {
          return teamRank[a.team] - teamRank[b.team];
        }
        if (b.points !== a.points) return b.points - a.points;
        return b.kills - a.kills;
      })
      .map((combatant) => ({
        id: combatant.id,
        nickname: combatant.nickname,
        team: combatant.team,
        points: combatant.points,
        kills: combatant.kills,
        deaths: combatant.deaths,
        health: Math.max(0, Math.ceil(combatant.health)),
        alive: combatant.alive,
        eliminated: combatant.eliminated || combatant.points <= 0,
        isBot: combatant.isBot,
        isLocal: combatant.isLocal,
        level: this.levelOf(combatant.position.y),
      }));

    const players: MinimapPlayer[] = this.combatants.map((combatant) => ({
      id: combatant.id,
      x: combatant.position.x,
      z: combatant.position.z,
      y: combatant.position.y,
      level: this.levelOf(combatant.position.y),
      yaw: combatant.yaw,
      team: combatant.team,
      alive: combatant.alive,
      isLocal: combatant.isLocal,
      isBot: combatant.isBot,
    }));

    const spectate = this.spectateId ? this.byId.get(this.spectateId) : null;
    const reloadSeconds = local.reloading
      ? WEAPONS[local.reloading].reloadSeconds
      : 0;
    const reloadProgress =
      local.reloading && reloadSeconds > 0
        ? clamp(
            1 - (local.reloadEndsAt - now) / (reloadSeconds * 1000),
            0,
            1,
          )
        : 0;

    const hud: HudState = {
      matchId: this.matchId,
      mode: this.options.mode,
      phase: this.phase,
      countdown: this.phase === "countdown"
        ? Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000))
        : 0,
      timeLeft: Math.max(0, Math.ceil(this.timeLeftMs / 1000)),
      role: this.role,
      pointerLocked: this.pointerLocked,
      lookActive: this.isLookActive(),
      health: Math.max(0, Math.ceil(local.health)),
      maxHealth: local.maxHealth,
      points: local.points,
      kills: local.kills,
      deaths: local.deaths,
      alive: local.alive,
      eliminated: local.eliminated || local.points <= 0,
      respawnIn:
        !local.alive && local.points > 0
          ? Math.max(0, Math.ceil((local.respawnAt - now) / 1000))
          : 0,
      spawnProtect: Math.max(0, (local.spawnProtectUntil - now) / 1000),
      weapon: local.weapon,
      ammoMag: local.ammo[local.weapon],
      ammoReserve: local.reserve[local.weapon],
      reloading: !!local.reloading,
      reloadProgress,
      crouching: local.crouch,
      sprinting: this.sprinting,
      aiming: this.aiming,
      firstPerson: this.firstPerson,
      scoreboardOpen: this.scoreboardHeld,
      level,
      levelName: floorName(level),
      localTeam: local.team,
      localId: local.id,
      scoreboard,
      killFeed: this.killFeed.slice(-6),
      teamScores,
      players,
      hitMarkerAt: this.lastHitMarkerAt,
      damageFlashAt: this.lastDamageAt,
      fps: Math.round(this.fps),
      spectating:
        !local.alive && spectate && spectate.alive ? spectate.nickname : null,
    };
    this.options.onHud(hud);
  }
}
