// Debug-only tile browser. Pressing B in-game toggles a full-screen
// modal that lists every tile in the Tiny Town and Tiny Dungeon
// packs alongside its number — useful when reassigning a TILES entry
// in assets.js. Never reachable from normal gameplay.
//
// Pure presentation module: the scene owns the `tileBrowserOn` flag
// and the container reference, this file just builds and tears down
// the visual.

import { DEPTH } from './config.js';

// Flip the browser on/off. Reads/writes scene.tileBrowserOn and
// scene.tileBrowserContainer so the scene's existing modal checks
// (isModalOpen) continue to gate input.
export function toggleTileBrowser(scene) {
  scene.tileBrowserOn = !scene.tileBrowserOn;
  if (!scene.tileBrowserOn) {
    if (scene.tileBrowserContainer) {
      scene.tileBrowserContainer.destroy();
      scene.tileBrowserContainer = null;
    }
    return;
  }

  const cam = scene.cameras.main;
  scene.tileBrowserContainer = scene.add.container(0, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH.modal);

  const bg = scene.add.rectangle(
    cam.width / 2, cam.height / 2, cam.width, cam.height, 0x000000, 0.92,
  );
  scene.tileBrowserContainer.add(bg);

  const title = scene.add.text(8, 4,
    'TILE BROWSER — press B to close. Top: Tiny Town  /  Bottom: Tiny Dungeon',
    { font: '12px monospace', fill: '#fff' });
  scene.tileBrowserContainer.add(title);

  const cellW = 28, cellH = 36, cols = 22;
  const startY = 26;
  drawTilePack(scene, 'Tiny Town (tiles 0–131)',    'town',    startY,                       cellW, cellH, cols);
  drawTilePack(scene, 'Tiny Dungeon (tiles 0–131)', 'dungeon', startY + 7 * cellH + 24,      cellW, cellH, cols);
}

// Adds one pack's tile grid to the container at yOffset. Each tile
// shows the image scaled up + its number underneath; clicking is not
// wired since we just want to see the numbers for code edits.
function drawTilePack(scene, packName, prefix, yOffset, cellW, cellH, cols) {
  const label = scene.add.text(8, yOffset - 14, packName,
    { font: '11px monospace', fill: '#aaa' });
  scene.tileBrowserContainer.add(label);
  for (let i = 0; i <= 131; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = 12 + col * cellW;
    const cy = yOffset + row * cellH;
    const img = scene.add.image(cx + cellW / 2 - 6, cy + 8, prefix + '_' + i).setScale(1.2);
    const num = scene.add.text(cx + cellW / 2 - 6, cy + 22, String(i),
      { font: '9px monospace', fill: '#888' }).setOrigin(0.5, 0);
    scene.tileBrowserContainer.add(img);
    scene.tileBrowserContainer.add(num);
  }
}
