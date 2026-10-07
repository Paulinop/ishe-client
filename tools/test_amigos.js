'use strict';
// Pruebas del "codigo de amigos". uso: node tools/test_amigos.js app
const fs = require('fs');
const os = require('os');
const path = require('path');
const amigos = require(path.join(path.resolve(process.argv[2] || 'app'), 'core', 'amigos.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-amigos-'));

const code = amigos.encode('https://ishe-gemini.guishe.workers.dev', 'ana-4f9k2');
check(code.startsWith('ISHE-'), 'el codigo empieza con ISHE-');
const decoded = amigos.decode(code);
check(decoded && decoded.url === 'https://ishe-gemini.guishe.workers.dev' && decoded.token === 'ana-4f9k2', 'se lee la direccion y el token');
check(amigos.decode(' ' + code + ' ') !== null, 'tolera espacios al pegar');
for (const [nombre, malo] of [
  ['vacio', ''], ['sin prefijo', code.slice(5)], ['basura', 'ISHE-@@@@'],
  ['http sin cifrar', amigos.encode('http://servidor.example', 'ana-4f9k2')],
  ['con usuario y clave en la direccion', amigos.encode('https://u:p@servidor.example', 'ana-4f9k2')],
  ['token raro', amigos.encode('https://servidor.example', 'ana 4f9k2;')],
  ['token corto', amigos.encode('https://servidor.example', 'ab')],
  ['direccion rara', amigos.encode('no es una direccion', 'ana-4f9k2')],
  ['con parametros', amigos.encode('https://servidor.example/?a=1', 'ana-4f9k2')],
]) {
  check(amigos.decode(malo) === null, 'se rechaza un codigo ' + nombre);
}

const withServer = amigos.decode(amigos.encode('https://ishe-gemini.guishe.workers.dev', 'ana-4f9k2', 'mi.servidor.com:25566'));
check(withServer && withServer.server === 'mi.servidor.com:25566', 'el codigo puede traer la direccion del servidor');
check(amigos.decode(code).server === '', 'sin servidor en el codigo, queda vacio');
check(amigos.decode(amigos.encode('https://servidor.example', 'ana-4f9k2', 'mal servidor!')) === null, 'una direccion de servidor rara en el codigo se rechaza');
const game = dir();
check(amigos.active(game) === false, 'al principio no hay codigo');
fs.mkdirSync(path.join(game, 'config'));
fs.writeFileSync(path.join(game, 'config', 'ishe.json'), JSON.stringify({ voz_activada: true, color_nublado: 'negro', gemini_api_key: '' }));
check(amigos.apply(game, 'ISHE-mal') === null, 'un codigo malo no cambia nada');
check(amigos.apply(game, code) !== null && amigos.active(game), 'un codigo bueno se guarda');
const saved = JSON.parse(fs.readFileSync(amigos.configFile(game), 'utf8'));
check(saved.gemini_url_base === decoded.url && saved.gemini_api_key === 'ana-4f9k2', 'queda en gemini_url_base y gemini_api_key');
check(saved.fish_url_base === decoded.url + '/fish/v1/tts' && saved.fish_api_key === 'ana-4f9k2', 'la voz de Fish Audio tambien pasa por el servidor de amigos');
check(saved.color_nublado === 'negro' && saved.voz_activada === true, 'los demas ajustes del mod se conservan');
check(amigos.clear(game) === true && !amigos.active(game), 'quitar el codigo lo borra');
check(JSON.parse(fs.readFileSync(amigos.configFile(game), 'utf8')).fish_api_key === '', 'y tambien quita lo de Fish Audio');
check(JSON.parse(fs.readFileSync(amigos.configFile(game), 'utf8')).color_nublado === 'negro', 'y sigue sin tocar lo demas');
const own = dir();
fs.mkdirSync(path.join(own, 'config'));
fs.writeFileSync(path.join(own, 'config', 'ishe.json'), JSON.stringify({ gemini_api_key: 'MI-CLAVE-PROPIA' }));
check(amigos.clear(own) === false && JSON.parse(fs.readFileSync(amigos.configFile(own), 'utf8')).gemini_api_key === 'MI-CLAVE-PROPIA', 'quitar el codigo no borra una clave propia de Google');
const empty = dir();
check(amigos.apply(empty, code) !== null && amigos.active(empty), 'si el mod aun no creo su archivo, se crea');
console.log((checks - failures) + ' de ' + checks + ' comprobaciones bien');
process.exit(failures ? 1 : 0);
