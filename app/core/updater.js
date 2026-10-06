'use strict';
// Actualizador de Ishe Client.
//
// Busca en la pagina de versiones del proyecto en GitHub un aviso firmado; si
// anuncia una version mas nueva, descarga solo los archivos del client (no el
// motor ni el juego), los comprueba y los deja listos para el siguiente arranque.
//
// Solo usa modulos incluidos en Node.

const fs = require('fs');
const path = require('path');
const paquete = require('./paquete');
const versiones = require('./versiones');

const SOURCE = 'https://github.com/Paulinop/ishe-client/releases/latest/download';
const USER_AGENT = 'IsheClient-Launcher';

const REASONS = { NETWORK: 'network', INVALID: 'invalid', DISK: 'disk' };

class UpdateError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.reason = reason;
  }
}

function checkUrl(url, allowLoopback) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new UpdateError(REASONS.INVALID, 'dirección de descarga no válida'); }
  const host = parsed.hostname;
  if (parsed.protocol === 'https:' && (host === 'github.com' || host.endsWith('.githubusercontent.com'))) return;
  if (allowLoopback && parsed.protocol === 'http:' && host === '127.0.0.1') return;
  throw new UpdateError(REASONS.INVALID, 'descarga desde un sitio no permitido: ' + host);
}

/** Devuelve { status, body }. Sigue redirecciones solo dentro de GitHub. */
async function get(url, options, maxBytes) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    checkUrl(current, options.allowLoopback);
    let response;
    try {
      response = await fetch(current, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' },
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs || 300000),
      });
    } catch (_) {
      throw new UpdateError(REASONS.NETWORK, 'no hubo respuesta del servidor');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current).toString();
      continue;
    }
    if (!response.ok) return { status: response.status, body: Buffer.alloc(0) };
    // Se lee por trozos y se corta en cuanto pasa del tamano maximo esperado.
    const chunks = [];
    let total = 0;
    let tooBig = false;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          tooBig = true;
          await reader.cancel();
          break;
        }
        chunks.push(Buffer.from(value));
      }
    } catch (_) {
      throw new UpdateError(REASONS.NETWORK, 'la descarga se cortó');
    }
    if (tooBig) throw new UpdateError(REASONS.INVALID, 'la descarga es más grande de lo esperado');
    return { status: 200, body: Buffer.concat(chunks) };
  }
  throw new UpdateError(REASONS.INVALID, 'demasiadas redirecciones');
}

/**
 * Mira si hay una version mas nueva.
 * options: { base?, publicKey, currentVersion, updatesRoot, engineMajor, allowLoopback? }
 * Devuelve { status: 'none' }                         no hay nada nuevo (o aun no se publico ninguna version)
 *          { status: 'ready', version }               ya estaba descargada: falta reiniciar
 *          { status: 'needs-installer', version }     hay una, pero pide un motor mas nuevo
 *          { status: 'available', version, notes, manifest, envelope }
 */
async function check(options) {
  const base = options.base || SOURCE;
  const reply = await get(base + '/' + paquete.MANIFEST_NAME, options, paquete.LIMITS.manifestBytes * 2);
  if (reply.status === 404) return { status: 'none' };
  if (reply.status !== 200) throw new UpdateError(REASONS.NETWORK, 'el servidor respondió ' + reply.status);
  const envelope = reply.body.toString('utf8');
  const manifest = paquete.verify(envelope, options.publicKey);
  if (!manifest) throw new UpdateError(REASONS.INVALID, 'el aviso de actualización no está firmado por el creador de Ishe Client');
  if (paquete.compareVersions(manifest.version, options.currentVersion) <= 0) return { status: 'none' };
  const state = versiones.readState(options.updatesRoot);
  if (state.malas.includes(manifest.version)) return { status: 'none' };
  if (manifest.motorMinimo && manifest.motorMinimo > options.engineMajor) return { status: 'needs-installer', version: manifest.version };
  if (state.version === manifest.version && paquete.verifyDir(path.join(options.updatesRoot, manifest.version), manifest.version, options.publicKey)) {
    return { status: 'ready', version: manifest.version, notes: manifest.notas || '' };
  }
  return { status: 'available', version: manifest.version, notes: manifest.notas || '', manifest, envelope };
}

/** En Windows un antivirus puede tener la carpeta ocupada un instante: se reintenta. */
async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}

