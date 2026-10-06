'use strict';
// Dibuja los gatitos de pixeles (dibujos propios, no son archivos de Minecraft), el corazon de las caricias y la
// tierra de la pantalla de carga, y los pone en app/renderer/style.css entre las marcas GATOS-INICIO y GATOS-FIN.
//
// Como funcionan los gatitos: cada pose se dibuja UNA vez, dividida en capas por zonas (cuerpo, rayas, manchas, pecho,
// ojos...). Cada capa es una mascara; el color de cada zona sale de variables CSS del pelaje (.pelo-<nombre>).
// Asi un pelaje nuevo es solo una lista de colores (en COATS) y no hace pesada la actualizacion.
// Todas las poses caben en la misma casilla de W x H pixeles, pegadas abajo, mirando a la derecha.
// Uso: node tools/generar_gatos.js
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'app', 'renderer', 'style.css');
const PX = 3;          // tamano en pantalla de cada pixel del dibujo
const W = 22, H = 14;  // casilla de cada cuadro (sin el contorno)
const OUTLINE = '#0b0f09';

// Colores de cada pelaje. Lo que no se indica (st, pt, mk, p1, p2) se queda del color del cuerpo.
// st = rayas, pt = puntas oscuras (siames), mk = mascara de la cara, p1 y p2 = manchas.
const COATS = {
  crema: { body: '#f6e1c6', dark: '#e79c55', light: '#fffaf0', mk: '#e79c55', eye: '#a9c3ee', pupil: '#1b1b24', ear: '#f5b2b6', nose: '#ee8f98' },
  naranja: { body: '#e48d2f', dark: '#a85a1a', light: '#f8e1b4', st: '#a85a1a', eye: '#a8ea5c', pupil: '#16200c', ear: '#f6a8ad', nose: '#ef8f98' },
  negro: { body: '#3a3b45', dark: '#1b1b21', light: '#5a5b68', eye: '#f6da3e', pupil: '#0a0a0c', ear: '#b97b84', nose: '#c98790' },
  siames: { body: '#f0e4cd', dark: '#5e4838', light: '#fff8e9', pt: '#5e4838', eye: '#7cc0f6', pupil: '#14202c', ear: '#5e4838', nose: '#5e4838' },
  gris: { body: '#939aa4', dark: '#626872', light: '#e0e3e8', st: '#626872', eye: '#a8ea5c', pupil: '#16200c', ear: '#f2abb1', nose: '#ef8f98' },
  blanco: { body: '#f4f2ee', dark: '#cfc9c0', light: '#ffffff', eye: '#7cc0f6', pupil: '#14202c', ear: '#f5b2b6', nose: '#ee8f98' },
  esmoquin: { body: '#2b2c33', dark: '#15151a', light: '#f6f4ee', eye: '#d7e85a', pupil: '#0a0a0c', ear: '#b97b84', nose: '#ee8f98' },
  carey: { body: '#2f2822', dark: '#17120e', light: '#4a3a2c', p1: '#c9761f', p2: '#8a4f1a', eye: '#e8b02e', pupil: '#0a0a0c', ear: '#b97b84', nose: '#c98790' },
  atigrado: { body: '#8c6c46', dark: '#4a3522', light: '#d9c19a', st: '#4a3522', eye: '#b7d85a', pupil: '#16200c', ear: '#e0a5a0', nose: '#d98088' },
  tricolor: { body: '#f6f2ea', dark: '#b0a99c', light: '#ffffff', p1: '#e08a2e', p2: '#26262c', eye: '#d3b04a', pupil: '#0a0a0c', ear: '#f5b2b6', nose: '#ee8f98' },
};

// Capas, de abajo hacia arriba, con la variable de color de cada una.
const LAYERS = [
  ['o', OUTLINE], ['b', 'var(--body)'], ['s', 'var(--st)'], ['t', 'var(--pt)'], ['m', 'var(--mk)'], ['1', 'var(--p1)'], ['2', 'var(--p2)'],
  ['d', 'var(--dark)'], ['l', 'var(--light)'], ['e', 'var(--ear)'], ['n', 'var(--nose)'], ['i', 'var(--eye)'], ['u', 'var(--pupil)'],
];

// ---------------------------------------------------------------- utilidades de dibujo

