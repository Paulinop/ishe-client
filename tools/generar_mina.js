// Genera los fondos SVG de alta definicion (vector suave, sin bloques cuadrados)
// para el paisaje nocturno animado (.mina-ores, .mina-brillos, .rieles, .hero-stars, .hero-hills)
// y los incrusta en app/renderer/style.css entre /* MINA-INICIO */ y /* MINA-FIN */.
// Uso: node tools/generar_mina.js

const fs = require('fs');
const path = require('path');

function encodeSvg(svg) {
  const clean = svg
    .replace(/\r?\n\s*/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  const enc = clean
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/"/g, "'")
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${enc}")`;
}

// Generador determinista para estrellas, pinos y detalles naturales
let seed = 20261012;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// Helper para dibujar un pino estilizado suave (capas triangulares curvas)
function pineTree(cx, baseY, h, colorBack, colorFront) {
  const w = h * 0.42;
  const p1 = `${cx},${baseY - h} ${cx - w * 0.55},${baseY - h * 0.58} ${cx + w * 0.55},${baseY - h * 0.58}`;
  const p2 = `${cx},${baseY - h * 0.78} ${cx - w * 0.78},${baseY - h * 0.28} ${cx + w * 0.78},${baseY - h * 0.28}`;
  const p3 = `${cx},${baseY - h * 0.52} ${cx - w},${baseY} ${cx + w},${baseY}`;
  const p1R = `${cx},${baseY - h} ${cx},${baseY - h * 0.58} ${cx + w * 0.55},${baseY - h * 0.58}`;
  const p2R = `${cx},${baseY - h * 0.78} ${cx},${baseY - h * 0.28} ${cx + w * 0.78},${baseY - h * 0.28}`;
  const p3R = `${cx},${baseY - h * 0.52} ${cx},${baseY} ${cx + w},${baseY}`;
  return (
    `<polygon fill="${colorBack}" points="${p3}"/>` +
    `<polygon fill="${colorBack}" points="${p2}"/>` +
    `<polygon fill="${colorBack}" points="${p1}"/>` +
    `<polygon fill="${colorFront}" opacity="0.55" points="${p3R}"/>` +
    `<polygon fill="${colorFront}" opacity="0.55" points="${p2R}"/>` +
    `<polygon fill="${colorFront}" opacity="0.55" points="${p1R}"/>`
  );
}

// Helper para cerezo (sakura) suave con copa organica y tronco
function sakuraTree(cx, baseY, scale) {
  const th = 38 * scale;
  const tw = 5 * scale;
  return (
    `<g>` +
    `<path fill="#2d1920" d="M${cx - tw},${baseY} L${cx - tw * 0.6},${baseY - th} L${cx + tw * 0.6},${baseY - th} L${cx + tw},${baseY} Z"/>` +
    `<path stroke="#2d1920" stroke-width="${2.5 * scale}" stroke-linecap="round" fill="none" d="M${cx},${baseY - th * 0.65} Q${cx - 14 * scale},${baseY - th * 0.9} ${cx - 22 * scale},${baseY - th * 1.05} M${cx},${baseY - th * 0.75} Q${cx + 12 * scale},${baseY - th * 0.95} ${cx + 20 * scale},${baseY - th * 1.08}"/>` +
    `<ellipse cx="${cx}" cy="${baseY - th * 1.15}" rx="${34 * scale}" ry="${20 * scale}" fill="#9d174d" opacity="0.55"/>` +
    `<ellipse cx="${cx - 16 * scale}" cy="${baseY - th * 1.08}" rx="${24 * scale}" ry="${15 * scale}" fill="#db2777"/>` +
    `<ellipse cx="${cx + 16 * scale}" cy="${baseY - th * 1.06}" rx="${24 * scale}" ry="${15 * scale}" fill="#be185d"/>` +
    `<ellipse cx="${cx}" cy="${baseY - th * 1.24}" rx="${28 * scale}" ry="${17 * scale}" fill="#f472b6"/>` +
    `<ellipse cx="${cx - 8 * scale}" cy="${baseY - th * 1.3}" rx="${18 * scale}" ry="${10 * scale}" fill="#fbcfe8" opacity="0.85"/>` +
    `</g>`
  );
}

// Helper para cristal luminoso facetado
function crystalCluster(cx, baseY, scale, cMain, cLight, cDark, glowId) {
  const s = scale;
  return (
    `<g>` +
    `<ellipse cx="${cx}" cy="${baseY - 6 * s}" rx="${26 * s}" ry="${12 * s}" fill="url(#${glowId})" opacity="0.55"/>` +
    // Cristal central
    `<polygon fill="${cMain}" points="${cx - 6 * s},${baseY} ${cx - 8 * s},${baseY - 26 * s} ${cx},${baseY - 38 * s} ${cx + 8 * s},${baseY - 26 * s} ${cx + 6 * s},${baseY}"/>` +
    `<polygon fill="${cLight}" points="${cx - 6 * s},${baseY} ${cx - 8 * s},${baseY - 26 * s} ${cx},${baseY - 38 * s} ${cx},${baseY}"/>` +
    // Cristal izquierdo
    `<polygon fill="${cDark}" points="${cx - 16 * s},${baseY} ${cx - 22 * s},${baseY - 16 * s} ${cx - 15 * s},${baseY - 24 * s} ${cx - 8 * s},${baseY - 14 * s} ${cx - 6 * s},${baseY}"/>` +
    `<polygon fill="${cMain}" points="${cx - 16 * s},${baseY} ${cx - 22 * s},${baseY - 16 * s} ${cx - 15 * s},${baseY - 24 * s} ${cx - 11 * s},${baseY}"/>` +
    // Cristal derecho
    `<polygon fill="${cDark}" points="${cx + 6 * s},${baseY} ${cx + 10 * s},${baseY - 15 * s} ${cx + 18 * s},${baseY - 22 * s} ${cx + 21 * s},${baseY - 13 * s} ${cx + 15 * s},${baseY}"/>` +
    `</g>`
  );
}

// =========================================================================
// 1. ESCENA PRINCIPAL (.mina-ores) — 1920x1080 Vector Ilustrado de Alta Definicion
// =========================================================================
function buildMainSceneSvg() {
  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">`
  );

  // Definiciones de gradientes atmosfericos suaves
  parts.push(`<defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#040711"/>
      <stop offset="22%" stop-color="#081226"/>
      <stop offset="48%" stop-color="#0f2342"/>
      <stop offset="72%" stop-color="#18395a"/>
      <stop offset="100%" stop-color="#23536d"/>
    </linearGradient>

    <linearGradient id="auroraGreen" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0"/>
      <stop offset="30%" stop-color="#34d399" stop-opacity="0.38"/>
      <stop offset="65%" stop-color="#2dd4bf" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="auroraViolet" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0"/>
      <stop offset="35%" stop-color="#2dd4bf" stop-opacity="0.28"/>
      <stop offset="70%" stop-color="#a855f7" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#c084fc" stop-opacity="0"/>
    </linearGradient>

    <radialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fef9c3" stop-opacity="0.55"/>
      <stop offset="32%" stop-color="#bae6fd" stop-opacity="0.22"/>
      <stop offset="68%" stop-color="#38bdf8" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="farMtn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b3554"/>
      <stop offset="100%" stop-color="#0e1e33"/>
    </linearGradient>

    <linearGradient id="midMtnDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#17314c"/>
      <stop offset="100%" stop-color="#0a1829"/>
    </linearGradient>

    <linearGradient id="midMtnLit" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#356288"/>
      <stop offset="55%" stop-color="#214263"/>
      <stop offset="100%" stop-color="#11263c"/>
    </linearGradient>

    <linearGradient id="snowCap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0f9ff" stop-opacity="0.95"/>
      <stop offset="65%" stop-color="#bae6fd" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="valleyMist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5eead4" stop-opacity="0"/>
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="hillBack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#13333e"/>
      <stop offset="100%" stop-color="#091b24"/>
    </linearGradient>

    <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f2c32"/>
      <stop offset="100%" stop-color="#07161c"/>
    </linearGradient>

    <linearGradient id="hillFront" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d2528"/>
      <stop offset="100%" stop-color="#051115"/>
    </linearGradient>

    <linearGradient id="lakeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#11324d"/>
      <stop offset="28%" stop-color="#0c253b"/>
      <stop offset="68%" stop-color="#081929"/>
      <stop offset="100%" stop-color="#040d17"/>
    </linearGradient>

    <linearGradient id="waterfallGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.95"/>
      <stop offset="40%" stop-color="#7dd3fc" stop-opacity="0.85"/>
      <stop offset="85%" stop-color="#38bdf8" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#bae6fd" stop-opacity="0.95"/>
    </linearGradient>

    <radialGradient id="portalGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f0abfc" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#c084fc" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#7e22ce" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#581c87" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="warmGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fef08a" stop-opacity="0.85"/>
      <stop offset="35%" stop-color="#f59e0b" stop-opacity="0.38"/>
      <stop offset="70%" stop-color="#d97706" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#b45309" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="cyanGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.75"/>
      <stop offset="45%" stop-color="#06b6d4" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#0891b2" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="meadowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#132e26"/>
      <stop offset="45%" stop-color="#0c201b"/>
      <stop offset="100%" stop-color="#06110e"/>
    </linearGradient>
  </defs>`);

  // 1. Cielo nocturno degradado
  parts.push(`<rect x="0" y="0" width="1920" height="760" fill="url(#skyGrad)"/>`);

  // 2. Nebulosa y cintas suaves de Aurora Boreal (curvas Bezier organicas)
  parts.push(
    `<path fill="url(#auroraViolet)" d="M-80,290 C220,140 520,310 860,170 C1190,35 1490,230 2000,110 L2000,10 L-80,10 Z"/>` +
    `<path fill="url(#auroraGreen)" d="M-60,340 C260,190 540,80 920,210 C1280,330 1580,110 1980,220 L1980,30 C1580,10 1260,190 920,85 C540,-20 260,95 -60,210 Z"/>` +
    `<path fill="url(#auroraGreen)" opacity="0.65" d="M120,260 C460,110 780,240 1140,120 C1440,20 1690,150 1960,80 L1960,15 C1690,65 1440,-30 1140,45 C780,150 460,35 120,165 Z"/>`
  );

  // 3. Campo de estrellas suaves (circulos de distintos tamanos y destellos de 4 puntas)
  let starsSvg = `<g fill="#f8fafc">`;
  for (let i = 0; i < 110; i++) {
    const sx = Math.round(rnd() * 1900 + 10);
    const sy = Math.round(rnd() * 430 + 12);
    const sr = (0.7 + rnd() * 1.5).toFixed(1);
    const so = (0.25 + rnd() * 0.65).toFixed(2);
    starsSvg += `<circle cx="${sx}" cy="${sy}" r="${sr}" opacity="${so}"/>`;
  }
  starsSvg += `</g>`;
  // Estrellas brillantes de 4 puntas suaves
  const brightStars = [
    [160, 74, 1.1], [340, 128, 0.9], [580, 62, 1.3], [820, 96, 1.0],
    [1080, 58, 1.2], [1310, 118, 0.95], [1490, 70, 1.15], [1790, 92, 1.0]
  ];
  for (const [bx, by, bs] of brightStars) {
    const r = 7 * bs;
    starsSvg += `<circle cx="${bx}" cy="${by}" r="${r * 1.8}" fill="#bae6fd" opacity="0.18"/>`;
    starsSvg += `<path fill="#fffbeb" d="M${bx},${by - r} Q${bx},${by} ${bx + r},${by} Q${bx},${by} ${bx},${by + r} Q${bx},${by} ${bx - r},${by} Q${bx},${by} ${bx},${by - r} Z"/>`;
  }
  parts.push(starsSvg);

  // 4. Luna llena luminosa con halo suave y crateres sutiles
  const mx = 1620, my = 136;
  parts.push(
    `<circle cx="${mx}" cy="${my}" r="170" fill="url(#moonHalo)"/>` +
    `<circle cx="${mx}" cy="${my}" r="68" fill="#fef9c3" opacity="0.22"/>` +
    `<circle cx="${mx}" cy="${my}" r="46" fill="#fefce8"/>` +
    `<circle cx="${mx - 12}" cy="${my - 10}" r="8" fill="#fde68a" opacity="0.45"/>` +
    `<circle cx="${mx + 15}" cy="${my + 8}" r="11" fill="#fde68a" opacity="0.38"/>` +
    `<circle cx="${mx - 4}" cy="${my + 18}" r="6" fill="#fde68a" opacity="0.35"/>`
  );

  // 5. Cordillera lejana (silueta suave al fondo)
  parts.push(
    `<path fill="url(#farMtn)" d="M0,560 L0,390 L110,335 L230,385 L370,275 L510,360 L660,295 L820,390 L980,250 L1140,355 L1290,285 L1450,375 L1610,310 L1760,370 L1920,295 L1920,560 Z"/>`
  );

  // 6. Cordillera principal con facetas iluminadas y cumbres nevadas suaves
  // Silueta base oscura
  parts.push(
    `<polygon fill="url(#midMtnDark)" points="0,620 0,430 180,310 340,425 560,230 770,415 960,320 1190,195 1420,395 1590,275 1770,395 1920,330 1920,620"/>`
  );
  // Facetas iluminadas por la luna y la aurora
  parts.push(
    `<polygon fill="url(#midMtnLit)" points="180,310 340,425 235,520 95,460"/>` +
    `<polygon fill="url(#midMtnLit)" points="560,230 770,415 620,535 470,410"/>` +
    `<polygon fill="url(#midMtnLit)" points="960,320 1085,430 985,510 890,415"/>` +
    `<polygon fill="url(#midMtnLit)" points="1190,195 1420,395 1255,540 1110,375"/>` +
    `<polygon fill="url(#midMtnLit)" points="1590,275 1770,395 1645,520 1510,390"/>`
  );
  // Cumbres nevadas suaves
  parts.push(
    `<polygon fill="url(#snowCap)" points="180,310 232,347 198,362 176,345 152,364 134,342"/>` +
    `<polygon fill="url(#snowCap)" points="560,230 632,293 590,312 562,284 532,315 504,282"/>` +
    `<polygon fill="url(#snowCap)" points="1190,195 1272,266 1228,288 1194,256 1158,290 1126,258"/>` +
    `<polygon fill="url(#snowCap)" points="1590,275 1652,316 1615,332 1588,308 1562,330 1540,310"/>`
  );

  // Neblina suave flotando entre las montanas
  parts.push(`<rect x="0" y="395" width="1920" height="175" fill="url(#valleyMist)"/>`);

  // 7. Colinas boscosas intermedias (curvas suaves)
  parts.push(
    `<path fill="url(#hillBack)" d="M0,690 L0,515 Q190,445 410,505 T830,490 T1280,475 T1690,505 L1920,475 L1920,690 Z"/>` +
    `<path fill="url(#hillMid)" d="M0,730 L0,565 Q240,510 510,560 T980,545 T1460,525 T1920,555 L1920,730 Z"/>`
  );

  // 8. Dos Cascadas Gemelas cayendo desde los acantilados hacia el lago
  // Cascada izquierda (x=545) y cascada central-izquierda (x=765)
  parts.push(
    `<g>` +
    // Rocas del acantilado
    `<path fill="#0b1d28" d="M505,495 Q555,485 605,495 L620,695 L490,695 Z"/>` +
    `<path fill="#0b1d28" d="M735,515 Q775,505 815,515 L828,695 L722,695 Z"/>` +
    // Agua cayendo
    `<path fill="url(#waterfallGrad)" d="M532,495 Q555,498 578,495 L592,695 L518,695 Z"/>` +
    `<path fill="#e0f2fe" opacity="0.65" d="M545,496 L555,496 L562,695 L538,695 Z"/>` +
    `<path fill="url(#waterfallGrad)" d="M758,515 Q774,517 790,515 L800,695 L748,695 Z"/>` +
    `<path fill="#e0f2fe" opacity="0.6" d="M768,516 L776,516 L782,695 L762,695 Z"/>` +
    // Bruma en la base de las cascadas
    `<ellipse cx="555" cy="692" rx="68" ry="18" fill="url(#cyanGlow)"/>` +
    `<ellipse cx="555" cy="694" rx="42" ry="8" fill="#e0f2fe" opacity="0.8"/>` +
    `<ellipse cx="774" cy="692" rx="52" ry="15" fill="url(#cyanGlow)"/>` +
    `<ellipse cx="774" cy="694" rx="32" ry="7" fill="#e0f2fe" opacity="0.75"/>` +
    `</g>`
  );

  // 9. Colina frontal de la orilla
  parts.push(
    `<path fill="url(#hillFront)" d="M0,710 L0,615 Q180,575 390,625 Q480,645 520,692 L810,692 Q960,605 1210,610 Q1460,615 1660,645 Q1800,665 1920,635 L1920,710 Z"/>`
  );

  // 10. Portal Ancestral Luminoso sobre la colina izquierda (x=665, baseY=635)
  const px = 665, py = 638;
  parts.push(
    `<g>` +
    `<circle cx="${px}" cy="${py - 58}" r="95" fill="url(#portalGlow)"/>` +
    // Base escalonada
    `<rect x="${px - 46}" y="${py - 12}" width="92" height="12" rx="3" fill="#1e1b2e"/>` +
    `<rect x="${px - 38}" y="${py - 22}" width="76" height="11" rx="2" fill="#2b2640"/>` +
    // Pilares y arco de piedra tallada
    `<rect x="${px - 32}" y="${py - 112}" width="16" height="90" rx="2" fill="#252138"/>` +
    `<rect x="${px + 16}" y="${py - 112}" width="16" height="90" rx="2" fill="#1b182b"/>` +
    `<path fill="#332d4d" d="M${px - 38},${py - 108} Q${px},${py - 134} ${px + 38},${py - 108} L${px + 32},${py - 96} Q${px},${py - 114} ${px - 32},${py - 96} Z"/>` +
    // Energia del portal
    `<rect x="${px - 16}" y="${py - 102}" width="32" height="80" rx="14" fill="#a855f7" opacity="0.85"/>` +
    `<rect x="${px - 10}" y="${py - 94}" width="20" height="64" rx="10" fill="#e879f9" opacity="0.9"/>` +
    `<rect x="${px - 4}" y="${py - 82}" width="8" height="42" rx="4" fill="#fdf4ff"/>` +
    `</g>`
  );

  // 11. Cabana de Madera Acogedora + Muelle + Fogata en la colina derecha (x=1380, baseY=635)
  const hx = 1380, hy = 636;
  parts.push(
    `<g>` +
    // Resplandor calido de la cabana
    `<circle cx="${hx}" cy="${hy - 36}" r="120" fill="url(#warmGlow)"/>` +
    // Chimenea
    `<rect x="${hx + 24}" y="${hy - 105}" width="14" height="45" rx="2" fill="#334155"/>` +
    // Cuerpo de madera
    `<rect x="${hx - 48}" y="${hy - 58}" width="96" height="58" rx="3" fill="#452715"/>` +
    `<rect x="${hx - 48}" y="${hy - 58}" width="48" height="58" fill="#5c341d"/>` +
    // Tejado a dos aguas con alero suave
    `<polygon fill="#29150c" points="${hx - 62},${hy - 54} ${hx},${hy - 106} ${hx + 62},${hy - 54}"/>` +
    `<polygon fill="#3f2012" points="${hx - 62},${hy - 54} ${hx},${hy - 106} ${hx},${hy - 54}"/>` +
    // Ventanas iluminadas con marco
    `<rect x="${hx - 32}" y="${hy - 42}" width="20" height="22" rx="3" fill="#fef08a"/>` +
    `<rect x="${hx - 29}" y="${hy - 39}" width="14" height="16" rx="2" fill="#fde047"/>` +
    `<line x1="${hx - 22}" y1="${hy - 42}" x2="${hx - 22}" y2="${hy - 20}" stroke="#452715" stroke-width="2"/>` +
    `<line x1="${hx - 32}" y1="${hy - 31}" x2="${hx - 12}" y2="${hy - 31}" stroke="#452715" stroke-width="2"/>` +
    `<rect x="${hx + 10}" y="${hy - 42}" width="20" height="22" rx="3" fill="#fef08a"/>` +
    `<rect x="${hx + 13}" y="${hy - 39}" width="14" height="16" rx="2" fill="#fde047"/>` +
    `<line x1="${hx + 20}" y1="${hy - 42}" x2="${hx + 20}" y2="${hy - 20}" stroke="#452715" stroke-width="2"/>` +
    `<line x1="${hx + 10}" y1="${hy - 31}" x2="${hx + 30}" y2="${hy - 31}" stroke="#452715" stroke-width="2"/>` +
    // Fogata en la orilla (x=1490, y=656)
    `<circle cx="1490" cy="650" r="46" fill="url(#warmGlow)"/>` +
    `<path stroke="#5c341d" stroke-width="5" stroke-linecap="round" d="M1476,660 L1504,652 M1476,652 L1504,660"/>` +
    `<path fill="#f97316" d="M1490,624 Q1504,642 1498,656 Q1490,662 1482,656 Q1476,642 1490,624 Z"/>` +
    `<path fill="#fde047" d="M1490,633 Q1498,645 1494,655 Q1490,659 1486,655 Q1482,645 1490,633 Z"/>` +
    `</g>`
  );

  // 12. Bosque de pinos y cerezos (sakura) distribuidos con profundidad natural
  const pines = [
    [65, 635, 92], [125, 642, 74], [190, 628, 105], [260, 640, 80],
    [335, 635, 88], [445, 662, 76], [855, 672, 82], [920, 652, 98],
    [985, 642, 75], [1055, 628, 110], [1135, 625, 86], [1265, 632, 92],
    [1560, 648, 88], [1630, 654, 104], [1765, 658, 92], [1845, 648, 112], [1900, 655, 84]
  ];
  let forestSvg = `<g>`;
  for (const [tx, ty, th] of pines) {
    forestSvg += pineTree(tx, ty, th, '#092228', '#15474e');
  }
  // Cerezos sakura
  forestSvg += sakuraTree(395, 648, 1.15);
  forestSvg += sakuraTree(890, 665, 0.95);
  forestSvg += sakuraTree(1205, 628, 1.25);
  forestSvg += sakuraTree(1705, 660, 1.05);
  forestSvg += `</g>`;
  parts.push(forestSvg);

  // 13. Lago Cristalino Nocturno (y=690..945)
  parts.push(
    `<rect x="0" y="690" width="1920" height="255" fill="url(#lakeGrad)"/>` +
    `<rect x="0" y="690" width="1920" height="4" fill="#38bdf8" opacity="0.35"/>` +
    `<rect x="0" y="694" width="1920" height="2" fill="#bae6fd" opacity="0.2"/>`
  );

  // Reflejos suaves en el agua (elipses horizontales redondeadas)
  let reflSvg = `<g>`;
  // Reflejo de las cascadas (x=555 y x=774)
  for (let i = 0; i < 12; i++) {
    const ry = 704 + i * 16;
    const rw1 = Math.max(12, 54 - i * 3.5);
    const rw2 = Math.max(10, 42 - i * 2.8);
    const op = (0.55 - i * 0.04).toFixed(2);
    reflSvg += `<rect x="${555 - rw1}" y="${ry}" width="${rw1 * 2}" height="3.5" rx="1.75" fill="#7dd3fc" opacity="${op}"/>`;
    reflSvg += `<rect x="${774 - rw2}" y="${ry}" width="${rw2 * 2}" height="3" rx="1.5" fill="#7dd3fc" opacity="${op}"/>`;
  }
  // Reflejo violeta del portal (x=665)
  for (let i = 0; i < 10; i++) {
    const ry = 706 + i * 17;
    const rw = Math.max(10, 38 - i * 2.6);
    const op = (0.45 - i * 0.035).toFixed(2);
    reflSvg += `<rect x="${px - rw}" y="${ry}" width="${rw * 2}" height="3" rx="1.5" fill="#c084fc" opacity="${op}"/>`;
  }
  // Reflejo dorado de la cabana y fogata (x=1380 y x=1490)
  for (let i = 0; i < 11; i++) {
    const ry = 705 + i * 16;
    const rw = Math.max(12, 46 - i * 3);
    const rwF = Math.max(8, 28 - i * 2);
    const op = (0.5 - i * 0.038).toFixed(2);
    reflSvg += `<rect x="${hx - rw}" y="${ry}" width="${rw * 2}" height="3" rx="1.5" fill="#fbbf24" opacity="${op}"/>`;
    reflSvg += `<rect x="${1490 - rwF}" y="${ry + 4}" width="${rwF * 2}" height="2.5" rx="1.25" fill="#f97316" opacity="${op}"/>`;
  }
  // Reflejo plateado de la luna (x=1620)
  for (let i = 0; i < 13; i++) {
    const ry = 702 + i * 16;
    const rw = Math.max(16, 64 - i * 3.5);
    const op = (0.55 - i * 0.035).toFixed(2);
    reflSvg += `<rect x="${mx - rw}" y="${ry}" width="${rw * 2}" height="3.5" rx="1.75" fill="#fef08a" opacity="${op}"/>`;
  }
  reflSvg += `</g>`;
  parts.push(reflSvg);

  // 14. Bote de madera con farol calido flotando en el lago (x=1080, y=795)
  const bx = 1080, by = 795;
  parts.push(
    `<g>` +
    `<ellipse cx="${bx + 28}" cy="${by + 12}" rx="48" ry="10" fill="#fbbf24" opacity="0.18"/>` +
    `<ellipse cx="${bx}" cy="${by + 10}" rx="52" ry="4" fill="#38bdf8" opacity="0.35"/>` +
    `<path fill="#452715" d="M${bx - 42},${by - 2} L${bx + 42},${by - 2} L${bx + 28},${by + 10} L${bx - 28},${by + 10} Z"/>` +
    `<path fill="#5c341d" d="M${bx - 42},${by - 2} L${bx + 42},${by - 2} L${bx + 36},${by + 3} L${bx - 36},${by + 3} Z"/>` +
    `<path stroke="#78350f" stroke-width="2.5" fill="none" d="M${bx + 26},${by - 2} L${bx + 26},${by - 18} L${bx + 32},${by - 18}"/>` +
    `<circle cx="${bx + 32}" cy="${by - 14}" r="14" fill="url(#warmGlow)"/>` +
    `<circle cx="${bx + 32}" cy="${by - 14}" r="4.5" fill="#fef08a"/>` +
    `</g>`
  );

  // Nenufares y flores de loto suaves en el lago
  const lilies = [
    [220, 775, 1.0, true], [340, 835, 0.85, false], [480, 810, 0.9, true],
    [910, 845, 1.05, true], [990, 765, 0.8, false], [1240, 830, 1.0, true],
    [1720, 805, 0.95, true], [1810, 855, 0.85, false]
  ];
  let lilySvg = `<g>`;
  for (const [lx, ly, ls, hasFlower] of lilies) {
    lilySvg += `<ellipse cx="${lx}" cy="${ly}" rx="${16 * ls}" ry="${5 * ls}" fill="#15803d"/>`;
    lilySvg += `<ellipse cx="${lx - 2 * ls}" cy="${ly - 0.8 * ls}" rx="${12 * ls}" ry="${3.5 * ls}" fill="#22c55e" opacity="0.75"/>`;
    if (hasFlower) {
      lilySvg += `<path fill="#f472b6" d="M${lx - 6 * ls},${ly - 2 * ls} Q${lx},${ly - 12 * ls} ${lx + 6 * ls},${ly - 2 * ls} Z"/>`;
      lilySvg += `<path fill="#fbcfe8" d="M${lx - 3 * ls},${ly - 2 * ls} Q${lx},${ly - 10 * ls} ${lx + 3 * ls},${ly - 2 * ls} Z"/>`;
    }
  }
  lilySvg += `</g>`;
  parts.push(lilySvg);

  // 15. Pradera Frontal en Primer Plano con Cristales Luminosos (y=915..1080)
  parts.push(
    `<path fill="url(#meadowGrad)" d="M0,1080 L0,925 Q260,900 540,928 T1080,920 T1580,932 L1920,918 L1920,1080 Z"/>` +
    `<path fill="#1e4638" opacity="0.7" d="M0,932 Q260,907 540,935 T1080,927 T1580,939 L1920,925 L1920,930 Q1580,944 1080,932 T540,940 T0,937 Z"/>`
  );

  // Cristales luminosos en la pradera
  parts.push(
    crystalCluster(145, 965, 1.05, '#06b6d4', '#67e8f9', '#0e7490', 'cyanGlow') +
    crystalCluster(430, 978, 0.9, '#a855f7', '#e879f9', '#6b21a8', 'portalGlow') +
    crystalCluster(820, 972, 1.0, '#10b981', '#6ee7b7', '#047857', 'cyanGlow') +
    crystalCluster(1310, 976, 0.95, '#f59e0b', '#fde047', '#b45309', 'warmGlow') +
    crystalCluster(1640, 970, 1.1, '#a855f7', '#e879f9', '#6b21a8', 'portalGlow') +
    crystalCluster(1835, 962, 0.9, '#06b6d4', '#67e8f9', '#0e7490', 'cyanGlow')
  );

  parts.push(`</svg>`);
  return parts.join('');
}

