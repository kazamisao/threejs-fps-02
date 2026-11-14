// The bomb: one objective beyond killing. The player carries it, plants it by
// holding E inside a site ring, and the other team defuses it by standing on it.
// Plant takes 3 s, defuse takes 5 s, a planted bomb blows after 45 s and wins the
// round for the attackers. A small state machine with one job: the plant/defuse
// timers and the blinking bomb mesh.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const BLOW_SECONDS = 45;

export function createBomb(scene, sites) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30') }),
  );
  light.position.set(0.1, 0.12, 0);
  mesh.add(body, light);
  mesh.visible = false;
  scene.add(mesh);

  const state = {
    carried: true,
    planting: 0,
    planted: false,
    site: null,
    blowAt: 0,
    defuseProgress: 0,
    beepAt: 0,
  };

  function siteAt(pos) {
    for (const site of Object.values(sites)) {
      if (Math.hypot(site.center.x - pos.x, site.center.z - pos.z) <= site.radius) return site;
    }
    return null;
  }

  function step(dt, now, playerPos, holdingPlant, onEvent) {
    if (!state.planted && state.carried) {
      const site = siteAt(playerPos);
      if (site && holdingPlant) {
        state.planting += dt;
        if (state.planting >= PLANT_SECONDS) {
          state.planted = true;
          state.carried = false;
          state.site = site;
          state.blowAt = now + BLOW_SECONDS;
          mesh.visible = true;
          mesh.position.set(site.center.x, 0.12, site.center.z);
          onEvent('planted', site);
        }
      } else {
        state.planting = 0;
      }
    }
    if (state.planted) {
      // Blink faster as the timer runs down.
      const left = state.blowAt - now;
      const period = Math.max(0.25, left / BLOW_SECONDS);
      const on = (now % period) < period / 2;
      light.visible = on;
      if (now >= state.beepAt) {
        state.beepAt = now + period;
        onEvent('beep', state.site);
      }
      if (left <= 0) onEvent('exploded', state.site);
    }
    return state.planting / PLANT_SECONDS;
  }

  function reset() {
    state.carried = true;
    state.planting = 0;
    state.planted = false;
    state.site = null;
    state.blowAt = 0;
    state.defuseProgress = 0;
    mesh.visible = false;
  }

  return { state, step, reset, mesh, PLANT_SECONDS, DEFUSE_SECONDS, BLOW_SECONDS };
}
