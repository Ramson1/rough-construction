"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Customization } from "@/lib/types";
import { buildAvatarMesh } from "@/lib/game/avatars";

export default function AvatarPreview({
  customization,
  className = "",
}: {
  customization: Customization;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    camera.position.set(2.15, 1.75, 3.05);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "avatar-preview-canvas";
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xd8ecff, 0x463a2c, 1.5);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffe6bf, 2.6);
    key.position.set(3.2, 5.4, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 16;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -1;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66b9ff, 1.05);
    rim.position.set(-3.4, 2.7, -2.8);
    scene.add(rim);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.5, 0.16, 48),
      new THREE.MeshStandardMaterial({
        color: 0x252c36,
        roughness: 0.72,
        metalness: 0.18,
      }),
    );
    platform.position.y = -0.09;
    platform.receiveShadow = true;
    scene.add(platform);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.42, 1.5, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffb51e,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.18, 40),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    scene.add(shadow);

    const avatar = buildAvatarMesh(customization);
    avatar.group.position.y = 0;
    avatar.pivots.leftArm.rotation.x = -0.25;
    avatar.pivots.rightArm.rotation.x = -0.25;
    avatar.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(avatar.group);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.02, 0);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.1;
    controls.maxDistance = 5;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    const resize = () => {
      const width = host.clientWidth || 320;
      const height = host.clientHeight || 420;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    let previous = performance.now();
    let elapsed = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const now = performance.now();
      elapsed += Math.min(0.05, (now - previous) / 1000);
      previous = now;
      controls.update();
      avatar.pivots.leftLeg.rotation.x = Math.sin(elapsed * 1.6) * 0.018;
      avatar.pivots.rightLeg.rotation.x = -avatar.pivots.leftLeg.rotation.x;
      avatar.pivots.leftArm.rotation.z = 0.08 + Math.sin(elapsed * 1.1) * 0.012;
      avatar.pivots.rightArm.rotation.z = -0.08 - Math.sin(elapsed * 1.1) * 0.012;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else if (material) {
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [customization]);

  return <div ref={hostRef} className={`avatar-preview ${className}`} />;
}
