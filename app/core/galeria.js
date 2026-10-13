'use strict';
// Galeria de capturas de Reshem Client:
// 1. Fotos de la Comunidad (para todos): se sincronizan desde la release "fotos" de GitHub
//    (Paulinop/ishe-client) y se guardan en <userData>/galeria-comunidad.
// 2. Tus Capturas: lee las capturas (.png) de <gameDir>/screenshots y <minecraftDir>/screenshots.

const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REMOTE_BASE = 'https://github.com/Paulinop/ishe-client/releases/download/fotos';
const REPO = 'Paulinop/ishe-client';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length > 33 && buf.length <= MAX_IMAGE_BYTES && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

/** Genera una escena ilustrada suave 480x270 en PNG (con degradados y halo radial, sin bloques cuadrados). */
function buildShowcasePng(theme) {
  const w = 480;
  const h = 270;
  const raw = Buffer.alloc(h * (1 + w * 4), 0);
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];

  const cTop = rgb(theme.skyTop);
  const cMid = rgb(theme.skyMid);
  const cBot = rgb(theme.skyBot);
  const cAstro = rgb(theme.astro);
  const cMtn = rgb(theme.mountain);
  const cGrass = rgb(theme.grass);
  const cDirt = rgb(theme.dirt);
  const cLakeTop = rgb('#0b1f38');
  const cLakeBot = rgb('#040a14');

  const blendPx = (x, y, c, alpha = 1) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const off = y * (1 + w * 4) + 1 + x * 4;
    if (alpha >= 0.999) {
      raw[off] = c[0]; raw[off + 1] = c[1]; raw[off + 2] = c[2]; raw[off + 3] = 255;
    } else if (alpha > 0) {
      raw[off] = Math.round(raw[off] * (1 - alpha) + c[0] * alpha);
      raw[off + 1] = Math.round(raw[off + 1] * (1 - alpha) + c[1] * alpha);
      raw[off + 2] = Math.round(raw[off + 2] * (1 - alpha) + c[2] * alpha);
      raw[off + 3] = 255;
    }
  };

  const fillCircle = (cx, cy, r, hex, maxAlpha = 1, softEdge = 1.5) => {
    const c = typeof hex === 'string' ? rgb(hex) : hex;
    const rOuter = Math.ceil(r + softEdge);
    for (let y = Math.floor(cy - rOuter); y <= Math.ceil(cy + rOuter); y++) {
      for (let x = Math.floor(cx - rOuter); x <= Math.ceil(cx + rOuter); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) blendPx(x, y, c, maxAlpha);
        else if (d <= r + softEdge) blendPx(x, y, c, maxAlpha * (1 - (d - r) / softEdge));
      }
    }
  };

  const fillRect = (rx, ry, rw, rh, hex, alpha = 1) => {
    const c = typeof hex === 'string' ? rgb(hex) : hex;
    for (let y = Math.round(ry); y < Math.round(ry + rh); y++) {
      for (let x = Math.round(rx); x < Math.round(rx + rw); x++) {
        blendPx(x, y, c, alpha);
      }
    }
  };

  const ax = theme.astroX * 2;
  const ay = 46;

  // 1. Cielo con degradado suave + halo radial del astro + lago con degradado
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter byte
    let baseC;
    if (y < 95) baseC = mix(cTop, cMid, y / 95);
    else if (y < 208) baseC = mix(cMid, cBot, (y - 95) / 113);
    else baseC = mix(cLakeTop, cLakeBot, (y - 208) / (h - 208));

    for (let x = 0; x < w; x++) {
      let pxC = baseC;
      if (y < 208) {
        const d = Math.hypot(x - ax, y - ay);
        if (d < 95) {
          const glow = Math.pow(1 - d / 95, 2.2) * 0.52;
          pxC = mix(pxC, cAstro, glow);
        }
      }
      blendPx(x, y, pxC, 1);
    }
  }

  // 2. Estrellas suaves
  for (let i = 0; i < 42; i++) {
    const sx = (i * 73 + theme.seed * 37) % (w - 16) + 8;
    const sy = (i * 41 + theme.seed * 23) % 105 + 8;
    fillCircle(sx, sy, i % 4 === 0 ? 1.6 : 1.0, theme.spark, 0.75, 1.0);
  }

  // 3. Luna / Sol suave anti-aliased
  fillCircle(ax, ay, 22, theme.astro, 0.95, 2.0);
  fillCircle(ax - 2, ay - 2, 15, '#ffffff', 0.85, 2.5);

  // 4. Cordillera lejana y colinas suaves (1px por columna, sin escalones)
  for (let x = 0; x < w; x++) {
    const mhFar = Math.round(112 + Math.sin(x * 0.018 + theme.seed) * 26 + Math.cos(x * 0.042) * 12);
    for (let y = mhFar; y < 208; y++) {
      const t = (y - mhFar) / Math.max(1, 208 - mhFar);
      blendPx(x, y, mix(cMtn, cBot, (1 - t) * 0.28), 0.75);
    }
    const mhNear = Math.round(142 + Math.sin(x * 0.024 + theme.seed * 2.1) * 18 + Math.cos(x * 0.055) * 8);
    for (let y = mhNear; y < 208; y++) {
      blendPx(x, y, cMtn, 1);
    }
    const gh = Math.round(174 + Math.sin(x * 0.022 + theme.seed) * 6);
    for (let y = gh; y < gh + 6; y++) blendPx(x, y, cGrass, 1);
    for (let y = gh + 6; y < 208; y++) blendPx(x, y, cDirt, 1);
  }

  // 5. Pinos estilizados suaves en las colinas
  for (const tx of [36, 68, 104, 138, 344, 382, 418, 448]) {
    const baseY = 178 + ((tx * 3 + theme.seed) % 8);
    for (let py = 0; py < 36; py++) {
      const halfW = (py / 36) * 11;
      for (let px = Math.floor(tx - halfW); px <= Math.ceil(tx + halfW); px++) {
        blendPx(px, baseY - 36 + py, cGrass, 0.92);
      }
    }
  }

  // 6. Estructura central con iluminacion calida
  if (theme.kind === 'puesto') {
    fillCircle(240, 146, 56, '#f59e0b', 0.25, 18);
    fillRect(160, 156, 160, 24, '#78350f', 1);
    fillRect(164, 158, 152, 4, '#b45309', 1);
    fillRect(168, 126, 8, 32, '#5c341d', 1);
    fillRect(304, 126, 8, 32, '#5c341d', 1);
    // Toldo suave
    for (let py = 0; py < 16; py++) {
      const expand = (py / 16) * 10;
      for (let x = Math.round(158 - expand); x <= Math.round(322 + expand); x++) {
        const stripe = Math.floor((x + 4) / 14) % 2 === 0 ? '#dc2626' : '#f8fafc';
        blendPx(x, 112 + py, rgb(stripe), 1);
      }
    }
    fillCircle(180, 134, 5, '#fef08a', 0.95, 2);
    fillCircle(300, 134, 5, '#fef08a', 0.95, 2);
    fillCircle(240, 144, 10, '#f59e0b', 0.95, 1.5);
    fillCircle(206, 146, 7, '#38bdf8', 0.9, 1.5);
    fillCircle(274, 146, 7, '#a855f7', 0.9, 1.5);
  } else if (theme.kind === 'ruleta') {
    fillCircle(240, 124, 58, '#ef4444', 0.32, 18);
    fillRect(208, 86, 64, 92, '#1f2937', 1);
    fillRect(194, 170, 92, 10, '#374151', 1);
    fillCircle(240, 118, 24, '#dc2626', 0.95, 1.5);
    fillCircle(240, 118, 16, '#f59e0b', 0.95, 1.5);
    fillCircle(240, 118, 7, '#fef08a', 0.98, 1.5);
    for (const [mx, my] of [[86, 56], [138, 82], [336, 48], [388, 78]]) {
      fillCircle(mx, my, 8, '#f97316', 0.45, 5);
      fillCircle(mx, my, 4.5, '#fef08a', 0.95, 1.5);
    }
  } else {
    fillCircle(240, 118, 56, '#c084fc', 0.35, 18);
    fillRect(220, 72, 40, 104, '#1e1b4b', 1);
    fillRect(202, 170, 76, 10, '#334155', 1);
    fillRect(230, 84, 20, 78, '#a855f7', 0.92);
    fillRect(235, 92, 10, 62, '#fdf4ff', 0.95);
  }

  // 7. Reflejos suaves en el lago (y=210..268)
  fillRect(0, 208, w, 2, '#38bdf8', 0.35);
  for (let i = 0; i < 14; i++) {
    const ry = 214 + i * 3.8;
    const rw = Math.max(8, 34 - i * 1.8);
    const op = Math.max(0.1, 0.58 - i * 0.035);
    fillRect(ax - rw, ry, rw * 2, 2, theme.astro, op);
    fillRect(240 - rw * 0.85, ry + 1, rw * 1.7, 1.8, theme.spark, op * 0.65);
  }

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

