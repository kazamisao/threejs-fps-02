// The armoury: three hitscan weapons with distinct roles. Each definition owns its
// damage, fire rate, spread and recoil; this module owns the view model, the
// magazine, the reload and the spread that punishes moving. main.js owns the ray
// and the damage; economy.js owns the prices.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Kestrel P9', price: 0, magSize: 12, reserve: 48,
    fireGap: 0.16, reloadTime: 1.4, damageBody: 26, damageHead: 78,
    spreadStill: 0.003, spreadMoving: 0.02, recoil: 0.008, auto: false,
  },
  rifle: {
    id: 'rifle', name: 'Vulture AR', price: 2700, magSize: 30, reserve: 90,
    fireGap: 0.096, reloadTime: 1.9, damageBody: 34, damageHead: 102,
    spreadStill: 0.0022, spreadMoving: 0.028, recoil: 0.011, auto: true,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', price: 1500, magSize: 32, reserve: 128,
    fireGap: 0.07, reloadTime: 1.6, damageBody: 22, damageHead: 66,
    spreadStill: 0.004, spreadMoving: 0.034, recoil: 0.007, auto: true,
  },
};

export const GRENADE_DEFS = {
  he: { id: 'he', name: 'HE Grenade', price: 300 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300 },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200 },
};

// View models are built from named parts, not slabs: receiver, barrel, handguard,
// magazine, stock and a sight at each end, in three contrasting materials (pale
// body metal, dark grip polymer, one amber accent stripe). Local axes: -z is
// where the gun points, the group is scaled 0.65 and parked at (0.26,-0.26,-0.55)
// by createWeapon, and the muzzle flash plane sits at z=-1.0 in camera space, so
// barrels are built to end near local z=-0.62.
function buildViewModel(id, mats) {
  const g = new THREE.Group();
  const part = (w, h, d, x, y, z, mat, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.rotation.z = rz;
    g.add(mesh);
    return mesh;
  };
  const barrel = (r, len, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (id === 'pistol') {
    part(0.075, 0.085, 0.34, 0, 0.01, -0.04, mats.body); // slide
    part(0.07, 0.05, 0.3, 0, -0.045, -0.03, mats.dark); // frame
    barrel(0.021, 0.1, 0, 0.02, -0.25, mats.dark); // muzzle
    part(0.065, 0.17, 0.09, 0, -0.13, 0.1, mats.grip, 0.28); // grip, raked back
    part(0.05, 0.03, 0.12, 0, -0.075, -0.05, mats.dark); // trigger guard hint
    part(0.012, 0.035, 0.012, 0, 0.07, -0.19, mats.dark); // front post
    part(0.05, 0.03, 0.015, 0, 0.065, 0.12, mats.dark); // rear sight
    part(0.078, 0.014, 0.2, 0, 0.058, -0.05, mats.accent); // slide stripe
  } else if (id === 'rifle') {
    part(0.09, 0.11, 0.4, 0, 0, 0.02, mats.body); // receiver
    part(0.075, 0.09, 0.34, 0, 0.005, -0.36, mats.grip); // handguard
    barrel(0.024, 0.22, 0, 0.03, -0.62, mats.dark); // barrel
    part(0.05, 0.05, 0.07, 0, 0.03, -0.72, mats.dark); // muzzle brake
    part(0.055, 0.19, 0.1, 0, -0.14, -0.02, mats.dark, 0.16); // magazine, curved forward
    part(0.07, 0.16, 0.085, 0, -0.12, 0.16, mats.grip, 0.22); // pistol grip
    part(0.075, 0.09, 0.24, 0, 0.01, 0.32, mats.grip); // stock
    part(0.02, 0.05, 0.2, 0, 0.085, 0.0, mats.dark); // carry rail
    part(0.012, 0.04, 0.012, 0, 0.1, -0.5, mats.dark); // front post
    part(0.055, 0.035, 0.015, 0, 0.095, 0.14, mats.dark); // rear sight
    part(0.094, 0.016, 0.3, 0, -0.03, -0.36, mats.accent); // handguard stripe
  } else {
    // smg
    part(0.08, 0.1, 0.36, 0, 0, 0.0, mats.body); // receiver
    part(0.07, 0.08, 0.22, 0, 0.01, -0.28, mats.dark); // barrel shroud
    barrel(0.02, 0.14, 0, 0.025, -0.44, mats.dark); // barrel tip
    part(0.05, 0.22, 0.09, 0, -0.15, -0.06, mats.dark, 0.1); // long magazine
    part(0.04, 0.13, 0.04, 0, -0.11, -0.3, mats.grip); // vertical foregrip
    part(0.065, 0.15, 0.08, 0, -0.11, 0.14, mats.grip, 0.22); // pistol grip
    part(0.03, 0.03, 0.2, 0, 0.03, 0.27, mats.dark); // wire stock, top strut
    part(0.03, 0.03, 0.2, 0, -0.05, 0.27, mats.dark); // wire stock, low strut
    part(0.012, 0.035, 0.012, 0, 0.075, -0.36, mats.dark); // front post
    part(0.05, 0.03, 0.015, 0, 0.07, 0.1, mats.dark); // rear sight
    part(0.084, 0.014, 0.24, 0, 0.045, 0.0, mats.accent); // receiver stripe
  }
  return g;
}

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.25 });
  const mats = { grip, body, dark, accent };
  const model = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group();
  flash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.028), flashMat));
  flash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.11), flashMat));
  flash.position.set(0.26, -0.24, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.22, -0.7);
  camera.add(flashLight);
  model.position.set(0.26, -0.26, -0.55);
  model.scale.set(0.65, 0.65, 0.65);
  camera.add(model);

  let current = null;
  const state = { weaponId: 'pistol', mag: 0, reserve: 0, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  function rebuildViewModel() {
    while (model.children.length) model.remove(model.children[0]);
    model.add(buildViewModel(state.weaponId, mats));
  }

  function equip(id, keepAmmo) {
    const def = WEAPONS[id];
    if (!def) return false;
    if (!keepAmmo || current !== id) {
      state.mag = def.magSize;
      state.reserve = def.reserve;
    }
    state.weaponId = id;
    current = id;
    state.cooldown = 0;
    state.reloadLeft = 0;
    rebuildViewModel();
    return true;
  }

  function step(dt) {
    const def = WEAPONS[state.weaponId];
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.55 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() { return WEAPONS[state.weaponId]; },
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.weaponId].fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.weaponId];
      if (state.reloadLeft > 0 || state.mag === def.magSize || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed) {
      const def = WEAPONS[state.weaponId];
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMoving;
    },
    refill() {
      const def = WEAPONS[state.weaponId];
      state.mag = def.magSize;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
