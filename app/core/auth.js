'use strict';
// Inicio de sesion con Microsoft para Minecraft: Java Edition.
//
// Cadena oficial:  Microsoft (codigo de dispositivo)  ->  Xbox Live  ->  XSTS
//                  ->  Minecraft Services  ->  perfil del jugador
//
// Solo usa modulos incluidos en Node. No guarda nada en disco: quien llama
// decide donde conservar el "refresh token" (main.js lo cifra con el sistema).

const crypto = require('crypto');

const CLIENT_ID = '777b4ef5-0f7c-47c7-b03a-a9fefbfa49c2'; // registro "Ishe Client" en Azure
const SCOPE = 'XboxLive.signin offline_access';
const USER_AGENT = 'IsheClient-Launcher/1.1';

const TEXTURES = 'https://textures.minecraft.net/texture/';
// Consultas publicas de Mojang (no necesitan sesion): de un nombre de jugador a su skin.
const PUBLIC_LOOKUP = {
  nameLookup: 'https://api.mojang.com/users/profiles/minecraft/',
  nameLookupAlt: 'https://api.minecraftservices.com/minecraft/profile/lookup/name/',
  sessionProfile: 'https://sessionserver.mojang.com/session/minecraft/profile/',
};

const ENDPOINTS = {
  deviceCode: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',
  token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  xboxUser: 'https://user.auth.xboxlive.com/user/authenticate',
  xsts: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  minecraftLogin: 'https://api.minecraftservices.com/authentication/login_with_xbox',
  minecraftProfile: 'https://api.minecraftservices.com/minecraft/profile',
  minecraftEntitlements: 'https://api.minecraftservices.com/entitlements/mcstore',
  minecraftLicense: 'https://api.minecraftservices.com/entitlements/license',
};

// Motivos de fallo que la interfaz sabe explicar.
const REASONS = {
  NETWORK: 'network',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  NO_XBOX_ACCOUNT: 'no-xbox-account',
  XBOX_REGION: 'xbox-region',
  XBOX_ADULT_CHECK: 'xbox-adult-check',
  XBOX_CHILD: 'xbox-child',
  APP_NOT_APPROVED: 'app-not-approved',
  NOT_OWNED: 'not-owned',
  SESSION_EXPIRED: 'session-expired',
  NAME_INVALID: 'name-invalid',
  NAME_NOT_FOUND: 'name-not-found',
  UNEXPECTED: 'unexpected',
};

class AuthError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.reason = reason;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: Object.assign({ 'User-Agent': USER_AGENT, Accept: 'application/json' }, options.headers || {}),
      body: options.body,
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs || 30000),
    });
  } catch (_) {
    throw new AuthError(REASONS.NETWORK, 'no hubo respuesta del servidor');
  }
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  return { status: response.status, ok: response.ok, data };
}

function form(fields) {
  return new URLSearchParams(fields).toString();
}

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Paso 1: pide a Microsoft un codigo para que el usuario lo escriba en su navegador. */
async function startDeviceCode(endpoints) {
  const e = endpoints || ENDPOINTS;
  const { ok, data } = await request(e.deviceCode, {
    method: 'POST', headers: FORM_HEADERS, body: form({ client_id: CLIENT_ID, scope: SCOPE }),
  });
  if (!ok || !data || typeof data.device_code !== 'string' || typeof data.user_code !== 'string') {
    throw new AuthError(REASONS.UNEXPECTED, 'Microsoft no devolvio un codigo de inicio de sesion');
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: typeof data.verification_uri === 'string' ? data.verification_uri : 'https://www.microsoft.com/link',
    intervalSeconds: Math.max(1, Number(data.interval) || 5),
    expiresInSeconds: Math.max(30, Number(data.expires_in) || 900),
  };
}

/**
 * Paso 2: espera a que el usuario apruebe en el navegador.
 * shouldCancel() se consulta en cada vuelta. Devuelve { accessToken, refreshToken }.
 */
async function waitForDeviceCode(started, options) {
  const e = (options && options.endpoints) || ENDPOINTS;
  const shouldCancel = (options && options.shouldCancel) || (() => false);
  const tick = (options && options.sleep) || sleep;
  let interval = started.intervalSeconds;
  const deadline = Date.now() + started.expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await tick(interval * 1000);
    if (shouldCancel()) throw new AuthError(REASONS.CANCELLED);
    const { ok, data } = await request(e.token, {
      method: 'POST', headers: FORM_HEADERS,
      body: form({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENT_ID,
        device_code: started.deviceCode,
      }),
    });
    if (ok && data && typeof data.access_token === 'string') {
      return { accessToken: data.access_token, refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : '' };
    }
    const error = data && data.error;
    if (error === 'authorization_pending') continue;
    if (error === 'slow_down') { interval += 5; continue; }
    if (error === 'authorization_declined' || error === 'access_denied') throw new AuthError(REASONS.DECLINED);
    if (error === 'expired_token' || error === 'bad_verification_code') throw new AuthError(REASONS.EXPIRED);
    throw new AuthError(REASONS.UNEXPECTED, 'Microsoft rechazo el inicio de sesion' + (error ? ' (' + error + ')' : ''));
  }
  throw new AuthError(REASONS.EXPIRED);
}