function makeGrid() {
  const cells = Array.from({ length: H }, () => Array(W).fill(null));
  let dx = 0, dy = 0;
  const put = (x, y, key) => { x += dx; y += dy; if (key && x >= 0 && y >= 0 && x < W && y < H) cells[y][x] = key; };
  const rect = (x, y, w, h, key) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, key); };
  // pinta solo encima de las celdas que ya son del cuerpo
  const over = (x, y, w, h, key) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const cx = x + i + dx, cy = y + j + dy;
      if (cells[cy] && cells[cy][cx] === 'b') cells[cy][cx] = key;
    }
  };
  return { cells, put, rect, over, shift(a, b) { dx = a; dy = b; } };
}

// Cabeza de frente, 8 filas x 9 columnas.
const HEAD = [
  'b.......b',
  'bb.....bb',
  'bebbbbbeb',
  'bbbbbbbbb',
  'bbbbbbbbb',
  'bbbbnbbbb',
  'bblllllbb',
  '.bblllbb.',
];

function drawHead(g, ox, oy, o = {}) {
  HEAD.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') g.put(ox + i, oy + j, ch); }));
  // manchas de la frente (gatos de dos o tres colores) y rayas (atigrados)
  g.over(ox + 1, oy + 2, 2, 1, '2'); g.over(ox + 6, oy + 2, 2, 1, '1');
  g.over(ox + 4, oy + 2, 1, 2, 's');
  // mascara naranja alrededor de los ojos (gato crema; en el siames tambien se oscurece)
  for (const [x, y] of [[1, 3], [2, 3], [1, 5], [2, 5], [7, 3], [6, 3], [7, 5], [6, 5]]) g.over(ox + x, oy + y, 1, 1, 'm');
  // puntas oscuras del siames: orejas y centro de la cara
  for (const [x, y] of [[0, 0], [0, 1], [1, 1], [8, 0], [8, 1], [7, 1], [0, 2], [8, 2], [3, 3], [5, 3], [3, 4], [4, 4], [5, 4], [3, 5], [5, 5]]) g.over(ox + x, oy + y, 1, 1, 't');
  // ojos: iris y pupila al lado (o una raya si estan cerrados)
  for (const [ex, px] of [[1, 2], [7, 6]]) {
    if (o.closed) { g.put(ox + ex, oy + 4, 'u'); continue; }
    g.put(ox + ex, oy + 4, 'i');
    g.put(ox + px, oy + 4, 'u');
  }
  g.put(ox + 4, oy + 5, 'n');
  if (o.mouth) {
    g.rect(ox + 3, oy + 6, 3, 1, 'e');
    if (o.mouth > 1) g.rect(ox + 4, oy + 7, 1, 1, 'e');
  }
}
const head = drawHead;

function tail(g, shape) {
  for (const [x, y, w, h] of shape) g.rect(x, y, w, h, 't');
  const [tx, ty, tw] = shape[shape.length - 1];
  g.rect(tx, ty, tw, 1, 'd');
}

function bodyShape(g, x0 = 3, y0 = 5) {
  g.rect(x0 + 2, y0, 10, 1, 'b'); g.rect(x0, y0 + 1, 14, 4, 'b'); g.rect(x0 + 1, y0 + 5, 12, 1, 'b');
  g.rect(x0 + 2, y0 + 5, 9, 1, 'l');
  g.over(x0, y0, 4, 3, '1');                         // mancha trasera
  g.over(x0 + 5, y0, 2, 3, '2'); g.over(x0 + 8, y0, 2, 3, '2'); // manchas del lomo
  for (const dx of [4, 7, 10]) g.over(x0 + dx, y0, 1, 3, 's'); // rayas
  g.over(x0, y0 + 1, 2, 2, 't');                     // anca (siames)
  g.rect(x0, y0 + 3, 3, 2, 'd');                     // sombra del anca
}

// ---------------------------------------------------------------- poses

function walk(f) {
  const g = makeGrid();
  const sway = [0, 1, 0, 1][f];
  tail(g, [[2, 7, 2, 2], [1, 5, 2, 3], [0 + sway, 3, 2, 3], [0 + sway, 1, 2, 2]]);
  bodyShape(g);
  head(g, 13, 0);
  const phase = (p) => [{ dx: 1, lift: 0 }, { dx: 0, lift: 1 }, { dx: -1, lift: 0 }, { dx: 0, lift: 1 }][((p % 4) + 4) % 4];
  const legs = [{ x: 4, p: f + 2, far: true }, { x: 11, p: f, far: true }, { x: 6, p: f }, { x: 13, p: f + 2 }];
  for (const leg of legs) {
    const { dx, lift } = phase(leg.p);
    const len = 3 - lift;
    g.rect(leg.x + dx, 11, 2, len - 1, leg.far ? 'd' : 't');
    g.rect(leg.x + dx, 11 + len - 1, 2, 1, 'l');
  }
  return g;
}

