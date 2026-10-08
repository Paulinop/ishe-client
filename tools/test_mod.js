'use strict';
// Pruebas de la actualizacion del mod Ishe, con un servidor en este equipo que hace de GitHub (release "mods")
// y de Modrinth/Fabric. No necesita la clave real: usa una clave de prueba.
// uso: node tools/test_mod.js app
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const APP = path.resolve(process.argv[2] || 'app');
const modishe = require(path.join(APP, 'core', 'modishe.js'));
const installer = require(path.join(APP, 'core', 'installer.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-mod-' + name + '-'));
const rejects = async (promise) => { try { await promise; return ''; } catch (e) { return e.message || 'error'; } };

const pair = crypto.generateKeyPairSync('ed25519');
const PRIVATE = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const other = crypto.generateKeyPairSync('ed25519');
const OTHER_PRIVATE = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const JAR1 = Buffer.concat([Buffer.from('PK-ishe-1.0.0-'), crypto.randomBytes(2000)]);
const JAR2 = Buffer.concat([Buffer.from('PK-ishe-1.1.0-'), crypto.randomBytes(2500)]);
const notice = (jar, version, extra) => Object.assign({
  formato: 1, tipo: 'mod', mod: 'ishe', version, minecraft: installer.MC_VERSION,
  archivo: 'ishe-' + version + '-mc' + installer.MC_VERSION + '.jar', sha256: modishe.sha256(jar), tamano: jar.length,
}, extra || {});

let served = new Map();
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const name = decodeURIComponent(url.split('/').pop());
  if (url.startsWith('/evil/')) { res.writeHead(302, { Location: 'https://evil.example/' + name }); return res.end(); }
  if (url.startsWith('/redir/')) { res.writeHead(302, { Location: '/mods/' + name }); return res.end(); }
  const body = served.get(url);
  if (!body) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Length': body.length });
  res.end(body);
});

