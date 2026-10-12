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

// ---- Guardarropa de skins (coleccion local de cada jugador) -----------------

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

/** Construye un PNG RGBA de 64x64 valido para Minecraft a partir de una paleta de colores. */
function buildStarterSkinPng(palette) {
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc(h * (1 + w * 4), 0);
  const setPx = (x, y, hex, a = 255) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const off = y * (1 + w * 4) + 1 + x * 4;
    raw[off] = parseInt(hex.slice(1, 3), 16);
    raw[off + 1] = parseInt(hex.slice(3, 5), 16);
    raw[off + 2] = parseInt(hex.slice(5, 7), 16);
    raw[off + 3] = a;
  };
  const fillRect = (rx, ry, rw, rh, hex, a = 255) => {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) setPx(x, y, hex, a);
    }
  };
  // Cabeza base (0,0)-(32,16)
  fillRect(8, 0, 16, 8, palette.hair);
  fillRect(0, 8, 32, 8, palette.skin);
  fillRect(8, 8, 8, 2, palette.hair);
  fillRect(0, 8, 8, 4, palette.hair);
  fillRect(16, 8, 16, 5, palette.hair);
  // Ojos y boca en la cara frontal (8,8)-(16,16)
  setPx(9, 12, '#ffffff'); setPx(10, 12, palette.eyes);
  setPx(13, 12, palette.eyes); setPx(14, 12, '#ffffff');
  fillRect(11, 14, 2, 1, palette.skinShadow);
  // Sombrero / capa exterior de cabeza (32,0)-(64,16)
  fillRect(40, 8, 8, 2, palette.accent);
  fillRect(32, 8, 8, 2, palette.accent);
  fillRect(48, 8, 8, 2, palette.accent);
  // Torso (16,16)-(40,32)
  fillRect(20, 16, 16, 4, palette.shirt);
  fillRect(16, 20, 24, 12, palette.shirt);
  fillRect(22, 20, 4, 10, palette.accent);
  fillRect(16, 29, 24, 2, palette.belt);
  // Pierna derecha (0,16)-(16,32) y pierna izquierda (16,48)-(32,64)
  fillRect(4, 16, 8, 4, palette.pants);
  fillRect(0, 20, 16, 9, palette.pants);
  fillRect(0, 29, 16, 3, palette.boots);
  fillRect(20, 48, 8, 4, palette.pants);
  fillRect(16, 52, 16, 9, palette.pants);
  fillRect(16, 61, 16, 3, palette.boots);
  // Brazo derecho (40,16)-(56,32) y brazo izquierdo (32,48)-(48,64)
  fillRect(44, 16, 8, 4, palette.shirt);
  fillRect(40, 20, 16, 8, palette.shirt);
  fillRect(40, 28, 16, 4, palette.skin);
  fillRect(36, 48, 8, 4, palette.shirt);
  fillRect(32, 52, 16, 8, palette.shirt);
  fillRect(32, 60, 16, 4, palette.skin);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const STARTER_SKINS = [
  {
    id: 'starter-reshem',
    name: 'Explorador Reshem',
    variant: 'classic',
    palette: { skin: '#e8b48a', skinShadow: '#b8825c', hair: '#2e2218', eyes: '#f2b630', shirt: '#2b4228', accent: '#f2b630', belt: '#1b140e', pants: '#232820', boots: '#16120e' },
  },
  {
    id: 'starter-guardia',
    name: 'Guardia Dorado',
    variant: 'classic',
    palette: { skin: '#dfb18b', skinShadow: '#ad7c59', hair: '#4a301d', eyes: '#38bdf8', shirt: '#3a3d45', accent: '#f59e0b', belt: '#78350f', pants: '#272930', boots: '#18181b' },
  },
  {
    id: 'starter-nocturno',
    name: 'Viajero Nocturno',
    variant: 'slim',
    palette: { skin: '#f0c8a8', skinShadow: '#c29270', hair: '#181824', eyes: '#a855f7', shirt: '#1e1b4b', accent: '#38bdf8', belt: '#0f172a', pants: '#111827', boots: '#090d16' },
  },
];

