'use strict';
// Dibuja los dibujos de pixeles del client (gatitos, corazones, tierra y nubes de dia) (dibujos propios, no son archivos de Minecraft) y los pone
// como imagenes dentro de app/renderer/style.css, entre las marcas GATOS-INICIO y GATOS-FIN.
// Cada pelaje tiene cuatro poses: caminar (4 cuadros), sentado, asearse y dormir (2 cuadros cada una).
// Todas caben en la misma casilla de W x H pixeles, pegadas abajo, mirando a la derecha.
// Uso: node tools/generar_gatos.js
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'app', 'renderer', 'style.css');
const PX = 3;          // tamano en pantalla de cada pixel del dibujo
const W = 22, H = 14;  // casilla de cada cuadro (sin el contorno)
const OUTLINE = '#0b0f09';

const COATS = {
  naranja: { body: '#e48d2f', dark: '#a85a1a', light: '#f8e1b4', eye: '#a8ea5c', pupil: '#16200c', ear: '#f6a8ad', nose: '#ef8f98', stripes: true },
  negro: { body: '#3a3b45', dark: '#1b1b21', light: '#5a5b68', eye: '#f6da3e', pupil: '#0a0a0c', ear: '#b97b84', nose: '#c98790', stripes: false },
  siames: { body: '#f0e4cd', dark: '#5e4838', light: '#fff8e9', eye: '#7cc0f6', pupil: '#14202c', ear: '#5e4838', nose: '#5e4838', points: true },
  crema: { body: '#f6e1c6', dark: '#e79c55', light: '#fffaf0', eye: '#a9c3ee', pupil: '#1b1b24', ear: '#f5b2b6', nose: '#ee8f98', mask: true },
  gris: { body: '#939aa4', dark: '#626872', light: '#e0e3e8', eye: '#a8ea5c', pupil: '#16200c', ear: '#f2abb1', nose: '#ef8f98', stripes: true },
};

// El gato de Guishe: crema claro, manchas naranja en la cara, ojos azul grisaceo, patitas blancas.
const GATO_GUISHE = COATS.crema;

function makeGrid() {
  const cells = Array.from({ length: H }, () => Array(W).fill(null));
  const put = (x, y, color) => { if (x >= 0 && y >= 0 && x < W && y < H && color) cells[y][x] = color; };
  const rect = (x, y, rw, rh, color) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) put(x + i, y + j, color); };
  return { cells, put, rect };
}

// Cabeza vista de frente, 9 x 8 pixeles. `look` mueve las pupilas; `closed` cierra los ojos.
function drawHead(g, ox, oy, c, opts = {}) {
  const body = c.body;
  const earTone = c.points ? c.dark : body;
  const rows = [
    'e.......e',
    'ee.....ee',
    'epeeeeepe',
    'bbbbfbbbb',
    'bibbbbbib',
    'bbbbnbbbb',
    'bblllllbb',
    '.bblllbb.',
  ];
  const map = { b: body, e: earTone, p: c.ear, f: c.stripes ? c.dark : body, i: c.eye, n: c.nose, l: c.light };
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.put(ox + i, oy + j, map[ch]); }));
  if (c.points) { g.rect(ox + 2, oy + 4, 5, 3, c.dark); g.rect(ox + 3, oy + 7, 3, 1, c.dark); g.put(ox + 4, oy + 5, c.nose); }
  // ojos: iris de 1 pixel con pupila al lado (o una raya si estan cerrados)
  const eyeL = [ox + 1, oy + 4], eyeR = [ox + 7, oy + 4];
  for (const [ex, ey] of [eyeL, eyeR]) {
    if (opts.closed) { g.put(ex, ey, c.pupil); continue; }
    g.put(ex, ey, c.eye);
    g.put(ex + (ex === eyeL[0] ? 1 : -1), ey, c.pupil);
  }
  if (c.stripes) { g.put(ox + 3, oy + 3, c.dark); g.put(ox + 5, oy + 3, c.dark); }
  if (c.mask) {
    // manchas naranja alrededor de los ojos y rayitas en la frente
    for (const [x, y] of [[1, 3], [2, 3], [2, 4], [1, 5], [2, 5], [7, 3], [6, 3], [6, 4], [7, 5], [6, 5], [3, 3], [5, 3], [4, 2]]) g.put(ox + x, oy + y, c.dark);
    g.put(ox + 4, oy + 3, c.light); g.rect(ox + 3, oy + 5, 3, 1, c.body);
    g.put(ox + 1, oy + 4, c.eye); g.put(ox + 7, oy + 4, c.eye); g.put(ox + 2, oy + 4, c.pupil); g.put(ox + 6, oy + 4, c.pupil);
  }
}

