// Pre-game start menu.
//
// Two-stage flow:
//   1. Title screen — animated "LEVEL DOWN" header and a single
//      "Start Adventure" button. The button stays disabled while
//      Phaser is loading (menu.setReady wakes it up).
//   2. Create your first hero — pick a class (Knight / Mage / Cleric /
//      Archer), name them, and set their starting personality knobs.
//      "Begin Adventure" hands a single-hero config to main.js. The
//      2nd and 3rd party members are recruited in-game on maps 2 & 3.
//
// The menu only supports Adventure mode now; the old hand-authored
// sandbox maps were retired once procgen + multi-level progression
// became the main experience.

import { generateMap } from './map-generator.js';
import { startTitleMelody, stopTitleMelody } from './sounds.js';
import { CLASS_ORDER, CLASS_INFO, CLASS_PERSONALITY } from './classes.js';

// initStartMenu wires the controls and calls `onStart(config)` when
// the player presses BEGIN ADVENTURE. The config object has shape:
//   { mode: 'adventure', level: 1, map,
//     startClass: 'Knight',
//     heroName: 'Sir Bob',
//     personalityChoice: { preferredDistance, targetMode, independence, greed } }
export function initStartMenu(onStart) {
  populateAnimatedTitle();

  const menu = document.getElementById('start-menu');
  const startBtn = document.getElementById('start-button');
  const beginBtn = document.getElementById('begin-button');
  const introSection = document.getElementById('menu-intro');
  const createSection = document.getElementById('hero-create');
  const picker = document.getElementById('class-picker');
  const nameInput = document.getElementById('create-name');

  const distSlider = document.getElementById('create-dist');
  const targetSelect = document.getElementById('create-target');
  const indepSlider = document.getElementById('create-indep');
  const greedSlider = document.getElementById('create-greed');

  // The class the player has selected (defaults to the first).
  let selectedClass = CLASS_ORDER[0];

  // Live `Npx` readout for a slider.
  const wireMenuSlider = (slider, valueId) => {
    const value = document.getElementById(valueId);
    if (!slider || !value) return;
    const sync = () => { value.textContent = `${slider.value} px`; };
    slider.addEventListener('input', sync);
    sync();
  };
  wireMenuSlider(distSlider, 'create-dist-value');
  wireMenuSlider(indepSlider, 'create-indep-value');
  wireMenuSlider(greedSlider, 'create-greed-value');

  // Pushes a class's default personality into the controls and syncs
  // the readouts. Range inputs clamp to their own min/max (so the
  // Independence floor of 96 is honoured automatically).
  const applyClassDefaults = (role) => {
    const p = CLASS_PERSONALITY[role] || {};
    if (distSlider) distSlider.value = String(p.preferredDistance ?? 64);
    if (targetSelect) targetSelect.value = p.targetMode || 'closest';
    if (indepSlider) indepSlider.value = String(p.independence ?? 128);
    if (greedSlider) greedSlider.value = String(p.greed ?? 96);
    [distSlider, indepSlider, greedSlider].forEach((s) => {
      if (s) s.dispatchEvent(new Event('input'));
    });
  };

  // (Re)render the class cards, highlighting the selected one.
  const renderPicker = () => {
    if (!picker) return;
    picker.innerHTML = '';
    for (const role of CLASS_ORDER) {
      const info = CLASS_INFO[role] || { statsLine: '', blurb: '' };
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'class-card' + (role === selectedClass ? ' selected' : '');
      const name = document.createElement('div');
      name.className = 'class-card-name';
      name.textContent = role;
      const stats = document.createElement('div');
      stats.className = 'class-card-stats';
      stats.textContent = info.statsLine;
      const blurb = document.createElement('div');
      blurb.className = 'class-card-blurb';
      blurb.textContent = info.blurb;
      card.appendChild(name);
      card.appendChild(stats);
      card.appendChild(blurb);
      card.addEventListener('click', () => selectClass(role));
      picker.appendChild(card);
    }
  };

  const selectClass = (role) => {
    selectedClass = role;
    if (nameInput) nameInput.value = role;   // name defaults to the class
    applyClassDefaults(role);
    renderPicker();
  };

  // Stage 1 → Stage 2.
  startBtn.addEventListener('click', () => {
    if (startBtn.disabled) return;
    introSection.hidden = true;
    createSection.hidden = false;
    selectClass(selectedClass);              // seed cards + controls + name
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 0);
    // First user click of the page — also the first chance the browser
    // will let us produce audio. Kick off the title melody; it loops
    // until Begin Adventure stops it.
    startTitleMelody();
  });

  // Stage 2 → game start.
  const begin = () => {
    const heroName = (nameInput && nameInput.value.trim()) || selectedClass;
    const personalityChoice = {
      preferredDistance: Number(distSlider.value),
      targetMode: targetSelect.value,
      independence: Number(indepSlider.value),
      greed: Number(greedSlider.value),
    };
    menu.classList.remove('open');
    stopTitleMelody();
    onStart({
      mode: 'adventure',
      level: 1,
      map: generateMap({ monsters: 4, loot: 2 }),
      startClass: selectedClass,
      heroName,
      personalityChoice,
    });
  };
  beginBtn.addEventListener('click', begin);
  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); begin(); }
    });
  }

  return {
    // Called by main.js once Phaser has finished loading — the title
    // screen button stays disabled until then so the player can't
    // start before the game can spin up.
    setReady(ready) {
      startBtn.disabled = !ready;
      startBtn.textContent = ready ? 'START ADVENTURE' : 'LOADING…';
    },
  };
}

// Builds the per-letter spans for the animated "LEVEL DOWN" title.
// Each letter gets its own animation-delay so the rainbow flows
// across the word rather than all letters cycling in lockstep.
function populateAnimatedTitle() {
  const el = document.getElementById('game-title');
  if (!el) return;
  const text = 'LEVEL DOWN';
  el.innerHTML = '';
  // Index into the text used for stagger — spaces count too, so the
  // wave keeps moving across the gap.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      const sp = document.createElement('span');
      sp.className = 'title-space';
      el.appendChild(sp);
      continue;
    }
    const span = document.createElement('span');
    span.className = 'title-letter';
    span.textContent = ch;
    // Negative delay so all letters start at different phases of the
    // looping animation immediately — no startup pause where they're
    // all the same colour.
    span.style.animationDelay = `${-i * 0.18}s, ${-i * 0.1}s`;
    el.appendChild(span);
  }
}
