// Genera el fondo estilo oficial Minecraft (minecraft.net 2.5D Pixel Art Diorama)
// en un lienzo de 864x540 renderizado a escala entera fija 2x (1728x1080 px, cada bloque 16x16 = 32x32 px)
// para que NUNCA se estire ni en ventana normal ni en pantalla completa.
// Uso: node tools/generar_mina.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- Lector de ZIP (minecraft-client.jar) y decodificador PNG puro ----------
const jarPath = path.join(process.env.USERPROFILE || process.env.HOME, '.gradle', 'caches', 'fabric-loom', '26.2', 'minecraft-client.jar');
const jarBuf = fs.readFileSync(jarPath);

const zipIndex = new Map();
(function indexZip() {
  let eocd = jarBuf.length - 22;
  while (eocd >= 0 && jarBuf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const cdOffset = jarBuf.readUInt32LE(eocd + 16);
  const cdCount = jarBuf.readUInt16LE(eocd + 10);
  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (jarBuf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = jarBuf.readUInt16LE(pos + 10);
    const compSize = jarBuf.readUInt32LE(pos + 20);
    const nameLen = jarBuf.readUInt16LE(pos + 28);
    const extraLen = jarBuf.readUInt16LE(pos + 30);
    const commentLen = jarBuf.readUInt16LE(pos + 32);
    const localHeaderOffset = jarBuf.readUInt32LE(pos + 42);
    const name = jarBuf.toString('utf8', pos + 46, pos + 46 + nameLen);
    if (name.startsWith('assets/minecraft/textures/')) {
      zipIndex.set(name, { method, compSize, localHeaderOffset });
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
})();

function readZipEntry(entryName) {
  const info = zipIndex.get(entryName);
  if (!info) throw new Error('No se encontro en minecraft-client.jar: ' + entryName);
  const lh = info.localHeaderOffset;
  const nameLen = jarBuf.readUInt16LE(lh + 26);
  const extraLen = jarBuf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + nameLen + extraLen;
  const slice = jarBuf.subarray(dataStart, dataStart + info.compSize);
  return info.method === 0 ? slice : zlib.inflateRawSync(slice);
}

function decodePng(buf) {
  let o = 8, w = 0, h = 0, ct = 6, bd = 8;
  const idat = [];
  let paleta = null, trns = null;
  while (o < buf.length) {
    const l = buf.readUInt32BE(o), t = buf.toString('ascii', o + 4, o + 8);
    if (t === 'IHDR') { w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12); bd = buf[o + 16]; ct = buf[o + 17]; }
    if (t === 'PLTE') paleta = buf.subarray(o + 8, o + 8 + l);
    if (t === 'tRNS') trns = buf.subarray(o + 8, o + 8 + l);
    if (t === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + l));
    o += 12 + l;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const canales = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bitsPx = canales * bd;
  const bpp = Math.max(1, bitsPx >> 3);
  const bytesFila = Math.ceil((w * bitsPx) / 8);
  const pix = [];
  let prev = Buffer.alloc(bytesFila), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const r = Buffer.from(raw.subarray(p, p + bytesFila));
    p += bytesFila;
    for (let i = 0; i < r.length; i++) {
      const a = i >= bpp ? r[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = 0;
      if (f === 1) v = a;
      else if (f === 2) v = up;
      else if (f === 3) v = (a + up) >> 1;
      else if (f === 4) {
        const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
        v = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      r[i] = (r[i] + v) & 255;
    }
    const fila = [];
    for (let x = 0; x < w; x++) {
      if (ct === 3) {
        let idx;
        if (bd === 8) idx = r[x];
        else { const bit = x * bd; idx = (r[bit >> 3] >> (8 - bd - (bit & 7))) & ((1 << bd) - 1); }
        fila.push([paleta[idx * 3], paleta[idx * 3 + 1], paleta[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255]);
      } else if (ct === 6) {
        fila.push([r[x * 4], r[x * 4 + 1], r[x * 4 + 2], r[x * 4 + 3]]);
      } else if (ct === 2) {
        const rr = r[x * 3], gg = r[x * 3 + 1], bb = r[x * 3 + 2];
        const isTrns = trns && trns.length >= 6 && rr === trns[1] && gg === trns[3] && bb === trns[5];
        fila.push([rr, gg, bb, isTrns ? 0 : 255]);
      } else if (ct === 4) {
        fila.push([r[x * 2], r[x * 2], r[x * 2], r[x * 2 + 1]]);
      } else {
        const rawVal = bd === 8 ? r[x] : (r[(x * bd) >> 3] >> (8 - bd - ((x * bd) & 7))) & ((1 << bd) - 1);
        const isTrns = trns && trns.length >= 2 && rawVal === trns[1];
        const val = bd === 8 ? rawVal : rawVal * Math.floor(255 / ((1 << bd) - 1));
        fila.push([val, val, val, isTrns ? 0 : 255]);
      }
    }
    pix.push(fila);
    prev = r;
  }
  return { w, h, pix };
}

function encodePngDataUrl(w, h, rgbaBuf) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 4);
    raw[rowOff] = 0;
    rgbaBuf.copy(raw, rowOff + 1, y * w * 4, (y + 1) * w * 4);
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    let crc = 0xffffffff;
    for (let i = 0; i < td.length; i++) {
      crc ^= td[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const cBuf = Buffer.alloc(4);
    cBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, td, cBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `url("data:image/png;base64,${png.toString('base64')}")`;
}

function mcBlock(name) {
  return decodePng(readZipEntry(`assets/minecraft/textures/block/${name}.png`));
}

function tintTex(tex, rMul, gMul, bMul) {
  const pix = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 16; x++) {
      const [r, g, b, a] = tex.pix[y][x];
      row.push([
        Math.min(255, Math.round(r * rMul)),
        Math.min(255, Math.round(g * gMul)),
        Math.min(255, Math.round(b * bMul)),
        a,
      ]);
    }
    pix.push(row);
  }
  return { w: 16, h: 16, pix };
}

function compositeTex(base, overlay) {
  const pix = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 16; x++) {
      const [br, bg, bb, ba] = base.pix[y][x];
      const [or, og, ob, oa] = overlay.pix[y][x];
      if (oa === 0) row.push([br, bg, bb, ba]);
      else if (oa === 255) row.push([or, og, ob, 255]);
      else {
        const a = oa / 255;
        row.push([
          Math.round(or * a + br * (1 - a)),
          Math.round(og * a + bg * (1 - a)),
          Math.round(ob * a + bb * (1 - a)),
          255,
        ]);
      }
    }
    pix.push(row);
  }
  return { w: 16, h: 16, pix };
}

