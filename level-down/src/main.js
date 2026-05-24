// Entry point: load Phaser, wire the start menu, kick off the scene
// when the player presses START with their chosen map.

import { makeGameScene } from './scene.js';
import { initStartMenu } from './menu.js';
import { TILE, VIEW_W, VIEW_H } from './config.js';

const statusEl = document.getElementById('status');
const errorEl  = document.getElementById('error');
const setStatus = (msg) => { statusEl.textContent = msg; };
const showError = (msg) => { errorEl.style.display = 'block'; errorEl.textContent = msg; };

window.addEventListener('error', (e) => {
  showError('JS error: ' + e.message + (e.filename ? ('\n  at ' + e.filename + ':' + e.lineno) : ''));
});
window.addEventListener('unhandledrejection', (e) => {
  showError('Unhandled promise: ' + (e.reason && e.reason.stack || e.reason));
});

function loadPhaser(callback) {
  const sources = [
    'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.80.1/phaser.min.js',
    'https://unpkg.com/phaser@3.80.1/dist/phaser.min.js',
  ];
  let i = 0;
  const tryNext = () => {
    if (i >= sources.length) {
      showError('Could not load Phaser. Serve via: python3 -m http.server 8000');
      return;
    }
    setStatus('Loading Phaser from ' + sources[i] + ' ...');
    const s = document.createElement('script');
    s.src = sources[i++];
    // crossOrigin lets the browser surface real error messages
    // instead of the generic "Script error." that appears when a
    // CDN script throws across origins.
    s.crossOrigin = 'anonymous';
    s.onload = () => { setStatus('Phaser loaded. Choose a map and press START.'); callback(); };
    s.onerror = tryNext;
    document.head.appendChild(s);
  };
  tryNext();
}

// Wire up the menu immediately so the player can read the options
// while Phaser is still loading. The START button stays disabled
// until Phaser is ready; the menu's setReady() flips it on.
const menu = initStartMenu((config) => {
  try {
    const GameScene = makeGameScene(config);
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: VIEW_W * TILE,
      height: VIEW_H * TILE,
      pixelArt: true,
      physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
      disableContextMenu: true,
      scene: GameScene,
    });
    setStatus('Phaser ' + Phaser.VERSION + ' running. Press B for tile browser, C for character sheet.');
  } catch (err) {
    showError('Error starting game: ' + err.message + '\n\n' + err.stack);
  }
});

loadPhaser(() => {
  if (typeof Phaser === 'undefined') { showError('Phaser global missing.'); return; }
  menu.setReady(true);
});