function publish(text, jars) {
  served = new Map();
  if (text !== null) served.set('/mods/ishe-mod.json', Buffer.from(text));
  for (const [name, body] of jars || []) served.set('/mods/' + name, body);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const run = (modsDir, extra) => modishe.sync(Object.assign({ source: base + '/mods', publicKey: PUBLIC, modsDir, minecraft: installer.MC_VERSION, allowLoopback: true }, extra || {}));

  console.log('M1 el aviso del mod');
  const n1 = notice(JAR1, '1.0.0');
  const text1 = modishe.sign(n1, PRIVATE);
  const ok = modishe.verify(text1, PUBLIC, installer.MC_VERSION);
  check(ok.version === '1.0.0' && ok.archivo === n1.archivo, 'un aviso firmado con la clave correcta se acepta');
  let msg = '';
  try { modishe.verify(modishe.sign(n1, OTHER_PRIVATE), PUBLIC, installer.MC_VERSION); } catch (e) { msg = e.message; }
  check(msg.includes('no está firmado'), 'un aviso firmado con OTRA clave se rechaza');
  const tampered = JSON.parse(text1);
  tampered.aviso = Buffer.from(JSON.stringify(Object.assign({}, n1, { sha256: modishe.sha256(Buffer.from('otro')) }))).toString('base64');
  msg = '';
  try { modishe.verify(JSON.stringify(tampered), PUBLIC, installer.MC_VERSION); } catch (e) { msg = e.message; }
  check(msg.includes('no está firmado'), 'un aviso cambiado a mano se rechaza');
  for (const [nombre, malo] of [['nombre con ruta', { archivo: '../ishe.jar' }], ['sin .jar', { archivo: 'ishe.exe' }], ['hash raro', { sha256: 'abc' }], ['tamano raro', { tamano: -5 }], ['tipo raro', { tipo: 'otro' }]]) {
    msg = '';
    try { modishe.verify(modishe.sign(Object.assign({}, n1, malo), PRIVATE), PUBLIC, installer.MC_VERSION); } catch (e) { msg = e.message; }
    check(msg !== '', 'se rechaza un aviso con ' + nombre);
  }
  check(modishe.verify(modishe.sign(notice(JAR1, '1.0.0', { minecraft: '26.3' }), PRIVATE), PUBLIC, installer.MC_VERSION).otraVersion === true, 'un aviso para otra version de Minecraft se ignora sin error');

  console.log('M2 descargar y actualizar');
  let dir = tmp('a');
  publish(null);
  check((await run(dir)).status === 'sin-aviso', 'sin ninguna release "mods" no pasa nada');
  publish(text1, [[n1.archivo, JAR1]]);
  let r = await run(dir);
  check(r.status === 'actualizado' && r.file === n1.archivo && fs.readFileSync(path.join(dir, n1.archivo)).equals(JAR1), 'baja el mod y lo deja en la carpeta de mods');
  r = await run(dir);
  check(r.status === 'al-dia', 'la segunda vez ya esta al dia (no vuelve a descargar)');
  const n2 = notice(JAR2, '1.1.0');
  publish(modishe.sign(n2, PRIVATE), [[n2.archivo, JAR2]]);
  r = await run(dir);
  check(r.status === 'actualizado' && r.version === '1.1.0' && fs.existsSync(path.join(dir, n2.archivo)), 'una version nueva se descarga');
  check(!fs.readdirSync(dir).some((f) => f.endsWith('.descargando')), 'no quedan archivos a medias');

  console.log('M3 lo que no debe pasar');
  dir = tmp('b');
  publish(modishe.sign(n1, PRIVATE), [[n1.archivo, Buffer.concat([JAR1.subarray(0, JAR1.length - 1), Buffer.from('X')])]]);
  msg = await rejects(run(dir));
  check(msg.includes('código de verificación') && fs.readdirSync(dir).length === 0, 'un .jar que no coincide con su SHA-256 no se guarda');
  publish(modishe.sign(n1, PRIVATE), []);
  msg = await rejects(run(dir));
  check(msg.includes('404') && fs.readdirSync(dir).length === 0, 'si falta el .jar se avisa y no se toca nada');
  publish(modishe.sign(n1, OTHER_PRIVATE), [[n1.archivo, JAR1]]);
  msg = await rejects(run(dir));
  check(msg.includes('no está firmado') && fs.readdirSync(dir).length === 0, 'con la firma mala no se descarga nada');
  publish(text1, [[n1.archivo, JAR1]]);
  msg = await rejects(modishe.sync({ source: base + '/evil', publicKey: PUBLIC, modsDir: dir, minecraft: installer.MC_VERSION, allowLoopback: true }));
  check(msg !== '' && fs.readdirSync(dir).length === 0, 'una redireccion a un sitio que no es GitHub se rechaza');
  msg = await rejects(modishe.sync({ source: 'https://evil.example/mods', publicKey: PUBLIC, modsDir: dir, minecraft: installer.MC_VERSION }));
  check(msg.includes('sitio no permitido'), 'la direccion de descarga debe ser de GitHub');
  r = await modishe.sync({ source: base + '/redir', publicKey: PUBLIC, modsDir: dir, minecraft: installer.MC_VERSION, allowLoopback: true });
  check(r.status === 'actualizado', 'las redirecciones dentro del mismo sitio si se siguen (GitHub redirige asi)');

  console.log('M4 dentro del instalador');
  const mcDir = tmp('mc');
  const gameDir = tmp('game');
  const bundledDir = path.join(APP, 'extras');
  const fakeMod = (project) => Buffer.from('jar-' + project);
  const modrinth = http.createServer((req, res) => {
    const m = req.url.match(/^\/v2\/project\/([^/]+)\/version/);
    if (m) {
      const project = decodeURIComponent(m[1]);
      const body = fakeMod(project);
      const filename = project + (project === 'complementary-reimagined' ? '-1.0.zip' : '-1.0.jar');
      served.set('/jar/' + filename, body);
      const version = { project_id: project, version_type: 'release', dependencies: [],
        files: [{ primary: true, filename, url: 'http://127.0.0.1:' + modrinth.address().port + '/jar/' + filename, hashes: { sha512: crypto.createHash('sha512').update(body).digest('hex') } }] };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([version]));
    }
    const jar = req.url.match(/^\/jar\/(.+)$/);
    if (jar && served.get(req.url)) { res.writeHead(200); return res.end(served.get(req.url)); }
    res.writeHead(404); res.end();
  });
  await new Promise((r2) => modrinth.listen(0, '127.0.0.1', r2));
  const fabric = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (/\/profile\/json$/.test(req.url)) return res.end(JSON.stringify({ id: 'fabric-loader-0.19.5-' + installer.MC_VERSION, inheritsFrom: installer.MC_VERSION }));
    res.end(JSON.stringify([{ loader: { version: '0.19.5', stable: true } }]));
  });
  await new Promise((r2) => fabric.listen(0, '127.0.0.1', r2));
  const installOptions = () => ({
    modrinthApi: 'http://127.0.0.1:' + modrinth.address().port + '/v2', fabricMeta: 'http://127.0.0.1:' + fabric.address().port + '/v2',
    minecraftDir: mcDir, gameDir, bundledDir, icon: 'x', profileOptional: true,
    isheModSource: base + '/mods', isheModAllowLoopback: true, publicKey: PUBLIC,
  });
  const events = [];
  publish(text1, [[n1.archivo, JAR1]]);
  let result = await installer.install(installOptions(), (e) => events.push(e));
  const modsDir = path.join(gameDir, 'mods');
  check(result.exitCode === 0 && fs.existsSync(path.join(modsDir, n1.archivo)), 'Jugar instala el mod Ishe junto con los demas (' + result.problems.join('; ') + ')');
  check(fs.existsSync(path.join(modsDir, 'simple-voice-chat-1.0.jar')), 'Simple Voice Chat tambien se instala (lo necesitan Nublado y Haku)');
  check(result.mods.some((m) => m.project === modishe.PROJECT_KEY && m.file === n1.archivo), 'queda anotado en la lista de mods instalados');
  publish(modishe.sign(n2, PRIVATE), [[n2.archivo, JAR2]]);
  result = await installer.install(installOptions(), () => {});
  check(fs.existsSync(path.join(modsDir, n2.archivo)) && !fs.existsSync(path.join(modsDir, n1.archivo)), 'al actualizar, se retira el .jar viejo del mod Ishe');
  publish(null);
  result = await installer.install(installOptions(), () => {});
  check(result.exitCode === 0 && fs.existsSync(path.join(modsDir, n2.archivo)), 'si GitHub no tiene aviso, se conserva el que ya tenias y no es un problema');
  publish(modishe.sign(n1, OTHER_PRIVATE), [[n1.archivo, JAR1]]);
  result = await installer.install(installOptions(), () => {});
  check(result.exitCode === 2 && result.problems.some((p) => p.includes('mod Ishe')) && fs.existsSync(path.join(modsDir, n2.archivo)), 'con un aviso mal firmado se avisa y se conserva el mod que funcionaba');
  const oldE4 = path.join(modsDir, installer.E4STEAM_FILE);
  fs.writeFileSync(oldE4, 'e4steam de una version anterior');
  fs.writeFileSync(path.join(gameDir, 'ishe-client-instalado.json'), JSON.stringify({ client: 'x', minecraft: installer.MC_VERSION, fabric: 'f', mods: [{ project: 'e4steam', file: installer.E4STEAM_FILE }] }));
  result = await installer.install(installOptions(), () => {});
  check(!fs.existsSync(oldE4) && !result.mods.some((m) => m.project === 'e4steam'), 'el e4steam que quedo de una version anterior se borra y se olvida');
  const manual = path.join(modsDir, 'otro-mod-mio.jar');
  fs.writeFileSync(manual, 'mio');
  publish(modishe.sign(n2, PRIVATE), [[n2.archivo, JAR2]]);
  await installer.install(installOptions(), () => {});
  check(fs.existsSync(manual), 'un mod que anadiste tu a mano nunca se borra');

  modrinth.close();
  fabric.close();
  server.close();
  console.log('\n' + (checks - failures) + ' de ' + checks + ' comprobaciones bien');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
