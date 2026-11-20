import * as THREE from "three";
import type { FaceKind } from "@/lib/types";

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return [canvas, ctx];
}

export function createConcreteTexture(base = "#c9c4b8", accent = "#b8b2a5"): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const size = Math.random() * 2.2 + 0.4;
    ctx.globalAlpha = Math.random() * 0.18 + 0.03;
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : accent;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#6c675e";
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

export function createNetTexture(color = "#ff7a1a"): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = -128; i < 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}

export interface SignOptions {
  title: string;
  subtitle?: string;
  background?: string;
  foreground?: string;
  accent?: string;
}

export function createSignTexture(options: SignOptions): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 512);
  const background = options.background || "#f5b51b";
  const foreground = options.foreground || "#1a1a1a";
  const accent = options.accent || "#ff6b1a";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 30, 512);
  ctx.fillRect(0, 462, 1024, 50);
  ctx.fillStyle = foreground;
  ctx.font = "900 96px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(options.title, 512, options.subtitle ? 220 : 260, 920);
  if (options.subtitle) {
    ctx.font = "700 42px Arial, sans-serif";
    ctx.fillText(options.subtitle, 512, 330, 900);
  }
  ctx.font = "700 24px Arial, sans-serif";
  ctx.fillText("SITE 07  ·  HARD HAT AREA  ·  AUTHORISED CREW ONLY", 512, 440, 900);
  return new THREE.CanvasTexture(canvas);
}

export function createFaceTexture(face: FaceKind, skin: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = "#1b1c21";
  if (face === "happy") {
    ctx.beginPath();
    ctx.arc(88, 108, 11, 0, Math.PI * 2);
    ctx.arc(168, 108, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1b1c21";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(128, 148, 34, 0.06 * Math.PI, 0.94 * Math.PI);
    ctx.stroke();
  } else if (face === "focused") {
    ctx.fillRect(66, 96, 42, 13);
    ctx.fillRect(148, 96, 42, 13);
    ctx.fillRect(88, 120, 24, 9);
    ctx.fillRect(144, 120, 24, 9);
    ctx.fillRect(112, 166, 32, 7);
  } else {
    ctx.fillRect(74, 100, 30, 16);
    ctx.fillRect(152, 100, 30, 16);
    ctx.strokeStyle = "#1b1c21";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(106, 160);
    ctx.quadraticCurveTo(128, 174, 150, 160);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createNameTagTexture(
  nickname: string,
  teamColor: string,
  health: number,
  points: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "rgba(12,16,22,0.82)";
  const radius = 18;
  const x = 8;
  const y = 8;
  const w = 496;
  const h = 112;
  ctx.beginPath();
  if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === "function") {
    (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 34px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(nickname.slice(0, 18), 28, 43, 330);
  ctx.fillStyle = teamColor;
  ctx.font = "800 24px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${points} PTS`, 482, 43);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(28, 70, 454, 14);
  ctx.fillStyle = health > 35 ? "#57d68d" : "#ff5b5b";
  ctx.fillRect(28, 70, 454 * Math.max(0, Math.min(1, health / 100)), 14);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.max(0, Math.ceil(health))} HP`, 482, 105);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export function createMuzzleFlashTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,235,1)");
  gradient.addColorStop(0.25, "rgba(255,220,90,0.95)");
  gradient.addColorStop(0.6, "rgba(255,125,20,0.45)");
  gradient.addColorStop(1, "rgba(255,80,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createChatBubbleTexture(text: string): {
  texture: THREE.CanvasTexture;
  aspect: number;
} {
  const [canvas, ctx] = makeCanvas(8, 8);
  ctx.font = "bold 28px Arial, sans-serif";
  const textWidth = ctx.measureText(text).width;
  const padX = 24;
  const padY = 16;
  const tailHeight = 14;
  const bubbleHeight = 28 + padY * 2;
  const width = Math.max(120, Math.min(720, textWidth + padX * 2));
  const height = bubbleHeight + tailHeight;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.rect(0, 0, width, bubbleHeight);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width / 2 - 10, bubbleHeight - 2);
  ctx.lineTo(width / 2, bubbleHeight + tailHeight);
  ctx.lineTo(width / 2 + 10, bubbleHeight - 2);
  ctx.fill();
  ctx.fillStyle = "#171a20";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, bubbleHeight / 2, width - padX);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return { texture, aspect: width / height };
}
