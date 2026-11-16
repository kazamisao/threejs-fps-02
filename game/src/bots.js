// Bots: one fighter factory for both teams. A bot patrols its route, holds its site,
// investigates loud noises, and fights what it can see: line of sight is a ray
// against the world's shootables (smoke blocks it), hearing is a noise queue the
// game feeds. Shooting is hitscan with distance falloff and a spread that grows
// while the bot moves, so a still bot that holds an angle wins the duel. No new
// objects are made in the hot loop: one raycaster, one set of scratch vectors and
// a pooled tracer line per bot are reused every frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_SPEED = 3.4;
const BOT_ACCEL = 26;
const RADIUS = 0.36;
const HEALTH = 100;
const EYE = 1.5;
const FIRE_GAP = 0.34;
const DAMAGE_BODY = 11;
const DAMAGE_HEAD = 26;
const RANGE = 34;

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _probe = new THREE.Box3();
const _wish = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

export function segmentBlockedBySmoke(from, to, smokes) {
  for (const smoke of smokes) {
    if (!smoke.active) continue;
    _dir.subVectors(to, from);
    const lenSq = _dir.lengthSq();
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, _from.subVectors(smoke.pos, from).dot(_dir) / lenSq));
    const cx = from.x + _dir.x * t - smoke.pos.x;
    const cy = from.y + _dir.y * t - smoke.pos.y;
    const cz = from.z + _dir.z * t - smoke.pos.z;
    if (cx * cx + cy * cy + cz * cz < smoke.radius * smoke.radius) return true;
  }
  return false;
}

