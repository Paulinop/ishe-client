'use strict';
// Checks for the "open the official launcher" decisions, with the system calls replaced by recorders.
const assert = require('assert');
const path = require('path');
const platform = require(path.resolve(process.argv[2], 'core', 'platform.js'));
const installer = require(path.resolve(process.argv[2], 'core', 'installer.js'));
let n = 0;
const ok = (cond, what) => { n++; assert.ok(cond, what); console.log('  ok   ' + what); };

const env = { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files', APPDATA: 'C:\\Users\\Guishe\\AppData\\Roaming' };
let calls = [];
const start = (command, args) => calls.push([command, args]);

calls = [];
let r = platform.openOfficialLauncher('win32', env, { exists: (p) => p === 'C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe', start });
ok(r === 'opened' && calls.length === 1 && calls[0][0].endsWith('MinecraftLauncher.exe'), 'Windows: classic launcher found -> started directly');

calls = [];
r = platform.openOfficialLauncher('win32', env, { exists: (p) => p === 'C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe', start });
ok(r === 'opened' && calls[0][0] === 'C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe', 'Windows: Xbox-app launcher found -> started directly');

calls = [];
r = platform.openOfficialLauncher('win32', env, { exists: () => false, start });
ok(r === 'tried' && calls[0][0] === 'explorer.exe' && calls[0][1][0] === platform.STORE_APP_ID, 'Windows: nothing found -> asks Windows for the Microsoft Store launcher');

calls = [];
r = platform.openOfficialLauncher('darwin', {}, { exists: () => false, start });
ok(r === 'tried' && calls[0][0] === 'open' && calls[0][1].join(' ') === '-a Minecraft', 'Mac: asks macOS to open the Minecraft app');

r = platform.openOfficialLauncher('win32', env, { exists: () => false, start: () => { throw new Error('boom'); } });
ok(r === 'failed', 'a failure to start is reported, not thrown');
ok(platform.openOfficialLauncher('linux', {}, { exists: () => false, start }) === 'failed', 'unsupported system -> reported as failed');
ok(platform.isLauncherRunning('linux') === false, 'launcher detection never throws');

let d = installer.defaultDirs('win32', env, 'C:\\Users\\Guishe');
ok(d.minecraftDir === 'C:\\Users\\Guishe\\AppData\\Roaming\\.minecraft' && d.gameDir === 'C:\\Users\\Guishe\\AppData\\Roaming\\.ishe-client', 'Windows folders: %APPDATA%\\.minecraft and %APPDATA%\\.ishe-client (same as the installer)');
d = installer.defaultDirs('win32', {}, 'C:\\Users\\Guishe');
ok(d.gameDir === 'C:\\Users\\Guishe\\AppData\\Roaming\\.ishe-client', 'Windows folders without APPDATA set');
d = installer.defaultDirs('darwin', {}, '/Users/guishe');
ok(d.minecraftDir === '/Users/guishe/Library/Application Support/minecraft' && d.gameDir === '/Users/guishe/Library/Application Support/ishe-client', 'Mac folders (same as the Mac installer)');
console.log('\n' + n + '/' + n + ' checks passed');
