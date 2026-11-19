// city.js — builds Solmar Bay: a sun-soaked coastal grid city with roads,
// sidewalks, towers downtown, houses in the hills, a beach, a pier and a
// port. Also owns collision (building AABBs) and the road helpers traffic
// and pedestrians drive and walk on.
import * as THREE from 'three';
import { ROADS, WORLD } from './config.js';

const HALF = WORLD.HALF;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function facadeTexture(base, lit) {
  return canvasTexture(128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let y = 8; y < 120; y += 16) {
      for (let x = 8; x < 120; x += 16) {
        const on = Math.random() < lit;
        g.fillStyle = on ? '#ffd98a' : '#1d2733';
        g.fillRect(x, y, 10, 10);
      }
    }
  });
}

function roadTexture() {
  const texture = canvasTexture(128, (g) => {
    g.fillStyle = '#565b64';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#606570';
    for (let i = 0; i < 300; i += 1) {
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.fillStyle = '#e8d44d';
    g.fillRect(62, 0, 4, 128);
    g.fillStyle = '#e8e8e8';
    g.fillRect(8, 0, 3, 128);
    g.fillRect(117, 0, 3, 128);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function sidewalkTexture() {
  return canvasTexture(128, (g) => {
    g.fillStyle = '#9aa0a6';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#7d838a';
    g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
  });
}

export function buildCity(scene, rng) {
  const colliders = [];
  const parkedSpots = [];
  const roadLines = ROADS;

  // --- Sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0xbfd9ef, 260, 1000);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0, 0, 0);
  scene.add(sunTarget);
  sun.target = sunTarget;
  // A soft fill from the opposite side so shadowed faces (the road in a
  // tower's shadow at morning) stay readable instead of near-black.
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(-200, 180, -120);
  scene.add(fill);

  // --- Ground, beach, water -------------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x6f8f5a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 200, HALF * 2 + 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 200, 44),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, WORLD.SEA_Z + 2);
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 400, 260),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, WORLD.SEA_Z + 150);
  scene.add(water);

  // Pier at x = 0 reaching into the water.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.2, 70),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  pier.position.set(0, 0.4, WORLD.SEA_Z + 55);
  pier.castShadow = true;
  scene.add(pier);

  // --- Roads and sidewalks --------------------------------------------------
  const roadTex = roadTexture();
  const walkTex = sidewalkTexture();
  walkTex.wrapS = THREE.RepeatWrapping;
  walkTex.wrapT = THREE.RepeatWrapping;
  walkTex.repeat.set(8, 8);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
  const roadLen = HALF * 2;
  for (const line of roadLines) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, WORLD.ROAD_WIDTH), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, line);
    h.receiveShadow = true;
    scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.ROAD_WIDTH, roadLen), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(line, 0.02, 0);
    v.receiveShadow = true;
    scene.add(v);
    // Sidewalk strips along both sides of each road.
    for (const side of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, WORLD.SIDEWALK), walkMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(0, 0.01, line + side * (WORLD.ROAD_WIDTH / 2 + WORLD.SIDEWALK / 2));
      sh.receiveShadow = true;
      scene.add(sh);
      const sv = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.SIDEWALK, roadLen), walkMat);
      sv.rotation.x = -Math.PI / 2;
      sv.position.set(line + side * (WORLD.ROAD_WIDTH / 2 + WORLD.SIDEWALK / 2), 0.01, 0);
      sv.receiveShadow = true;
      scene.add(sv);
    }
  }

  // --- Buildings ------------------------------------------------------------
  const facades = [
    facadeTexture('#c8b8a0', 0.35),
    facadeTexture('#a8b8c8', 0.38),
    facadeTexture('#d8c8b0', 0.3),
    facadeTexture('#b8a8c8', 0.35),
    facadeTexture('#8fa8b8', 0.42),
    facadeTexture('#c8c8c8', 0.3),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a60 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  function addBuilding(x, z, w, d, h, tex) {
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(boxGeo, [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, 0, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    // Rooftop AC unit on taller buildings.
    if (h > 20 && rng.chance(0.6)) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 3), roofMat);
      ac.position.set(x + rng.range(-w / 4, w / 4), h, z + rng.range(-d / 4, d / 4));
      scene.add(ac);
    }
  }

  const gap = WORLD.ROAD_SPACING - WORLD.ROAD_WIDTH - WORLD.SIDEWALK * 2; // 56
  for (let ix = 0; ix < roadLines.length - 1; ix += 1) {
    for (let iz = 0; iz < roadLines.length - 1; iz += 1) {
      const cx = (roadLines[ix] + roadLines[ix + 1]) / 2;
      const cz = (roadLines[iz] + roadLines[iz + 1]) / 2;
      const downtown = Math.abs(cx) <= 90 && Math.abs(cz) <= 90;
      const roll = rng.next();
      if (roll < 0.12) {
        // Park block: trees and a fountain plaza, no buildings.
        continue;
      }
      if (roll < 0.2) {
        // Parking lot: flat asphalt with parked-car spots.
        const lot = new THREE.Mesh(
          new THREE.PlaneGeometry(gap, gap),
          new THREE.MeshLambertMaterial({ color: 0x484c53 }),
        );
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.03, cz);
        lot.receiveShadow = true;
        scene.add(lot);
        for (let s = 0; s < 6; s += 1) {
          parkedSpots.push({
            x: cx - gap / 2 + 8 + (s % 3) * 14,
            z: cz - 10 + Math.floor(s / 3) * 20,
            heading: 0,
          });
        }
        continue;
      }
      const tex = rng.pick(facades);
      if (downtown) {
        const h = rng.range(28, 68);
        addBuilding(cx, cz, gap * 0.7, gap * 0.7, h, tex);
      } else if (rng.chance(0.5)) {
        addBuilding(cx, cz, gap * 0.8, gap * 0.8, rng.range(9, 22), tex);
      } else {
        // Two smaller buildings side by side.
        addBuilding(cx - gap * 0.22, cz, gap * 0.36, gap * 0.7, rng.range(7, 16), tex);
        addBuilding(cx + gap * 0.22, cz, gap * 0.36, gap * 0.7, rng.range(7, 16), rng.pick(facades));
      }
      // A few parked cars along the block edge.
      if (rng.chance(0.5)) {
        parkedSpots.push({ x: cx - gap / 2 - 2, z: cz + rng.range(-12, 12), heading: Math.PI / 2 });
      }
    }
  }

  // --- Trees and streetlights (instanced) -----------------------------------
  const treeSpots = [];
  for (let i = 0; i < 220; i += 1) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = rng.range(-HALF + 10, WORLD.SEA_Z - 20);
    if (isOnRoad(x, z)) continue;
    if (collidesPoint(x, z)) continue;
    treeSpots.push([x, z]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const leafGeo = new THREE.IcosahedronGeometry(2.1, 0);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeSpots.length);
  const dummy = new THREE.Object3D();
  treeSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 1.2, z);
    dummy.rotation.set(0, rng.next() * Math.PI, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 3.6, z);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  leaves.castShadow = true;
  scene.add(trunks);
  scene.add(leaves);

  const lampSpots = [];
  for (const line of roadLines) {
    for (let p = -280; p <= 280; p += 80) {
      lampSpots.push([line + 9, p]);
      lampSpots.push([p, line - 9]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.6 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.5, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 7.1, z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  // --- Collision + road helpers ---------------------------------------------
  function collidesPoint(x, z) {
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
    }
    return false;
  }

  function isOnRoad(x, z) {
    const half = WORLD.ROAD_WIDTH / 2;
    for (const line of roadLines) {
      if (Math.abs(z - line) <= half && Math.abs(x) <= HALF) return true;
      if (Math.abs(x - line) <= half && Math.abs(z) <= HALF) return true;
    }
    return false;
  }

  // Push a circle (x, z, radius) out of every building AABB and the world edge.
  // Mutates pos ({x, z}) in place; returns true when a push happened.
  function resolveCircle(pos, radius) {
    let pushed = false;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pushes = [
          { d: pos.x - c.minX + radius, x: c.minX - radius, z: pos.z },
          { d: c.maxX - pos.x + radius, x: c.maxX + radius, z: pos.z },
          { d: pos.z - c.minZ + radius, x: pos.x, z: c.minZ - radius },
          { d: c.maxZ - pos.z + radius, x: pos.x, z: c.maxZ + radius },
        ];
        pushes.sort((a, b) => a.d - b.d);
        pos.x = pushes[0].x;
        pos.z = pushes[0].z;
      }
      pushed = true;
    }
    const edge = HALF - 4;
    if (pos.x < -edge) { pos.x = -edge; pushed = true; }
    if (pos.x > edge) { pos.x = edge; pushed = true; }
    if (pos.z < -edge) { pos.z = -edge; pushed = true; }
    if (pos.z > WORLD.SEA_Z + 18) { pos.z = WORLD.SEA_Z + 18; pushed = true; }
    return pushed;
  }

  // Nearest point on the road network + the road it belongs to.
  function nearestRoad(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const line of roadLines) {
      const dH = Math.abs(z - line);
      if (dH < bestD) { bestD = dH; best = { axis: 'x', line, x, z: line }; }
      const dV = Math.abs(x - line);
      if (dV < bestD) { bestD = dV; best = { axis: 'z', line, x: line, z }; }
    }
    return best;
  }

  return {
    colliders, parkedSpots, roadLines, sun,
    collidesPoint, isOnRoad, resolveCircle, nearestRoad,
  };
}
