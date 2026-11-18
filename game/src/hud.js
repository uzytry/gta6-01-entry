// hud.js — every pixel of the 2D interface: the HUD (health, money, wanted
// stars, speedometer, weapon), the minimap, the big map, toasts, mission
// briefs, and the title / pause / wasted / ending screens.
import { CONTROLS, DISTRICTS, PLACES, ROADS, WORLD } from './config.js';

function el(id) {
  return document.getElementById(id);
}

export function createHUD(world) {
  const callbacks = {};
  let objectiveText = '';
  let damageFlash = 0;

  // --- Minimap --------------------------------------------------------------
  const mini = el('minimap');
  const miniCtx = mini.getContext('2d');
  const big = el('bigmap');
  const bigCtx = big ? big.getContext('2d') : null;

  function drawMap(ctx, size, labels) {
    const scale = size / (WORLD.HALF * 2 + 80);
    const toPx = (v) => size / 2 + v * scale;
    ctx.fillStyle = '#16202b';
    ctx.fillRect(0, 0, size, size);
    // Land, beach, water.
    ctx.fillStyle = '#2c4a2e';
    ctx.fillRect(toPx(-WORLD.HALF), toPx(-WORLD.HALF), WORLD.HALF * 2 * scale, (WORLD.HALF + WORLD.SEA_Z) * scale);
    ctx.fillStyle = '#c9b078';
    ctx.fillRect(toPx(-WORLD.HALF), toPx(WORLD.SEA_Z - 20), WORLD.HALF * 2 * scale, 20 * scale);
    ctx.fillStyle = '#1d6f96';
    ctx.fillRect(0, toPx(WORLD.SEA_Z), size, size - toPx(WORLD.SEA_Z));
    // Roads.
    ctx.strokeStyle = '#8a929c';
    ctx.lineWidth = Math.max(1, 7 * scale);
    for (const line of ROADS) {
      ctx.beginPath();
      ctx.moveTo(toPx(-WORLD.HALF), toPx(line));
      ctx.lineTo(toPx(WORLD.HALF), toPx(line));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toPx(line), toPx(-WORLD.HALF));
      ctx.lineTo(toPx(line), toPx(WORLD.HALF));
      ctx.stroke();
    }
    // Places.
    ctx.fillStyle = '#7ddb8a';
    for (const key of Object.keys(PLACES)) {
      const p = PLACES[key];
      ctx.fillRect(toPx(p.x) - 2, toPx(p.z) - 2, 4, 4);
      if (labels) {
        ctx.fillStyle = '#e8f0ff';
        ctx.font = `${Math.max(9, size / 64)}px sans-serif`;
        ctx.fillText(p.name, toPx(p.x) + 5, toPx(p.z) + 3);
        ctx.fillStyle = '#7ddb8a';
      }
    }
    if (labels) {
      ctx.fillStyle = '#cfe0ff';
      ctx.font = `bold ${Math.max(11, size / 48)}px sans-serif`;
      for (const d of DISTRICTS) {
        ctx.fillText(d.name, toPx(d.x) - 24, toPx(d.z));
      }
    }
    // Mission beacons.
    for (const b of world.missions.getBeacons()) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(toPx(b.x), toPx(b.z), labels ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police blips (flashing blue).
    if (Math.floor(world.time * 3) % 2 === 0) ctx.fillStyle = '#3a6cff';
    else ctx.fillStyle = '#8fb0ff';
    for (const car of world.police.cars) {
      ctx.beginPath();
      ctx.arc(toPx(car.x), toPx(car.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const p = world.player;
    ctx.save();
    ctx.translate(toPx(p.x), toPx(p.z));
    ctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function districtAt(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(x - d.x, z - d.z) - d.r;
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best ? best.name : 'Solmar Bay';
  }

  // --- Toasts ---------------------------------------------------------------
  function toast(message, kind) {
    const box = el('toasts');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `toast ${kind || 'info'}`;
    div.textContent = message;
    box.appendChild(div);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    window.setTimeout(() => {
      div.classList.add('fade');
      window.setTimeout(() => div.remove(), 600);
    }, 3600);
  }

  // --- Screens --------------------------------------------------------------
  function show(id) {
    const node = el(id);
    if (node) node.classList.remove('hidden');
  }
  function hide(id) {
    const node = el(id);
    if (node) node.classList.add('hidden');
  }
  function hideAllOverlays() {
    for (const id of ['title-screen', 'pause-menu', 'map-screen', 'help-screen', 'brief-screen', 'passed-screen', 'wasted-screen', 'busted-screen', 'ending-screen']) hide(id);
  }

  // Wire the buttons once.
  const bind = (id, fn) => {
    const node = el(id);
    if (node) node.addEventListener('click', () => { world.audio.unlock(); world.audio.click(); fn(); });
  };
  bind('btn-new', () => callbacks.newGame && callbacks.newGame());
  bind('btn-continue', () => callbacks.continueGame && callbacks.continueGame());
  bind('btn-help', () => { show('help-screen'); });
  bind('btn-help-close', () => hide('help-screen'));
  bind('btn-resume', () => callbacks.resume && callbacks.resume());
  bind('btn-save', () => callbacks.save && callbacks.save());
  bind('btn-map', () => callbacks.toggleMap && callbacks.toggleMap());
  bind('btn-quit', () => callbacks.quitToTitle && callbacks.quitToTitle());
  bind('btn-map-close', () => callbacks.toggleMap && callbacks.toggleMap());
  bind('btn-brief-ok', () => hide('brief-screen'));
  bind('btn-passed-ok', () => hide('passed-screen'));

  // Controls list on the help screen.
  const helpList = el('controls-list');
  if (helpList) {
    helpList.innerHTML = CONTROLS.map(([k, v]) => `<div class="ctl"><span>${k}</span><span>${v}</span></div>`).join('');
  }

  return {
    on(event, fn) {
      callbacks[event] = fn;
    },
    toast,
    setObjective(text) {
      objectiveText = text;
      const node = el('objective');
      if (node) node.textContent = text;
    },
    flashDamage() {
      damageFlash = 1;
    },
    showBustProgress(frac) {
      const bar = el('bust-bar');
      const wrap = el('bust-wrap');
      if (!bar || !wrap) return;
      wrap.classList.remove('hidden');
      bar.style.width = `${Math.round(frac * 100)}%`;
    },
    hideBustProgress() {
      const wrap = el('bust-wrap');
      if (wrap) wrap.classList.add('hidden');
    },
    showTitle(hasSave) {
      hideAllOverlays();
      show('title-screen');
      const cont = el('btn-continue');
      if (cont) cont.style.display = hasSave ? '' : 'none';
    },
    showPause(stats) {
      hideAllOverlays();
      show('pause-menu');
      const s = el('pause-stats');
      if (s) {
        s.innerHTML = `Missions passed: <b>${stats.missions}/5</b> &nbsp; Sun discs: <b>${stats.packages}/10</b> &nbsp; Cash: <b>$${stats.money}</b>`;
      }
    },
    hidePause() {
      hide('pause-menu');
    },
    toggleMap() {
      const map = el('map-screen');
      if (!map) return false;
      const open = map.classList.toggle('hidden');
      if (!open && bigCtx) drawMap(bigCtx, big.width, true);
      return !open;
    },
    showBrief(def) {
      el('brief-title').textContent = def.title;
      el('brief-giver').textContent = `From ${def.giver} — reward $${def.reward}`;
      el('brief-text').textContent = def.brief;
      show('brief-screen');
    },
    showMissionPassed(def) {
      el('passed-title').textContent = `MISSION PASSED: ${def.title}`;
      el('passed-reward').textContent = `+$${def.reward}${def.unlock ? ' — SMG unlocked!' : ''}`;
      show('passed-screen');
      window.setTimeout(() => hide('passed-screen'), 4000);
    },
    showWasted() {
      hideAllOverlays();
      el('wasted-sub').textContent = 'Maya wakes up at Solmar General. The city keeps moving.';
      show('wasted-screen');
    },
    showBusted(fine) {
      hideAllOverlays();
      el('busted-sub').textContent = `Fined $${fine}. The SBPD lets you walk — this time.`;
      show('busted-screen');
    },
    showEnding() {
      hideAllOverlays();
      show('ending-screen');
    },
    hideAllOverlays,
    update(dt) {
      const p = world.player;
      // Money, health, stars, weapon, speed.
      el('money').textContent = `$${p.money.toLocaleString('en-US')}`;
      const healthBar = el('health-fill');
      if (healthBar) healthBar.style.width = `${p.health}%`;
      const stars = el('stars');
      if (stars) {
        const w = world.police.wanted;
        stars.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
        stars.style.color = w > 0 ? '#ffd23e' : '#5a6a7a';
      }
      const weapon = el('weapon');
      if (weapon) {
        const ammo = p.ammo === Infinity ? '∞' : p.ammo;
        weapon.textContent = `${p.weapon === 'fists' ? 'Fists' : p.weapon === 'pistol' ? 'P9 Pistol' : 'VK-9 SMG'} — ${ammo}`;
      }
      const speed = el('speed');
      if (speed) {
        if (p.vehicle) {
          speed.textContent = `${Math.round(Math.abs(p.vehicle.speed) * 3.6)} km/h`;
          speed.parentElement.classList.remove('hidden');
        } else {
          speed.parentElement.classList.add('hidden');
        }
      }
      // Crosshair only on foot with a gun.
      const cross = el('crosshair');
      if (cross) cross.style.display = (!p.vehicle && p.weapon !== 'fists') ? '' : 'none';
      // District + clock.
      el('district').textContent = districtAt(p.x, p.z);
      const dayFrac = (world.time % 480) / 480;
      const hour = Math.floor((dayFrac * 24 + 9) % 24);
      const min = Math.floor(((dayFrac * 24 + 9) % 1) * 60);
      el('clock').textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      // Damage flash decay.
      if (damageFlash > 0) {
        damageFlash = Math.max(0, damageFlash - dt * 1.8);
        const flash = el('damage-flash');
        if (flash) flash.style.opacity = String(damageFlash * 0.55);
      }
      // Minimap.
      drawMap(miniCtx, mini.width, false);
      // Safehouse heal hint.
      const sh = PLACES.safehouse;
      if (Math.hypot(p.x - sh.x, p.z - sh.z) < 12 && !p.vehicle && p.health < 100) {
        el('hint').textContent = 'Safehouse — health and ammo restored';
        el('hint').classList.remove('hidden');
      } else if (!p.vehicle) {
        const near = world.vehicles.find((c) => !c.destroyed && Math.hypot(c.x - p.x, c.z - p.z) < 4.2);
        if (near) {
          el('hint').textContent = `Press E to enter the ${near.def.name}`;
          el('hint').classList.remove('hidden');
        } else {
          el('hint').classList.add('hidden');
        }
      } else {
        el('hint').classList.add('hidden');
      }
    },
  };
}
