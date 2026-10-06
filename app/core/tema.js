'use strict';
// Apariencia de Ishe Client: dos colores de acento, un color de fondo y el logo.
// Los valores por defecto vienen en tema.json (viajan con cada actualizacion);
// lo que cada persona cambia en Ajustes se guarda aparte, en su equipo.

const fs = require('fs');
const path = require('path');

const DEFAULT = { color1: '#5ee7ff', color2: '#8b5cf6', fondo: '#0d0f16', logo: '' };
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const LOGO_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
const MAX_LOGO_CHARS = 600 * 1024;
const MAX_BACKGROUND_LUMINANCE = 0.1; // el texto es claro: el fondo tiene que ser oscuro

function color(value) {
  const text = String(value || '').trim().toLowerCase();
  return COLOR_PATTERN.test(text) ? text : '';
}

/** Luminosidad relativa (0 = negro, 1 = blanco). */
function luminance(hex) {
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function validBackground(value) {
  const hex = color(value);
  return hex !== '' && luminance(hex) <= MAX_BACKGROUND_LUMINANCE;
}

function validLogo(value) {
  return typeof value === 'string' && value.length <= MAX_LOGO_CHARS && LOGO_PATTERN.test(value);
}

/** Solo las claves validas de `input` (lo demas se descarta). */
function pick(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  if (color(input.color1)) out.color1 = color(input.color1);
  if (color(input.color2)) out.color2 = color(input.color2);
  if (validBackground(input.fondo)) out.fondo = color(input.fondo);
  if (input.logo === '' || validLogo(input.logo)) out.logo = input.logo;
  return out;
}

function defaults(appDir) {
  try {
    return Object.assign({}, DEFAULT, pick(JSON.parse(fs.readFileSync(path.join(appDir, 'tema.json'), 'utf8'))));
  } catch (_) {
    return Object.assign({}, DEFAULT);
  }
}

/** Apariencia en uso: la del client mas lo que esta persona cambio. */
function effective(appDir, overrides) {
  return Object.assign(defaults(appDir), pick(overrides));
}

module.exports = { DEFAULT, color, luminance, validBackground, validLogo, pick, defaults, effective };