function findExtra(dirs, extra) {
  for (const dir of dirs) {
    const file = path.join(dir, extra.archivo);
    try {
      if (fs.statSync(file).isFile() && paquete.sha256(fs.readFileSync(file)) === extra.sha256) return file;
    } catch (_) { /* no esta ahi */ }
  }
  return '';
}

/**
 * Descarga y deja instalada (para el siguiente arranque) la version del aviso.
 * options: { base?, publicKey, updatesRoot, manifest, envelope, bundledExtrasDir, activeExtrasDir, allowLoopback? }
 */
async function download(options) {
  const base = options.base || SOURCE;
  const { manifest, updatesRoot } = options;
  const bundle = await get(base + '/' + manifest.paquete.archivo, options, paquete.LIMITS.bundleBytes);
  if (bundle.status !== 200) throw new UpdateError(REASONS.NETWORK, 'no se pudo descargar la actualización (' + bundle.status + ')');
  if (bundle.body.length !== manifest.paquete.tamano || paquete.sha256(bundle.body) !== manifest.paquete.sha256) {
    throw new UpdateError(REASONS.INVALID, 'la actualización descargada no coincide con su código de verificación');
  }
  let files;
  try {
    files = paquete.unpack(bundle.body);
  } catch (error) {
    throw new UpdateError(REASONS.INVALID, error.message);
  }
  const wanted = Object.keys(manifest.archivos).sort();
  if (JSON.stringify(Array.from(files.keys()).sort()) !== JSON.stringify(wanted)) {
    throw new UpdateError(REASONS.INVALID, 'la actualización no trae los archivos anunciados');
  }
  for (const name of wanted) {
    if (paquete.sha256(files.get(name)) !== manifest.archivos[name]) throw new UpdateError(REASONS.INVALID, 'un archivo de la actualización no coincide con su código de verificación');
  }
  let inner = '';
  try { inner = JSON.parse(files.get('package.json').toString('utf8')).version; } catch (_) { inner = ''; }
  if (inner !== manifest.version) throw new UpdateError(REASONS.INVALID, 'la actualización no corresponde a la versión anunciada');

  // e4steam: solo se baja si es distinto del que ya vino con el instalador.
  const extras = [];
  for (const extra of manifest.extras) {
    if (findExtra([options.bundledExtrasDir], extra)) continue;
    const local = findExtra([options.activeExtrasDir], extra);
    if (local) {
      extras.push({ name: extra.archivo, body: fs.readFileSync(local) });
      continue;
    }
    const reply = await get(base + '/' + encodeURIComponent(extra.archivo), options, paquete.LIMITS.extraBytes);
    if (reply.status !== 200) throw new UpdateError(REASONS.NETWORK, 'no se pudo descargar ' + extra.archivo + ' (' + reply.status + ')');
    if (reply.body.length !== extra.tamano || paquete.sha256(reply.body) !== extra.sha256) {
      throw new UpdateError(REASONS.INVALID, extra.archivo + ' no coincide con su código de verificación');
    }
    extras.push({ name: extra.archivo, body: reply.body });
  }

  const finalDir = path.join(updatesRoot, manifest.version);
  const temp = finalDir + '.descargando';
  try {
    fs.rmSync(temp, { recursive: true, force: true });
    for (const name of wanted) {
      const target = path.join(temp, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, files.get(name));
    }
    for (const extra of extras) {
      fs.mkdirSync(path.join(temp, 'extras'), { recursive: true });
      fs.writeFileSync(path.join(temp, 'extras', extra.name), extra.body);
    }
    fs.writeFileSync(path.join(temp, paquete.MANIFEST_NAME), options.envelope);
    if (!paquete.verifyDir(temp, manifest.version, options.publicKey)) throw new Error('la copia en disco no coincide');
    fs.rmSync(finalDir, { recursive: true, force: true });
    await renameWithRetry(temp, finalDir);
    const state = versiones.readState(updatesRoot);
    // La version descargada que ya funcionaba se conserva por si la nueva no arranca.
    if (state.version && state.confirmada && state.version !== manifest.version) state.anterior = state.version;
    state.version = manifest.version;
    state.confirmada = false;
    state.intentos = 0;
    versiones.writeState(updatesRoot, state);
  } catch (error) {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) { /* nada que limpiar */ }
    throw new UpdateError(REASONS.DISK, 'no se pudo guardar la actualización: ' + error.message);
  }
  return { version: manifest.version, dir: finalDir };
}

module.exports = { SOURCE, REASONS, UpdateError, check, download, checkUrl };
