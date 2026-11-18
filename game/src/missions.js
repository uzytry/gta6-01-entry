// missions.js — the story: five missions for Sal Marlow and Dante Faro,
// plus side work (taxi fares, hidden sun discs, stunt jumps). Missions run
// as stages — go to, enter a car, drive to, fight, survive, pick up — with
// a 3D beacon marking every objective.
import * as THREE from 'three';
import { MISSIONS, PACKAGE_COUNT, PACKAGE_REWARD, PLACES, TAXI_FARE } from './config.js';
import { Vehicle } from './vehicles.js';
import { buildPedMesh } from './pedestrians.js';

const PACKAGE_SPOTS = [
  [-240, -240], [240, -240], [-240, 200], [200, 240], [0, -280],
  [-280, 40], [280, -40], [120, -200], [-120, 120], [40, 280],
];
const RAMP_SPOTS = [
  { x: -40, z: 160, heading: 0 },
  { x: 160, z: -40, heading: Math.PI / 2 },
  { x: -200, z: -200, heading: Math.PI / 4 },
];

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.25, 8, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 4;
  group.add(diamond);
  group.userData = { diamond, ring };
  return group;
}

export function createMissions(world) {
  let completed = 0;
  let current = null;
  let missionCar = null;
  let beacon = null;
  let startBeacon = null;
  let goonsKilled = 0;
  let cashMarker = null;
  const packages = [];
  const ramps = [];
  const taxi = { active: false, phase: null, pickup: null, dropoff: null, timer: 0, cooldown: 0, beacon: null };

  function setBeacon(x, z, color) {
    clearBeacon();
    beacon = makeBeacon(color ?? 0xffdd33);
    beacon.position.set(x, 0, z);
    world.scene.add(beacon);
  }
  function clearBeacon() {
    if (beacon) {
      world.scene.remove(beacon);
      beacon = null;
    }
  }
  function setStartBeacon() {
    if (startBeacon) world.scene.remove(startBeacon);
    if (completed >= MISSIONS.length) {
      startBeacon = null;
      return;
    }
    const first = MISSIONS[completed].stages[0];
    const place = PLACES[first.target || first.at];
    startBeacon = makeBeacon(0xffcc00);
    startBeacon.position.set(place.x, 0, place.z);
    world.scene.add(startBeacon);
  }

  function spawnGoon(x, z) {
    const mesh = buildPedMesh(0xcc2222, world.rng.pick([0xf2c9a0, 0xc98d5a, 0x8a5a33]), 0x222222);
    mesh.position.set(x, 0, z);
    world.scene.add(mesh);
    const goon = { mesh, x, z, health: 100, shootTimer: world.rng.range(0.5, 1.5), heading: 0, walkPhase: 0 };
    world.goons.push(goon);
    return goon;
  }

  function clearGoons() {
    for (const goon of world.goons) world.scene.remove(goon.mesh);
    world.goons.length = 0;
  }

  function setupStage() {
    const stage = current.def.stages[current.stage];
    world.hud.setObjective(stage.text);
    if (stage.type === 'goto' || stage.type === 'driveTo' || stage.type === 'pickup') {
      const place = PLACES[stage.target];
      setBeacon(place.x, place.z, stage.type === 'driveTo' ? 0x33ff88 : 0xffdd33);
      if (stage.wanted) world.police.setWanted(stage.wanted);
      if (stage.type === 'pickup') {
        cashMarker = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.8, 0.8),
          new THREE.MeshLambertMaterial({ color: 0x2f8f4f, emissive: 0x1a5a2f, emissiveIntensity: 0.5 }),
        );
        cashMarker.position.set(place.x + 4, 0.4, place.z);
        world.scene.add(cashMarker);
      }
    } else if (stage.type === 'enterCar') {
      const place = PLACES[stage.at];
      missionCar = new Vehicle(world.scene, stage.car, place.x + 6, place.z, 0, 0xc21807);
      missionCar.driver = null;
      world.vehicles.push(missionCar);
      setBeacon(place.x + 6, place.z, 0x33ccff);
    } else if (stage.type === 'kill') {
      const place = PLACES[stage.at];
      goonsKilled = 0;
      for (let i = 0; i < stage.count; i += 1) {
        spawnGoon(place.x + world.rng.range(-18, 18), place.z + world.rng.range(-18, 18));
      }
      setBeacon(place.x, place.z, 0xff4444);
    } else if (stage.type === 'survive') {
      current.timer = stage.seconds;
      world.police.setWanted(stage.wanted || 3);
      clearBeacon();
      world.hud.setObjective(`${stage.text} — ${stage.seconds}s`);
    }
  }

  function advanceStage() {
    world.audio.pickup();
    current.stage += 1;
    if (current.stage >= current.def.stages.length) {
      completeMission();
    } else {
      setupStage();
    }
  }

  function completeMission() {
    const def = current.def;
    world.player.money += def.reward;
    if (def.unlock) world.player.unlockWeapon(def.unlock);
    world.audio.missionPass();
    world.audio.cash();
    world.hud.toast(`MISSION PASSED — ${def.title}  +$${def.reward}`, 'good');
    world.hud.showMissionPassed(def);
    completed += 1;
    current = null;
    clearBeacon();
    clearGoons();
    missionCar = null;
    setStartBeacon();
    world.save.autosave();
    if (completed >= MISSIONS.length) {
      world.hud.showEnding();
    }
  }

  function failMission(reason) {
    world.audio.denied();
    world.hud.toast(`MISSION FAILED — ${reason}`, 'bad');
    current = null;
    clearBeacon();
    clearGoons();
    if (missionCar && !missionCar.destroyed) {
      missionCar.remove(world.scene);
      const i = world.vehicles.indexOf(missionCar);
      if (i >= 0) world.vehicles.splice(i, 1);
    }
    missionCar = null;
    setStartBeacon();
  }

  function startMission(index) {
    const def = MISSIONS[index];
    if (startBeacon) {
      world.scene.remove(startBeacon);
      startBeacon = null;
    }
    current = { def, stage: 0, timer: 0 };
    world.audio.missionStart();
    world.hud.showBrief(def);
    setupStage();
  }

  // --- Side activities ------------------------------------------------------
  function initPackages() {
    for (let i = 0; i < PACKAGE_COUNT; i += 1) {
      const [x, z] = PACKAGE_SPOTS[i];
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.15, 20),
        new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.8 }),
      );
      disc.position.set(x, 1.2, z);
      world.scene.add(disc);
      packages.push({ mesh: disc, x, z, taken: false });
    }
  }

  function initRamps() {
    for (const spot of RAMP_SPOTS) {
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.5, 10),
        new THREE.MeshLambertMaterial({ color: 0xe8a020 }),
      );
      ramp.position.set(spot.x, 0.8, spot.z);
      ramp.rotation.x = -0.35;
      ramp.rotation.y = spot.heading;
      ramp.castShadow = true;
      world.scene.add(ramp);
      ramps.push({ ...spot, cooldown: 0, mesh: ramp });
    }
  }

  function offerTaxiFare() {
    if (taxi.active || taxi.cooldown > 0 || current) return;
    const p = world.player;
    const pickup = {
      x: p.x + world.rng.range(-220, 220),
      z: p.z + world.rng.range(-220, 220),
    };
    pickup.x = Math.max(-300, Math.min(300, pickup.x));
    pickup.z = Math.max(-300, Math.min(300, pickup.z));
    const road = world.city.nearestRoad(pickup.x, pickup.z);
    taxi.active = true;
    taxi.phase = 'pickup';
    taxi.pickup = { x: road.x, z: road.z };
    taxi.timer = 120;
    taxi.beacon = makeBeacon(0x33ccff);
    taxi.beacon.position.set(road.x, 0, road.z);
    world.scene.add(taxi.beacon);
    world.hud.toast('Taxi fare! Pick up the passenger.', 'info');
    world.hud.setObjective('Taxi: pick up the passenger');
  }

  function endTaxi(clearObjective) {
    taxi.active = false;
    taxi.phase = null;
    taxi.cooldown = 25;
    if (taxi.beacon) {
      world.scene.remove(taxi.beacon);
      taxi.beacon = null;
    }
    if (clearObjective && !current) world.hud.setObjective('');
  }

  initPackages();
  initRamps();
  setStartBeacon();

  return {
    get completed() {
      return completed;
    },
    get current() {
      return current;
    },
    get packagesTaken() {
      return packages.filter((p) => p.taken).length;
    },
    get taxi() {
      return taxi;
    },
    setCompleted(n) {
      completed = Math.max(0, Math.min(MISSIONS.length, n));
      setStartBeacon();
    },
    startMission,
    offerTaxiFare,
    onGoonKilled(goon) {
      world.scene.remove(goon.mesh);
      const i = world.goons.indexOf(goon);
      if (i >= 0) world.goons.splice(i, 1);
      goonsKilled += 1;
      const stage = current && current.def.stages[current.stage];
      if (stage && stage.type === 'kill') {
        world.hud.setObjective(`${stage.text} — ${goonsKilled}/${stage.count} down`);
      }
    },
    update(dt) {
      const p = world.player;
      // Spin the beacons and package discs.
      for (const b of [beacon, startBeacon, taxi.beacon]) {
        if (!b) continue;
        b.userData.diamond.rotation.y += dt * 2;
        b.userData.diamond.position.y = 4 + Math.sin(world.time * 2) * 0.4;
        b.userData.ring.rotation.z += dt * 0.8;
      }
      for (const pkg of packages) {
        if (!pkg.taken) pkg.mesh.rotation.y += dt * 2;
      }

      // Mission start: walk into the yellow start beacon.
      if (!current && completed < MISSIONS.length && startBeacon) {
        const d = Math.hypot(p.x - startBeacon.position.x, p.z - startBeacon.position.z);
        if (d < 7) {
          world.scene.remove(startBeacon);
          startBeacon = null;
          startMission(completed);
        }
      }

      if (current) {
        const stage = current.def.stages[current.stage];
        if (missionCar && missionCar.destroyed) {
          failMission('the car was destroyed');
          return;
        }
        if (stage.type === 'goto' || stage.type === 'pickup') {
          const place = PLACES[stage.target];
          if (Math.hypot(p.x - place.x, p.z - place.z) < (stage.type === 'pickup' ? 5 : 9)) {
            if (stage.type === 'pickup' && cashMarker) {
              world.scene.remove(cashMarker);
              cashMarker = null;
              world.effects.pickup({ x: p.x, y: 1.5, z: p.z });
            }
            advanceStage();
          }
        } else if (stage.type === 'enterCar') {
          if (p.vehicle === missionCar) advanceStage();
        } else if (stage.type === 'driveTo') {
          const place = PLACES[stage.target];
          if (p.vehicle && Math.hypot(p.x - place.x, p.z - place.z) < 11) advanceStage();
        } else if (stage.type === 'kill') {
          if (goonsKilled >= stage.count) advanceStage();
        } else if (stage.type === 'survive') {
          current.timer -= dt;
          world.hud.setObjective(`${stage.text} — ${Math.max(0, Math.ceil(current.timer))}s`);
          if (current.timer <= 0) advanceStage();
        }
      }

      // Goon AI: approach and shoot the player.
      for (const goon of world.goons) {
        const dx = p.x - goon.x;
        const dz = p.z - goon.z;
        const d = Math.hypot(dx, dz) || 1;
        goon.heading = Math.atan2(dx, dz);
        if (d > 24) {
          goon.x += Math.sin(goon.heading) * 4.5 * dt;
          goon.z += Math.cos(goon.heading) * 4.5 * dt;
        }
        goon.walkPhase += dt * 6;
        const swing = Math.sin(goon.walkPhase) * 0.4;
        const legs = goon.mesh.userData.legs;
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        goon.mesh.position.set(goon.x, 0, goon.z);
        goon.mesh.rotation.y = goon.heading;
        goon.shootTimer -= dt;
        if (d < 42 && goon.shootTimer <= 0) {
          goon.shootTimer = 1.3;
          if (world.rng.chance(0.5)) {
            world.combat.damagePlayer(8);
            world.effects.muzzle({ x: goon.x, y: 1.4, z: goon.z });
          }
          world.audio.shot();
        }
      }

      // Taxi job.
      taxi.cooldown = Math.max(0, taxi.cooldown - dt);
      if (taxi.active) {
        taxi.timer -= dt;
        if (taxi.timer <= 0) {
          world.hud.toast('Taxi fare expired.', 'bad');
          endTaxi(true);
        } else if (taxi.phase === 'pickup') {
          if (Math.hypot(p.x - taxi.pickup.x, p.z - taxi.pickup.z) < 9 && p.vehicle) {
            taxi.phase = 'dropoff';
            const drop = {
              x: Math.max(-300, Math.min(300, taxi.pickup.x + world.rng.range(-260, 260))),
              z: Math.max(-300, Math.min(300, taxi.pickup.z + world.rng.range(-260, 260))),
            };
            const road = world.city.nearestRoad(drop.x, drop.z);
            taxi.dropoff = { x: road.x, z: road.z };
            taxi.timer = 100;
            taxi.distance = Math.hypot(taxi.dropoff.x - taxi.pickup.x, taxi.dropoff.z - taxi.pickup.z);
            world.scene.remove(taxi.beacon);
            taxi.beacon = makeBeacon(0x33ff88);
            taxi.beacon.position.set(road.x, 0, road.z);
            world.scene.add(taxi.beacon);
            world.hud.toast('Passenger aboard — drive to the destination!', 'info');
            world.hud.setObjective('Taxi: drop off the passenger');
          }
        } else if (taxi.phase === 'dropoff') {
          if (Math.hypot(p.x - taxi.dropoff.x, p.z - taxi.dropoff.z) < 9 && p.vehicle) {
            const fare = Math.round(TAXI_FARE.base + TAXI_FARE.perMetre * (taxi.distance || 0) + (taxi.timer > 40 ? TAXI_FARE.bonusOnTime : 0));
            world.player.money += fare;
            world.audio.cash();
            world.hud.toast(`Fare complete! +$${fare}`, 'good');
            endTaxi(true);
          }
        }
      }

      // Hidden sun discs.
      for (const pkg of packages) {
        if (pkg.taken) continue;
        if (Math.hypot(p.x - pkg.x, p.z - pkg.z) < 3.5) {
          pkg.taken = true;
          world.scene.remove(pkg.mesh);
          world.player.money += PACKAGE_REWARD;
          world.effects.pickup({ x: pkg.x, y: 1.5, z: pkg.z });
          world.audio.pickup();
          world.hud.toast(`Sun disc found! +$${PACKAGE_REWARD} (${this.packagesTaken}/${PACKAGE_COUNT})`, 'good');
        }
      }

      // Stunt jumps.
      for (const ramp of ramps) {
        ramp.cooldown = Math.max(0, ramp.cooldown - dt);
        if (ramp.cooldown > 0 || !p.vehicle) continue;
        if (Math.hypot(p.x - ramp.x, p.z - ramp.z) < 5 && Math.abs(p.vehicle.speed) > 22) {
          ramp.cooldown = 10;
          p.vehicle.launch(9);
          world.player.money += 50;
          world.audio.pickup();
          world.hud.toast('STUNT JUMP! +$50', 'good');
          world.effects.burst({ x: p.x, y: 2, z: p.z }, 0xffdd55, 16, 4, 0.8, 5);
        }
      }
    },
    // Exposed for the HUD minimap + save.
    getBeacons() {
      const out = [];
      if (startBeacon) out.push({ x: startBeacon.position.x, z: startBeacon.position.z, color: '#ffcc00', label: 'M' });
      if (beacon) out.push({ x: beacon.position.x, z: beacon.position.z, color: '#ffdd33', label: '!' });
      if (taxi.beacon) out.push({ x: taxi.beacon.position.x, z: taxi.beacon.position.z, color: '#33ccff', label: 'T' });
      return out;
    },
    getTakenPackages() {
      return packages.map((p, i) => (p.taken ? i : -1)).filter((i) => i >= 0);
    },
    setTakenPackages(list) {
      for (const i of list) {
        if (packages[i] && !packages[i].taken) {
          packages[i].taken = true;
          world.scene.remove(packages[i].mesh);
        }
      }
    },
  };
}
