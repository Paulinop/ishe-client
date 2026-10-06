'use strict';
// Prueba de humo con la ventana REAL de Electron (Windows, Mac o Linux): abre Ishe Client desde el codigo
// de app/ con datos aislados (no toca tu sesion ni tu Minecraft), recorre las tres secciones, guarda capturas
// y avisa si la ventana tiene errores de consola.
//
// Uso:  node tools/prueba_ventana.js "<carpeta del motor Electron>" app [carpeta de capturas]
// Ejemplo en Windows:  node tools/prueba_ventana.js "%LOCALAPPDATA%\IsheClient" app out-ventana
// La carpeta del motor es la de "Ishe Client.exe" (o electron.exe): se copia a una carpeta temporal.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const [engineDir, appDirArg, outArg] = process.argv.slice(2);
if (!engineDir || !appDirArg) {
  console.error('Uso: node tools/prueba_ventana.js "<carpeta del motor Electron>" app [carpeta de capturas]');
  process.exit(2);
}
const appDir = path.resolve(appDirArg);
const outDir = path.resolve(outArg || 'out-ventana');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-ventana-'));
const engine = path.join(work, 'motor');
const data = path.join(work, 'datos');

let failed = 0;
function check(ok, text) {
  console.log((ok ? '  ok   ' : '  FAIL ') + text);
  if (!ok) failed += 1;
}

fs.cpSync(engineDir, engine, { recursive: true });
const exeName = fs.readdirSync(engine).find((n) => /^(Ishe Client|electron)(\.exe)?$/i.test(n));
if (!exeName) { console.error('No encuentro Ishe Client.exe ni electron en ' + engineDir); process.exit(2); }
const resources = path.join(engine, 'resources');
fs.rmSync(path.join(resources, 'app'), { recursive: true, force: true });
fs.cpSync(appDir, path.join(resources, 'app'), { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(path.join(outDir, 'result.json'), { force: true });

const steps = ['shot:inicio', 'dump:inicio', 'view:mods', 'shot:mods', 'view:ajustes', 'shot:ajustes', 'dump:ajustes', 'view:inicio'];
const run = spawnSync(path.join(engine, exeName), ['--user-data-dir=' + data], {
  env: Object.assign({}, process.env, {
    ISHE_TEST_OUT: outDir,
    ISHE_TEST_GAME_DIR: path.join(work, 'juego'),
    ISHE_TEST_MINECRAFT_DIR: path.join(work, 'minecraft'),
    ISHE_TEST_STEPS: JSON.stringify(steps),
  }),
  timeout: 120000,
  stdio: 'ignore',
});

const resultFile = path.join(outDir, 'result.json');
check(fs.existsSync(resultFile), 'la ventana arranco y termino la prueba');
if (fs.existsSync(resultFile)) {
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  check(result.errors.length === 0, 'sin errores en la ventana' + (result.errors.length ? ': ' + result.errors.join(' | ').slice(0, 400) : ''));
  for (const name of ['inicio', 'mods', 'ajustes']) check(fs.existsSync(path.join(outDir, name + '.png')), 'captura de ' + name);
}
fs.rmSync(work, { recursive: true, force: true });
console.log('\n' + (failed ? failed + ' failed' : 'todo bien') + ' (capturas en ' + outDir + ')');
process.exit(failed ? 1 : 0);
