'use strict';
// Descarga y arranque directo de Minecraft: Java Edition.
//
// Todo se descarga de los servidores oficiales (Mojang para el juego y Java,
// Fabric para su cargador) y cada archivo se comprueba con su SHA-1 antes de
// usarse. Los archivos del juego van a la carpeta normal de Minecraft, que se
// comparte con el launcher oficial; Java va a la carpeta de Ishe Client.
//
// Solo usa modulos incluidos en Node.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const USER_AGENT = 'IsheClient-Launcher/1.1';
const LAUNCHER_NAME = 'IsheClient';
const LAUNCHER_VERSION = '1.1.0';

const SOURCES = {
  versionManifest: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  javaRuntimes: 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json',
  assets: 'https://resources.download.minecraft.net',
  // Solo se descarga de estos sitios (mas los de pruebas en este mismo equipo).
  allowedHosts: [
    'piston-meta.mojang.com', 'piston-data.mojang.com', 'launchermeta.mojang.com', 'launcher.mojang.com',
    'libraries.minecraft.net', 'resources.download.minecraft.net', 'maven.fabricmc.net', 'meta.fabricmc.net',
  ],
};

class GameError extends Error {}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function sha1Of(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function fileSha1(file) {
  return sha1Of(fs.readFileSync(file));
}

function checkUrl(url, sources) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new GameError('direccion de descarga no valida'); }
  if (parsed.protocol === 'https:' && sources.allowedHosts.includes(parsed.hostname)) return;
  if (sources.allowLoopback && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1') return;
  throw new GameError('descarga desde un sitio no permitido: ' + parsed.hostname);
}

/** Pide una direccion siguiendo redirecciones solo hacia sitios permitidos. */
async function fetchChecked(url, sources, timeoutMs) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    checkUrl(current, sources);
    const response = await fetch(current, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs || 600000), // archivos grandes en conexiones lentas
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current).toString();
      continue;
    }
    return response;
  }
  throw new GameError('demasiadas redirecciones al descargar');
}

async function fetchBuffer(url, sources, timeoutMs) {
  checkUrl(url, sources);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchChecked(url, sources, timeoutMs);
      if (!response.ok) throw new GameError('el servidor respondio ' + response.status);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error instanceof GameError ? error : new GameError('no hubo respuesta del servidor; revisa tu conexion a internet');
      if (/no permitido|no valida/.test(lastError.message)) break;
    }
  }
  throw lastError;
}

/** Deja en `target` un archivo cuyo SHA-1 es `sha1` (si se indica). No vuelve a bajar lo que ya esta bien. */
async function ensureFile(target, url, sha1, sources) {
  if (isFile(target) && (!sha1 || fileSha1(target) === sha1.toLowerCase())) return false;
  const body = await fetchBuffer(url, sources);
  if (sha1 && sha1Of(body) !== sha1.toLowerCase()) {
    throw new GameError('un archivo descargado no coincide con su codigo de verificacion: ' + path.basename(target));
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = target + '.descargando';
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, target);
  return true;
}

/** Ejecuta tareas con un limite de descargas a la vez; la primera que falla detiene el resto. */
async function runPool(items, limit, worker, onProgress) {
  let next = 0;
  let done = 0;
  let failure = null;
  async function lane() {
    while (next < items.length && !failure) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (error) {
        failure = failure || error;
        return;
      }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure) throw failure;
}

// ---- reglas del archivo de version ------------------------------------------

function osName(platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'osx';
  return 'linux';
}

function compareVersions(a, b) {
  const left = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const right = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

const KNOWN_OS_KEYS = ['name', 'arch', 'version', 'versionRange'];
const KNOWN_RULE_KEYS = ['action', 'os', 'features'];

function ruleMatches(rule, env) {
  // Una condicion que este launcher no entiende se toma como "no coincide".
  if (Object.keys(rule).some((key) => !KNOWN_RULE_KEYS.includes(key))) return false;
  if (rule.os) {
    if (typeof rule.os !== 'object' || Object.keys(rule.os).some((key) => !KNOWN_OS_KEYS.includes(key))) return false;
    if (rule.os.name && rule.os.name !== osName(env.platform)) return false;
    if (rule.os.arch && rule.os.arch !== (env.arch === 'ia32' ? 'x86' : env.arch)) return false;
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(env.osVersion || '')) return false;
      } catch (_) {
        return false;
      }
    }
    if (rule.os.versionRange) {
      const range = rule.os.versionRange;
      if (!env.osVersion || typeof range !== 'object') return false;
      if (range.min !== undefined && compareVersions(env.osVersion, range.min) < 0) return false;
      if (range.max !== undefined && compareVersions(env.osVersion, range.max) >= 0) return false;
    }
  }
  if (rule.features) {
    for (const [feature, wanted] of Object.entries(rule.features)) {
      if (Boolean(env.features && env.features[feature]) !== Boolean(wanted)) return false;
    }
  }
  return true;
}

