'use strict';
// Actualiza el bloque MINA-INICIO .. MINA-FIN de style.css con marcadores ligeros
// (el fondo animado real usa assets/mc-hero/* estilo minecraft.net/es-es/about-minecraft).
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || 'app');
const cssFile = path.join(appDir, 'renderer', 'style.css');
const emptySvg = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 16 16\'%3E%3C/svg%3E")';

const block = [
  '/* MINA-INICIO (lo escribe tools/generar_mina.js; no lo edites a mano) */',
  '.piedra { background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' fill=\'%23171615\'/%3E%3C/svg%3E"); background-size: 64px 64px; }',
  '.mina-ores { background-image: ' + emptySvg + '; }',
  '.mina-brillos.a { background-image: ' + emptySvg + '; }',
  '.mina-brillos.b { background-image: ' + emptySvg + '; }',
  '.antorcha { background: ' + emptySvg + ' center / contain no-repeat; }',
  '.rieles { background-image: ' + emptySvg + '; background-size: 16px 16px; }',
  '.vagoneta { background: ' + emptySvg + ' center / contain no-repeat; }',
  '.hero-stars { background-image: ' + emptySvg + '; }',
  '.hero-hills { background-image: ' + emptySvg + '; }',
  '/* MINA-FIN */'
].join('\n');

const css = fs.readFileSync(cssFile, 'utf8');
const start = css.indexOf('/* MINA-INICIO');
const end = css.indexOf('/* MINA-FIN */');
if (start === -1 || end === -1) throw new Error('No se encontro MINA-INICIO / MINA-FIN en style.css');
const updated = css.slice(0, start) + block + css.slice(end + '/* MINA-FIN */'.length);
fs.writeFileSync(cssFile, updated, 'utf8');
console.log('MINA-INICIO .. MINA-FIN actualizado en', cssFile);
