// main.js — boot and the one loop for SOLMAR BAY. Wires the city, player,
// traffic, pedestrians, police, missions, combat, effects, HUD, audio and
// save together, then advances them in fixed 1/60 s steps. Screens: title,
// play, paused, wasted, busted. ?shot=start|drive|chase|mission stages a
// screenshot scene instead of the menu and sets window.__shotReady.
import * as THREE from 'three';
import { GAME_TITLE, PLACES, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MAP, ACTION_MUTE, ACTION_PAUSE, ACTION_SAVE, createInput } from './input.js';
import { buildCity } from './city.js';
import { createEffects } from './effects.js';
import { createTrafficManager, resolveVehicleCollisions } from './vehicles.js';
import { createPedManager } from './pedestrians.js';
import { createCombat } from './combat.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createPlayer } from './player.js';
import { createHUD } from './hud.js';
import { createSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

// Surface any boot or runtime error where a headless check can see it.
window.addEventListener('error', (event) => {
  document.title = `ERROR: ${event.message}`;
  document.body.dataset.error = String(event.message);
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-40, 6, -140);

// --- Sky dome + sun disc ----------------------------------------------------
// A gradient sky dome (top colour to horizon colour) and a visible sun disc,
// so the city reads as sun-soaked instead of a flat-colour sky. The dome is
// BackSide and ignores fog; the disc rides on the sun direction each frame.
const skyDomeMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x3f7fd0) },
    horizonColor: { value: new THREE.Color(0xc4dcf2) },
  },
  vertexShader: `varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `uniform vec3 topColor;
    uniform vec3 horizonColor;
    varying vec3 vDir;
    void main() {
      float h = normalize(vDir).y;
      float t = pow(max(h, 0.0), 0.55);
      vec3 col = mix(horizonColor, topColor, t);
      if (h < 0.0) col = horizonColor;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(950, 24, 16), skyDomeMat);
scene.add(skyDome);
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(40, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false, transparent: true, opacity: 0.95 }),
);
scene.add(sunDisc);
const sunGlow = new THREE.Mesh(
  new THREE.CircleGeometry(110, 24),
  new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false, transparent: true, opacity: 0.22 }),
);
scene.add(sunGlow);

const rng = createRandom(seed);
const world = {
  scene, camera, renderer, rng,
  vehicles: [], goons: [], time: 0,
};
world.city = buildCity(scene, rng);
world.effects = createEffects(scene);
world.audio = createAudio();
world.input = createInput(canvas);
world.peds = createPedManager(world);
world.traffic = createTrafficManager(world);
world.combat = createCombat(world);
world.police = createPolice(world);
world.missions = createMissions(world);
world.player = createPlayer(world, PLACES.start.x, PLACES.start.z);
world.hud = createHUD(world);
world.save = createSave(world);
world.traffic.spawnParked(scene);

let screen = 'title';
let mapOpen = false;
let titleOrbit = 0;

function announce(message) {
  if (status) status.textContent = message;
}

// --- Day / night ------------------------------------------------------------
const daySky = new THREE.Color(0x87b5e0);
const duskSky = new THREE.Color(0xe8a06a);
const nightSky = new THREE.Color(0x1a2438);
const skyColor = new THREE.Color();
// Dome palettes: [top, horizon] for day, dusk and night.
const dayTop = new THREE.Color(0x3f7fd0);
const dayHorizon = new THREE.Color(0xc4dcf2);
const duskTop = new THREE.Color(0x6a5588);
const duskHorizon = new THREE.Color(0xf2a56b);
const nightTop = new THREE.Color(0x0b1220);
const nightHorizon = new THREE.Color(0x1c2a44);
const skyTop = new THREE.Color();
const skyHorizon = new THREE.Color();
function updateDayNight() {
  const frac = (world.time % WORLD.DAY_LENGTH) / WORLD.DAY_LENGTH;
  // The clock starts at 09:00, so the sun cycle is offset to match it:
  // 09:00 is a bright morning sun, sunset lands near 18:30, night 21:00-05:00.
  const angle = frac * Math.PI * 2 + 0.58;
  const sunH = Math.sin(angle);
  world.city.sun.position.set(Math.cos(angle) * 260, 60 + sunH * 240, 120);
  world.city.sun.intensity = sunH > -0.1 ? 2.2 : 0.4;
  if (sunH > 0.25) {
    skyColor.copy(daySky);
    skyTop.copy(dayTop);
    skyHorizon.copy(dayHorizon);
  } else if (sunH > -0.15) {
    const t = (0.25 - sunH) / 0.4;
    skyColor.copy(daySky).lerp(duskSky, t);
    skyTop.copy(dayTop).lerp(duskTop, t);
    skyHorizon.copy(dayHorizon).lerp(duskHorizon, t);
  } else {
    const t = Math.min(1, (-0.15 - sunH) / 0.4);
    skyColor.copy(duskSky).lerp(nightSky, t);
    skyTop.copy(duskTop).lerp(nightTop, t);
    skyHorizon.copy(duskHorizon).lerp(nightHorizon, t);
  }
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);
  skyDomeMat.uniforms.topColor.value.copy(skyTop);
  skyDomeMat.uniforms.horizonColor.value.copy(skyHorizon);
  // Sun disc + glow ride on the sun direction, far enough to sit on the dome.
  const sunDir = world.city.sun.position.clone().normalize();
  const discPos = camera.position.clone().addScaledVector(sunDir, 880);
  sunDisc.position.copy(discPos);
  sunDisc.lookAt(camera.position);
  sunGlow.position.copy(discPos);
  sunGlow.lookAt(camera.position);
  const sunVisible = sunH > -0.08;
  sunDisc.visible = sunVisible;
  sunGlow.visible = sunVisible;
}

