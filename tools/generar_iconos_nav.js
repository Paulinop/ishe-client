'use strict';
// Genera los 5 iconos 3D isométricos de la barra lateral a partir de las texturas reales de Minecraft 26.2
// aplicando proyección isométrica exacta de inventario de Minecraft (cara superior 100%, izquierda 82%, derecha 64%)
// con supermuestreo 4x para bordes exteriores limpios y píxeles internos nítidos.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buffer) {
  let offset = 8;
  let ihdr = null;
  const idats = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
      };
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idats));
  // Handle indexed palette (colorType === 3) or grayscale/RGB/RGBA
  if (ihdr.colorType === 3) {
    // Find PLTE and tRNS
    let plte = null;
    let trns = null;
    let off2 = 8;
    while (off2 < buffer.length) {
      const l = buffer.readUInt32BE(off2);
      const t = buffer.toString('ascii', off2 + 4, off2 + 8);
      const d = buffer.slice(off2 + 8, off2 + 8 + l);
      if (t === 'PLTE') plte = d;
      if (t === 'tRNS') trns = d;
      off2 += 12 + l;
    }
    const pixels = Buffer.alloc(ihdr.width * ihdr.height * 4);
    const bpp = 1;
    const stride = Math.ceil((ihdr.width * ihdr.bitDepth) / 8);
    let srcPos = 0;
    const prevRow = Buffer.alloc(stride);
    const currRow = Buffer.alloc(stride);
    for (let y = 0; y < ihdr.height; y++) {
      const filter = decompressed[srcPos++];
      for (let i = 0; i < stride; i++) {
        const raw = decompressed[srcPos++];
        const a = i >= bpp ? currRow[i - bpp] : 0;
        const b = prevRow[i];
        const c = i >= bpp ? prevRow[i - bpp] : 0;
        let val = raw;
        if (filter === 1) val = (raw + a) & 0xff;
        else if (filter === 2) val = (raw + b) & 0xff;
        else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
        else if (filter === 4) val = (raw + paethPredictor(a, b, c)) & 0xff;
        currRow[i] = val;
      }
      for (let x = 0; x < ihdr.width; x++) {
        let idx = 0;
        if (ihdr.bitDepth === 8) idx = currRow[x];
        else if (ihdr.bitDepth === 4) idx = (currRow[x >> 1] >> ((1 - (x & 1)) * 4)) & 0x0f;
        else if (ihdr.bitDepth === 2) idx = (currRow[x >> 2] >> ((3 - (x & 3)) * 2)) & 0x03;
        else if (ihdr.bitDepth === 1) idx = (currRow[x >> 3] >> (7 - (x & 7))) & 0x01;
        const dstIdx = (y * ihdr.width + x) * 4;
        pixels[dstIdx] = plte ? plte[idx * 3] : 0;
        pixels[dstIdx + 1] = plte ? plte[idx * 3 + 1] : 0;
        pixels[dstIdx + 2] = plte ? plte[idx * 3 + 2] : 0;
        pixels[dstIdx + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
      currRow.copy(prevRow);
    }
    return { width: ihdr.width, height: ihdr.height, pixels };
  }

  const bpp = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : ihdr.colorType === 4 ? 2 : 1;
  const stride = ihdr.width * bpp;
  const pixels = Buffer.alloc(ihdr.width * ihdr.height * 4);
  let srcPos = 0;
  const prevRow = Buffer.alloc(stride);
  const currRow = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.height; y++) {
    const filter = decompressed[srcPos++];
    for (let i = 0; i < stride; i++) {
      const raw = decompressed[srcPos++];
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let val = raw;
      if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) val = (raw + paethPredictor(a, b, c)) & 0xff;
      currRow[i] = val;
    }
    for (let x = 0; x < ihdr.width; x++) {
      const dstIdx = (y * ihdr.width + x) * 4;
      const srcIdx = x * bpp;
      if (bpp === 4) {
        pixels[dstIdx] = currRow[srcIdx];
        pixels[dstIdx + 1] = currRow[srcIdx + 1];
        pixels[dstIdx + 2] = currRow[srcIdx + 2];
        pixels[dstIdx + 3] = currRow[srcIdx + 3];
      } else if (bpp === 3) {
        pixels[dstIdx] = currRow[srcIdx];
        pixels[dstIdx + 1] = currRow[srcIdx + 1];
        pixels[dstIdx + 2] = currRow[srcIdx + 2];
        pixels[dstIdx + 3] = 255;
      } else if (bpp === 2) {
        pixels[dstIdx] = currRow[srcIdx];
        pixels[dstIdx + 1] = currRow[srcIdx];
        pixels[dstIdx + 2] = currRow[srcIdx];
        pixels[dstIdx + 3] = currRow[srcIdx + 1];
      } else {
        pixels[dstIdx] = currRow[srcIdx];
        pixels[dstIdx + 1] = currRow[srcIdx];
        pixels[dstIdx + 2] = currRow[srcIdx];
        pixels[dstIdx + 3] = currRow[srcIdx] === 0 ? 0 : 255;
      }
    }
    currRow.copy(prevRow);
  }
  return { width: ihdr.width, height: ihdr.height, pixels };
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    crc ^= buf[n];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const headAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(headAndData));
  return Buffer.concat([len, headAndData, crcBuf]);
}