export function createBot(scene, opts) {
  const isEnemy = opts.team === 'enemy';
  const suit = new THREE.MeshStandardMaterial({
    color: new THREE.Color(isEnemy ? PALETTE.enemy : PALETTE.teal), roughness: 0.7, metalness: 0.05,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });

  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.24), dark);
  legs.position.y = 0.36;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.03;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.52;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), dark);
  visor.position.set(0, 1.53, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.5), dark);
  gun.position.set(0.2, 1.1, -0.3);
  // v2 silhouette: arms reaching to the gun, a chest rig, a backpack and a
  // helmet band. Purely visual — the hitbox parts above keep their exact
  // userData.part values and stay the only meshes a ray can score on.
  const armGeo = new THREE.BoxGeometry(0.11, 0.5, 0.11);
  const armR = new THREE.Mesh(armGeo, suit);
  armR.position.set(0.3, 1.08, -0.12);
  armR.rotation.x = -0.85;
  const armL = new THREE.Mesh(armGeo, suit);
  armL.position.set(-0.3, 1.02, -0.16);
  armL.rotation.x = -1.05;
  const rig = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.06), dark);
  rig.position.set(0, 1.05, -0.17);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.14), dark);
  pack.position.set(0, 1.08, 0.21);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.54;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.09, 0.32), dark);
  belt.position.y = 0.76;
  group.add(legs, torso, head, visor, gun, armR, armL, rig, pack, helmet, belt);
  group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; } });
  scene.add(group);

  // A tracer line per bot, pooled and reused.
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({
    color: new THREE.Color(isEnemy ? PALETTE.enemy : PALETTE.accent), transparent: true, opacity: 0,
  }));
  tracer.frustumCulled = false;
  scene.add(tracer);
  let tracerLeft = 0;

  const bot = {
    id: opts.id,
    team: opts.team,
    name: opts.name,
    group,
    torso,
    head,
    health: HEALTH,
    alive: true,
    position: opts.spawn.clone(),
    velocity: new THREE.Vector3(),
    yaw: opts.yaw ?? 0,
    route: opts.route,
    routeIndex: 0,
    holdAt: opts.holdAt ?? null,
    state: 'patrol',
    target: null,
    investigateAt: null,
    cooldown: 0,
    blindUntil: 0,
    defuseProgress: 0,
    walkPhase: Math.random() * 6,
    respawnAt: 0,
  };
  torso.userData.bot = bot;
  head.userData.bot = bot;
  group.position.copy(bot.position);

  function eyePos(out) {
    return out.set(bot.position.x, bot.position.y + EYE, bot.position.z);
  }

  function overlaps(x, y, z) {
    _probe.min.set(x - RADIUS, y + 0.05, z - RADIUS);
    _probe.max.set(x + RADIUS, y + 1.7, z + RADIUS);
    for (const collider of opts.colliders) if (_probe.intersectsBox(collider)) return true;
    return false;
  }

  function moveToward(target, dt, speed) {
    _wish.set(target.x - bot.position.x, 0, target.z - bot.position.z);
    const dist = _wish.length();
    if (dist < 0.4) return true;
    _wish.multiplyScalar(1 / dist);
    const blend = Math.min(1, (BOT_ACCEL * dt) / speed);
    bot.velocity.x += (_wish.x * speed - bot.velocity.x) * blend;
    bot.velocity.z += (_wish.z * speed - bot.velocity.z) * blend;
    bot.yaw = Math.atan2(-_wish.x, -_wish.z);
    const nx = bot.position.x + bot.velocity.x * dt;
    if (!overlaps(nx, bot.position.y, bot.position.z)) bot.position.x = nx;
    else bot.velocity.x = 0;
    const nz = bot.position.z + bot.velocity.z * dt;
    if (!overlaps(bot.position.x, bot.position.y, nz)) bot.position.z = nz;
    else bot.velocity.z = 0;
    return false;
  }

  function hasLineOfSight(targetPos, shootables, smokes) {
    eyePos(_from);
    _to.copy(targetPos);
    if (segmentBlockedBySmoke(_from, _to, smokes)) return false;
    _dir.subVectors(_to, _from);
    const dist = _dir.length();
    if (dist > RANGE) return false;
    _dir.multiplyScalar(1 / dist);
    _ray.set(_from, _dir);
    _ray.far = dist;
    const hit = _ray.intersectObjects(shootables, false)[0];
    return !hit;
  }

  function hear(noises, now) {
    let best = null;
    let bestScore = 0;
    for (const noise of noises) {
      if (now - noise.time > 2.5) continue;
      const d = Math.hypot(noise.pos.x - bot.position.x, noise.pos.z - bot.position.z);
      if (d > noise.radius) continue;
      const score = noise.radius - d;
      if (score > bestScore) { bestScore = score; best = noise; }
    }
    return best;
  }

  function fireAt(targetPos, now, spread, onHit) {
    if (now < bot.cooldown || now < bot.blindUntil) return;
    bot.cooldown = now + FIRE_GAP + Math.random() * 0.12;
    eyePos(_from);
    _dir.subVectors(targetPos, _from).normalize();
    _dir.x += (Math.random() * 2 - 1) * spread;
    _dir.y += (Math.random() * 2 - 1) * spread;
    _dir.z += (Math.random() * 2 - 1) * spread;
    _dir.normalize();
    const end = _to.copy(_from).addScaledVector(_dir, RANGE);
    tracer.geometry.attributes.position.setXYZ(0, _from.x, _from.y, _from.z);
    tracer.geometry.attributes.position.setXYZ(1, end.x, end.y, end.z);
    tracer.geometry.attributes.position.needsUpdate = true;
    tracer.material.opacity = 0.85;
    tracerLeft = 0.09;
    onHit(_from, _dir);
  }

  function step(dt, now, ctx) {
    if (!bot.alive) return;
    tracerLeft = Math.max(0, tracerLeft - dt);
    tracer.material.opacity = tracerLeft > 0 ? 0.85 * (tracerLeft / 0.09) : 0;
    bot.walkPhase += dt * 9;
    const moving = Math.hypot(bot.velocity.x, bot.velocity.z) > 0.4;
    legs.rotation.x = moving ? Math.sin(bot.walkPhase) * 0.5 : 0;

    // Defusing: an enemy that reaches the planted bomb channels the defuse.
    if (isEnemy && ctx.bomb && ctx.bomb.planted && ctx.bomb.site) {
      const site = ctx.bomb.site.center;
      const d = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
      if (d < 2.2 && bot.state !== 'engage') {
        bot.defuseProgress += dt;
        if (bot.defuseProgress >= 5) ctx.onDefused(bot);
        group.position.copy(bot.position);
        group.rotation.y = bot.yaw;
        return;
      }
      bot.defuseProgress = 0;
    }

    // Pick a target: the nearest living fighter this bot can see.
    let target = null;
    let targetPos = null;
    let targetDist = Infinity;
    for (const fighter of ctx.fighters) {
      if (fighter.team === bot.team || !fighter.alive) continue;
      const pos = fighter.eyePos();
      const d = Math.hypot(pos.x - bot.position.x, pos.z - bot.position.z);
      if (d >= targetDist) continue;
      if (hasLineOfSight(pos, ctx.shootables, ctx.smokes)) {
        target = fighter;
        _targetPos.copy(pos);
        targetPos = _targetPos;
        targetDist = d;
      }
    }

    if (target) {
      bot.state = 'engage';
      bot.target = target;
      // Face the target and strafe to a stop: a still bot shoots straight.
      const dx = targetPos.x - bot.position.x;
      const dz = targetPos.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.velocity.x *= Math.max(0, 1 - 8 * dt);
      bot.velocity.z *= Math.max(0, 1 - 8 * dt);
      const speedFactor = Math.min(1, targetDist / 18);
      const spread = 0.012 + speedFactor * 0.02 + (moving ? 0.02 : 0);
      fireAt(targetPos, now, spread, (from, dir) => {
        ctx.botShoot(bot, from, dir, target);
      });
    } else {
      bot.target = null;
      const noise = hear(ctx.noises, now);
      if (noise && bot.state !== 'engage') {
        bot.state = 'investigate';
        bot.investigateAt = noise.pos;
      }
      if (bot.state === 'investigate' && bot.investigateAt) {
        if (moveToward(bot.investigateAt, dt, BOT_SPEED)) {
          bot.state = 'patrol';
          bot.investigateAt = null;
        }
      } else if (bot.holdAt !== null && bot.state === 'patrol') {
        // Hold the assigned angle: stand, face the lane, wait.
        const hold = ctx.waypoints[bot.holdAt];
        if (Math.hypot(hold.x - bot.position.x, hold.z - bot.position.z) > 0.5) {
          moveToward(hold, dt, BOT_SPEED);
        } else {
          bot.velocity.x *= Math.max(0, 1 - 8 * dt);
          bot.velocity.z *= Math.max(0, 1 - 8 * dt);
          bot.yaw += Math.sin(now * 0.5 + bot.walkPhase) * 0.0004;
        }
      } else {
        const dest = ctx.waypoints[bot.route[bot.routeIndex % bot.route.length]];
        if (moveToward(dest, dt, BOT_SPEED)) {
          bot.routeIndex += 1;
          if (Math.random() < 0.3) bot.routeIndex += 1; // vary the patrol
        }
      }
    }
    group.position.copy(bot.position);
    group.rotation.y = bot.yaw;
  }

  function damage(amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.health = 0;
    group.rotation.x = -1.45;
    group.position.y = -0.2;
    return true;
  }

  function reset(spawn) {
    bot.alive = true;
    bot.health = HEALTH;
    bot.position.copy(spawn);
    bot.velocity.set(0, 0, 0);
    bot.routeIndex = 0;
    bot.state = 'patrol';
    bot.target = null;
    bot.defuseProgress = 0;
    bot.blindUntil = 0;
    bot.cooldown = 0;
    group.rotation.set(0, bot.yaw, 0);
    group.position.copy(bot.position);
  }

  return {
    bot, step, damage, reset, eyePos,
    hitMeshes: [torso, head],
    speed() { return Math.hypot(bot.velocity.x, bot.velocity.z); },
  };
}
