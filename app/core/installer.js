'use strict';
// Logica de instalacion de Reshem Client. Solo usa modulos incluidos en Node.
// La usan tanto la ventana del launcher (main.js) como la linea de comandos
// de pruebas (cli.js).

const crypto = require('crypto');
const modishe = require('./modishe');
const fs = require('fs');
const path = require('path');

const CLIENT_NAME = 'Reshem Client';
const PROFILE_KEY = 'ishe-client';
const MC_VERSION = '26.2';
const USER_AGENT = 'IsheClient-Launcher/1.0';

// Mods que forman Reshem Client (nombres de proyecto en Modrinth).
// Las dependencias obligatorias de cada uno se anaden solas.
// simple-voice-chat: lo necesitan Nublado y Haku para oir y hablar.
// iris: carga los shaders (junto con Sodium).
const MOD_PROJECTS = ['fabric-api', 'sodium', 'iris', 'lithium', 'ferrite-core', 'fancymenu', 'modmenu', 'simple-voice-chat',
  // extras (8 oct): mapa, papelera, cuadros, modelos de jugador, luz dinamica
  'xaeros-world-map', 'trashslot', 'immersive-paintings', 'custom-player-models', 'lambdynamiclights'];

// Paquete de shaders que viene puesto (Complementary Reimagined, de Modrinth): se baja solo y queda activado la primera vez;
// despues cada quien lo cambia o lo apaga en Opciones > Ajustes de video > Paquetes de shaders (no se vuelve a tocar).
const SHADER_PROJECT = 'complementary-reimagined';

// e4steam ya no forma parte de Reshem Client (desde 1.5.0). Solo se guarda su nombre para retirarlo si quedo de una version anterior.
const E4STEAM_FILE = 'e4steam-fabric-quilt-mc26.1-26.2-v0.3.2-guard.jar';

const DEFAULTS = {
  modrinthApi: 'https://api.modrinth.com/v2',
  fabricMeta: 'https://meta.fabricmc.net/v2',
};

const PROFILE_FILES = ['launcher_profiles.json', 'launcher_profiles_microsoft_store.json'];

class StopError extends Error {}

function defaultDirs(platform, env, home) {
  if (platform === 'win32') {
    const appData = env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
    return {
      minecraftDir: path.win32.join(appData, '.minecraft'),
      gameDir: path.win32.join(appData, '.ishe-client'),
    };
  }
  if (platform === 'darwin') {
    const support = path.posix.join(home, 'Library', 'Application Support');
    return {
      minecraftDir: path.posix.join(support, 'minecraft'),
      gameDir: path.posix.join(support, 'ishe-client'),
    };
  }
  return {
    minecraftDir: path.posix.join(home, '.minecraft'),
    gameDir: path.posix.join(home, '.ishe-client'),
  };
}

function sha(file, algorithm) {
  return crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

function safeFileName(name) {
  if (typeof name !== 'string' || name === '' || name.length > 180) return false;
  // eslint-disable-next-line no-control-regex
  if (!/^[^\\/:*?"<>|\x00-\x1f]+\.jar$/.test(name)) return false;
  if (name.includes('..') || name.startsWith('.')) return false;
  return true;
}

function text(value) {
  return typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : '');
}

async function httpGet(url, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs || 60000),
    });
  } catch (error) {
    throw new Error('no hubo respuesta del servidor; revisa tu conexión a internet');
  }
  if (!response.ok) {
    throw new Error('el servidor respondió ' + response.status);
  }
  if (url.startsWith('https://') && !String(response.url || url).startsWith('https://')) {
    throw new Error('la descarga fue desviada a una dirección no segura');
  }
  return Buffer.from(await response.arrayBuffer());
}

async function getJson(url) {
  return JSON.parse((await httpGet(url)).toString('utf8'));
}

// Version mas reciente de un proyecto para Fabric + MC_VERSION, prefiriendo
// las publicadas como "release". null si no hay ninguna.
async function modVersion(modrinthApi, project) {
  const url = modrinthApi + '/project/' + encodeURIComponent(project) +
    '/version?game_versions=%5B%22' + MC_VERSION + '%22%5D&loaders=%5B%22fabric%22%5D';
  const versions = await getJson(url);
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const release = versions.find((v) => v && typeof v === 'object' && v.version_type === 'release');
  if (release) return release;
  return versions[0] && typeof versions[0] === 'object' ? versions[0] : null;
}

