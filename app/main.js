'use strict';
// Proceso principal de Reshem Client (launcher).
// Prepara Minecraft 26.2 + Fabric + mods. Con una cuenta de Microsoft que tiene
// Minecraft: Java Edition, descarga el juego de los servidores oficiales y lo
// abre directamente. Sin cuenta iniciada (o mientras Mojang no haya aprobado la
// aplicacion) deja el juego preparado y abre el launcher oficial.
// No existe ningun modo de juego sin cuenta.

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const installer = require('./core/installer');
const platformTools = require('./core/platform');
const auth = require('./core/auth');
const game = require('./core/game');
const sessionStore = require('./core/session');
const tema = require('./core/tema');
const paquete = require('./core/paquete');
const updater = require('./core/updater');
const amigos = require('./core/amigos');
const estadoServidor = require('./core/estado-servidor');
const skinCore = require('./core/skin');

// El servidor de Ishe (Reshem server): todos entran por aqui al pulsar Jugar. Es una direccion publica; la lista blanca la manda el dueño.
const DEFAULT_SERVER = 'fried-recently.tun.ply.gg';
const creator = require('./core/creator');

const APP_DIR = __dirname;
// Datos del arranque (inicio.js): que copia del client esta en uso y la clave
// publica con la que se comprueban las actualizaciones.
const ISHE = global.__ishe || {
  bundledDir: APP_DIR,
  activeDir: APP_DIR,
  version: app.getVersion(),
  updatesRoot: path.join(app.getPath('userData'), 'actualizaciones'),
  publicKey: require('./core/clave-publica'),
  testing: Boolean(process.env.ISHE_TEST_OUT) && fs.existsSync(path.join(APP_DIR, 'test-hooks.js')),
  fellBackFrom: '',
  restart() { app.relaunch(); app.exit(0); },
  confirm() {},
};
const RAM_CHOICES = [0, 2, 4, 6, 8]; // 0 = la que recomienda la version de Minecraft
const VERIFICATION_HOSTS = ['www.microsoft.com', 'microsoft.com', 'login.microsoftonline.com', 'login.live.com'];
const DEFAULT_VERIFICATION_URI = 'https://www.microsoft.com/link';

// ---- solo para pruebas automaticas -----------------------------------------
// Las direcciones de prueba se aceptan unicamente si apuntan a este mismo equipo.
function testUrl(name) {
  const value = process.env[name];
  return value && /^http:\/\/127\.0\.0\.1:\d+\//.test(value + '/') ? value : undefined;
}
const TEST = {
  modrinthApi: testUrl('ISHE_TEST_MODRINTH_API'),
  fabricMeta: testUrl('ISHE_TEST_FABRIC_META'),
  authBase: testUrl('ISHE_TEST_AUTH_BASE'),
  gameBase: testUrl('ISHE_TEST_GAME_BASE'),
  updateBase: testUrl('ISHE_TEST_UPDATE_BASE'),
  keyFile: process.env.ISHE_TEST_KEY_FILE,
  creatorOut: process.env.ISHE_TEST_CREATOR_OUT,
  logoFile: process.env.ISHE_TEST_LOGO_FILE,
  minecraftDir: process.env.ISHE_TEST_MINECRAFT_DIR,
  gameDir: process.env.ISHE_TEST_GAME_DIR,
  outDir: process.env.ISHE_TEST_OUT,
  scenario: process.env.ISHE_TEST_SCENARIO,
};
// El modo de pruebas solo existe si el archivo de pruebas esta en la copia instalada;
// la version que se reparte no lo incluye (lo decide inicio.js).
const TESTING = ISHE.testing;

const dirs = installer.defaultDirs(process.platform, process.env, os.homedir());
const minecraftDir = (TESTING && TEST.minecraftDir) || dirs.minecraftDir;
const gameDir = (TESTING && TEST.gameDir) || dirs.gameDir;

// Servicios de pruebas (solo en este mismo equipo y solo con el archivo de pruebas presente).
const AUTH_ENDPOINTS = TESTING && TEST.authBase ? {
  deviceCode: TEST.authBase + '/devicecode', token: TEST.authBase + '/token', xboxUser: TEST.authBase + '/xbox',
  xsts: TEST.authBase + '/xsts', minecraftLogin: TEST.authBase + '/login', minecraftProfile: TEST.authBase + '/profile',
  minecraftEntitlements: TEST.authBase + '/entitlements', minecraftLicense: TEST.authBase + '/license', textures: TEST.authBase + '/texture/',
  nameLookup: TEST.authBase + '/lookup/', nameLookupAlt: '', sessionProfile: TEST.authBase + '/session/',
} : undefined;
const GAME_SOURCES = TESTING && TEST.gameBase ? {
  versionManifest: TEST.gameBase + '/manifest.json', javaRuntimes: TEST.gameBase + '/java/all.json',
  assets: TEST.gameBase + '/assets', allowLoopback: true,
} : undefined;

