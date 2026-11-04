// All sound is synthesized here at runtime: no audio files, nothing to license.
// Wind, hooves, footsteps, campfire crackle, birds by day, crickets at night,
// the whistle, a chime when you're paid, and a sparse plucked guitar (Karplus-Strong)
// that plays a slow original progression, louder in towns and at dusk.

export function createAudio() {
  let ctx = null, master = null, musicBus = null, sfx = null, windGain = null, windFilter = null, cricketGain = null, rainGain = null;
  let noise = null, muted = false;
  const notes = {};
  let nextStep = 0, nextBird = 0, nextCrackle = 0, nextNote = 0, chordIdx = 0, noteIdx = 0;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);

    // Two seconds of white noise, reused by wind, hooves and crackle.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Wind: looped noise through a slowly wandering band pass.
    const w = ctx.createBufferSource(); w.buffer = noise; w.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.04;
    w.connect(windFilter).connect(windGain).connect(master); w.start();

    // Crickets: high band of noise, chopped by a fast LFO.
    const c = ctx.createBufferSource(); c.buffer = noise; c.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 4800; cf.Q.value = 8;
    const chop = ctx.createGain(); chop.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(chop.gain); lfo.start();
    cricketGain = ctx.createGain(); cricketGain.gain.value = 0;
    c.connect(cf).connect(chop).connect(cricketGain).connect(master); c.start();

    // Rain: broadband hiss, low passed.
    const rn = ctx.createBufferSource(); rn.buffer = noise; rn.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 2600;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rn.connect(rf).connect(rainGain).connect(master); rn.start(0, 0.7);

    // Pluck buffers for the guitar, A minor pentatonic-ish range.
    for (const [name, f] of Object.entries(NOTE_HZ)) notes[name] = pluck(f, 2.2);
  }

  function pluck(freq, seconds) {
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds), period = Math.floor(sr / freq);
    const buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = (idx + 1) % period;
      const v = (ring[idx] + ring[next]) * 0.497;
      out[i] = ring[idx];
      ring[idx] = v;
      idx = next;
    }
    return buf;
  }

  function play(buf, gain, when = 0, rate = 1, dest = sfx) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(dest); s.start(ctx.currentTime + when);
  }

  // A short filtered noise burst plus a low thump: one hoof or boot striking.
  function strike(level, bright, low) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bright; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    s.connect(f).connect(g).connect(sfx); s.start(t, Math.random() * 1.5, 0.09);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(low, t); o.frequency.exponentialRampToValueAtTime(low * 0.5, t + 0.08);
    const og = ctx.createGain(); og.gain.setValueAtTime(level * 0.9, t); og.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    o.connect(og).connect(sfx); o.start(t); o.stop(t + 0.1);
  }

  function chirp() {
    const t = ctx.currentTime, base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + i * 0.11;
      o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.3), t0 + 0.06);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.025, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.08);
      o.connect(g).connect(sfx); o.start(t0); o.stop(t0 + 0.1);
    }
  }

  function crackle(level) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    s.connect(f).connect(g).connect(sfx); s.start(t, Math.random() * 1.8, 0.04);
  }

  function whistle() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [t0, f0, f1] of [[0, 1400, 2300], [0.32, 1500, 1100]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t + t0); o.frequency.exponentialRampToValueAtTime(f1, t + t0 + 0.25);
      g.gain.setValueAtTime(0, t + t0); g.gain.linearRampToValueAtTime(0.12, t + t0 + 0.03); g.gain.linearRampToValueAtTime(0, t + t0 + 0.27);
      o.connect(g).connect(sfx); o.start(t + t0); o.stop(t + t0 + 0.3);
    }
  }

  function chime() {
    if (!ctx) return;
    ['E4', 'A4', 'C5', 'E5'].forEach((n, i) => play(notes[n], 0.35, i * 0.07, 1, sfx));
  }

  // Called every frame. s: { speed, mounted, x, z, y, inTown, nearFire (0..1), night (0..1), dusk (0..1) }
  function update(dt, s) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const sp = Math.abs(s.speed);

    // Wind: stronger up high and at speed.
    const windLevel = 0.03 + Math.min(0.05, Math.max(0, s.y - 8) * 0.0015) + Math.min(0.06, sp * 0.0022);
    windGain.gain.setTargetAtTime(windLevel, now, 0.5);
    windFilter.frequency.setTargetAtTime(380 + Math.sin(now * 0.13) * 160 + sp * 12, now, 0.8);
    cricketGain.gain.setTargetAtTime(s.night * 0.022 * (1 - (s.wet || 0)), now, 1.5);
    rainGain.gain.setTargetAtTime((s.wet || 0) * 0.09, now, 1.5);

    // Hooves or boots.
    if (sp > 0.4 && now >= nextStep) {
      if (s.mounted) {
        const gallop = sp > 16;
        const rate = gallop ? 7.5 : 1.6 + sp * 0.38;
        strike(0.18 + Math.min(0.12, sp * 0.006), 900 + Math.random() * 400, 130);
        nextStep = now + (1 / rate) * (0.85 + Math.random() * 0.3);
        // Gallop: three quick beats then a pause.
        if (gallop && Math.random() < 0.28) nextStep += 0.12;
      } else {
        strike(0.06, 1500 + Math.random() * 500, 180);
        nextStep = now + 1 / (1.7 + sp * 0.42);
      }
    }

    if (s.nearFire > 0.02 && now >= nextCrackle) { crackle(0.05 * s.nearFire); nextCrackle = now + 0.04 + Math.random() * 0.25; }
    if (s.night < 0.3 && (s.wet || 0) < 0.3 && now >= nextBird) { if (Math.random() < 0.6) chirp(); nextBird = now + 2 + Math.random() * 6; }

    // Music: a slow progression, one plucked note at a time, louder in town and at dusk.
    const musicLevel = (s.inTown ? 0.55 : 0.12) + s.dusk * 0.3;
    musicBus.gain.setTargetAtTime(Math.min(0.7, musicLevel), now, 2.5);
    if (now >= nextNote) {
      const chord = PROGRESSION[chordIdx];
      const n = chord[noteIdx % chord.length];
      play(notes[n], 0.32 + Math.random() * 0.1, 0, 1, musicBus);
      if (noteIdx % 4 === 0) play(notes[chord[0]], 0.22, 0.02, 0.5, musicBus); // bass on the downbeat
      noteIdx++;
      if (noteIdx >= 8) { noteIdx = 0; chordIdx = (chordIdx + 1) % PROGRESSION.length; }
      nextNote = now + (noteIdx % 2 ? 0.62 : 0.5) + (Math.random() < 0.15 ? 0.6 : 0);
    }
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.1);
  }

  // Pause sound when the page is hidden (phone locked, tab switched).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return { start, update, whistle, chime, setMuted, get muted() { return muted; } };
}

const NOTE_HZ = {
  E2: 82.41, A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, E5: 659.25,
};

// Am, F-ish (as A C E with C bass), G, E: arpeggiated, slow.
const PROGRESSION = [
  ['A2', 'E3', 'A3', 'C4', 'E4', 'C4', 'A3', 'E3'],
  ['C3', 'G3', 'C4', 'E4', 'G4', 'E4', 'C4', 'G3'],
  ['D3', 'A3', 'D4', 'E4', 'A4', 'E4', 'D4', 'A3'],
  ['E2', 'B3', 'E3', 'G3', 'B3', 'E4', 'B3', 'G3'],
];