function run(f) {
  const g = makeGrid();
  const air = f % 2 === 0;
  g.shift(0, air ? -1 : 0);
  tail(g, [[0, 7, 3, 2]]);
  g.rect(0, 7, 1, 2, 'd');
  bodyShape(g);
  head(g, 13, 1);
  if (air) {
    g.rect(0, 11, 5, 2, 'd'); g.rect(0, 11, 2, 2, 'l');           // patas de atras estiradas (lejana)
    g.rect(2, 10, 4, 2, 't'); g.rect(2, 10, 2, 2, 'l');           // patas de atras estiradas (cercana)
    g.rect(15, 11, 5, 2, 'd'); g.rect(18, 11, 2, 2, 'l');         // patas de adelante estiradas (lejana)
    g.rect(14, 10, 5, 2, 't'); g.rect(17, 10, 2, 2, 'l');         // patas de adelante estiradas (cercana)
  } else {
    g.rect(5, 11, 2, 2, 'd'); g.rect(10, 11, 2, 2, 'd');
    g.rect(7, 11, 2, 2, 't'); g.rect(13, 11, 2, 2, 't');
    g.rect(5, 13, 2, 1, 'l'); g.rect(7, 13, 2, 1, 'l'); g.rect(10, 13, 2, 1, 'l'); g.rect(13, 13, 2, 1, 'l');
  }
  return g;
}

function sitBase(g) {
  g.rect(8, 6, 6, 1, 'b'); g.rect(6, 7, 10, 6, 'b'); g.rect(5, 13, 12, 1, 'b');
  g.rect(12, 7, 4, 7, 'l');
  g.over(8, 7, 2, 4, '1'); g.over(5, 12, 3, 1, '2');
  for (const x of [7, 10]) g.over(x, 8, 1, 3, 's');
  g.over(5, 9, 3, 2, 't');
  g.rect(5, 11, 3, 3, 'd');
  g.rect(12, 11, 2, 3, 'l');
}

function sit(f) {
  const g = makeGrid();
  tail(g, f ? [[1, 13, 4, 1], [0, 11, 2, 3], [0, 10, 2, 1]] : [[1, 13, 4, 1], [0, 12, 2, 2], [0, 12, 2, 1]]);
  sitBase(g);
  head(g, 8, 0);
  return g;
}

function groom(f) {
  const g = makeGrid();
  tail(g, [[1, 13, 4, 1], [0, 12, 2, 2], [0, 12, 2, 1]]);
  sitBase(g);
  head(g, 8, f ? 1 : 0, { closed: true });
  g.rect(f ? 13 : 12, f ? 6 : 7, 2, 3, 'l');
  g.rect(f ? 13 : 12, f ? 6 : 7, 2, 1, 'n');
  return g;
}

function scratch(f) {
  const g = makeGrid();
  tail(g, [[1, 13, 4, 1], [0, 12, 2, 2], [0, 12, 2, 1]]);
  sitBase(g);
  head(g, 8, 0, { closed: true });
  const y = f ? 4 : 5;
  g.rect(10, y + 1, 2, 4, 't');
  g.rect(10, y, 2, 1, 'l');
  return g;
}

function yawn(f) {
  const g = makeGrid();
  tail(g, [[1, 13, 4, 1], [0, 12, 2, 2], [0, 12, 2, 1]]);
  sitBase(g);
  head(g, 8, 0, { closed: true, mouth: f ? 2 : 1 });
  return g;
}