// --- One fixed step of the living world -------------------------------------
function stepWorld(dt, input, actions) {
  world.time += dt;
  world.player.update(dt, input, actions, camera);
  world.traffic.update(dt, world.player.x, world.player.z);
  world.peds.update(dt, world.player.x, world.player.z);
  world.police.update(dt);
  world.missions.update(dt);
  world.effects.update(dt);
  resolveVehicleCollisions(world);
  updateDayNight();

  // Safehouse: step inside on foot to heal and restock.
  const sh = PLACES.safehouse;
  const p = world.player;
  if (!p.vehicle && Math.hypot(p.x - sh.x, p.z - sh.z) < 12) {
    p.refillAtSafehouse();
  }
  // AutoFix: drive in with heat and cash to lose the cops.
  const af = PLACES.autofix;
  if (p.vehicle && world.police.wanted > 0 && Math.hypot(p.x - af.x, p.z - af.z) < 11) {
    if (p.money >= WANTED.sprayCost) {
      p.money -= WANTED.sprayCost;
      world.police.clearWanted();
      world.audio.cash();
      world.hud.toast(`Resprayed! Wanted cleared (-$${WANTED.sprayCost}).`, 'good');
      if (world.missions.current) {
        const stage = world.missions.current.def.stages[world.missions.current.stage];
        if (stage && stage.type === 'driveTo' && stage.target === 'autofix') {
          // The mission stage completes through its own check next step.
        }
      }
    } else {
      world.hud.toast(`Respray costs $${WANTED.sprayCost} — not enough cash.`, 'bad');
      world.audio.denied();
    }
  }
}

function renderFrame(dt) {
  renderer.render(scene, camera);
  // The HUD gets the real frame time: the damage flash only decays when dt
  // is real (it used to be called with 0, so one hit left the screen
  // red-tinted for the rest of the game).
  world.hud.update(dt || 0);
}

// --- Screens ----------------------------------------------------------------
function startNewGame() {
  world.save.clear();
  world.player.respawnAt(PLACES.start.x, PLACES.start.z);
  world.player.money = 150;
  world.missions.setCompleted(0);
  world.police.clearWanted();
  screen = 'play';
  world.hud.hideAllOverlays();
  world.audio.startMusic();
  world.input.lockPointer();
  world.hud.toast('Welcome to Solmar Bay. Follow the yellow beacon.', 'info');
  announce(`${GAME_TITLE}. Playing.`);
}

function continueGame() {
  const data = world.save.load();
  if (!data) {
    startNewGame();
    return;
  }
  screen = 'play';
  world.hud.hideAllOverlays();
  world.audio.startMusic();
  world.input.lockPointer();
  world.hud.toast('Welcome back to Solmar Bay.', 'info');
}

function pauseGame() {
  if (screen !== 'play') return;
  screen = 'paused';
  world.input.unlockPointer();
  world.hud.showPause({
    missions: world.missions.completed,
    packages: world.missions.packagesTaken,
    money: world.player.money,
  });
}

function resumeGame() {
  if (screen !== 'paused') return;
  screen = 'play';
  world.hud.hidePause();
  world.input.lockPointer();
}

function quitToTitle() {
  screen = 'title';
  world.input.unlockPointer();
  world.hud.showTitle(world.save.hasSave());
  world.audio.stopMusic();
}

function handleWastedConfirm() {
  // Hospital bill: 10% of cash, min $25.
  const bill = Math.max(25, Math.floor(world.player.money * 0.1));
  world.player.money -= bill;
  world.player.respawnAt(PLACES.hospital.x, PLACES.hospital.z);
  world.police.clearWanted();
  screen = 'play';
  world.hud.hideAllOverlays();
  world.hud.toast(`Hospital bill -$${bill}.`, 'bad');
  world.input.lockPointer();
}