function createCanvas(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  return {
    w,
    h,
    buf,
    set(x, y, r, g, b, a = 255) {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || x >= w || y < 0 || y >= h || a <= 0) return;
      const i = (y * w + x) * 4;
      if (a >= 255 || buf[i + 3] === 0) {
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = a;
      } else {
        const al = a / 255;
        buf[i] = Math.round(r * al + buf[i] * (1 - al));
        buf[i + 1] = Math.round(g * al + buf[i + 1] * (1 - al));
        buf[i + 2] = Math.round(b * al + buf[i + 2] * (1 - al));
        buf[i + 3] = Math.min(255, buf[i + 3] + a);
      }
    },
    rect(x, y, rw, rh, r, g, b, a = 255) {
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          this.set(x + dx, y + dy, r, g, b, a);
        }
      }
    },
    stamp(tex, dx, dy, shade = 1.0, flipX = false, cropH = 16) {
      const hLim = Math.min(cropH, tex.h);
      for (let y = 0; y < hLim; y++) {
        for (let x = 0; x < tex.w; x++) {
          const sx = flipX ? tex.w - 1 - x : x;
          const [r, g, b, a] = tex.pix[y][sx];
          if (a < 20) continue;
          this.set(
            dx + x,
            dy + y,
            Math.min(255, Math.round(r * shade)),
            Math.min(255, Math.round(g * shade)),
            Math.min(255, Math.round(b * shade)),
            a
          );
        }
      }
    },
    // Bloque 2.5D estilo minecraft.net: cara frontal 16x16 + cara lateral izquierda sombreada (depth px) + bisel superior
    block25D(tex, dx, dy, shade = 1.0, leftDepth = 5, topLipColor = null) {
      if (leftDepth > 0) {
        const sideShade = shade * 0.62;
        for (let y = 0; y < 16; y++) {
          for (let lx = 0; lx < leftDepth; lx++) {
            const tx = Math.min(15, lx * 2);
            const [r, g, b, a] = tex.pix[y][tx];
            if (a < 20) continue;
            this.set(
              dx - leftDepth + lx,
              dy + y,
              Math.round(r * sideShade),
              Math.round(g * sideShade),
              Math.round(b * sideShade),
              a
            );
          }
        }
      }
      this.stamp(tex, dx, dy, shade);
      if (topLipColor) {
        for (let x = -leftDepth; x < 16; x++) {
          const [r, g, b] = topLipColor.pix
            ? topLipColor.pix[0][((x % 16) + 16) % 16]
            : topLipColor;
          const s = x < 0 ? shade * 0.78 : shade * 1.12;
          this.set(dx + x, dy, Math.min(255, Math.round(r * s)), Math.min(255, Math.round(g * s)), Math.min(255, Math.round(b * s)), 255);
        }
      }
    },
    ditherBlock(tex, dx, dy, shade = 0.85, side = 'left') {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if ((x + y) % 2 !== 0) continue;
          if (side === 'left' && x < 6 && (x + y) % 4 !== 0) continue;
          if (side === 'right' && x > 9 && (x + y) % 4 !== 0) continue;
          const [r, g, b, a] = tex.pix[y][x];
          if (a < 20) continue;
          this.set(dx + x, dy + y, Math.round(r * shade), Math.round(g * shade), Math.round(b * shade), a);
        }
      }
    },
  };
}