function encodePNG(width, height, pixels) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.subarray(y * width * 4, (y + 1) * width * 4)));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function loadTex(file) {
  return decodePNG(fs.readFileSync(file));
}

function crop16(tex, sx = 0, sy = 0, sw = 16, sh = 16) {
  const out = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const tx = sx + Math.floor((x * sw) / 16);
      const ty = sy + Math.floor((y * sh) / 16);
      const si = (ty * tex.width + tx) * 4;
      const di = (y * 16 + x) * 4;
      out[di] = tex.pixels[si];
      out[di + 1] = tex.pixels[si + 1];
      out[di + 2] = tex.pixels[si + 2];
      out[di + 3] = tex.pixels[si + 3];
    }
  }
  return out;
}

function tintTex(buf16, rMul, gMul, bMul) {
  const out = Buffer.from(buf16);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.min(255, Math.round(out[i] * rMul));
    out[i + 1] = Math.min(255, Math.round(out[i + 1] * gMul));
    out[i + 2] = Math.min(255, Math.round(out[i + 2] * bMul));
  }
  return out;
}

function compositeOver(base16, over16) {
  const out = Buffer.from(base16);
  for (let i = 0; i < out.length; i += 4) {
    const a = over16[i + 3] / 255;
    if (a > 0) {
      out[i] = Math.round(over16[i] * a + out[i] * (1 - a));
      out[i + 1] = Math.round(over16[i + 1] * a + out[i + 1] * (1 - a));
      out[i + 2] = Math.round(over16[i + 2] * a + out[i + 2] * (1 - a));
      out[i + 3] = 255;
    }
  }
  return out;
}

// Renderiza un cubo 3D isométrico de 80x80 con supermuestreo 4x (320x320 interno)
function renderIsoCube(top16, left16, right16, outPath) {
  const OUT_S = 80;
  const SS = 4;
  const W = OUT_S * SS;
  const H = OUT_S * SS;
  const hi = Buffer.alloc(W * H * 4);

  // Centro del cubo y vectores de las aristas en espacio 320x320:
  // Vértice central (donde se unen Top, Left y Right): (cx, cy)
  const cx = W / 2;
  const cy = H * 0.50;
  const rx = W * 0.42; // semiancho horizontal (de centro a esquina izq/der)
  const ry = H * 0.215; // semialto de la cara superior
  const hz = H * 0.43; // altura vertical de las caras laterales

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const dx = px - cx;
      const dy = py - cy;

      let face = null;
      let u = 0;
      let v = 0;
      let shade = 1.0;

      // 1) Probar cara SUPERIOR (rombo entre (0,-2*ry), (-rx,-ry), (0,0), (rx,-ry))
      // Vector U (de top-most a right): (rx, ry), Vector V (de top-most a left): (-rx, ry)
      const dTopY = dy + 2 * ry;
      const uTop = 0.5 * (dx / rx + dTopY / ry);
      const vTop = 0.5 * (-dx / rx + dTopY / ry);

      if (uTop >= 0 && uTop < 1 && vTop >= 0 && vTop < 1) {
        face = top16;
        u = uTop;
        v = vTop;
        shade = 1.02;
      } else if (dx < 0) {
        // 2) Probar cara IZQUIERDA (paralelogramo: top-left (-rx, -ry) -> center (0, 0), bajando hz)
        const uLeft = (dx + rx) / rx;
        const vLeft = (dy + ry - uLeft * ry) / hz;
        if (uLeft >= 0 && uLeft < 1 && vLeft >= 0 && vLeft < 1) {
          face = left16;
          u = uLeft;
          v = vLeft;
          shade = 0.84;
        }
      } else {
        // 3) Probar cara DERECHA (paralelogramo: center (0, 0) -> top-right (rx, -ry), bajando hz)
        const uRight = dx / rx;
        const vRight = (dy + uRight * ry) / hz;
        if (uRight >= 0 && uRight < 1 && vRight >= 0 && vRight < 1) {
          face = right16;
          u = uRight;
          v = vRight;
          shade = 0.64;
        }
      }

      if (face) {
        const tx = Math.min(15, Math.max(0, Math.floor(u * 16)));
        const ty = Math.min(15, Math.max(0, Math.floor(v * 16)));
        const si = (ty * 16 + tx) * 4;
        const di = (py * W + px) * 4;

        let r = Math.min(255, Math.round(face[si] * shade));
        let g = Math.min(255, Math.round(face[si + 1] * shade));
        let b = Math.min(255, Math.round(face[si + 2] * shade));

        // Sutil bisel luminoso en las aristas de unión superiores
        if (face !== top16 && v < 0.035) {
          r = Math.min(255, r + 18);
          g = Math.min(255, g + 18);
          b = Math.min(255, b + 18);
        }

        hi[di] = r;
        hi[di + 1] = g;
        hi[di + 2] = b;
        hi[di + 3] = 255;
      }
    }
  }

  // Downsample 4x4 a 80x80
  const out = Buffer.alloc(OUT_S * OUT_S * 4);
  for (let y = 0; y < OUT_S; y++) {
    for (let x = 0; x < OUT_S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const idx = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          const pa = hi[idx + 3];
          r += hi[idx] * pa;
          g += hi[idx + 1] * pa;
          b += hi[idx + 2] * pa;
          a += pa;
        }
      }
      const di = (y * OUT_S + x) * 4;
      if (a > 0) {
        out[di] = Math.round(r / a);
        out[di + 1] = Math.round(g / a);
        out[di + 2] = Math.round(b / a);
        out[di + 3] = Math.round(a / (SS * SS));
      }
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodePNG(OUT_S, OUT_S, out));
  console.log('Generated:', outPath);
}