// =========================================================================
// 2. CAPAS DE ANIMACION SUAVE (.mina-brillos.a y .mina-brillos.b)
// =========================================================================
function buildAnimatedOverlaySvg(frame) {
  const isB = frame === 1;
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none">`
  );

  // Destellos de aurora y estrellas que respiran suavemente
  const auroraShift = isB ? 35 : 0;
  parts.push(
    `<path fill="#5eead4" opacity="${isB ? '0.12' : '0.05'}" d="M${180 + auroraShift},220 C520,90 880,210 1240,105 C1520,25 1740,130 1920,85 L1920,20 C1740,60 1520,-20 1240,45 C880,140 520,30 ${180 + auroraShift},150 Z"/>`
  );

  // Espuma y corrientes de las 2 cascadas (desplazadas entre frame A y B)
  let wfAnim = `<g fill="#f0f9ff">`;
  for (let i = 0; i < 7; i++) {
    const yA = 505 + ((i * 28 + (isB ? 14 : 0)) % 185);
    wfAnim += `<rect x="${542 + (i % 2) * 14}" y="${yA}" width="6" height="16" rx="3" opacity="0.75"/>`;
    const yB = 522 + ((i * 26 + (isB ? 13 : 0)) % 168);
    wfAnim += `<rect x="${766 + (i % 2) * 10}" y="${yB}" width="5" height="14" rx="2.5" opacity="0.7"/>`;
  }
  // Ondas concentricas en la base de las cascadas
  wfAnim += `<ellipse cx="555" cy="696" rx="${isB ? 64 : 46}" ry="${isB ? 7 : 5}" fill="none" stroke="#bae6fd" stroke-width="2" opacity="${isB ? '0.45' : '0.75'}"/>`;
  wfAnim += `<ellipse cx="774" cy="696" rx="${isB ? 50 : 34}" ry="${isB ? 6 : 4}" fill="none" stroke="#bae6fd" stroke-width="1.8" opacity="${isB ? '0.45' : '0.75'}"/>`;
  wfAnim += `</g>`;
  parts.push(wfAnim);

  // Particulas magicas subiendo en el Portal (x=665)
  const pyOff = isB ? -10 : 0;
  parts.push(
    `<g fill="#f5d0fe" opacity="0.85">` +
    `<circle cx="645" cy="${560 + pyOff}" r="3"/>` +
    `<circle cx="685" cy="${540 - pyOff}" r="2.5"/>` +
    `<circle cx="665" cy="${505 + pyOff}" r="3.5"/>` +
    `<circle cx="622" cy="${585 - pyOff}" r="2"/>` +
    `<circle cx="708" cy="${575 + pyOff}" r="2.2"/>` +
    `</g>`
  );

  // Humo suave de la chimenea de la cabana (x=1411) y chispas de la fogata (x=1490)
  const smokeShift = isB ? 8 : 0;
  parts.push(
    `<g fill="#cbd5e1">` +
    `<circle cx="${1411 + smokeShift * 0.4}" cy="${518 - smokeShift}" r="9" opacity="0.32"/>` +
    `<circle cx="${1418 - smokeShift * 0.3}" cy="${496 - smokeShift}" r="13" opacity="0.24"/>` +
    `<circle cx="${1426 + smokeShift * 0.5}" cy="${470 - smokeShift}" r="17" opacity="0.16"/>` +
    `<circle cx="${1436 - smokeShift * 0.4}" cy="${442 - smokeShift}" r="22" opacity="0.09"/>` +
    `</g>` +
    `<g fill="#fef08a">` +
    `<circle cx="${1486 + (isB ? 5 : -3)}" cy="${614 + (isB ? -8 : 0)}" r="2.5" opacity="0.9"/>` +
    `<circle cx="${1495 + (isB ? -4 : 4)}" cy="${604 + (isB ? -10 : 2)}" r="2" opacity="0.75"/>` +
    `<circle cx="${1490}" cy="${592 + (isB ? -6 : 4)}" r="1.6" opacity="0.55"/>` +
    `</g>`
  );

  // Ondas suaves del lago y bote
  parts.push(
    `<g fill="#bae6fd" opacity="${isB ? '0.42' : '0.24'}">` +
    `<rect x="${310 + (isB ? 18 : 0)}" y="742" width="65" height="2.5" rx="1.25"/>` +
    `<rect x="${860 - (isB ? 16 : 0)}" y="786" width="82" height="2.5" rx="1.25"/>` +
    `<rect x="${1220 + (isB ? 20 : 0)}" y="758" width="74" height="2.5" rx="1.25"/>` +
    `<rect x="${1540 - (isB ? 15 : 0)}" y="838" width="90" height="2.5" rx="1.25"/>` +
    `</g>`
  );

  parts.push(`</svg>`);
  return parts.join('');
}

