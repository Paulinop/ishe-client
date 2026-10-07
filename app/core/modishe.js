'use strict';
// El mod Ishe (Nublado, Haku, el cajero...) tambien se actualiza solo.
//
// Cada vez que se pulsa Jugar se mira el aviso del mod en la release fija "mods" del proyecto en GitHub.
// El aviso va firmado con la misma clave que las actualizaciones del client (Ed25519). Si la firma o el
// SHA-256 del .jar no coinciden, no se usa nada. Solo usa modulos incluidos en Node.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://github.com/Paulinop/ishe-client/releases/download/mods';
const NOTICE_NAME = 'ishe-mod.json';
const PROJECT_KEY = 'ishe-mod';
const FORMAT = 1;
const FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,120}\.jar$/;
const LIMITS = { noticeBytes: 64 * 1024, jarBytes: 24 * 1024 * 1024 };
const USER_AGENT = 'IsheClient-Launcher';

class ModError extends Error {}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Firma el aviso del mod. Devuelve el texto del archivo ishe-mod.json. */
function sign(notice, privateKeyPem) {
  const body = Buffer.from(JSON.stringify(notice));
  const signature = crypto.sign(null, body, crypto.createPrivateKey(privateKeyPem));
  return JSON.stringify({ aviso: body.toString('base64'), firma: signature.toString('base64') }, null, 2) + '\n';
}

function checkNotice(notice, minecraft) {
  if (!notice || typeof notice !== 'object' || notice.formato !== FORMAT || notice.tipo !== 'mod') return 'el aviso del mod tiene un formato desconocido';
  if (typeof notice.version !== 'string' || !/^[0-9A-Za-z.+-]{1,40}$/.test(notice.version)) return 'el aviso del mod trae una versión rara';
  if (!FILE_PATTERN.test(String(notice.archivo)) || notice.archivo.includes('..')) return 'el aviso del mod trae un nombre de archivo no permitido';
  if (!/^[0-9a-f]{64}$/.test(String(notice.sha256))) return 'el aviso del mod no trae código de verificación';
  if (!Number.isInteger(notice.tamano) || notice.tamano <= 0 || notice.tamano > LIMITS.jarBytes) return 'el aviso del mod trae un tamaño no válido';
  if (notice.minecraft !== minecraft) return 'MC';   // no es un error: es para otra version del juego
  return '';
}

/** Texto del aviso -> aviso comprobado, o { otraVersion: true } si es para otra version del juego. Lanza ModError si no vale. */
function verify(text, publicKeyPem, minecraft) {
  let notice;
  try {
    if (typeof text !== 'string' || text.length > LIMITS.noticeBytes * 2) throw new Error('grande');
    const envelope = JSON.parse(text.replace(/^﻿/, ''));
    const body = Buffer.from(String(envelope.aviso), 'base64');
    const signature = Buffer.from(String(envelope.firma), 'base64');
    if (body.length === 0 || body.length > LIMITS.noticeBytes || signature.length !== 64) throw new Error('formato');
    if (!crypto.verify(null, body, crypto.createPublicKey(publicKeyPem), signature)) throw new Error('firma');
    notice = JSON.parse(body.toString('utf8'));
  } catch (_) {
    throw new ModError('el aviso del mod no está firmado por el creador de Ishe Client');
  }
  const problem = checkNotice(notice, minecraft);
  if (problem === 'MC') return { otraVersion: true, minecraft: notice.minecraft };
  if (problem) throw new ModError(problem);
  return notice;
}

function checkUrl(url, allowLoopback) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new ModError('dirección de descarga no válida'); }
  const host = parsed.hostname;
  if (parsed.protocol === 'https:' && (host === 'github.com' || host.endsWith('.githubusercontent.com'))) return;
  if (allowLoopback && parsed.protocol === 'http:' && host === '127.0.0.1') return;
  throw new ModError('descarga desde un sitio no permitido: ' + host);
}

/** { status, body }. Sigue redirecciones solo dentro de GitHub y corta si pasa del tamano maximo. */
async function get(url, allowLoopback, maxBytes) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    checkUrl(current, allowLoopback);
    let response;
    try {
      response = await fetch(current, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(300000) });
    } catch (_) {
      throw new ModError('no hubo respuesta del servidor');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current).toString();
      continue;
    }
    if (!response.ok) return { status: response.status, body: Buffer.alloc(0) };
    const chunks = [];
    let total = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { await reader.cancel(); throw new ModError('la descarga es más grande de lo esperado'); }
      chunks.push(Buffer.from(value));
    }
    return { status: 200, body: Buffer.concat(chunks) };
  }
  throw new ModError('demasiadas redirecciones');
}

/**
 * Deja en modsDir el .jar del mod Ishe de la ultima version anunciada.
 * options: { source?, publicKey, modsDir, minecraft, allowLoopback? }
 * Devuelve { status: 'sin-aviso' | 'otra-version' | 'al-dia' | 'actualizado', file?, version? }.
 * Lanza ModError si algo no cuadra (no se toca nada en ese caso).
 */
async function sync(options) {
  const source = options.source || SOURCE;
  const reply = await get(source + '/' + NOTICE_NAME, options.allowLoopback, LIMITS.noticeBytes * 2);
  if (reply.status === 404) return { status: 'sin-aviso' };
  if (reply.status !== 200) throw new ModError('el servidor respondió ' + reply.status);
  const notice = verify(reply.body.toString('utf8'), options.publicKey, options.minecraft);
  if (notice.otraVersion) return { status: 'otra-version', minecraft: notice.minecraft };
  const target = path.join(options.modsDir, notice.archivo);
  try {
    if (fs.statSync(target).isFile() && sha256(fs.readFileSync(target)) === notice.sha256) {
      return { status: 'al-dia', file: notice.archivo, version: notice.version };
    }
  } catch (_) { /* no esta: se descarga */ }
  const jar = await get(source + '/' + encodeURIComponent(notice.archivo), options.allowLoopback, LIMITS.jarBytes);
  if (jar.status !== 200) throw new ModError('no se pudo descargar ' + notice.archivo + ' (' + jar.status + ')');
  if (jar.body.length !== notice.tamano || sha256(jar.body) !== notice.sha256) throw new ModError(notice.archivo + ' no coincide con su código de verificación');
  const temp = target + '.descargando';
  try {
    fs.writeFileSync(temp, jar.body);
    fs.renameSync(temp, target);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch (_) { /* nada */ }
    throw new ModError('no se pudo guardar ' + notice.archivo + ': ' + error.message);
  }
  return { status: 'actualizado', file: notice.archivo, version: notice.version };
}

module.exports = { SOURCE, NOTICE_NAME, PROJECT_KEY, FORMAT, ModError, sign, verify, checkNotice, sync, sha256 };
