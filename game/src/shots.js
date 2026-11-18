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

export function stageShot(name, world) {
  const p = world.player;
  world.hud.hideAllOverlays();
  if (name === 'drive') {
    // A golden-hour drive down a downtown avenue, traffic around.
    // All missions marked done so the start beacon cannot pop a briefing
    // over the driving frame.
    world.missions.setCompleted(99);
    const car = putPlayerInCar(world, 'sports', -40, -200, 0, 0xc21807, 26);
    return { screen: 'play', steps: 170, input: shotInput(true), car };
  }
  if (name === 'chase') {
    // Three stars, cruisers closing in on a downtown avenue.
    // All missions marked done so the start beacon cannot pop a briefing
    // over the chase frame. The player drives a sedan (34 m/s) so the
    // Interceptors (44 m/s) catch up and ram alongside, in frame — a
    // sports car (48 m/s) outruns them and leaves the chase behind the
    // camera. 600 steps gives the cruisers ~10 s to close in.
    world.missions.setCompleted(99);
    const car = putPlayerInCar(world, 'sedan', 40, -160, 0, 0x2f6db3, 30);
    world.police.setWanted(3);
    return { screen: 'play', steps: 600, input: shotInput(true), car };
  }
  if (name === 'mission') {
    // The Bay Heist firefight: Maya on foot at the bank, guards shooting.
    // The player starts inside the goto radius, so the first stage clears
    // on the first step and the kill stage spawns its guards.
    world.missions.setCompleted(4);
    p.respawnAt(PLACES.bank.x + 4, PLACES.bank.z + 4);
    p.setState({ health: 100 });
    world.missions.startMission(4);
    world.hud.hideAllOverlays();
    return { screen: 'play', steps: 300, input: shotInput(false), car: null };
  }
  // Default: the title screen over a slow orbit of the city.
  return { screen: 'title', steps: 90, input: shotInput(false), car: null };
}
