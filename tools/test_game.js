'use strict';
// Pruebas de core/game.js: descarga, comprobacion y arranque contra un servidor
// simulado en este equipo y un "Java" falso que anota como lo llamaron.
// uso: node test_game.js <carpeta app>
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const game = require(path.join(path.resolve(process.argv[2]), 'core', 'game.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

const FABRIC_ID = 'fabric-loader-0.19.5-26.2';
const TOKEN = 'SECRET-MC-ACCESS-TOKEN';
const ACCOUNT = { name: 'Guishe_7', uuid: 'abcdef0123456789abcdef0123456789', accessToken: TOKEN };

// ---- mundo simulado -----------------------------------------------------------
const files = new Map();     // ruta -> Buffer
const hits = [];             // rutas pedidas
let base = '';
const put = (route, body) => { const b = Buffer.isBuffer(body) ? body : Buffer.from(body); files.set(route, b); return b; };

const FAKE_JAVA = `#!/bin/sh
for a in "$@"; do printf '%s\\n' "$a"; done > "$ISHE_FAKE_JAVA_OUT"
echo "fake java started with token $ISHE_FAKE_ECHO"
echo "second line" 1>&2
exit \${ISHE_FAKE_JAVA_EXIT:-0}
`;

function buildWorld() {
  files.clear();
  const lib = (name, rules) => {
    const rel = game.mavenPath(name);
    const body = put('/libs/' + rel, 'jar:' + name);
    const entry = { name, downloads: { artifact: { path: rel, sha1: sha1(body), size: body.length, url: base + '/libs/' + rel } } };
    if (rules) entry.rules = rules;
    return entry;
  };
  const client = put('/client.jar', 'the game');
  const a1 = put('/assets/' + sha1('sound one').slice(0, 2) + '/' + sha1('sound one'), 'sound one');
  const a2 = put('/assets/' + sha1('texture two').slice(0, 2) + '/' + sha1('texture two'), 'texture two');
  const index = put('/index32.json', JSON.stringify({ objects: {
    'minecraft/sounds/a.ogg': { hash: sha1(a1), size: a1.length },
    'minecraft/sounds/copy-of-a.ogg': { hash: sha1(a1), size: a1.length },
    'minecraft/textures/b.png': { hash: sha1(a2), size: a2.length },
  } }));
  const version = {
    id: '26.2', type: 'release', mainClass: 'net.minecraft.client.main.Main',
    arguments: {
      game: ['--username', '${auth_player_name}', '--version', '${version_name}', '--gameDir', '${game_directory}',
        '--assetsDir', '${assets_root}', '--assetIndex', '${assets_index_name}', '--uuid', '${auth_uuid}',
        '--accessToken', '${auth_access_token}', '--clientId', '${clientid}', '--xuid', '${auth_xuid}', '--versionType', '${version_type}',
        { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' },
        { rules: [{ action: 'allow', features: { has_custom_resolution: true } }], value: ['--width', '${resolution_width}', '--height', '${resolution_height}'] },
        { rules: [{ action: 'allow', features: { has_quick_plays_support: true } }], value: ['--quickPlayPath', '${quickPlayPath}'] }],
      jvm: [
        { rules: [{ action: 'allow', os: { name: 'osx' } }], value: ['-XstartOnFirstThread'] },
        { rules: [{ action: 'allow', os: { name: 'windows' } }], value: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump' },
        { rules: [{ action: 'allow', os: { arch: 'x86' } }], value: '-Xss1M' },
        '--sun-misc-unsafe-memory-access=allow', '--enable-native-access=ALL-UNNAMED',
        '-Djava.library.path=${natives_directory}/java', '-Djna.tmpdir=${natives_directory}/jna',
        '-Dorg.lwjgl.system.SharedLibraryExtractPath=${natives_directory}/lwjgl', '-Dio.netty.native.workdir=${natives_directory}/netty',
        '-Dminecraft.launcher.brand=${launcher_name}', '-Dminecraft.launcher.version=${launcher_version}', '-cp', '${classpath}'],
      'default-user-jvm': [
        { value: ['-Xms2G', '-Xmx4G', '-XX:+UseCompactObjectHeaders', '-XX:+AlwaysPreTouch', '-XX:+UseStringDeduplication'] },
        { rules: [{ action: 'allow', os: { name: 'osx' } }, { action: 'allow', os: { name: 'linux' } },
          { action: 'allow', os: { name: 'windows', versionRange: { min: '10.0.17134' } } }], value: ['-XX:+UseZGC'] },
        { rules: [{ action: 'allow', os: { name: 'windows', versionRange: { max: '10.0.17134' } } }],
          value: ['-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC'] }],
    },
    assetIndex: { id: '32', sha1: sha1(index), url: base + '/index32.json' },
    assets: '32',
    javaVersion: { component: 'java-runtime-epsilon', majorVersion: 25 },
    downloads: { client: { sha1: sha1(client), size: client.length, url: base + '/client.jar' } },
    logging: { client: { argument: '-Dlog4j.configurationFile=${path}', file: { id: 'client-1.21.2.xml', sha1: 'x', url: base + '/log.xml' } } },
    libraries: [
      lib('com.google.code.gson:gson:2.14.0'),
      lib('org.ow2.asm:asm:9.6'),   // Fabric trae una mas nueva: debe ganar la de Fabric
      lib('org.lwjgl:lwjgl:3.4.1'),
      lib('org.lwjgl:lwjgl:3.4.1:natives-linux', [{ action: 'allow', os: { name: 'linux' } }]),
      lib('org.lwjgl:lwjgl:3.4.1:natives-windows', [{ action: 'allow', os: { name: 'windows' } }]),
      lib('org.lwjgl:lwjgl:3.4.1:natives-macos-arm64', [{ action: 'allow', os: { name: 'osx' } }]),
    ],
  };
  const versionBody = put('/v/26.2.json', JSON.stringify(version));
  put('/manifest.json', JSON.stringify({ latest: { release: '26.3' }, versions: [
    { id: '26.3', type: 'release', url: base + '/v/26.3.json', sha1: 'none' },
    { id: '26.2', type: 'release', url: base + '/v/26.2.json', sha1: sha1(versionBody) }] }));

  const javaBin = put('/java/files/bin/java', FAKE_JAVA);
  const javaLib = put('/java/files/lib/modules', 'java modules');
  const javaManifest = put('/java/manifest.json', JSON.stringify({ files: {
    bin: { type: 'directory' },
    'bin/java': { type: 'file', executable: true, downloads: { raw: { sha1: sha1(javaBin), size: javaBin.length, url: base + '/java/files/bin/java' } } },
    lib: { type: 'directory' },
    'lib/modules': { type: 'file', executable: false, downloads: { raw: { sha1: sha1(javaLib), size: javaLib.length, url: base + '/java/files/lib/modules' } } },
    'lib/modules-link': { type: 'link', target: 'modules' },
  } }));
  put('/java/all.json', JSON.stringify({
    linux: { 'java-runtime-epsilon': [{ manifest: { sha1: sha1(javaManifest), url: base + '/java/manifest.json' }, version: { name: '25.0.1' } }], 'jre-legacy': [] },
    'windows-x64': { 'java-runtime-epsilon': [] },
  }));
  return version;
}

const fabricLibs = () => {
  const asm = put('/fabric/' + game.mavenPath('org.ow2.asm:asm:9.10.1'), 'jar:asm-new');
  put('/fabric/' + game.mavenPath('net.fabricmc:fabric-loader:0.19.5'), 'jar:fabric-loader');
  return [
    { name: 'org.ow2.asm:asm:9.10.1', url: base + '/fabric/', sha1: sha1(asm), size: asm.length },
    { name: 'net.fabricmc:fabric-loader:0.19.5', url: base + '/fabric/' },
  ];
};

function newDirs(libraries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-game-'));
  const minecraftDir = path.join(root, '.minecraft');
  const gameDir = path.join(root, '.ishe-client');
  const dir = path.join(minecraftDir, 'versions', FABRIC_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FABRIC_ID + '.json'), JSON.stringify({
    id: FABRIC_ID, inheritsFrom: '26.2', type: 'release', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] }, libraries,
  }));
  return { root, minecraftDir, gameDir };
}

const server = http.createServer((req, res) => {
  hits.push(req.url);
  if (req.url === '/redirect-out') { res.writeHead(302, { Location: 'https://evil.example/x.jar' }); return res.end(); }
  if (req.url === '/redirect-ok') { res.writeHead(302, { Location: '/client.jar' }); return res.end(); }
  const body = files.get(req.url);
  if (!body) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Length': body.length });
  res.end(body);
});

async function messageOf(promise) {
  try { await promise; return ''; } catch (error) { return error instanceof game.GameError ? error.message : 'NOT GameError: ' + (error && error.stack); }
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const sources = () => ({ versionManifest: base + '/manifest.json', javaRuntimes: base + '/java/all.json', assets: base + '/assets', allowLoopback: true });
  const LINUX = { platform: 'linux', arch: 'x64', osVersion: '6.1.0' };
  const optionsFor = (dirs, extra) => Object.assign({ minecraftDir: dirs.minecraftDir, gameDir: dirs.gameDir, fabricVersionId: FABRIC_ID,
    mcVersion: '26.2', env: LINUX, sources: sources() }, extra || {});

  console.log('G1 direcciones reales y reglas');
  const real = game.SOURCES;
  check([real.versionManifest, real.javaRuntimes, real.assets].every((u) => u.startsWith('https://') && /(^|\.)(mojang\.com|minecraft\.net)$/.test(new URL(u).hostname)), 'juego, Java y recursos salen solo de servidores de Mojang');
  check(real.allowedHosts.every((h) => /(^|\.)(mojang\.com|minecraft\.net|fabricmc\.net)$/.test(h)) && !real.allowLoopback, 'lista de sitios permitidos: solo Mojang y Fabric');
  check(await messageOf((async () => game.checkUrl('https://evil.example/a.jar', real))()) !== '' && await messageOf((async () => game.checkUrl('http://piston-data.mojang.com/a', real))()) !== ''
    && await messageOf((async () => game.checkUrl('http://127.0.0.1:1/a', real))()) !== '', 'rechaza otros sitios, http sin cifrar y direcciones locales');
  const R = game.rulesAllow;
  check(R(undefined, LINUX) && R([], LINUX), 'sin reglas se permite');
  check(R([{ action: 'allow', os: { name: 'linux' } }], LINUX) && !R([{ action: 'allow', os: { name: 'osx' } }], LINUX), 'regla por sistema');
  check(!R([{ action: 'allow' }, { action: 'disallow', os: { name: 'linux' } }], LINUX) && R([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], LINUX), 'la ultima regla que coincide manda');
  check(!R([{ action: 'allow', os: { name: 'linux', futureKey: 1 } }], LINUX) && !R([{ action: 'allow', newThing: {} }], LINUX), 'una condicion desconocida no coincide');
  const W = (v) => ({ platform: 'win32', arch: 'x64', osVersion: v });
  check(R([{ action: 'allow', os: { name: 'windows', versionRange: { min: '10.0.17134' } } }], W('10.0.22631')) && !R([{ action: 'allow', os: { name: 'windows', versionRange: { min: '10.0.17134' } } }], W('10.0.10240'))
    && R([{ action: 'allow', os: { name: 'windows', versionRange: { max: '10.0.17134' } } }], W('6.3.9600')) && !R([{ action: 'allow', os: { name: 'windows', versionRange: { max: '10.0.17134' } } }], W('10.0.17134')), 'rango de version de Windows');
  check(game.mavenPath('org.lwjgl:lwjgl:3.4.1:natives-windows') === 'org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-windows.jar' && game.mavenPath('net.fabricmc:sponge-mixin:0.17.4+mixin.0.8.7') === 'net/fabricmc/sponge-mixin/0.17.4+mixin.0.8.7/sponge-mixin-0.17.4+mixin.0.8.7.jar', 'nombre de biblioteca -> ruta');
  check(await messageOf((async () => game.mavenPath('a:../../x:1'))()) !== '', 'nombre de biblioteca con ../ se rechaza');
  check(game.javaPlatformKey({ platform: 'win32', arch: 'x64' }) === 'windows-x64' && game.javaPlatformKey({ platform: 'darwin', arch: 'arm64' }) === 'mac-os-arm64' && game.javaPlatformKey({ platform: 'darwin', arch: 'x64' }) === 'mac-os' && game.javaPlatformKey({ platform: 'win32', arch: 'arm64' }) === 'windows-arm64', 'Java correcto para cada sistema');
  check(game.javaExecutable('R', { platform: 'win32' }) === path.join('R', 'bin', 'javaw.exe') && game.javaExecutable('R', { platform: 'darwin' }) === path.join('R', 'jre.bundle', 'Contents', 'Home', 'bin', 'java'), 'programa de Java en Windows y Mac');

  console.log('G2 primera preparacion: descarga y comprueba todo');
  buildWorld();
  const dirs = newDirs(fabricLibs());
  const events = [];
  const prepared = await game.prepare(optionsFor(dirs), (e) => events.push(e));
  const mc = dirs.minecraftDir;
  const exists = (...p) => fs.existsSync(path.join(...p));
  check(fs.readFileSync(path.join(mc, 'versions', '26.2', '26.2.jar'), 'utf8') === 'the game', 'el juego queda en la carpeta de versiones');
  check(exists(mc, 'libraries', 'com/google/code/gson/gson/2.14.0/gson-2.14.0.jar') && exists(mc, 'libraries', 'org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-linux.jar') && exists(mc, 'libraries', 'net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar'), 'bibliotecas del juego y de Fabric descargadas');
  check(!exists(mc, 'libraries', 'org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-windows.jar') && !exists(mc, 'libraries', 'org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-macos-arm64.jar'), 'no baja bibliotecas de otros sistemas');
  check(exists(mc, 'libraries', 'org/ow2/asm/asm/9.10.1/asm-9.10.1.jar') && !exists(mc, 'libraries', 'org/ow2/asm/asm/9.6/asm-9.6.jar'), 'biblioteca repetida: se usa la de Fabric y no la del juego');
  const objects = path.join(mc, 'assets', 'objects');
  check(exists(mc, 'assets', 'indexes', '32.json') && fs.readdirSync(objects).reduce((n, d) => n + fs.readdirSync(path.join(objects, d)).length, 0) === 2, 'indice de recursos y 2 recursos distintos (el repetido se baja una vez)');
  check(prepared.java === path.join(dirs.gameDir, 'runtime', 'java-runtime-epsilon', 'linux', 'bin', 'java') && (fs.statSync(prepared.java).mode & 0o111) !== 0, 'Java instalado en la carpeta de Ishe Client y ejecutable');
  check(fs.readlinkSync(path.join(path.dirname(path.dirname(prepared.java)), 'lib', 'modules-link')) === 'modules', 'enlaces de Java creados');
  check(exists(dirs.gameDir, 'cache', '26.2.json') && !exists(mc, 'versions', '26.2', '26.2.json'), 'la descripcion de la version se guarda aparte, sin tocar la del launcher oficial');
  check(!hits.includes('/log.xml') && !hits.includes('/v/26.3.json'), 'no pide nada que no necesita');
  check(events.filter((e) => e.type === 'step').map((e) => e.text).join('|') === 'Comprobando la versión de Minecraft|Descargando Minecraft|Descargando bibliotecas|Descargando recursos del juego|Preparando Java', 'avisa de cada paso');

  console.log('G3 argumentos de arranque');
  const args = game.buildArguments(prepared, optionsFor(dirs, { ramGb: 0 }), ACCOUNT);
  const cp = args[args.indexOf('-cp') + 1].split(':');
  const main = args.indexOf('net.fabricmc.loader.impl.launch.knot.KnotClient');
  check(main > args.indexOf('-cp') && args.indexOf('--username') > main && !args.includes('net.minecraft.client.main.Main'), 'orden: Java, clase principal de Fabric, opciones del juego');
  check(cp.length === 6 && cp[cp.length - 1] === path.join(mc, 'versions', '26.2', '26.2.jar') && cp[0].endsWith('asm-9.10.1.jar') && cp.every((f) => fs.existsSync(f)), 'classpath: Fabric primero, juego al final, todos los archivos existen');
  check(args[args.indexOf('--username') + 1] === 'Guishe_7' && args[args.indexOf('--uuid') + 1] === ACCOUNT.uuid && args[args.indexOf('--accessToken') + 1] === TOKEN && args.filter((a) => a.includes(TOKEN)).length === 1, 'nombre, uuid y sesion de la cuenta (la sesion aparece una sola vez)');
  check(args[args.indexOf('--gameDir') + 1] === dirs.gameDir && args[args.indexOf('--version') + 1] === FABRIC_ID && args[args.indexOf('--assetIndex') + 1] === '32' && args[args.indexOf('--assetsDir') + 1] === path.join(mc, 'assets'), 'carpeta de Ishe Client, version y recursos');
  check(!args.includes('--demo') && !args.includes('--width') && !args.includes('--quickPlayPath') && !args.some((a) => /\$\{/.test(a)), 'sin modo demo ni opciones sin resolver');
  check(args.includes('-DFabricMcEmu= net.minecraft.client.main.Main ') && args.includes('-Djava.library.path=' + path.join(dirs.gameDir, 'natives') + '/java') && args.includes('-Dminecraft.launcher.brand=IsheClient'), 'opciones de Fabric, carpeta de nativos y nombre del launcher');
  check(args.includes('-Xmx4G') && args.includes('-Xms2G') && args.includes('-XX:+UseZGC') && !args.includes('-XX:+UseG1GC') && !args.includes('-XstartOnFirstThread') && !args.some((a) => a.includes('HeapDumpPath')), 'memoria automatica: la recomendada por la version; sin opciones de otros sistemas');
  const six = game.buildArguments(prepared, optionsFor(dirs, { ramGb: 6 }), ACCOUNT);
  check(six.includes('-Xmx6G') && !six.includes('-Xmx4G') && !six.includes('-Xms2G') && six.includes('-XX:+UseZGC'), 'memoria elegida (6 GB) sustituye a la recomendada');
  const winNew = game.buildArguments(prepared, optionsFor(dirs, { env: { platform: 'win32', arch: 'x64', osVersion: '10.0.22631' } }), ACCOUNT);
  const winOld = game.buildArguments(prepared, optionsFor(dirs, { env: { platform: 'win32', arch: 'x64', osVersion: '6.3.9600' } }), ACCOUNT);
  check(winNew.includes('-XX:+UseZGC') && !winNew.includes('-XX:+UseG1GC') && winNew.some((a) => a.includes('HeapDumpPath')) && winOld.includes('-XX:+UseG1GC') && !winOld.includes('-XX:+UseZGC'), 'Windows: opciones segun la version del sistema, nunca dos recolectores a la vez');
  const mac = game.buildArguments(prepared, optionsFor(dirs, { env: { platform: 'darwin', arch: 'arm64', osVersion: '24.1.0' } }), ACCOUNT);
  check(mac.includes('-XstartOnFirstThread') && mac.includes('-XX:+UseZGC') && !mac.some((a) => a.includes('HeapDumpPath')), 'Mac: -XstartOnFirstThread');
  check(await messageOf((async () => game.buildArguments(prepared, optionsFor(dirs), null))()) !== '' && await messageOf((async () => game.buildArguments(prepared, optionsFor(dirs), { name: 'x', uuid: 'y', accessToken: '' }))()) !== '', 'sin sesion de Minecraft no hay argumentos: no existe arranque sin cuenta');
  const noDefaults = JSON.parse(JSON.stringify(prepared));
  noDefaults.version.arguments['default-user-jvm'] = [];
  check(game.buildArguments(noDefaults, optionsFor(dirs), ACCOUNT).includes('-Xmx2G'), 'si la version no recomienda memoria se usan 2 GB');

  console.log('G4 segunda preparacion: no vuelve a bajar lo que ya esta');
  hits.length = 0;
  await game.prepare(optionsFor(dirs));
  check(JSON.stringify(hits.sort()) === JSON.stringify(['/java/all.json', '/manifest.json']), 'solo consulta las dos listas: ' + JSON.stringify(hits));

  console.log('G5 arranque con un Java falso');
  const argvFile = path.join(dirs.root, 'argv.txt');
  process.env.ISHE_FAKE_JAVA_OUT = argvFile;
  process.env.ISHE_FAKE_ECHO = TOKEN;
  process.env.ISHE_FAKE_JAVA_EXIT = '3';
  const running = await game.launch(prepared, optionsFor(dirs, { ramGb: 6 }), ACCOUNT);
  const ended = await running.exited;
  check(fs.readFileSync(argvFile, 'utf8').trimEnd().split('\n').join('\u0000') === six.join('\u0000'), 'Java recibe exactamente los argumentos calculados');
  check(ended.code === 3 && ended.tail.length === 2 && ended.tail.some((l) => l.includes('second line')), 'se conoce el codigo de salida y las ultimas lineas');
  check(!ended.tail.join('\n').includes(TOKEN) && ended.tail.join('\n').includes('***'), 'la sesion se tapa en las lineas guardadas');
  const broken = Object.assign({}, prepared, { java: path.join(dirs.root, 'no-such-java') });
  check((await messageOf(game.launch(broken, optionsFor(dirs), ACCOUNT))).startsWith('No se pudo iniciar Java'), 'si Java no arranca se explica');

  console.log('G6 descargas danadas o de sitios no permitidos');
  buildWorld();
  const gson = '/libs/com/google/code/gson/gson/2.14.0/gson-2.14.0.jar';
  files.set(gson, Buffer.from('tampered'));
  const dirs2 = newDirs(fabricLibs());
  const message2 = await messageOf(game.prepare(optionsFor(dirs2)));
  check(message2.includes('no coincide con su codigo de verificacion') && message2.includes('gson-2.14.0.jar') && !fs.existsSync(path.join(dirs2.minecraftDir, 'libraries', 'com/google/code/gson/gson/2.14.0/gson-2.14.0.jar')), 'biblioteca alterada: se detiene y no la deja en disco');
  buildWorld();
  const dirs3 = newDirs([{ name: 'evil:lib:1.0', url: 'https://evil.example/maven/' }]);
  hits.length = 0;
  const message3 = await messageOf(game.prepare(optionsFor(dirs3)));
  check(message3.includes('sitio no permitido: evil.example'), 'biblioteca alojada en otro sitio: se rechaza');
  buildWorld();
  const dirs4 = newDirs([{ name: 'evil:redirect:1.0', downloads: { artifact: { path: 'evil/redirect/1.0/redirect-1.0.jar', url: base + '/redirect-out' } } }]);
  check((await messageOf(game.prepare(optionsFor(dirs4)))).includes('sitio no permitido: evil.example') && !fs.existsSync(path.join(dirs4.minecraftDir, 'libraries', 'evil')), 'redireccion hacia otro sitio: se rechaza');
  const dirs5 = newDirs([{ name: 'ok:redirect:1.0', downloads: { artifact: { path: 'ok/redirect/1.0/redirect-1.0.jar', url: base + '/redirect-ok' } } }]);
  check(await messageOf(game.prepare(optionsFor(dirs5))) === '' && fs.readFileSync(path.join(dirs5.minecraftDir, 'libraries', 'ok/redirect/1.0/redirect-1.0.jar'), 'utf8') === 'the game', 'redireccion dentro de un sitio permitido: se sigue');
  const dirs6 = newDirs([{ name: 'evil:path:1.0', downloads: { artifact: { path: '../../outside.jar', url: base + '/client.jar' } } }]);
  check((await messageOf(game.prepare(optionsFor(dirs6)))).includes('ruta de archivo inesperada') && !fs.existsSync(path.join(dirs6.root, 'outside.jar')), 'ruta que se sale de la carpeta: se rechaza');
  buildWorld();
  const evilJava = JSON.parse(files.get('/java/manifest.json').toString());
  evilJava.files['../../../escape.txt'] = evilJava.files['lib/modules'];
  const evilBody = put('/java/manifest.json', JSON.stringify(evilJava));
  const allJava = JSON.parse(files.get('/java/all.json').toString());
  allJava.linux['java-runtime-epsilon'][0].manifest.sha1 = sha1(evilBody);
  put('/java/all.json', JSON.stringify(allJava));
  const dirs7 = newDirs(fabricLibs());
  check((await messageOf(game.prepare(optionsFor(dirs7)))).includes('ruta de archivo inesperada') && !fs.existsSync(path.join(dirs7.root, 'escape.txt')), 'archivo de Java que se sale de su carpeta: se rechaza');
  buildWorld();
  put('/java/manifest.json', '{"files":{}}');
  const dirs8 = newDirs(fabricLibs());
  check((await messageOf(game.prepare(optionsFor(dirs8)))).includes('lista de archivos de Java no coincide'), 'lista de Java alterada: se rechaza');
  buildWorld();
  const dirs9 = newDirs(fabricLibs());
  check((await messageOf(game.prepare(optionsFor(dirs9, { env: { platform: 'win32', arch: 'x64', osVersion: '10.0.22631' } })))).includes('Mojang no ofrece Java'), 'sistema sin Java disponible: se explica');
  const dirs10 = newDirs(fabricLibs());
  fs.rmSync(path.join(dirs10.minecraftDir, 'versions', FABRIC_ID), { recursive: true });
  check((await messageOf(game.prepare(optionsFor(dirs10)))).includes('Falta el perfil de Fabric'), 'sin perfil de Fabric: se explica');

  console.log('G7 sin conexion despues de haber jugado');
  await new Promise((resolve) => server.close(resolve));
  const offline = await messageOf(game.prepare(optionsFor(dirs)));
  check(offline === '', 'con todo ya descargado se puede preparar sin conexion' + (offline ? ': ' + offline : ''));
  const dirs11 = newDirs([]);
  check((await messageOf(game.prepare(optionsFor(dirs11)))).includes('revisa tu conexion'), 'primera vez sin conexion: se explica');

  console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
  process.exit(failures ? 1 : 0);
})();