const grassTop = tintTex(mcBlock('grass_block_top'), 0.48, 0.82, 0.34);
const grassSide = compositeTex(mcBlock('grass_block_side'), tintTex(mcBlock('grass_block_side_overlay'), 0.48, 0.82, 0.34));
const oakLeaves = tintTex(mcBlock('oak_leaves'), 0.44, 0.78, 0.32);
const birchLeaves = tintTex(mcBlock('birch_leaves'), 0.56, 0.84, 0.40);

// Lienzo nativo de 864x540 (54x33.75 bloques de 16x16).
// En CSS se renderiza con background-size: 1728px 1080px (escala entera exacta 2x: 1 bloque = 32x32 px)
// y background-position: center bottom. Asi NUNCA se estira al cambiar el tamano de ventana ni en F11.
const W = 864;
const H = 540;
const Y_OFF = 270; // Las coordenadas base (0..270) quedan en la franja inferior (270..540)
const X_OFF = 192; // Desplaza el escenario central (480px) al centro exacto de 864px (x = 192..672)

function buildMainScene() {
  const cv = createCanvas(W, H);

  const dirt = mcBlock('dirt');
  const cobblestone = mcBlock('cobblestone');
  const mossyCobble = mcBlock('mossy_cobblestone');
  const stoneBricks = mcBlock('stone_bricks');
  const mossyBricks = mcBlock('mossy_stone_bricks');
  const crackedBricks = mcBlock('cracked_stone_bricks');
  const chiseledBricks = mcBlock('chiseled_stone_bricks');
  const coalOre = mcBlock('coal_ore');
  const ironOre = mcBlock('iron_ore');
  const lapisOre = mcBlock('lapis_ore');
  const diamondOre = mcBlock('diamond_ore');
  const emeraldOre = mcBlock('emerald_ore');
  const goldOre = mcBlock('gold_ore');
  const redstoneOre = mcBlock('redstone_ore');
  const obsidian = mcBlock('obsidian');
  const cryingObsidian = mcBlock('crying_obsidian');
  const craftingFront = mcBlock('crafting_table_front');
  const craftingTop = mcBlock('crafting_table_top');
  const furnaceFrontOn = mcBlock('furnace_front_on');
  const furnaceTop = mcBlock('furnace_top');
  const bookshelf = mcBlock('bookshelf');
  const oakPlanks = mcBlock('oak_planks');
  const tntSide = mcBlock('tnt_side');
  const tntTop = mcBlock('tnt_top');
  const oakLog = mcBlock('oak_log');
  const birchLog = mcBlock('birch_log');
  const cherryLog = mcBlock('cherry_log');
  const cherryLeaves = mcBlock('cherry_leaves');
  const amethystCluster = mcBlock('amethyst_cluster');
  const sandstone = mcBlock('sandstone');
  const cutSandstone = mcBlock('cut_sandstone');
  const chiseledSandstone = mcBlock('chiseled_sandstone');
  const orangeTerracotta = mcBlock('orange_terracotta');
  const blueTerracotta = mcBlock('blue_terracotta');
  const goldBlock = mcBlock('gold_block');
  const cactusSide = mcBlock('cactus_side');
  const deadBush = mcBlock('dead_bush');
  const lantern = mcBlock('lantern');
  const soulLantern = mcBlock('soul_lantern');
  const torch = mcBlock('torch');
  const waterStill = mcBlock('water_still');
  const poppy = mcBlock('poppy');
  const dandelion = mcBlock('dandelion');
  const blueOrchid = mcBlock('blue_orchid');
  const allium = mcBlock('allium');
  const oxeyeDaisy = mcBlock('oxeye_daisy');

  const waterTex = {
    w: 16,
    h: 16,
    pix: Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => {
        const [r, g, b] = waterStill.pix[y][x];
        return [Math.min(255, Math.round(r * 0.25 + 28)), Math.min(255, Math.round(g * 0.65 + 95)), Math.min(255, Math.round(b * 0.95 + 145)), 235];
      })
    ),
  };

  // =========================================================================
  // 1. CIELO NOCTURNO ESTILO MINECRAFT + ESTRELLAS + LUNA + SILUETAS LEJANAS
  // =========================================================================
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(7 + t * 11);
    const g = Math.round(11 + t * 20);
    const b = Math.round(24 + t * 34);
    cv.rect(0, y, W, 1, r, g, b, 255);
  }

  // Estrellas repartidas por todo el cielo (864x420)
  for (let i = 0; i < 95; i++) {
    const sx = (i * 73 + 29) % (W - 8) + 4;
    const sy = (i * 47 + 19) % 390 + 10;
    const sz = i % 3 === 0 ? 2 : 1;
    if (sz === 2) {
      cv.rect(sx, sy, 2, 2, 254, 249, 195, 230);
      cv.set(sx - 1, sy, 254, 249, 195, 105);
      cv.set(sx + 2, sy, 254, 249, 195, 105);
      cv.set(sx, sy - 1, 254, 249, 195, 105);
      cv.set(sx, sy + 2, 254, 249, 195, 105);
    } else {
      cv.set(sx, sy, 226, 232, 240, 185);
    }
  }

  // Luna cuadrada de Minecraft (visible en ventana y en pantalla completa)
  const mx = X_OFF + 345, my = 250;
  cv.rect(mx - 6, my - 6, 36, 36, 254, 249, 195, 22);
  cv.rect(mx - 3, my - 3, 30, 30, 254, 249, 195, 48);
  cv.rect(mx, my, 24, 24, 254, 252, 232, 255);
  cv.rect(mx + 2, my + 2, 20, 20, 254, 249, 195, 255);
  cv.rect(mx + 4, my + 4, 5, 4, 234, 179, 8, 95);
  cv.rect(mx + 12, my + 11, 6, 6, 234, 179, 8, 95);
  cv.rect(mx + 5, my + 14, 4, 4, 234, 179, 8, 75);

  // Siluetas escalonadas de colinas de bloques al fondo (54 columnas de 16px)
  for (let bx = 0; bx < 54; bx++) {
    const wave1 = Math.round(Math.sin(bx * 0.35) * 2) * 8;
    const ry1 = 162 + wave1 + Y_OFF;
    cv.rect(bx * 16, ry1, 16, H - ry1, 13, 21, 38, 255);
    cv.rect(bx * 16, ry1, 16, 2, 22, 34, 58, 255);

    const wave2 = Math.round(Math.cos(bx * 0.42 + 1.1) * 1.5) * 8;
    const ry2 = 186 + wave2 + Y_OFF;
    cv.rect(bx * 16, ry2, 16, H - ry2, 18, 29, 46, 255);
    cv.rect(bx * 16, ry2, 16, 2, 30, 46, 70, 255);
  }

  // =========================================================================
  // 2. ALA IZQUIERDA (PARA PANTALLA COMPLETA: BOSQUE DE ROBLE/ABEDUL Y MINA, bx = 1..11)
  // =========================================================================
  cv.ditherBlock(cobblestone, 1 * 16, 230 + Y_OFF, 0.72, 'left');
  const leftWingLower = [
    mossyCobble, cobblestone, coalOre, cobblestone, ironOre,
    mossyCobble, lapisOre, stoneBricks, goldOre, mossyBricks,
  ];
  for (let i = 0; i < leftWingLower.length; i++) {
    const bx = 2 + i;
    cv.block25D(leftWingLower[i], bx * 16, 230 + Y_OFF, 0.88, i === 0 ? 5 : 0, i === 0 ? cobblestone : null);
  }
  const leftWingUpper = [
    grassSide, grassSide, grassSide, mossyCobble, stoneBricks, ironOre, mossyBricks,
  ];
  for (let i = 0; i < leftWingUpper.length; i++) {
    const bx = 3 + i;
    const topLip = i < 3 ? grassTop : stoneBricks;
    cv.block25D(leftWingUpper[i], bx * 16, 214 + Y_OFF, 0.92, i === 0 ? 5 : 0, topLip);
  }
  // Arbol de Roble (Oak) en bx = 4 y Arbol de Abedul (Birch) en bx = 8
  cv.block25D(oakLog, 4 * 16, 182 + Y_OFF, 0.92, 4);
  cv.block25D(oakLog, 4 * 16, 198 + Y_OFF, 0.92, 4);
  for (const [ox, oy] of [[3, 166], [4, 166], [5, 166], [3, 150], [4, 150], [5, 150], [4, 134]]) {
    const hasLeft = ox === 3 || oy === 134;
    cv.block25D(oakLeaves, ox * 16, oy + Y_OFF, 0.95, hasLeft ? 4 : 0, oakLeaves);
  }
  cv.block25D(birchLog, 8 * 16, 182 + Y_OFF, 0.94, 4);
  cv.block25D(birchLog, 8 * 16, 198 + Y_OFF, 0.94, 4);
  for (const [bx, by] of [[7, 166], [8, 166], [9, 166], [7, 150], [8, 150], [9, 150], [8, 134]]) {
    const hasLeft = bx === 7 || by === 134;
    cv.block25D(birchLeaves, bx * 16, by + Y_OFF, 0.96, hasLeft ? 4 : 0, birchLeaves);
  }
  cv.stamp(lantern, 6 * 16, 198 + Y_OFF, 1.0);
  cv.stamp(torch, 10 * 16, 214 + Y_OFF, 1.0);

  // =========================================================================
  // 3. ESCENARIO CENTRAL IZQUIERDO 2.5D (SAKURA, PORTAL NETHER, TALLER Y CASCADA)
  // =========================================================================
  // Columna de cascada alta (bx = 13..15 + 12 = 25..27)
  cv.block25D(mossyBricks, X_OFF + 13 * 16, 152 + Y_OFF, 0.88, 5, stoneBricks);
  cv.block25D(stoneBricks, X_OFF + 15 * 16, 152 + Y_OFF, 0.88, 0, stoneBricks);
  for (let by = 168 + Y_OFF; by < 230 + Y_OFF; by += 16) {
    cv.block25D(mossyBricks, X_OFF + 13 * 16, by, 0.72, 4);
    cv.block25D(stoneBricks, X_OFF + 15 * 16, by, 0.72, 0);
  }

  // Terraza superior de Ladrillos de Piedra y Minerales
  const upperRow = [
    stoneBricks, mossyBricks, redstoneOre, chiseledBricks, stoneBricks,
    crackedBricks, stoneBricks, diamondOre, mossyBricks, stoneBricks, chiseledBricks,
  ];
  for (let i = 0; i < upperRow.length; i++) {
    const bx = 2 + i;
    const leftD = i === 0 ? 6 : 0;
    cv.block25D(upperRow[i], X_OFF + bx * 16, 214 + Y_OFF, 0.94, leftD, stoneBricks);
  }

  // Terraza inferior de Ladrillos de Piedra y Minerales
  const lowerRow = [
    mossyBricks, stoneBricks, diamondOre, stoneBricks, crackedBricks,
    emeraldOre, stoneBricks, mossyBricks, diamondOre, goldOre,
    stoneBricks, mossyBricks, crackedBricks,
  ];
  for (let i = 0; i < lowerRow.length; i++) {
    const bx = 1 + i;
    const leftD = i === 0 ? 6 : 0;
    cv.block25D(lowerRow[i], X_OFF + bx * 16, 230 + Y_OFF, 0.90, leftD, i === 0 || i === 12 ? stoneBricks : null);
  }
  cv.ditherBlock(stoneBricks, X_OFF, 230 + Y_OFF, 0.72, 'left');

  // --- Arbol de Cerezo (Sakura) real ---
  cv.block25D(cherryLog, X_OFF + 1 * 16, 198 + Y_OFF, 0.92, 4);
  cv.block25D(cherryLog, X_OFF + 1 * 16, 214 + Y_OFF, 0.92, 4);
  const sakuraBlocks = [
    [0, 166], [1, 166], [2, 166], [3, 166],
    [0, 182], [1, 182], [2, 182], [3, 182],
    [1, 150], [2, 150],
    [1, 134],
  ];
  for (const [sbx, sby] of sakuraBlocks) {
    const hasLeft = !sakuraBlocks.some(([obx, oby]) => obx === sbx - 1 && oby === sby);
    cv.block25D(cherryLeaves, X_OFF + sbx * 16, sby + Y_OFF, 0.98, hasLeft ? 4 : 0, cherryLeaves);
  }

  // --- Portal del Nether real 2.5D ---
  for (let py = 0; py < 4; py++) {
    const yPos = (150 + py * 16) + Y_OFF;
    const leftFrameTex = py === 1 || py === 2 ? cryingObsidian : obsidian;
    const rightFrameTex = py === 2 ? cryingObsidian : obsidian;
    cv.block25D(leftFrameTex, X_OFF + 4 * 16, yPos, 0.95, 5, py === 0 ? obsidian : null);
    cv.block25D(rightFrameTex, X_OFF + 6 * 16, yPos, 0.95, 0, py === 0 ? obsidian : null);
    if (py === 0) {
      cv.block25D(obsidian, X_OFF + 5 * 16, yPos, 0.95, 0, obsidian);
    } else {
      for (let ry = 0; ry < 16; ry++) {
        for (let rx = 0; rx < 16; rx++) {
          const wave = Math.sin((rx + ry) * 0.6) > 0.2;
          const isSwirl = (rx === 4 || rx === 11) && ry % 4 < 2;
          const pr = isSwirl ? 245 : wave ? 192 : 147;
          const pg = isSwirl ? 208 : wave ? 132 : 51;
          const pb = isSwirl ? 254 : wave ? 252 : 234;
          cv.set(X_OFF + 5 * 16 + rx, yPos + ry, pr, pg, pb, 235);
        }
      }
    }
  }

  // --- Taller de Supervivencia 2.5D ---
  cv.block25D(craftingFront, X_OFF + 7 * 16, 198 + Y_OFF, 0.96, 5, craftingTop);
  cv.block25D(furnaceFrontOn, X_OFF + 8 * 16, 198 + Y_OFF, 0.96, 0, furnaceTop);
  cv.block25D(bookshelf, X_OFF + 9 * 16, 198 + Y_OFF, 0.96, 0, oakPlanks);
  cv.block25D(tntSide, X_OFF + 10 * 16, 198 + Y_OFF, 0.96, 0, tntTop);
  cv.stamp(lantern, X_OFF + 8 * 16, 182 + Y_OFF, 1.0);
  cv.stamp(soulLantern, X_OFF + 3 * 16, 198 + Y_OFF, 1.0);
  cv.stamp(torch, X_OFF + 11 * 16, 198 + Y_OFF, 1.0);
  cv.stamp(amethystCluster, X_OFF + 12 * 16, 198 + Y_OFF, 1.0);

  // --- Cascada central de agua cristalina ---
  for (let by = 152 + Y_OFF; by < 246 + Y_OFF; by += 16) {
    cv.stamp(waterTex, X_OFF + 14 * 16, by, 0.98);
    for (let y = 0; y < 16; y++) {
      cv.set(X_OFF + 14 * 16, by + y, 186, 230, 253, 210);
      cv.set(X_OFF + 14 * 16 + 15, by + y, 125, 211, 252, 180);
    }
  }

  // =========================================================================
  // 4. DIORAMA OFICIAL MINECRAFT.NET (STEVE, ALEX, CREEPER Y DESIERTO 2.5D)
  // =========================================================================
  const refPath = path.join(__dirname, 'mc_diorama_ref.png');
  const refPng = decodePng(fs.readFileSync(refPath));
  const refX = X_OFF + 220;
  const refY = 150 + Y_OFF;

  for (let y = 0; y < refPng.h; y++) {
    for (let x = 0; x < refPng.w; x++) {
      const [r, g, b, a] = refPng.pix[y][x];
      if (a < 30) continue;
      if (r < 28 && g < 26 && b < 24) continue;
      cv.set(refX + x, refY + y, r, g, b, 255);
    }
  }

  // Cactus del desierto a la derecha del Creeper + antorcha junto a Steve
  cv.block25D(cactusSide, refX + 208, refY + 12, 0.95, 4, cactusSide);
  cv.block25D(cactusSide, refX + 208, refY + 28, 0.95, 4);
  cv.block25D(cactusSide, refX + 208, refY + 44, 0.95, 4);
  cv.stamp(torch, refX + 54, refY + 48, 1.0);
  cv.stamp(deadBush, refX + 224, refY + 64, 0.95);

  // =========================================================================
  // 5. ALA DERECHA (PARA PANTALLA COMPLETA: TEMPLO DEL DESIERTO 2.5D, bx = 42..52)
  // =========================================================================
  const templeStartBx = 42;
  const desertLower = [
    sandstone, cutSandstone, chiseledSandstone, orangeTerracotta, goldBlock,
    orangeTerracotta, chiseledSandstone, cutSandstone, sandstone, cutSandstone,
  ];
  for (let i = 0; i < desertLower.length; i++) {
    const bx = templeStartBx + i;
    cv.block25D(desertLower[i], bx * 16, 230 + Y_OFF, 0.90, i === 0 ? 5 : 0, sandstone);
  }
  cv.ditherBlock(sandstone, (templeStartBx + desertLower.length) * 16, 230 + Y_OFF, 0.76, 'right');

  // Fachada de Piramide / Templo del Desierto (bx = 43..49, y = 166..214 + Y_OFF)
  const templeMid = [cutSandstone, orangeTerracotta, chiseledSandstone, blueTerracotta, chiseledSandstone, orangeTerracotta, cutSandstone];
  for (let i = 0; i < templeMid.length; i++) {
    cv.block25D(templeMid[i], (43 + i) * 16, 214 + Y_OFF, 0.94, i === 0 ? 5 : 0, sandstone);
  }
  const templeTop = [cutSandstone, orangeTerracotta, chiseledSandstone, orangeTerracotta, cutSandstone];
  for (let i = 0; i < templeTop.length; i++) {
    cv.block25D(templeTop[i], (44 + i) * 16, 198 + Y_OFF, 0.95, i === 0 ? 5 : 0, sandstone);
  }
  cv.block25D(cutSandstone, 45 * 16, 182 + Y_OFF, 0.96, 5, sandstone);
  cv.block25D(orangeTerracotta, 46 * 16, 182 + Y_OFF, 0.96, 0, sandstone);
  cv.block25D(cutSandstone, 47 * 16, 182 + Y_OFF, 0.96, 0, sandstone);
  cv.block25D(chiseledSandstone, 46 * 16, 166 + Y_OFF, 0.98, 5, sandstone);
  cv.stamp(torch, 44 * 16, 182 + Y_OFF, 1.0);
  cv.stamp(torch, 48 * 16, 182 + Y_OFF, 1.0);
  // Cactus extra en bx = 50
  cv.block25D(cactusSide, 50 * 16, 198 + Y_OFF, 0.94, 4, cactusSide);
  cv.block25D(cactusSide, 50 * 16, 214 + Y_OFF, 0.94, 4);

  // =========================================================================
  // 6. SENDERO CONTINUO DE BLOQUES DE PASTO Y FLORES REALES (y = 516..540)
  // =========================================================================
  const flowers = [poppy, dandelion, blueOrchid, allium, oxeyeDaisy];
  const waterfallBx = (X_OFF / 16) + 14; // bx = 26
  for (let bx = 0; bx < 54; bx++) {
    const px = bx * 16;
    cv.block25D(grassSide, px, 246 + Y_OFF, 0.98, 0, grassTop);
    cv.stamp(dirt, px, 262 + Y_OFF, 0.86, 0, 8);
    if (bx % 4 === 1 && bx !== waterfallBx && bx !== 13) {
      const fl = flowers[(bx >> 2) % flowers.length];
      cv.stamp(fl, px, 230 + Y_OFF, 1.0);
    }
  }
  // Estanque donde cae la cascada
  cv.stamp(waterTex, waterfallBx * 16, 246 + Y_OFF, 0.98);
  cv.rect(waterfallBx * 16, 246 + Y_OFF, 16, 2, 224, 242, 254, 230);

  return cv;
}