// =========================================================================
// 3. SENDERO FRONTAL SUAVE PARA LOS GATITOS (.rieles)
// =========================================================================
function buildGrassPathSvg() {
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1920 28" preserveAspectRatio="none">` +
    `<defs>` +
    `<linearGradient id="turfGrad" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#34d399"/>` +
    `<stop offset="28%" stop-color="#10b981"/>` +
    `<stop offset="65%" stop-color="#065f46"/>` +
    `<stop offset="100%" stop-color="#042f2e"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect x="0" y="6" width="1920" height="22" fill="url(#turfGrad)"/>` +
    `<path fill="#6ee7b7" opacity="0.65" d="M0,6 Q120,2 240,6 T480,6 T720,6 T960,6 T1200,6 T1440,6 T1680,6 T1920,6 L1920,10 L0,10 Z"/>`
  );
  // Florecitas suaves y briznas de hierba
  for (let x = 36; x < 1900; x += 68) {
    const c = (x / 68) % 3 === 0 ? '#fde047' : (x / 68) % 3 === 1 ? '#f472b6' : '#38bdf8';
    parts.push(`<circle cx="${x}" cy="5" r="2.8" fill="${c}" opacity="0.9"/>`);
  }
  parts.push(`</svg>`);
  return parts.join('');
}