// Version mas reciente de un paquete de shaders (cargador "iris") para MC_VERSION. null si no hay.
async function shaderVersion(modrinthApi, project) {
  const url = modrinthApi + '/project/' + encodeURIComponent(project) +
    '/version?game_versions=%5B%22' + MC_VERSION + '%22%5D&loaders=%5B%22iris%22%5D';
  const versions = await getJson(url);
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const release = versions.find((v) => v && typeof v === 'object' && v.version_type === 'release');
  const chosen = release || versions[0];
  return chosen && typeof chosen === 'object' ? chosen : null;
}

// Deja el paquete de shaders en <juego>/shaderpacks y, solo si nunca se eligio uno, lo activa en config/iris.properties.
async function installShaders(modrinthApi, gameDir, info, problem) {
  let version;
  try {
    version = await shaderVersion(modrinthApi, SHADER_PROJECT);
  } catch (error) {
    problem('No pude consultar los shaders: ' + error.message);
    return;
  }
  if (!version) {
    info('los shaders todavía no tienen versión para Minecraft ' + MC_VERSION);
    return;
  }
  const file = primaryFile(version);
  if (!file || !/^[A-Za-z0-9._ +()-]+\.zip$/.test(text(file.filename))) {
    problem('Los shaders no traen un archivo .zip válido.');
    return;
  }
  const expected = text(file.hashes && file.hashes.sha512).toLowerCase();
  const url = text(file.url);
  if (!/^[0-9a-f]{128}$/.test(expected) || (modrinthApi.startsWith('https://') && !url.startsWith('https://'))) {
    problem('Los shaders no traen verificación segura; no se instalan.');
    return;
  }
  const packs = path.join(gameDir, 'shaderpacks');
  fs.mkdirSync(packs, { recursive: true });
  const target = path.join(packs, file.filename);
  if (isFile(target) && sha(target, 'sha512') === expected) {
    info('ya estaba   ' + file.filename);
  } else {
    const temp = target + '.descargando';
    try {
      const body = await httpGet(url, 600000);
      if (crypto.createHash('sha512').update(body).digest('hex') !== expected) throw new Error('el archivo descargado no coincide con su código de verificación');
      fs.writeFileSync(temp, body);
      fs.renameSync(temp, target);
      info('descargado  ' + file.filename);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch (_) { /* nada que limpiar */ }
      problem('No pude instalar los shaders: ' + error.message);
      return;
    }
  }
  // Activarlos solo la primera vez (si ya hay un iris.properties, la eleccion es de la persona).
  const config = path.join(gameDir, 'config');
  const props = path.join(config, 'iris.properties');
  if (!isFile(props)) {
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(props, 'enableShaders=true\nshaderPack=' + file.filename + '\n');
    info('shaders activados: ' + file.filename);
  }
}

function primaryFile(version) {
  const files = Array.isArray(version.files) ? version.files.filter((f) => f && typeof f === 'object') : [];
  return files.find((f) => f.primary) || files[0] || null;
}

function readManifest(manifestPath) {
  const previous = new Map();
  if (!isFile(manifestPath)) return previous;
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const item of Array.isArray(data.mods) ? data.mods : []) {
      if (!item || typeof item !== 'object') continue;
      const project = text(item.project);
      const file = text(item.file);
      if (project !== '' && safeFileName(file)) previous.set(project, file);
    }
  } catch (_) {
    previous.clear();
  }
  return previous;
}

function wantedProfile(existing, values, now) {
  const created = existing && typeof existing === 'object' && text(existing.created) !== ''
    ? text(existing.created) : now;
  const entry = {
    created,
    gameDir: values.gameDir,
    icon: values.icon,
    lastUsed: now,
    lastVersionId: values.versionId,
    name: CLIENT_NAME,
    type: 'custom',
  };
  if (values.javaArgs) entry.javaArgs = values.javaArgs;
  return entry;
}