/** Renueva la sesion de Microsoft guardada, sin que el usuario haga nada. */
async function refreshMicrosoft(refreshToken, endpoints) {
  const e = endpoints || ENDPOINTS;
  const { ok, status, data } = await request(e.token, {
    method: 'POST', headers: FORM_HEADERS,
    body: form({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: refreshToken, scope: SCOPE }),
  });
  if (ok && data && typeof data.access_token === 'string') {
    return {
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : refreshToken,
    };
  }
  // Solo se da la sesion por caducada cuando Microsoft dice que hay que volver a entrar;
  // un fallo del servidor o un "demasiadas peticiones" no borra la sesion guardada.
  const error = data && data.error;
  if (status === 400 && ['invalid_grant', 'interaction_required', 'consent_required', 'login_required'].includes(error)) {
    throw new AuthError(REASONS.SESSION_EXPIRED);
  }
  throw new AuthError(REASONS.UNEXPECTED, 'Microsoft no pudo renovar la sesion (' + status + ')');
}

function xboxReason(xerr) {
  switch (Number(xerr)) {
    case 2148916233: return REASONS.NO_XBOX_ACCOUNT;
    case 2148916235: return REASONS.XBOX_REGION;
    case 2148916236:
    case 2148916237: return REASONS.XBOX_ADULT_CHECK;
    case 2148916238: return REASONS.XBOX_CHILD;
    default: return REASONS.UNEXPECTED;
  }
}

/** Pasos 3 a 6: de la sesion de Microsoft a una sesion de Minecraft con perfil. */
async function minecraftSession(microsoftAccessToken, endpoints) {
  const e = endpoints || ENDPOINTS;

  const xbox = await request(e.xboxUser, {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + microsoftAccessToken },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }),
  });
  const userHash = xbox.data && xbox.data.DisplayClaims && Array.isArray(xbox.data.DisplayClaims.xui)
    && xbox.data.DisplayClaims.xui[0] && xbox.data.DisplayClaims.xui[0].uhs;
  if (!xbox.ok || !xbox.data || typeof xbox.data.Token !== 'string' || typeof userHash !== 'string') {
    throw new AuthError(REASONS.UNEXPECTED, 'Xbox Live no acepto la sesion');
  }

  const xsts = await request(e.xsts, {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbox.data.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }),
  });
  if (!xsts.ok || !xsts.data || typeof xsts.data.Token !== 'string') {
    if (xsts.status === 401 && xsts.data && xsts.data.XErr !== undefined) {
      throw new AuthError(xboxReason(xsts.data.XErr));
    }
    throw new AuthError(REASONS.UNEXPECTED, 'Xbox Live no autorizo el acceso a Minecraft');
  }

  const login = await request(e.minecraftLogin, {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ identityToken: 'XBL3.0 x=' + userHash + ';' + xsts.data.Token }),
  });
  if (!login.ok || !login.data || typeof login.data.access_token !== 'string') {
    // Mojang responde 403 a las aplicaciones que aun no ha aprobado.
    if (login.status === 403) throw new AuthError(REASONS.APP_NOT_APPROVED);
    throw new AuthError(REASONS.UNEXPECTED, 'Minecraft no acepto la sesion (' + login.status + ')');
  }
  const accessToken = login.data.access_token;
  const expiresAt = Date.now() + Math.max(60, Number(login.data.expires_in) || 3600) * 1000;
  const bearer = { Authorization: 'Bearer ' + accessToken };

  // La cuenta tiene que ser duena del juego: sin perfil de Java Edition no se arranca.
  const profile = await request(e.minecraftProfile, { headers: bearer });
  if (profile.status === 404) throw new AuthError(REASONS.NOT_OWNED);
  if (!profile.ok || !profile.data || typeof profile.data.id !== 'string' || typeof profile.data.name !== 'string') {
    throw new AuthError(REASONS.UNEXPECTED, 'No se pudo leer el perfil de Minecraft (' + profile.status + ')');
  }
  if (!/^[0-9a-fA-F]{32}$/.test(profile.data.id) || !/^[A-Za-z0-9_]{1,16}$/.test(profile.data.name)) {
    throw new AuthError(REASONS.UNEXPECTED, 'El perfil de Minecraft tiene un formato inesperado');
  }
  // Ademas del perfil, la cuenta tiene que tener el juego. Si no se puede comprobar, no se sigue.
  const namesOf = (reply) => (reply.ok && reply.data && Array.isArray(reply.data.items)
    ? reply.data.items.map((item) => item && item.name) : null);
  const owns = (names) => Array.isArray(names) && (names.includes('game_minecraft') || names.includes('product_minecraft'));
  const bought = namesOf(await request(e.minecraftEntitlements, { headers: bearer }));
  if (!bought) throw new AuthError(REASONS.UNEXPECTED, 'No se pudo comprobar que la cuenta tiene Minecraft');
  if (!owns(bought)) {
    // Con Game Pass el juego no figura como compra: se mira la licencia vigente.
    const license = namesOf(await request(e.minecraftLicense + '?requestId=' + crypto.randomUUID(), { headers: bearer }));
    if (!license) throw new AuthError(REASONS.UNEXPECTED, 'No se pudo comprobar que la cuenta tiene Minecraft');
    if (!owns(license)) throw new AuthError(REASONS.NOT_OWNED);
  }

  return {
    accessToken,
    expiresAt,
    uuid: profile.data.id.toLowerCase(),
    name: profile.data.name,
    skinHash: skinHashOf(profile.data),
  };
}

