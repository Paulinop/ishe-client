'use strict';
// Pruebas del formato de actualizaciones, del creador y del actualizador,
// con un servidor en este equipo que hace de pagina de versiones de GitHub.
// uso: node test_update.js <carpeta app> <clave privada del creador (.pem)>
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const APP = path.resolve(process.argv[2]);
const PRIVATE = fs.readFileSync(process.argv[3], 'utf8');
const paquete = require(path.join(APP, 'core', 'paquete.js'));
const versiones = require(path.join(APP, 'core', 'versiones.js'));
const updater = require(path.join(APP, 'core', 'updater.js'));
const creator = require(path.join(APP, 'core', 'creator.js'));
const PUBLIC = require(path.join(APP, 'core', 'clave-publica.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message || 'error'; } };
async function reasonOf(promise) {
  try { await promise; return ''; } catch (e) { return e instanceof updater.UpdateError ? e.reason + ': ' + e.message : 'NOT UpdateError ' + e.stack; }
}
const EXTRAS_PRUEBA = (() => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-extras-')); fs.writeFileSync(path.join(d, 'extra-de-prueba.jar'), crypto.randomBytes(4096)); return d; })();
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-upd-' + name + '-'));
const CURRENT = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
const NEXT = creator.nextVersion(CURRENT);
const THEME = { color1: '#ff5577', color2: '#ffaa00', fondo: '#101018', logo: '' };
const other = crypto.generateKeyPairSync('ed25519');
const OTHER_PRIVATE = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

// ---- servidor: sirve una carpeta "de version" y permite alterarla ----------------
let served = new Map();
const hits = [];
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('/').pop());
  hits.push(name);
  if (req.url.startsWith('/latest/')) { res.writeHead(302, { Location: '/tag/' + name }); return res.end(); }
  if (req.url.startsWith('/evil/')) { res.writeHead(302, { Location: 'https://evil.example/' + name }); return res.end(); }
  const body = served.get(name);
  if (!body) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Length': body.length });
  res.end(body);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const buildNext = (extra) => creator.build(Object.assign({ codeDir: APP, extrasDir: EXTRAS_PRUEBA, version: NEXT, notes: 'Colores nuevos y logo propio.',
    theme: THEME, privateKeyPem: PRIVATE, publicKeyPem: PUBLIC, today: '2026-10-07' }, extra || {}));
  const opts = (root, extra) => Object.assign({ base: base + '/latest', publicKey: PUBLIC, currentVersion: CURRENT, updatesRoot: root, engineMajor: 44, allowLoopback: true,
    bundledExtrasDir: EXTRAS_PRUEBA, activeExtrasDir: EXTRAS_PRUEBA }, extra || {});

  console.log('U1 formato del paquete y firma');
  const sample = new Map([['main.js', Buffer.from('m')], ['preload.js', Buffer.from('p')], ['package.json', Buffer.from('{}')], ['renderer/index.html', Buffer.from('<p>')], ['assets/logo.png', Buffer.from([1, 2, 3, 0, 255])]]);
  const round = paquete.unpack(paquete.pack(sample));
  check(round.size === 5 && round.get('assets/logo.png').equals(Buffer.from([1, 2, 3, 0, 255])), 'empaquetar y desempaquetar devuelve lo mismo');
  for (const bad of ['inicio.js', 'test-hooks.js', '../main.js', 'core/../inicio.js', 'extras/x.jar', 'core/sub/x.js', 'renderer/x.exe', 'C:\\x.js', '/etc/passwd', 'core/x.node']) {
    check(throws(() => paquete.pack(new Map([[bad, Buffer.from('x')]]))) !== '', 'no se puede empaquetar "' + bad + '"');
  }
  const zlib = require('zlib');
  const evilBundle = zlib.gzipSync(Buffer.from(JSON.stringify({ formato: 1, archivos: { 'main.js': 'eA==', '../../inicio.js': 'eA==' } })));
  check(throws(() => paquete.unpack(evilBundle)).includes('no permitido') && throws(() => paquete.unpack(Buffer.from('not gzip'))).includes('dañado'), 'desempaquetar rechaza rutas raras y paquetes dañados');
  const bomb = zlib.gzipSync(Buffer.from(JSON.stringify({ formato: 1, archivos: { 'main.js': 'A'.repeat(70 * 1024 * 1024) } })));
  check(throws(() => paquete.unpack(bomb)) !== '', 'desempaquetar rechaza un paquete que se infla demasiado');
  check(paquete.compareVersions('1.10.0', '1.9.9') === 1 && paquete.compareVersions('1.2.0', '1.2.0') === 0 && paquete.compareVersions('1.1.9', '1.2.0') === -1 && !paquete.validVersion('1.2') && !paquete.validVersion('1.2.0-beta') && !paquete.validVersion('01.2.0') && !paquete.validVersion('../1.2.0'), 'comparación y formato de versiones');
  check(paquete.sameKey(paquete.publicKeyOf(PRIVATE), PUBLIC) && !paquete.sameKey(paquete.publicKeyOf(OTHER_PRIVATE), PUBLIC) && paquete.publicKeyOf('hola') === '', 'la clave privada del creador corresponde a la clave pública incluida');

  console.log('U2 crear una actualización');
  const built = buildNext();
  const envelope = built.files.get(paquete.MANIFEST_NAME).toString('utf8');
  const manifest = paquete.verify(envelope, PUBLIC);
  const jar = fs.readdirSync(EXTRAS_PRUEBA)[0];
  check(JSON.stringify(built.upload) === JSON.stringify([jar, paquete.MANIFEST_NAME, paquete.bundleName(NEXT)].sort()) && built.files.has('LEEME - como publicar.txt'), 'salen el aviso, el paquete, e4steam y las instrucciones');
  check(manifest && manifest.version === NEXT && manifest.notas === 'Colores nuevos y logo propio.' && manifest.extras.length === 1 && manifest.extras[0].archivo === jar, 'el aviso está firmado y dice versión, notas y extras');
  const inside = paquete.unpack(built.files.get(paquete.bundleName(NEXT)));
  const names = Array.from(inside.keys());
  check(['main.js', 'preload.js', 'core/auth.js', 'core/game.js', 'core/updater.js', 'renderer/app.js', 'renderer/style.css', 'assets/logo.png', 'tema.json', 'noticias.json'].every((n) => names.includes(n)), 'el paquete trae los archivos del client');
  check(!names.some((n) => /inicio|test-hooks|cli\.js|extras|\.jar|\.pem/.test(n)), 'el paquete NO trae el arranque, archivos de pruebas, e4steam ni claves: ' + names.filter((n) => /inicio|test|cli|extras/.test(n)));
  check(JSON.parse(inside.get('package.json')).version === NEXT && JSON.stringify(JSON.parse(inside.get('tema.json'))) === JSON.stringify(THEME), 'lleva el número de versión nuevo y la apariencia elegida');
  const news = JSON.parse(inside.get('noticias.json'));
  check(news[0].titulo === 'Versión ' + NEXT && news[0].texto === 'Colores nuevos y logo propio.' && news.length <= 4 && news.filter((n) => /^Versión/.test(n.titulo)).length === 1, 'las notas salen como primera novedad (y sustituyen a la de la versión anterior)');
  check(built.files.get(paquete.bundleName(NEXT)).length < 1024 * 1024, 'el paquete pesa poco: ' + Math.round(built.files.get(paquete.bundleName(NEXT)).length / 1024) + ' KB');
  check(!Array.from(built.files.values()).some((b) => b.includes('PRIVATE KEY')), 'la clave privada no aparece en ningún archivo de salida');
  check(built.files.get('LEEME - como publicar.txt').toString().includes('v' + NEXT) && built.files.get('LEEME - como publicar.txt').toString().includes('github.com/Paulinop/ishe-client/releases/new'), 'las instrucciones dicen la etiqueta y la página exactas');
  check(throws(() => buildNext({ version: CURRENT })).includes('mayor que la actual') && throws(() => buildNext({ version: '0.9.0' })).includes('mayor') && throws(() => buildNext({ version: '2.0' })).includes('tres números'), 'no deja repetir ni bajar el número de versión');
  check(throws(() => buildNext({ privateKeyPem: OTHER_PRIVATE })).includes('no es la clave') && throws(() => buildNext({ privateKeyPem: 'basura' })).includes('no es la clave'), 'con otra clave no se puede crear');

  console.log('U3 aviso alterado o firmado por otro');
  const tampered = JSON.parse(envelope);
  const inner = JSON.parse(Buffer.from(tampered.aviso, 'base64'));
  inner.version = '9.9.9';
  inner.paquete.archivo = paquete.bundleName('9.9.9');
  check(paquete.verify(JSON.stringify({ aviso: Buffer.from(JSON.stringify(inner)).toString('base64'), firma: tampered.firma }), PUBLIC) === null, 'aviso cambiado después de firmar: rechazado');
  check(paquete.verify(paquete.sign(manifest, OTHER_PRIVATE), PUBLIC) === null, 'aviso firmado con otra clave: rechazado');
  check(paquete.verify('{}', PUBLIC) === null && paquete.verify('no json', PUBLIC) === null && paquete.verify(JSON.stringify({ aviso: tampered.aviso, firma: '' }), PUBLIC) === null, 'aviso sin firma o ilegible: rechazado');
  const signedBad = (change) => { const m = JSON.parse(JSON.stringify(manifest)); change(m); return paquete.verify(paquete.sign(m, PRIVATE), PUBLIC); };
  check(signedBad((m) => { m.archivos['inicio.js'] = m.archivos['main.js']; }) === null && signedBad((m) => { delete m.archivos['main.js']; }) === null && signedBad((m) => { m.version = '1.x'; }) === null
    && signedBad((m) => { m.extras = [{ archivo: '../x.jar', sha256: m.paquete.sha256, tamano: 5 }]; }) === null && signedBad((m) => { m.paquete.archivo = 'otro.bin'; }) === null, 'incluso bien firmado, un aviso con contenido raro no vale');

  console.log('U4 buscar y descargar');
  const root = tmp('root');
  served = new Map();
  hits.length = 0;
  check((await updater.check(opts(root))).status === 'none', 'sin ninguna versión publicada: no hay nada (sin error)');
  served = new Map(built.files);
  check((await updater.check(opts(root, { currentVersion: NEXT }))).status === 'none' && (await updater.check(opts(root, { currentVersion: '9.0.0' }))).status === 'none', 'si ya tienes esa versión o una mayor: no hay nada');
  const found = await updater.check(opts(root));
  check(found.status === 'available' && found.version === NEXT && found.notes === 'Colores nuevos y logo propio.', 'versión nueva detectada con sus notas');
  hits.length = 0;
  const done = await updater.download(opts(root, { manifest: found.manifest, envelope: found.envelope }));
  check(done.version === NEXT && paquete.verifyDir(path.join(root, NEXT), NEXT, PUBLIC) !== null, 'descargada, guardada y comprobada en disco');
  check(JSON.stringify(hits) === JSON.stringify([paquete.bundleName(NEXT), paquete.bundleName(NEXT)]) && !fs.existsSync(path.join(root, NEXT, 'extras')), 'solo baja el paquete (siguiendo la redirección); e4steam no, porque es el mismo: ' + JSON.stringify(hits));
  const st = versiones.readState(root);
  check(st.version === NEXT && st.confirmada === false && st.intentos === 0, 'queda apuntada para el siguiente arranque');
  check((await updater.check(opts(root))).status === 'ready', 'volver a buscar: ya está lista, no se baja otra vez');
  check(!fs.existsSync(path.join(root, NEXT, 'inicio.js')) && fs.existsSync(path.join(root, NEXT, 'main.js')), 'la versión descargada no trae arranque propio');

  console.log('U5 copia en disco alterada');
  const mainFile = path.join(root, NEXT, 'main.js');
  const original = fs.readFileSync(mainFile);
  fs.writeFileSync(mainFile, Buffer.concat([original, Buffer.from('\n// cambio')]));
  check(paquete.verifyDir(path.join(root, NEXT), NEXT, PUBLIC) === null, 'un archivo cambiado en disco invalida la versión');
  fs.writeFileSync(mainFile, original);
  check(paquete.verifyDir(path.join(root, NEXT), NEXT, PUBLIC) !== null && paquete.verifyDir(path.join(root, NEXT), '9.9.9', PUBLIC) === null, 'intacta vuelve a valer; con otro número de versión no');
  fs.rmSync(path.join(root, NEXT, 'core', 'auth.js'));
  check(paquete.verifyDir(path.join(root, NEXT), NEXT, PUBLIC) === null, 'un archivo que falta invalida la versión');

  console.log('U6 descargas alteradas');
  const root2 = tmp('root2');
  const fresh = await updater.check(opts(root2));
  served.set(paquete.bundleName(NEXT), Buffer.concat([built.files.get(paquete.bundleName(NEXT)), Buffer.from('x')]));
  check((await reasonOf(updater.download(opts(root2, { manifest: fresh.manifest, envelope: fresh.envelope })))).startsWith('invalid') && !fs.existsSync(path.join(root2, NEXT)) && versiones.readState(root2).version === '', 'paquete alterado: rechazado, no queda nada instalado');
  const otherBundle = paquete.pack(new Map([...sample]));
  served.set(paquete.bundleName(NEXT), otherBundle);
  check((await reasonOf(updater.download(opts(root2, { manifest: fresh.manifest, envelope: fresh.envelope })))).startsWith('invalid'), 'paquete cambiado por otro: rechazado');
  served = new Map(built.files);
  served.set(paquete.MANIFEST_NAME, Buffer.from(paquete.sign(manifest, OTHER_PRIVATE)));
  check((await reasonOf(updater.check(opts(root2)))).startsWith('invalid'), 'aviso firmado por otra persona: rechazado');
  served = new Map(built.files);
  check((await reasonOf(updater.check(opts(root2, { base: base + '/evil' })))).includes('sitio no permitido: evil.example'), 'redirección fuera de GitHub: rechazada');
  check(!fs.readdirSync(root2).some((n) => n.endsWith('.descargando')), 'no quedan carpetas a medias');
  served.set(paquete.MANIFEST_NAME, Buffer.alloc(3 * 1024 * 1024, 0x41));
  check((await reasonOf(updater.check(opts(root2)))).includes('más grande de lo esperado'), 'una respuesta enorme se corta sin leerla entera');
  served = new Map(built.files);

  console.log('U7 e4steam distinto, motor más nuevo, versión marcada como mala');
  const root3 = tmp('root3');
  const emptyExtras = tmp('extras');
  const f3 = await updater.check(opts(root3));
  hits.length = 0;
  await updater.download(opts(root3, { manifest: f3.manifest, envelope: f3.envelope, bundledExtrasDir: emptyExtras, activeExtrasDir: emptyExtras }));
  check(hits.includes(jar) && paquete.sha256(fs.readFileSync(path.join(root3, NEXT, 'extras', jar))) === manifest.extras[0].sha256, 'si e4steam cambió respecto al instalado, se descarga y se comprueba');
  served.set(jar, Buffer.from('otro jar'));
  const root4 = tmp('root4');
  check((await reasonOf(updater.download(opts(root4, { manifest: f3.manifest, envelope: f3.envelope, bundledExtrasDir: emptyExtras, activeExtrasDir: emptyExtras })))).includes('no coincide') && !fs.existsSync(path.join(root4, NEXT)), 'e4steam alterado: rechazado');
  served = new Map(built.files);
  const engine = JSON.parse(JSON.stringify(manifest));
  engine.motorMinimo = 50;
  served.set(paquete.MANIFEST_NAME, Buffer.from(paquete.sign(engine, PRIVATE)));
  check((await updater.check(opts(root4))).status === 'needs-installer', 'actualización que pide un motor más nuevo: avisa de reinstalar');
  served = new Map(built.files);
  versiones.writeState(root4, Object.assign(versiones.emptyState(), { malas: [NEXT] }));
  check((await updater.check(opts(root4))).status === 'none', 'una versión que no arrancó no se vuelve a ofrecer');

  const root6 = tmp('root6');
  versiones.writeState(root6, Object.assign(versiones.emptyState(), { version: '1.0.5', confirmada: true }));
  const f6 = await updater.check(opts(root6));
  await updater.download(opts(root6, { manifest: f6.manifest, envelope: f6.envelope }));
  const s6 = versiones.readState(root6);
  check(s6.version === NEXT && s6.anterior === '1.0.5' && s6.confirmada === false, 'la versión descargada que ya funcionaba queda anotada como "anterior", por si la nueva falla');

  console.log('U8 registro de versiones y direcciones reales');
  const root5 = tmp('root5');
  check(JSON.stringify(versiones.readState(root5)) === JSON.stringify(versiones.emptyState()), 'sin registro: se usa la versión instalada');
  fs.writeFileSync(path.join(root5, 'estado.json'), '{"version":"../../x","intentos":-3,"anterior":"x/y","fallo":7,"malas":["a","1.2.3"]}');
  const weird = versiones.readState(root5);
  check(weird.version === '' && weird.intentos === 0 && weird.anterior === '' && weird.fallo === '' && JSON.stringify(weird.malas) === '["1.2.3"]', 'un registro con valores raros se ignora');
  for (const d of ['1.2.0', '1.3.0', '1.3.0.descargando', 'mis-cosas']) fs.mkdirSync(path.join(root5, d));
  versiones.cleanup(root5, ['1.3.0', '']);
  check(JSON.stringify(fs.readdirSync(root5).sort()) === JSON.stringify(['1.3.0', 'estado.json', 'mis-cosas']), 'limpieza: borra versiones viejas y descargas a medias, nada más');
  check(updater.SOURCE === 'https://github.com/Paulinop/ishe-client/releases/latest/download', 'busca solo en la página de versiones de tu proyecto en GitHub');
  const bad = (u) => throws(() => updater.checkUrl(u, false)) !== '';
  check(!bad('https://github.com/Paulinop/ishe-client/releases/latest/download/x') && !bad('https://release-assets.githubusercontent.com/x') && bad('http://github.com/x') && bad('https://github.com.evil.com/x') && bad('https://evilgithubusercontent.com/x') && bad('http://127.0.0.1:8/x') && bad('file:///etc/passwd'), 'direcciones: solo GitHub por https');

  await new Promise((r) => server.close(r));
  check((await reasonOf(updater.check(opts(tmp('off'))))).startsWith('network'), 'sin conexión: se informa como fallo de red');

  console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
  process.exit(failures ? 1 : 0);
})();