// =========================================================================
// 4. BANNER DE INICIO (.hero-stars y .hero-hills) — Vector Suave sin cuadrados
// =========================================================================
function buildHeroStarsSvg() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 960 220" preserveAspectRatio="none">`;
  s += `<defs>
    <radialGradient id="hMoon" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fef9c3" stop-opacity="0.7"/>
      <stop offset="45%" stop-color="#fde047" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#fde047" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
  // Estrellas suaves
  const pts = [
    [42, 28, 1.5], [108, 54, 1.2], [176, 22, 1.8], [248, 66, 1.1], [312, 34, 1.6],
    [396, 18, 1.4], [462, 52, 1.2], [534, 28, 1.7], [688, 30, 1.5], [748, 62, 1.2],
    [832, 24, 1.6], [904, 48, 1.3]
  ];
  for (const [x, y, r] of pts) {
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fef9c3" opacity="0.8"/>`;
  }
  // Luna suave en el banner
  s += `<circle cx="615" cy="48" r="56" fill="url(#hMoon)"/>`;
  s += `<circle cx="615" cy="48" r="20" fill="#fefce8"/>`;
  // Nubes nocturnas suaves
  s += `<path fill="#bae6fd" opacity="0.12" d="M90,78 Q125,62 165,72 Q195,58 230,74 Q250,82 220,88 L95,88 Q75,84 90,78 Z"/>`;
  s += `<path fill="#bae6fd" opacity="0.10" d="M450,92 Q490,74 535,86 Q575,72 610,88 L605,98 L455,98 Z"/>`;
  s += `<path fill="#bae6fd" opacity="0.12" d="M720,68 Q760,52 800,64 Q835,54 865,68 L860,78 L725,78 Z"/>`;
  s += `</svg>`;
  return s;
}

