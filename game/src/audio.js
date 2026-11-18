// audio.js — all sound is synthesized with WebAudio: engine hum, sirens,
// gunshots, impacts, UI chimes and a procedural sunset-city music loop.
// No audio files are loaded; everything is generated at run time.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let enabled = true;
  let musicOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(master);
    src.start(t);
  }

  // A lazy bass-and-keys loop in A minor, scheduled a bar ahead.
  const BASS = [55, 55, 65.41, 49];
  const KEYS = [220, 261.63, 329.63, 440, 329.63, 261.63];
  let bar = 0;
  function scheduleMusic() {
    if (!ctx || !musicOn) return;
    const step = 0.28;
    const root = BASS[bar % BASS.length];
    tone(root, step * 3.8, 'triangle', 0.16);
    tone(root * 2, step * 1.8, 'sine', 0.06);
    for (let i = 0; i < 4; i += 1) {
      window.setTimeout(() => {
        if (musicOn) tone(KEYS[(bar * 2 + i) % KEYS.length], 0.5, 'sine', 0.05);
      }, i * step * 1000);
    }
    bar += 1;
    musicTimer = window.setTimeout(scheduleMusic, step * 4 * 1000);
  }

  return {
    unlock() {
      ensure();
    },
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (!enabled) {
        this.engine(0);
        this.siren(false);
      }
      return enabled;
    },
    startMusic() {
      if (!ensure() || musicOn) return;
      musicOn = true;
      scheduleMusic();
    },
    stopMusic() {
      musicOn = false;
      if (musicTimer) window.clearTimeout(musicTimer);
    },
    engine(speed01) {
      if (!ctx) return;
      if (speed01 <= 0.01) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.05 + speed01 * 0.05;
    },
    siren(on) {
      if (!ctx) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        lfo.start();
        sirenOsc.frequency.value = 880;
      }
      sirenGain.gain.value = 0.045;
    },
    shot() {
      noise(0.14, 0.5, 3000);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    punch() {
      noise(0.08, 0.3, 900);
    },
    crash() {
      noise(0.3, 0.5, 700);
      tone(90, 0.25, 'sine', 0.3, 40);
    },
    explosion() {
      noise(0.8, 0.7, 400);
      tone(60, 0.7, 'sine', 0.4, 28);
    },
    horn() {
      tone(370, 0.35, 'square', 0.08);
      tone(466, 0.35, 'square', 0.08);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.2);
      window.setTimeout(() => tone(990, 0.18, 'sine', 0.2), 90);
    },
    cash() {
      tone(880, 0.1, 'sine', 0.18);
      window.setTimeout(() => tone(1174, 0.16, 'sine', 0.18), 100);
    },
    missionStart() {
      tone(523, 0.14, 'triangle', 0.2);
      window.setTimeout(() => tone(659, 0.14, 'triangle', 0.2), 140);
      window.setTimeout(() => tone(784, 0.24, 'triangle', 0.22), 280);
    },
    missionPass() {
      [523, 659, 784, 1046].forEach((f, i) => {
        window.setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 130);
      });
    },
    wantedUp() {
      tone(220, 0.16, 'sawtooth', 0.15, 440);
    },
    click() {
      tone(700, 0.06, 'sine', 0.12);
    },
    denied() {
      tone(160, 0.15, 'square', 0.12, 110);
    },
  };
}