function ensureWardrobe(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const listFile = path.join(dir, 'lista.json');
  if (fs.existsSync(listFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(listFile, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* se regenera */ }
  }
  const initial = [];
  for (const item of STARTER_SKINS) {
    const png = buildStarterSkinPng(item.palette);
    fs.writeFileSync(path.join(dir, item.id + '.png'), png);
    initial.push({ id: item.id, name: item.name, variant: item.variant, createdAt: 'Incluida' });
  }
  fs.writeFileSync(listFile, JSON.stringify(initial, null, 2));
  return initial;
}

function listWardrobe(dir) {
  const entries = ensureWardrobe(dir);
  const out = [];
  for (const item of entries) {
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(item.id)) continue;
    const pngPath = path.join(dir, item.id + '.png');
    try {
      const buf = fs.readFileSync(pngPath);
      if (!checkPng(buf).ok) continue;
      out.push({
        id: item.id,
        name: String(item.name || 'Mi skin').slice(0, 28),
        variant: variantOf(item.variant),
        createdAt: String(item.createdAt || ''),
        dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
      });
    } catch (_) { /* archivo borrado */ }
  }
  return out;
}

function saveToWardrobe(dir, { name, variant, pngBuffer }) {
  const checked = checkPng(pngBuffer);
  if (!checked.ok) return { ok: false, reason: REASONS.INVALID, detail: checked.reason };
  const entries = ensureWardrobe(dir);
  const id = 'skin-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const cleanName = String(name || '').trim().slice(0, 28) || ('Skin ' + (entries.length + 1));
  const cleanVariant = variantOf(variant);
  fs.writeFileSync(path.join(dir, id + '.png'), pngBuffer);
  const today = new Date().toISOString().slice(0, 10);
  const newItem = { id, name: cleanName, variant: cleanVariant, createdAt: today };
  if (entries.length > 0 && (entries[0].id === 'mi-skin-actual' || entries[0].createdAt === 'Por defecto')) {
    entries.splice(1, 0, newItem);
  } else {
    entries.unshift(newItem);
  }
  const trimmed = entries.slice(0, 40);
  fs.writeFileSync(path.join(dir, 'lista.json'), JSON.stringify(trimmed, null, 2));
  return { ok: true, id, wardrobe: listWardrobe(dir) };
}

function deleteFromWardrobe(dir, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return { ok: false };
  const entries = ensureWardrobe(dir).filter((item) => item && item.id !== id);
  fs.writeFileSync(path.join(dir, 'lista.json'), JSON.stringify(entries, null, 2));
  try { fs.rmSync(path.join(dir, id + '.png'), { force: true }); } catch (_) { }
  return { ok: true, wardrobe: listWardrobe(dir) };
}

function syncPlayerDefaultSkin(dir, { name, variant, pngBuffer }) {
  const checked = checkPng(pngBuffer);
  if (!checked.ok) return false;
  const entries = ensureWardrobe(dir).filter((item) => item && item.id !== 'mi-skin-actual');
  const id = 'mi-skin-actual';
  const cleanName = String(name || 'Tu skin').trim().slice(0, 28) || 'Tu skin';
  const cleanVariant = variantOf(variant);
  fs.writeFileSync(path.join(dir, id + '.png'), pngBuffer);
  entries.unshift({ id, name: cleanName, variant: cleanVariant, createdAt: 'Por defecto' });
  fs.writeFileSync(path.join(dir, 'lista.json'), JSON.stringify(entries.slice(0, 40), null, 2));
  return true;
}

function getWardrobePng(dir, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  const entries = ensureWardrobe(dir);
  const found = entries.find((item) => item && item.id === id);
  if (!found) return null;
  try {
    const png = fs.readFileSync(path.join(dir, id + '.png'));
    return checkPng(png).ok ? { png, variant: variantOf(found.variant), name: found.name } : null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  REASONS, SKINS, checkPng, variantOf, multipart, uploadFile, uploadUrl, currentHash,
  listWardrobe, saveToWardrobe, deleteFromWardrobe, getWardrobePng, syncPlayerDefaultSkin,
};