/** Igual que el launcher oficial: sin reglas se permite; con reglas manda la ultima que coincide. */
function rulesAllow(rules, env) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (rule && ruleMatches(rule, env)) allowed = rule.action === 'allow';
  }
  return allowed;
}

/** "grupo:artefacto:version[:clasificador][@ext]" -> ruta dentro de libraries/ */
function mavenPath(name) {
  const [coords, ext] = String(name).split('@');
  const parts = coords.split(':');
  if (parts.length < 3 || parts.some((p) => !/^[A-Za-z0-9._+-]+$/.test(p))) {
    throw new GameError('nombre de biblioteca inesperado: ' + name);
  }
  const [group, artifact, version, classifier] = parts;
  const file = artifact + '-' + version + (classifier ? '-' + classifier : '') + '.' + (ext || 'jar');
  return group.split('.').join('/') + '/' + artifact + '/' + version + '/' + file;
}

function libraryKey(name) {
  const parts = String(name).split('@')[0].split(':');
  return parts[0] + ':' + parts[1] + (parts[3] ? ':' + parts[3] : '');
}

function safeRelative(relative) {
  const normalized = String(relative).replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.split('/').some((p) => p === '..' || p === '')) {
    throw new GameError('ruta de archivo inesperada: ' + relative);
  }
  return normalized;
}