const tmpDir = path.join(__dirname, 'mc-tex-tmp');
const outDir = path.join(__dirname, '..', 'app', 'renderer', 'assets', 'nav');

// 1. JUGAR: Bloque de Césped Oficial (grass_block_top + grass_block_side + grass_block_side_overlay)
const grassTopRaw = crop16(loadTex(path.join(tmpDir, 'grass_block_top.png')));
const grassSideRaw = crop16(loadTex(path.join(tmpDir, 'grass_block_side.png')));
const grassOverRaw = crop16(loadTex(path.join(tmpDir, 'grass_block_side_overlay.png')));
// Color oficial de pradera/jungla vibrante de Minecraft (#7cbd38 -> multiplicadores 0.52, 0.82, 0.26 sobre gris)
const grassTop = tintTex(grassTopRaw, 0.56, 0.86, 0.28);
const grassOver = tintTex(grassOverRaw, 0.56, 0.86, 0.28);
const grassSide = compositeOver(grassSideRaw, grassOver);
renderIsoCube(grassTop, grassSide, grassSide, path.join(outDir, 'nav-play.png'));

// 2. ASPECTOS: Cabeza 3D de Steve Oficial (entity/player/wide/steve.png)
const steveTex = loadTex(path.join(tmpDir, 'steve.png'));
const steveTop = compositeOver(crop16(steveTex, 8, 0, 8, 8), crop16(steveTex, 40, 0, 8, 8));
const steveFront = compositeOver(crop16(steveTex, 8, 8, 8, 8), crop16(steveTex, 40, 8, 8, 8));
const steveRight = compositeOver(crop16(steveTex, 0, 8, 8, 8), crop16(steveTex, 32, 8, 8, 8));
renderIsoCube(steveTop, steveFront, steveRight, path.join(outDir, 'nav-skins.png'));

// 3. CAPTURAS: Estantería Cincelada / Cuadro de Minecraft (chiseled_bookshelf + sunset painting)
const chiseledTop = crop16(loadTex(path.join(tmpDir, 'chiseled_bookshelf_top.png')));
const sunsetPainting = crop16(loadTex(path.join(tmpDir, 'sunset.png')), 0, 0, 16, 16);
const chiseledOccupied = crop16(loadTex(path.join(tmpDir, 'chiseled_bookshelf_occupied.png')));
// Enmarcar el cuadro sunset dentro de un borde de roble de 1px
const framedSunset = Buffer.from(chiseledTop);
for (let y = 2; y < 14; y++) {
  for (let x = 2; x < 14; x++) {
    const si = (y * 16 + x) * 4;
    framedSunset[si] = sunsetPainting[si];
    framedSunset[si + 1] = sunsetPainting[si + 1];
    framedSunset[si + 2] = sunsetPainting[si + 2];
    framedSunset[si + 3] = 255;
  }
}
renderIsoCube(chiseledTop, framedSunset, chiseledOccupied, path.join(outDir, 'nav-shots.png'));

// 4. MODS: Mesa de Trabajo Oficial (crafting_table_top, crafting_table_front, crafting_table_side)
const craftTop = crop16(loadTex(path.join(tmpDir, 'crafting_table_top.png')));
const craftFront = crop16(loadTex(path.join(tmpDir, 'crafting_table_front.png')));
const craftSide = crop16(loadTex(path.join(tmpDir, 'crafting_table_side.png')));
renderIsoCube(craftTop, craftFront, craftSide, path.join(outDir, 'nav-mods.png'));

// 5. AJUSTES: Bloque de Comandos Oficial (command_block_front/side/back primer cuadro 16x16)
const cmdFront = crop16(loadTex(path.join(tmpDir, 'command_block_front.png')), 0, 0, 16, 16);
const cmdSide = crop16(loadTex(path.join(tmpDir, 'command_block_side.png')), 0, 0, 16, 16);
const cmdBack = crop16(loadTex(path.join(tmpDir, 'command_block_back.png')), 0, 0, 16, 16);
renderIsoCube(cmdBack, cmdFront, cmdSide, path.join(outDir, 'nav-settings.png'));
