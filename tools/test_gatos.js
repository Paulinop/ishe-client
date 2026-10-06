'use strict';
// Comprueba que todo lo que app.js usa de los gatitos tiene su dibujo en style.css:
// cada pelaje de PELAJES tiene colores (.pelo-<nombre>) y cada pose de POSES tiene sus capas (.st-<pose> .l-<capa>).
// Uso: node tools/test_gatos.js app
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || 'app');
const js = fs.readFileSync(path.join(appDir, 'renderer', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'renderer', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(appDir, 'renderer', 'index.html'), 'utf8');

let failed = 0;
let total = 0;
function check(ok, text) {
  total += 1;
  if (!ok) { failed += 1; console.log('  FAIL ' + text); }
}

const pelajes = [...js.match(/const PELAJES = \[([\s\S]*?)\];/)[1].matchAll(/\['([a-z]+)'/g)].map((m) => m[1]);
const poses = [...js.match(/const POSES = \[([^\]]*)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
const layers = [...js.match(/for \(const layer of \[([^\]]*)\]/)[1].matchAll(/'([a-z0-9])'/g)].map((m) => m[1]);
console.log('  ' + pelajes.length + ' pelajes, ' + poses.length + ' poses, ' + layers.length + ' capas');
check(pelajes.length >= 10 && poses.length >= 10 && layers.length === 13, 'las listas de app.js tienen el tamano esperado');

for (const pelaje of pelajes) {
  const rule = css.match(new RegExp('\\.pelo-' + pelaje + ' \\{([^}]*)\\}'));
  check(Boolean(rule), 'pelaje ' + pelaje + ' tiene colores');
  if (rule) for (const variable of ['--body', '--dark', '--light', '--eye', '--pupil', '--ear', '--nose']) check(rule[1].includes(variable + ':'), 'pelaje ' + pelaje + ' define ' + variable);
}
for (const pose of poses.concat(['situp'])) {
  check(css.includes('.st-' + pose + ' .sprite i {'), 'pose ' + pose + ' tiene su animacion');
  for (const layer of layers) check(css.includes('.st-' + pose + ' .l-' + layer + ' { mask-image:'), 'pose ' + pose + ' tiene la capa ' + layer);
}
for (const layer of layers) check(css.includes('.l-' + layer + ' { --c:'), 'la capa ' + layer + ' tiene color');
// todos los gatitos del HTML usan una pose y un pelaje que existen
for (const match of html.matchAll(/class="(gato[^"]*)"/g)) {
  const classes = match[1].split(' ');
  const pose = classes.find((c) => c.startsWith('st-'));
  const pelo = classes.find((c) => c.startsWith('pelo-'));
  check(Boolean(pose) && css.includes('.' + pose + ' .sprite i {'), 'el HTML usa una pose que existe (' + match[1] + ')');
  check(Boolean(pelo) && pelajes.includes(pelo.slice(5)), 'el HTML usa un pelaje que existe (' + match[1] + ')');
}

console.log('\n' + (failed ? failed + ' failed' : total + '/' + total + ' checks passed'));
process.exit(failed ? 1 : 0);
