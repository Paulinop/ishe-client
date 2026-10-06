'use strict';
// Pruebas de core/auth.js contra servicios simulados en este mismo equipo.
// uso: node test_auth.js <carpeta app>
const http = require('http');
const path = require('path');
const auth = require(path.join(path.resolve(process.argv[2]), 'core', 'auth.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}

// Lo que responde el servidor simulado; cada prueba lo cambia.
let world;
function resetWorld() {
  world = {
    requests: [],
    tokenReplies: [],            // respuestas sucesivas de /token (grant device_code)
    refreshReply: { status: 200, body: { access_token: 'ms-access-2', refresh_token: 'ms-refresh-2' } },
    xsts: { status: 200, body: { Token: 'xsts-token' } },
    login: { status: 200, body: { access_token: 'mc-access-token', expires_in: 86400 } },
    profile: { status: 200, body: { id: 'ABCDEF0123456789ABCDEF0123456789', name: 'Guishe_7' } },
    entitlements: { status: 200, body: { items: [{ name: 'product_minecraft' }, { name: 'game_minecraft' }] } },
    license: { status: 200, body: { items: [] } },
  };
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const entry = { path: req.url, method: req.method, headers: req.headers, raw };
    world.requests.push(entry);
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/devicecode') {
      return reply(200, { device_code: 'dev-code-1', user_code: 'ABCD1234', verification_uri: 'https://www.microsoft.com/link', interval: 1, expires_in: 900 });
    }
    if (req.url === '/token') {
      const form = new URLSearchParams(raw);
      if (form.get('grant_type') === 'refresh_token') return reply(world.refreshReply.status, world.refreshReply.body);
      const next = world.tokenReplies.shift() || { status: 400, body: { error: 'authorization_pending' } };
      return reply(next.status, next.body);
    }
    if (req.url === '/xbox') return reply(200, { Token: 'xbl-token', DisplayClaims: { xui: [{ uhs: 'user-hash' }] } });
    if (req.url === '/xsts') return reply(world.xsts.status, world.xsts.body);
    if (req.url === '/login') return reply(world.login.status, world.login.body);
    if (req.url === '/profile') return reply(world.profile.status, world.profile.body);
    if (req.url === '/entitlements') return reply(world.entitlements.status, world.entitlements.body);
    if (req.url.startsWith('/license?requestId=')) return reply(world.license.status, world.license.body);
    for (const [prefix, table] of [['/lookup/', world.lookup], ['/lookup2/', world.lookup2], ['/session/', world.session]]) {
      if (req.url.startsWith(prefix)) {
        // Como el servicio real, la busqueda por nombre no distingue mayusculas.
        const wanted = req.url.slice(prefix.length).toLowerCase();
        const key = Object.keys(table || {}).find((k) => k.toLowerCase() === wanted);
        const hit = key ? table[key] : null;
        return hit ? reply(hit.status, hit.body) : reply(404, { errorMessage: 'not found' });
      }
    }
    if (req.url.startsWith('/texture/')) {
      const body = (world.textures || {})[req.url.slice(9)];
      res.writeHead(body ? 200 : 404, { 'Content-Type': 'image/png' });
      return res.end(body || '');
    }
    reply(404, {});
  });
});

