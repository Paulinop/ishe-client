'use strict';
// Dibuja el fondo de mina (piedra, vetas de mineral, antorchas, vagoneta, rieles, estalactitas y lava)
// y lo escribe en app/renderer/style.css, entre las marcas MINA-INICIO y MINA-FIN. Dibujos propios.
// Uso: node tools/generar_mina.js
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'app', 'renderer', 'style.css');
const enc = (svg) => 'url("data:image/svg+xml,' + svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'").replace(/[ \t\r\n]+/g, ' ') + '")';
// Junta todos los rectangulos del mismo color en una sola forma (el archivo pesa mucho menos).
function compact(body) {
  const groups = new Map();
  for (const match of body.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]+)"\/>/g)) {
    const [, x, y, w, h, fill] = match;
    if (!groups.has(fill)) groups.set(fill, []);
    groups.get(fill).push('M' + x + ' ' + y + 'h' + w + 'v' + h + 'h-' + w + 'z');
  }
  return [...groups].map(([fill, d]) => '<path fill="' + fill + '" d="' + d.join('') + '"/>').join('');
}

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const svg = (w, h, vw, vh, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" shape-rendering="crispEdges">${compact(body)}</svg>`;
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

let css = '/* MINA-INICIO (lo escribe tools/generar_mina.js; no lo edites a mano) */\n';

// ---- piedra: 16 x 16 celdas de 4 px ----
{
  const tones = ['#41433a', '#3a3c33', '#484a40', '#363830', '#43453c', '#3d3f36', '#41433a'];
  let b = '';
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) b += rect(i, j, 1, 1, rnd() < 0.06 ? '#2a2c24' : pick(tones));
  css += `.piedra { background-image: ${enc(svg(64, 64, 16, 16, b))}; background-size: 64px 64px; }\n`;
}

// ---- vetas de mineral: casillero de 32 x 32 bloques de 16 px ----
{
  const ores = [['#17181c', 5], ['#d9b99a', 4], ['#f4c52e', 3], ['#e0382b', 2], ['#58e6e9', 2]];
  const total = ores.reduce((s, o) => s + o[1], 0);
  const oreColor = () => { let r = rnd() * total; for (const [c, w] of ores) { r -= w; if (r < 0) return c; } return ores[0][0]; };
  let b = '';
  const used = new Set();
  const sparks = [];
  for (let n = 0; n < 26; n++) {
    let cx = 3 + Math.floor(rnd() * 26), cy = 3 + Math.floor(rnd() * 26);
    const color = oreColor();
    const size = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < size; k++) {
      const key = cx + ',' + cy;
      if (!used.has(key)) {
        used.add(key);
        b += rect(cx * 16, cy * 16, 16, 16, '#5b5e53') + rect(cx * 16, cy * 16, 16, 2, '#6c6f63') + rect(cx * 16, cy * 16 + 14, 16, 2, '#44463e');
        for (let s = 0; s < 5; s++) {
          const sx = cx * 16 + 2 + Math.floor(rnd() * 3) * 4, sy = cy * 16 + 2 + Math.floor(rnd() * 3) * 4;
          b += rect(sx, sy, 4, 4, color);
          if ((color === '#f4c52e' || color === '#58e6e9') && s === 0) sparks.push({ x: sx + 2, y: sy + 2, color });
        }
      }
      cx += rnd() < 0.5 ? 1 : 0; cy += rnd() < 0.5 ? 1 : (rnd() < 0.5 ? -1 : 0);
      cx = Math.min(30, Math.max(1, cx)); cy = Math.min(30, Math.max(1, cy));
    }
  }
  css += `.mina-ores { background-image: ${enc(svg(512, 512, 512, 512, b))}; background-size: 512px 512px; }\n`;
  // Destellos en cruz sobre el oro y los diamantes: dos capas que parpadean por turnos.
  ['a', 'b'].forEach((layer, which) => {
    let s = '';
    sparks.forEach((sp, i) => {
      if (i % 2 !== which) return;
      const tone = sp.color === '#f4c52e' ? '#fff2b0' : '#e2ffff';
      s += rect(sp.x - 1, sp.y - 6, 2, 12, tone) + rect(sp.x - 6, sp.y - 1, 12, 2, tone);
    });
    css += `.mina-brillos.${layer} { background-image: ${enc(svg(512, 512, 512, 512, s))}; background-size: 512px 512px; }\n`;
  });
}

