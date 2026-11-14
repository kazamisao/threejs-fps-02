// Grenades: HE, smoke and flash, thrown on an arc with gravity. HE explodes on a
// fuse with falloff damage that walls block; smoke lays a cloud that blocks bot
// line of sight (see bots.segmentBlockedBySmoke); flash blinds bots that can see
// the burst. One pooled mesh per live grenade, no per-frame allocation.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const HE_FUSE = 1.8;
const HE_RADIUS = 6.5;
const SMOKE_RADIUS = 2.4;
const SMOKE_SECONDS = 14;

const _v = new THREE.Vector3();
const _from = new THREE.Vector3();

export function createGrenades(scene, colliders, shootables) {
  const items = [];
  const smokes = [];
  const sphereGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const shellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 });

  function pointBlocked(p) {
    for (const box of colliders) {
      if (p.x >= box.min.x - 0.09 && p.x <= box.max.x + 0.09
        && p.y >= box.min.y - 0.09 && p.y <= box.max.y + 0.09
        && p.z >= box.min.z - 0.09 && p.z <= box.max.z + 0.09) return box;
    }
    return null;
  }

  function throwGrenade(kind, origin, direction) {
    const mesh = new THREE.Mesh(sphereGeo, shellMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    items.push({
      kind, mesh,
      vel: direction.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: kind === 'he' ? HE_FUSE : 0.9,
      bounced: false,
    });
  }

  function explode(item, onExplode) {
    const pos = item.mesh.position;
    // A flash sphere and a point light that fade in step().
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.95 }),
    );
    flash.position.copy(pos);
    scene.add(flash);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 18);
    light.position.copy(pos);
    scene.add(light);
    item.blast = { mesh: flash, light, left: 0.35 };
    onExplode(pos, HE_RADIUS);
  }

  function step(dt, now, ctx) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item.blast) {
        item.blast.left -= dt;
        const k = Math.max(0, item.blast.left / 0.35);
        item.blast.mesh.scale.setScalar(1 + (1 - k) * 7);
        item.blast.mesh.material.opacity = k * 0.9;
        item.blast.light.intensity = 60 * k;
        if (item.blast.left <= 0) {
          scene.remove(item.blast.mesh, item.blast.light);
          scene.remove(item.mesh);
          items.splice(i, 1);
        }
        continue;
      }
      item.fuse -= dt;
      item.vel.y -= GRAVITY * dt;
      const p = item.mesh.position;
      const nx = p.x + item.vel.x * dt;
      const ny = p.y + item.vel.y * dt;
      const nz = p.z + item.vel.z * dt;
      _v.set(nx, ny, nz);
      const hit = pointBlocked(_v);
      if (hit) {
        // Bounce off the dominant face and lose energy; a dead stop on the floor.
        if (Math.abs(item.vel.x) >= Math.abs(item.vel.z)) item.vel.x *= -0.35;
        else item.vel.z *= -0.35;
        if (ny < hit.max.y + 0.1 && item.vel.y < 0) { item.vel.y *= -0.35; }
        if (Math.abs(item.vel.y) < 0.6) item.vel.y = 0;
        item.vel.x *= 0.7;
        item.vel.z *= 0.7;
      } else {
        p.set(nx, Math.max(0.09, ny), nz);
      }
      if (item.fuse <= 0) {
        if (item.kind === 'he') {
          explode(item, ctx.onExplode);
        } else if (item.kind === 'smoke') {
          const cloud = new THREE.Group();
          for (let s = 0; s < 5; s += 1) {
            const puff = new THREE.Mesh(
              new THREE.SphereGeometry(SMOKE_RADIUS * 0.55, 10, 8),
              new THREE.MeshBasicMaterial({ color: new THREE.Color('#b9c0c7'), transparent: true, opacity: 0.5, depthWrite: false }),
            );
            puff.position.set((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
            cloud.add(puff);
          }
          cloud.position.copy(p);
          scene.add(cloud);
          smokes.push({ pos: p.clone(), radius: SMOKE_RADIUS, active: true, until: now + SMOKE_SECONDS, cloud });
          scene.remove(item.mesh);
          items.splice(i, 1);
        } else {
          ctx.onFlash(p.clone());
          scene.remove(item.mesh);
          items.splice(i, 1);
        }
      }
    }
    for (const smoke of smokes) {
      if (smoke.active && now > smoke.until) {
        smoke.active = false;
        scene.remove(smoke.cloud);
      }
    }
  }

  return { throwGrenade, step, smokes, items };
}
