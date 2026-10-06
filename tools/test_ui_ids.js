'use strict';
// Comprueba que cada elemento que app.js busca por id existe en index.html, y que los ids no se repiten.
// Sin esto, quitar un bloque del HTML rompe el arranque de la ventana sin que nada lo avise.
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || 'app');
const html = fs.readFileSync(path.join(appDir, 'renderer', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(appDir, 'renderer', 'app.js'), 'utf8');

let failed = 0;
function check(ok, text) {
  console.log((ok ? '  ok   ' : '  FAIL ') + text);
  if (!ok) failed += 1;
}

const wanted = [...new Set([...js.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))];
const present = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const missing = wanted.filter((id) => !present.includes(id));
check(wanted.length > 40, 'app.js usa ' + wanted.length + ' elementos por id');
check(missing.length === 0, 'todos existen en index.html' + (missing.length ? ' (faltan: ' + missing.join(', ') + ')' : ''));
const repeated = present.filter((id, i) => present.indexOf(id) !== i);
check(repeated.length === 0, 'ningun id esta repetido' + (repeated.length ? ' (' + repeated.join(', ') + ')' : ''));
const classes = ['hero', 'play', 'nav-item', 'view', 'account'];
check(classes.every((c) => html.includes('class="' + c) || html.includes(' ' + c + '"')), 'las clases principales siguen en el HTML');

console.log('\n' + (failed ? failed + ' failed' : (wanted.length + 3) + '/' + (wanted.length + 3) + ' checks passed'));
process.exit(failed ? 1 : 0);
