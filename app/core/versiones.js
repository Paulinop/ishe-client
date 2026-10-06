'use strict';
// Registro de la version del client que esta en uso (carpeta "actualizaciones"
// dentro de los datos de la aplicacion).
//
//   estado.json = { version, confirmada, intentos, anterior, malas: [] }
//   version     version descargada que debe usarse en el siguiente arranque ('' = la instalada)
//   confirmada  ya arranco bien al menos una vez
//   intentos    arranques sin confirmar (para volver atras si no arranca)
//   anterior    version descargada que funcionaba antes de `version` (a ella se vuelve si falla)
//   malas       versiones que no arrancaron: no se vuelven a descargar
//   fallo       version que acaba de fallar, para avisarlo una vez en la ventana

const fs = require('fs');
const path = require('path');
const paquete = require('./paquete');

const STATE_NAME = 'estado.json';

function emptyState() {
  return { version: '', confirmada: false, intentos: 0, anterior: '', malas: [], fallo: '' };
}

function readState(root) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, STATE_NAME), 'utf8'));
    return {
      version: paquete.validVersion(data.version) ? data.version : '',
      confirmada: data.confirmada === true,
      intentos: Number.isInteger(data.intentos) && data.intentos >= 0 ? data.intentos : 0,
      anterior: paquete.validVersion(data.anterior) ? data.anterior : '',
      malas: Array.isArray(data.malas) ? data.malas.filter(paquete.validVersion).slice(-20) : [],
      fallo: paquete.validVersion(data.fallo) ? data.fallo : '',
    };
  } catch (_) {
    return emptyState();
  }
}

function writeState(root, state) {
  fs.mkdirSync(root, { recursive: true });
  const temp = path.join(root, STATE_NAME + '.nuevo');
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, path.join(root, STATE_NAME));
}

/** Borra las carpetas de versiones que ya no se usan (todas menos las de `keep`). */
function cleanup(root, keep) {
  const kept = (Array.isArray(keep) ? keep : [keep]).filter(Boolean);
  let names = [];
  try { names = fs.readdirSync(root); } catch (_) { return; }
  for (const name of names) {
    if (name === STATE_NAME || kept.includes(name)) continue;
    const base = name.replace(/\.descargando$/, '');
    if (!paquete.validVersion(base)) continue; // solo carpetas que creo el actualizador
    try { fs.rmSync(path.join(root, name), { recursive: true, force: true }); } catch (_) { /* se intentara otro dia */ }
  }
}

module.exports = { STATE_NAME, emptyState, readState, writeState, cleanup };