/** Bibliotecas que tocan en este sistema, sin repetidas (gana la primera: las del perfil hijo). */
function collectLibraries(version, env) {
  const seen = new Set();
  const out = [];
  for (const library of version.libraries || []) {
    if (!library || typeof library.name !== 'string') continue;
    if (!rulesAllow(library.rules, env)) continue;
    const key = libraryKey(library.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const artifact = library.downloads && library.downloads.artifact;
    if (artifact && typeof artifact.url === 'string') {
      out.push({ path: safeRelative(artifact.path || mavenPath(library.name)), url: artifact.url, sha1: artifact.sha1 || '' });
    } else if (typeof library.url === 'string') {
      const relative = mavenPath(library.name);
      out.push({ path: relative, url: library.url.replace(/\/?$/, '/') + relative, sha1: library.sha1 || '' });
    } else if (!library.downloads) {
      const relative = mavenPath(library.name);
      out.push({ path: relative, url: 'https://libraries.minecraft.net/' + relative, sha1: library.sha1 || '' });
    }
  }
  return out;
}

/** Une el perfil hijo (Fabric) con su version base (Minecraft). */
function mergeVersions(child, parent) {
  const merged = Object.assign({}, parent, child);
  merged.libraries = (child.libraries || []).concat(parent.libraries || []);
  merged.arguments = {
    game: ((parent.arguments && parent.arguments.game) || []).concat((child.arguments && child.arguments.game) || []),
    jvm: ((parent.arguments && parent.arguments.jvm) || []).concat((child.arguments && child.arguments.jvm) || []),
  };
  merged.downloads = parent.downloads;
  merged.assetIndex = parent.assetIndex;
  merged.assets = parent.assets;
  merged.arguments['default-user-jvm'] = (parent.arguments && parent.arguments['default-user-jvm']) || [];
  merged.javaVersion = child.javaVersion || parent.javaVersion;
  merged.jarId = parent.id;
  return merged;
}

function expandArguments(list, env, values) {
  const out = [];
  for (const item of list || []) {
    let pieces;
    if (typeof item === 'string') pieces = [item];
    else if (item && rulesAllow(item.rules, env)) pieces = Array.isArray(item.value) ? item.value : [item.value];
    else continue;
    for (const piece of pieces) {
      if (typeof piece !== 'string') continue;
      out.push(piece.replace(/\$\{([A-Za-z_]+)\}/g, (whole, key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole)));
    }
  }
  return out;
}

// ---- Java ------------------------------------------------------------------

function javaPlatformKey(env) {
  if (env.platform === 'win32') return env.arch === 'arm64' ? 'windows-arm64' : (env.arch === 'ia32' ? 'windows-x86' : 'windows-x64');
  if (env.platform === 'darwin') return env.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return env.arch === 'ia32' ? 'linux-i386' : 'linux';
}

function javaExecutable(root, env) {
  if (env.platform === 'win32') return path.join(root, 'bin', 'javaw.exe');
  if (env.platform === 'darwin') return path.join(root, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(root, 'bin', 'java');
}

async function ensureJava(component, gameDir, env, sources, emit) {
  const key = javaPlatformKey(env);
  const root = path.join(gameDir, 'runtime', component, key);
  const marker = path.join(root, '.ishe-java');
  const executable = javaExecutable(root, env);
  const installed = isFile(marker) && isFile(executable);

  let all;
  try {
    all = JSON.parse((await fetchBuffer(sources.javaRuntimes, sources)).toString('utf8'));
  } catch (error) {
    if (installed) return executable; // sin conexion: vale el Java que ya estaba
    throw error;
  }
  const entry = all && all[key] && Array.isArray(all[key][component]) ? all[key][component][0] : null;
  if (!entry || !entry.manifest || typeof entry.manifest.url !== 'string') {
    throw new GameError('Mojang no ofrece Java (' + component + ') para este sistema (' + key + ').');
  }
  const wanted = String(entry.manifest.sha1 || entry.manifest.url);
  if (installed && fs.readFileSync(marker, 'utf8') === wanted) return executable;

  const manifestBody = await fetchBuffer(entry.manifest.url, sources);
  if (entry.manifest.sha1 && sha1Of(manifestBody) !== String(entry.manifest.sha1).toLowerCase()) {
    throw new GameError('la lista de archivos de Java no coincide con su codigo de verificacion');
  }
  const manifest = JSON.parse(manifestBody.toString('utf8'));
  const files = [];
  const links = [];
  for (const [relative, info] of Object.entries(manifest.files || {})) {
    if (!info) continue;
    const target = path.join(root, safeRelative(relative));
    if (info.type === 'directory') {
      fs.mkdirSync(target, { recursive: true });
    } else if (info.type === 'file' && info.downloads && info.downloads.raw && typeof info.downloads.raw.url === 'string') {
      files.push({ target, url: info.downloads.raw.url, sha1: info.downloads.raw.sha1 || '', executable: Boolean(info.executable) });
    } else if (info.type === 'link' && typeof info.target === 'string') {
      links.push({ target, to: info.target });
    }
  }
  try { fs.rmSync(marker, { force: true }); } catch (_) { /* no existia */ }
  await runPool(files, 12, async (file) => {
    await ensureFile(file.target, file.url, file.sha1, sources);
    if (file.executable && env.platform !== 'win32') fs.chmodSync(file.target, 0o755);
  }, (done, total) => emit({ type: 'progress', done, total }));
  for (const link of links) {
    // Los enlaces de Java son relativos y se quedan dentro de su propia carpeta.
    const resolved = path.resolve(path.dirname(link.target), link.to);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new GameError('enlace inesperado en Java: ' + link.to);
    fs.mkdirSync(path.dirname(link.target), { recursive: true });
    try { fs.rmSync(link.target, { force: true }); } catch (_) { /* no existia */ }
    try { fs.symlinkSync(link.to, link.target); } catch (_) { /* sin permiso para enlaces: Java no los necesita para arrancar */ }
  }
  if (!isFile(executable)) throw new GameError('Java se descargo pero falta su programa principal.');
  fs.writeFileSync(marker, wanted);
  return executable;
}

// ---- preparacion completa ----------------------------------------------------

/**
 * Deja listo todo lo necesario para arrancar `fabricVersionId` y devuelve como arrancarlo.
 * options: { minecraftDir, gameDir, fabricVersionId, mcVersion, env:{platform,arch,osVersion}, sources? }
 */
async function prepare(options, onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const sources = Object.assign({}, SOURCES, options.sources || {});
  const { minecraftDir, gameDir, env } = options;
  const step = (text) => emit({ type: 'step', text });
  if (!/^[A-Za-z0-9._-]+$/.test(String(options.mcVersion)) || !/^[A-Za-z0-9._+-]+$/.test(String(options.fabricVersionId))) {
    throw new GameError('nombre de version inesperado');
  }

  step('Comprobando la versión de Minecraft');
  const versionsDir = path.join(minecraftDir, 'versions');
  const childFile = path.join(versionsDir, options.fabricVersionId, options.fabricVersionId + '.json');
  if (!isFile(childFile)) throw new GameError('Falta el perfil de Fabric. Vuelve a pulsar Jugar.');
  const child = JSON.parse(fs.readFileSync(childFile, 'utf8'));
  if (child.inheritsFrom !== options.mcVersion) throw new GameError('El perfil de Fabric no corresponde a Minecraft ' + options.mcVersion + '.');

  // La descripcion oficial de la version se guarda en la carpeta de Ishe Client,
  // para no tocar la copia que usa el launcher oficial.
  const parentFile = path.join(gameDir, 'cache', options.mcVersion + '.json');
  try {
    const manifest = JSON.parse((await fetchBuffer(sources.versionManifest, sources)).toString('utf8'));
    const listed = (manifest.versions || []).find((v) => v && v.id === options.mcVersion);
    if (!listed || typeof listed.url !== 'string') throw new GameError('Mojang no lista Minecraft ' + options.mcVersion + '.');
    await ensureFile(parentFile, listed.url, listed.sha1 || '', sources);
  } catch (error) {
    if (!isFile(parentFile)) throw error; // sin conexion vale la copia guardada
    emit({ type: 'info', text: 'sin respuesta de Mojang: uso la copia guardada de la versión' });
  }
  const parent = JSON.parse(fs.readFileSync(parentFile, 'utf8'));
  if (parent.id !== options.mcVersion) throw new GameError('La descripción de la versión no corresponde a Minecraft ' + options.mcVersion + '.');
  const version = mergeVersions(child, parent);
  if (typeof version.mainClass !== 'string' || !/^[A-Za-z0-9_.$]+$/.test(version.mainClass)) {
    throw new GameError('La versión no indica su clase principal.');
  }

  step('Descargando Minecraft');
  const clientJar = path.join(versionsDir, options.mcVersion, options.mcVersion + '.jar');
  const client = parent.downloads && parent.downloads.client;
  if (!client || typeof client.url !== 'string') throw new GameError('La versión de Minecraft no indica de dónde descargar el juego.');
  await ensureFile(clientJar, client.url, client.sha1 || '', sources);
  emit({ type: 'progress', done: 1, total: 1 });

  step('Descargando bibliotecas');
  const librariesDir = path.join(minecraftDir, 'libraries');
  const libraries = collectLibraries(version, env);
  await runPool(libraries, 12, (library) => ensureFile(path.join(librariesDir, library.path), library.url, library.sha1, sources),
    (done, total) => emit({ type: 'progress', done, total }));

  step('Descargando recursos del juego');
  const assetsDir = path.join(minecraftDir, 'assets');
  const index = version.assetIndex;
  if (!index || typeof index.url !== 'string' || !/^[A-Za-z0-9._-]+$/.test(String(index.id))) {
    throw new GameError('La versión de Minecraft no indica sus recursos.');
  }
  const indexFile = path.join(assetsDir, 'indexes', index.id + '.json');
  await ensureFile(indexFile, index.url, index.sha1 || '', sources);
  const objects = Object.values(JSON.parse(fs.readFileSync(indexFile, 'utf8')).objects || {});
  const hashes = Array.from(new Set(objects.map((o) => o && o.hash).filter((h) => /^[0-9a-f]{40}$/.test(String(h)))));
  await runPool(hashes, 16, (hash) => {
    const target = path.join(assetsDir, 'objects', hash.slice(0, 2), hash);
    if (isFile(target)) return Promise.resolve(); // el nombre ya es su SHA-1; se comprueba al descargar
    return ensureFile(target, sources.assets + '/' + hash.slice(0, 2) + '/' + hash, hash, sources);
  }, (done, total) => emit({ type: 'progress', done, total }));

  step('Preparando Java');
  const component = version.javaVersion && version.javaVersion.component;
  if (typeof component !== 'string' || !/^[a-z0-9-]+$/.test(component)) throw new GameError('La versión de Minecraft no indica qué Java necesita.');
  const java = await ensureJava(component, gameDir, env, sources, emit);

  const nativesDir = path.join(gameDir, 'natives');
  for (const sub of ['java', 'jna', 'lwjgl', 'netty']) fs.mkdirSync(path.join(nativesDir, sub), { recursive: true });
  const separator = env.platform === 'win32' ? ';' : ':';
  const classpath = libraries.map((library) => path.join(librariesDir, library.path)).concat([clientJar]).join(separator);

  return { java, version, classpath, separator, nativesDir, librariesDir, assetsDir, clientJar };
}

/** Memoria y ajustes de Java: los que recomienda la version, con la memoria elegida si hay una. */
function memoryArguments(version, env, ramGb) {
  const defaults = expandArguments(version.arguments['default-user-jvm'], env, {})
    .filter((argument) => /^-X/.test(argument));
  if (ramGb > 0) return defaults.filter((argument) => !/^-Xm[sx]/.test(argument)).concat(['-Xmx' + ramGb + 'G']);
  return defaults.some((argument) => /^-Xmx/.test(argument)) ? defaults : defaults.concat(['-Xmx2G']);
}

/** Argumentos completos de Java. `account` = { name, uuid, accessToken }. */
function buildArguments(prepared, options, account) {
  const { version } = prepared;
  if (!account || !account.accessToken || !account.uuid || !account.name) {
    throw new GameError('Hace falta una sesión de Minecraft para abrir el juego.');
  }
  const env = Object.assign({}, options.env, { features: {} });
  const values = {
    natives_directory: prepared.nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath: prepared.classpath,
    classpath_separator: prepared.separator,
    library_directory: prepared.librariesDir,
    auth_player_name: account.name,
    version_name: options.fabricVersionId,
    game_directory: options.gameDir,
    assets_root: prepared.assetsDir,
    assets_index_name: String(version.assetIndex.id),
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken,
    clientid: '',
    auth_xuid: '',
    user_type: 'msa',
    version_type: String(version.type || 'release'),
    user_properties: '{}',
  };
  const jvm = expandArguments(version.arguments.jvm, env, values);
  const game = expandArguments(version.arguments.game, env, values);
  const all = memoryArguments(version, env, Number(options.ramGb) || 0).concat(jvm, [version.mainClass], game);
  const unresolved = all.find((argument) => /\$\{[A-Za-z_]+\}/.test(argument));
  if (unresolved) throw new GameError('argumento de arranque sin resolver: ' + unresolved.split(account.accessToken).join('***'));
  return all;
}

/**
 * Arranca el juego. Devuelve una promesa que se resuelve cuando Java ha arrancado
 * (o falla si no arranca), con { child, exited: Promise<{code, tail}> }.
 */
function launch(prepared, options, account) {
  const args = buildArguments(prepared, options, account);
  return new Promise((resolve, reject) => {
    let child;
    try {
      fs.mkdirSync(options.gameDir, { recursive: true });
      child = spawn(prepared.java, args, { cwd: options.gameDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
    } catch (error) {
      reject(new GameError('No se pudo iniciar Java: ' + error.message));
      return;
    }
    const tail = [];
    const addLine = (line) => {
      if (!line.trim()) return;
      tail.push(line.split(account.accessToken).join('***').slice(0, 300));
      if (tail.length > 25) tail.shift();
    };
    // Ultimas lineas de salida, por si el juego se cierra con error. Se juntan los trozos
    // por lineas completas, para tapar la sesion aunque llegue partida. Nunca se guarda en disco.
    const reader = () => {
      let pending = '';
      return {
        data(chunk) {
          const lines = (pending + chunk.toString('utf8')).split(/\r?\n/);
          pending = lines.pop().slice(-8192);
          lines.forEach(addLine);
        },
        end() { addLine(pending); pending = ''; },
      };
    };
    const out = reader();
    const err = reader();
    child.stdout.on('data', out.data);
    child.stderr.on('data', err.data);
    child.stdout.on('end', out.end);
    child.stderr.on('end', err.end);
    child.stdout.on('error', () => {});
    child.stderr.on('error', () => {});
    const exited = new Promise((done) => child.on('close', (code, signal) => done({ code, signal, tail: tail.slice() })));
    child.once('error', (error) => reject(new GameError('No se pudo iniciar Java: ' + error.message)));
    child.once('spawn', () => resolve({ child, exited }));
  });
}

module.exports = {
  SOURCES, GameError,
  prepare, buildArguments, launch,
  rulesAllow, mavenPath, collectLibraries, mergeVersions, expandArguments, javaPlatformKey, javaExecutable, checkUrl,
  compareVersions, memoryArguments,
};