// Se estira: patas de adelante estiradas, cola parada, trasero arriba.
function stretch(f) {
  const g = makeGrid();
  tail(g, [[1, 4 + f, 2, 4], [0, 1 + f, 2, 3], [0, 0 + f, 2, 1]]);
  g.rect(2, 4, 7, 1, 'b'); g.rect(1, 5, 11, 2, 'b'); g.rect(2, 7, 12, 1, 'b'); g.rect(5, 8, 10, 1, 'b');
  g.rect(3, 7, 9, 1, 'l');
  g.over(1, 5, 4, 2, '1'); g.over(5, 5, 2, 2, '2'); g.over(9, 5, 2, 2, '2');
  for (const x of [4, 8, 11]) g.over(x, 4, 1, 3, 's');
  g.over(1, 5, 2, 2, 't');
  g.rect(1, 5, 3, 2, 'd');
  head(g, 13, 5 + f, { closed: f === 1 });
  g.rect(14, 12, 8, 2, 't'); g.rect(19, 12, 3, 2, 'l');
  g.rect(2, 9, 2, 4, 'd'); g.rect(4, 9, 2, 4, 't'); g.rect(2, 13, 4, 1, 'l');
  return g;
}

// Se agacha a cazar: cuerpo pegado al suelo y el trasero se menea.
function crouch(f) {
  const g = makeGrid();
  const w = [0, 1, -1][f];
  tail(g, [[0, 11 - (f === 1 ? 1 : 0), 4, 2]]);
  g.rect(5 + w, 8, 9, 1, 'b'); g.rect(3 + w, 9, 13, 3, 'b'); g.rect(4 + w, 12, 12, 1, 'b');
  g.rect(5 + w, 12, 9, 1, 'l');
  g.over(3 + w, 9, 4, 3, '1'); g.over(8 + w, 9, 2, 3, '2');
  for (const x of [8, 11]) g.over(x + w, 8, 1, 4, 's');
  g.over(3 + w, 9, 2, 2, 't');
  g.rect(3 + w, 11, 3, 2, 'd');
  head(g, 13, 4);
  g.rect(15, 13, 3, 1, 'l'); g.rect(19, 12, 1, 1, 'l');
  return g;
}

// Hecho un bollo dormido (el pecho sube y baja).
function sleep(f) {
  const g = makeGrid();
  const up = f ? 1 : 0;
  g.rect(3, 9 - up, 14, 1, 'b'); g.rect(1, 10 - up, 18, 4 + up, 'b');
  g.rect(3, 13, 14, 1, 'l');
  g.over(1, 10 - up, 4, 4, '1'); g.over(9, 9 - up, 2, 5, '2');
  for (const x of [6, 12, 15]) g.over(x, 9 - up, 1, 3 + up, 's');
  tail(g, [[0, 12, 5, 2]]);
  g.rect(0, 13, 6, 1, 'd');
  head(g, 12, 6, { closed: true });
  g.rect(11, 12, 3, 2, 'l');
  return g;
}

// Hecho una bolita con la cola alrededor.
function ovillo(f) {
  const g = makeGrid();
  g.shift(0, f ? -1 : 0);
  g.rect(8, 6, 8, 1, 'b'); g.rect(5, 7, 14, 6, 'b'); g.rect(6, 13, 12, 1, 'b');
  g.over(5, 7, 3, 4, '1'); g.over(11, 8, 2, 4, '2');
  for (const x of [8, 10, 14]) g.over(x, 7, 1, 4, 's');
  head(g, 10, 5, { closed: true });
  g.shift(0, 0);
  g.rect(2, 12, 16, 2, 't'); g.rect(2, 12, 2, 2, 'd');
  return g;
}

// Gato crema sentado con la cola esponjosa parada (el que esta sobre el boton Jugar).
function sitUp(f) {
  const g = makeGrid();
  const lean = f ? 1 : 0;
  g.rect(1, 13, 4, 1, 't'); g.rect(1, 6, 3, 7, 't'); g.rect(1 + lean, 3, 3, 3, 't');
  g.rect(1 + lean, 1, 3, 2, 'd'); g.rect(2 + lean, 0, 1, 1, 'd');
  g.rect(8, 6, 6, 1, 'b'); g.rect(6, 7, 10, 6, 'b'); g.rect(5, 13, 12, 1, 'b');
  g.rect(12, 8, 4, 6, 'l'); g.rect(12, 11, 2, 3, 'l');
  g.rect(6, 10, 3, 3, 'd'); g.rect(5, 13, 3, 1, 'd');
  head(g, 8, 0);
  return g;
}

