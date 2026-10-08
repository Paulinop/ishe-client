'use strict';
// Linea de comandos para probar la logica del launcher sin abrir la ventana.
// node core/cli.js --modrinth-api URL --fabric-meta URL --minecraft-dir DIR --game-dir DIR

const fs = require('fs');
const os = require('os');
const path = require('path');
const installer = require('./installer');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--no-pause') { out.noPause = true; continue; }
    if (key.startsWith('--') && i + 1 < argv.length) { out[key.slice(2)] = argv[++i]; }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirs = installer.defaultDirs(process.platform, process.env, os.homedir());
  const appDir = path.resolve(__dirname, '..');
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(appDir, 'assets', 'icon-64.png')).toString('base64');
  try {
    const result = await installer.install({
      modrinthApi: args['modrinth-api'],
      fabricMeta: args['fabric-meta'],
      minecraftDir: args['minecraft-dir'] || dirs.minecraftDir,
      gameDir: args['game-dir'] || dirs.gameDir,
      bundledDir: path.join(appDir, 'extras'),
      icon,
    }, (event) => {
      if (event.type === 'step') console.log('\n== ' + event.text);
      else if (event.type === 'info') console.log('   ' + event.text);
      else if (event.type === 'problem') console.log('   AVISO: ' + event.text);
    });
    console.log(result.exitCode === 0 ? '\n  Reshem Client quedo instalado.' : '\n  Reshem Client se instalo con avisos.');
    process.exitCode = result.exitCode;
  } catch (error) {
    console.log('\n  La instalacion se detuvo:\n   ' + error.message);
    console.log('\n  No se toco ningun mundo ni ningun otro perfil.');
    process.exitCode = 1;
  }
}

main();