const DEFAULT_COMMUNITY = [
  {
    id: 'comunidad-puesto-haku',
    file: 'comunidad-puesto-haku.png',
    title: 'Puesto de Haku y Nublado',
    author: 'Servidor Reshem',
    date: '2026-10-10',
    theme: { kind: 'puesto', seed: 1, skyTop: '#071022', skyMid: '#122644', skyBot: '#21455e', astroX: 184, astro: '#fde047', spark: '#fef08a', mountain: '#12292e', grass: '#1f4e3d', dirt: '#0c1f1a' },
  },
  {
    id: 'comunidad-ruleta-eventos',
    file: 'comunidad-ruleta-eventos.png',
    title: 'Atardecer con Shaders BSL',
    author: 'PaulinoG',
    date: '2026-10-10',
    theme: { kind: 'ruleta', seed: 3, skyTop: '#1f060a', skyMid: '#450d16', skyBot: '#6e1723', astroX: 44, astro: '#ef4444', spark: '#fca5a5', mountain: '#280e14', grass: '#3b1c1a', dirt: '#1c0d0c' },
  },
  {
    id: 'comunidad-exploracion',
    file: 'comunidad-exploracion.png',
    title: 'Bosque de Taiga en Reshem',
    author: 'Comunidad Reshem',
    date: '2026-10-11',
    theme: { kind: 'obelisco', seed: 5, skyTop: '#140e2e', skyMid: '#2e1a4a', skyBot: '#5b2a5c', astroX: 176, astro: '#f59e0b', spark: '#f5d0fe', mountain: '#1b1630', grass: '#254238', dirt: '#111e1b' },
  },
];