// =========================================================================
// CAPAS DE ANIMACION PIXEL-ART (.mina-brillos.a y .mina-brillos.b)
// =========================================================================
function buildAnimLayer(frame) {
  const cv = createCanvas(W, H);
  const isB = frame === 1;

  // 1. Espuma de la cascada cayendo cuadro a cuadro
  for (let y = 152 + Y_OFF + (isB ? 8 : 0); y < 246 + Y_OFF; y += 16) {
    cv.rect(X_OFF + 14 * 16 + 3, y, 3, 5, 224, 242, 254, 235);
    cv.rect(X_OFF + 14 * 16 + 10, y + 6, 3, 5, 186, 230, 253, 215);
  }
  cv.rect(X_OFF + 14 * 16 + (isB ? 1 : 3), 244 + Y_OFF, isB ? 14 : 10, 2, 240, 249, 255, 245);

  // 2. Destellos en los minerales de Diamante, Esmeralda, Oro y Amatista
  const sparkles = isB
    ? [
        [X_OFF + 3 * 16 + 6, 236 + Y_OFF, [103, 232, 249]],
        [X_OFF + 6 * 16 + 9, 235 + Y_OFF, [110, 231, 183]],
        [X_OFF + 9 * 16 + 5, 220 + Y_OFF, [103, 232, 249]],
        [X_OFF + 12 * 16 + 8, 203 + Y_OFF, [232, 121, 249]],
        [46 * 16 + 8, 236 + Y_OFF, [253, 224, 71]],
      ]
    : [
        [X_OFF + 3 * 16 + 10, 239 + Y_OFF, [224, 242, 254]],
        [X_OFF + 10 * 16 + 7, 237 + Y_OFF, [253, 224, 71]],
        [X_OFF + 4 * 16 + 8, 221 + Y_OFF, [248, 113, 113]],
        [X_OFF + 12 * 16 + 6, 206 + Y_OFF, [245, 208, 254]],
        [8 * 16 + 7, 236 + Y_OFF, [147, 197, 253]],
      ];
  for (const [sx, sy, col] of sparkles) {
    cv.set(sx, sy, 255, 255, 255, 255);
    cv.set(sx - 1, sy, col[0], col[1], col[2], 220);
    cv.set(sx + 1, sy, col[0], col[1], col[2], 220);
    cv.set(sx, sy - 1, col[0], col[1], col[2], 220);
    cv.set(sx, sy + 1, col[0], col[1], col[2], 220);
  }

  // 3. Particulas purpuras del Portal del Nether
  const pShift = isB ? 3 : 0;
  cv.rect(X_OFF + 5 * 16 + 2 + pShift, 174 + Y_OFF - pShift, 2, 2, 245, 208, 254, 240);
  cv.rect(X_OFF + 5 * 16 + 11 - pShift, 188 + Y_OFF + pShift, 2, 2, 216, 180, 254, 240);
  cv.rect(X_OFF + 5 * 16 + 5, 201 + Y_OFF - pShift, 2, 2, 253, 244, 255, 240);

  // 4. Gotas de sorpresa del Creeper + chispas del horno + petalos de cerezo cayendo
  const refX = X_OFF + 220, refY = 150 + Y_OFF;
  if (isB) {
    cv.rect(refX + 159, refY + 18, 2, 2, 96, 165, 250, 255);
    cv.rect(refX + 165, refY + 21, 2, 2, 147, 197, 253, 255);
    cv.rect(refX + 155, refY + 23, 2, 2, 96, 165, 250, 255);
    cv.rect(X_OFF + 8 * 16 + 7, 192 + Y_OFF, 2, 2, 253, 224, 71, 235);
    cv.rect(X_OFF + 2 * 16 + 4, 196 + Y_OFF, 2, 2, 249, 168, 212, 230);
    cv.rect(X_OFF + 1 * 16 + 12, 210 + Y_OFF, 2, 2, 244, 114, 182, 230);
  } else {
    cv.rect(X_OFF + 8 * 16 + 8, 194 + Y_OFF, 2, 2, 249, 115, 22, 235);
    cv.rect(X_OFF + 2 * 16 + 8, 190 + Y_OFF, 2, 2, 249, 168, 212, 230);
    cv.rect(X_OFF + 1 * 16 + 9, 204 + Y_OFF, 2, 2, 244, 114, 182, 230);
  }

  return cv;
}

