'use strict';
// SOLO PARA PRUEBAS: crea una actualizacion firmada a partir de una copia del client,
// opcionalmente con un main.js roto, para comprobar la vuelta atras.
// uso: node make_update.js <carpeta app> <clave .pem> <version> <carpeta de salida> <ok|throw|exit|reject|silent>
const fs = require('fs');
const os = require('os');
const path = require('path');
const [app, keyFile, version, outDir, mode] = process.argv.slice(2);
const creator = require(path.join(path.resolve(app), 'core', 'creator.js'));
const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-mk-'));
fs.cpSync(app, copy, { recursive: true });
if (mode === 'throw') fs.writeFileSync(path.join(copy, 'main.js'), 'throw new Error("version rota a proposito");\n');
if (mode === 'exit') fs.writeFileSync(path.join(copy, 'main.js'), 'require("electron").app.exit(0);\n');
if (mode === 'reject') fs.writeFileSync(path.join(copy, 'main.js'), 'require("electron").app.whenReady().then(() => { throw new Error("falla al preparar la ventana"); });\n');
if (mode === 'silent') fs.writeFileSync(path.join(copy, 'main.js'), 'require("electron").app.whenReady().then(() => {});\n');
const built = creator.build({
  codeDir: copy, extrasDir: path.join(copy, 'extras'), version, notes: 'Prueba ' + mode,
  theme: JSON.parse(fs.readFileSync(path.join(copy, 'tema.json'), 'utf8')),
  privateKeyPem: fs.readFileSync(keyFile, 'utf8'), publicKeyPem: require(path.join(path.resolve(app), 'core', 'clave-publica.js')), today: '2026-10-08',
});
fs.mkdirSync(outDir, { recursive: true });
for (const [name, body] of built.files) fs.writeFileSync(path.join(outDir, name), body);
