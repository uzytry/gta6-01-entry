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
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-40, 6, -140);

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
function updateDayNight() {
  const frac = (world.time % WORLD.DAY_LENGTH) / WORLD.DAY_LENGTH;
  const angle = frac * Math.PI * 2;
  const sunH = Math.sin(angle);
  world.city.sun.position.set(Math.cos(angle) * 260, 60 + sunH * 240, 120);
  world.city.sun.intensity = sunH > -0.1 ? 2.2 : 0.4;
  if (sunH > 0.25) skyColor.copy(daySky);
  else if (sunH > -0.15) skyColor.copy(daySky).lerp(duskSky, (0.25 - sunH) / 0.4);
  else skyColor.copy(duskSky).lerp(nightSky, Math.min(1, (-0.15 - sunH) / 0.4));
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);
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

function renderFrame() {
  renderer.render(scene, camera);
  world.hud.update(0);
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
      stepped += 1;
    }
    if (screen === 'title') {
      titleOrbit += 0.002;
      camera.position.set(Math.sin(titleOrbit) * 190, 90, Math.cos(titleOrbit) * 190);
      camera.lookAt(0, 0, 0);
      world.traffic.update(STEP, 0, 0);
      world.peds.update(STEP, 0, 0);
      world.effects.update(STEP);
    }
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
      renderFrame();
      return;
    }

    if (screen === 'wasted') {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) handleWastedConfirm();
      renderFrame();
      return;
    }
    if (screen === 'busted') {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) {
        screen = 'play';
        world.hud.hideAllOverlays();
        world.input.lockPointer();
      }
      renderFrame();
      return;
    }

    if (actions & ACTION_PAUSE) {
      if (screen === 'play') pauseGame();
      else if (screen === 'paused') resumeGame();
    }
    if (screen === 'paused') {
      renderFrame();
      return;
    }

    // Playing.
    if (actions & ACTION_MAP) {
      mapOpen = world.hud.toggleMap();
    }
    if (actions & ACTION_SAVE) world.save.save();
    if (mapOpen) {
      renderFrame();
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
    renderFrame();
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