let mainWindow = null;
let busy = false;
let gameRunning = false;
let launchCount = 0;
let loginAttempt = null; // { cancelled, uri, code }
let store = null;
// La sesion vive en este proceso; la ventana solo conoce el nombre del jugador.
let current = { refreshToken: '', account: null, pending: false, minecraft: null };
let skinDataUrl = '';   // imagen de la skin del jugador, para dibujar su cara
let update = { status: 'idle', version: '', notes: '', detail: '' };
let updateBusy = false;
let windowConfirmed = false;
let creatorKey = '';    // clave del creador, solo en memoria (y cifrada en disco si el sistema puede)
let creatorFolder = '';
let protector = null;

function signedIn() {
  return Boolean(current.refreshToken);
}

function persistSession() {
  if (store) store.save(current);
}

function clearSession() {
  current = { refreshToken: '', account: null, pending: false, minecraft: null };
  if (store) store.clear();
  skinDataUrl = '';
  try { if (readConfig().provisional) writeConfig({ provisional: null }); } catch (_) { /* nada que quitar */ }
  try {
    for (const name of fs.readdirSync(app.getPath('userData'))) {
      if (/^skin-[0-9a-f]{32}\.png$/.test(name)) fs.rmSync(path.join(app.getPath('userData'), name), { force: true });
    }
  } catch (_) { /* nada que borrar */ }
}

/**
 * Jugador que se muestra en la ventana: el de la cuenta (lo dice Mojang) o, mientras
 * Mojang no apruebe la aplicacion, el nombre que el usuario escribio a mano.
 * El nombre escrito a mano es solo para mostrar: nunca se usa para abrir el juego.
 */
function shownPlayer() {
  if (!signedIn()) return null;
  if (current.account) return { name: current.account.name, uuid: current.account.uuid, provisional: false };
  const typed = current.pending ? readConfig().provisional : null;
  return typed ? { name: typed.name, uuid: typed.uuid, provisional: true } : null;
}

function skinFile(uuid) {
  return path.join(app.getPath('userData'), 'skin-' + uuid + '.png');
}

function loadSavedSkin() {
  skinDataUrl = '';
  const player = shownPlayer();
  if (!player) return;
  try {
    const body = fs.readFileSync(skinFile(player.uuid));
    if (body.length <= 512 * 1024) skinDataUrl = 'data:image/png;base64,' + body.toString('base64');
  } catch (_) { /* aun no se descargo */ }
}

/** Descarga la skin del jugador para dibujar su cara. Si falla, se queda la inicial. */
async function refreshSkin(minecraft) {
  if (!minecraft || !minecraft.skinHash) return;
  try {
    const body = await auth.downloadSkin(minecraft.skinHash, AUTH_ENDPOINTS);
    const player = shownPlayer();
    if (!player || player.uuid !== minecraft.uuid) return; // cambio de cuenta mientras tanto
    fs.writeFileSync(skinFile(minecraft.uuid), body);
    skinDataUrl = 'data:image/png;base64,' + body.toString('base64');
    send({ type: 'account', state: getState() });
  } catch (_) { /* sin skin: se muestra la inicial del nombre */ }
}

function reasonOf(error) {
  return error instanceof auth.AuthError ? error.reason : auth.REASONS.UNEXPECTED;
}

function detailOf(error) {
  return error instanceof auth.AuthError && error.message !== error.reason ? error.message : '';
}

function safeVerificationUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:' && VERIFICATION_HOSTS.includes(parsed.hostname)) return parsed.toString();
  } catch (_) { /* se usa la pagina por defecto */ }
  return DEFAULT_VERIFICATION_URI;
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    const typed = data.provisional;
    const provisional = typed && /^[A-Za-z0-9_]{1,16}$/.test(String(typed.name)) && /^[0-9a-f]{32}$/.test(String(typed.uuid))
      ? { name: typed.name, uuid: typed.uuid } : null;
    return { ramGb: RAM_CHOICES.includes(data.ramGb) ? data.ramGb : 0, tema: tema.pick(data.tema), provisional, servidor: game.serverAddress(data.servidor) || DEFAULT_SERVER, entrar: data.entrar !== false };
  } catch (_) {
    return { ramGb: 0, tema: {}, provisional: null, servidor: DEFAULT_SERVER, entrar: true };
  }
}

