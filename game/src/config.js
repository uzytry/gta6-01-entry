// config.js — Solmar Bay: every constant, vehicle, weapon, district and mission
// of "SOLMAR BAY", an original open-world crime game. No Rockstar names, maps,
// characters or assets are used anywhere in this game.

export const GAME_TITLE = 'SOLMAR BAY';
export const GAME_SUBTITLE = 'a sun-soaked open-world crime story';

// --- World layout -----------------------------------------------------------
export const WORLD = {
  HALF: 320, // city half-size in metres; playable area is 640 x 640
  ROAD_SPACING: 80,
  ROAD_WIDTH: 14,
  SIDEWALK: 5,
  SEA_Z: 300, // south edge: beach then water
  GRAVITY: 24,
  DAY_LENGTH: 480, // seconds per full day/night cycle
};

// Road centre lines, both axes (8 avenues + 8 streets).
export const ROADS = [-280, -200, -120, -40, 40, 120, 200, 280];

export const DISTRICTS = [
  { name: 'Downtown', x: 0, z: 0, r: 130 },
  { name: 'Marina Beach', x: 0, z: 280, r: 120 },
  { name: 'Old Town', x: -240, z: -40, r: 110 },
  { name: 'The Hills', x: -40, z: -240, r: 120 },
  { name: 'Portside', x: 240, z: 40, r: 110 },
  { name: 'Northgate', x: 200, z: -200, r: 110 },
  { name: 'Sunset Strip', x: -200, z: 200, r: 110 },
];

// Key places (x, z) on the map.
export const PLACES = {
  safehouse: { x: -40, z: -120, name: 'Safehouse' },
  garage: { x: 40, z: -40, name: "Sal's Garage" },
  autofix: { x: 120, z: 120, name: 'AutoFix Spray Shop' },
  hospital: { x: -120, z: 40, name: 'Solmar General' },
  policeStation: { x: 40, z: 200, name: 'SBPD Central' },
  marinaLot: { x: -120, z: 240, name: 'Marina Car Lot' },
  chopShop: { x: 240, z: -120, name: 'Chop Shop' },
  docks: { x: 280, z: 120, name: 'The Docks' },
  bank: { x: -40, z: 40, name: 'Solmar National Bank' },
  start: { x: -40, z: -120, name: 'Safehouse' },
};

// --- Vehicles ---------------------------------------------------------------
export const VEHICLES = {
  sedan: {
    name: 'Kestrel', label: 'Sedan', topSpeed: 34, accel: 16, brake: 30,
    grip: 3.2, length: 4.4, width: 1.9, seats: 4, colors: [0x2f6db3, 0xb33a2f, 0x3a3a3f, 0xd8d8d8, 0x2f7d5a],
  },
  taxi: {
    name: 'Kestrel Cab', label: 'Taxi', topSpeed: 32, accel: 15, brake: 30,
    grip: 3.2, length: 4.4, width: 1.9, seats: 4, colors: [0xf2c200],
  },
  sports: {
    name: 'Vortex GT', label: 'Sports', topSpeed: 48, accel: 26, brake: 36,
    grip: 4.4, length: 4.2, width: 1.9, seats: 2, colors: [0xc21807, 0x111111, 0xf5f5f5, 0x1a5fb4],
  },
  truck: {
    name: 'Mammoth', label: 'Truck', topSpeed: 26, accel: 11, brake: 24,
    grip: 2.4, length: 5.6, width: 2.2, seats: 2, colors: [0x8a8f98, 0x5a3d2b, 0x2b4a5a],
  },
  van: {
    name: 'Caravan', label: 'Van', topSpeed: 28, accel: 12, brake: 26,
    grip: 2.6, length: 5.0, width: 2.0, seats: 6, colors: [0xe8e8e8, 0x3a6ea5, 0x7a7a7a],
  },
  police: {
    name: 'Interceptor', label: 'Police', topSpeed: 44, accel: 24, brake: 38,
    grip: 4.2, length: 4.5, width: 1.9, seats: 4, colors: [0x14181f],
  },
};
export const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sports'];

// --- Weapons ----------------------------------------------------------------
export const WEAPONS = {
  fists: { name: 'Fists', damage: 15, range: 2.4, rate: 0.45, auto: false, ammo: Infinity },
  pistol: { name: 'P9 Pistol', damage: 34, range: 60, rate: 0.28, auto: false, ammo: 120 },
  smg: { name: 'VK-9 SMG', damage: 22, range: 50, rate: 0.09, auto: true, ammo: 240 },
};