function tail(g, c, shape) {
  const tone = c.points ? c.dark : c.body;
  for (const [x, y, w, h] of shape) g.rect(x, y, w, h, tone);
  const [tx, ty, tw] = shape[shape.length - 1];
  g.rect(tx, ty, tw, 1, c.dark);
}

function bodyShape(g, c, x0 = 3, y0 = 5) {
  g.rect(x0 + 2, y0, 10, 1, c.body);
  g.rect(x0, y0 + 1, 14, 4, c.body);
  g.rect(x0 + 1, y0 + 5, 12, 1, c.body);
  g.rect(x0 + 2, y0 + 5, 9, 1, c.light);
  if (c.stripes) for (const dx of [4, 7, 10]) g.rect(x0 + dx, y0, 1, 3, c.dark);
  if (c.points) g.rect(x0, y0 + 1, 2, 4, c.dark);
  else g.rect(x0, y0 + 3, 3, 2, c.dark);
}

function walk(frame, c) {
  const g = makeGrid();
  const sway = [0, 1, 0, 1][frame];
  tail(g, c, [[2, 7, 2, 2], [1, 5, 2, 3], [0 + sway, 3, 2, 3], [0 + sway, 1, 2, 2]]);
  bodyShape(g, c);
  drawHead(g, 13, 0, c);
  const phase = (p) => [{ dx: 1, lift: 0 }, { dx: 0, lift: 1 }, { dx: -1, lift: 0 }, { dx: 0, lift: 1 }][((p % 4) + 4) % 4];
  const far = c.points ? c.dark : c.dark, near = c.points ? c.dark : c.body;
  const legs = [{ x: 4, p: frame + 2, color: far }, { x: 11, p: frame, color: far }, { x: 6, p: frame, color: near }, { x: 13, p: frame + 2, color: near }];
  for (const leg of legs) {
    const { dx, lift } = phase(leg.p);
    const len = 3 - lift;
    g.rect(leg.x + dx, 11, 2, len - 1, leg.color);
    g.rect(leg.x + dx, 11 + len - 1, 2, 1, c.light);
  }
  return g;
}

function sitBase(g, c) {
  g.rect(8, 6, 6, 1, c.body);
  g.rect(6, 7, 10, 6, c.body);
  g.rect(5, 13, 12, 1, c.body);
  g.rect(12, 7, 4, 7, c.light);
  if (c.stripes) for (const x of [7, 9]) g.rect(x, 8, 1, 3, c.dark);
  if (c.points) g.rect(5, 11, 3, 3, c.dark); else g.rect(5, 11, 3, 3, c.dark);
  g.rect(12, 11, 2, 3, c.light);
}

function sit(frame, c) {
  const g = makeGrid();
  tail(g, c, frame ? [[1, 13, 4, 1], [0, 11, 2, 3], [0, 10, 2, 1]] : [[1, 13, 4, 1], [0, 12, 2, 2], [0, 12, 2, 1]]);
  sitBase(g, c);
  drawHead(g, 8, 0, c, { closed: frame === 1 && false });
  return g;
}

