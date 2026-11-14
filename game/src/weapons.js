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

const VIEW_MODELS = {
  pistol: { receiver: [0.07, 0.09, 0.3], barrel: [0.035, 0.035, 0.22], stock: null },
  rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
  smg: { receiver: [0.08, 0.09, 0.34], barrel: [0.04, 0.04, 0.28], stock: [0.06, 0.07, 0.16] },
};

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
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
    const spec = VIEW_MODELS[state.weaponId];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), body);
    model.add(receiver);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), grip);
    barrel.position.set(0, 0.025, -0.3 - spec.barrel[2] / 2);
    model.add(barrel);
    if (spec.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.stock), grip);
      stock.position.set(0, -0.02, 0.26);
      model.add(stock);
    }
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
