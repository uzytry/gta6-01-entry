// shots.js — the four screenshot scenes behind ?shot=start|drive|chase|
// mission (with &seed=N). Each one stages real game state — a car on the
// avenue, a police chase, a mission firefight — then plays the real rules
// forward for a few seconds with a scripted driver, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { PLACES } from './config.js';
import { Vehicle } from './vehicles.js';

// A scripted stand-in for the keyboard during a shot.
function shotInput(drive) {
  return {
    isDown() { return false; },
    moveVector() { return drive ? { x: 0, y: 1 } : { x: 0, y: 0 }; },
    sprint() { return false; },
    takeMouse() { return { dx: 0, dy: 0 }; },
    takeActions() { return 0; },
    queueAction() {},
    firing: false,
    pointerLocked: false,
    lockPointer() {},
    unlockPointer() {},
  };
}

function putPlayerInCar(world, type, x, z, heading, color, speed) {
  const car = new Vehicle(world.scene, type, x, z, heading, color);
  world.vehicles.push(car);
  world.player.forceEnterVehicle(car);
  car.speed = speed;
  return car;
}

// A self-driving extra car for a shot: it drives straight, holding its
// target speed. The shot loop steps it beside the world (see main.js
// runShot), so it stays in frame for the whole staged scene.
function stageExtraCar(world, type, x, z, heading, color, speed, opts = {}) {
  const car = new Vehicle(world.scene, type, x, z, heading, color);
  car.driver = opts.driver || 'traffic';
  car.speed = speed;
  if (opts.siren) car.sirenOn = true;
  world.vehicles.push(car);
  return { car, targetSpeed: speed };
}

export function stageShot(name, world) {
  const p = world.player;
  world.hud.hideAllOverlays();
  if (name === 'drive') {
    // A morning drive down a downtown avenue, traffic around: a sedan to
    // catch up with in the right lane and a taxi coming the other way.
    // All missions marked done so the start beacon cannot pop a briefing
    // over the driving frame.
    world.missions.setCompleted(99);
    const car = putPlayerInCar(world, 'sports', -40, -200, 0, 0xc21807, 26);
    const extras = [
      stageExtraCar(world, 'sedan', -36.5, -100, 0, 0x2f6db3, 14),
      stageExtraCar(world, 'taxi', -43.5, -20, Math.PI, 0xf2c200, 12),
    ];
    return { screen: 'play', steps: 170, input: shotInput(true), car, extras };
  }
  if (name === 'chase') {
    // Three stars: an SBPD roadblock ahead and an Interceptor riding the
    // player's flank, lightbars flashing. The player drives a sedan (34 m/s)
    // so the Interceptors (44 m/s) close in — a sports car (48 m/s) would
    // outrun them and leave the chase behind the camera. 100 steps puts
    // the player a few metres short of the roadblock, headlights and
    // lightbars in frame, before the ram. All missions marked done so the
    // start beacon cannot pop a briefing over the chase frame.
    world.missions.setCompleted(99);
    const car = putPlayerInCar(world, 'sedan', 40, -160, 0, 0x2f6db3, 30);
    world.police.setWanted(3);
    const extras = [
      stageExtraCar(world, 'police', 38.5, -100, Math.PI, 0x14181f, 0, { driver: 'police', siren: true }),
      stageExtraCar(world, 'police', 42, -100, Math.PI, 0x14181f, 0, { driver: 'police', siren: true }),
      stageExtraCar(world, 'police', 46.5, -150, 0, 0x14181f, 34, { driver: 'police', siren: true }),
    ];
    return { screen: 'play', steps: 100, input: shotInput(true), car, extras };
  }
  if (name === 'mission') {
    // The Bay Heist firefight: Maya on foot at the bank, guards shooting.
    // The player starts inside the goto radius, so the first stage clears
    // on the first step and the kill stage spawns its guards. Two steps
    // later the player steps back south of the bank, so every guard is in
    // front of the camera and none walks up behind it.
    world.missions.setCompleted(4);
    p.respawnAt(PLACES.bank.x + 4, PLACES.bank.z + 4);
    p.setState({ health: 100 });
    world.missions.startMission(4);
    world.hud.hideAllOverlays();
    return {
      screen: 'play', steps: 300, input: shotInput(false), car: null,
      onStep(step) {
        if (step === 2) p.respawnAt(PLACES.bank.x, PLACES.bank.z + 30);
      },
    };
  }
  // Default: the title screen over a slow orbit of the city.
  return { screen: 'title', steps: 90, input: shotInput(false), car: null };
}
