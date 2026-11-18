// vehicles.js — car meshes, arcade driving physics, traffic AI and parked
// cars. A Vehicle is physics + mesh; whoever drives it (player, traffic,
// police) hands in { throttle, steer, brake } each step.
import * as THREE from 'three';
import { ROADS, TRAFFIC_TYPES, VEHICLES, WORLD } from './config.js';

const BODY_GEO = new THREE.BoxGeometry(1, 1, 1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
WHEEL_GEO.rotateZ(Math.PI / 2);

export function buildCarMesh(type, color) {
  const def = VEHICLES[type];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xfff2a0, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x881111, emissiveIntensity: 0.6 });

  const bodyH = type === 'truck' ? 1.1 : 0.75;
  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.scale.set(def.width, bodyH, def.length);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  if (type === 'truck') {
    const cab = new THREE.Mesh(BODY_GEO, bodyMat);
    cab.scale.set(def.width * 0.96, 0.85, 1.4);
    cab.position.set(0, 1.5, def.length / 2 - 0.9);
    cab.castShadow = true;
    group.add(cab);
    const bed = new THREE.Mesh(BODY_GEO, darkMat);
    bed.scale.set(def.width * 0.9, 0.7, def.length - 1.8);
    bed.position.set(0, 1.35, -0.7);
    group.add(bed);
  } else if (type === 'van') {
    const cabin = new THREE.Mesh(BODY_GEO, bodyMat);
    cabin.scale.set(def.width * 0.94, 0.85, def.length * 0.72);
    cabin.position.set(0, 1.35, -0.2);
    cabin.castShadow = true;
    group.add(cabin);
    const shield = new THREE.Mesh(BODY_GEO, glassMat);
    shield.scale.set(def.width * 0.86, 0.6, 0.12);
    shield.position.set(0, 1.35, def.length * 0.2);
    group.add(shield);
  } else {
    const cabin = new THREE.Mesh(BODY_GEO, glassMat);
    cabin.scale.set(def.width * 0.82, 0.6, def.length * 0.46);
    cabin.position.set(0, 1.25, type === 'sports' ? -0.3 : -0.15);
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(BODY_GEO, bodyMat);
    roof.scale.set(def.width * 0.84, 0.12, def.length * 0.42);
    roof.position.set(0, 1.58, type === 'sports' ? -0.3 : -0.15);
    group.add(roof);
  }

  // Headlights and taillights.
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(BODY_GEO, lightMat);
    head.scale.set(0.42, 0.22, 0.1);
    head.position.set(side * (def.width / 2 - 0.35), 0.66, def.length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(BODY_GEO, tailMat);
    tail.scale.set(0.42, 0.2, 0.1);
    tail.position.set(side * (def.width / 2 - 0.35), 0.68, -def.length / 2 - 0.02);
    group.add(tail);
  }

  if (type === 'taxi') {
    const sign = new THREE.Mesh(BODY_GEO, new THREE.MeshLambertMaterial({ color: 0xf2c200, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
    sign.scale.set(0.9, 0.24, 0.3);
    sign.position.set(0, 1.78, -0.1);
    group.add(sign);
  }
  let lightBar = null;
  if (type === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(BODY_GEO, new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.4 }));
    red.scale.set(0.5, 0.22, 0.3);
    red.position.x = -0.32;
    const blue = new THREE.Mesh(BODY_GEO, new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1.4 }));
    blue.scale.set(0.5, 0.22, 0.3);
    blue.position.x = 0.32;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 1.72, -0.1);
    group.add(bar);
    lightBar = bar;
    const stripe = new THREE.Mesh(BODY_GEO, new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    stripe.scale.set(def.width + 0.02, 0.3, def.length * 0.6);
    stripe.position.set(0, 0.66, 0);
    group.add(stripe);
  }

  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(WHEEL_GEO, wheelMat);
    wheel.position.set(wx * (def.width / 2 - 0.05), 0.36, wz * (def.length / 2 - 0.75));
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData = { wheels, bodyMat, lightBar, type };
  return group;
}

