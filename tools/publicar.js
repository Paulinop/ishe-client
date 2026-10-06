'use strict';
// Crea la actualizacion firmada de la version que hay en app/package.json y, con --subir,
// la publica en la pagina de versiones del proyecto en GitHub. Los Ishe Client instalados
// la encuentran solos al abrirse.
//
// uso:
//   node tools/publicar.js --clave <ruta a la clave .pem> [--notas "que cambio"] [--subir]
//
//   --clave   la clave privada de actualizaciones (o variable ISHE_CLAVE). Vive FUERA del
//             proyecto: nunca se copia dentro ni se sube a GitHub.
//   --notas   texto que sale en Novedades. Si falta, se usa la tarjeta "Versión X" de
//             app/noticias.json.
//   --subir   publica en GitHub con la herramienta "gh" (hay que haber hecho "gh auth login").
//             Sin --subir solo deja los archivos en dist/actualizacion/ para revisarlos.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const construir = require('./construir');

const REPO = 'Paulinop/ishe-client';

function argument(name) {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error('ERROR: ' + message);
  process.exit(1);
}

function main() {
  const keyFile = argument('clave') || process.env.ISHE_CLAVE;
  const upload = process.argv.includes('--subir');
  if (!keyFile) fail('falta --clave <ruta a la clave .pem> (o la variable ISHE_CLAVE).');
  if (!fs.existsSync(keyFile)) fail('no encuentro la clave en ' + keyFile);
  if (path.resolve(keyFile).startsWith(construir.ROOT + path.sep)) {
    fail('la clave esta dentro de la carpeta del proyecto. Muevela fuera: no debe poder subirse a GitHub.');
  }
  const privateKeyPem = fs.readFileSync(keyFile, 'utf8');

  const built = construir.build();
  const version = built.version;
  const paquete = require(path.join(built.appDir, 'core', 'paquete.js'));
  const creator = require(path.join(built.appDir, 'core', 'creator.js'));
  const publicKeyPem = require(path.join(built.appDir, 'core', 'clave-publica.js'));
  if (!paquete.validVersion(version)) fail('app/package.json tiene una version rara: ' + version);

  let notes = argument('notas');
  if (!notes) {
    const news = JSON.parse(fs.readFileSync(path.join(built.appDir, 'noticias.json'), 'utf8'));
    const card = news.find((item) => item && String(item.titulo || '').startsWith('Versión ' + version));
    notes = card ? String(card.texto || '') : '';
  }
  if (!notes) fail('faltan las notas: usa --notas "que cambio" o pon una tarjeta "Versión ' + version + '" en app/noticias.json.');

  if (upload) {
    let exists = true;
    try {
      execFileSync('gh', ['release', 'view', 'v' + version, '--repo', REPO], { stdio: 'ignore' });
    } catch (_) {
      exists = false;
    }
    if (exists) fail('la version ' + version + ' ya esta publicada. Sube el numero en app/package.json; un numero publicado no se reutiliza.');
  }

  // El creador exige que la version nueva sea mayor que la de la copia de partida:
  // se parte de una copia temporal marcada como 0.0.0.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ishe-publicar-'));
  fs.cpSync(built.appDir, copy, { recursive: true });
  const pkgFile = path.join(copy, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.version = '0.0.0';
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  const result = creator.build({
    codeDir: copy,
    extrasDir: path.join(copy, 'extras'),
    version,
    notes,
    theme: JSON.parse(fs.readFileSync(path.join(copy, 'tema.json'), 'utf8')),
    privateKeyPem,
    publicKeyPem,
    today: new Date().toISOString().slice(0, 10),
  });
  fs.rmSync(copy, { recursive: true, force: true });

  const out = path.join(construir.DIST, 'actualizacion');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const name of result.upload) fs.writeFileSync(path.join(out, name), result.files.get(name));

  // Comprobacion final con el mismo codigo que usan los Ishe Client instalados.
  const manifest = paquete.verify(fs.readFileSync(path.join(out, paquete.MANIFEST_NAME), 'utf8'), publicKeyPem);
  const bundle = fs.readFileSync(path.join(out, paquete.bundleName(version)));
  if (!manifest || manifest.version !== version || paquete.sha256(bundle) !== manifest.paquete.sha256) fail('la actualizacion creada no pasa su propia comprobacion.');
  const files = paquete.unpack(bundle);
  for (const [name, hash] of Object.entries(manifest.archivos)) {
    if (!files.has(name) || paquete.sha256(files.get(name)) !== hash) fail('el paquete no coincide con el aviso en ' + name);
  }
  for (const name of fs.readdirSync(out)) {
    if (fs.readFileSync(path.join(out, name)).includes('PRIVATE KEY-----')) fail('la clave privada aparece en ' + name);
  }

  console.log('Actualizacion ' + version + ' creada y comprobada en dist/actualizacion/ (' + Math.round(bundle.length / 1024) + ' KB el paquete).');
  console.log('Notas: ' + notes);
  if (!upload) {
    console.log('No se publico nada. Para publicarla: repite el comando con --subir');
    return;
  }
  const assets = result.upload.map((name) => path.join(out, name)).concat([built.winZip, built.macZip]);
  execFileSync('gh', ['release', 'create', 'v' + version].concat(assets, [
    '--repo', REPO, '--title', 'Ishe Client ' + version, '--notes', notes, '--latest',
  ]), { stdio: 'inherit' });
  console.log('Publicada. Al abrir Ishe Client, la version ' + version + ' se descarga sola.');
}

main();
