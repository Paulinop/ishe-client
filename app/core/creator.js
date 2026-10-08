'use strict';
// Herramienta del creador: arma una actualizacion firmada a partir del client
// que esta en uso, con el numero de version, las notas y la apariencia elegidos.
// El resultado son los archivos que se suben a la pagina de versiones en GitHub.
//
// Solo usa modulos incluidos en Node.

const fs = require('fs');
const path = require('path');
const paquete = require('./paquete');

const SKIP = new Set(['core/cli.js']); // herramienta de pruebas, no es parte del client

function nextVersion(version) {
  if (!paquete.validVersion(version)) return '1.0.0';
  const parts = version.split('.').map(Number);
  return parts[0] + '.' + parts[1] + '.' + (parts[2] + 1);
}

/** Archivos del client que hay en `codeDir`, tal como iran en el paquete. */
function collect(codeDir) {
  const files = new Map();
  const add = (relative) => {
    if (!paquete.FILE_PATTERN.test(relative) || SKIP.has(relative)) return;
    const full = path.join(codeDir, relative);
    if (fs.statSync(full).isFile()) files.set(relative, fs.readFileSync(full));
  };
  for (const name of fs.readdirSync(codeDir)) {
    const full = path.join(codeDir, name);
    if (['core', 'renderer', 'assets'].includes(name) && fs.statSync(full).isDirectory()) {
      for (const inner of fs.readdirSync(full)) add(name + '/' + inner);
    } else {
      add(name);
    }
  }
  return files;
}

function withNews(newsText, version, notes, today) {
  let news = [];
  try { news = JSON.parse(newsText); } catch (_) { news = []; }
  if (!Array.isArray(news)) news = [];
  // La tarjeta de la version anterior se sustituye por la de esta.
  news = news.filter((item) => item && !/^Versión \d/.test(String(item.titulo || '')));
  if (notes) news.unshift({ titulo: 'Versión ' + version, fecha: today, texto: notes });
  return JSON.stringify(news.slice(0, 4), null, 2) + '\n';
}

function instructions(version, names) {
  return [
    'RESHEM CLIENT - cómo publicar la versión ' + version,
    '==========================================',
    '',
    '1. Entra en https://github.com/Paulinop/ishe-client/releases/new',
    '   (con tu cuenta de GitHub).',
    '2. En "Choose a tag" escribe  v' + version + '  y pulsa "Create new tag".',
    '3. En "Release title" escribe  Reshem Client ' + version,
    '4. Arrastra a la zona de archivos TODOS estos archivos de esta carpeta:',
  ].concat(names.map((name) => '      ' + name)).concat([
    '   (este LEEME no hace falta subirlo).',
    '5. Deja marcada la casilla "Set as the latest release".',
    '6. Pulsa "Publish release".',
    '',
    'Listo. La próxima vez que tú o tus amigos abran Reshem Client, se descargará',
    'sola y pedirá reiniciar. No hay que reinstalar nada.',
    '',
    'Si te equivocaste: borra esa versión en GitHub (Delete release) y crea otra',
    'con un número de versión mayor. No reutilices un número ya publicado.',
    '',
  ]).join('\r\n');
}

/**
 * options: { codeDir, extrasDir, version, notes, theme, privateKeyPem, publicKeyPem, today }
 * Devuelve { version, files: Map<nombre de archivo de salida, Buffer>, upload: [nombres a subir] }.
 */
function build(options) {
  const { codeDir, version } = options;
  let current = '0.0.0';
  try { current = JSON.parse(fs.readFileSync(path.join(codeDir, 'package.json'), 'utf8')).version; } catch (_) { current = '0.0.0'; }
  if (!paquete.validVersion(version)) throw new Error('El número de versión tiene que ser como 1.2.0 (tres números con puntos).');
  if (paquete.validVersion(current) && paquete.compareVersions(version, current) <= 0) {
    throw new Error('La versión nueva tiene que ser mayor que la actual (' + current + ').');
  }
  const notes = String(options.notes || '').trim().slice(0, 400);
  if (!paquete.sameKey(paquete.publicKeyOf(options.privateKeyPem), options.publicKeyPem)) {
    throw new Error('Esa no es la clave de actualizaciones de Reshem Client.');
  }

  const files = collect(codeDir);
  const pkg = JSON.parse(files.get('package.json').toString('utf8'));
  pkg.version = version;
  files.set('package.json', Buffer.from(JSON.stringify(pkg, null, 2) + '\n'));
  files.set('tema.json', Buffer.from(JSON.stringify(options.theme, null, 2) + '\n'));
  files.set('noticias.json', Buffer.from(withNews(files.has('noticias.json') ? files.get('noticias.json').toString('utf8') : '[]', version, notes, options.today)));

  const bundle = paquete.pack(files);
  const archivos = {};
  for (const [name, body] of files) archivos[name] = paquete.sha256(body);
  const out = new Map();
  const extras = [];
  let extraNames = [];
  try { extraNames = fs.readdirSync(options.extrasDir).filter((name) => paquete.EXTRA_PATTERN.test(name)).sort(); } catch (_) { extraNames = []; }
  for (const name of extraNames) {
    const body = fs.readFileSync(path.join(options.extrasDir, name));
    extras.push({ archivo: name, sha256: paquete.sha256(body), tamano: body.length });
    out.set(name, body);
  }
  const manifest = {
    formato: paquete.FORMAT,
    version,
    fecha: options.today,
    notas: notes,
    paquete: { archivo: paquete.bundleName(version), sha256: paquete.sha256(bundle), tamano: bundle.length },
    archivos,
    extras,
  };
  const envelope = paquete.sign(manifest, options.privateKeyPem);
  if (!paquete.verify(envelope, options.publicKeyPem)) throw new Error('No se pudo firmar la actualización.');
  out.set(paquete.MANIFEST_NAME, Buffer.from(envelope));
  out.set(paquete.bundleName(version), bundle);
  const upload = Array.from(out.keys()).sort();
  out.set('LEEME - como publicar.txt', Buffer.from('﻿' + instructions(version, upload)));
  return { version, files: out, upload };
}

module.exports = { nextVersion, collect, build };