// =========================================================================
// COLINAS DEL BANNER (.hero-hills) — Proporcion 1:1 (480x48 -> 960x96 exacto 2x)
// =========================================================================
function buildHeroHillsPng() {
  const cv = createCanvas(480, 48);
  const sandstone = mcBlock('sandstone');
  const cutSandstone = mcBlock('cut_sandstone');
  const chiseledSandstone = mcBlock('chiseled_sandstone');
  const dirt = mcBlock('dirt');

  for (let bx = 0; bx < 30; bx++) {
    const isRaised = (bx >= 2 && bx <= 9) || (bx >= 20 && bx <= 27);
    const topY = isRaised ? 16 : 32;
    const leftDepth = bx === 2 || bx === 20 ? 5 : 0;
    if (bx >= 19) {
      cv.block25D(bx % 2 === 0 ? chiseledSandstone : cutSandstone, bx * 16, topY, 0.92, leftDepth, sandstone);
      if (isRaised) cv.block25D(sandstone, bx * 16, 32, 0.82, leftDepth);
    } else {
      cv.block25D(grassSide, bx * 16, topY, 0.92, leftDepth, grassTop);
      if (isRaised) cv.block25D(dirt, bx * 16, 32, 0.82, leftDepth);
    }
  }
  return cv;
}