export class Vehicle {
  constructor(scene, type, x, z, heading, color) {
    this.type = type;
    this.def = VEHICLES[type];
    this.mesh = buildCarMesh(type, color ?? this.def.colors[0]);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.destroyed = false;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.sirenOn = false;
    this.wheelSpin = 0;
    this.smokeTimer = 0;
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Launch the car into the air (stunt ramps). Vertical physics is simple
  // gravity; the car lands back on the road.
  launch(vy) {
    if (this.y <= 0.01) this.vy = vy;
  }

  // Arcade step: control = { throttle: -1..1, steer: -1..1, brake: 0..1 }.
  update(dt, control, world) {
    if (this.destroyed) return;
    const def = this.def;
    const fwd = control.throttle ?? 0;
    if (fwd > 0) this.speed += def.accel * fwd * dt;
    else if (fwd < 0) {
      if (this.speed > 1) this.speed -= def.brake * dt;
      else this.speed = Math.max(-10, this.speed + def.accel * 0.6 * fwd * dt);
    }
    if (control.brake) this.speed -= def.brake * 1.4 * dt * Math.sign(this.speed);
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.35 * dt;
    if (Math.abs(this.speed) < 0.05 && fwd === 0) this.speed = 0;
    this.speed = Math.max(-12, Math.min(def.topSpeed, this.speed));

    const steerTarget = control.steer ?? 0;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 14);
    this.heading += this.steer * def.grip * 0.55 * speedFactor * dt * Math.sign(this.speed || 1);

    const f = this.forward();
    const nx = this.x + f.x * this.speed * dt;
    const nz = this.z + f.z * this.speed * dt;
    // Vertical motion: ramps launch the car; gravity brings it back down.
    // While airborne the car clears low obstacles.
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    // Building collision: test front and rear axle points (skipped in the air).
    const airborne = this.y > 0.6;
    const front = { x: nx + f.x * (def.length / 2), z: nz + f.z * (def.length / 2) };
    const rear = { x: nx - f.x * (def.length / 2), z: nz - f.z * (def.length / 2) };
    const hitF = !airborne && world.city.resolveCircle(front, 1.1);
    const hitR = !airborne && world.city.resolveCircle(rear, 1.1);
    if (hitF || hitR) {
      if (Math.abs(this.speed) > 4) {
        this.damage += Math.abs(this.speed) * 0.9;
        world.effects.sparks({ x: front.x, y: 0.8, z: front.z });
        if (this.driver === 'player') world.audio.crash();
      }
      this.speed *= 0.35;
      this.x = (front.x + rear.x) / 2;
      this.z = (front.z + rear.z) / 2;
    } else {
      this.x = nx;
      this.z = nz;
    }

    if (this.damage >= 100 && !this.destroyed) {
      this.destroyed = true;
      world.combat.explodeVehicle(this);
    }
    if (this.damage > 55 && !this.destroyed) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        world.effects.smoke({ x: this.x, y: 1.4, z: this.z });
        if (this.damage > 80) world.effects.fire({ x: this.x, y: 1.2, z: this.z });
      }
    }

    // Sync mesh.
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += (this.speed / 0.36) * dt;
    const wheels = this.mesh.userData.wheels;
    for (let i = 0; i < wheels.length; i += 1) {
      wheels[i].rotation.x = this.wheelSpin;
      if (i < 2) wheels[i].rotation.y = this.steer * 0.4;
    }
    if (this.mesh.userData.lightBar && this.sirenOn) {
      this.mesh.userData.lightBar.visible = Math.floor(world.time * 6) % 2 === 0;
    } else if (this.mesh.userData.lightBar) {
      this.mesh.userData.lightBar.visible = true;
    }
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}