/** Guarda solo lo que cambia; el resto de ajustes se conserva. */
function writeConfig(changes) {
  const config = Object.assign(readConfig(), changes);
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  const temp = configPath() + '.nuevo';
  fs.writeFileSync(temp, JSON.stringify(config, null, 2));
  fs.renameSync(temp, configPath());
}

function extrasDir() {
  // e4steam viene con el instalador; una actualizacion solo trae el suyo si cambio.
  const own = path.join(APP_DIR, 'extras');
  return fs.existsSync(path.join(own, installer.E4STEAM_FILE)) ? own : path.join(ISHE.bundledDir, 'extras');
}

function readNews() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'noticias.json'), 'utf8'));
    return (Array.isArray(data) ? data : []).slice(0, 6).map((item) => ({
      titulo: String(item.titulo || '').slice(0, 80),
      fecha: String(item.fecha || '').slice(0, 20),
      texto: String(item.texto || '').slice(0, 400),
    }));
  } catch (_) {
    return [];
  }
}

function readInstalled() {
  const manifestPath = path.join(gameDir, 'ishe-client-instalado.json');
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const mods = Array.from(installer.readManifest(manifestPath).values()).sort((a, b) => a.localeCompare(b));
    return { fabric: String(data.fabric || ''), mods };
  } catch (_) {
    return null;
  }
}

function getState() {
  let minecraftFound = false;
  try { minecraftFound = fs.statSync(minecraftDir).isDirectory(); } catch (_) { minecraftFound = false; }
  const config = readConfig();
  const player = shownPlayer();
  return {
    appVersion: ISHE.version,
    engine: process.versions.electron || '',
    theme: tema.effective(APP_DIR),
    playerSkin: player ? skinDataUrl : '',
    playerNameProvisional: Boolean(player && player.provisional),
    update,
    updateFellBackFrom: ISHE.fellBackFrom,
    creator: { keyLoaded: Boolean(creatorKey), nextVersion: creator.nextVersion(ISHE.version), folder: creatorFolder },
    mcVersion: installer.MC_VERSION,
    platform: process.platform,
    gameDir,
    minecraftFound,
    installed: readInstalled(),
    ramGb: config.ramGb,
    ramChoices: RAM_CHOICES,
    friendCode: amigos.active(gameDir),
    server: config.servidor,
    joinServer: config.entrar,
    news: readNews(),
    signedIn: signedIn(),
    playerName: player ? player.name : '',
    pendingApproval: signedIn() && current.pending,
    sessionSaved: Boolean(store && store.canPersist()),
    gameRunning,
  };
}

// ---- actualizaciones ---------------------------------------------------------

function setUpdate(next) {
  update = Object.assign({ status: 'idle', version: '', notes: '', detail: '' }, next);
  send({ type: 'update', update });
}

async function checkForUpdates() {
  if (updateBusy) return update;
  updateBusy = true;
  const options = {
    base: TESTING ? TEST.updateBase : undefined,
    allowLoopback: Boolean(TESTING && TEST.updateBase),
    publicKey: ISHE.publicKey,
    currentVersion: ISHE.version,
    updatesRoot: ISHE.updatesRoot,
    engineMajor: parseInt(process.versions.electron, 10) || 0,
    bundledExtrasDir: path.join(ISHE.bundledDir, 'extras'),
    activeExtrasDir: path.join(APP_DIR, 'extras'),
  };
  setUpdate({ status: 'checking' });
  try {
    const found = await updater.check(options);
    if (found.status === 'available') {
      setUpdate({ status: 'downloading', version: found.version, notes: found.notes });
      await updater.download(Object.assign({ manifest: found.manifest, envelope: found.envelope }, options));
      setUpdate({ status: 'ready', version: found.version, notes: found.notes });
    } else {
      setUpdate({ status: found.status, version: found.version || '', notes: found.notes || '' });
    }
  } catch (error) {
    const reason = error instanceof updater.UpdateError ? error.reason : 'unexpected';
    setUpdate({ status: 'error', detail: reason === 'network' ? 'network' : String(error && error.message ? error.message : error).slice(0, 200) });
  } finally {
    updateBusy = false;
  }
  return update;
}

// ---- herramientas del creador -------------------------------------------------

function creatorKeyFile() {
  return path.join(app.getPath('userData'), 'clave-creador.bin');
}