function buildHeroHillsSvg() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1200 96" preserveAspectRatio="none">`;
  s += `<path fill="#183834" d="M0,96 L0,48 Q110,14 230,42 T470,34 T720,26 T960,40 T1200,24 L1200,96 Z"/>`;
  s += `<path fill="#0e2422" d="M0,96 L0,64 Q150,36 310,60 T640,50 T940,62 T1200,46 L1200,96 Z"/>`;
  s += `<path fill="#34d399" opacity="0.28" d="M0,48 Q110,14 230,42 T470,34 T720,26 T960,40 T1200,24 L1200,27 Q1080,42 960,43 T720,29 T470,37 T230,45 T0,51 Z"/>`;
  s += `</svg>`;
  return s;
}

// Textura sutil para .piedra (relleno de respaldo)
const piedraSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#060b16"/></svg>`;

// Textura de antorcha lateral suave
const antorchaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="48" viewBox="0 0 24 48">
  <defs>
    <radialGradient id="tGlow" cx="50%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#fef08a" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="#f97316" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="12" cy="14" r="12" fill="url(#tGlow)"/>
  <rect x="10" y="18" width="4" height="20" rx="2" fill="#78350f"/>
  <rect x="9" y="17" width="6" height="3" rx="1" fill="#451a03"/>
  <path fill="#f97316" d="M12,6 Q17,12 15,17 Q12,19 9,17 Q7,12 12,6 Z"/>
  <path fill="#fef08a" d="M12,9 Q15,13 14,16 Q12,18 10,16 Q9,13 12,9 Z"/>
