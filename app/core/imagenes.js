'use strict';
// Las imagenes de la ventana (iconos del menu, portada, objetos) no caben en una actualizacion normal.
// Si una actualizacion llega sin ellas (el launcher se instalo con un instalador viejo), se bajan solas de la release de GitHub:
// el SHA-256 viene en core/imagenes-datos.js, que SI viaja dentro de la actualizacion firmada.
// Solo usa modulos incluidos en Node.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SOURCE = 'https://github.com/Paulinop/ishe-client/releases/latest/download';
const NAME_PATTERN = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(png|jpg|gif|webp)$/;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Archivos (nombres relativos a renderer/assets) que faltan en esa carpeta. */
function missing(assetsDir, datos) {
  return (datos.archivos || []).filter((name) => !fs.existsSync(path.join(assetsDir, name)));
}

/** Bundle { 'items/x.png': Buffer } -> Buffer comprimido. */
function pack(files) {
  const archivos = {};
  for (const name of Array.from(files.keys()).sort()) {
    if (!NAME_PATTERN.test(name) || name.includes('..')) throw new Error('imagen no permitida: ' + name);
    archivos[name] = files.get(name).toString('base64');
  }
  return zlib.gzipSync(Buffer.from(JSON.stringify({ formato: 1, archivos })), { level: 9 });
}

function unpack(buffer, maxBytes) {
  const raw = zlib.gunzipSync(buffer, { maxOutputLength: maxBytes });
  const data = JSON.parse(raw.toString('utf8'));
  const files = new Map();
  for (const [name, b64] of Object.entries(data.archivos || {})) {
    if (!NAME_PATTERN.test(name) || name.includes('..')) throw new Error('imagen no permitida: ' + name);
    files.set(name, Buffer.from(b64, 'base64'));
  }
  return files;
}

function checkUrl(url, allowLoopback) {
  const parsed = new URL(url);
  const github = parsed.protocol === 'https:' && (parsed.hostname === 'github.com' || parsed.hostname.endsWith('.githubusercontent.com'));
  const loopback = Boolean(allowLoopback) && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
  if (!github && !loopback) throw new Error('descarga desde un sitio no permitido: ' + parsed.hostname);
}

/**
 * Si faltan imagenes, baja el paquete, lo comprueba y las escribe en assetsDir.
 * datos: { archivo, sha256, tamano, archivos: [...] }. Devuelve { descargado: boolean, faltaban: n }.
 */
async function ensure(assetsDir, datos, options) {
  const opts = options || {};
  const faltan = missing(assetsDir, datos);
  if (faltan.length === 0) return { descargado: false, faltaban: 0 };
  let current = (opts.base || SOURCE) + '/' + encodeURIComponent(datos.archivo);
  let response;
  for (let hop = 0; hop < 6; hop++) {
    checkUrl(current, opts.allowLoopback);
    response = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'IsheClient-Launcher' }, signal: AbortSignal.timeout(300000) });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current).toString();
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw new Error('GitHub respondió ' + (response ? response.status : 'nada'));
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length !== datos.tamano || sha256(body) !== datos.sha256) throw new Error('las imágenes descargadas no coinciden con su código de verificación');
  const files = unpack(body, 120 * 1024 * 1024);
  for (const [name, content] of files) {
    const target = path.join(assetsDir, name);
    if (!path.resolve(target).startsWith(path.resolve(assetsDir) + path.sep)) throw new Error('ruta inesperada');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return { descargado: true, faltaban: faltan.length };
}

module.exports = { ensure, missing, pack, unpack, sha256, SOURCE, NAME_PATTERN };
