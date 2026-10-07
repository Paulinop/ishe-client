'use strict';
// "Codigo de amigos": con el, la IA de Nublado y Haku usa el servidor de Guishe en vez de pedirte una clave de Google.
// El codigo es "ISHE-" + (direccion del servidor y tu token, en base64). Se guarda en <juego>/config/ishe.json
// (gemini_url_base y gemini_api_key); la clave real de Google nunca sale del servidor de Guishe.
// Solo usa modulos incluidos en Node.

const fs = require('fs');
const path = require('path');

const PREFIX = 'ISHE-';
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{4,80}$/;
const SERVER_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(:\d{1,5})?$/;

/** Texto del codigo -> { url, token } o null si no vale. */
function decode(code) {
  try {
    const text = String(code || '').trim();
    if (!text.startsWith(PREFIX) || text.length > 600) return null;
    const data = JSON.parse(Buffer.from(text.slice(PREFIX.length), 'base64url').toString('utf8'));
    const token = String(data.t || '');
    const parsed = new URL(String(data.u || ''));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (!TOKEN_PATTERN.test(token)) return null;
    const url = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, ''));
    const server = data.s === undefined || data.s === '' ? '' : String(data.s);
    if (server !== '' && !SERVER_PATTERN.test(server)) return null;
    return { url, token, server };
  } catch (_) {
    return null;
  }
}

/** { url, token, servidor opcional } -> codigo (lo usa la herramienta del creador y las pruebas). */
function encode(url, token, server) {
  const body = { u: url, t: token };
  if (server) body.s = server;
  return PREFIX + Buffer.from(JSON.stringify(body)).toString('base64url');
}

function configFile(gameDir) {
  return path.join(gameDir, 'config', 'ishe.json');
}

function readConfig(gameDir) {
  try {
    const data = JSON.parse(fs.readFileSync(configFile(gameDir), 'utf8').replace(/^\uFEFF/, ''));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (_) {
    return {};
  }
}

function writeConfig(gameDir, data) {
  const file = configFile(gameDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

/** Pone el codigo en la configuracion del mod, conservando el resto de sus ajustes. Devuelve { server } si se pudo, o null. */
function apply(gameDir, code) {
  const decoded = decode(code);
  if (!decoded) return null;
  const data = readConfig(gameDir);
  data.gemini_url_base = decoded.url;
  data.gemini_api_key = decoded.token;
  data.fish_url_base = decoded.url + '/fish/v1/tts';   // la voz de Fish Audio tambien pasa por el servidor de amigos
  data.fish_api_key = decoded.token;
  writeConfig(gameDir, data);
  return { server: decoded.server };
}

/** Quita el codigo (solo si lo que hay es de un codigo de amigos; una clave propia de Google no se toca). */
function clear(gameDir) {
  const data = readConfig(gameDir);
  if (!data.gemini_url_base) return false;
  data.gemini_url_base = '';
  data.gemini_api_key = '';
  if (data.fish_url_base) {
    data.fish_url_base = '';
    data.fish_api_key = '';
  }
  writeConfig(gameDir, data);
  return true;
}

function active(gameDir) {
  const data = readConfig(gameDir);
  return typeof data.gemini_url_base === 'string' && data.gemini_url_base !== '' && typeof data.gemini_api_key === 'string' && data.gemini_api_key !== '';
}

module.exports = { PREFIX, decode, encode, apply, clear, active, configFile };