function profileIsCurrent(existing, wanted) {
  if (!existing || typeof existing !== 'object') return false;
  for (const key of ['gameDir', 'icon', 'lastVersionId', 'name', 'type']) {
    if (existing[key] !== wanted[key]) return false;
  }
  return (existing.javaArgs || '') === (wanted.javaArgs || '');
}

/**
 * Instala o actualiza Reshem Client.
 *
 * options: { minecraftDir, gameDir, bundledDir, icon, modrinthApi?, fabricMeta?, javaArgs?,
 *            isLauncherRunning?: () => boolean, profileOptional?: boolean }
 * onEvent: recibe { type: 'step'|'info'|'problem'|'progress', ... }
 * Devuelve { exitCode, problems, versionId, mods, profilesUpdated, needsLauncherClosed }.
 * Lanza StopError si no se puede ni empezar (no se ha tocado nada).
 */
async function install(options, onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const modrinthApi = options.modrinthApi || DEFAULTS.modrinthApi;
  const fabricMeta = options.fabricMeta || DEFAULTS.fabricMeta;
  const { minecraftDir, gameDir } = options;
  const problems = [];
  const problem = (message) => { problems.push(message); emit({ type: 'problem', text: message }); };
  const info = (message) => emit({ type: 'info', text: message });
  const step = (message) => emit({ type: 'step', text: message });

  // Con sesion propia (arranque directo) el launcher oficial no hace falta: su
  // perfil es un extra y la carpeta de Minecraft se crea si no existe.
  const profileOptional = Boolean(options.profileOptional);
  if (profileOptional && !isDir(minecraftDir)) {
    try { fs.mkdirSync(minecraftDir, { recursive: true }); } catch (_) { /* se informa abajo */ }
  }
  if (!isDir(minecraftDir)) {
    throw new StopError('No encuentro la carpeta de Minecraft (' + minecraftDir + '). Instala el launcher oficial de Minecraft, ábrelo una vez con tu cuenta y vuelve a intentarlo.');
  }

  // ---- Fabric -------------------------------------------------------------
  step('Instalando Fabric para Minecraft ' + MC_VERSION);
  let loaders;
  let profileText;
  let versionId = '';
  try {
    loaders = await getJson(fabricMeta + '/versions/loader/' + MC_VERSION);
  } catch (error) {
    throw new StopError('No pude consultar Fabric: ' + error.message + '.');
  }
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new StopError('Fabric no publica cargador para Minecraft ' + MC_VERSION + '.');
  }
  const usable = loaders.filter((e) => e && typeof e === 'object' && e.loader && typeof e.loader === 'object');
  const chosen = usable.find((e) => e.loader.stable) || usable[0];
  const loaderVersion = chosen ? text(chosen.loader.version) : '';
  if (!/^[0-9A-Za-z.+-]+$/.test(loaderVersion)) {
    throw new StopError('Fabric devolvió una versión de cargador con formato inesperado.');
  }
  try {
    profileText = await httpGet(fabricMeta + '/versions/loader/' + MC_VERSION + '/' + loaderVersion + '/profile/json');
    const profileJson = JSON.parse(profileText.toString('utf8'));
    versionId = text(profileJson && profileJson.id);
    if (!/^[0-9A-Za-z.+_-]+$/.test(versionId) || text(profileJson.inheritsFrom) !== MC_VERSION) {
      throw new Error('perfil inesperado');
    }
  } catch (error) {
    throw new StopError('Fabric devolvió un perfil de versión inesperado.');
  }
  const versionDir = path.join(minecraftDir, 'versions', versionId);
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, versionId + '.json'), profileText);
  const dummyJar = path.join(versionDir, versionId + '.jar');
  if (!fs.existsSync(dummyJar)) fs.writeFileSync(dummyJar, Buffer.alloc(0));
  info('Fabric ' + loaderVersion + ' instalado como ' + versionId);

  // ---- mods ---------------------------------------------------------------
  step('Descargando los mods de Reshem Client');
  const modsDir = path.join(gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const manifestPath = path.join(gameDir, 'ishe-client-instalado.json');
  const previousMods = readManifest(manifestPath);
  const currentMods = new Map();
  const seenProjects = new Set();
  const seenRequests = new Set();
  const queue = MOD_PROJECTS.slice();
  let done = 0;

  while (queue.length > 0) {
    const project = queue.shift();
    if (seenRequests.has(project)) continue;
    seenRequests.add(project);
    emit({ type: 'progress', done, total: done + queue.length + 1 });

    let version;
    try {
      version = await modVersion(modrinthApi, project);
    } catch (error) {
      problem("No pude consultar el mod '" + project + "': " + error.message);
      done++;
      continue;
    }
    if (!version) {
      problem("El mod '" + project + "' no tiene versión para Fabric " + MC_VERSION + '.');
      done++;
      continue;
    }
    const projectId = text(version.project_id) || project;
    if (seenProjects.has(projectId)) continue;
    seenProjects.add(projectId);
    done++;

    const file = primaryFile(version);
    if (!file || !safeFileName(file.filename)) {
      problem("El mod '" + project + "' no trae un archivo .jar válido.");
      continue;
    }
    const expected = text(file.hashes && file.hashes.sha512).toLowerCase();
    if (!/^[0-9a-f]{128}$/.test(expected)) {
      problem("El mod '" + project + "' no trae código de verificación; no se instala.");
      continue;
    }
    const url = text(file.url);
    if (modrinthApi.startsWith('https://') && !url.startsWith('https://')) {
      problem("El mod '" + project + "' apunta a una descarga no segura; no se instala.");
      continue;
    }
    const target = path.join(modsDir, file.filename);
    if (isFile(target) && sha(target, 'sha512') === expected) {
      info('ya estaba   ' + file.filename);
    } else {
      const temp = target + '.descargando';
      try {
        const body = await httpGet(url, 600000);
        if (crypto.createHash('sha512').update(body).digest('hex') !== expected) {
          throw new Error('el archivo descargado no coincide con su código de verificación');
        }
        fs.writeFileSync(temp, body);
        fs.renameSync(temp, target);
        info('descargado  ' + file.filename);
      } catch (error) {
        try { fs.rmSync(temp, { force: true }); } catch (_) { /* nada que limpiar */ }
        problem("No pude instalar '" + project + "': " + error.message);
        continue;
      }
    }
    currentMods.set(projectId, file.filename);

    for (const dependency of Array.isArray(version.dependencies) ? version.dependencies : []) {
      if (!dependency || typeof dependency !== 'object') continue;
      const dependencyProject = text(dependency.project_id);
      if (dependency.dependency_type === 'required' && dependencyProject !== '') queue.push(dependencyProject);
    }
  }

  await installShaders(modrinthApi, gameDir, info, problem);

  // El mod Ishe (Nublado, Haku, cajero...): se actualiza solo desde la release "mods" del proyecto.
  try {
    const publicKey = options.publicKey || require('./clave-publica');
    const result = await modishe.sync({
      source: options.isheModSource, publicKey, modsDir, minecraft: MC_VERSION,
      allowLoopback: Boolean(options.isheModAllowLoopback),
    });
    if (result.status === 'actualizado') info('descargado  ' + result.file + ' (mod Ishe ' + result.version + ')');
    else if (result.status === 'al-dia') info('ya estaba   ' + result.file);
    else if (result.status === 'otra-version') info('el mod Ishe publicado es para Minecraft ' + result.minecraft + ': se deja el que tienes');
    else info('todavía no hay ningún mod Ishe publicado');
    if (result.file) currentMods.set(modishe.PROJECT_KEY, result.file);
  } catch (error) {
    problem('No pude actualizar el mod Ishe (se conserva el que ya tenías): ' + error.message);
  }

  // e4steam ya no se instala: si quedo de una version anterior, se retira (y se olvida de la lista de mods instalados).
  const oldE4steam = path.join(modsDir, E4STEAM_FILE);
  if (isFile(oldE4steam)) {
    fs.rmSync(oldE4steam, { force: true });
    info('retirado    ' + E4STEAM_FILE + ' (ya no forma parte de Reshem Client)');
  }
  previousMods.delete('e4steam');

  // Versiones anteriores: solo se retira el archivo viejo de un mod que ESTA
  // ejecucion instalo bien con otro nombre. Si un mod fallo hoy, se conserva el
  // que ya tenias. Nunca se tocan mods que anadiste tu a mano.
  const keptFiles = new Set(currentMods.values());
  for (const [oldProject, oldFile] of previousMods) {
    if (currentMods.has(oldProject)) {
      if (currentMods.get(oldProject) !== oldFile && !keptFiles.has(oldFile)) {
        const oldPath = path.join(modsDir, oldFile);
        if (isFile(oldPath)) {
          fs.rmSync(oldPath, { force: true });
          info('retirado    ' + oldFile + ' (versión anterior)');
        }
      }
    } else {
      currentMods.set(oldProject, oldFile);
    }
  }
  const mods = Array.from(currentMods.keys()).sort().map((key) => ({ project: key, file: currentMods.get(key) }));
  fs.writeFileSync(manifestPath, JSON.stringify(
    { client: CLIENT_NAME, minecraft: MC_VERSION, fabric: versionId, mods }, null, 2));
  emit({ type: 'progress', done: 1, total: 1 });

  // ---- perfil en el launcher oficial ---------------------------------------
  step("Añadiendo el perfil 'Reshem Client' al launcher oficial");
  const now = new Date().toISOString();
  let profilesUpdated = 0;
  let profileFilesFound = 0;
  let needsLauncherClosed = false;
  for (const name of PROFILE_FILES) {
    const file = path.join(minecraftDir, name);
    if (!isFile(file)) continue;
    profileFilesFound++;
    try {
      const original = fs.readFileSync(file);
      const data = JSON.parse(original.toString('utf8').replace(/^﻿/, ''));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('formato inesperado');
      if (data.profiles === undefined || data.profiles === null) data.profiles = {};
      if (typeof data.profiles !== 'object' || Array.isArray(data.profiles)) throw new Error('formato inesperado');
      const originalKeys = Object.keys(data.profiles);
      const existing = data.profiles[PROFILE_KEY];
      const wanted = wantedProfile(existing, {
        gameDir, icon: options.icon, versionId, javaArgs: options.javaArgs || '',
      }, now);
      if (profileIsCurrent(existing, wanted)) {
        profilesUpdated++;
        info('perfil ya estaba al día en ' + name);
        continue;
      }
      if (typeof options.isLauncherRunning === 'function' && options.isLauncherRunning()) {
        needsLauncherClosed = true;
        if (profileOptional) info('el launcher oficial está abierto: su perfil se actualizará otro día');
        else problem('El launcher de Minecraft está abierto: ciérralo por completo y vuelve a intentarlo para añadir el perfil.');
        continue;
      }
      data.profiles[PROFILE_KEY] = wanted;
      const newText = JSON.stringify(data, null, 2);

      // Comprobacion antes de escribir: el resultado se vuelve a leer y debe
      // conservar todos los perfiles que ya existian.
      const check = JSON.parse(newText);
      for (const key of originalKeys.concat([PROFILE_KEY])) {
        if (!Object.prototype.hasOwnProperty.call(check.profiles, key)) throw new Error('se perdería el perfil ' + key);
      }
      const stamp = now.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const backup = file + '.antes-de-ishe-' + stamp;
      fs.writeFileSync(backup, original);
      fs.writeFileSync(file, newText);
      profilesUpdated++;
      info('perfil añadido en ' + name + ' (copia de seguridad: ' + path.basename(backup) + ')');
    } catch (error) {
      problem('No pude actualizar ' + name + ' (se deja como estaba): ' + error.message);
    }
  }
  if (profileFilesFound === 0 && profileOptional) {
    info('el launcher oficial no está instalado: no hace falta para jugar desde Reshem Client');
  } else if (profileFilesFound === 0) {
    problem('No se añadió el perfil al launcher. Abre el launcher oficial una vez, ciérralo y vuelve a intentarlo.');
  }

  return {
    exitCode: problems.length > 0 ? 2 : 0,
    problems,
    versionId,
    mods,
    profilesUpdated,
    needsLauncherClosed,
  };
}

module.exports = {
  CLIENT_NAME, MC_VERSION, MOD_PROJECTS, E4STEAM_FILE, PROFILE_KEY, DEFAULTS,
  StopError, defaultDirs, install, installShaders, readManifest, safeFileName,
};
