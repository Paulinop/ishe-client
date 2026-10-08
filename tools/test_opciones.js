'use strict';
// Pruebas del narrador apagado: se escribe en options.txt sin tocar el resto. uso: node tools/test_opciones.js app
const fs = require('fs');
const os = require('os');
const path = require('path');
const game = require(path.join(path.resolve(process.argv[2] || 'app'), 'core', 'game.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reshem-opciones-'));
check(game.fixOptions(dir) === true, 'sin options.txt lo crea');
let t = fs.readFileSync(path.join(dir, 'options.txt'), 'utf8');
check(/^narrator:0$/m.test(t) && /^narratorHotkey:false$/m.test(t) && /^onboardAccessibility:false$/m.test(t), 'deja el narrador apagado y sin pantalla de bienvenida');
check(game.fixOptions(dir) === false, 'si ya esta bien no cambia nada');

fs.writeFileSync(path.join(dir, 'options.txt'), 'version:4796\nfov:0.5\nnarrator:1\nnarratorHotkey:true\nonboardAccessibility:true\nguiScale:3\n');
check(game.fixOptions(dir) === true, 'si el narrador estaba encendido lo apaga');
t = fs.readFileSync(path.join(dir, 'options.txt'), 'utf8');
check(/^narrator:0$/m.test(t) && !/narrator:1/.test(t) && /^onboardAccessibility:false$/m.test(t), 'queda apagado');
check(/^fov:0.5$/m.test(t) && /^guiScale:3$/m.test(t) && /^version:4796$/m.test(t), 'el resto de tus opciones no se toca');
check((t.match(/^narrator:/gm) || []).length === 1, 'no repite lineas');

console.log(failures === 0 ? checks + ' de ' + checks + ' comprobaciones bien' : failures + ' fallaron');
process.exit(failures === 0 ? 0 : 1);
