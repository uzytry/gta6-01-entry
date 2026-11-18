// police.js — the wanted system: stars rise with crime, SBPD cars and foot
// officers chase the player, and the heat only drops when the player breaks
// line of sight or pays for a respray. Busted and wasted are handled here.
import * as THREE from 'three';
import { PLACES, WANTED } from './config.js';
import { Vehicle } from './vehicles.js';
import { buildPedMesh } from './pedestrians.js';

export function createPolice(world) {
  let wanted = 0;
  let cooldown = 0;
  let bustTimer = 0;
  const cars = [];
  const footCops = [];

  function spawnCar() {
    // Spawn on a road near the player, out of immediate sight.
    const p = world.player;
    for (let tries = 0; tries < 20; tries += 1) {
      const road = world.city.nearestRoad(p.x + world.rng.range(-90, 90), p.z + world.rng.range(-90, 90));
      if (!road) continue;
      const d = Math.hypot(road.x - p.x, road.z - p.z);
      if (d < 35 || d > 120) continue;
      const heading = road.axis === 'x' ? (world.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (world.rng.chance(0.5) ? 0 : Math.PI);
      const car = new Vehicle(world.scene, 'police', road.x, road.z, heading, 0x14181f);
      car.driver = 'police';
      car.sirenOn = true;
      cars.push(car);
      world.vehicles.push(car);
      return;
    }
  }

  function spawnFootCop() {
    const p = world.player;
    const angle = world.rng.range(0, Math.PI * 2);
    const d = world.rng.range(25, 45);
    const x = p.x + Math.cos(angle) * d;
    const z = p.z + Math.sin(angle) * d;
    const mesh = buildPedMesh(0x1a2f5a, world.rng.pick([0xf2c9a0, 0xc98d5a, 0x8a5a33]), 0x1a2f5a);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x0f1c33 }));
    cap.position.y = 1.95;
    mesh.add(cap);
    mesh.position.set(x, 0, z);
    world.scene.add(mesh);
    footCops.push({ mesh, x, z, health: 100, shootTimer: 1, heading: 0, walkPhase: 0 });
  }

  function removeCopCar(car) {
    car.remove(world.scene);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    const wi = world.vehicles.indexOf(car);
    if (wi >= 0) world.vehicles.splice(wi, 1);
  }

  function removeFootCop(cop) {
    world.scene.remove(cop.mesh);
    const i = footCops.indexOf(cop);
    if (i >= 0) footCops.splice(i, 1);
  }

  function clearAllCops() {
    while (cars.length) removeCopCar(cars[0]);
    while (footCops.length) removeFootCop(footCops[0]);
  }

  function chaseControl(car) {
    const p = world.player;
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    // Ram the player when close; otherwise full throttle.
    const throttle = dist > 4 ? 1 : 0.6;
    return { throttle, steer: Math.max(-1, Math.min(1, dh * 2.2)), brake: 0 };
  }

  return {
    cars,
    footCops,
    get wanted() {
      return wanted;
    },
    addHeat(stars, reason) {
      if (wanted >= WANTED.max) return;
      wanted = Math.min(WANTED.max, wanted + stars);
      cooldown = 0;
      world.audio.wantedUp();
      world.hud.toast(`Wanted level ${wanted} — ${reason}`, 'wanted');
    },
    setWanted(n) {
      wanted = Math.max(0, Math.min(WANTED.max, n));
      cooldown = 0;
    },
    clearWanted() {
      wanted = 0;
      cooldown = 0;
      clearAllCops();
    },
    onCopKilled(cop) {
      removeFootCop(cop);
    },
    update(dt) {
      const p = world.player;
      const wantCars = wanted === 0 ? 0 : Math.max(1, Math.ceil(WANTED.copsAtLevel[wanted] * 0.6));
      const wantFoot = wanted === 0 ? 0 : WANTED.copsAtLevel[wanted] - wantCars;
      while (cars.length < wantCars) spawnCar();
      while (footCops.length < wantFoot) spawnFootCop();
      while (cars.length > wantCars) removeCopCar(cars[cars.length - 1]);
      while (footCops.length > wantFoot) removeFootCop(footCops[footCops.length - 1]);

      let anyNear = false;
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        const car = cars[i];
        if (car.destroyed) {
          cars.splice(i, 1);
          continue;
        }
        const d = Math.hypot(car.x - p.x, car.z - p.z);
        if (d < 45) anyNear = true;
        if (d > 260) {
          // Teleport a lost cruiser back onto a road near the player.
          removeCopCar(car);
          spawnCar();
          continue;
        }
        car.update(dt, chaseControl(car), world);
      }
      for (const cop of footCops) {
        const dx = p.x - cop.x;
        const dz = p.z - cop.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < 45) anyNear = true;
        cop.heading = Math.atan2(dx, dz);
        const speed = d > 6 ? 7.5 : 0;
        cop.x += Math.sin(cop.heading) * speed * dt;
        cop.z += Math.cos(cop.heading) * speed * dt;
        cop.walkPhase += dt * speed * 3;
        const swing = Math.sin(cop.walkPhase) * 0.5;
        const legs = cop.mesh.userData.legs;
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = cop.heading;
        // Foot cops shoot at 2+ stars when in range.
        cop.shootTimer -= dt;
        if (wanted >= 2 && d < 30 && cop.shootTimer <= 0) {
          cop.shootTimer = 1.1;
          if (world.rng.chance(0.55)) {
            world.combat.damagePlayer(7);
            world.effects.muzzle({ x: cop.x, y: 1.4, z: cop.z });
          }
          world.audio.shot();
        }
      }

      // Siren hum while any cruiser is near.
      world.audio.siren(wanted > 0 && cars.length > 0);

      // Busted: a cop stays close while the player is slow.
      if (wanted > 0) {
        const playerSpeed = p.vehicle ? Math.abs(p.vehicle.speed) : 0;
        const nearestCop = Math.min(
          ...cars.map((c) => Math.hypot(c.x - p.x, c.z - p.z)),
          ...footCops.map((c) => Math.hypot(c.x - p.x, c.z - p.z)),
          Infinity,
        );
        if (nearestCop < WANTED.bustDistance && playerSpeed < 3 && !p.vehicle) {
          bustTimer += dt;
          world.hud.showBustProgress(bustTimer / WANTED.bustTime);
          if (bustTimer >= WANTED.bustTime) {
            bustTimer = 0;
            world.hud.hideBustProgress();
            this.busted();
            return;
          }
        } else {
          bustTimer = 0;
          world.hud.hideBustProgress();
        }
      }

      // Heat cooldown: out of sight long enough drops one star.
      if (wanted > 0) {
        if (!anyNear) {
          cooldown += dt;
          if (cooldown >= WANTED.cooldownPerStar) {
            cooldown = 0;
            wanted -= 1;
            world.hud.toast(wanted === 0 ? 'You lost the cops!' : `Wanted level ${wanted}`, 'good');
          }
        } else {
          cooldown = 0;
        }
      }
    },
    busted() {
      const fine = Math.max(50, Math.floor(world.player.money * 0.2));
      world.player.money = Math.max(0, world.player.money - fine);
      wanted = 0;
      cooldown = 0;
      clearAllCops();
      world.player.respawnAt(PLACES.policeStation.x, PLACES.policeStation.z);
      world.hud.toast(`BUSTED! Fined $${fine}.`, 'bad');
      world.hud.showBusted(fine);
      world.pendingScreen = 'busted';
    },
  };
}