world.hud.on('newGame', startNewGame);
world.hud.on('continueGame', continueGame);
world.hud.on('resume', resumeGame);
world.hud.on('save', () => world.save.save());
world.hud.on('quitToTitle', quitToTitle);
world.hud.on('toggleMap', () => {
  mapOpen = world.hud.toggleMap();
  if (!mapOpen && screen === 'paused') world.hud.showPause({
    missions: world.missions.completed,
    packages: world.missions.packagesTaken,
    money: world.player.money,
  });
});

// --- Shot mode --------------------------------------------------------------
function runShot(name) {
  const sceneInfo = stageShot(name, world);
  screen = sceneInfo.screen;
  world.shotMode = true;
  if (screen === 'title') {
    world.hud.showTitle(false);
  } else {
    world.hud.hideAllOverlays();
  }
  let stepped = 0;
  let painted = 0;
  function frame() {
    while (stepped < sceneInfo.steps) {
      stepWorld(STEP, sceneInfo.input, 0);
      // Self-driving extra cars (traffic, a flanking cruiser) hold their
      // target speed on a straight road beside the staged action.
      for (const extra of sceneInfo.extras || []) {
        extra.car.update(STEP, {
          throttle: extra.car.speed < extra.targetSpeed ? 0.8 : 0,
          steer: 0,
          brake: 0,
        }, world);
        // A staged siren's lightbar stays lit for the frame, whatever the
        // blink phase at this exact game time is.
        if (extra.car.mesh.userData.lightBar) extra.car.mesh.userData.lightBar.visible = true;
      }
      stepped += 1;
      if (sceneInfo.onStep) sceneInfo.onStep(stepped, world);
    }
    if (screen === 'title') {
      titleOrbit += 0.002;
      camera.position.set(Math.sin(titleOrbit) * 190, 90, Math.cos(titleOrbit) * 190);
      camera.lookAt(0, 0, 0);
      world.traffic.update(STEP, 0, 0);
      world.peds.update(STEP, 0, 0);
      world.effects.update(STEP);
    }
    // Let the damage flash settle before the frame is taken: a firefight
    // shot should show the fight, not a red wash over it.
    world.hud.update(3);
    renderFrame();
    painted += 1;
    if (painted < 3) requestAnimationFrame(frame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

// --- Main loop --------------------------------------------------------------
function runGame() {
  let accumulator = 0;
  let last = performance.now();
  world.hud.showTitle(world.save.hasSave());
  announce(`${GAME_TITLE}. Press Enter or click New Game to start.`);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = world.input.takeActions();

    if (actions & ACTION_MUTE) {
      const on = world.audio.toggle();
      world.hud.toast(on ? 'Sound on' : 'Sound off', 'info');
    }

    if (screen === 'title') {
      // A living city behind the menu: slow orbit, traffic and pedestrians.
      titleOrbit += dt * 0.02;
      camera.position.set(Math.sin(titleOrbit) * 190, 90, Math.cos(titleOrbit) * 190);
      camera.lookAt(0, 0, 0);
      world.time += dt;
      world.traffic.update(dt, 0, 0);
      world.peds.update(dt, 0, 0);
      world.effects.update(dt);
      updateDayNight();
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) startNewGame();
      renderFrame(dt);
      return;
    }

    if (screen === 'wasted') {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) handleWastedConfirm();
      renderFrame(dt);
      return;
    }
    if (screen === 'busted') {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) {
        screen = 'play';
        world.hud.hideAllOverlays();
        world.input.lockPointer();
      }
      renderFrame(dt);
      return;
    }

    if (actions & ACTION_PAUSE) {
      if (screen === 'play') pauseGame();
      else if (screen === 'paused') resumeGame();
    }
    if (screen === 'paused') {
      renderFrame(dt);
      return;
    }

    // Playing.
    if (actions & ACTION_MAP) {
      mapOpen = world.hud.toggleMap();
    }
    if (actions & ACTION_SAVE) world.save.save();
    if (mapOpen) {
      renderFrame(dt);
      return;
    }
    accumulator += dt;
    let firstStep = true;
    while (accumulator >= STEP) {
      // Actions are consumed once per frame, not per step.
      stepWorld(STEP, world.input, firstStep ? actions : 0);
      firstStep = false;
      accumulator -= STEP;
      if (world.player.health <= 0 && screen === 'play') {
        screen = 'wasted';
        world.audio.engine(0);
        break;
      }
      if (world.pendingScreen) {
        screen = world.pendingScreen;
        world.pendingScreen = null;
        break;
      }
      if (screen !== 'play') break;
    }
    renderFrame(dt);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

canvas.addEventListener('click', () => {
  world.audio.unlock();
  if (screen === 'play') world.input.lockPointer();
});

if (shot) runShot(shot);
else runGame();