// ---- antorcha: 8 x 18 celdas de 4 px, 3 cuadros de llama ----
{
  const SC = 3, W = 8, H = 18;
  const frame = (f, ox) => {
    let b = '';
    b += rect(ox + 3, 8, 2, 10, '#8a5a2f') + rect(ox + 4, 8, 1, 10, '#6e4623') + rect(ox + 3, 6, 2, 2, '#2a2018');
    const flames = [
      [[2, 2, 4, 4], [3, 0, 2, 2]],
      [[2, 3, 4, 3], [3, 1, 2, 2], [2, 1, 1, 2]],
      [[2, 2, 4, 4], [3, 0, 2, 1], [5, 1, 1, 2]],
    ][f];
    for (const [x, y, w, h] of flames) b += rect(ox + x, y, w, h, '#ff8a1f');
    for (const [x, y, w, h] of flames) if (w > 2) b += rect(ox + x + 1, y + 1, w - 2, Math.max(1, h - 1), '#ffc23a');
    b += rect(ox + 3, 3, 2, 3, '#fff3b0');
    return b;
  };
  const body = [0, 1, 2].map((f) => frame(f, f * W)).join('');
  css += `.antorcha { background-image: ${enc(svg(W * 3 * SC, H * SC, W * 3, H, body))}; background-size: ${W * 3 * SC}px ${H * SC}px; width: ${W * SC}px; height: ${H * SC}px; }\n`;
}

// ---- vagoneta con oro: 22 x 14 celdas de 3 px, 2 cuadros (giran las ruedas) ----
{
  const SC = 3, W = 22, H = 14;
  const frame = (f, ox) => {
    let b = '';
    // carga de oro
    b += rect(ox + 4, 1, 14, 3, '#f4c52e') + rect(ox + 6, 0, 9, 2, '#f4c52e') + rect(ox + 7, 0, 3, 1, '#ffe58a') + rect(ox + 11, 1, 2, 1, '#ffe58a') + rect(ox + 14, 2, 3, 1, '#c8951a') + rect(ox + 5, 3, 3, 1, '#c8951a');
    // caja
    b += rect(ox, 3, 22, 2, '#a9abb2') + rect(ox + 1, 5, 20, 5, '#7d7f87') + rect(ox + 1, 5, 20, 1, '#9a9ca3') + rect(ox + 2, 10, 18, 1, '#55565c');
    for (const x of [3, 8, 13, 18]) b += rect(ox + x, 7, 1, 1, '#4a4b50');
    // ruedas
    for (const x of [3, 15]) {
      b += rect(ox + x, 10, 4, 4, '#2a2b30');
      b += f ? rect(ox + x + 1, 11, 2, 2, '#9a9ca3') : rect(ox + x + 1, 10, 2, 2, '#9a9ca3');
    }
    return b;
  };
  css += `.vagoneta { background-image: ${enc(svg(W * 2 * SC, H * SC, W * 2, H, frame(0, 0) + frame(1, W)))}; background-size: ${W * 2 * SC}px ${H * SC}px; width: ${W * SC}px; height: ${H * SC}px; }\n`;
}

// ---- rieles: baldosa de 12 x 5 celdas de 2 px ----
{
  const b = rect(4, 0, 4, 5, '#5e3f22') + rect(4, 0, 4, 1, '#7a5430') + rect(0, 1, 12, 1, '#b4b6bc') + rect(0, 2, 12, 1, '#55565c') + rect(0, 3, 12, 1, '#b4b6bc') + rect(0, 4, 12, 1, '#55565c');
  css += `.rieles { background-image: ${enc(svg(24, 10, 12, 5, b))}; background-size: 24px 10px; }\n`;
}

// ---- estalactitas del techo del inicio: 800 x 64 ----
{
  let b = '';
  for (let x = 0; x < 800; x += 8) {
    // altura de cada columna: varios colmillos
    const h = Math.max(0, Math.round(5 + 4 * Math.sin(x / 70) + 3 * Math.sin(x / 23 + 1)));
    for (let y = 0; y < h; y++) b += rect(x, y * 8, 8, 8, y === h - 1 ? '#3a3c35' : '#26281f');
  }
  css += `.hero-estalac { background-image: ${enc(svg(800, 64, 800, 64, b))}; background-size: 800px 64px; }\n`;
}

// ---- lava del inicio: baldosa de 320 x 48 (se repite) ----
{
  let b = '';
  for (let x = 0; x < 320; x += 8) {
    const top = 1 + Math.round(1.2 * Math.sin(x / 38) + 0.8 * Math.sin(x / 17 + 2));
    for (let y = top; y < 6; y++) {
      const color = y === top ? '#ffd76a' : y === top + 1 ? '#ffb02e' : y > 4 ? '#c2380a' : '#ff6a12';
      b += rect(x, y * 8, 8, 8, color);
    }
    if (rnd() < 0.18) b += rect(x, (top + 2) * 8, 8, 8, '#ffd76a');
  }
  css += `.hero-lava { background-image: ${enc(svg(320, 48, 320, 48, b))}; background-size: 320px 48px; }\n`;
}

css += '/* MINA-FIN */';

let file = fs.readFileSync(CSS, 'utf8');
if (file.includes('/* MINA-INICIO')) file = file.replace(/\/\* MINA-INICIO[\s\S]*?\/\* MINA-FIN \*\//, () => css);
else file += '\n' + css + '\n';
fs.writeFileSync(CSS, file);
console.log('mina escrita en style.css (' + css.length + ' caracteres)');