</svg>`;

const vagonetaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="10" viewBox="0 0 16 10"></svg>`;

const css = [
  '/* MINA-INICIO (lo escribe tools/generar_mina.js; no lo edites a mano) */',
  `.piedra { background-image: ${encodeSvg(piedraSvg)}; background-size: 64px 64px; }`,
  `.mina-ores { background-image: ${encodeSvg(buildMainSceneSvg())}; background-size: 100% 100%; }`,
  `.mina-brillos.a { background-image: ${encodeSvg(buildAnimatedOverlaySvg(0))}; background-size: 100% 100%; }`,
  `.mina-brillos.b { background-image: ${encodeSvg(buildAnimatedOverlaySvg(1))}; background-size: 100% 100%; }`,
  `.antorcha { background: ${encodeSvg(antorchaSvg)} center / contain no-repeat; }`,
  `.rieles { background-image: ${encodeSvg(buildGrassPathSvg())}; background-size: 100% 100%; }`,
  `.vagoneta { background: ${encodeSvg(vagonetaSvg)} center / contain no-repeat; }`,
  `.hero-stars { background-image: ${encodeSvg(buildHeroStarsSvg())}; background-size: 100% 100%; }`,
  `.hero-hills { background-image: ${encodeSvg(buildHeroHillsSvg())}; background-size: 100% 96px; }`,
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