function ensureCommunity(communityDir) {
  fs.mkdirSync(communityDir, { recursive: true });
  const manifestPath = path.join(communityDir, 'galeria.json');
  const bundledDir = path.join(__dirname, '..', 'renderer', 'assets', 'mc-hero');
  for (const item of DEFAULT_COMMUNITY) {
    const filePath = path.join(communityDir, item.file);
    const bundledPath = path.join(bundledDir, item.file);
    let needsWrite = !fs.existsSync(filePath);
    if (!needsWrite) {
      try { needsWrite = fs.statSync(filePath).size < 100000; } catch (_) { needsWrite = true; }
    }
    if (needsWrite) {
      if (fs.existsSync(bundledPath)) {
        fs.copyFileSync(bundledPath, filePath);
      } else {
        fs.writeFileSync(filePath, buildShowcasePng(item.theme));
      }
    }
  }
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        let changed = false;
        const byId = new Map(DEFAULT_COMMUNITY.map((it) => [it.id, it]));
        for (const entry of data) {
          const def = entry && byId.get(entry.id);
          if (def && entry.title !== def.title) {
            entry.title = def.title;
            entry.author = def.author;
            changed = true;
          }
        }
        if (changed) fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2));
        return data;
      }
    } catch (_) { /* se regenera */ }
  }
  const list = DEFAULT_COMMUNITY.map((item) => ({
    id: item.id,
    file: item.file,
    title: item.title,
    author: item.author,
    date: item.date,
  }));
  fs.writeFileSync(manifestPath, JSON.stringify(list, null, 2));
  return list;
}

function listCommunity(communityDir) {
  const entries = ensureCommunity(communityDir);
  const out = [];
  for (const item of entries) {
    if (!item || typeof item.file !== 'string' || !/^[A-Za-z0-9._-]+\.png$/i.test(item.file)) continue;
    const p = path.join(communityDir, item.file);
    try {
      const buf = fs.readFileSync(p);
      if (!isPng(buf)) continue;
      out.push({
        id: String(item.id || item.file),
        title: String(item.title || 'Captura en Reshem').slice(0, 60),
        author: String(item.author || 'Jugador').slice(0, 24),
        date: String(item.date || ''),
        source: 'community',
        filePath: p,
        dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
      });
    } catch (_) { /* ignorar */ }
  }
  return out;
}