// Sentado con la cola esponjosa parada hacia arriba, como el gato de Guishe.
function sitUp(frame, c) {
  const g = makeGrid();
  const lean = frame ? 1 : 0;
  // cola esponjosa: base en el suelo, sube separada del cuerpo y la punta se mece
  g.rect(1, 13, 4, 1, c.body);
  g.rect(1, 6, 3, 7, c.body);
  g.rect(1 + lean, 3, 3, 3, c.body);
  g.rect(1 + lean, 1, 3, 2, c.dark);
  g.rect(2 + lean, 0, 1, 1, c.dark);
  g.rect(8, 6, 6, 1, c.body);
  g.rect(6, 7, 10, 6, c.body);
  g.rect(5, 13, 12, 1, c.body);
  g.rect(12, 8, 4, 6, c.light);          // pecho blanco
  g.rect(12, 11, 2, 3, c.light);         // patitas blancas
  g.rect(6, 10, 3, 3, c.dark);           // mancha naranja en el lomo
  g.rect(5, 13, 3, 1, c.dark);
  drawHead(g, 8, 0, c);
  return g;
}

// Se asea: levanta una pata hacia la cara y mueve la cabeza.
function groom(frame, c) {
  const g = makeGrid();
  tail(g, c, [[1, 13, 4, 1], [0, 12, 2, 2], [0, 12, 2, 1]]);
  sitBase(g, c);
  drawHead(g, 8, frame ? 1 : 0, c, { closed: true });
  g.rect(frame ? 13 : 12, frame ? 6 : 7, 2, 3, c.light);
  g.rect(frame ? 13 : 12, frame ? 6 : 7, 2, 1, c.nose);
  return g;
}

// Hecho un bollo dormido; el pecho sube y baja.
function sleep(frame, c) {
  const g = makeGrid();
  const up = frame ? 1 : 0;
  g.rect(3, 9 - up, 14, 1, c.body);
  g.rect(1, 10 - up, 18, 4 + up, c.body);
  g.rect(3, 13, 14, 1, c.light);
  if (c.stripes) for (const x of [5, 8, 11, 14]) g.rect(x, 9 - up, 1, 3 + up, c.dark);
  tail(g, c, [[0, 12, 5, 2]]);
  g.rect(0, 13, 6, 1, c.dark);
  drawHead(g, 12, 6, c, { closed: true });
  g.rect(11, 12, 3, 2, c.light);
  return g;
}

const POSES = { walk: [walk, 4], sit: [sit, 2], groom: [groom, 2], sleep: [sleep, 2] };

function cellColor(full, x, y) {
  if (full.cells[y][x]) return full.cells[y][x];
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => full.cells[y + dy] && full.cells[y + dy][x + dx]);
  return near ? OUTLINE : null;
}

// Un cuadro con contorno oscuro de un pixel, como tramos por color.
function frameParts(g, offsetX, byColor) {
  const full = { cells: Array.from({ length: H + 2 }, () => Array(W + 2).fill(null)) };
  g.cells.forEach((row, j) => row.forEach((color, i) => { if (color) full.cells[j + 1][i + 1] = color; }));
  for (let j = 0; j < H + 2; j++) {
    let i = 0;
    while (i < W + 2) {
      const color = cellColor(full, i, j);
      if (!color) { i += 1; continue; }
      let run = 1;
      while (i + run < W + 2 && cellColor(full, i + run, j) === color) run += 1;
      if (!byColor.has(color)) byColor.set(color, []);
      byColor.get(color).push('M' + (offsetX + i) + ' ' + j + 'h' + run + 'v1h-' + run + 'z');
      i += run;
    }
  }
}

function sheet(maker, c, frames) {
  const byColor = new Map();
  for (let f = 0; f < frames; f++) frameParts(maker(f, c), f * (W + 2), byColor);
  const paths = [...byColor].map(([color, d]) => '<path fill="' + color + '" d="' + d.join('') + '"/>').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(W + 2) * frames * PX}" height="${(H + 2) * PX}" viewBox="0 0 ${(W + 2) * frames} ${H + 2}" shape-rendering="crispEdges">${paths}</svg>`;
}