async function reasonOf(promise) {
  try { await promise; return 'no-error'; } catch (error) { return error instanceof auth.AuthError ? error.reason : 'not-auth-error: ' + error; }
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const E = {
    deviceCode: base + '/devicecode', token: base + '/token', xboxUser: base + '/xbox', xsts: base + '/xsts',
    minecraftLogin: base + '/login', minecraftProfile: base + '/profile', minecraftEntitlements: base + '/entitlements',
    minecraftLicense: base + '/license',
  };
  const noSleep = () => Promise.resolve();
  const find = (p) => world.requests.filter((r) => r.path === p);

  console.log('A1 registro y direcciones reales');
  check(auth.CLIENT_ID === '777b4ef5-0f7c-47c7-b03a-a9fefbfa49c2', 'usa el Application ID registrado en Azure');
  const hosts = Object.values(auth.ENDPOINTS).map((u) => new URL(u));
  check(hosts.every((u) => u.protocol === 'https:'), 'todas las direcciones reales son https');
  check(hosts.every((u) => ['login.microsoftonline.com', 'user.auth.xboxlive.com', 'xsts.auth.xboxlive.com', 'api.minecraftservices.com'].includes(u.hostname)),
    'solo habla con Microsoft, Xbox y Minecraft Services');
  check(auth.ENDPOINTS.deviceCode.includes('/consumers/') && auth.ENDPOINTS.token.includes('/consumers/'), 'usa el inquilino de cuentas personales (consumers)');

  console.log('A2 codigo de dispositivo');
  resetWorld();
  const started = await auth.startDeviceCode(E);
  const sent = new URLSearchParams(find('/devicecode')[0].raw);
  check(started.userCode === 'ABCD1234' && started.deviceCode === 'dev-code-1' && started.verificationUri === 'https://www.microsoft.com/link', 'devuelve el codigo y la pagina de Microsoft');
  check(sent.get('client_id') === auth.CLIENT_ID && sent.get('scope') === 'XboxLive.signin offline_access', 'pide solo el permiso de Xbox Live');
  check(!find('/devicecode')[0].raw.includes('client_secret'), 'no envia ningun secreto de aplicacion');

  console.log('A3 espera hasta que el usuario aprueba');
  resetWorld();
  world.tokenReplies = [
    { status: 400, body: { error: 'authorization_pending' } },
    { status: 400, body: { error: 'slow_down' } },
    { status: 200, body: { access_token: 'ms-access-1', refresh_token: 'ms-refresh-1' } },
  ];
  const waits = [];
  const tokens = await auth.waitForDeviceCode(started, { endpoints: E, sleep: (ms) => { waits.push(ms); return Promise.resolve(); } });
  check(tokens.accessToken === 'ms-access-1' && tokens.refreshToken === 'ms-refresh-1', 'devuelve la sesion de Microsoft');
  check(JSON.stringify(waits) === '[1000,1000,6000]', 'respeta el intervalo y lo alarga cuando Microsoft lo pide: ' + JSON.stringify(waits));
  const poll = new URLSearchParams(find('/token')[0].raw);
  check(poll.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code' && poll.get('device_code') === 'dev-code-1', 'consulta con el codigo recibido');

  console.log('A4 finales sin sesion');
  for (const [error, wanted] of [['authorization_declined', 'declined'], ['access_denied', 'declined'], ['expired_token', 'expired'], ['invalid_client', 'unexpected']]) {
    resetWorld();
    world.tokenReplies = [{ status: 400, body: { error } }];
    check(await reasonOf(auth.waitForDeviceCode(started, { endpoints: E, sleep: noSleep })) === wanted, error + ' -> ' + wanted);
  }
  resetWorld();
  let asked = 0;
  check(await reasonOf(auth.waitForDeviceCode(started, { endpoints: E, sleep: noSleep, shouldCancel: () => ++asked >= 2 })) === 'cancelled' && find('/token').length === 1,
    'cancelar detiene la espera sin mas consultas');
  resetWorld();
  check(await reasonOf(auth.waitForDeviceCode(Object.assign({}, started, { expiresInSeconds: 0 }), { endpoints: E, sleep: noSleep })) === 'expired', 'codigo caducado -> expired');

  console.log('A5 de Microsoft a Minecraft');
  resetWorld();
  const session = await auth.minecraftSession('ms-access-1', E);
  check(session.name === 'Guishe_7' && session.uuid === 'abcdef0123456789abcdef0123456789' && session.accessToken === 'mc-access-token', 'devuelve nombre, uuid y sesion de Minecraft');
  check(session.expiresAt > Date.now() + 23 * 3600 * 1000, 'anota cuando caduca la sesion');
  const xbox = JSON.parse(find('/xbox')[0].raw);
  check(xbox.Properties.RpsTicket === 'd=ms-access-1' && xbox.RelyingParty === 'http://auth.xboxlive.com', 'Xbox Live recibe la sesion de Microsoft');
  const xsts = JSON.parse(find('/xsts')[0].raw);
  check(xsts.Properties.UserTokens[0] === 'xbl-token' && xsts.RelyingParty === 'rp://api.minecraftservices.com/' && xsts.Properties.SandboxId === 'RETAIL', 'XSTS pide acceso a Minecraft Services');
  check(JSON.parse(find('/login')[0].raw).identityToken === 'XBL3.0 x=user-hash;xsts-token', 'Minecraft recibe la identidad de Xbox');
  check(find('/profile')[0].headers.authorization === 'Bearer mc-access-token' && find('/entitlements')[0].headers.authorization === 'Bearer mc-access-token', 'perfil y propiedad se consultan con la sesion');

  console.log('A6 cuentas que no pueden jugar');
  for (const [xerr, wanted] of [[2148916233, 'no-xbox-account'], [2148916235, 'xbox-region'], [2148916236, 'xbox-adult-check'], [2148916237, 'xbox-adult-check'], [2148916238, 'xbox-child'], [1, 'unexpected']]) {
    resetWorld();
    world.xsts = { status: 401, body: { XErr: xerr } };
    check(await reasonOf(auth.minecraftSession('t', E)) === wanted && find('/login').length === 0, 'Xbox ' + xerr + ' -> ' + wanted);
  }
  resetWorld();
  world.login = { status: 403, body: { error: 'FORBIDDEN' } };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'app-not-approved' && find('/profile').length === 0, 'Mojang aun no aprueba la aplicacion (403) -> app-not-approved');
  resetWorld();
  world.login = { status: 500, body: {} };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'unexpected', 'otro fallo de Minecraft -> unexpected');
  resetWorld();
  world.profile = { status: 404, body: { error: 'NOT_FOUND' } };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'not-owned', 'cuenta sin perfil de Java Edition -> not-owned');
  resetWorld();
  world.entitlements = { status: 200, body: { items: [{ name: 'product_dungeons' }] } };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'not-owned', 'cuenta con otros juegos pero sin Minecraft -> not-owned');
  resetWorld();
  world.entitlements = { status: 200, body: { items: [] } };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'not-owned' && find('/profile').length === 1, 'perfil pero sin compra ni licencia vigente -> not-owned');
  resetWorld();
  world.entitlements = { status: 200, body: { items: [] } };
  world.license = { status: 200, body: { items: [{ name: 'product_minecraft', source: 'GAMEPASS' }, { name: 'game_minecraft', source: 'GAMEPASS' }] } };
  check((await auth.minecraftSession('t', E)).name === 'Guishe_7' && world.requests.some((r) => /^\/license\?requestId=[0-9a-f-]{36}$/.test(r.path)), 'sin compra pero con licencia vigente (Game Pass) -> se acepta');
  resetWorld();
  world.entitlements = { status: 503, body: {} };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'unexpected', 'si no se puede comprobar la propiedad del juego, no se da por buena');
  resetWorld();
  world.entitlements = { status: 200, body: { items: [] } };
  world.license = { status: 500, body: {} };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'unexpected', 'sin compra y sin poder leer la licencia -> no se abre el juego (ni se borra la sesion)');
  resetWorld();
  world.profile = { status: 200, body: { id: 'abcdef0123456789abcdef0123456789', name: 'bad name; --demo' } };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'unexpected', 'nombre de jugador con formato raro -> se rechaza');
  resetWorld();
  world.profile = { status: 200, body: { id: '../../etc', name: 'Guishe' } };
  check(await reasonOf(auth.minecraftSession('t', E)) === 'unexpected', 'uuid con formato raro -> se rechaza');

  console.log('A7 renovar la sesion guardada');
  resetWorld();
  const renewed = await auth.refreshMicrosoft('ms-refresh-1', E);
  const refreshForm = new URLSearchParams(find('/token')[0].raw);
  check(renewed.accessToken === 'ms-access-2' && renewed.refreshToken === 'ms-refresh-2', 'renueva y guarda el nuevo token');
  check(refreshForm.get('grant_type') === 'refresh_token' && refreshForm.get('refresh_token') === 'ms-refresh-1' && refreshForm.get('client_id') === auth.CLIENT_ID, 'envia el token guardado');
  resetWorld();
  world.refreshReply = { status: 200, body: { access_token: 'ms-access-3' } };
  check((await auth.refreshMicrosoft('ms-refresh-1', E)).refreshToken === 'ms-refresh-1', 'si Microsoft no da token nuevo conserva el anterior');
  resetWorld();
  world.refreshReply = { status: 400, body: { error: 'invalid_grant' } };
  check(await reasonOf(auth.refreshMicrosoft('old', E)) === 'session-expired', 'token caducado -> session-expired');

  resetWorld();
  world.refreshReply = { status: 503, body: {} };
  check(await reasonOf(auth.refreshMicrosoft('old', E)) === 'unexpected', 'fallo del servidor de Microsoft -> no se da la sesion por caducada');
  resetWorld();
  world.refreshReply = { status: 429, body: { error: 'too_many_requests' } };
  check(await reasonOf(auth.refreshMicrosoft('old', E)) === 'unexpected', 'demasiadas peticiones -> tampoco se da por caducada');

  console.log('A7b skin del jugador');
  const hash = '31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb';
  resetWorld();
  world.profile.body.skins = [{ state: 'INACTIVE', url: 'http://textures.minecraft.net/texture/' + 'a'.repeat(40) }, { state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/' + hash }];
  check((await auth.minecraftSession('t', E)).skinHash === hash, 'se toma la skin activa del perfil');
  check(auth.skinHashOf({ skins: [{ state: 'ACTIVE', url: 'https://evil.example/texture/' + hash }] }) === '' && auth.skinHashOf({ skins: [{ state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/../x' }] }) === '' && auth.skinHashOf({}) === '', 'una skin que no viene del servidor de texturas de Minecraft se ignora');
  check(auth.TEXTURES === 'https://textures.minecraft.net/texture/', 'la skin se descarga por https del servidor de texturas de Minecraft');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  world.textures = { [hash]: png, ['b'.repeat(40)]: Buffer.from('<html>not a png</html> padding padding'), ['c'.repeat(40)]: Buffer.concat([png, Buffer.alloc(600 * 1024)]) };
  const T = Object.assign({}, E, { textures: base + '/texture/' });
  check((await auth.downloadSkin(hash, T)).equals(png), 'descarga la imagen de la skin');
  check(await reasonOf(auth.downloadSkin('b'.repeat(40), T)) === 'unexpected' && await reasonOf(auth.downloadSkin('c'.repeat(40), T)) === 'unexpected' && await reasonOf(auth.downloadSkin('d'.repeat(40), T)) === 'unexpected', 'rechaza lo que no es PNG, lo demasiado grande y lo que no existe');
  check(await reasonOf(auth.downloadSkin('../../etc', T)) === 'unexpected' && !world.requests.some((r) => r.path.includes('etc')), 'un identificador raro no llega a pedirse');

  console.log('A7c nombre escrito a mano (solo para mostrar)');
  const uuid = 'abcdef0123456789abcdef0123456789';
  const texturesValue = (url) => Buffer.from(JSON.stringify({ textures: { SKIN: { url } } })).toString('base64');
  resetWorld();
  world.lookup = { Guishe_7: { status: 200, body: { id: uuid, name: 'Guishe_7' } } };
  world.session = { [uuid]: { status: 200, body: { id: uuid, name: 'Guishe_7', properties: [{ name: 'textures', value: texturesValue('http://textures.minecraft.net/texture/' + hash) }] } } };
  const L = Object.assign({}, E, { nameLookup: base + '/lookup/', nameLookupAlt: base + '/lookup2/', sessionProfile: base + '/session/' });
  const player = await auth.lookupPlayer(' guishe_7 ', L);
  check(player.name === 'Guishe_7' && player.uuid === uuid && player.skinHash === hash, 'de un nombre se obtiene el jugador y su skin (con las mayusculas reales del nombre)');
  check(!world.requests.some((r) => r.headers.authorization), 'son consultas publicas: no se envia ninguna sesion');
  world.lookup = {};
  world.lookup2 = { Guishe_7: { status: 200, body: { id: 'abcdef01-2345-6789-abcd-ef0123456789', name: 'Guishe_7' } } };
  check((await auth.lookupPlayer('Guishe_7', L)).uuid === uuid, 'si la primera consulta no lo encuentra se prueba la segunda (acepta el uuid con guiones)');
  world.lookup2 = {};
  check(await reasonOf(auth.lookupPlayer('NoExiste', L)) === 'name-not-found', 'nombre que no existe -> name-not-found');
  check(await reasonOf(auth.lookupPlayer('nombre con espacios', L)) === 'name-invalid' && await reasonOf(auth.lookupPlayer('../x', L)) === 'name-invalid' && await reasonOf(auth.lookupPlayer('', L)) === 'name-invalid' && await reasonOf(auth.lookupPlayer('a'.repeat(17), L)) === 'name-invalid', 'nombres con formato raro no llegan a consultarse');
  world.lookup = { Guishe_7: { status: 200, body: { id: uuid, name: 'Guishe_7' } } };
  world.session = { [uuid]: { status: 200, body: { properties: [{ name: 'textures', value: texturesValue('http://evil.example/texture/' + hash) }] } } };
  check((await auth.lookupPlayer('Guishe_7', L)).skinHash === '', 'una skin que no viene del servidor de Minecraft se ignora (queda el nombre)');
  world.session = {};
  check((await auth.lookupPlayer('Guishe_7', L)).skinHash === '', 'si no se puede leer la skin, queda el nombre');
  world.lookup = { Guishe_7: { status: 429, body: {} } };
  world.lookup2 = { Guishe_7: { status: 503, body: {} } };
  check(await reasonOf(auth.lookupPlayer('Guishe_7', L)) === 'unexpected', 'si Mojang no responde bien se dice, sin inventar nada');
  check(Object.values(auth.PUBLIC_LOOKUP).every((u) => /^https:\/\/(api\.mojang\.com|api\.minecraftservices\.com|sessionserver\.mojang\.com)\//.test(u)), 'las consultas reales van solo a Mojang, por https');

  console.log('A8 sin conexion');
  await new Promise((resolve) => server.close(resolve));
  check(await reasonOf(auth.startDeviceCode(E)) === 'network', 'sin servidor -> network');
  check(await reasonOf(auth.refreshMicrosoft('x', E)) === 'network', 'renovar sin servidor -> network (no borra la sesion)');

  console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
  process.exit(failures ? 1 : 0);
})();
