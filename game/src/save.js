// save.js — localStorage saves: the player's money, health, weapons and
// position, missions passed, sun discs found and play time. Autosaves after
// every mission; the player can also save with F5 or from the pause menu.
const SAVE_KEY = 'solmar-bay-save-v1';

export function createSave(world) {
  function collect() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      time: world.time,
      player: world.player.getState(),
      missionsCompleted: world.missions.completed,
      packagesTaken: world.missions.getTakenPackages(),
    };
  }

  function write(data) {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  return {
    hasSave() {
      try {
        return window.localStorage.getItem(SAVE_KEY) !== null;
      } catch {
        return false;
      }
    },
    save() {
      const ok = write(collect());
      world.hud.toast(ok ? 'Game saved.' : 'Save failed — storage unavailable.', ok ? 'good' : 'bad');
      return ok;
    },
    autosave() {
      write(collect());
    },
    load() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.version !== 1) return null;
        world.time = data.time || 0;
        world.player.setState(data.player || {});
        world.missions.setCompleted(data.missionsCompleted || 0);
        world.missions.setTakenPackages(data.packagesTaken || []);
        return data;
      } catch {
        return null;
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Storage can be off; nothing to clear.
      }
    },
  };
}
