'use strict';
// Instala Fabric y los mods de Reshem dentro de la carpeta .minecraft del launcher oficial (lo ejecuta instalar-mods.ps1 con Electron como "Node").
// uso: electron instalar-mods.js --minecraft-dir DIR
const fs = require('fs');
const path = require('path');
const installer = require('./app/core/installer');
const clavePublica = require('./app/core/clave-publica');

const argumentos = process.argv.slice(2);
const dir = argumentos[argumentos.indexOf('--minecraft-dir') + 1];
if (!dir || !path.isAbsolute(dir)) {
  console.log('Falta la carpeta de Minecraft.');
  process.exit(1);
}

(async () => {
  try {
    const icono = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'app', 'assets', 'icon-64.png')).toString('base64');
    const resultado = await installer.install({ minecraftDir: dir, gameDir: dir, icon: icono, publicKey: clavePublica }, (evento) => {
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
