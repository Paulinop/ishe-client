'use strict';
// Lo que depende del sistema operativo: detectar y abrir el launcher oficial.

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const STORE_APP_ID = 'shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft';

function isLauncherRunning(platform) {
  try {
    if (platform === 'win32') {
      const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
      return /"(MinecraftLauncher\.exe|Minecraft\.exe)"/i.test(out);
    }
    if (platform === 'darwin') {
      const out = execFileSync('pgrep', ['-f', 'Minecraft.app/Contents/MacOS'], { encoding: 'utf8', timeout: 8000 });
      return /\d/.test(out);
    }
  } catch (_) {
    return false; // pgrep sale con error cuando no hay coincidencias
  }
  return false;
}

// Rutas habituales del launcher oficial en Windows (instalador clasico y app de Xbox).
function windowsLauncherPaths(env) {
  const out = [];
  for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles]) {
    if (base) out.push(path.win32.join(base, 'Minecraft Launcher', 'MinecraftLauncher.exe'));
  }
  for (const drive of ['C:', 'D:', 'E:']) {
    out.push(path.win32.join(drive + '\\', 'XboxGames', 'Minecraft Launcher', 'Content', 'Minecraft.exe'));
  }
  return out;
}

/**
 * Intenta abrir el launcher oficial. Devuelve 'opened' si se lanzo un programa
 * conocido, 'tried' si se pidio al sistema que lo abra sin poder confirmarlo,
 * o 'failed' si no hay forma.
 */
function openOfficialLauncher(platform, env, deps) {
  const exists = (deps && deps.exists) || fs.existsSync;
  const start = (deps && deps.start) || ((command, args) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {});
    child.unref();
  });
  try {
    if (platform === 'win32') {
      for (const candidate of windowsLauncherPaths(env)) {
        if (exists(candidate)) { start(candidate, []); return 'opened'; }
      }
      start('explorer.exe', [STORE_APP_ID]); // version de Microsoft Store
      return 'tried';
    }
    if (platform === 'darwin') {
      start('open', ['-a', 'Minecraft']);
      return 'tried';
    }
  } catch (_) {
    return 'failed';
  }
  return 'failed';
}

module.exports = { isLauncherRunning, openOfficialLauncher, windowsLauncherPaths, STORE_APP_ID };
