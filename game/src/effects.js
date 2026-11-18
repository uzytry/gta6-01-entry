// effects.js — particles, flashes and smoke: one pooled THREE.Points cloud
// plus two reusable flash lights. Used for gunfire, impacts, explosions,
// tire smoke and mission pickups.
import * as THREE from 'three';

const MAX = 700;

export function createEffects(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const parts = [];
  for (let i = 0; i < MAX; i += 1) {
    parts.push({ alive: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, grav: 0 });
    positions[i * 3 + 1] = -999;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const flashA = new THREE.PointLight(0xffaa33, 0, 30, 1.6);
  const flashB = new THREE.PointLight(0xffdd88, 0, 18, 1.6);
  scene.add(flashA);
  scene.add(flashB);
  let flashTime = 0;
  let next = 0;

  function spawn(x, y, z, vx, vy, vz, life, color, grav) {
    const p = parts[next];
    next = (next + 1) % MAX;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.grav = grav;
    const c = new THREE.Color(color);
    colors[(next - 1 + MAX) % MAX * 3] = c.r;
    colors[((next - 1 + MAX) % MAX) * 3 + 1] = c.g;
    colors[((next - 1 + MAX) % MAX) * 3 + 2] = c.b;
  }

  function burst(pos, color, count, speed, life, up) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      spawn(
        pos.x, pos.y + 0.2, pos.z,
        Math.cos(a) * s, (up ?? 3) * Math.random(), Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.8), color, 9,
      );
    }
  }

  return {
    burst,
    sparks(pos) {
      burst(pos, 0xffcc55, 10, 6, 0.5, 4);
    },
    muzzle(pos) {
      burst(pos, 0xffdd66, 4, 3, 0.12, 1);
      flashB.position.copy(pos);
      flashB.intensity = 14;
      flashTime = 0.06;
    },
    smoke(pos) {
      burst(pos, 0x555555, 3, 1.2, 1.4, 2.5);
    },
    fire(pos) {
      burst(pos, 0xff7722, 5, 2, 0.7, 4);
    },
    pickup(pos) {
      burst(pos, 0x66ffaa, 18, 3, 0.9, 5);
      burst(pos, 0xffdd55, 10, 2, 0.9, 5);
    },
    explosion(pos) {
      burst(pos, 0xff6600, 40, 9, 1.1, 7);
      burst(pos, 0xffcc33, 25, 6, 0.8, 6);
      burst(pos, 0x333333, 25, 4, 2.2, 4);
      flashA.position.set(pos.x, pos.y + 2, pos.z);
      flashA.intensity = 90;
      flashTime = 0.35;
    },
    update(dt) {
      for (let i = 0; i < MAX; i += 1) {
        const p = parts[i];
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0 || p.y < -1) {
          p.alive = false;
          positions[i * 3 + 1] = -999;
          continue;
        }
        p.vy -= p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (flashTime > 0) {
        flashTime -= dt;
        if (flashTime <= 0) {
          flashA.intensity = 0;
          flashB.intensity = 0;
        }
      }
    },
  };
}
