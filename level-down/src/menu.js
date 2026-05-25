// Pre-game start menu.
//
// Two-stage flow:
//   1. Title screen — animated "LEVEL DOWN" header and a single
//      "Start Adventure" button. The button stays disabled while
//      Phaser is loading (menu.setReady wakes it up).
//   2. Name entry — three text inputs (Knight / Mage / Cleric).
//      "Begin Adventure" collects the names, hides the menu, and
//      hands a config to main.js which spins up the scene.
//
// The menu only supports Adventure mode now; the old hand-authored
// sandbox maps were retired once procgen + multi-level progression
// became the main experience.

import { generateMap } from './map-generator.js';
import { startTitleMelody, stopTitleMelody } from './sounds.js';

// initStartMenu wires the controls and calls `onStart(config)` when
// the player presses BEGIN ADVENTURE. The config object has shape:
//   { mode: 'adventure', map: <2d array>, level: 1, heroNames: {...} }
export function initStartMenu(onStart) {
  populateAnimatedTitle();

  const menu = document.getElementById('start-menu');
  const startBtn = document.getElementById('start-button');
  const beginBtn = document.getElementById('begin-button');
  const introSection = document.getElementById('menu-intro');
  const namesSection = document.getElementById('hero-names');
  const nameInputs = {
    Knight: document.getElementById('name-knight'),
    Mage:   document.getElementById('name-mage'),
    Cleric: document.getElementById('name-cleric'),
  };

  // Stage 1 → Stage 2.
  startBtn.addEventListener('click', () => {
    if (startBtn.disabled) return;
    introSection.hidden = true;
    namesSection.hidden = false;
    // Focus the first input so the player can type immediately. The
    // setTimeout works around the hidden→visible transition; without
    // it some browsers don't actually focus.
    setTimeout(() => nameInputs.Knight.focus(), 0);
    // First user click of the page — also the first chance the
    // browser will let us produce audio. Kick off the title melody
    // here; it'll loop until Begin Adventure stops it.
    startTitleMelody();
  });

  // Stage 2 → game start. Pressing Enter in any name input also
  // triggers Begin, since the player is likely already at the
  // keyboard.
  const begin = () => {
    const heroNames = {
      Knight: (nameInputs.Knight.value || '').trim() || 'Knight',
      Mage:   (nameInputs.Mage.value   || '').trim() || 'Mage',
      Cleric: (nameInputs.Cleric.value || '').trim() || 'Cleric',
    };
    menu.classList.remove('open');
    // Title melody has done its job — game audio takes over.
    stopTitleMelody();
    onStart({
      mode: 'adventure',
      level: 1,
      map: generateMap({ monsters: 4, loot: 4 }),
      heroNames,
    });
  };
  beginBtn.addEventListener('click', begin);
  for (const input of Object.values(nameInputs)) {
    input.addEventListener('keydown', (e) => {
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
