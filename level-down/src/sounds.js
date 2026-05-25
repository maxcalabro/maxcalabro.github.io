// Synthesized audio via the Web Audio API.
//
// The game ships zero audio assets — every sound is generated at
// play time from raw oscillators. Web Audio is good enough for the
// short chiptune-style cues we need (melee thuds, spell whooshes,
// healing chimes, and a looping title-screen riff).
//
// Browser policy: an AudioContext can only start producing sound
// after a user gesture. We create the context lazily on the first
// sound call AND resume() it if the browser parked it in 'suspended'
// state. Calls that happen before any user interaction are silent
// no-ops; the first click that resumes the context will make
// everything audible from then on.
//
// All public functions are no-ops if the browser has no Web Audio
// support, so callers don't need to guard.

let ctx = null;
let masterGain = null;

function getContext() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  // Single master gain — lets us drop the global volume in one
  // place if we ever add a settings slider. Default value is
  // moderate so synthesized waveforms don't peak.
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(ctx.destination);
  return ctx;
}

function ensureRunning() {
  const c = getContext();
  if (!c) return null;
  // Calling resume() outside a user-gesture is harmless but the
  // promise will just stay 'suspended' on Chrome. After the first
  // gesture-triggered call it transitions to 'running' for good.
  if (c.state === 'suspended') c.resume();
  return c;
}

// ---- One-shot SFX ---------------------------------------------------

// Short percussive thud. Sine sweep from 360 Hz → 110 Hz over
// 80 ms, envelope decays in 150 ms. The earlier 220 → 60 Hz pair
// read as too dull / muddy — bumped roughly a fifth up so the
// "thwack" sits in the punchier mid-range.
export function playMelee() {
  const c = ensureRunning();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(360, t0);
  osc.frequency.exponentialRampToValueAtTime(110, t0 + 0.08);
  gain.gain.setValueAtTime(0.25, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.16);
}

// Magical whoosh — sawtooth sweep up an octave and a half. Bright
// enough to read as a spell, short enough to not overlap badly
// when fireball/lightning rip off back-to-back.
export function playMagic() {
  const c = ensureRunning();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, t0);
  osc.frequency.exponentialRampToValueAtTime(1200, t0 + 0.18);
  gain.gain.setValueAtTime(0.10, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(t0); osc.stop(t0 + 0.23);
}

// Loot pickup — two quick ascending tones (G5 → C6) on a sine
// wave with a faster envelope than the heal chime. Two notes
// instead of three keeps it distinct from healing, and starting
// higher (G5 vs C5) reads as a coin-style "ping" rather than a
// healing arpeggio.
export function playLoot() {
  const c = ensureRunning();
  if (!c) return;
  const t0 = c.currentTime;
  const notes = [
    { freq: 783.99, dur: 0.07 }, // G5
    { freq: 1046.50, dur: 0.18 }, // C6 (held a touch longer for the "ping")
  ];
  let t = t0;
  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(t); osc.stop(t + n.dur + 0.01);
    t += n.dur;
  }
}

// Healing chime — ascending C5/E5/G5 triad on a triangle wave.
// Warm but bright; reads as positive feedback without competing
// with the heal skill's green visual glow.
export function playHeal() {
  const c = ensureRunning();
  if (!c) return;
  const t0 = c.currentTime;
  const notes = [523.25, 659.25, 783.99];
  for (let i = 0; i < notes.length; i++) {
    const tStart = t0 + i * 0.05;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = notes[i];
    gain.gain.setValueAtTime(0.15, tStart);
    gain.gain.exponentialRampToValueAtTime(0.001, tStart + 0.30);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(tStart); osc.stop(tStart + 0.32);
  }
}

// ---- Title-screen melody --------------------------------------------
//
// Looped 8-bit-style lead in A minor pentatonic. Square wave is the
// classic chiptune timbre that reads as "80s game". Each tick
// schedules the whole riff via Web Audio at once, then sets a
// setTimeout to schedule the next iteration when the current riff
// finishes. Stopping clears the timeout — Web Audio events already
// queued for the current iteration play out naturally (the audible
// "fade" between title and game lasts at most one bar).

let melodyRunning = false;
let melodyTimer = null;

const TITLE_MELODY = [
  // [freq Hz, duration s]. freq === 0 means rest.
  //
  // Four-bar 80s synth lead in A minor (pentatonic-leaning). Each
  // section is a "call and response" pair so the loop has internal
  // structure instead of repeating the same phrase over and over:
  //   A — main motif, low-to-mid arpeggio
  //   B — higher answer, climbing through C6
  //   C — flourish: 16th-note flutter up and back
  //   D — resolve: stepwise descent home to A4
  // Held notes (0.4–0.6 s) let the synth lead breathe between
  // runs; small rests separate the sections. Total loop ~9 s.

  // -- A: main motif (rising-falling arpeggio in A minor) --
  [440.00, 0.20], // A4
  [523.25, 0.20], // C5
  [659.25, 0.20], // E5
  [880.00, 0.40], // A5 (held)
  [783.99, 0.20], // G5
  [659.25, 0.20], // E5
  [523.25, 0.20], // C5
  [440.00, 0.40], // A4 (held)
  [0,       0.20], // short rest

  // -- B: higher answer climbing to C6 and back --
  [659.25, 0.20], // E5
  [783.99, 0.20], // G5
  [880.00, 0.20], // A5
  [1046.50, 0.40], // C6 (held)
  [987.77, 0.20], // B5
  [880.00, 0.20], // A5
  [783.99, 0.20], // G5
  [659.25, 0.40], // E5 (held)
  [0,       0.20], // short rest

  // -- C: 16th-note flourish bouncing across the scale --
  [880.00, 0.15], // A5
  [783.99, 0.15], // G5
  [659.25, 0.15], // E5
  [587.33, 0.15], // D5
  [523.25, 0.15], // C5
  [440.00, 0.15], // A4
  [523.25, 0.15], // C5
  [659.25, 0.15], // E5
  [880.00, 0.45], // A5 (held landing)
  [0,       0.20], // short rest

  // -- D: stepwise descent home --
  [659.25, 0.20], // E5
  [587.33, 0.20], // D5
  [523.25, 0.20], // C5
  [440.00, 0.20], // A4
  [523.25, 0.20], // C5
  [440.00, 0.60], // A4 (long resolve)
  [0,       0.50], // bar rest before looping
];

function playMelodyOnce(c) {
  let t = c.currentTime;
  for (const [freq, dur] of TITLE_MELODY) {
    if (freq > 0) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      // Tiny attack ramp so notes don't click on / off; matching
      // exponential decay gives each note its own envelope.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain); gain.connect(masterGain);
      osc.start(t); osc.stop(t + dur);
    }
    t += dur;
  }
  // Total duration of this iteration in seconds — fed into the
  // next setTimeout so we loop without overlap.
  return t - c.currentTime;
}

export function startTitleMelody() {
  const c = ensureRunning();
  if (!c || melodyRunning) return;
  melodyRunning = true;
  const tick = () => {
    if (!melodyRunning) return;
    const dur = playMelodyOnce(c);
    melodyTimer = setTimeout(tick, dur * 1000);
  };
  tick();
}

export function stopTitleMelody() {
  melodyRunning = false;
  if (melodyTimer !== null) {
    clearTimeout(melodyTimer);
    melodyTimer = null;
  }
}
