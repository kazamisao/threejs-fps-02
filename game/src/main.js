// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Kestrel Yard: the player plus two ally bots attack two bomb sites held by
// three enemy bots. Rounds are 100 s, won by elimination, a bomb explosion, or a
// defuse; between rounds the buy menu spends the money the round earned.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, WP } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE_DEFS } from './weapons.js';
import { createBot } from './bots.js';
import { createGrenades } from './grenades.js';
import { createBomb } from './bomb.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createState, ROUND_SECONDS, BUY_SECONDS, WIN_ROUNDS } from './state.js';
import { roundReward, ECONOMY } from './economy.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);
window.addEventListener('error', (event) => {
  const log = document.getElementById('errlog');
  if (log) log.textContent += `${event.message}@${event.lineno}:${event.colno} | `;
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const state = createState();
const audio = createAudio();
const hud = createHud();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const bomb = createBomb(scene, world.sites);
const grenades = createGrenades(scene, world.colliders, world.shootables);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const _ray = new THREE.Raycaster();
_ray.far = 90;
const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const body = player.state;
let now = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let overAt = 0;
let lastNoiseCleanup = 0;

const ALLY_NAMES = ['Rook', 'Wren'];
const ENEMY_NAMES = ['Havoc', 'Mira', 'Sable'];
const ENEMY_ROUTES = [
  [WP.siteA, WP.midW, WP.northW, WP.siteA2],
  [WP.siteB, WP.midE, WP.northE, WP.siteB2],
  [WP.mid, WP.north, WP.midW, WP.midE, WP.south],
];
const ENEMY_HOLDS = [WP.siteA, WP.siteB, null];

function makeBots() {
  const bots = [];
  for (let i = 0; i < 2; i += 1) {
    bots.push(createBot(scene, {
      id: `ally${i}`, team: 'ally', name: ALLY_NAMES[i],
      spawn: world.spawns.allies[i], yaw: Math.PI,
      route: [WP.spawnSouth, WP.south, WP.mid, WP.siteA, WP.mid, WP.siteB],
      colliders: world.colliders,
    }));
  }
  for (let i = 0; i < 3; i += 1) {
    bots.push(createBot(scene, {
      id: `enemy${i}`, team: 'enemy', name: ENEMY_NAMES[i],
      spawn: world.spawns.enemies[i], yaw: 0,
      route: ENEMY_ROUTES[i], holdAt: ENEMY_HOLDS[i],
      colliders: world.colliders,
    }));
  }
  return bots;
}
let bots = makeBots();
const botHitMeshes = bots.flatMap((b) => b.hitMeshes);

// The player as a fighter bots can see and shoot: one hitbox cylinder, updated
// from the player body each frame, plus the eye position they aim at.
const playerHitbox = new THREE.Mesh(
  new THREE.CylinderGeometry(0.36, 0.36, 1.7, 8),
  new THREE.MeshBasicMaterial({ visible: false }),
);
scene.add(playerHitbox);

function playerEye(out) {
  return out.set(body.position.x, body.position.y + body.eye, body.position.z);
}

function fighters() {
  const list = [{
    team: 'player', alive: state.alive,
    eyePos: () => playerEye(_eye),
    hitbox: playerHitbox,
  }];
  for (const b of bots) {
    list.push({
      team: b.bot.team, alive: b.bot.alive,
      eyePos: () => b.eyePos(_tmp.set(0, 0, 0)),
      hitbox: null, botRef: b,
    });
  }
  return list;
}

function addNoise(pos, radius) {
  state.noises.push({ pos: pos.clone(), radius, time: now });
}

function botContext() {
  return {
    waypoints: world.waypoints,
    shootables: world.shootables,
    smokes: grenades.smokes,
    noises: state.noises,
    bomb: bomb.state,
    fighters: fighters(),
    onDefused: (bot) => endRound('enemy', `Bomb defused by ${bot.name}`),
    botShoot: (shooter, from, dir, target) => {
      audio.enemyShot();
      // The bot's ray: hit the player hitbox, an ally bot, or the world.
      _ray.set(from, dir);
      const targets = [playerHitbox];
      for (const b of bots) if (b.bot.team === 'ally' && b.bot.alive) targets.push(...b.hitMeshes);
      const hit = _ray.intersectObjects(targets, false)[0];
      if (!hit) return;
      const dist = hit.distance;
      const falloff = Math.max(0.45, 1 - dist / 60);
      const isHead = hit.object.userData.part === 'head';
      let damage = Math.round((isHead ? 26 : 11) * falloff);
      // The Kevlar Vest (buy menu, $650) soaks bullet damage to the player.
      if (hit.object === playerHitbox && state.owned.armor) damage = Math.round(damage * ECONOMY.armorBodyFactor);
      if (hit.object === playerHitbox) damagePlayer(damage, shooter.name);
      else if (hit.object.userData.bot) damageBot(hit.object.userData.bot, damage, isHead, shooter.name);
    },
  };
}

function damagePlayer(amount, byName) {
  if (!state.alive || state.phase !== 'live') return;
  state.health -= amount;
  hud.setHealth(state.health);
  if (state.health <= 0) {
    state.health = 0;
    state.alive = false;
    state.deaths += 1;
    hud.killfeed(`${byName} ▸ YOU`);
    hud.showOverlay('dead');
    if (document.pointerLockElement) document.exitPointerLock();
    checkElimination();
  }
}

function damageBot(bot, amount, isHead, byName) {
  if (!bot.alive) return;
  const killed = bots.find((b) => b.bot === bot).damage(amount, isHead ? 'head' : 'torso');
  if (!killed) return;
  if (byName === 'YOU' || byName === undefined) {
    state.kills += 1;
    state.money = Math.min(16000, state.money + 300);
    hud.setMoney(state.money);
    hud.killfeed(`YOU ▸ ${bot.name}${isHead ? ' (headshot)' : ''}`);
    audio.kill();
  } else {
    hud.killfeed(`${byName} ▸ ${bot.name}`);
  }
  checkElimination();
}

function aliveCount(team) {
  if (team === 'player') {
    return (state.alive ? 1 : 0) + bots.filter((b) => b.bot.team === 'ally' && b.bot.alive).length;
  }
  return bots.filter((b) => b.bot.team === 'enemy' && b.bot.alive).length;
}

function checkElimination() {
  if (state.phase !== 'live') return;
  if (aliveCount('enemy') === 0) endRound('player', 'Enemy team eliminated');
  else if (aliveCount('player') === 0 && !bomb.state.planted) endRound('enemy', 'Your team was eliminated');
  else if (aliveCount('player') === 0 && bomb.state.planted) {
    // No attacker left alive: the bomb still ticks, so the round is not over.
    hud.showBanner('Your team is down — the bomb still ticks');
  }
}

function endRound(winner, reason) {
  if (state.phase !== 'live') return;
  const won = winner === 'player';
  state.phase = 'over';
  state.winner = winner;
  state.endReason = reason;
  if (won) state.roundsWon += 1; else state.roundsLost += 1;
  const reward = roundReward(won, state.kills, state.plantedThisRound);
  state.money = Math.min(16000, state.money + reward);
  hud.setMoney(state.money);
  hud.setRound(state.round, state.roundsWon, state.roundsLost);
  hud.showBanner(won ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`, 4000);
  if (won) audio.roundWin();
  overAt = now;
  if (document.pointerLockElement) document.exitPointerLock();
}

function startRound() {
  state.round += 1;
  state.phase = 'buy';
  state.roundTime = BUY_SECONDS;
  state.kills = 0;
  state.plantedThisRound = false;
  state.health = 100;
  state.alive = true;
  body.position.copy(world.spawns.player);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  weapon.refill();
  bomb.reset();
  bots.forEach((b, i) => {
    const spawn = b.bot.team === 'ally' ? world.spawns.allies[i] : world.spawns.enemies[i - 2];
    b.reset(spawn);
  });
  hud.setHealth(100);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.setGrenades(state.grenades);
  hud.setBomb('');
  hud.setPlant(0);
  hud.showBuy(true);
  hud.showBanner(`ROUND ${state.round} — BUY PHASE`, 3000);
}

function startMatch() {
  state.round = 1;
  state.roundsWon = 0;
  state.roundsLost = 0;
  state.money = 800;
  state.owned = { pistol: true, rifle: false, smg: false, armor: false };
  hud.setArmor(false);
  state.grenades = { he: 0, smoke: 0, flash: 0 };
  state.matchWinner = null;
  state.phase = 'buy';
  state.roundTime = BUY_SECONDS;
  state.kills = 0;
  state.plantedThisRound = false;
  state.health = 100;
  state.alive = true;
  body.position.copy(world.spawns.player);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  weapon.equip('pistol');
  weapon.refill();
  bomb.reset();
  bots.forEach((b, i) => {
    const spawn = b.bot.team === 'ally' ? world.spawns.allies[i] : world.spawns.enemies[i - 2];
    b.reset(spawn);
  });
  hud.setHealth(100);
  hud.setRound(1, 0, 0);
  hud.setMoney(800);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.setGrenades(state.grenades);
  hud.setBomb('');
  hud.setPlant(0);
  hud.showBuy(true);
  hud.setBuyAffordability(state.money, state.owned);
}

function buy(item) {
  if (state.phase !== 'buy') return;
  if (WEAPONS[item]) {
    const def = WEAPONS[item];
    if (state.owned[item]) {
      weapon.equip(item);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
      return;
    }
    if (state.money < def.price) return;
    state.money -= def.price;
    state.owned[item] = true;
    weapon.equip(item);
    hud.setMoney(state.money);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
  } else if (GRENADE_DEFS[item]) {
    const def = GRENADE_DEFS[item];
    if (state.money < def.price || state.grenades[item] >= 2) return;
    state.money -= def.price;
    state.grenades[item] += 1;
    hud.setMoney(state.money);
    hud.setGrenades(state.grenades);
  } else if (item === 'armor') {
    if (state.owned.armor || state.money < ECONOMY.armorPrice) return;
    state.money -= ECONOMY.armorPrice;
    state.owned.armor = true;
    hud.setMoney(state.money);
    hud.setArmor(true);
  }
  hud.setBuyAffordability(state.money, state.owned);
}

hud.onBuy(buy);
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'match') { startMatch(); hud.hideOverlay(); input.requestLock(); return; }
  if (state.phase === 'over') {
    if (state.roundsWon >= WIN_ROUNDS || state.roundsLost >= WIN_ROUNDS) {
      state.phase = 'match';
      state.matchWinner = state.roundsWon >= WIN_ROUNDS ? 'player' : 'enemy';
      hud.showMatchOverlay(state.matchWinner === 'player', `${state.roundsWon} : ${state.roundsLost}`);
      return;
    }
    startRound();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (state.phase === 'buy' || state.phase === 'live') {
    if (!state.alive) { hud.hideOverlay(); return; }
    hud.hideOverlay();
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (state.phase === 'live' && state.alive) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    audio.empty();
    return false;
  }
  camera.getWorldDirection(_dir);
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, _dir);
  const targets = world.shootables.concat(botHitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const isHead = hit.object.userData.part === 'head';
    const damage = isHead ? def.damageHead : def.damageBody;
    const killed = bots.find((b) => b.bot === bot).damage(damage, isHead ? 'head' : 'torso');
    if (killed) {
      state.kills += 1;
      state.money = Math.min(16000, state.money + 300);
      hud.setMoney(state.money);
      hud.killfeed(`YOU ▸ ${bot.name}${isHead ? ' (headshot)' : ''}`);
      audio.kill();
      checkElimination();
    } else {
      audio.hit();
    }
    hud.hitMarker(killed, shot ? 4000 : 90);
  }
  weapon.pullTrigger();
  audio.shot(def.id);
  addNoise(playerEye(_eye), 26);
  player.recoil(def.recoil, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
  return true;
}

function throwGrenade(kind) {
  if (state.grenades[kind] <= 0 || state.phase !== 'live' || !state.alive) return;
  state.grenades[kind] -= 1;
  hud.setGrenades(state.grenades);
  camera.getWorldDirection(_dir);
  grenades.throwGrenade(kind, playerEye(_eye), _dir);
  addNoise(playerEye(_eye), 12);
}

function onExplode(pos, radius) {
  audio.explosion();
  addNoise(pos, 40);
  const fightersList = fighters();
  for (const fighter of fightersList) {
    if (!fighter.alive) continue;
    const eye = fighter.eyePos();
    const dist = Math.hypot(eye.x - pos.x, eye.z - pos.z);
    if (dist > radius) continue;
    // Walls block the blast: a ray from the blast to the fighter must be clear.
    _dir.subVectors(eye, pos).normalize();
    _ray.set(pos, _dir);
    _ray.far = dist;
    if (_ray.intersectObjects(world.shootables, false)[0]) continue;
    const damage = Math.round(95 * (1 - dist / radius) + 15);
    if (fighter.team === 'player') damagePlayer(damage, 'HE Grenade');
    else if (fighter.botRef) damageBot(fighter.botRef.bot, damage, false, 'YOU');
  }
}

function onFlash(pos) {
  const eye = playerEye(_eye);
  const dist = Math.hypot(eye.x - pos.x, eye.z - pos.z);
  if (dist < 14) {
    _dir.subVectors(eye, pos).normalize();
    _ray.set(pos, _dir);
    _ray.far = dist;
    if (!_ray.intersectObjects(world.shootables, false)[0]) hud.flashScreen();
  }
  for (const b of bots) {
    if (!b.bot.alive) continue;
    const bPos = b.bot.position;
    const d = Math.hypot(bPos.x - pos.x, bPos.z - pos.z);
    if (d > 14) continue;
    _from.set(bPos.x, bPos.y + 1.5, bPos.z);
    _dir.subVectors(_from, pos).normalize();
    _ray.set(pos, _dir);
    _ray.far = d;
    if (_ray.intersectObjects(world.shootables, false)[0]) continue;
    b.bot.blindUntil = now + 2.5;
  }
}

function step(dt) {
  now += dt;
  elapsed += dt;
  if (now - lastNoiseCleanup > 3) {
    lastNoiseCleanup = now;
    state.noises = state.noises.filter((n) => now - n.time <= 2.5);
  }

  if (state.phase === 'buy') {
    state.roundTime -= dt;
    hud.setTimer(state.roundTime, 'buy');
    if (state.roundTime <= 0) {
      state.phase = 'live';
      state.roundTime = ROUND_SECONDS;
      hud.showBuy(false);
      hud.setTimer(ROUND_SECONDS, 'live');
      hud.showBanner('ROUND LIVE — PLANT THE BOMB', 2600);
    }
  } else if (state.phase === 'live') {
    state.roundTime -= dt;
    hud.setTimer(state.roundTime, 'live');
    if (state.roundTime <= 0 && !bomb.state.planted) endRound('enemy', 'Time expired — bomb never planted');
    else if (state.roundTime <= 0 && bomb.state.planted) {
      // Planted: the round timer is the bomb timer now.
      hud.setTimer(Math.max(0, bomb.state.blowAt - now), 'live');
    }
  } else if (state.phase === 'over') {
    if (now - overAt >= 4 && !shot) {
      hud.showRoundOverlay(state.winner === 'player', state.endReason, `${state.roundsWon} : ${state.roundsLost}`);
    }
  }

  // Player movement and actions run in buy and live, never after the round.
  if ((state.phase === 'buy' || state.phase === 'live') && state.alive) {
    player.step(dt, input.state.keys);
    if (input.wasPressed('KeyR')) { weapon.reload(); audio.reload(); }
    if (input.wasPressed('Digit1')) { if (state.owned.pistol) { weapon.equip('pistol'); hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name); } }
    if (input.wasPressed('Digit2')) { if (state.owned.rifle) { weapon.equip('rifle'); hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name); } }
    if (input.wasPressed('Digit3')) { if (state.owned.smg) { weapon.equip('smg'); hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name); } }
    if (input.wasPressed('Digit4')) throwGrenade('he');
    if (input.wasPressed('Digit5')) throwGrenade('smoke');
    if (input.wasPressed('Digit6')) throwGrenade('flash');
    if (input.wasPressed('KeyB') && state.phase === 'buy') hud.showBuy(document.getElementById('buy-menu').hidden);
  }
  weapon.step(dt);

  // Bomb plant channel, only while the round is live and the player holds E.
  if (state.phase === 'live' && state.alive) {
    const holding = input.state.keys.has('KeyE');
    const progress = bomb.step(dt, now, body.position, holding, (event, site) => {
      if (event === 'planted') {
        state.plantedThisRound = true;
        state.money = Math.min(16000, state.money + 300);
        hud.setMoney(state.money);
        hud.setBomb(`BOMB PLANTED — SITE ${site.name}`);
        hud.showBanner(`BOMB PLANTED AT SITE ${site.name}`, 3000);
        audio.plant();
        addNoise(site.center, 30);
      } else if (event === 'exploded') {
        endRound('player', 'Bomb detonated');
      } else if (event === 'beep') {
        audio.beep();
      }
    });
    hud.setPlant(progress);
    if (bomb.state.planted) {
      hud.setTimer(Math.max(0, bomb.state.blowAt - now), 'live');
    }
  }

  grenades.step(dt, now, { onExplode, onFlash });

  // Bots fight in live rounds; during buy they hold their spawns.
  if (state.phase === 'live') {
    const ctx = botContext();
    for (const b of bots) b.step(dt, now, ctx);
  }

  // Player hitbox follows the body for bot rays.
  playerHitbox.position.set(body.position.x, body.position.y + 0.85, body.position.z);
}

function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (input.state.firing && weapon.ready() && state.phase === 'live' && state.alive) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    input.endFrame();
    syncCamera();
    hud.setSpread(6 + weapon.spread(player.groundSpeed()) * 900);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0, 0, 13.5);
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.5, -6));
    hud.showBuy(true);
    hud.setBuyAffordability(state.money, state.owned);
    hud.setTimer(BUY_SECONDS, 'buy');
  } else if (name === 'play' || name === 'plant' || name === 'end') {
    // Skip the buy phase: jump straight into a live round.
    state.phase = 'live';
    state.roundTime = ROUND_SECONDS;
    weapon.equip('rifle');
    state.owned.rifle = true;
    state.grenades = { he: 1, smoke: 1, flash: 1 };
    hud.setGrenades(state.grenades);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
    state.money = 2450;
    hud.setMoney(2450);
    if (name === 'plant') {
      body.position.set(-13.5, 0, 3.5);
      settle(30);
      // Walk the player into site A and plant, deterministically.
      body.position.set(-17, 0, 0);
      for (let i = 0; i < 200; i += 1) {
        bomb.step(FIXED_STEP, now, body.position, true, (event, site) => {
          if (event === 'planted') {
            state.plantedThisRound = true;
            state.money = Math.min(16000, state.money + 300);
            hud.setMoney(state.money);
            hud.setBomb(`BOMB PLANTED — SITE ${site.name}`);
          }
        });
        now += FIXED_STEP;
      }
      settle(20);
      aimAt(new THREE.Vector3(-10, 1.4, -8));
      hud.setTimer(Math.max(0, bomb.state.blowAt - now), 'live');
    } else {
      body.position.set(3, 0, 7.5);
      settle(60);
      // Stage the mid-lane duel (v2 restage): the mid patroller stands in the
      // open lane ~7 m out — big enough to read arms, rig and team colour — and
      // the freeze catches the burst itself: only two steps pass after the
      // shot, so the muzzle flash and the recoil kick are still on screen
      // alongside the hitmarker.
      const midBot = bots[4];
      midBot.bot.position.set(1.5, 0, 0.5);
      settle(2);
      const target = midBot.bot.alive ? midBot : null;
      if (target) {
        // One round only: the hit lands, the marker shows, and the bot stays
        // standing in frame instead of falling out of sight.
        aimAt(new THREE.Vector3(target.bot.position.x, target.bot.position.y + 1.03, target.bot.position.z));
        shoot(0);
        settle(2);
      }
      if (name === 'end') {
        endRound('player', 'Enemy team eliminated');
        settle(30);
        hud.showRoundOverlay(true, 'Enemy team eliminated', '1 : 0');
      }
    }
    hud.setRound(state.round, state.roundsWon, state.roundsLost);
    hud.setHealth(state.health);
    hud.setTimer(state.roundTime, 'live');
    if (bomb.state.planted) hud.setTimer(Math.max(0, bomb.state.blowAt - now), 'live');
  }
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// HUD helpers that need no simulation state at boot.
weapon.equip('pistol');
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
hud.setHealth(100);
hud.setRound(1, 0, 0);
hud.setMoney(800);
hud.setTimer(BUY_SECONDS, 'buy');
hud.setGrenades(state.grenades);
hud.setBomb('');
hud.showBuy(true);
hud.setBuyAffordability(state.money, state.owned);

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
