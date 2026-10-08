'use strict';
// Mira si el servidor de Minecraft esta abierto (el mismo "ping" que usa la lista de servidores del juego):
// conecta, pregunta su estado y lee cuantos jugadores hay. Si no contesta un estado valido, se considera cerrado.
// Solo usa modulos incluidos en Node.

const dns = require('dns').promises;
const net = require('net');

function varint(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

/** Lee un VarInt de buffer desde offset. Devuelve { value, size } o null si faltan bytes. */
function readVarint(buffer, offset) {
  let value = 0;
  let size = 0;
  for (;;) {
    if (offset + size >= buffer.length || size > 4) return size > 4 ? { value: -1, size: 5 } : null;
    const b = buffer[offset + size];
    value |= (b & 0x7f) << (7 * size);
    size++;
    if ((b & 0x80) === 0) return { value, size };
  }
}

function packet(id, payload) {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
}

/** "host" o "host:puerto" -> { host, port }. Sin puerto se busca el registro SRV (asi lo hace el juego) y si no, 25565. */
async function resolve(address) {
  const text = String(address || '').trim();
  const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(text);
  if (!match) return null;
  const host = match[1];
  if (match[2]) return { host, port: Number(match[2]) };
  try {
    const records = await dns.resolveSrv('_minecraft._tcp.' + host);
    if (records && records.length > 0 && records[0].port) return { host: records[0].name || host, port: records[0].port };
  } catch (_) { /* sin SRV: puerto normal */ }
  return { host, port: 25565 };
}

/**
 * Consulta el servidor. Devuelve { online: true, players, max, ms } o { online: false }.
 * options: { timeoutMs?, resolver? (para pruebas) }
 */
async function query(address, options) {
  const timeoutMs = (options && options.timeoutMs) || 4000;
  const target = await ((options && options.resolver) || resolve)(address);
  if (!target) return { online: false };
  return new Promise((done) => {
    const started = Date.now();
    const socket = net.connect({ host: target.host, port: target.port });
    let pending = Buffer.alloc(0);
    const finish = (result) => { clearTimeout(timer); socket.destroy(); done(result); };
    const timer = setTimeout(() => finish({ online: false }), timeoutMs);
    socket.on('error', () => finish({ online: false }));
    socket.on('close', () => finish({ online: false }));
    socket.on('connect', () => {
      const host = Buffer.from(target.host, 'utf8');
      const port = Buffer.alloc(2);
      port.writeUInt16BE(target.port, 0);
      socket.write(Buffer.concat([
        packet(0x00, Buffer.concat([varint(767), varint(host.length), host, port, varint(1)])),
        packet(0x00, Buffer.alloc(0)),
      ]));
    });
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > 262144) return finish({ online: false });
      const length = readVarint(pending, 0);
      if (!length) return;
      if (length.value <= 0 || length.value > 262144) return finish({ online: false });
      if (pending.length < length.size + length.value) return;
      const id = readVarint(pending, length.size);
      if (!id || id.value !== 0) return finish({ online: false });
      const jsonLength = readVarint(pending, length.size + id.size);
      if (!jsonLength) return finish({ online: false });
      const start = length.size + id.size + jsonLength.size;
      try {
        const status = JSON.parse(pending.toString('utf8', start, start + jsonLength.value));
        const players = status && status.players ? status.players : {};
        return finish({ online: true, players: Number(players.online) || 0, max: Number(players.max) || 0, ms: Date.now() - started });
      } catch (_) {
        return finish({ online: false });
      }
    });
  });
}

module.exports = { query, resolve, varint, readVarint, packet };
