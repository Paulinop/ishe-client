// Arma dist/reshem-imagenes.bin con las imagenes de app/renderer/assets y escribe app/core/imagenes-datos.js (su SHA-256 y la lista).
// Lo corre publicar.js antes de armar la actualizacion: el .bin se sube a la release y los datos viajan dentro de la actualizacion firmada.
const fs = require('fs');
const path = require('path');
const imagenes = require('../app/core/imagenes.js');

const RAIZ = path.join(__dirname, '..');
const ASSETS = path.join(RAIZ, 'app', 'renderer', 'assets');
const SALIDA = path.join(RAIZ, 'dist', 'reshem-imagenes.bin');

function recorrer(dir, prefijo, lista) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) recorrer(path.join(dir, e.name), prefijo + e.name + '/', lista);
    else if (imagenes.NAME_PATTERN.test(prefijo + e.name)) lista.push(prefijo + e.name);
  }
}

const nombres = [];
recorrer(ASSETS, '', nombres);
nombres.sort();
const files = new Map(nombres.map((n) => [n, fs.readFileSync(path.join(ASSETS, n))]));
const bin = imagenes.pack(files);
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, bin);
const datos = { archivo: 'reshem-imagenes.bin', sha256: imagenes.sha256(bin), tamano: bin.length, archivos: nombres };
fs.writeFileSync(path.join(RAIZ, 'app', 'core', 'imagenes-datos.js'),
  "'use strict';\n// ESCRITO por tools/imagenes.js al publicar: no editar a mano.\nmodule.exports = " + JSON.stringify(datos, null, 2) + ';\n');
console.log('imagenes: ' + nombres.length + ' archivos, ' + Math.round(bin.length / 1024) + ' KB, sha256 ' + datos.sha256.slice(0, 12));
