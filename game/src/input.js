// input.js — keyboard + mouse state, pointer lock, and one-shot actions.
// The game reads keys every frame; actions (enter car, jump, pause...) fire
// once per press via takeActions().
export const ACTION_ENTER = 1;
export const ACTION_JUMP = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_WEAPON = 16;
export const ACTION_MAP = 32;
export const ACTION_MUTE = 64;
export const ACTION_SAVE = 128;
export const ACTION_HORN = 256;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  const KEY_ACTIONS = {
    KeyE: ACTION_ENTER,
    Space: ACTION_JUMP,
    KeyP: ACTION_PAUSE,
    Escape: ACTION_PAUSE,
    Enter: ACTION_CONFIRM,
    KeyR: ACTION_WEAPON,
    KeyM: ACTION_MAP,
    KeyN: ACTION_MUTE,
    F5: ACTION_SAVE,
    KeyQ: ACTION_HORN,
  };

  function onKeyDown(event) {
    if (event.code === 'F5') event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) actions |= action;
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  }
  function onMouseDown(event) {
    if (event.button === 0) mouseDown = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }
  function onBlur() {
    keys.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    isDown(code) {
      return keys.has(code);
    },
    // -1..1 strafe (A/D) and forward (W/S) from WASD + arrows.
    moveVector() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    queueAction(action) {
      actions |= action;
    },
    get firing() {
      return mouseDown;
    },
    get pointerLocked() {
      return locked;
    },
    lockPointer() {
      if (!locked && canvas.requestPointerLock) canvas.requestPointerLock();
    },
    unlockPointer() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
