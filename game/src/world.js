// Kestrel Yard: an original dusk industrial yard, 44 x 30 m, built from boxes.
// Two bomb sites (A west, B east), a mid lane, a north lane and a south lane, with
// crates, containers and pillars for cover and sightlines. Every box is a collider
// for players and bots and a surface a bullet stops on. Waypoints sit in the open
// lanes so bot patrol routes never cut through cover.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint ids, so bot routes read as names instead of raw coordinates.
export const WP = {
  siteA: 0, siteA2: 1, siteB: 2, siteB2: 3,
  mid: 4, midW: 5, midE: 6,
  northW: 7, north: 8, northE: 9,
  southW: 10, south: 11, southE: 12,
  spawnSouth: 13, spawnA: 14, spawnB: 15,
  yardW: 16, yardE: 17,
};

const WAYPOINTS = [
  [-17, 0], [-17, -7], [17, 0], [17, -7],
  [0, 0], [-6, 0], [6, 0],
  [-13, -11], [0, -11], [13, -11],
  [-13, 11], [0, 11], [13, 11],
  [0, 13], [-19, -11], [19, -11],
  [-13, 5], [13, 5],
];

export const SITES = {
  A: { name: 'A', center: new THREE.Vector3(-17, 0, 0), radius: 4.2 },
  B: { name: 'B', center: new THREE.Vector3(17, 0, 0), radius: 4.2 },
};

export const SPAWNS = {
  player: new THREE.Vector3(0, 0, 13),
  allies: [new THREE.Vector3(-2.5, 0, 13), new THREE.Vector3(2.5, 0, 13)],
  enemies: [
    new THREE.Vector3(-17, 0, -8),
    new THREE.Vector3(17, 0, -8),
    new THREE.Vector3(0, 0, -11),
  ],
};

function labelTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,22,26,0.82)';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = color;
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Painted ground: one canvas texture over the whole yard — asphalt speckle, lane
// dashes down mid, an amber wash on site A, a rust wash on site B and a teal wash
// on the attacker spawn, so each zone reads by colour before any geometry does.
// Canvas x runs west→east (-22..22 m), canvas y runs north→south (-15..15 m).
function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const px = (x) => ((x + 22) / 44) * 1024;
  const pz = (z) => ((z + 15) / 30) * 720;
  ctx.fillStyle = '#3a4048';
  ctx.fillRect(0, 0, 1024, 720);
  // Asphalt speckle: cheap noise so the floor is never one flat tone.
  for (let i = 0; i < 5200; i += 1) {
    const shade = 46 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 10},0.5)`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 720, 3, 3);
  }
  // Zone washes under the site pads and the spawn apron.
  ctx.fillStyle = 'rgba(240,168,48,0.20)';
  ctx.fillRect(px(-21.5), pz(-4.5), px(-12.5) - px(-21.5), pz(4.5) - pz(-4.5));
  ctx.fillStyle = 'rgba(192,106,53,0.24)';
  ctx.fillRect(px(12.5), pz(-4.5), px(21.5) - px(12.5), pz(4.5) - pz(-4.5));
  ctx.fillStyle = 'rgba(63,182,168,0.20)';
  ctx.fillRect(px(-4.5), pz(9.5), px(4.5) - px(-4.5), pz(14.8) - pz(9.5));
  // Lane paint: dashed centre line down mid, solid edges on the north/south lanes.
  ctx.fillStyle = 'rgba(233,230,223,0.55)';
  for (let z = -14; z < 14; z += 2.4) ctx.fillRect(px(-0.18), pz(z), px(0.18) - px(-0.18), pz(z + 1.2) - pz(z));
  ctx.fillRect(px(-21), pz(-9.2), px(21) - px(-21), 4);
  ctx.fillRect(px(-21), pz(9.2), px(21) - px(-21), 4);
  // Site letters painted on the ground inside each wash.
  ctx.fillStyle = 'rgba(233,230,223,0.6)';
  ctx.font = 'bold 90px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', px(-17), pz(6.8));
  ctx.fillText('B', px(17), pz(-6.8));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter, 44 x 30 m, walls 5 m high, open dusk sky above.
  box(44.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  // Painted ground skin, 2 cm over the floor slab: visual only (the slab below
  // stays the collider and the bullet stop), so it needs no collider of its own.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 30),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  group.add(ground);
  box(0.4, 5, 30.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Site pads: amber floor plates marking the plant zones.
  box(7, 0.1, 7, -17, 0.05, 0, 'accent');
  box(7, 0.1, 7, 17, 0.05, 0, 'accent');

  // Shipping containers: tall cover that splits the yard into lanes.
  box(6, 2.6, 2.4, -9, 1.3, -8, 'rust');
  box(6, 2.6, 2.4, 9, 1.3, 8, 'rust');
  box(2.4, 2.6, 6, -19, 1.3, 7, 'hairline');
  box(2.4, 2.6, 6, 19, 1.3, -7, 'hairline');
  box(6, 2.6, 2.4, 10, 1.3, -8, 'surface');
  box(6, 2.6, 2.4, -10, 1.3, 8, 'surface');

  // Mid pillars: the crossfire point of the mid lane.
  box(1.4, 4.2, 1.4, 0, 2.1, -5.5, 'hairline');
  box(1.4, 4.2, 1.4, 0, 2.1, 5.5, 'hairline');

  // Crates: low cover to crouch behind, kept off the patrol lanes.
  const crates = [
    [-4.5, -4.5], [4.5, 4.5], [-13, 4.5], [13, -4.5],
    [-6, 8], [6, -8], [-19, -3], [19, 3], [0, -12.5],
  ];
  for (const [x, z] of crates) box(1.3, 1.1, 1.3, x, 0.55, z, 'hairline');
  box(2.2, 1.1, 1.2, -14.5, 0.55, -3, 'hairline');
  box(2.2, 1.1, 1.2, 14.5, 0.55, 3, 'hairline');
  // Stacked crates at each site for plant cover.
  box(1.3, 1.1, 1.3, -15, 0.55, 2.6, 'rust');
  box(1.3, 1.1, 1.3, -15, 1.65, 2.6, 'rust');
  box(1.3, 1.1, 1.3, 15, 0.55, -2.6, 'rust');

  // Landmarks (v2): distinctive props that name each part of the yard. All go
  // through box()/cyl() so every prop is also a collider and a bullet stop, and
  // all sit off the waypoint lanes so bot routes are untouched.
  function cyl(radius, height, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), materials[material]);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  // Watchtower over the north lane: four legs, a platform and a rust roof.
  for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) box(0.18, 3, 0.18, -7.5 + dx, 1.5, -13.2 + dz, 'hairline');
  box(2.2, 0.18, 2.2, -7.5, 3.05, -13.2, 'surface');
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) box(0.12, 1.3, 0.12, -7.5 + dx, 3.8, -13.2 + dz, 'hairline');
  box(2.6, 0.14, 2.6, -7.5, 4.55, -13.2, 'rust');
  box(0.5, 3, 0.08, -7.5, 1.5, -12.3, 'hairline');
  // Container stack, two high, with an amber edge trim; a matching trim strip
  // on the north-east container so the pair reads as one landmark family.
  box(6, 2.6, 2.4, 9, 3.9, 8, 'hairline');
  box(6.14, 0.14, 2.54, 9, 5.26, 8, 'accent');
  box(6.14, 0.14, 2.54, 10, 2.66, -8, 'accent');
  // Striped barriers flanking the mid lane: dark base, amber band, pale cap.
  for (const [bx, bz] of [[-3.2, -8.6], [3.2, 8.6]]) {
    box(2.2, 0.85, 0.35, bx, 0.425, bz, 'hairline');
    box(2.24, 0.2, 0.39, bx, 0.6, bz, 'accent');
    box(2.24, 0.1, 0.39, bx, 0.9, bz, 'ink');
  }
  // Fuel tank in the south-east corner, with an amber band around its middle.
  cyl(1.15, 2.6, 20, 12.3, 'rust');
  const tankBand = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.3, 18), materials.accent);
  tankBand.position.set(20, 1.7, 12.3);
  tankBand.castShadow = true;
  group.add(tankBand);

  // Site rings and floating labels, so a site reads at a glance.
  for (const site of Object.values(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(site.radius, 0.09, 8, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site) }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.12, site.center.z);
    group.add(ring);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.28),
      new THREE.MeshBasicMaterial({
        map: labelTexture(`SITE ${site.name}`, PALETTE.site),
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    label.position.set(site.center.x, 3.6, site.center.z);
    group.add(label);
  }

  // Dusk light, lifted for v2: a brighter amber key (shadows stay on), a strong
  // cool hemisphere so no face falls near black, and a slate sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#b8c7de'), new THREE.Color('#454b54'), 1.55);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffc07a'), 3.4);
  key.position.set(-14, 16, 10);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#8fb0d8'), 0.95);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    waypoints: WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    sites: SITES,
    spawns: SPAWNS,
  };
}
