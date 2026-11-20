import * as THREE from "three";

/** Extruded rounded box used for every body part. */
export function createRoundedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  smoothness: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const x = w / 2 - radius;
  const y = h / 2 - radius;
  shape.absarc(-x, -y, radius, Math.PI, Math.PI * 1.5);
  shape.absarc(x, -y, radius, Math.PI * 1.5, 0);
  shape.absarc(x, y, radius, 0, Math.PI * 0.5);
  shape.absarc(-x, y, radius, Math.PI * 0.5, Math.PI);
  return new THREE.ExtrudeGeometry(shape, {
    depth: d - radius * 2,
    bevelEnabled: true,
    bevelSegments: smoothness,
    steps: 1,
    bevelSize: radius,
    bevelThickness: radius,
    curveSegments: smoothness,
  }).center();
}

/** Narrow-waist torso for the 3.0-style female model. */
export function createWomanTorsoGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, 1.0);
  shape.lineTo(-0.6, 0.0);
  shape.lineTo(-0.85, -1.0);
  shape.lineTo(0.85, -1.0);
  shape.lineTo(0.6, 0.0);
  shape.lineTo(0.9, 1.0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.8,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.06,
    bevelThickness: 0.06,
  }).center();
}