// --- Player -----------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 6, runSpeed: 10, jumpSpeed: 8.5, radius: 0.6, height: 1.8,
  maxHealth: 100, startMoney: 150, startAmmo: 48,
};

// --- Wanted -----------------------------------------------------------------
export const WANTED = {
  max: 5,
  // cops (cars + foot) active at each star level
  copsAtLevel: [0, 1, 2, 3, 4, 6],
  // seconds out of police sight needed to drop one star
  cooldownPerStar: 18,
  bustDistance: 7, bustTime: 3,
  sprayCost: 150,
};

// --- Missions ---------------------------------------------------------------
// Stage types: goto | enterCar | driveTo | kill | survive | deliver | pickup
export const MISSIONS = [
  {
    id: 'm1', title: 'First Gear', giver: 'Sal Marlow',
    brief: 'Sal needs a driver he can trust. Meet him at the garage, take the getaway car and park it at the safehouse. No heat, no fuss.',
    reward: 500,
    stages: [
      { type: 'goto', target: 'garage', text: 'Drive or walk to Sal\u2019s Garage' },
      { type: 'enterCar', car: 'sports', at: 'garage', text: 'Get in the Vortex GT' },
      { type: 'driveTo', target: 'safehouse', text: 'Deliver the car to the safehouse' },
    ],
  },
  {
    id: 'm2', title: 'Hot Wheels', giver: 'Sal Marlow',
    brief: 'A collector left a Vortex GT in the Marina lot with the keys in it. Steal it, bring it to the chop shop, and try not to wake the whole SBPD.',
    reward: 800,
    stages: [
      { type: 'enterCar', car: 'sports', at: 'marinaLot', text: 'Steal the Vortex GT from the Marina lot' },
      { type: 'driveTo', target: 'chopShop', text: 'Deliver it to the Chop Shop', wanted: 2 },
    ],
  },
  {
    id: 'm3', title: 'The Pickup', giver: 'Dante Faro',
    brief: 'Dante\u2019s courier is waiting at the docks with a package the Sharks want. Pick her up on foot, then drive her out — the Sharks will try to stop you.',
    reward: 1200, unlock: 'smg',
    stages: [
      { type: 'goto', target: 'docks', text: 'Meet the courier at the Docks' },
      { type: 'kill', count: 3, at: 'docks', text: 'Fight off the Shark ambush (3)' },
      { type: 'driveTo', target: 'safehouse', text: 'Drive the courier to the safehouse' },
    ],
  },
  {
    id: 'm4', title: 'Heat Wave', giver: 'Sal Marlow',
    brief: 'The SBPD is all over the bay tonight. Survive the heat, break line of sight, and get the car resprayed at AutoFix. Lose them.',
    reward: 1000,
    stages: [
      { type: 'survive', seconds: 60, wanted: 3, text: 'Survive the police hunt (60s)' },
      { type: 'driveTo', target: 'autofix', text: 'Reach AutoFix to clear your wanted level' },
    ],
  },
  {
    id: 'm5', title: 'Bay Heist', giver: 'Dante Faro',
    brief: 'One last job: the Solmar National Bank. Take the vault cash, fight past the guards, and vanish into the bay with four stars on your tail.',
    reward: 2500,
    stages: [
      { type: 'goto', target: 'bank', text: 'Reach the Solmar National Bank' },
      { type: 'kill', count: 5, at: 'bank', text: 'Take out the bank guards (5)' },
      { type: 'pickup', target: 'bank', text: 'Grab the vault cash' },
      { type: 'driveTo', target: 'safehouse', text: 'Escape to the safehouse', wanted: 4 },
    ],
  },
];

export const TAXI_FARE = { base: 25, perMetre: 0.4, bonusOnTime: 20 };
export const PACKAGE_COUNT = 10;
export const PACKAGE_REWARD = 100;

// --- Controls ---------------------------------------------------------------
export const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake'],
  ['E', 'Enter / exit car'],
  ['Left click', 'Shoot / punch'],
  ['R', 'Reload / change weapon'],
  ['Q', 'Horn'],
  ['M', 'Map'],
  ['P / Esc', 'Pause'],
  ['N', 'Sound on/off'],
  ['F5', 'Save game'],
];