/** Identificador de la skin activa del perfil ('' si no tiene o no se reconoce). */
function skinHashOf(profile) {
  const skins = profile && Array.isArray(profile.skins) ? profile.skins : [];
  const active = skins.find((skin) => skin && skin.state === 'ACTIVE') || skins[0];
  const match = active && typeof active.url === 'string'
    ? /^https?:\/\/textures\.minecraft\.net\/texture\/([0-9a-f]{20,80})$/.exec(active.url) : null;
  return match ? match[1] : '';
}

/**
 * Busca un jugador de Java Edition por su nombre, con las consultas publicas de Mojang.
 * Sirve solo para mostrar nombre y cara; no da ninguna sesion ni permite jugar.
 * Devuelve { name, uuid, skinHash }.
 */
async function lookupPlayer(name, endpoints) {
  const wanted = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(wanted)) throw new AuthError(REASONS.NAME_INVALID);
  const e = Object.assign({}, PUBLIC_LOOKUP, endpoints || {});
  let found = null;
  let notFound = false;
  let failure = null;
  for (const base of [e.nameLookup, e.nameLookupAlt]) {
    if (!base || found) continue;
    let reply;
    try {
      reply = await request(base + wanted, { timeoutMs: 15000 });
    } catch (error) {
      failure = error;
      continue;
    }
    const id = reply.data && typeof reply.data.id === 'string' ? reply.data.id.replace(/-/g, '').toLowerCase() : '';
    if (reply.ok && /^[0-9a-f]{32}$/.test(id) && typeof reply.data.name === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(reply.data.name)) {
      found = { name: reply.data.name, uuid: id };
    } else if (reply.status === 404 || reply.status === 204) {
      notFound = true;
    } else {
      failure = new AuthError(REASONS.UNEXPECTED, 'Mojang respondio ' + reply.status);
    }
  }
  if (!found) {
    if (notFound) throw new AuthError(REASONS.NAME_NOT_FOUND);
    throw failure || new AuthError(REASONS.UNEXPECTED);
  }
  let skinHash = '';
  try {
    const profile = await request(e.sessionProfile + found.uuid, { timeoutMs: 15000 });
    const property = profile.ok && profile.data && Array.isArray(profile.data.properties)
      ? profile.data.properties.find((item) => item && item.name === 'textures') : null;
    const textures = property && typeof property.value === 'string' && property.value.length < 8192
      ? JSON.parse(Buffer.from(property.value, 'base64').toString('utf8')) : null;
    const url = textures && textures.textures && textures.textures.SKIN && textures.textures.SKIN.url;
    skinHash = skinHashOf({ skins: [{ state: 'ACTIVE', url }] });
  } catch (_) {
    skinHash = ''; // sin skin se muestra la inicial del nombre
  }
  return { name: found.name, uuid: found.uuid, skinHash };
}

/**
 * Descarga la imagen de la skin (PNG) desde el servidor de texturas de Minecraft.
 * Solo se usa para dibujar la cara del jugador; no necesita sesion.
 */
async function downloadSkin(skinHash, endpoints) {
  if (!/^[0-9a-f]{20,80}$/.test(String(skinHash))) throw new AuthError(REASONS.UNEXPECTED, 'skin sin identificador');
  const base = (endpoints && endpoints.textures) || TEXTURES;
  let response;
  try {
    response = await fetch(base + skinHash, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  } catch (_) {
    throw new AuthError(REASONS.NETWORK, 'no hubo respuesta del servidor de skins');
  }
  if (!response.ok) throw new AuthError(REASONS.UNEXPECTED, 'el servidor de skins respondio ' + response.status);
  const body = Buffer.from(await response.arrayBuffer());
  const png = body.length >= 24 && body.length <= 512 * 1024 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!png) throw new AuthError(REASONS.UNEXPECTED, 'la skin no es una imagen PNG');
  return body;
}

module.exports = {
  CLIENT_ID, ENDPOINTS, REASONS, AuthError,
  startDeviceCode, waitForDeviceCode, refreshMicrosoft, minecraftSession, skinHashOf, downloadSkin, lookupPlayer, TEXTURES, PUBLIC_LOOKUP,
};