function encodeSvg(svg) {
  const clean = svg.replace(/\r?\n\s*/g, ' ').replace(/>\s+</g, '><').trim();
  const enc = clean.replace(/%/g, '%25').replace(/#/g, '%23').replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${enc}")`;
}

const piedraSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#080d1a"/></svg>`;
const antorchaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="48" viewBox="0 0 8 16" shape-rendering="crispEdges"><rect x="3" y="6" width="2" height="8" fill="#6b4c2b"/><rect x="3" y="4" width="2" height="2" fill="#f97316"/><rect x="3" y="3" width="2" height="1" fill="#fef08a"/></svg>`;
const rielesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"></svg>`;
const vagonetaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="10" viewBox="0 0 16 10"></svg>`;
const heroStarsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="220" viewBox="0 0 480 110" shape-rendering="crispEdges"><g fill="#fef9c3" opacity="0.85"><rect x="24" y="14" width="2" height="2"/><rect x="68" y="28" width="2" height="2"/><rect x="118" y="12" width="2" height="2"/><rect x="164" y="34" width="2" height="2"/><rect x="218" y="18" width="2" height="2"/><rect x="276" y="10" width="2" height="2"/><rect x="334" y="24" width="2" height="2"/><rect x="388" y="14" width="2" height="2"/><rect x="442" y="26" width="2" height="2"/></g><rect x="302" y="12" width="20" height="20" fill="#fef9c3" opacity="0.22"/><rect x="305" y="15" width="14" height="14" fill="#fefce8"/><rect x="307" y="17" width="4" height="3" fill="#fde68a"/><rect x="312" y="22" width="4" height="4" fill="#fde68a"/></svg>`;

const mainCv = buildMainScene();
const animACv = buildAnimLayer(0);
const animBCv = buildAnimLayer(1);
const heroHillsCv = buildHeroHillsPng();

const css = [
  '/* MINA-INICIO (lo escribe tools/generar_mina.js; no lo edites a mano) */',
  `.piedra { background-image: ${encodeSvg(piedraSvg)}; background-size: 64px 64px; }`,
  `.mina-ores { background-image: ${encodePngDataUrl(mainCv.w, mainCv.h, mainCv.buf)}; background-size: 1728px 1080px; background-position: center bottom; }`,
  `.mina-brillos.a { background-image: ${encodePngDataUrl(animACv.w, animACv.h, animACv.buf)}; background-size: 1728px 1080px; background-position: center bottom; }`,
  `.mina-brillos.b { background-image: ${encodePngDataUrl(animBCv.w, animBCv.h, animBCv.buf)}; background-size: 1728px 1080px; background-position: center bottom; }`,
  `.antorcha { background: ${encodeSvg(antorchaSvg)} center / contain no-repeat; }`,
  `.rieles { background-image: ${encodeSvg(rielesSvg)}; background-size: 16px 16px; }`,
  `.vagoneta { background: ${encodeSvg(vagonetaSvg)} center / contain no-repeat; }`,
  `.hero-stars { background-image: ${encodeSvg(heroStarsSvg)}; background-size: 960px 220px; }`,
  `.hero-hills { background-image: ${encodePngDataUrl(heroHillsCv.w, heroHillsCv.h, heroHillsCv.buf)}; background-size: 960px 96px; }`,
  '/* MINA-FIN */',
].join('\n');

const stylePath = path.join(__dirname, '..', 'app', 'renderer', 'style.css');
const actual = fs.readFileSync(stylePath, 'utf8');
const ini = actual.indexOf('/* MINA-INICIO');
const fin = actual.indexOf('/* MINA-FIN */');
if (ini === -1 || fin === -1) {
  throw new Error('No encontre las marcas MINA-INICIO / MINA-FIN en style.css');
}
const nuevo = actual.slice(0, ini) + css + actual.slice(fin + '/* MINA-FIN */'.length);
fs.writeFileSync(stylePath, nuevo);
console.log('mina escrita en style.css (' + css.length + ' caracteres)');
