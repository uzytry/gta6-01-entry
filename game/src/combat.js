// combat.js — shooting, punching and explosions. Hits are resolved with
// simple ray math against pedestrians, mission goons, vehicles and building
// AABBs (no THREE.Raycaster, so it stays fast and deterministic).
import { WEAPONS } from './config.js';

function rayHitsBox(ox, oz, dx, dz, box, maxDist) {
  // 2D slab test on the XZ plane; returns distance or Infinity.
  let tmin = 0;
  let tmax = maxDist;
  if (Math.abs(dx) < 1e-8) {
    if (ox < box.minX || ox > box.maxX) return Infinity;
  } else {
    let t1 = (box.minX - ox) / dx;
    let t2 = (box.maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < box.minZ || oz > box.maxZ) return Infinity;
  } else {
    let t1 = (box.minZ - oz) / dz;
    let t2 = (box.maxZ - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function createCombat(world) {
  function nearestHit(origin, dir, range, ignoreCar) {
    let best = { dist: range, kind: null, target: null };
    const testCircle = (x, z, r, kind, target) => {
      const dx = x - origin.x;
      const dz = z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > best.dist) return;
      const px = origin.x + dir.x * along;
      const pz = origin.z + dir.z * along;
      const miss = Math.hypot(x - px, z - pz);
      if (miss < r + 0.4) {
        best = { dist: along, kind, target };
      }
    };
    for (const ped of world.peds.list) {
      if (!ped.fallen) testCircle(ped.x, ped.z, 0.6, 'ped', ped);
    }
    for (const goon of world.goons) {
      if (goon.health > 0) testCircle(goon.x, goon.z, 0.7, 'goon', goon);
    }
    for (const cop of world.police.footCops) {
      if (cop.health > 0) testCircle(cop.x, cop.z, 0.7, 'cop', cop);
    }
    for (const car of world.vehicles) {
      if (car.destroyed || car === ignoreCar) continue;
      testCircle(car.x, car.z, 2.2, 'car', car);
    }
    for (const box of world.city.colliders) {
      const d = rayHitsBox(origin.x, origin.z, dir.x, dir.z, box, best.dist);
      if (d < best.dist) best = { dist: d, kind: 'wall', target: box };
    }
    return best;
  }

  function explodeAt(pos, radius, damage, cause) {
    world.effects.explosion(pos);
    world.audio.explosion();
    world.peds.scare(pos.x, pos.z, 45);
    for (const ped of world.peds.list) {
      if (ped.fallen) continue;
      if (Math.hypot(ped.x - pos.x, ped.z - pos.z) < radius) {
        world.peds.knockDown(ped);
        if (cause === 'player') world.police.addHeat(1, 'pedestrian harmed');
      }
    }
    for (const car of world.vehicles) {
      if (car.destroyed) continue;
      if (Math.hypot(car.x - pos.x, car.z - pos.z) < radius + 2) {
        car.damage += damage;
        if (car.damage >= 100) {
          car.destroyed = true;
          explodeVehicle(car);
        }
      }
    }
    const pd = Math.hypot(world.player.x - pos.x, world.player.z - pos.z);
    if (pd < radius) damagePlayer(damage * (1 - pd / (radius + 1)));
  }

  function explodeVehicle(car) {
    explodeAt({ x: car.x, y: 1, z: car.z }, 9, 60, 'player');
    // Leave a burnt wreck behind.
    car.mesh.userData.bodyMat.color.setHex(0x1a1a1a);
    car.mesh.position.y = -0.15;
    if (world.player.vehicle === car) {
      world.player.ejectFromVehicle();
    }
    window.setTimeout(() => {
      car.remove(world.scene);
      const i = world.vehicles.indexOf(car);
      if (i >= 0) world.vehicles.splice(i, 1);
    }, 20000);
  }

  function damagePlayer(amount) {
    const player = world.player;
    if (player.health <= 0) return;
    player.health = Math.max(0, player.health - amount);
    world.hud.flashDamage();
    if (player.health <= 0) {
      world.hud.showWasted();
    }
  }

  return {
    nearestHit,
    explodeAt,
    explodeVehicle,
    damagePlayer,
    shoot(origin, dir, weaponId, ignoreCar) {
      const weapon = WEAPONS[weaponId];
      const hit = nearestHit(origin, dir, weapon.range, ignoreCar);
      const end = {
        x: origin.x + dir.x * hit.dist,
        y: 1.3,
        z: origin.z + dir.z * hit.dist,
      };
      world.effects.muzzle({ x: origin.x + dir.x * 1.2, y: 1.4, z: origin.z + dir.z * 1.2 });
      world.audio.shot();
      if (hit.kind === 'ped') {
        world.peds.knockDown(hit.target);
        world.effects.burst(end, 0xcc3344, 8, 3, 0.6, 3);
        world.police.addHeat(1, 'pedestrian harmed');
        world.peds.scare(hit.target.x, hit.target.z, 30);
      } else if (hit.kind === 'goon') {
        hit.target.health -= weapon.damage;
        world.effects.burst(end, 0xcc3344, 8, 3, 0.6, 3);
        if (hit.target.health <= 0) world.missions.onGoonKilled(hit.target);
      } else if (hit.kind === 'cop') {
        hit.target.health -= weapon.damage;
        world.effects.burst(end, 0xcc3344, 8, 3, 0.6, 3);
        world.police.addHeat(1, 'officer down');
        if (hit.target.health <= 0) world.police.onCopKilled(hit.target);
      } else if (hit.kind === 'car') {
        hit.target.damage += weapon.damage;
        world.effects.sparks(end);
        if (hit.target.damage >= 100 && !hit.target.destroyed) {
          hit.target.destroyed = true;
          explodeVehicle(hit.target);
        }
      } else if (hit.kind === 'wall') {
        world.effects.sparks(end);
      }
      return hit;
    },
    punch(origin, dir) {
      world.audio.punch();
      let hitAny = false;
      const tryHit = (x, z, r, apply) => {
        const dx = x - origin.x;
        const dz = z - origin.z;
        const d = Math.hypot(dx, dz);
        if (d > WEAPONS.fists.range + r) return false;
        const dot = (dx * dir.x + dz * dir.z) / (d || 1);
        if (dot < 0.5) return false;
        apply();
        return true;
      };
      for (const ped of world.peds.list) {
        if (!ped.fallen && tryHit(ped.x, ped.z, 0.6, () => {
          world.peds.knockDown(ped);
          world.police.addHeat(1, 'assault');
        })) { hitAny = true; break; }
      }
      if (!hitAny) {
        for (const goon of world.goons) {
          if (goon.health > 0 && tryHit(goon.x, goon.z, 0.7, () => {
            goon.health -= WEAPONS.fists.damage;
            if (goon.health <= 0) world.missions.onGoonKilled(goon);
          })) { hitAny = true; break; }
        }
      }
      return hitAny;
    },
  };
}
