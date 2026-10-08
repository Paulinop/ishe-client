'use strict';
// Pruebas de "el servidor esta abierto?" (JUGAR en gris si no) y del cambio de skin. uso: node tools/test_estado_y_skin.js app
const http = require('http');
const net = require('net');
const path = require('path');
const APP = path.resolve(process.argv[2] || 'app');
const estado = require(path.join(APP, 'core', 'estado-servidor.js'));
const skin = require(path.join(APP, 'core', 'skin.js'));

let checks = 0;
let failures = 0;
function check(cond, what) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
}

// Servidor de Minecraft falso: contesta al "ping" de estado
function minecraftFalso(json, opciones) {
  const visto = { handshake: null };
  const servidor = net.createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const l1 = estado.readVarint(buf, 0);
      if (!l1 || buf.length < l1.size + l1.value) return;
      visto.handshake = buf.subarray(l1.size, l1.size + l1.value);
      if (opciones && opciones.cerrarEnSeco) return s.destroy();
      if (opciones && opciones.basura) return s.write(Buffer.from('HTTP/1.1 400 Bad Request\r\n\r\n'));
      if (opciones && opciones.mudo) return;
      const texto = Buffer.from(JSON.stringify(json), 'utf8');
      s.write(estado.packet(0x00, Buffer.concat([estado.varint(texto.length), texto])));
    });
  });
  return new Promise((r) => servidor.listen(0, '127.0.0.1', () => r({ servidor, puerto: servidor.address().port, visto })));
}

(async () => {
  console.log('E1 el servidor esta abierto?');
  const abierto = await minecraftFalso({ version: { name: '26.2' }, players: { online: 3, max: 6 }, description: 'Ishe server' });
  let r = await estado.query('127.0.0.1:' + abierto.puerto);
  check(r.online === true && r.players === 3 && r.max === 6, 'un servidor que contesta sale ABIERTO con sus jugadores (3 de 6)');
  check(abierto.visto.handshake && abierto.visto.handshake[0] === 0x00, 'se hace el saludo de estado de Minecraft');
  abierto.servidor.close();
  r = await estado.query('127.0.0.1:' + abierto.puerto, { timeoutMs: 1500 });
  check(r.online === false, 'si no hay nadie escuchando, sale CERRADO');
  const basura = await minecraftFalso({}, { basura: true });
  r = await estado.query('127.0.0.1:' + basura.puerto, { timeoutMs: 1500 });
  check(r.online === false, 'algo que contesta otra cosa (no es Minecraft) cuenta como cerrado');
  basura.servidor.close();
  const mudo = await minecraftFalso({}, { mudo: true });
  const t0 = Date.now();
  r = await estado.query('127.0.0.1:' + mudo.puerto, { timeoutMs: 800 });
  check(r.online === false && Date.now() - t0 < 3000, 'si conecta pero no contesta (el tunel abierto con el servidor apagado), se rinde pronto: cerrado');
  mudo.servidor.close();
  const seco = await minecraftFalso({}, { cerrarEnSeco: true });
  r = await estado.query('127.0.0.1:' + seco.puerto, { timeoutMs: 1500 });
  check(r.online === false, 'si cuelga la conexion enseguida, cerrado');
  seco.servidor.close();
  check((await estado.query('mal servidor!', { timeoutMs: 500 })).online === false && (await estado.query('', { timeoutMs: 500 })).online === false, 'una direccion rara no revienta: cerrado');
  const otro = await minecraftFalso({ players: { online: 0, max: 6 } });
  r = await estado.query('midominio.ejemplo', { timeoutMs: 1500, resolver: async () => ({ host: '127.0.0.1', port: otro.puerto }) });
  check(r.online === true && r.players === 0, 'con la direccion resuelta (SRV) tambien funciona');
  otro.servidor.close();

  console.log('K1 la skin');
  const png = (w, h) => {
    const b = Buffer.alloc(33 + 20);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return b;
  };
  check(skin.checkPng(png(64, 64)).ok && skin.checkPng(png(64, 32)).ok, 'una skin de 64x64 o 64x32 vale');
  check(skin.checkPng(png(128, 128)).reason === 'dimensions' && skin.checkPng(png(64, 48)).reason === 'dimensions', 'otros tamanos no valen');
  check(skin.checkPng(Buffer.from('no soy un png, para nada, de ninguna manera, jamas')).reason === 'not-png', 'algo que no es PNG no vale');
  check(skin.checkPng(Buffer.alloc(200 * 1024)).reason === 'size', 'un archivo enorme no vale');
  check(skin.variantOf('slim') === 'slim' && skin.variantOf('x') === 'classic' && skin.variantOf(undefined) === 'classic', 'el modelo es "classic" salvo que se pida "slim"');

  const peticiones = [];
  let respuesta = 200;
  const api = http.createServer((req, res) => {
    const trozos = [];
    req.on('data', (c) => trozos.push(c));
    req.on('end', () => { peticiones.push({ method: req.method, auth: req.headers.authorization, tipo: req.headers['content-type'], cuerpo: Buffer.concat(trozos) }); res.writeHead(respuesta); res.end('{}'); });
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const ep = { skins: 'http://127.0.0.1:' + api.address().port + '/skins' };
  let o = await skin.uploadFile('TOKEN', png(64, 64), 'slim', ep);
  const p = peticiones[0];
  check(o.ok && p.method === 'POST' && p.auth === 'Bearer TOKEN' && /^multipart\/form-data; boundary=/.test(p.tipo), 'subir un PNG manda un formulario con la sesion');
  check(p.cuerpo.includes('name="variant"') && p.cuerpo.includes('slim') && p.cuerpo.includes('name="file"; filename="skin.png"') && p.cuerpo.includes(png(64, 64)), 'el formulario lleva el modelo y la imagen');
  o = await skin.uploadFile('TOKEN', Buffer.from('basura'), 'classic', ep);
  check(!o.ok && o.reason === 'invalid' && peticiones.length === 1, 'un archivo invalido ni siquiera se manda');
  o = await skin.uploadUrl('TOKEN', 'https://textures.minecraft.net/texture/' + 'a1'.repeat(32), 'classic', ep);
  check(o.ok && peticiones[1].tipo === 'application/json' && JSON.parse(peticiones[1].cuerpo.toString()).url.endsWith('a1'.repeat(32)), 'copiar la skin de otro jugador manda su direccion de textura');
  o = await skin.uploadUrl('TOKEN', 'https://evil.example/skin.png', 'classic', ep);
  check(!o.ok && o.reason === 'invalid' && peticiones.length === 2, 'solo se acepta una textura del servidor oficial de Minecraft');
  respuesta = 401;
  o = await skin.uploadFile('TOKEN', png(64, 64), 'classic', ep);
  check(!o.ok && o.reason === 'session', 'si la sesion caduco se dice');
  respuesta = 400;
  o = await skin.uploadFile('TOKEN', png(64, 64), 'classic', ep);
  check(!o.ok && o.reason === 'invalid', 'si Mojang rechaza la imagen se dice');
  api.close();
  o = await skin.uploadFile('TOKEN', png(64, 64), 'classic', ep);
  check(!o.ok && o.reason === 'network', 'sin conexion se dice');

  console.log((checks - failures) + ' de ' + checks + ' comprobaciones bien');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
