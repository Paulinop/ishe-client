'use strict';
// Formato de las actualizaciones de Ishe Client.
//
// Una actualizacion son dos archivos:
//   - el "aviso" (ishe-client-actualizacion.json): que version es, que archivos
//     trae y el SHA-256 de cada uno, firmado con la clave del creador (Ed25519);
//   - el "paquete" (ishe-client-app-<version>.bin): los archivos del client,
//     comprimidos.
// Nada se usa si la firma no corresponde a la clave publica que va dentro de la
// aplicacion instalada, o si un archivo no coincide con su SHA-256.
//
// Solo usa modulos incluidos en Node.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FORMAT = 1;
const MANIFEST_NAME = 'ishe-client-actualizacion.json';
const VERSION_PATTERN = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
// Lo unico que puede venir en un paquete: los archivos del client, nunca el arranque.
const FILE_PATTERN = /^(main\.js|preload\.js|package\.json|noticias\.json|tema\.json|core\/[A-Za-z0-9_-]+\.js|renderer\/[A-Za-z0-9_-]+\.(html|css|js)|assets\/[A-Za-z0-9_-]+\.(png|ico|icns))$/;
const EXTRA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,120}\.jar$/;
const REQUIRED_FILES = ['main.js', 'preload.js', 'package.json', 'renderer/index.html'];
const LIMITS = { manifestBytes: 256 * 1024, bundleBytes: 8 * 1024 * 1024, unpackedBytes: 24 * 1024 * 1024, extraBytes: 40 * 1024 * 1024, files: 200 };

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function validVersion(version) {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

/** -1, 0 o 1. Solo para versiones validas "a.b.c". */
function compareVersions(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) < (right[i] || 0) ? -1 : 1;
  }
  return 0;
}

function bundleName(version) {
  return 'ishe-client-app-' + version + '.bin';
}

// ---- paquete ---------------------------------------------------------------

/** files: Map<nombre, Buffer> -> Buffer comprimido. */
function pack(files) {
  const archivos = {};
  for (const name of Array.from(files.keys()).sort()) {
    if (!FILE_PATTERN.test(name)) throw new Error('archivo no permitido en una actualización: ' + name);
    archivos[name] = files.get(name).toString('base64');
  }
  return zlib.gzipSync(Buffer.from(JSON.stringify({ formato: FORMAT, archivos })), { level: 9 });
}

/** Buffer comprimido -> Map<nombre, Buffer>. Rechaza nombres raros y tamanos excesivos. */
function unpack(buffer) {
  if (buffer.length > LIMITS.bundleBytes) throw new Error('el paquete es demasiado grande');
  let data;
  try {
    data = JSON.parse(zlib.gunzipSync(buffer, { maxOutputLength: LIMITS.unpackedBytes * 2 }).toString('utf8'));
  } catch (_) {
    throw new Error('el paquete está dañado');
  }
  if (!data || data.formato !== FORMAT || !data.archivos || typeof data.archivos !== 'object') throw new Error('el paquete tiene un formato desconocido');
  const names = Object.keys(data.archivos);
  if (names.length === 0 || names.length > LIMITS.files) throw new Error('el paquete tiene un número de archivos inesperado');
  const files = new Map();
  let total = 0;
  for (const name of names) {
    if (!FILE_PATTERN.test(name)) throw new Error('el paquete trae un archivo no permitido: ' + String(name).slice(0, 60));
    if (typeof data.archivos[name] !== 'string') throw new Error('el paquete está dañado');
    const body = Buffer.from(data.archivos[name], 'base64');
    total += body.length;
    if (total > LIMITS.unpackedBytes) throw new Error('el paquete es demasiado grande');
    files.set(name, body);
  }
  return files;
}

// ---- aviso firmado ----------------------------------------------------------

/** Firma el aviso. Devuelve el texto del archivo ishe-client-actualizacion.json. */
function sign(manifest, privateKeyPem) {
  const body = Buffer.from(JSON.stringify(manifest));
  const signature = crypto.sign(null, body, crypto.createPrivateKey(privateKeyPem));
  return JSON.stringify({ aviso: body.toString('base64'), firma: signature.toString('base64') }, null, 2) + '\n';
}

function checkManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.formato !== FORMAT) return false;
  if (!validVersion(manifest.version)) return false;
  const bundle = manifest.paquete;
  if (!bundle || bundle.archivo !== bundleName(manifest.version) || !/^[0-9a-f]{64}$/.test(String(bundle.sha256))) return false;
  if (!Number.isInteger(bundle.tamano) || bundle.tamano <= 0 || bundle.tamano > LIMITS.bundleBytes) return false;
  if (!manifest.archivos || typeof manifest.archivos !== 'object') return false;
  const names = Object.keys(manifest.archivos);
  if (names.length === 0 || names.length > LIMITS.files) return false;
  if (!names.every((name) => FILE_PATTERN.test(name) && /^[0-9a-f]{64}$/.test(String(manifest.archivos[name])))) return false;
  if (!REQUIRED_FILES.every((name) => names.includes(name))) return false;
  if (!Array.isArray(manifest.extras) || manifest.extras.length > 8) return false;
  for (const extra of manifest.extras) {
    if (!extra || !EXTRA_PATTERN.test(String(extra.archivo)) || !/^[0-9a-f]{64}$/.test(String(extra.sha256))) return false;
    if (!Number.isInteger(extra.tamano) || extra.tamano <= 0 || extra.tamano > LIMITS.extraBytes) return false;
  }
  if (manifest.notas !== undefined && (typeof manifest.notas !== 'string' || manifest.notas.length > 600)) return false;
  if (manifest.motorMinimo !== undefined && !(Number.isInteger(manifest.motorMinimo) && manifest.motorMinimo > 0)) return false;
  return true;
}

/** Texto del aviso -> aviso comprobado, o null si la firma o el contenido no valen. */
function verify(envelopeText, publicKeyPem) {
  try {
    if (typeof envelopeText !== 'string' || envelopeText.length > LIMITS.manifestBytes * 2) return null;
    const envelope = JSON.parse(envelopeText.replace(/^﻿/, ''));
    if (!envelope || typeof envelope.aviso !== 'string' || typeof envelope.firma !== 'string') return null;
    const body = Buffer.from(envelope.aviso, 'base64');
    const signature = Buffer.from(envelope.firma, 'base64');
    if (body.length === 0 || body.length > LIMITS.manifestBytes || signature.length !== 64) return null;
    if (!crypto.verify(null, body, crypto.createPublicKey(publicKeyPem), signature)) return null;
    const manifest = JSON.parse(body.toString('utf8'));
    return checkManifest(manifest) ? manifest : null;
  } catch (_) {
    return null;
  }
}

/**
 * Comprueba una version ya instalada en disco: aviso firmado + cada archivo con su SHA-256.
 * Devuelve el aviso, o null si algo no coincide.
 */
function verifyDir(dir, version, publicKeyPem) {
  try {
    const manifest = verify(fs.readFileSync(path.join(dir, MANIFEST_NAME), 'utf8'), publicKeyPem);
    if (!manifest || manifest.version !== version) return null;
    for (const [name, hash] of Object.entries(manifest.archivos)) {
      if (sha256(fs.readFileSync(path.join(dir, name))) !== hash) return null;
    }
    // Los extras (e4steam) solo estan en la carpeta si cambiaron respecto a lo instalado.
    for (const extra of manifest.extras) {
      const file = path.join(dir, 'extras', extra.archivo);
      if (fs.existsSync(file) && sha256(fs.readFileSync(file)) !== extra.sha256) return null;
    }
    return manifest;
  } catch (_) {
    return null;
  }
}

/** Clave privada (PEM) -> su clave publica en PEM, o '' si no es una clave Ed25519 valida. */
function publicKeyOf(privateKeyPem) {
  try {
    const key = crypto.createPrivateKey(privateKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') return '';
    return crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
  } catch (_) {
    return '';
  }
}

function sameKey(pemA, pemB) {
  const clean = (pem) => String(pem).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return clean(pemA) !== '' && clean(pemA) === clean(pemB);
}

module.exports = {
  FORMAT, MANIFEST_NAME, VERSION_PATTERN, FILE_PATTERN, EXTRA_PATTERN, REQUIRED_FILES, LIMITS,
  sha256, validVersion, compareVersions, bundleName, pack, unpack, sign, verify, verifyDir, checkManifest, publicKeyOf, sameKey,
};