// --- Traffic ----------------------------------------------------------------
export function createTrafficManager(world) {
  const cars = [];
  const MAX_TRAFFIC = 14;

  function randomRoadSpot(nearX, nearZ, minD, maxD) {
    for (let tries = 0; tries < 24; tries += 1) {
      const line = world.rng.pick(ROADS);
      const axis = world.rng.chance(0.5) ? 'x' : 'z';
      const along = world.rng.range(-WORLD.HALF + 20, WORLD.HALF - 20);
      const x = axis === 'x' ? along : line;
      const z = axis === 'x' ? line : along;
      const d = Math.hypot(x - nearX, z - nearZ);
      if (d < minD || d > maxD) continue;
      return { x, z, axis, line, dir: world.rng.chance(0.5) ? 1 : -1 };
    }
    return null;
  }

  function spawnTraffic(nearX, nearZ) {
    const spot = randomRoadSpot(nearX, nearZ, 50, 160);
    if (!spot) return;
    const type = world.rng.pick(TRAFFIC_TYPES);
    const color = world.rng.pick(VEHICLES[type].colors);
    const heading = spot.axis === 'x' ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI);
    // Lane offset: right-hand traffic.
    const lane = 3.5;
    const x = spot.axis === 'x' ? spot.x : spot.x + lane * spot.dir;
    const z = spot.axis === 'x' ? spot.z - lane * spot.dir : spot.z;
    const car = new Vehicle(world.scene, type, x, z, heading, color);
    car.driver = 'traffic';
    car.traffic = { axis: spot.axis, line: spot.line, dir: spot.dir, speed: world.rng.range(10, 14) };
    car.speed = car.traffic.speed;
    cars.push(car);
    world.vehicles.push(car);
  }

  function trafficControl(car, dt) {
    const t = car.traffic;
    const f = car.forward();
    // Look ahead for a car or the player.
    let blocked = false;
    for (const other of world.vehicles) {
      if (other === car || other.destroyed) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 12 && side < 2.6) { blocked = true; break; }
    }
    // Pedestrians crossing ahead.
    if (!blocked) {
      for (const ped of world.peds.list) {
        if (ped.fallen) continue;
        const dx = ped.x - car.x;
        const dz = ped.z - car.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 9 && side < 2.2) { blocked = true; break; }
      }
    }
    // At an intersection, sometimes turn onto the crossing road.
    const nearCrossing = ROADS.some((line) => Math.abs((t.axis === 'x' ? car.x : car.z) - line) < 5);
    if (nearCrossing && !car.turnCooldown) {
      if (world.rng.chance(0.3)) {
        const crossLine = t.axis === 'x' ? car.z : car.x;
        const newLine = ROADS.reduce((a, b) => (Math.abs(b - crossLine) < Math.abs(a - crossLine) ? b : a));
        t.axis = t.axis === 'x' ? 'z' : 'x';
        t.line = newLine;
        t.dir = world.rng.chance(0.5) ? 1 : -1;
        car.turnCooldown = 4;
      } else {
        car.turnCooldown = 2;
      }
    }
    car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
    // Steer back onto the lane.
    const lane = 3.5;
    const wantX = t.axis === 'x' ? car.x : t.line + lane * t.dir;
    const wantZ = t.axis === 'x' ? t.line - lane * t.dir : car.z;
    const wantHeading = t.axis === 'x' ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
    let steer = 0;
    const lateral = t.axis === 'x' ? (wantZ - car.z) * t.dir : (wantX - car.x) * -t.dir;
    steer = Math.max(-1, Math.min(1, lateral * 0.25));
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    steer = Math.max(-1, Math.min(1, steer + dh * 1.2));
    const throttle = blocked ? -1 : (car.speed < t.speed ? 0.7 : 0);
    return { throttle, steer, brake: blocked ? 1 : 0 };
  }

  return {
    list: cars,
    update(dt, playerX, playerZ) {
      // Despawn far cars, spawn near the player.
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        const car = cars[i];
        if (car.destroyed || Math.hypot(car.x - playerX, car.z - playerZ) > 200) {
          car.remove(world.scene);
          cars.splice(i, 1);
          const wi = world.vehicles.indexOf(car);
          if (wi >= 0) world.vehicles.splice(wi, 1);
        }
      }
      while (cars.length < MAX_TRAFFIC) spawnTraffic(playerX, playerZ);
      for (const car of cars) {
        car.update(dt, trafficControl(car, dt), world);
      }
    },
    spawnParked(scene) {
      // Parked cars at the city's parking spots (stealable).
      const spots = world.city.parkedSpots;
      const out = [];
      for (const spot of spots) {
        if (world.rng.chance(0.35)) continue;
        const type = world.rng.pick(TRAFFIC_TYPES);
        const car = new Vehicle(scene, type, spot.x, spot.z, spot.heading, world.rng.pick(VEHICLES[type].colors));
        car.driver = null;
        world.vehicles.push(car);
        out.push(car);
      }
      return out;
    },
  };
}

// Circle-circle collision between all vehicles, run once per step.
export function resolveVehicleCollisions(world) {
  const list = world.vehicles;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.destroyed) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (b.destroyed) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = 2.6;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 3) {
        a.damage += rel * 0.5;
        b.damage += rel * 0.5;
        world.effects.sparks({ x: (a.x + b.x) / 2, y: 0.8, z: (a.z + b.z) / 2 });
        if (a.driver === 'player' || b.driver === 'player') world.audio.crash();
      }
      const tmp = a.speed;
      a.speed = b.speed * 0.6;
      b.speed = tmp * 0.6;
    }
  }
}
