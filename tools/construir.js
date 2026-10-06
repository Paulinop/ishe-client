'use strict';
// Arma lo que se reparte, sin depender de bash, zip ni Python (solo Node 22 o mas nuevo):
//
//   dist/app/                              el client tal como se instala (sin archivos de pruebas)
//   dist/win/  y  dist/mac/                contenido de cada paquete instalador
//   dist/IsheClient-Launcher-Windows.zip   paquete para Windows
//   dist/IsheClient-Launcher-Mac.zip       paquete para Mac
//
// uso:  node tools/construir.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const DIST = path.join(ROOT, 'dist');
const NOT_SHIPPED = new Set(['test-hooks.js', 'core/cli.js']); // solo para pruebas

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function listFiles(dir, prefix) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const relative = prefix ? prefix + '/' + name : name;
    if (fs.statSync(full).isDirectory()) out.push(...listFiles(full, relative));
    else out.push(relative);
  }
  return out;
}

function copyTree(from, to) {
  for (const relative of listFiles(from, '')) copyFile(path.join(from, relative), path.join(to, relative));
}

const crlf = (text) => text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
const lf = (text) => text.replace(/\r\n/g, '\n');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8').replace(/^﻿/, '');

/** La copia del client que se instala: app/ sin pruebas y con el logo reducido. */
function buildApp() {
  const target = path.join(DIST, 'app');
  fs.rmSync(target, { recursive: true, force: true });
  for (const relative of listFiles(APP, '')) {
    if (NOT_SHIPPED.has(relative) || relative.startsWith('node_modules/')) continue;
    copyFile(path.join(APP, relative), path.join(target, relative));
  }
  copyFile(path.join(ROOT, 'recursos', 'logo-256.png'), path.join(target, 'assets', 'logo.png'));
  for (const relative of NOT_SHIPPED) {
    if (fs.existsSync(path.join(target, relative))) throw new Error('un archivo de pruebas se colo en dist/app: ' + relative);
  }
  return target;
}

function buildPackages(appDir) {
  const win = path.join(DIST, 'win');
  const mac = path.join(DIST, 'mac');
  fs.rmSync(win, { recursive: true, force: true });
  fs.rmSync(mac, { recursive: true, force: true });

  copyTree(appDir, path.join(win, 'app'));
  copyFile(path.join(ROOT, 'recursos', 'icon.ico'), path.join(win, 'app', 'assets', 'icon.ico'));
  // En Windows los .bat, .ps1 y .txt llevan finales de linea de Windows; el LEEME ademas BOM para el Bloc de notas.
  fs.writeFileSync(path.join(win, 'Instalar Ishe Client.bat'), crlf(read('instalador', 'win', 'Instalar Ishe Client.bat')));
  fs.writeFileSync(path.join(win, 'instalar-launcher.ps1'), crlf(read('instalador', 'win', 'instalar-launcher.ps1')));
  fs.writeFileSync(path.join(win, 'LEEME.txt'), '﻿' + crlf(read('recursos', 'leeme-win.txt')));

  copyTree(appDir, path.join(mac, 'app'));
  copyFile(path.join(ROOT, 'recursos', 'icon.icns'), path.join(mac, 'app', 'assets', 'icon.icns'));
  const command = path.join(mac, 'Instalar Ishe Client.command');
  fs.writeFileSync(command, lf(read('instalador', 'mac', 'Instalar Ishe Client.command')));
  try { fs.chmodSync(command, 0o755); } catch (_) { /* en Windows no hay permisos de ejecucion; el .zip los lleva igual */ }
  fs.writeFileSync(path.join(mac, 'LEEME.txt'), lf(read('recursos', 'leeme-mac.txt')));
  return { win, mac };
}

// ---- .zip minimo (formato estandar, con permisos de ejecucion para el .command) ----

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zipFolder(dir, topName, outFile) {
  const { time, day } = dosDateTime(new Date());
  const entries = [{ name: topName + '/', data: Buffer.alloc(0), mode: 0o40755 }];
  const seenDirs = new Set();
  for (const relative of listFiles(dir, '')) {
    const parts = relative.split('/');
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      if (!seenDirs.has(folder)) {
        seenDirs.add(folder);
        entries.push({ name: topName + '/' + folder + '/', data: Buffer.alloc(0), mode: 0o40755 });
      }
    }
    entries.push({ name: topName + '/' + relative, data: fs.readFileSync(path.join(dir, relative)), mode: relative.endsWith('.command') ? 0o100755 : 0o100644 });
  }
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const isDir = entry.name.endsWith('/');
    const packed = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(entry.data, { level: 9 });
    const method = isDir ? 0 : 8;
    const crc = isDir ? 0 : zlib.crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version necesaria
    local.writeUInt16LE(0x0800, 6);        // nombres en UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, packed);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 20, 4); // hecho en "unix": asi se respetan los permisos
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(((entry.mode << 16) | (isDir ? 0x10 : 0)) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + packed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(outFile, Buffer.concat(chunks.concat(central, [end])));
}

/** Nada de lo que se reparte puede contener una clave privada. */
function assertNoPrivateKey(dir) {
  for (const relative of listFiles(dir, '')) {
    const full = path.join(dir, relative);
    if (/\.(pem|key)$/i.test(relative) || fs.readFileSync(full).includes('PRIVATE KEY-----')) {
      throw new Error('hay una clave privada en lo que se reparte: ' + relative);
    }
  }
}

function build() {
  fs.mkdirSync(DIST, { recursive: true });
  const appDir = buildApp();
  const { win, mac } = buildPackages(appDir);
  assertNoPrivateKey(appDir);
  assertNoPrivateKey(win);
  assertNoPrivateKey(mac);
  const winZip = path.join(DIST, 'IsheClient-Launcher-Windows.zip');
  const macZip = path.join(DIST, 'IsheClient-Launcher-Mac.zip');
  zipFolder(win, 'Ishe Client - Launcher (Windows)', winZip);
  zipFolder(mac, 'Ishe Client - Launcher (Mac)', macZip);
  const version = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version;
  return { version, appDir, win, mac, winZip, macZip };
}

module.exports = { ROOT, DIST, build };

if (require.main === module) {
  const result = build();
  console.log('Ishe Client ' + result.version + ' armado en dist/');
  for (const file of [result.winZip, result.macZip]) {
    console.log('  ' + path.relative(ROOT, file) + '  (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
  }
}
