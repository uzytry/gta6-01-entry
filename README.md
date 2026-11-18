# SOLMAR BAY — Make GTA 6 (make.fun gta6-01)

![make.fun](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/uzytry/gta6-01-entry/rank.svg)
![reward](https://make.fun/badge/uzytry/gta6-01-entry/reward.svg)

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). It plays
offline in a desktop browser from static files — no build step, no network
requests, three.js vendored under `game/vendor/`.

You are Maya "Vex" Rios, the best getaway driver on the bay. Five story
missions for Sal Marlow and Dante Faro, a living city, and the SBPD on your
tail.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## What's in the city

- **Open world** — a 640×640 m sun-soaked coastal city: downtown towers, Old Town, the Hills, Portside, Marina Beach, a pier and a port, with a day/night cycle.
- **On foot and by car** — third-person walking, sprinting and jumping; six drivable vehicles (sedan, taxi, sports car, truck, van, police interceptor) with arcade handling, damage, smoke, fire and explosions.
- **Traffic and pedestrians** — cars follow the road grid, stop for jams and turn at intersections; pedestrians stroll the sidewalks and flee from gunfire.
- **Steal cars** — take any parked or traffic car with E. Steal one in front of the police and the heat is on.
- **Wanted system and police** — 0–5 stars; cruisers chase and ram, foot officers shoot at 2+ stars; get busted if they corner you on foot. Break line of sight to cool down, or pay for a respray at AutoFix.
- **Missions and story** — five missions with briefs, beacons, objectives, ambushes and a finale heist; rewards and an SMG unlock.
- **Combat** — fists, pistol and SMG with raycast shooting, muzzle flash and hit effects.
- **HUD with minimap** — health, cash, wanted stars, speedometer, weapon/ammo, mission objective, district and clock, plus a big map (M).
- **Side work** — taxi fares, 10 hidden sun discs ($100 each), stunt jumps ($50).
- **Start and save** — title screen, pause menu, localStorage saves (F5 or pause menu), autosave after every mission.
- **Sound** — fully synthesized WebAudio: engine, sirens, gunshots, crashes, UI chimes and a procedural music loop. No audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look around |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Enter / exit car |
| Left click | Shoot / punch |
| R | Change weapon |
| Q | Horn |
| M | Map |
| P / Esc | Pause |
| N | Sound on/off |
| F5 | Save game |

## Layout

- `game/index.html` + `game/styles.css` — the page and the interface
- `game/src/` — one file per system: `main`, `config`, `city`, `vehicles`, `pedestrians`, `player`, `police`, `combat`, `missions`, `effects`, `hud`, `audio`, `input`, `save`, `shots`, `random`
- `game/vendor/three.module.min.js` — three.js r160, vendored
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — four real renders of the game (title, driving, police chase, mission firefight)

## Originality

Everything in Solmar Bay is original: the city, characters, vehicles, names, story, art and sound. Nothing from Rockstar Games' Grand Theft Auto series or any other commercial game is used.

## License

MIT — see [LICENSE](LICENSE).