function loadSavedCreatorKey() {
  try {
    if (!protector || !protector.available()) return;
    const pem = protector.decrypt(fs.readFileSync(creatorKeyFile()));
    if (paquete.sameKey(paquete.publicKeyOf(pem), ISHE.publicKey)) creatorKey = pem;
  } catch (_) { /* no hay clave guardada */ }
}

async function creatorLoadKey() {
  let file = TESTING ? TEST.keyFile : '';
  if (!TESTING) {
    const chosen = await dialog.showOpenDialog(mainWindow, {
      title: 'Elige tu clave de actualizaciones', properties: ['openFile'], filters: [{ name: 'Clave', extensions: ['pem'] }],
    });
    file = chosen.canceled || !chosen.filePaths[0] ? '' : chosen.filePaths[0];
  }
  if (!file) return { ok: false, reason: 'cancelled' };
  let pem = '';
  try {
    if (fs.statSync(file).size > 8 * 1024) return { ok: false, reason: 'wrong-key' };
    pem = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return { ok: false, reason: 'unreadable' };
  }
  if (!paquete.sameKey(paquete.publicKeyOf(pem), ISHE.publicKey)) return { ok: false, reason: 'wrong-key' };
  creatorKey = pem;
  let saved = false;
  try {
    if (protector && protector.available()) {
      fs.writeFileSync(creatorKeyFile(), protector.encrypt(pem), { mode: 0o600 });
      saved = true;
    }
  } catch (_) { saved = false; }
  return { ok: true, saved, state: getState() };
}

function creatorForgetKey() {
  creatorKey = '';
  try { fs.rmSync(creatorKeyFile(), { force: true }); } catch (_) { /* no existia */ }
  return getState();
}

