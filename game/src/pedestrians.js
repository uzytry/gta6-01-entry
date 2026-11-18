// pedestrians.js — the people of Solmar Bay: low-poly walkers on the
// sidewalks who stroll, chat, flee from gunfire and get knocked down by
// reckless driving. They make the city feel alive and give the wanted
// system something to protect.
import * as THREE from 'three';
import { ROADS, WORLD } from './config.js';

const SHIRTS = [0xd95f4b, 0x4b8fd9, 0x6abf5a, 0xe8c547, 0x9b59b6, 0x3abfc1, 0xe87aa0, 0x8a8f98];
const SKINS = [0xf2c9a0, 0xc98d5a, 0x8a5a33, 0xf7d7b5, 0x6e4423];
const PANTS = [0x2f3a4a, 0x4a3a2f, 0x3a3a3a, 0x2f4a3a, 0x5a5a6a];

export function buildPedMesh(shirt, skin, pants) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2a1d12 }));
  hair.position.y = 1.78;
  hair.scale.set(1, 0.7, 1);
  group.add(hair);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), pantsMat);
    leg.position.set(side * 0.16, 0.4, 0);
    leg.geometry.translate(0, -0.4, 0);
    leg.position.y = 0.8;
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirtMat);
    arm.position.set(side * 0.42, 1.45, 0);
    arm.geometry.translate(0, -0.31, 0);
    arm.position.y = 1.45;
    group.add(arm);
    legs.push(arm);
  }
  group.userData = { legs, phase: Math.random() * Math.PI * 2 };
  return group;
}

export function createPedManager(world) {
  const list = [];
  const MAX_PEDS = 22;

  function sidewalkSpot(nearX, nearZ) {
    for (let tries = 0; tries < 20; tries += 1) {
      const line = world.rng.pick(ROADS);
      const axis = world.rng.chance(0.5) ? 'x' : 'z';
      const along = world.rng.range(-WORLD.HALF + 20, WORLD.HALF - 20);
      const off = (WORLD.ROAD_WIDTH / 2 + WORLD.SIDEWALK / 2) * (world.rng.chance(0.5) ? 1 : -1);
      const x = axis === 'x' ? along : line + off;
      const z = axis === 'x' ? line + off : along;
      const d = Math.hypot(x - nearX, z - nearZ);
      if (d < 25 || d > 150) continue;
      if (world.city.collidesPoint(x, z)) continue;
      return { x, z, axis, line, dir: world.rng.chance(0.5) ? 1 : -1 };
    }
    return null;
  }

  function spawn(nearX, nearZ) {
    const spot = sidewalkSpot(nearX, nearZ);
    if (!spot) return;
    const mesh = buildPedMesh(world.rng.pick(SHIRTS), world.rng.pick(SKINS), world.rng.pick(PANTS));
    mesh.position.set(spot.x, 0, spot.z);
    world.scene.add(mesh);
    list.push({
      mesh, x: spot.x, z: spot.z, axis: spot.axis, line: spot.line, dir: spot.dir,
      heading: spot.axis === 'x' ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI),
      speed: world.rng.range(1.2, 2.0), state: 'walk', fleeTimer: 0, fallTimer: 0,
      health: 100, walkPhase: Math.random() * 6,
    });
  }

  function scare(x, z, radius) {
    for (const ped of list) {
      if (ped.fallen) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeTimer = 5;
        ped.fleeX = ped.x - x;
        ped.fleeZ = ped.z - z;
      }
    }
  }

  return {
    list,
    scare,
    update(dt, playerX, playerZ) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const ped = list[i];
        if (ped.fallen) {
          ped.fallTimer -= dt;
          if (ped.fallTimer <= 0) {
            world.scene.remove(ped.mesh);
            list.splice(i, 1);
          }
          continue;
        }
        if (Math.hypot(ped.x - playerX, ped.z - playerZ) > 190) {
          world.scene.remove(ped.mesh);
          list.splice(i, 1);
          continue;
        }
        let speed = ped.speed;
        if (ped.state === 'flee') {
          speed = 5.2;
          ped.fleeTimer -= dt;
          const len = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
          ped.heading = Math.atan2(ped.fleeX / len, ped.fleeZ / len);
          if (ped.fleeTimer <= 0) ped.state = 'walk';
        } else {
          // Walk along the sidewalk; at a crossing, sometimes turn.
          const along = ped.axis === 'x' ? ped.x : ped.z;
          const nearCrossing = ROADS.some((line) => Math.abs(along - line) < 4);
          if (nearCrossing && !ped.turnCooldown) {
            if (world.rng.chance(0.4)) {
              const crossLine = ped.axis === 'x' ? ped.z : ped.x;
              const newLine = ROADS.reduce((a, b) => (Math.abs(b - crossLine) < Math.abs(a - crossLine) ? b : a));
              ped.axis = ped.axis === 'x' ? 'z' : 'x';
              ped.line = newLine;
              ped.dir = world.rng.chance(0.5) ? 1 : -1;
            }
            ped.turnCooldown = 3;
          }
          ped.turnCooldown = Math.max(0, (ped.turnCooldown || 0) - dt);
          ped.heading = ped.axis === 'x'
            ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
            : (ped.dir > 0 ? 0 : Math.PI);
        }
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        // Keep peds out of buildings and inside the city.
        const pos = { x: ped.x, z: ped.z };
        if (world.city.resolveCircle(pos, 0.5)) {
          ped.x = pos.x;
          ped.z = pos.z;
          ped.dir *= -1;
        }
        ped.walkPhase += dt * speed * 3.2;
        const swing = Math.sin(ped.walkPhase) * 0.5;
        const legs = ped.mesh.userData.legs;
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        legs[2].rotation.x = -swing * 0.7;
        legs[3].rotation.x = swing * 0.7;
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = ped.heading;
      }
      while (list.length < MAX_PEDS) spawn(playerX, playerZ);
    },
    knockDown(ped) {
      if (ped.fallen) return;
      ped.fallen = true;
      ped.fallTimer = 7;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.rotation.z = Math.random() * 0.6 - 0.3;
      ped.mesh.position.y = 0.3;
    },
  };
}
