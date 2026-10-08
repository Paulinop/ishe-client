'use strict';
// Crea el aviso firmado del mod Ishe y, con --subir, lo publica en la release fija "mods" del proyecto en
// GitHub. Los Reshem Client instalados lo encuentran solos la proxima vez que se pulsa Jugar.
//
// uso:
//   node tools/publicar_mod.js --jar <ruta al .jar del mod> --clave <ruta a la clave .pem> [--subir]
//
//   --jar     el .jar del mod Ishe (el de build/libs/ishe-X.Y.Z.jar, SIN "-sources").
//   --clave   la clave privada de actualizaciones (o variable ISHE_CLAVE). Vive FUERA del proyecto.
//   --subir   publica con "gh" (hay que haber hecho "gh auth login"). Sin --subir solo deja los archivos
//             en dist/mod/ para revisarlos.
//
// La version se lee del propio .jar (fabric.mod.json) y la version de Minecraft de su "depends".

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const REPO = 'Paulinop/ishe-client';
const TAG = 'mods';
const modishe = require(path.join(APP, 'core', 'modishe.js'));
const PUBLIC = require(path.join(APP, 'core', 'clave-publica.js'));

function argument(name) {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error('ERROR: ' + message);
  process.exit(1);
}

/** Lee un archivo de dentro de un .jar (zip) sin dependencias. */
function readFromZip(buffer, wanted) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('no es un .jar valido');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === wanted) {
      const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const raw = buffer.subarray(dataStart, dataStart + compressed);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function main() {
  const jarFile = argument('jar');
  const keyFile = argument('clave') || process.env.ISHE_CLAVE;
  const upload = process.argv.includes('--subir');
  if (!jarFile || !fs.existsSync(jarFile)) fail('falta --jar <ruta al .jar del mod> (o no existe).');
  if (/-sources\.jar$/i.test(jarFile)) fail('ese es el .jar de codigo fuente; usa el que no termina en "-sources".');
  if (!keyFile) fail('falta --clave <ruta a la clave .pem> (o la variable ISHE_CLAVE).');
  if (!fs.existsSync(keyFile)) fail('no encuentro la clave en ' + keyFile);
  if (path.resolve(keyFile).startsWith(ROOT + path.sep)) fail('la clave esta dentro de la carpeta del proyecto. Muevela fuera: no debe poder subirse a GitHub.');
  const privateKeyPem = fs.readFileSync(keyFile, 'utf8');

  const jar = fs.readFileSync(jarFile);
  const metaBuffer = readFromZip(jar, 'fabric.mod.json');
  if (!metaBuffer) fail('el .jar no trae fabric.mod.json: no parece un mod de Fabric.');
  const meta = JSON.parse(metaBuffer.toString('utf8'));
  if (meta.id !== 'ishe') fail('este .jar no es el mod "ishe" (id: ' + meta.id + ').');
  const version = String(meta.version || '');
  const range = String((meta.depends || {}).minecraft || '');
  const found = range.match(/(\d+\.\d+(?:\.\d+)?)/);
  if (!found) fail('no pude leer la version de Minecraft de fabric.mod.json (depends.minecraft = "' + range + '").');
  const minecraft = found[1];
  const installer = require(path.join(APP, 'core', 'installer.js'));
  if (minecraft !== installer.MC_VERSION) {
    fail('el mod es para Minecraft ' + minecraft + ' pero Reshem Client usa ' + installer.MC_VERSION + '. Compila el mod para ' + installer.MC_VERSION + ' o cambia la version del client.');
  }

  const archivo = 'ishe-' + version + '-mc' + minecraft + '.jar';
  const notice = { formato: modishe.FORMAT, tipo: 'mod', mod: 'ishe', version, minecraft, archivo, sha256: modishe.sha256(jar), tamano: jar.length };
  const text = modishe.sign(notice, privateKeyPem);

  // Comprobacion final con el mismo codigo que usan los Reshem Client instalados.
  let checked;
  try {
    checked = modishe.verify(text, PUBLIC, minecraft);
  } catch (_) {
    fail('la clave .pem no corresponde a la clave publica del client (app/core/clave-publica.js): usa la clave de Guishe.');
  }
  if (checked.otraVersion || checked.archivo !== archivo || checked.sha256 !== modishe.sha256(jar)) {
    fail('el aviso creado no pasa su propia comprobacion (la clave .pem no corresponde a la clave publica del client?).');
  }
  const out = path.join(ROOT, 'dist', 'mod');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, modishe.NOTICE_NAME), text);
  fs.writeFileSync(path.join(out, archivo), jar);
  for (const name of fs.readdirSync(out)) {
    if (fs.readFileSync(path.join(out, name)).includes('PRIVATE KEY-----')) fail('la clave privada aparece en ' + name);
  }
  console.log('Mod Ishe ' + version + ' para Minecraft ' + minecraft + ' listo y comprobado en dist/mod/ (' + Math.round(jar.length / 1024) + ' KB).');
  if (!upload) {
    console.log('No se publico nada. Para publicarlo: repite el comando con --subir');
    return;
  }
  const files = [path.join(out, modishe.NOTICE_NAME), path.join(out, archivo)];
  let exists = true;
  try {
    execFileSync('gh', ['release', 'view', TAG, '--repo', REPO], { stdio: 'ignore' });
  } catch (_) {
    exists = false;
  }
  if (!exists) {
    execFileSync('gh', ['release', 'create', TAG, '--repo', REPO, '--title', 'Mods de Reshem Client', '--notes', 'Mod Ishe para Reshem Client. No es una version del launcher: se actualiza solo.', '--latest=false'], { stdio: 'inherit' });
  }
  execFileSync('gh', ['release', 'upload', TAG].concat(files, ['--repo', REPO, '--clobber']), { stdio: 'inherit' });
  console.log('Publicado. La proxima vez que alguien pulse Jugar en Reshem Client, se baja el mod ' + version + '.');
}

main();