// nombre de pose -> [funcion, cuadros, segundos por vuelta]
const POSES = {
  walk: [walk, 4, 0.64], run: [run, 4, 0.34], sit: [sit, 2, 1.5], groom: [groom, 2, 0.55], scratch: [scratch, 2, 0.3],
  yawn: [yawn, 2, 1.2], stretch: [stretch, 2, 1.4], crouch: [crouch, 3, 0.6], sleep: [sleep, 2, 2.6], ovillo: [ovillo, 2, 3],
  situp: [sitUp, 2, 1.3],
};

// ---------------------------------------------------------------- mascaras

// Cuadros -> una mascara por capa. El contorno se saca de las celdas vecinas.
function sheetFor(maker, frames) {
  const paths = Object.fromEntries(LAYERS.map(([key]) => [key, []]));
  const SW = W + 2, SH = H + 2;
  for (let f = 0; f < frames; f++) {
    const g = maker(f);
    const full = Array.from({ length: SH }, () => Array(SW).fill(null));
    g.cells.forEach((row, j) => row.forEach((key, i) => { if (key) full[j + 1][i + 1] = key; }));
    const keyAt = (x, y) => {
      if (full[y][x]) return full[y][x];
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => full[y + dy] && full[y + dy][x + dx]);
      return near ? 'o' : null;
    };
    for (let j = 0; j < SH; j++) {
      let i = 0;
      while (i < SW) {
        const key = keyAt(i, j);
        if (!key) { i += 1; continue; }
        let run = 1;
        while (i + run < SW && keyAt(i + run, j) === key) run += 1;
        paths[key].push('M' + (f * SW + i) + ' ' + j + 'h' + run + 'v1h-' + run + 'z');
        i += run;
      }
    }
  }
  const out = {};
  for (const [key, d] of Object.entries(paths)) {
    if (!d.length) continue;
    out[key] = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW * frames * PX}" height="${SH * PX}" viewBox="0 0 ${SW * frames} ${SH}" shape-rendering="crispEdges"><path d="${d.join('')}"/></svg>`;
  }
  return out;
}

const enc = (svg) => 'url("data:image/svg+xml,' + svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'").replace(/[ \t\r\n]+/g, ' ') + '")';

let css = '/* GATOS-INICIO (lo escribe tools/generar_gatos.js; no lo edites a mano) */\n';

// colores de los pelajes
css += '.gato, .gato-sentado { --st: var(--body); --pt: var(--body); --mk: var(--body); --p1: var(--body); --p2: var(--body); }\n';
for (const [name, c] of Object.entries(COATS)) {
  css += `.pelo-${name} { ` + Object.entries(c).map(([k, v]) => `--${k}: ${v};`).join(' ') + ' }\n';
}
// capas
css += '.sprite { position: relative; }\n';
css += '.sprite i { position: absolute; inset: 0; background-color: var(--c); mask-repeat: no-repeat; }\n';
css += LAYERS.map(([key, color]) => `.l-${key} { --c: ${color}; }`).join(' ') + '\n';
// una vuelta de cuadros por cantidad de cuadros
for (const n of [2, 3, 4]) css += `@keyframes mascara${n} { to { mask-position: calc(var(--gato-w) * -${n}) 0; } }\n`;
for (const [pose, [maker, frames, seconds]] of Object.entries(POSES)) {
  css += `.st-${pose} .sprite i { mask-size: calc(var(--gato-w) * ${frames}) 100%; animation: mascara${frames} ${seconds}s steps(${frames}) infinite; }\n`;
  const sheet = sheetFor(maker, frames);
  for (const [key] of LAYERS) {
    // una capa sin celdas en esta pose (por ejemplo el iris con los ojos cerrados) queda invisible
    css += sheet[key] ? `.st-${pose} .l-${key} { mask-image: ${enc(sheet[key])}; }\n` : `.st-${pose} .l-${key} { mask-image: linear-gradient(#0000, #0000); }\n`;
  }
}

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
css += `:root { --gato-w: ${(W + 2) * PX}px; --gato-h: ${(H + 2) * PX}px; }\n/* GATOS-FIN */`;

let file = fs.readFileSync(CSS, 'utf8');
if (file.includes('/* GATOS-INICIO')) file = file.replace(/\/\* GATOS-INICIO[\s\S]*?\/\* GATOS-FIN \*\//, () => css);
else file += '\n' + css + '\n';
fs.writeFileSync(CSS, file);
console.log('gatitos escritos en style.css (' + css.length + ' caracteres)');
