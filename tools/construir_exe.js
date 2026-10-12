'use strict';
// Arma "Instalar Reshem Client.exe" (Windows): un programa pequeno (compilado con el csc que ya trae Windows, .NET Framework 4) que lleva
// dentro dist/IsheClient-Launcher-Windows.zip y lo instala igual que el .bat. Hay que correr antes:  node tools/construir.js
// uso:  node tools/construir_exe.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const zip = path.join(ROOT, 'dist', 'IsheClient-Launcher-Windows.zip');
const salida = path.join(ROOT, 'dist', 'Instalar-Reshem-Client.exe');
const csc = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';
if (!fs.existsSync(zip)) { console.error('Falta ' + zip + ' (corre antes node tools/construir.js)'); process.exit(1); }
if (!fs.existsSync(csc)) { console.error('No encuentro csc.exe de .NET Framework'); process.exit(1); }
const icono = path.join(ROOT, 'dist', 'win', 'app', 'assets', 'icon.ico');
execFileSync(csc, ['/nologo', '/target:exe', '/optimize+', '/out:' + salida, '/win32icon:' + icono,
  '/resource:' + zip + ',paquete.zip', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
  path.join(ROOT, 'instalador', 'win', 'exe', 'Instalar.cs')], { stdio: 'inherit' });
console.log('listo: ' + salida + ' (' + Math.round(fs.statSync(salida).size / 1024) + ' KB)');