const enc = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/"/g, '%22').replace(/\(/g, '%28').replace(/\)/g, '%29') + '")';

let css = '/* GATOS-INICIO (lo escribe tools/generar_gatos.js; no lo edites a mano) */\n';
for (const name of Object.keys(COATS)) {
  for (const [pose, [maker, frames]] of Object.entries(POSES)) {
    css += `.gato.${name}.st-${pose} .sprite { background-image: ${enc(sheet(maker, COATS[name], frames))}; }\n`;
  }
}
// El gato que se sienta sobre el boton Jugar usa la pose sentada (2 cuadros).
css += `.gato-sentado .sprite { background-image: ${enc(sheet(sitUp, GATO_GUISHE, 2))}; }\n`;
// Corazon de pixeles para las caricias
{
  const heart = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
  const cells = Array.from({ length: 8 }, () => Array(9).fill(null));
  heart.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') cells[j + 1][i + 1] = (j === 0 && i === 1) || (j === 1 && i === 1) ? '#ffc2cc' : '#ff5d73'; }));
  let paths = '';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 9; i++) {
    let color = cells[j][i];
    if (!color && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells[j + dy] && cells[j + dy][i + dx])) color = '#3a0f18';
    if (color) paths += '<rect x="' + i + '" y="' + j + '" width="1" height="1" fill="' + color + '"/>';
  }
  css += '.corazon { background: ' + enc('<svg xmlns="http://www.w3.org/2000/svg" width="27" height="24" viewBox="0 0 9 8" shape-rendering="crispEdges">' + paths + '</svg>') + ' center / contain no-repeat; }\n';
}
// Textura de tierra para la pantalla de carga (16 x 16 celdas)
{
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const tones = ['#6b4a2b', '#5e4026', '#765232', '#4f351d', '#6b4a2b', '#6b4a2b'];
  let cellsSvg = '';
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) cellsSvg += '<rect x="' + i + '" y="' + j + '" width="1" height="1" fill="' + tones[Math.floor(rnd() * tones.length)] + '"/>';
  css += '.tierra { background-image: ' + enc('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16" shape-rendering="crispEdges">' + cellsSvg + '</svg>') + '; background-size: 96px 96px; image-rendering: pixelated; }\n';
}
// Nubes de dia: mas claras que las de la noche
{
  const u = 12; let r = '';
  const cloud = (x, y, w) => { r += '<rect x="' + (x + u) + '" y="' + y + '" width="' + (w - 2 * u) + '" height="' + u + '"/><rect x="' + x + '" y="' + (y + u) + '" width="' + w + '" height="' + u + '"/><rect x="' + (x + 2 * u) + '" y="' + (y - u) + '" width="' + Math.max(u * 2, w / 2 - u) + '" height="' + u + '"/>'; };
  cloud(40, 40, 132); cloud(300, 86, 96); cloud(470, 28, 156); cloud(610, 100, 84);
  css += '.hero-clouds.dia { background-image: ' + enc('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="160" shape-rendering="crispEdges" fill="#f1ecd8" fill-opacity="0.2">' + r + '</svg>') + '; }\n';
}
css += `:root { --gato-w: ${(W + 2) * PX}px; --gato-h: ${(H + 2) * PX}px; }\n/* GATOS-FIN */`;

let file = fs.readFileSync(CSS, 'utf8');
if (file.includes('/* GATOS-INICIO')) file = file.replace(/\/\* GATOS-INICIO[\s\S]*?\/\* GATOS-FIN \*\//, () => css);
else file += '\n' + css + '\n';
fs.writeFileSync(CSS, file);
console.log('gatitos escritos en style.css (' + css.length + ' caracteres)');
