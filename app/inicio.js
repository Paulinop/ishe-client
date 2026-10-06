'use strict';
// Arranque de Ishe Client.
//
// Decide que copia del client se usa: la que vino con el instalador, o una
// version mas nueva que el actualizador haya descargado. Una version descargada
// solo se usa si su firma corresponde a la clave del creador y cada archivo
// coincide con su SHA-256; si no arranca, se vuelve a la que funcionaba.
//
// Este archivo nunca se actualiza solo: es la parte fija que comprueba al resto.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const paquete = require('./core/paquete');
const versiones = require('./core/versiones');
const PUBLIC_KEY = require('./core/clave-publica');

const BUNDLED = __dirname;
const FORCE_BUNDLED_FLAG = '--ishe-instalada'; // arranque de emergencia con la copia instalada
// El modo de pruebas solo existe si el archivo de pruebas esta en la copia instalada;
// la version que se reparte no lo incluye.
const TESTING = Boolean(process.env.ISHE_TEST_OUT) && fs.existsSync(path.join(BUNDLED, 'test-hooks.js'));
if (TESTING && process.env.ISHE_TEST_USER_DATA) app.setPath('userData', process.env.ISHE_TEST_USER_DATA);

function versionOf(dir) {
  try {
    const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    return paquete.validVersion(version) ? version : '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

function start() {
  const bundledVersion = versionOf(BUNDLED);
  const updatesRoot = path.join(app.getPath('userData'), 'actualizaciones');
  const forceBundled = process.argv.includes(FORCE_BUNDLED_FLAG);
  let activeDir = BUNDLED;
  let fellBack = '';
  let confirmed = false;

  /** Devuelve false si no se pudo escribir (disco lleno, carpeta protegida...). */
  function save(state) {
    try {
      versiones.writeState(updatesRoot, state);
      return true;
    } catch (_) {
      return false;
    }
  }

  const state = versiones.readState(updatesRoot);

  /** La version anotada no vale: se pasa a la anterior que funcionaba, o a la instalada. */
  function stepBack(markBad) {
    if (markBad && state.version) {
      if (!state.malas.includes(state.version)) state.malas.push(state.version);
      fellBack = state.version;
      state.fallo = state.version;
    }
    state.version = state.anterior;
    state.confirmada = Boolean(state.anterior);
    state.anterior = '';
    state.intentos = 0;
  }

  let changed = false;
  if (state.fallo) fellBack = state.fallo; // fallo en el arranque anterior: se avisa ahora
  for (let round = 0; round < 2 && state.version && !forceBundled; round++) {
    const dir = path.join(updatesRoot, state.version);
    const newer = paquete.compareVersions(state.version, bundledVersion) > 0 && !state.malas.includes(state.version);
    if (newer && !state.confirmada && state.intentos >= 2) {
      stepBack(true); // se intento dos veces y no llego a abrirse: no se vuelve a usar ni a descargar
      changed = true;
      continue;
    }
    if (!newer) {
      stepBack(false); // la instalada ya es igual o mas nueva
      changed = true;
      continue;
    }
    if (!paquete.verifyDir(dir, state.version, PUBLIC_KEY)) {
      // Sus archivos no coinciden con la firma. Si ya habia funcionado, se podra volver a
      // descargar; si nunca llego a usarse, no se insiste con ella.
      stepBack(!state.confirmada);
      changed = true;
      continue;
    }
    if (!state.confirmada) {
      state.intentos += 1;
      changed = true;
    }
    activeDir = dir;
    break;
  }
  if (activeDir === BUNDLED && state.version && !forceBundled) {
    state.version = '';
    state.confirmada = false;
    state.anterior = '';
    state.intentos = 0;
    changed = true;
  }
  if (state.fallo && !forceBundled) {
    state.fallo = ''; // el aviso se muestra en este arranque
    changed = true;
  }
  let writable = true;
  if (changed) {
    writable = save(state);
    if (writable) versiones.cleanup(updatesRoot, [state.version, state.anterior]);
  }
  // Si no se puede anotar nada, no se arriesga con una version descargada sin confirmar.
  if (!writable && activeDir !== BUNDLED && !state.confirmada) activeDir = BUNDLED;
  const activeVersion = activeDir === BUNDLED ? bundledVersion : state.version;

  function restart(extraArgs) {
    // En pruebas no se relanza: quien prueba vuelve a abrir la aplicacion.
    if (!TESTING) {
      const args = process.argv.slice(1).filter((arg) => arg !== FORCE_BUNDLED_FLAG).concat(extraArgs || []);
      app.relaunch({ args });
    }
    app.exit(0);
  }

  /** La version descargada en uso no funciona: se marca y se reinicia con la que funcionaba. */
  let givingUp = false;
  function giveUp() {
    if (givingUp || confirmed || activeDir === BUNDLED) return;
    givingUp = true;
    stepBack(true);
    // Si no se puede anotar el fallo, el reinicio usa la copia instalada sin leer el registro.
    restart(save(state) ? [] : [FORCE_BUNDLED_FLAG]);
  }

  global.__ishe = {
    bundledDir: BUNDLED,
    bundledVersion,
    activeDir,
    version: activeVersion,
    updatesRoot,
    publicKey: PUBLIC_KEY,
    testing: TESTING,
    fellBackFrom: fellBack,
    restart: () => restart([]),
    /** La ventana ya funciona: la version en uso se da por buena. */
    confirm() {
      if (confirmed) return;
      confirmed = true;
      if (activeDir === BUNDLED) return;
      process.removeListener('uncaughtException', giveUp);
      process.removeListener('unhandledRejection', giveUp);
      const now = versiones.readState(updatesRoot);
      if (now.version === activeVersion && !now.confirmada) {
        now.confirmada = true;
        now.intentos = 0;
        now.anterior = ''; // la nueva funciona: la anterior ya no hace falta
        save(now);
      }
      // Se conservan la version en uso y, si la hay, la que espera al siguiente arranque.
      versiones.cleanup(updatesRoot, [activeVersion, now.version, now.anterior]);
    },
  };

  if (activeDir !== BUNDLED && !state.confirmada) {
    // Primera vez que se usa esta version: si falla al arrancar o su ventana no llega a
    // funcionar en un tiempo razonable, se vuelve atras sin que el usuario tenga que hacer nada.
    process.on('uncaughtException', giveUp);
    process.on('unhandledRejection', giveUp);
    const wait = (TESTING && Number(process.env.ISHE_TEST_WATCHDOG_MS)) || 45000;
    app.whenReady().then(() => setTimeout(giveUp, wait));
  }

  try {
    require(path.join(activeDir, 'main.js'));
  } catch (error) {
    if (activeDir === BUNDLED) throw error;
    giveUp();
  }
}

// Una segunda copia abierta a la vez no decide nada: main.js de la primera recibe el aviso.
if (!app.requestSingleInstanceLock()) app.quit(); else start();
