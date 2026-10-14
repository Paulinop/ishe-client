'use strict';
// "Actualizar" cuando la nueva version necesita el instalador (la ventana trae archivos que una actualizacion normal no puede llevar):
// baja el instalador de la release de GitHub, comprueba su SHA-256 contra el aviso FIRMADO y lo deja listo para abrirlo.
// Solo usa modulos incluidos en Node.

const fs = require('fs');
const os = require('os');
const path = require('path');
const paquete = require('./paquete');

const SOURCE = 'https://github.com/Paulinop/ishe-client/releases/latest/download';

class InstallerError extends Error {}

/**
 * info: { archivo, sha256, tamano } (del aviso firmado). options: { base?, allowLoopback?, dir? }.
 * Devuelve la ruta del instalador ya comprobado.
 */
async function download(info, options) {
  const opts = options || {};
  if (!info || !/^[A-Za-z0-9._-]{1,80}\.exe$/.test(String(info.archivo)) || !/^[0-9a-f]{64}$/.test(String(info.sha256)) || !Number.isInteger(info.tamano)) {
    throw new InstallerError('el aviso no trae los datos del instalador');
  }
  const base = opts.base || SOURCE;
  const url = new URL(base + '/' + encodeURIComponent(info.archivo));
  const github = url.protocol === 'https:' && (url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'));
  const loopback = Boolean(opts.allowLoopback) && url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if (!github && !loopback) throw new InstallerError('descarga desde un sitio no permitido: ' + url.hostname);

  let current = url.toString();
  let response;
  for (let hop = 0; hop < 6; hop++) {
    const parsed = new URL(current);
    const ok = (parsed.protocol === 'https:' && (parsed.hostname === 'github.com' || parsed.hostname.endsWith('.githubusercontent.com')))
      || (Boolean(opts.allowLoopback) && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1');
    if (!ok) throw new InstallerError('descarga desde un sitio no permitido: ' + parsed.hostname);
    try {
      response = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'IsheClient-Launcher' }, signal: AbortSignal.timeout(600000) });
    } catch (_) {
      throw new InstallerError('no hubo conexión con GitHub');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current).toString();
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw new InstallerError('GitHub respondió ' + (response ? response.status : 'nada'));
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > info.tamano) {
      await reader.cancel();
      throw new InstallerError('el instalador es más grande de lo anunciado');
    }
    chunks.push(Buffer.from(value));
  }
  const body = Buffer.concat(chunks);
  if (body.length !== info.tamano || paquete.sha256(body) !== info.sha256) {
    throw new InstallerError('el instalador descargado no coincide con su código de verificación');
  }
  const dir = fs.mkdtempSync(path.join(opts.dir || os.tmpdir(), 'reshem-instalador-'));
  const file = path.join(dir, info.archivo);
  fs.writeFileSync(file, body);
  return file;
}

module.exports = { download, InstallerError, SOURCE };