function listLocalScreenshots(dirs) {
  const seenNames = new Set();
  const files = [];
  for (const baseDir of dirs) {
    if (!baseDir) continue;
    const shotsDir = path.join(baseDir, 'screenshots');
    let names = [];
    try { names = fs.readdirSync(shotsDir); } catch (_) { continue; }
    for (const name of names) {
      if (!/^[A-Za-z0-9._ -]+\.png$/i.test(name) || seenNames.has(name)) continue;
      const full = path.join(shotsDir, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) continue;
        seenNames.add(name);
        files.push({ name, full, mtime: stat.mtimeMs });
      } catch (_) { /* ignorar */ }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const out = [];
  for (const item of files.slice(0, 16)) {
    try {
      const buf = fs.readFileSync(item.full);
      if (!isPng(buf)) continue;
      const cleanTitle = item.name.replace(/\.png$/i, '').replace(/_/g, ' ');
      const date = new Date(item.mtime).toISOString().slice(0, 10);
      out.push({
        id: item.name,
        title: cleanTitle.slice(0, 50),
        author: 'En tu PC',
        date,
        source: 'local',
        filePath: item.full,
        dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
      });
    } catch (_) { /* ignorar */ }
  }
  return out;
}

/** Sincroniza en segundo plano las fotos publicadas en la release "fotos" de GitHub para que las vean todos. */
async function syncFromGithub(communityDir) {
  try {
    const response = await fetch(REMOTE_BASE + '/galeria.json', {
      headers: { 'User-Agent': 'IsheClient-Launcher' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return false;
    const remoteList = await response.json();
    if (!Array.isArray(remoteList) || remoteList.length === 0) return false;
    const localList = ensureCommunity(communityDir);
    const byId = new Map(localList.map((item) => [item.id, item]));
    let changed = false;
    for (const item of remoteList.slice(0, 24)) {
      if (!item || typeof item.file !== 'string' || !/^[A-Za-z0-9._-]+\.png$/i.test(item.file)) continue;
      const target = path.join(communityDir, item.file);
      if (!fs.existsSync(target)) {
        const imgRes = await fetch(REMOTE_BASE + '/' + encodeURIComponent(item.file), {
          headers: { 'User-Agent': 'IsheClient-Launcher' },
          redirect: 'follow',
          signal: AbortSignal.timeout(30000),
        });
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (!isPng(buf)) continue;
        fs.writeFileSync(target, buf);
        changed = true;
      }
      if (!byId.has(item.id)) {
        localList.unshift({
          id: String(item.id || item.file).slice(0, 48),
          file: item.file,
          title: String(item.title || 'Captura en Reshem').slice(0, 60),
          author: String(item.author || 'Jugador').slice(0, 24),
          date: String(item.date || ''),
        });
        byId.set(item.id, item);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(path.join(communityDir, 'galeria.json'), JSON.stringify(localList.slice(0, 30), null, 2));
    }
    return changed;
  } catch (_) {
    return false;
  }
}

/** Intenta subir la foto y galeria.json a la release "fotos" de GitHub (si gh esta disponible en el equipo). */
function tryPublishToGithubRelease(communityDir, fileName) {
  return new Promise((resolve) => {
    const manifestPath = path.join(communityDir, 'galeria.json');
    const photoPath = path.join(communityDir, fileName);
    execFile('gh', ['release', 'upload', 'fotos', photoPath, manifestPath, '--clobber', '--repo', REPO], { timeout: 30000, windowsHide: true }, (err) => {
      if (!err) return resolve(true);
      execFile('gh', ['release', 'create', 'fotos', photoPath, manifestPath, '--title', 'Fotos de la comunidad Reshem', '--notes', 'Galeria compartida en Reshem Client', '--repo', REPO], { timeout: 30000, windowsHide: true }, (err2) => {
        resolve(!err2);
      });
    });
  });
}

async function sharePhoto({ communityDir, pngBuffer, title, author }) {
  if (!isPng(pngBuffer)) return { ok: false, reason: 'invalid' };
  const list = ensureCommunity(communityDir);
  const id = 'foto-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const file = id + '.png';
  const today = new Date().toISOString().slice(0, 10);
  const entry = {
    id,
    file,
    title: String(title || 'Momento en Reshem').trim().slice(0, 60) || 'Momento en Reshem',
    author: String(author || 'Jugador').trim().slice(0, 24) || 'Jugador',
    date: today,
  };
  fs.writeFileSync(path.join(communityDir, file), pngBuffer);
  list.unshift(entry);
  const trimmed = list.slice(0, 30);
  fs.writeFileSync(path.join(communityDir, 'galeria.json'), JSON.stringify(trimmed, null, 2));
  const uploadedRemote = await tryPublishToGithubRelease(communityDir, file);
  return { ok: true, uploadedRemote, entry };
}

function getAll({ communityDir, gameDir, minecraftDir }) {
  return {
    community: listCommunity(communityDir).map(({ filePath, ...rest }) => rest),
    local: listLocalScreenshots([gameDir, minecraftDir]).map(({ filePath, ...rest }) => rest),
  };
}

function findFilePath({ communityDir, gameDir, minecraftDir }, id, source) {
  const list = source === 'community'
    ? listCommunity(communityDir)
    : listLocalScreenshots([gameDir, minecraftDir]);
  const found = list.find((item) => item.id === id);
  return found ? found.filePath : '';
}

function readAutoUploadedSet(communityDir) {
  fs.mkdirSync(communityDir, { recursive: true });
  const trackFile = path.join(communityDir, 'subidas-auto.json');
  try {
    const arr = JSON.parse(fs.readFileSync(trackFile, 'utf8'));
    if (Array.isArray(arr)) return { trackFile, seen: new Set(arr), existed: true };
  } catch (_) { /* nuevo */ }
  return { trackFile, seen: new Set(), existed: false };
}

function saveAutoUploadedSet(trackFile, seen) {
  try {
    fs.writeFileSync(trackFile, JSON.stringify([...seen].slice(-200), null, 2));
  } catch (_) { /* ignorar */ }
}

/**
 * Escanea las carpetas screenshots/ en busca de capturas nuevas tomadas con F2
 * y las sube automaticamente a la galeria de la comunidad.
 */
async function scanAndAutoUpload({ communityDir, gameDir, minecraftDir, author }) {
  const { trackFile, seen, existed } = readAutoUploadedSet(communityDir);
  const now = Date.now();
  const candidates = [];
  for (const baseDir of [gameDir, minecraftDir]) {
    if (!baseDir) continue;
    const shotsDir = path.join(baseDir, 'screenshots');
    let names = [];
    try { names = fs.readdirSync(shotsDir); } catch (_) { continue; }
    for (const name of names) {
      if (!/^[A-Za-z0-9._ -]+\.png$/i.test(name) || seen.has(name)) continue;
      const full = path.join(shotsDir, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile() || stat.size <= 33 || stat.size > MAX_IMAGE_BYTES) continue;
        // En el primer arranque marcamos las capturas antiguas (> 2 min) para no subir historial viejo de golpe
        if (!existed && (now - stat.mtimeMs) > 120000) {
          seen.add(name);
          continue;
        }
        candidates.push({ name, full, mtime: stat.mtimeMs });
      } catch (_) { /* ignorar */ }
    }
  }
  if (!existed && candidates.length === 0) {
    saveAutoUploadedSet(trackFile, seen);
    return { uploaded: false, count: 0 };
  }
  candidates.sort((a, b) => a.mtime - b.mtime);
  let uploadedCount = 0;
  let lastTitle = '';
  for (const item of candidates.slice(0, 4)) {
    try {
      const buf = fs.readFileSync(item.full);
      if (!isPng(buf)) continue;
      seen.add(item.name);
      const cleanTitle = item.name.replace(/\.png$/i, '').replace(/_/g, ' ');
      const res = await sharePhoto({
        communityDir,
        pngBuffer: buf,
        title: cleanTitle,
        author: author || 'Jugador Reshem',
      });
      if (res && res.ok) {
        uploadedCount += 1;
        lastTitle = cleanTitle;
      }
    } catch (_) { /* aún escribiéndose en disco */ }
  }
  if (uploadedCount > 0 || !existed) {
    saveAutoUploadedSet(trackFile, seen);
  }
  if (uploadedCount > 0) {
    return {
      uploaded: true,
      count: uploadedCount,
      lastTitle,
      gallery: getAll({ communityDir, gameDir, minecraftDir }),
    };
  }
  return { uploaded: false, count: 0 };
}

module.exports = {
  isPng,
  getAll,
  findFilePath,
  sharePhoto,
  syncFromGithub,
  scanAndAutoUpload,
};
