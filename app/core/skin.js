'use strict';
// Cambiar la skin de tu cuenta desde Ishe Client, con el servicio oficial de Minecraft (el mismo que usa minecraft.net).
// Solo usa modulos incluidos en Node.

const crypto = require('crypto');

const SKINS = 'https://api.minecraftservices.com/minecraft/profile/skins';
const PROFILE = 'https://api.minecraftservices.com/minecraft/profile';
const TEXTURE_URL = /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]{20,80}$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const USER_AGENT = 'IsheClient-Launcher';
const MAX_BYTES = 100 * 1024;

const REASONS = { INVALID: 'invalid', SESSION: 'session', NETWORK: 'network', REFUSED: 'refused' };

/** Comprueba que sea un PNG de skin (64x64 o 64x32). Devuelve { ok, reason?, width?, height? }. */
function checkPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.length > MAX_BYTES) return { ok: false, reason: 'size' };
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return { ok: false, reason: 'not-png' };
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, reason: 'not-png' };
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) return { ok: false, reason: 'dimensions', width, height };
  return { ok: true, width, height };
}

function variantOf(value) {
  return value === 'slim' ? 'slim' : 'classic';
}

function multipart(png, variant) {
  const boundary = '----IsheClient' + crypto.randomBytes(12).toString('hex');
  const head = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="variant"\r\n\r\n' + variant + '\r\n'
    + '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n');
  const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
  return { boundary, body: Buffer.concat([head, png, tail]) };
}

async function send(options, fetchOptions) {
  let response;
  try {
    response = await fetch(options.url, Object.assign({ method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000) }, fetchOptions));
  } catch (_) {
    return { ok: false, reason: REASONS.NETWORK };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: REASONS.SESSION };
  return { ok: false, reason: response.status === 400 ? REASONS.INVALID : REASONS.REFUSED, status: response.status };
}

/** Sube un archivo PNG como skin. endpoints: solo para pruebas. */
async function uploadFile(accessToken, png, variant, endpoints) {
  const check = checkPng(png);
  if (!check.ok) return { ok: false, reason: REASONS.INVALID, detail: check.reason };
  const form = multipart(png, variantOf(variant));
  return send({ url: (endpoints && endpoints.skins) || SKINS }, {
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'multipart/form-data; boundary=' + form.boundary, 'User-Agent': USER_AGENT },
    body: form.body,
  });
}

/** Pone como skin una que ya existe en el servidor de texturas de Minecraft (por ejemplo, la de otro jugador). */
async function uploadUrl(accessToken, url, variant, endpoints) {
  if (!TEXTURE_URL.test(String(url))) return { ok: false, reason: REASONS.INVALID, detail: 'url' };
  return send({ url: (endpoints && endpoints.skins) || SKINS }, {
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ variant: variantOf(variant), url }),
  });
}

/** Identificador de la skin activa del perfil, para volver a dibujar la cara ('' si no se pudo leer). */
async function currentHash(accessToken, endpoints) {
  try {
    const response = await fetch((endpoints && endpoints.profile) || PROFILE, {
      headers: { Authorization: 'Bearer ' + accessToken, 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return '';
    const data = await response.json();
    const skins = Array.isArray(data.skins) ? data.skins : [];
    const active = skins.find((s) => s && s.state === 'ACTIVE') || skins[0];
    const match = active && typeof active.url === 'string' ? /^https?:\/\/textures\.minecraft\.net\/texture\/([0-9a-f]{20,80})$/.exec(active.url) : null;
    return match ? match[1] : '';
  } catch (_) {
    return '';
  }
}

module.exports = { REASONS, SKINS, checkPng, variantOf, multipart, uploadFile, uploadUrl, currentHash };
