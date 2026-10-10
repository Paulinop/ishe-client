'use strict';
// Pruebas de la instalacion de shaders (Iris + paquete) con un Modrinth simulado. uso: node tools/test_shaders.js app
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const installer = require(path.join(path.resolve(process.argv[2] || 'app'), 'core', 'installer.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}

check(installer.MOD_PROJECTS.includes('iris') && installer.MOD_PROJECTS.includes('sodium'), 'Iris y Sodium forman parte de los mods');

async function main() {
  const body = Buffer.from('PK-paquete-de-shaders-simulado');
  const hash = crypto.createHash('sha512').update(body).digest('hex');
  let consultas = [];
  let mala = false;
  const server = http.createServer((req, res) => {
    consultas.push(req.url);
    if (req.url.startsWith('/project/bsl-shaders/version')) {
      const archivo = { filename: mala ? '../escape.zip' : 'BSL_rTest.zip', primary: true, hashes: { sha512: hash }, url: 'http://127.0.0.1:' + server.address().port + '/dl/pack.zip' };
      res.end(JSON.stringify([{ version_type: 'release', files: [archivo] }]));
    } else if (req.url === '/dl/pack.zip') {
      res.end(body);
    } else {
      res.statusCode = 404;
      res.end('no');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const api = 'http://127.0.0.1:' + server.address().port;
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-shaders-'));
  const infos = [];
  const problems = [];
  await installer.installShaders(api, gameDir, (m) => infos.push(m), (m) => problems.push(m));
  check(fs.existsSync(path.join(gameDir, 'shaderpacks', 'BSL_rTest.zip')), 'baja el paquete de shaders a shaderpacks');
  check(problems.length === 0, 'sin problemas');
  check(consultas.some((u) => u.includes('loaders=%5B%22iris%22%5D')), 'pide la version para el cargador iris');
  const props = fs.readFileSync(path.join(gameDir, 'config', 'iris.properties'), 'utf8');
  check(/enableShaders=true/.test(props) && /shaderPack=BSL_rTest\.zip/.test(props), 'los activa la primera vez en iris.properties');

  // la eleccion de la persona no se pisa
  fs.writeFileSync(path.join(gameDir, 'config', 'iris.properties'), 'enableShaders=false\nshaderPack=OtroPaquete.zip\n');
  await installer.installShaders(api, gameDir, (m) => infos.push(m), (m) => problems.push(m));
  check(/OtroPaquete\.zip/.test(fs.readFileSync(path.join(gameDir, 'config', 'iris.properties'), 'utf8')), 'no vuelve a tocar la eleccion de shaders de la persona');
  check(infos.some((m) => m.includes('ya estaba')), 'si ya esta bajado no lo baja otra vez');

  // seguridad: un nombre con ../ no se acepta
  mala = true;
  const gameDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-shaders-'));
  const problems2 = [];
  await installer.installShaders(api, gameDir2, () => {}, (m) => problems2.push(m));
  check(problems2.length === 1 && !fs.existsSync(path.join(gameDir2, 'escape.zip')) && !fs.existsSync(path.join(gameDir2, 'shaderpacks', '..', 'escape.zip')), 'rechaza un archivo con nombre peligroso');

  // sin internet: avisa y sigue
  server.close();
  const problems3 = [];
  await installer.installShaders('http://127.0.0.1:1', fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-shaders-')), () => {}, (m) => problems3.push(m));
  check(problems3.length === 1, 'sin conexion lo avisa y no se rompe');
}

main().then(() => {
  console.log(failures === 0 ? checks + ' de ' + checks + ' comprobaciones bien' : failures + ' fallaron');
  process.exit(failures === 0 ? 0 : 1);
}).catch((error) => { console.error(error); process.exit(1); });
