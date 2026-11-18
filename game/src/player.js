// player.js — Maya "Vex" Rios: third-person on-foot controls (walk, sprint,
// jump), car entry and driving, aiming and shooting, health, money and
// weapons. The camera is a chase camera that follows on foot and in a car.
import * as THREE from 'three';
import { PLAYER, WEAPONS } from './config.js';
import { buildPedMesh } from './pedestrians.js';
import { ACTION_ENTER, ACTION_HORN, ACTION_JUMP, ACTION_WEAPON } from './input.js';

export function createPlayer(world, startX, startZ) {
  const mesh = buildPedMesh(0x2a9d8f, 0xc98d5a, 0x264653);
  mesh.position.set(startX, 0, startZ);
  world.scene.add(mesh);

  const state = {
    x: startX, z: startZ, y: 0, vy: 0,
    heading: Math.PI,
    camYaw: Math.PI, camPitch: 0.1,
    health: PLAYER.maxHealth,
    money: PLAYER.startMoney,
    weapon: 'pistol',
    ammo: { pistol: PLAYER.startAmmo, smg: 0 },
    unlocked: new Set(['fists', 'pistol']),
    vehicle: null,
    fireCooldown: 0,
    walkPhase: 0,
    camIdle: 0,
    dead: false,
  };

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of world.vehicles) {
      if (car.destroyed) continue;
      const d = Math.hypot(car.x - state.x, car.z - state.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    // Stealing an occupied car in front of the police draws heat.
    if (car.driver === 'traffic') {
      const ti = world.traffic.list.indexOf(car);
      if (ti >= 0) world.traffic.list.splice(ti, 1);
      const copNear = world.police.cars.some((c) => Math.hypot(c.x - state.x, c.z - state.z) < 60)
        || world.police.footCops.some((c) => Math.hypot(c.x - state.x, c.z - state.z) < 60);
      if (copNear) world.police.addHeat(1, 'carjacking');
      else world.hud.toast('Car stolen — keep it quiet.', 'info');
      world.peds.scare(car.x, car.z, 12);
    }
    if (car.type === 'police') world.police.addHeat(1, 'stole a police car');
    car.driver = 'player';
    state.vehicle = car;
    state.camYaw = car.heading;
    mesh.visible = false;
    world.audio.engine(0.2);
    if (car.type === 'taxi') world.missions.offerTaxiFare();
    world.hud.toast(`Driving: ${car.def.name}`, 'info');
  }

  function exitCar() {
    const car = state.vehicle;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    state.x = car.x + side.x * 2.6;
    state.z = car.z + side.z * 2.6;
    state.y = 0;
    state.vehicle = null;
    mesh.visible = true;
    mesh.position.set(state.x, 0, state.z);
    world.audio.engine(0);
  }

  function shoot() {
    if (state.fireCooldown > 0) return;
    const weapon = WEAPONS[state.weapon];
    if (state.weapon === 'fists') {
      state.fireCooldown = weapon.rate;
      const dir = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
      world.combat.punch({ x: state.x, z: state.z }, dir);
      return;
    }
    if (state.ammo[state.weapon] <= 0) {
      state.fireCooldown = 0.4;
      world.audio.denied();
      world.hud.toast('Out of ammo — visit the safehouse', 'bad');
      return;
    }
    state.ammo[state.weapon] -= 1;
    state.fireCooldown = weapon.rate;
    const dir = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
    world.combat.shoot(
      { x: state.x, z: state.z },
      dir,
      state.weapon,
      state.vehicle,
    );
    world.peds.scare(state.x, state.z, 35);
    // Firing a gun near police draws heat.
    const copNear = world.police.cars.some((c) => Math.hypot(c.x - state.x, c.z - state.z) < 70)
      || world.police.footCops.some((c) => Math.hypot(c.x - state.x, c.z - state.z) < 70);
    if (copNear) world.police.addHeat(1, 'shots fired');
  }

  function cycleWeapon() {
    const order = ['fists', 'pistol', 'smg'].filter((w) => state.unlocked.has(w));
    const i = order.indexOf(state.weapon);
    state.weapon = order[(i + 1) % order.length];
    world.hud.toast(`Weapon: ${WEAPONS[state.weapon].name}`, 'info');
    world.audio.click();
  }

  function updateFoot(dt, input, actions) {
    const move = input.moveVector();
    const fx = Math.sin(state.camYaw);
    const fz = Math.cos(state.camYaw);
    const rx = -Math.cos(state.camYaw);
    const rz = Math.sin(state.camYaw);
    let wx = fx * move.y + rx * move.x;
    let wz = fz * move.y + rz * move.x;
    const len = Math.hypot(wx, wz);
    const moving = len > 0.01;
    if (moving) {
      wx /= len;
      wz /= len;
      state.heading = Math.atan2(wx, wz);
    }
    const speed = input.sprint() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = state.x + wx * speed * dt * (moving ? 1 : 0);
    const nz = state.z + wz * speed * dt * (moving ? 1 : 0);
    const pos = { x: nx, z: nz };
    world.city.resolveCircle(pos, PLAYER.radius);
    // Cars push the player; a fast car hurts.
    for (const car of world.vehicles) {
      if (car.destroyed) continue;
      const dx = pos.x - car.x;
      const dz = pos.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 0.001) {
        if (Math.abs(car.speed) > 8) {
          world.combat.damagePlayer(18);
          world.effects.burst({ x: pos.x, y: 1, z: pos.z }, 0xcc3344, 8, 3, 0.5, 3);
          world.audio.crash();
          pos.x = car.x + (dx / d) * 3.2;
          pos.z = car.z + (dz / d) * 3.2;
        } else {
          pos.x = car.x + (dx / d) * 2.4;
          pos.z = car.z + (dz / d) * 2.4;
        }
      }
    }
    state.x = pos.x;
    state.z = pos.z;

    if ((actions & ACTION_JUMP) && state.y <= 0.01) {
      state.vy = PLAYER.jumpSpeed;
    }
    if (state.y > 0 || state.vy !== 0) {
      state.vy -= 24 * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
      }
    }

    if (moving) {
      state.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(state.walkPhase) * 0.6;
      const legs = mesh.userData.legs;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing * 0.6;
      legs[3].rotation.x = swing * 0.6;
    } else {
      const legs = mesh.userData.legs;
      for (const leg of legs) leg.rotation.x *= 0.8;
    }
    mesh.position.set(state.x, state.y, state.z);
    mesh.rotation.y = input.firing ? state.camYaw : state.heading;

    if (actions & ACTION_ENTER) {
      const car = nearestCar(4.2);
      if (car) enterCar(car);
    }
  }

  function updateCar(dt, input, actions) {
    const car = state.vehicle;
    const move = input.moveVector();
    const throttle = move.y;
    const steer = -move.x;
    const brake = input.isDown('Space') ? 1 : 0;
    car.update(dt, { throttle, steer, brake }, world);
    state.x = car.x;
    state.z = car.z;
    state.heading = car.heading;
    world.audio.engine(Math.abs(car.speed) / car.def.topSpeed);
    if (actions & ACTION_HORN) world.audio.horn();
    if (actions & ACTION_ENTER) exitCar();
    // Drive-by shooting is not supported; the player must stop to shoot.
  }

  function updateCamera(dt, input, camera) {
    const mouse = input.takeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      state.camIdle = 0;
      state.camYaw -= mouse.dx * 0.0026;
      state.camPitch = Math.max(-0.35, Math.min(0.55, state.camPitch + mouse.dy * 0.0022));
    } else {
      state.camIdle += dt;
      // While driving, the camera drifts back behind the car.
      if (state.vehicle && state.camIdle > 1.6) {
        let dh = state.vehicle.heading - state.camYaw;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        state.camYaw += dh * Math.min(1, dt * 1.4);
      }
    }
    const inCar = !!state.vehicle;
    const dist = inCar ? 10.5 : 7.2;
    const height = inCar ? 4.4 : 3.1;
    const fx = Math.sin(state.camYaw);
    const fz = Math.cos(state.camYaw);
    const tx = state.x;
    const tz = state.z;
    const ty = (state.vehicle ? state.vehicle.y : state.y) + 1.6;
    const wantX = tx - fx * dist;
    const wantZ = tz - fz * dist;
    const wantY = ty + height - state.camPitch * 6;
    const k = 1 - Math.pow(0.0001, dt);
    camera.position.x += (wantX - camera.position.x) * k;
    camera.position.y += (wantY - camera.position.y) * k;
    camera.position.z += (wantZ - camera.position.z) * k;
    camera.lookAt(tx, ty - state.camPitch * 4, tz);
  }

  const api = {
    mesh,
    get x() { return state.x; },
    get z() { return state.z; },
    get y() { return state.y; },
    get heading() { return state.heading; },
    get health() { return state.health; },
    set health(v) { state.health = Math.max(0, Math.min(PLAYER.maxHealth, v)); },
    get money() { return state.money; },
    set money(v) { state.money = Math.max(0, Math.floor(v)); },
    get weapon() { return state.weapon; },
    get ammo() { return state.ammo[state.weapon] ?? Infinity; },
    get vehicle() { return state.vehicle; },
    get dead() { return state.dead; },
    unlockWeapon(id) {
      state.unlocked.add(id);
      if (WEAPONS[id]) state.ammo[id] = WEAPONS[id].ammo;
      world.hud.toast(`New weapon: ${WEAPONS[id].name}!`, 'good');
    },
    refillAtSafehouse() {
      state.health = PLAYER.maxHealth;
      state.ammo.pistol = WEAPONS.pistol.ammo;
      if (state.unlocked.has('smg')) state.ammo.smg = WEAPONS.smg.ammo;
    },
    ejectFromVehicle() {
      if (!state.vehicle) return;
      const car = state.vehicle;
      state.vehicle = null;
      state.x = car.x + 3;
      state.z = car.z + 3;
      state.y = 0;
      mesh.visible = true;
      mesh.position.set(state.x, 0, state.z);
      world.audio.engine(0);
    },
    // Used by the screenshot stager to put the player in a car directly.
    forceEnterVehicle(car) {
      if (state.vehicle) this.ejectFromVehicle();
      car.driver = 'player';
      state.vehicle = car;
      state.x = car.x;
      state.z = car.z;
      state.heading = car.heading;
      state.camYaw = car.heading;
      mesh.visible = false;
    },
    respawnAt(x, z) {
      if (state.vehicle) {
        state.vehicle.driver = null;
        state.vehicle = null;
      }
      state.x = x;
      state.z = z;
      state.y = 0;
      state.vy = 0;
      state.health = PLAYER.maxHealth;
      state.dead = false;
      mesh.visible = true;
      mesh.position.set(x, 0, z);
      world.audio.engine(0);
    },
    setState(s) {
      state.x = s.x ?? state.x;
      state.z = s.z ?? state.z;
      state.health = s.health ?? state.health;
      state.money = s.money ?? state.money;
      state.weapon = s.weapon ?? state.weapon;
      if (s.ammo) Object.assign(state.ammo, s.ammo);
      if (s.unlocked) state.unlocked = new Set(s.unlocked);
      mesh.position.set(state.x, 0, state.z);
    },
    getState() {
      return {
        x: state.x, z: state.z, health: state.health, money: state.money,
        weapon: state.weapon, ammo: { ...state.ammo }, unlocked: [...state.unlocked],
      };
    },
    update(dt, input, actions, camera) {
      state.fireCooldown = Math.max(0, state.fireCooldown - dt);
      if (state.dead) return;
      if (actions & ACTION_WEAPON) cycleWeapon();
      if (state.vehicle) updateCar(dt, input, actions);
      else updateFoot(dt, input, actions);
      if (input.firing && !state.vehicle) shoot();
      updateCamera(dt, input, camera);
      // The camera needs a target even before the first frame.
      if (!api._camInit) {
        api._camInit = true;
        camera.position.set(state.x - Math.sin(state.camYaw) * 7, 4, state.z - Math.cos(state.camYaw) * 7);
      }
    },
  };
  return api;
}
