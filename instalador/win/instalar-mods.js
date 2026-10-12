'use strict';
// Instala y mantiene al dia Fabric, los mods de Reshem, shaders y opciones dentro de .minecraft.
// Antes de instalar, consulta en GitHub si hay una lista de mods mas nueva firmada por el creador.
// uso: electron instalar-mods.js --minecraft-dir DIR
const fs = require('fs');
const path = require('path');
const clavePublica = require('./app/core/clave-publica');
const paquete = require('./app/core/paquete');
const updater = require('./app/core/updater');
const versiones = require('./app/core/versiones');

const argumentos = process.argv.slice(2);
const dir = argumentos[argumentos.indexOf('--minecraft-dir') + 1];
if (!dir || !path.isAbsolute(dir)) {
  console.log('Falta la carpeta de Minecraft.');
  process.exit(1);
}

async function resolveAppRoot(minecraftDir) {
  const bundledApp = path.join(__dirname, 'app');
  const bundledVersion = JSON.parse(fs.readFileSync(path.join(bundledApp, 'package.json'), 'utf8')).version;
  const updatesRoot = path.join(minecraftDir, '.reshem-actualizaciones');
  let activeRoot = bundledApp;
  let currentVersion = bundledVersion;

  const state = versiones.readState(updatesRoot);
  if (state.version && paquete.compareVersions(state.version, currentVersion) > 0) {
    const candidate = path.join(updatesRoot, state.version);
    if (paquete.verifyDir(candidate, state.version, clavePublica)) {
      activeRoot = candidate;
      currentVersion = state.version;
    }
  }

  try {
    const engineMajor = Number((process.versions.electron || '44').split('.')[0]) || 44;
    const checkResult = await updater.check({
      publicKey: clavePublica,
      currentVersion,
      updatesRoot,
      engineMajor,
    });
    if (checkResult.status === 'available') {
      console.log('   Actualizando catalogo de mods a la version ' + checkResult.version + '...');
      const downloaded = await updater.download({
        publicKey: clavePublica,
        updatesRoot,
        manifest: checkResult.manifest,
        envelope: checkResult.envelope,
        bundledExtrasDir: path.join(bundledApp, 'extras'),
        activeExtrasDir: path.join(activeRoot, 'extras'),
      });
      activeRoot = downloaded.dir;
    } else if (checkResult.status === 'ready') {
      activeRoot = path.join(updatesRoot, checkResult.version);
    }
  } catch (_) {
    // Si no se puede consultar la actualizacion del catalogo, se usa el que ya esta en disco.
  }
  return activeRoot;
}

(async () => {
  try {
    const appRoot = await resolveAppRoot(dir);
    const installer = require(path.join(appRoot, 'core', 'installer'));
    const game = require(path.join(appRoot, 'core', 'game'));
    try { game.fixOptions(dir); } catch (_) { }
    const iconoPath = path.join(__dirname, 'app', 'assets', 'icon-64.png');
    const icono = 'data:image/png;base64,' + fs.readFileSync(iconoPath).toString('base64');
    const resultado = await installer.install({ minecraftDir: dir, gameDir: dir, icon: icono, publicKey: clavePublica, profileOptional: true }, (evento) => {
      if (evento.type === 'step') console.log('\n== ' + evento.text);
      else if (evento.type === 'info') console.log('   ' + evento.text);
      else if (evento.type === 'problem') console.log('   AVISO: ' + evento.text);
    });
    process.exitCode = resultado.exitCode;
  } catch (error) {
    console.log('\n  La instalacion se detuvo:\n   ' + error.message);
    process.exitCode = 1;
  }
})();