async function creatorBuild(input) {
  if (!creatorKey) return { ok: false, message: 'Primero carga tu clave de actualizaciones.' };
  const version = String((input && input.version) || '').trim();
  const notes = String((input && input.notes) || '');
  let built;
  try {
    built = creator.build({
      codeDir: APP_DIR,
      extrasDir: extrasDir(),
      version,
      notes,
      theme: tema.effective(APP_DIR),
      privateKeyPem: creatorKey,
      publicKeyPem: ISHE.publicKey,
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    return { ok: false, message: String(error && error.message ? error.message : error) };
  }
  let parent = TESTING ? TEST.creatorOut : '';
  if (!TESTING) {
    const chosen = await dialog.showOpenDialog(mainWindow, {
      title: 'Dónde guardo los archivos de la actualización', defaultPath: app.getPath('desktop'),
      properties: ['openDirectory', 'createDirectory'],
    });
    parent = chosen.canceled || !chosen.filePaths[0] ? '' : chosen.filePaths[0];
  }
  if (!parent) return { ok: false, cancelled: true };
  const folder = path.join(parent, 'Reshem Client ' + built.version + ' - actualizacion');
  try {
    fs.mkdirSync(folder, { recursive: true });
    for (const [name, body] of built.files) fs.writeFileSync(path.join(folder, name), body);
  } catch (error) {
    return { ok: false, message: 'No pude guardar los archivos: ' + error.message };
  }
  creatorFolder = folder;
  return { ok: true, version: built.version, folder, upload: built.upload };
}

// ---- nombre para mostrar mientras Mojang no aprueba ---------------------------

async function setDisplayName(name) {
  if (!signedIn() || !current.pending) return { ok: false, reason: 'not-needed' };
  let player;
  try {
    player = await auth.lookupPlayer(name, AUTH_ENDPOINTS);
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
  if (!signedIn() || !current.pending) return { ok: false, reason: 'not-needed' };
  writeConfig({ provisional: { name: player.name, uuid: player.uuid } });
  skinDataUrl = '';
  try { fs.rmSync(skinFile(player.uuid), { force: true }); } catch (_) { /* no habia */ }
  await refreshSkin({ uuid: player.uuid, skinHash: player.skinHash });
  return { ok: true, state: getState() };
}

function clearDisplayName() {
  const typed = readConfig().provisional;
  if (typed) {
    writeConfig({ provisional: null });
    try { fs.rmSync(skinFile(typed.uuid), { force: true }); } catch (_) { /* no habia */ }
  }
  loadSavedSkin();
  return getState();
}

/** Mojang ya dio el perfil real: el nombre escrito a mano deja de hacer falta. */
function dropProvisional() {
  const typed = readConfig().provisional;
  if (!typed) return;
  writeConfig({ provisional: null });
  if (!current.account || current.account.uuid !== typed.uuid) {
    try { fs.rmSync(skinFile(typed.uuid), { force: true }); } catch (_) { /* no habia */ }
  }
}

// ---- inicio de sesion con Microsoft ---------------------------------------

async function loginStart() {
  if (loginAttempt) loginAttempt.cancelled = true;
  loginAttempt = null;
  let started;
  try {
    started = await auth.startDeviceCode(AUTH_ENDPOINTS);
  } catch (error) {
    return { ok: false, reason: reasonOf(error), detail: detailOf(error) };
  }
  const attempt = { cancelled: false, uri: safeVerificationUri(started.verificationUri), code: started.userCode };
  loginAttempt = attempt;
  finishLogin(attempt, started);
  return { ok: true, userCode: attempt.code, page: new URL(attempt.uri).hostname + new URL(attempt.uri).pathname, minutes: Math.round(started.expiresInSeconds / 60) };
}

async function finishLogin(attempt, started) {
  let payload;
  try {
    const microsoft = await auth.waitForDeviceCode(started, { endpoints: AUTH_ENDPOINTS, shouldCancel: () => attempt.cancelled });
    if (attempt.cancelled) return;
    let minecraft = null;
    let pending = false;
    try {
      minecraft = await auth.minecraftSession(microsoft.accessToken, AUTH_ENDPOINTS);
    } catch (error) {
      // Mojang todavia no aprobo la aplicacion: la sesion de Microsoft se conserva
      // para que el arranque directo empiece a funcionar solo cuando la apruebe.
      if (reasonOf(error) !== auth.REASONS.APP_NOT_APPROVED) throw error;
      pending = true;
    }
    if (attempt.cancelled) return;
    current = {
      refreshToken: microsoft.refreshToken,
      account: minecraft ? { name: minecraft.name, uuid: minecraft.uuid } : null,
      pending,
      minecraft,
    };
    persistSession();
    skinDataUrl = '';
    if (minecraft) {
      dropProvisional();
      refreshSkin(minecraft);
    }
    payload = { status: pending ? 'pending-approval' : 'ok' };
  } catch (error) {
    if (attempt.cancelled || reasonOf(error) === auth.REASONS.CANCELLED) return;
    payload = { status: 'error', reason: reasonOf(error), detail: detailOf(error) };
  } finally {
    if (loginAttempt === attempt) loginAttempt = null;
  }
  send(Object.assign({ type: 'login', state: getState() }, payload));
}

/** Sesion de Minecraft para jugar ahora: la que hay en memoria si aun vale, o una renovada. */
async function minecraftForPlay() {
  const cached = current.minecraft;
  if (cached && !current.pending && cached.expiresAt - Date.now() > 10 * 60 * 1000) return cached;
  const microsoft = await auth.refreshMicrosoft(current.refreshToken, AUTH_ENDPOINTS);
  current.refreshToken = microsoft.refreshToken;
  persistSession();
  const minecraft = await auth.minecraftSession(microsoft.accessToken, AUTH_ENDPOINTS);
  current.minecraft = minecraft;
  current.account = { name: minecraft.name, uuid: minecraft.uuid };
  current.pending = false;
  persistSession();
  dropProvisional();
  refreshSkin(minecraft);
  return minecraft;
}

function send(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ishe:event', payload);
}

// Estado del servidor (abierto o cerrado), recordado unos segundos para no preguntar a cada rato.
let serverStatusCache = { at: 0, address: '', value: { online: false } };
async function serverStatusNow(force) {
  const config = readConfig();
  const address = config.entrar ? config.servidor : '';
  if (!address) return { watching: false, online: true, players: 0, max: 0 };
  if (!force && serverStatusCache.address === address && Date.now() - serverStatusCache.at < 5000) return serverStatusCache.value;
  const result = await estadoServidor.query(address, { timeoutMs: 4000 });
  const value = { watching: true, online: result.online, players: result.players || 0, max: result.max || 0, address };
  serverStatusCache = { at: Date.now(), address, value };
  return value;
}

async function play() {
  if (busy) return { status: 'busy' };
  if (gameRunning) return { status: 'running' };
  if (signedIn()) {
    // Con el juego directo, solo se abre si el servidor esta abierto: si no, no hay a donde entrar.
    const server = await serverStatusNow(true);
    if (server.watching && !server.online) return { status: 'server-closed', state: getState() };
  }
  busy = true;
  try {
    const config = readConfig();
    const direct = signedIn();
    const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(APP_DIR, 'assets', 'icon-64.png')).toString('base64');
    let result;
    try {
      result = await installer.install({
        modrinthApi: TESTING ? TEST.modrinthApi : undefined,
        fabricMeta: TESTING ? TEST.fabricMeta : undefined,
        minecraftDir,
        gameDir,
        bundledDir: extrasDir(),
        icon,
        javaArgs: config.ramGb > 0 ? '-Xmx' + config.ramGb + 'G' : '',
        profileOptional: direct,
        isLauncherRunning: () => (TESTING ? TEST.scenario === 'launcher-open' : platformTools.isLauncherRunning(process.platform)),
      }, send);
    } catch (error) {
      const message = error instanceof installer.StopError
        ? error.message
        : 'Ocurrió un error inesperado: ' + (error && error.message ? error.message : String(error));
      return { status: 'stopped', message, state: getState() };
    }

    // ---- arranque directo: solo con una cuenta que tiene el juego -----------
    let handoff = 'signed-out';
    if (direct) {
      let minecraft = null;
      send({ type: 'step', text: 'Comprobando tu cuenta' });
      try {
        minecraft = await minecraftForPlay();
      } catch (error) {
        const reason = reasonOf(error);
        if (reason === auth.REASONS.APP_NOT_APPROVED) {
          current.pending = true;
          current.minecraft = null;
          persistSession();
          handoff = 'pending-approval';
        } else {
          if (reason === auth.REASONS.SESSION_EXPIRED || reason === auth.REASONS.NOT_OWNED) clearSession();
          return { status: 'auth-failed', reason, detail: detailOf(error), problems: result.problems, state: getState() };
        }
      }
      if (minecraft) {
        const options = {
          minecraftDir,
          gameDir,
          fabricVersionId: result.versionId,
          mcVersion: installer.MC_VERSION,
          env: { platform: process.platform, arch: process.arch, osVersion: os.release() },
          sources: GAME_SOURCES,
          ramGb: config.ramGb,
          joinServer: config.entrar ? config.servidor : '',
        };
        let running;
        try {
          const prepared = await game.prepare(options, send);
          send({ type: 'step', text: 'Abriendo Minecraft' });
          running = await game.launch(prepared, options, { name: minecraft.name, uuid: minecraft.uuid, accessToken: minecraft.accessToken });
        } catch (error) {
          const message = error instanceof game.GameError
            ? error.message
            : 'Ocurrió un error inesperado: ' + (error && error.message ? error.message : String(error));
          return { status: 'game-failed', message, problems: result.problems, state: getState() };
        }
        gameRunning = true;
        const startedAt = Date.now();
        const launchId = ++launchCount;
        running.exited.then((ended) => {
          gameRunning = false;
          const failed = ended.code !== 0;
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore();
          send({
            type: 'game-exit',
            launchId,
            code: ended.code,
            failed,
            seconds: Math.round((Date.now() - startedAt) / 1000),
            tail: failed ? ended.tail.slice(-8) : [],
            state: getState(),
          });
        });
        return { status: 'launched', launchId, playerName: minecraft.name, problems: result.problems, state: getState() };
      }
    }

    // ---- sin sesion, o aplicacion aun sin aprobar: launcher oficial ----------
    if (result.needsLauncherClosed) {
      return { status: 'needs-close', handoff, problems: result.problems, state: getState() };
    }
    if (result.profilesUpdated === 0) {
      return { status: 'no-profile', handoff, problems: result.problems, state: getState() };
    }
    const opened = TESTING ? 'tried' : platformTools.openOfficialLauncher(process.platform, process.env);
    return { status: 'ready', handoff, opened, problems: result.problems, state: getState() };
  } finally {
    busy = false;
  }
}

// En Windows, el acceso directo que creo el instalador apunta al icono viejo y la barra de tareas lo usa.
// Al abrir, Reshem Client deja su propio acceso directo (escritorio y menu Inicio) con el icono actual.
function refreshShortcutIcons() {
  if (process.platform !== 'win32' || TESTING) return;
  try {
    const source = path.join(APP_DIR, 'assets', 'gato.ico');
    if (!fs.existsSync(source)) return;
    const target = path.join(app.getPath('userData'), 'ishe-client.ico');
    const wanted = fs.readFileSync(source);
    let current = null;
    try { current = fs.readFileSync(target); } catch (_) { current = null; }
    if (!current || !current.equals(wanted)) fs.writeFileSync(target, wanted);
    const folders = [app.getPath('desktop'), path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
    let changed = false;
    for (const folder of folders) for (const nombre of ['Reshem Client.lnk', 'Ishe Client.lnk']) {
      const link = path.join(folder, nombre);
      if (!fs.existsSync(link)) continue;
      const details = shell.readShortcutLink(link);
      // Solo se toca el acceso directo propio: el que abre este mismo programa.
      if (path.normalize(details.target || '').toLowerCase() !== path.normalize(process.execPath).toLowerCase()) continue;
      if (path.normalize(details.icon || '').toLowerCase() === path.normalize(target).toLowerCase()) continue;
      shell.writeShortcutLink(link, 'update', { icon: target, iconIndex: 0 });
      changed = true;
    }
    if (changed) execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
  } catch (_) { /* un acceso directo que no se puede cambiar no es grave */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 660,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b110a',
    title: 'Reshem Client',
    icon: path.join(APP_DIR, 'assets', 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: TESTING,
    },
  });
  // La ventana solo muestra sus propios archivos: no abre enlaces ni navega fuera.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(APP_DIR, 'renderer', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

    // Solo en pruebas (Linux sin llavero): permite ejercitar el guardado de la sesion.
    const weakStoreForTests = TESTING && process.platform === 'linux' && process.env.ISHE_TEST_WEAK_STORE === '1';
    if (weakStoreForTests) safeStorage.setUsePlainTextEncryption(true);
    protector = {
      available: () => {
        if (!safeStorage.isEncryptionAvailable()) return false;
        // En Linux sin llavero el "cifrado" no protege nada: ahi no se guarda la sesion.
        if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return weakStoreForTests;
        return true;
      },
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (buffer) => safeStorage.decryptString(buffer),
    };
    store = sessionStore.create(path.join(app.getPath('userData'), 'sesion.json'), protector);
    const saved = store.load();
    if (saved) current = { refreshToken: saved.refreshToken, account: saved.account, pending: saved.pending, minecraft: null };
    loadSavedSkin();
    loadSavedCreatorKey();

    const fromOurWindow = (event) => Boolean(mainWindow) && event.sender === mainWindow.webContents;
    ipcMain.handle('ishe:state', (event) => {
      if (!fromOurWindow(event)) return null;
      if (!windowConfirmed) {
        windowConfirmed = true;
        ISHE.confirm(); // la ventana cargo y habla con este proceso: la version en uso funciona
        // Despues de confirmar, busca una version nueva (en pruebas, solo contra el servidor de pruebas).
        if (!TESTING || TEST.updateBase) setTimeout(() => { checkForUpdates(); }, 1200);
      }
      return getState();
    });
    ipcMain.handle('ishe:play', (event) => (fromOurWindow(event) ? play() : null));
    ipcMain.handle('ishe:set-ram', (event, gigabytes) => {
      if (!fromOurWindow(event) || !RAM_CHOICES.includes(gigabytes)) return false;
      writeConfig({ ramGb: gigabytes });
      return true;
    });
    ipcMain.handle('ishe:friend-code-set', (event, code) => {
      if (!fromOurWindow(event) || typeof code !== 'string') return { ok: false };
      try {
        const applied = amigos.apply(gameDir, code);
        if (!applied) return { ok: false };
        if (applied.server) writeConfig({ servidor: applied.server, entrar: true });
        return { ok: true, server: applied.server || '' };
      } catch (_) {
        return { ok: false, reason: 'disk' };
      }
    });
    ipcMain.handle('ishe:friend-code-clear', (event) => {
      if (!fromOurWindow(event)) return false;
      try { amigos.clear(gameDir); return true; } catch (_) { return false; }
    });
    ipcMain.handle('ishe:set-server', (event, address, join) => {
      if (!fromOurWindow(event)) return { ok: false };
      const text = typeof address === 'string' ? address.trim() : '';
      if (text !== '' && !game.serverAddress(text)) return { ok: false, reason: 'invalid' };
      writeConfig({ servidor: text, entrar: join !== false });
      return { ok: true };
    });
    ipcMain.handle('ishe:server-status', async (event) => (fromOurWindow(event) ? serverStatusNow(false) : null));
    ipcMain.handle('ishe:skin-change', async (event, mode, value, variant) => {
      if (!fromOurWindow(event)) return { ok: false };
      if (!signedIn() || current.pending) return { ok: false, reason: 'no-session' };
      let minecraft;
      try {
        minecraft = await minecraftForPlay();
      } catch (error) {
        return { ok: false, reason: 'session' };
      }
      let result;
      if (mode === 'file') {
        const chosen = await dialog.showOpenDialog(mainWindow, { title: 'Elige tu skin (PNG de 64x64)', properties: ['openFile'], filters: [{ name: 'Skin', extensions: ['png'] }] });
        if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, reason: 'cancelled' };
        let png;
        try {
          if (fs.statSync(chosen.filePaths[0]).size > 200 * 1024) return { ok: false, reason: 'invalid', detail: 'size' };
          png = fs.readFileSync(chosen.filePaths[0]);
        } catch (_) {
          return { ok: false, reason: 'unreadable' };
        }
        result = await skinCore.uploadFile(minecraft.accessToken, png, variant);
      } else if (mode === 'player') {
        let found;
        try {
          found = await auth.lookupPlayer(typeof value === 'string' ? value : '', AUTH_ENDPOINTS);
        } catch (error) {
          return { ok: false, reason: reasonOf(error) === auth.REASONS.NAME_NOT_FOUND ? 'name-not-found' : 'name-invalid' };
        }
        if (!found.skinHash) return { ok: false, reason: 'no-skin' };
        result = await skinCore.uploadUrl(minecraft.accessToken, 'https://textures.minecraft.net/texture/' + found.skinHash, variant);
      } else {
        return { ok: false };
      }
      if (result.ok) {
        const hash = await skinCore.currentHash(minecraft.accessToken);
        refreshSkin(Object.assign({}, minecraft, { skinHash: hash || minecraft.skinHash }));
      }
      return result;
    });
    ipcMain.handle('ishe:set-display-name', (event, name) => (fromOurWindow(event) ? setDisplayName(typeof name === 'string' ? name.slice(0, 40) : '') : null));
    ipcMain.handle('ishe:clear-display-name', (event) => (fromOurWindow(event) ? clearDisplayName() : null));
    ipcMain.handle('ishe:update-check', (event) => (fromOurWindow(event) ? checkForUpdates() : null));
    ipcMain.handle('ishe:update-restart', (event) => {
      if (!fromOurWindow(event) || update.status !== 'ready' || busy || gameRunning) return false;
      setImmediate(() => ISHE.restart());
      return true;
    });
    ipcMain.handle('ishe:creator-load-key', (event) => (fromOurWindow(event) ? creatorLoadKey() : null));
    ipcMain.handle('ishe:creator-forget-key', (event) => (fromOurWindow(event) ? creatorForgetKey() : null));
    ipcMain.handle('ishe:creator-build', (event, input) => (fromOurWindow(event) ? creatorBuild(input) : null));
    ipcMain.handle('ishe:creator-open-folder', async (event) => {
      if (!fromOurWindow(event) || !creatorFolder) return false;
      if (TESTING) return true;
      return (await shell.openPath(creatorFolder)) === '';
    });
    ipcMain.handle('ishe:open-folder', async (event) => {
      if (!fromOurWindow(event)) return false;
      fs.mkdirSync(gameDir, { recursive: true });
      if (TESTING) return true;
      return (await shell.openPath(gameDir)) === '';
    });

    ipcMain.handle('ishe:login-start', (event) => (fromOurWindow(event) ? loginStart() : null));
    ipcMain.handle('ishe:login-cancel', (event) => {
      if (!fromOurWindow(event)) return false;
      if (loginAttempt) loginAttempt.cancelled = true;
      loginAttempt = null;
      return true;
    });
    ipcMain.handle('ishe:login-open', async (event) => {
      if (!fromOurWindow(event) || !loginAttempt) return false;
      // Solo se abre la pagina de inicio de sesion de Microsoft, nunca otra direccion.
      if (TESTING) {
        fs.writeFileSync(path.join(TEST.outDir, 'opened-url.txt'), loginAttempt.uri);
        return true;
      }
      try { await shell.openExternal(loginAttempt.uri); return true; } catch (_) { return false; }
    });
    ipcMain.handle('ishe:login-copy', (event) => {
      if (!fromOurWindow(event) || !loginAttempt) return false;
      try { clipboard.writeText(loginAttempt.code); return true; } catch (_) { return false; }
    });
    ipcMain.handle('ishe:logout', (event) => {
      if (!fromOurWindow(event)) return null;
      if (loginAttempt) loginAttempt.cancelled = true;
      loginAttempt = null;
      clearSession();
      return getState();
    });

    refreshShortcutIcons();
    createWindow();
    if (TESTING) require(path.join(ISHE.bundledDir, 'test-hooks.js')).run(() => mainWindow, TEST);
  });

  app.on('window-all-closed', () => app.quit());
}
