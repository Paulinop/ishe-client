'use strict';
// Guarda la sesion de Microsoft entre un uso y otro, siempre cifrada por el
// sistema (DPAPI en Windows, Llavero en Mac). Si el sistema no puede cifrar,
// no se escribe nada y la sesion dura solo hasta cerrar Ishe Client.
//
// Lo unico que se guarda es el "refresh token" de Microsoft y el nombre del
// jugador. La sesion de Minecraft nunca se escribe en disco.

const fs = require('fs');
const path = require('path');

const NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;
const UUID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * protector: { available(): boolean, encrypt(text): Buffer, decrypt(Buffer): string }
 */
function create(file, protector) {
  const canPersist = () => {
    try { return Boolean(protector.available()); } catch (_) { return false; }
  };

  function clear() {
    try { fs.rmSync(file, { force: true }); } catch (_) { /* no existia */ }
  }

  /** Devuelve { refreshToken, account: {name, uuid} | null, pending } o null. */
  function load() {
    if (!canPersist()) return null;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || data.v !== 1 || typeof data.token !== 'string') return null;
      const refreshToken = protector.decrypt(Buffer.from(data.token, 'base64'));
      if (typeof refreshToken !== 'string' || refreshToken.length < 8) return null;
      const account = data.account && NAME_PATTERN.test(String(data.account.name)) && UUID_PATTERN.test(String(data.account.uuid))
        ? { name: data.account.name, uuid: data.account.uuid } : null;
      return { refreshToken, account, pending: Boolean(data.pending) || !account };
    } catch (_) {
      return null; // archivo ausente, danado o de otro usuario: se empieza sin sesion
    }
  }

  /** Devuelve true si quedo guardada. */
  function save(session) {
    if (!canPersist() || !session || !session.refreshToken) { clear(); return false; }
    try {
      const body = JSON.stringify({
        v: 1,
        account: session.account ? { name: session.account.name, uuid: session.account.uuid } : null,
        pending: Boolean(session.pending),
        token: protector.encrypt(session.refreshToken).toString('base64'),
      });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = file + '.nuevo';
      fs.writeFileSync(temp, body, { mode: 0o600 });
      fs.renameSync(temp, file);
      return true;
    } catch (_) {
      clear();
      return false;
    }
  }

  return { canPersist, load, save, clear };
}

module.exports = { create };
