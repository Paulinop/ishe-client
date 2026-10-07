'use strict';
// Pruebas de "entrar directo al servidor al pulsar Jugar". uso: node tools/test_servidor.js app
const path = require('path');
const game = require(path.join(path.resolve(process.argv[2] || 'app'), 'core', 'game.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}

check(game.serverAddress('mi.servidor.com') === 'mi.servidor.com', 'acepta un nombre de servidor');
check(game.serverAddress(' 192.168.1.5:25566 ') === '192.168.1.5:25566', 'acepta una IP con puerto (y quita espacios)');
for (const malo of ['', 'mal servidor', 'a;b', '-x.com', 'x.com:0', 'x.com:99999', 'x.com:abc', 'http://x.com', 'x.com/../y', '--quickPlaySingleplayer', 'a'.repeat(300)]) {
  check(game.serverAddress(malo) === '', 'rechaza "' + malo.slice(0, 30) + '"');
}

const version = {
  assetIndex: { id: '32' }, type: 'release', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  arguments: {
    jvm: ['-cp', '${classpath}'], 'default-user-jvm': [],
    game: ['--username', '${auth_player_name}', '--accessToken', '${auth_access_token}',
      { rules: [{ action: 'allow', features: { is_quick_play_multiplayer: true } }], value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}'] },
      { rules: [{ action: 'allow', features: { is_quick_play_singleplayer: true } }], value: ['--quickPlaySingleplayer', '${quickPlaySingleplayer}'] }],
  },
};
const prepared = { version, nativesDir: 'n', librariesDir: 'l', assetsDir: 'a', classpath: 'cp', separator: ':' };
const base = { env: { platform: 'linux', arch: 'x64', osVersion: '6.0' }, fabricVersionId: 'fabric-loader-0.19.5-26.2', gameDir: 'g', ramGb: 0 };
const account = { name: 'Guishe', uuid: '0123456789abcdef0123456789abcdef', accessToken: 'TOKEN' };

let args = game.buildArguments(prepared, Object.assign({}, base, { joinServer: 'mi.servidor.com:25566' }), account);
const i = args.indexOf('--quickPlayMultiplayer');
check(i > 0 && args[i + 1] === 'mi.servidor.com:25566', 'con servidor, el juego arranca con --quickPlayMultiplayer <direccion>');
check(!args.includes('--quickPlaySingleplayer'), 'y no con el modo de un jugador');
args = game.buildArguments(prepared, base, account);
check(!args.includes('--quickPlayMultiplayer'), 'sin servidor, el juego abre normal');
args = game.buildArguments(prepared, Object.assign({}, base, { joinServer: 'x; rm -rf' }), account);
check(!args.includes('--quickPlayMultiplayer') && !args.some((a) => a.includes('rm -rf')), 'una direccion rara no llega al juego');
check(game.buildArguments(prepared, Object.assign({}, base, { joinServer: 'mi.servidor.com' }), account).includes('mi.servidor.com'), 'sin puerto tambien vale');
let sinSesion = '';
try { game.buildArguments(prepared, Object.assign({}, base, { joinServer: 'mi.servidor.com' }), null); } catch (e) { sinSesion = e.message; }
check(sinSesion !== '', 'con servidor o sin el, sin sesion de Minecraft no se abre el juego (no existe modo sin cuenta)');
console.log((checks - failures) + ' de ' + checks + ' comprobaciones bien');
process.exit(failures ? 1 : 0);
