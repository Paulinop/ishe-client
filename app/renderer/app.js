'use strict';
// Interfaz de Ishe Client. Solo habla con el proceso principal a traves de
// window.ishe (ver preload.js); no tiene acceso al sistema.

const $ = (id) => document.getElementById(id);

// Nombre y categoria que se muestran para cada archivo de mod conocido.
const KNOWN_MODS = [
  [/^fabric-api/i, 'Fabric API', 'Base'],
  [/^sodium/i, 'Sodium', 'Rendimiento'],
  [/^lithium/i, 'Lithium', 'Rendimiento'],
  [/^ferritecore/i, 'FerriteCore', 'Rendimiento'],
  [/^fancymenu/i, 'FancyMenu', 'Menú'],
  [/^modmenu/i, 'Mod Menu', 'Menú'],
  [/^konkrete/i, 'Konkrete', 'Biblioteca'],
  [/^melody/i, 'Melody', 'Biblioteca'],
  [/^placeholder-api/i, 'Text Placeholder API', 'Biblioteca'],
  [/^e4steam/i, 'e4steam (corregido)', 'Amigos'],
];
const CATEGORY_ORDER = ['Rendimiento', 'Menú', 'Amigos', 'Base', 'Biblioteca', 'Otro'];

// Explicacion de cada motivo por el que puede fallar el inicio de sesion.
const REASON_TEXT = {
  network: ['Sin conexión con Microsoft', 'No hubo respuesta de los servidores de inicio de sesión. Revisa tu internet y vuelve a intentarlo.'],
  declined: ['Inicio de sesión cancelado', 'En la página de Microsoft se rechazó el acceso. Si fue sin querer, vuelve a pulsar Iniciar sesión.'],
  expired: ['El código caducó', 'Pulsa Iniciar sesión para obtener un código nuevo.'],
  'no-xbox-account': ['Esta cuenta no tiene perfil de Xbox', 'Entra una vez en xbox.com con esta cuenta de Microsoft para crear el perfil y vuelve a intentarlo.'],
  'xbox-region': ['Xbox Live no está disponible', 'Xbox Live no funciona en el país o región de esta cuenta.'],
  'xbox-adult-check': ['Falta verificar la edad', 'Esta cuenta necesita verificar la edad en xbox.com antes de poder jugar.'],
  'xbox-child': ['Cuenta de un menor', 'Un adulto tiene que añadir esta cuenta a su grupo familiar de Microsoft para que pueda jugar.'],
  'not-owned': ['Esta cuenta no tiene Minecraft', 'Ishe Client solo abre el juego con cuentas de Microsoft que tienen Minecraft: Java Edition. Se cerró la sesión.'],
  'session-expired': ['Tu sesión caducó', 'Pulsa Iniciar sesión para entrar otra vez con tu cuenta de Microsoft.'],
  unexpected: ['Algo no salió como se esperaba', 'Vuelve a intentarlo en unos minutos.'],
};
const PENDING_TEXT = 'Mojang todavía no ha aprobado Ishe Client para abrir el juego directamente. Hasta entonces, Jugar deja todo preparado y abre el launcher oficial.';

let state = null;
let running = false;
let loginOpen = false;
const exitedLaunches = new Set();

function bump(key) {
  document.body.dataset[key] = String(Number(document.body.dataset[key] || 0) + 1);
}

// ---- apariencia ----------------------------------------------------------------

const DEFAULT_BACKGROUND = '#0d0f16';

function rgbOf(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function hexOf(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function mix(hexA, hexB, amount) {
  const a = rgbOf(hexA);
  const b = rgbOf(hexB);
  return hexOf(a.map((v, i) => v + (b[i] - v) * amount));
}

function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pone en la ventana los colores y el logo indicados. */
function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty('--cyan', theme.color1);
  root.setProperty('--violet', theme.color2);
  // El texto de los botones de color se elige claro u oscuro para que se lea.
  root.setProperty('--on-accent', luminance(mix(theme.color1, theme.color2, 0.5)) > 0.3 ? '#0b0d14' : '#ffffff');
  const derived = { '--bg': theme.fondo, '--panel': mix(theme.fondo, '#ffffff', 0.04), '--panel-2': mix(theme.fondo, '#ffffff', 0.075),
    '--line': mix(theme.fondo, '#ffffff', 0.15), '--deep': mix(theme.fondo, '#000000', 0.25) };
  for (const [name, value] of Object.entries(derived)) {
    // Con el fondo original se dejan los tonos originales de la hoja de estilos.
    if (theme.fondo === DEFAULT_BACKGROUND) root.removeProperty(name); else root.setProperty(name, value);
  }
  const logo = $('brand-logo');
  const wanted = theme.logo || '../assets/logo.png';
  if (logo.getAttribute('src') !== wanted) logo.setAttribute('src', wanted);
  logo.classList.toggle('is-custom', Boolean(theme.logo));
  document.body.dataset.theme = [theme.color1, theme.color2, theme.fondo, theme.logo ? 'logo' : ''].join(',');
}

function renderAppearance() {
  $('theme-color1').value = state.theme.color1;
  $('theme-color2').value = state.theme.color2;
  $('theme-fondo').value = state.theme.fondo;
  $('theme-reset').disabled = !state.themeCustom;
}

function themeHint(text) {
  $('theme-hint').textContent = text;
}

function themeResult(result, okText) {
  if (!result) return;
  if (result.ok) {
    state.theme = result.theme;
    state.themeCustom = result.themeCustom;
    themeHint(okText);
  } else if (result.reason === 'light-background') {
    themeHint('Ese fondo es demasiado claro: el texto no se leería. Elige uno más oscuro.');
  } else if (result.reason === 'unreadable') {
    themeHint('No pude leer esa imagen. Prueba con un PNG o un JPG.');
  } else if (result.reason === 'too-big') {
    themeHint('Esa imagen es demasiado grande.');
  } else if (result.reason !== 'cancelled') {
    themeHint('No se pudo guardar el cambio.');
  }
  applyTheme(state.theme);
  renderAppearance();
  bump('themeDone');
}

// ---- version y actualizaciones --------------------------------------------------

function renderUpdate() {
  const update = state.update || { status: 'idle' };
  const texts = {
    idle: 'Se busca una versión nueva cada vez que abres Ishe Client.',
    checking: 'Buscando una versión nueva…',
    none: 'Tienes la última versión.',
    downloading: 'Descargando la versión ' + update.version + '…',
    ready: 'La versión ' + update.version + ' ya está descargada. Reinicia Ishe Client para usarla.' + (update.notes ? ' Novedades: ' + update.notes : ''),
    'needs-installer': 'La versión ' + update.version + ' necesita instalar Ishe Client de nuevo con el instalador más reciente.',
    error: update.detail === 'network'
      ? 'No pude buscar versiones nuevas: no hubo conexión con GitHub.'
      : 'No pude actualizar: ' + (update.detail || 'error desconocido') + '.',
  };
  $('version-line').textContent = 'Ishe Client ' + state.appVersion + ' · motor Electron ' + state.engine;
  $('update-status').textContent = texts[update.status] || texts.idle;
  $('update-check').disabled = update.status === 'checking' || update.status === 'downloading';
  $('update-restart').hidden = update.status !== 'ready';
  const pill = $('update-pill');
  pill.hidden = update.status !== 'ready';
  pill.textContent = 'Versión ' + update.version + ' lista · Reiniciar';
  document.body.dataset.updateStatus = update.status;
  renderUpdateBanner(update);
}

// Aviso grande arriba de todo cuando sale una version nueva; "Despues" lo oculta hasta el proximo arranque.
let bannerDismissed = '';

function renderUpdateBanner(update) {
  const showing = ['downloading', 'ready', 'needs-installer'].includes(update.status)
    && bannerDismissed !== update.status + ':' + update.version;
  $('update-banner').hidden = !showing;
  if (!showing) return;
  const ready = update.status === 'ready';
  $('update-banner-title').textContent = 'Hay una actualización: versión ' + update.version;
  $('update-banner-detail').textContent = ready
    ? (update.notes || 'Reinicia Ishe Client para usarla.')
    : update.status === 'downloading'
      ? 'Se está descargando, te avisamos cuando esté lista.'
      : 'Hay que instalar Ishe Client de nuevo con el instalador más reciente.';
  $('update-banner-restart').hidden = !ready;
}

async function restartForUpdate() {
  const accepted = await window.ishe.updateRestart();
  if (!accepted) {
    setStatus('Cierra Minecraft (o espera a que termine la preparación) y vuelve a pulsar Reiniciar.', 'warn');
    showView('inicio');
  }
}

// ---- herramientas del creador -----------------------------------------------------

function renderCreator() {
  const info = state.creator || {};
  $('creator-key-status').textContent = info.keyLoaded
    ? 'Clave cargada: puedes crear actualizaciones.'
    : 'Falta cargar la clave de actualizaciones (el archivo .pem que guardaste).';
  $('creator-key').textContent = info.keyLoaded ? 'Olvidar la clave en este equipo' : 'Cargar mi clave…';
  $('creator-build').disabled = !info.keyLoaded;
  if (!$('creator-version').value) $('creator-version').value = info.nextVersion || '';
}

async function creatorKeyAction() {
  if (state.creator && state.creator.keyLoaded) {
    applyState(await window.ishe.creatorForgetKey());
    $('creator-result').textContent = 'Clave olvidada en este equipo. El archivo .pem que guardaste sigue siendo tuyo.';
  } else {
    const result = await window.ishe.creatorLoadKey();
    if (result && result.ok) {
      applyState(result.state);
      $('creator-result').textContent = result.saved
        ? 'Clave cargada y guardada cifrada en este equipo.'
        : 'Clave cargada. En este equipo no se puede guardar cifrada: habrá que cargarla cada vez.';
    } else if (result && result.reason === 'wrong-key') {
      $('creator-result').textContent = 'Ese archivo no es la clave de actualizaciones de Ishe Client.';
    } else if (result && result.reason === 'unreadable') {
      $('creator-result').textContent = 'No pude leer ese archivo.';
    }
  }
  bump('creatorKeyDone');
}

async function creatorBuild() {
  $('creator-build').disabled = true;
  $('creator-steps').hidden = true;
  $('creator-open').hidden = true;
  $('creator-result').textContent = 'Creando la actualización…';
  let result = null;
  try {
    result = await window.ishe.creatorBuild({ version: $('creator-version').value, notes: $('creator-notes').value });
  } catch (_) {
    result = null;
  }
  if (result && result.ok) {
    $('creator-result').textContent = 'Versión ' + result.version + ' creada en: ' + result.folder;
    $('creator-tag').textContent = 'v' + result.version;
    $('creator-files').textContent = result.upload.join(', ');
    $('creator-steps').hidden = false;
    $('creator-open').hidden = false;
  } else if (result && result.cancelled) {
    $('creator-result').textContent = 'No se creó nada.';
  } else {
    $('creator-result').textContent = (result && result.message) || 'No se pudo crear la actualización.';
  }
  $('creator-build').disabled = !(state.creator && state.creator.keyLoaded);
  bump('creatorDone');
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function describeMod(file) {
  for (const [pattern, name, category] of KNOWN_MODS) {
    if (pattern.test(file)) return { name, category, file };
  }
  return { name: file.replace(/\.jar$/i, ''), category: 'Otro', file };
}

function setStatus(text, tone) {
  const status = $('status');
  status.textContent = text;
  status.className = 'hero-status' + (tone ? ' is-' + tone : '');
}

function showNotice(tone, title, text, items) {
  const notice = $('notice');
  notice.hidden = false;
  notice.className = 'notice' + (tone ? ' is-' + tone : '');
  $('notice-title').textContent = title;
  $('notice-text').textContent = text || '';
  const list = $('notice-list');
  list.replaceChildren();
  for (const item of items || []) list.appendChild(el('li', '', item));
}

function hideNotice() {
  $('notice').hidden = true;
}

function appendLog(line) {
  const log = $('log');
  log.textContent += (log.textContent ? '\n' : '') + line;
  log.scrollTop = log.scrollHeight;
  $('toggle-log').hidden = false;
}

function renderNews(news) {
  const box = $('news');
  box.replaceChildren();
  for (const item of news) {
    const card = el('article', 'news-card');
    if (item.fecha) card.appendChild(el('div', 'news-date', item.fecha));
    card.appendChild(el('h3', 'news-title', item.titulo));
    card.appendChild(el('p', 'news-text', item.texto));
    box.appendChild(card);
  }
  if (news.length === 0) box.appendChild(el('p', 'page-lead', 'Sin novedades por ahora.'));
}

function renderMods(installed) {
  const box = $('mods');
  box.replaceChildren();
  if (!installed || installed.mods.length === 0) {
    $('mods-lead').textContent = 'Todavía no hay nada instalado. Pulsa Jugar en Inicio y aparecerán aquí.';
    return;
  }
  $('mods-lead').textContent = installed.mods.length + ' mods · ' + installed.fabric;
  const mods = installed.mods.map(describeMod).sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  for (const mod of mods) {
    const row = el('div', 'mod');
    row.appendChild(el('span', 'mod-name', mod.name));
    row.appendChild(el('span', 'mod-tag', mod.category));
    const file = el('span', 'mod-file', mod.file);
    file.title = mod.file;
    row.appendChild(file);
    box.appendChild(row);
  }
}

function renderSettings() {
  const select = $('ram');
  select.replaceChildren();
  for (const gigabytes of state.ramChoices) {
    const option = el('option', '', gigabytes === 0 ? 'Automática (la que recomienda Minecraft)' : gigabytes + ' GB');
    option.value = String(gigabytes);
    if (gigabytes === state.ramGb) option.selected = true;
    select.appendChild(option);
  }
  $('game-dir').textContent = state.gameDir;
  $('session-hint').textContent = state.sessionSaved
    ? 'Tu sesión se guarda cifrada en este equipo. Puedes cerrarla cuando quieras desde el panel de la izquierda.'
    : 'En este equipo la sesión no se puede guardar cifrada, así que se pedirá iniciar sesión cada vez que abras Ishe Client.';
}

function renderAccount() {
  const avatar = $('account-avatar');
  const name = state.playerName;
  if (!state.signedIn) {
    $('account-name').textContent = 'Sin sesión';
    $('account-sub').textContent = 'Cuenta de Microsoft';
    $('account-button').textContent = 'Iniciar sesión';
  } else {
    $('account-name').textContent = name || 'Tu cuenta';
    $('account-sub').textContent = state.pendingApproval ? 'Esperando a Mojang' : 'Minecraft: Java Edition';
    $('account-button').textContent = 'Cerrar sesión';
  }
  $('account-name').title = state.playerNameProvisional
    ? name + ' (nombre que escribiste tú; Mojang aún no lo ha confirmado)'
    : $('account-name').textContent;
  // Mientras Mojang no aprueba, se puede escribir el nombre a mano para ver el personaje.
  const canType = Boolean(state.signedIn && state.pendingApproval);
  $('account-name-link').hidden = !(canType && !name);
  $('provisional').hidden = !canType;
  $('provisional-clear').hidden = !state.playerNameProvisional;
  if (state.playerNameProvisional && document.activeElement !== $('provisional-name')) $('provisional-name').value = name;
  avatar.textContent = state.signedIn && name ? name[0].toUpperCase() : '?';
  avatar.classList.toggle('is-empty', !(state.signedIn && name));
  drawFace(state.playerSkin);
}

/** Dibuja la cara del personaje (con su segunda capa) a partir de la imagen de la skin. */
function drawFace(skin) {
  const canvas = $('account-face');
  const avatar = $('account-avatar');
  if (!skin) {
    canvas.hidden = true;
    avatar.hidden = false;
    delete document.body.dataset.face;
    return;
  }
  if (canvas.dataset.source === skin && !canvas.hidden) return;
  const image = new Image();
  image.onload = () => {
    if (state.playerSkin !== skin || image.width < 64 || image.width % 64 !== 0) return;
    const unit = image.width / 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, 8, 8);
    context.drawImage(image, 8 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, 8, 8);
    context.drawImage(image, 40 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, 8, 8);
    canvas.dataset.source = skin;
    canvas.hidden = false;
    avatar.hidden = true;
    // Huella de tres puntos de la cara (para comprobar que se dibujo la skin correcta).
    const data = context.getImageData(0, 0, 8, 8).data;
    const pixel = (x, y) => Array.from(data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)).join('.');
    document.body.dataset.face = pixel(0, 0) + '|' + pixel(3, 3) + '|' + pixel(7, 7);
  };
  image.src = skin;
}

function refreshPlayButton() {
  const button = $('play');
  button.disabled = running || Boolean(state && state.gameRunning);
  button.textContent = running ? 'PREPARANDO…' : (state && state.gameRunning ? 'JUGANDO' : 'JUGAR');
  $('account-button').disabled = running;
}

function idleStatus() {
  if (state.gameRunning) {
    setStatus('Minecraft está abierto.', 'good');
  } else if (state.signedIn && !state.pendingApproval) {
    setStatus('Pulsa Jugar para abrir Minecraft' + (state.playerName ? ' como ' + state.playerName : '') + '.');
  } else if (state.signedIn) {
    setStatus((state.playerName ? 'Hola, ' + state.playerName + '. ' : 'Cuenta conectada. ') + 'Falta la aprobación de Mojang para abrir el juego desde aquí.');
  } else if (!state.minecraftFound) {
    setStatus('Inicia sesión con Microsoft para jugar desde aquí.', 'warn');
  } else if (state.installed) {
    setStatus('Todo preparado. Inicia sesión para abrir el juego desde aquí, o pulsa Jugar para usar el launcher oficial.');
  } else {
    setStatus('Pulsa Jugar: la primera vez se descargan los mods. Inicia sesión para abrir el juego desde aquí.');
  }
}

function applyState(next) {
  state = next;
  $('foot-version').textContent = 'Ishe Client ' + state.appVersion;
  $('foot-mc').textContent = 'Minecraft ' + state.mcVersion + ' · Fabric';
  renderNews(state.news);
  renderMods(state.installed);
  renderSettings();
  applyTheme(state.theme);
  renderAppearance();
  renderUpdate();
  renderCreator();
  renderAccount();
  refreshPlayButton();
}

function showView(name) {
  for (const view of document.querySelectorAll('.view')) {
    view.classList.toggle('is-active', view.id === 'view-' + name);
  }
  for (const item of document.querySelectorAll('.nav-item')) {
    const active = item.dataset.view === name;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  }
}

function setProgress(done, total) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  $('progress-bar').style.width = Math.max(4, Math.round(ratio * 100)) + '%';
}

function handleEvent(event) {
  if (!event || typeof event !== 'object') return;
  if (event.type === 'step') {
    // Un aviso de paso puede llegar despues del resultado final: entonces solo va al detalle.
    if (running) setStatus(event.text + '…');
    appendLog('== ' + event.text);
  } else if (event.type === 'info') {
    appendLog('   ' + event.text);
  } else if (event.type === 'problem') {
    appendLog('   AVISO: ' + event.text);
  } else if (event.type === 'progress') {
    if (running) setProgress(event.done, event.total);
  } else if (event.type === 'update') {
    if (state) {
      state.update = event.update;
      renderUpdate();
    }
  } else if (event.type === 'account') {
    if (event.state) applyState(event.state);
  } else if (event.type === 'login') {
    finishLogin(event);
  } else if (event.type === 'game-exit') {
    gameExited(event);
  }
}

// ---- cuenta ------------------------------------------------------------------

function closeLoginDialog() {
  if (!loginOpen) return;
  loginOpen = false;
  $('login').hidden = true;
  $('account-button').focus();
}

function showReason(reason, detail) {
  const [title, text] = REASON_TEXT[reason] || REASON_TEXT.unexpected;
  showNotice('bad', title, text, detail ? [detail] : []);
}

async function startLogin() {
  loginOpen = true;
  delete document.body.dataset.loginCode;
  $('login-code').textContent = '········';
  $('login-status').textContent = 'Pidiendo un código a Microsoft…';
  $('login-open').disabled = true;
  $('login-copy').disabled = true;
  $('login-copy').textContent = 'Copiar código';
  $('login').hidden = false;
  $('login-cancel').focus();
  let started = null;
  try { started = await window.ishe.loginStart(); } catch (_) { started = null; }
  if (!loginOpen) return; // se cancelo mientras tanto
  if (!started || !started.ok) {
    closeLoginDialog();
    setStatus('No se pudo iniciar sesión.', 'bad');
    showReason(started ? started.reason : 'unexpected', started ? started.detail : '');
    bump('loginDone');
    return;
  }
  $('login-code').textContent = started.userCode;
  $('login-page').textContent = started.page;
  $('login-status').textContent = 'Esperando a que termines en la página de Microsoft… El código vale ' + started.minutes + ' minutos.';
  $('login-open').disabled = false;
  $('login-copy').disabled = false;
  $('login-open').focus();
  document.body.dataset.loginCode = started.userCode;
}

function cancelLogin() {
  if (!loginOpen) return;
  window.ishe.loginCancel();
  closeLoginDialog();
}

function finishLogin(event) {
  if (event.state) applyState(event.state);
  closeLoginDialog();
  if (event.status === 'ok') {
    hideNotice();
    setStatus('Sesión iniciada como ' + state.playerName + '. Pulsa Jugar para abrir Minecraft.', 'good');
  } else if (event.status === 'pending-approval') {
    setStatus('Cuenta de Microsoft conectada.', 'good');
    showNotice('', 'Falta la aprobación de Mojang', PENDING_TEXT + ' No tienes que volver a iniciar sesión: en cuanto la aprueben, Jugar abrirá Minecraft directamente.', []);
  } else {
    setStatus('No se pudo iniciar sesión.', 'bad');
    showReason(event.reason, event.detail);
  }
  bump('loginDone');
}

async function accountAction() {
  if (running) return;
  if (!state.signedIn) {
    startLogin();
    return;
  }
  const next = await window.ishe.logout();
  if (next) applyState(next);
  hideNotice();
  setStatus('Sesión cerrada. Ishe Client ya no guarda nada de tu cuenta.');
  bump('logoutDone');
}

async function saveDisplayName() {
  const hint = $('provisional-hint');
  $('provisional-save').disabled = true;
  hint.textContent = 'Buscando tu personaje…';
  let result = null;
  try { result = await window.ishe.setDisplayName($('provisional-name').value); } catch (_) { result = null; }
  $('provisional-save').disabled = false;
  if (result && result.ok) {
    applyState(result.state);
    idleStatus();
    hint.textContent = 'Listo: se muestra ' + state.playerName + (state.playerSkin ? ' con su skin.' : ' (ese jugador no tiene skin propia).');
  } else {
    const reason = result ? result.reason : 'unexpected';
    hint.textContent = {
      'name-invalid': 'El nombre solo puede tener letras, números y guion bajo (hasta 16).',
      'name-not-found': 'No existe ningún jugador de Java Edition con ese nombre. Escríbelo tal cual sale en el juego.',
      network: 'No pude consultar a Mojang. Revisa tu conexión y vuelve a intentarlo.',
      'not-needed': 'Ya no hace falta: tu cuenta ya muestra su propio nombre.',
    }[reason] || 'Mojang no respondió bien. Vuelve a intentarlo en un momento.';
  }
  bump('nameDone');
}

async function clearDisplayName() {
  applyState(await window.ishe.clearDisplayName());
  idleStatus();
  $('provisional-name').value = '';
  $('provisional-hint').textContent = 'Nombre quitado.';
  bump('nameDone');
}

function gameExited(event) {
  if (event.launchId) exitedLaunches.add(event.launchId);
  if (event.state) applyState(event.state);
  if (event.failed) {
    setStatus('Minecraft se cerró con un error' + (event.code === null || event.code === undefined ? '.' : ' (código ' + event.code + ').'), 'bad');
    showNotice('bad', 'El juego se cerró con un error',
      'Estas son sus últimas líneas. El registro completo está en logs/latest.log, dentro de la carpeta de Ishe Client (Ajustes).', event.tail || []);
  } else {
    setStatus('Minecraft se cerró. Pulsa Jugar para volver a entrar.');
  }
  bump('gameExits');
}

function showResult(result) {
  if (!result || result.status === 'busy') return;
  // Si el juego ya se cerro antes de llegar esta respuesta, su estado es viejo:
  // el aviso de cierre ya dejo la ventana como debe quedar.
  if (result.status === 'launched' && exitedLaunches.has(result.launchId)) return;
  if (result.state) applyState(result.state);
  const problems = result.problems || [];
  const pending = result.handoff === 'pending-approval';

  if (result.status === 'running') {
    setStatus('Minecraft ya está abierto.', 'good');
    return;
  }
  if (result.status === 'launched') {
    setStatus('Abriendo Minecraft como ' + result.playerName + '… La ventana del juego puede tardar un poco en aparecer.', 'good');
    if (problems.length) showNotice('', 'El juego se abrió, con avisos', 'Algo de la preparación no salió del todo bien:', problems);
    return;
  }
  if (result.status === 'auth-failed') {
    setStatus('No pude comprobar tu cuenta.', 'bad');
    showReason(result.reason, result.detail);
    return;
  }
  if (result.status === 'game-failed') {
    setStatus('No se pudo abrir Minecraft.', 'bad');
    showNotice('bad', 'El arranque se detuvo', result.message || 'Error desconocido.', problems);
    return;
  }

  if (result.status === 'ready') {
    if (result.opened === 'failed') {
      setStatus('El juego está preparado.', 'good');
      showNotice('', 'Abre tú el launcher oficial',
        (pending ? PENDING_TEXT + ' ' : '') + 'No pude abrir el launcher oficial de Minecraft. Ábrelo, elige el perfil «Ishe Client» y pulsa Jugar.', problems);
    } else {
      setStatus(result.opened === 'opened'
        ? 'Listo. Se abrió el launcher oficial de Minecraft.'
        : 'El juego está preparado. Abriendo el launcher oficial de Minecraft…', 'good');
      showNotice(problems.length ? '' : 'good',
        problems.length ? 'Último paso (hubo avisos)' : 'Último paso',
        (pending ? PENDING_TEXT + ' ' : '') + 'En el launcher oficial elige el perfil «Ishe Client» y pulsa Jugar. Si no se abrió solo, ábrelo tú.', problems);
    }
    return;
  }
  if (result.status === 'needs-close') {
    setStatus('Falta un paso: cierra el launcher oficial.', 'warn');
    showNotice('', 'Cierra el launcher oficial de Minecraft',
      (pending ? PENDING_TEXT + ' ' : '') + 'Los mods ya están listos. Para añadir el perfil «Ishe Client» el launcher oficial tiene que estar cerrado del todo. Ciérralo y vuelve a pulsar Jugar.',
      problems.filter((p) => !p.includes('está abierto')));
    return;
  }
  if (result.status === 'no-profile') {
    setStatus('No pude añadir el perfil al launcher oficial.', 'warn');
    showNotice('', 'Falta el perfil «Ishe Client»',
      (pending ? PENDING_TEXT + ' ' : '') + 'Abre el launcher oficial de Minecraft una vez con tu cuenta, ciérralo y vuelve a pulsar Jugar.', problems);
    return;
  }
  setStatus('No se pudo preparar el juego.', 'bad');
  showNotice('bad', 'La preparación se detuvo', result.message || 'Error desconocido.', []);
}

async function play() {
  if (running || (state && state.gameRunning)) return;
  running = true;
  refreshPlayButton();
  hideNotice();
  $('log').textContent = '';
  $('progress').hidden = false;
  setProgress(0, 1);
  setStatus('Preparando el juego…');
  try {
    showResult(await window.ishe.play());
  } catch (error) {
    setStatus('No se pudo preparar el juego.', 'bad');
    showNotice('bad', 'Error inesperado', String(error && error.message ? error.message : error), []);
  } finally {
    running = false;
    refreshPlayButton();
    $('progress').hidden = true;
    bump('playDone');
  }
}

async function init() {
  window.ishe.onEvent(handleEvent);
  applyState(await window.ishe.getState());
  idleStatus();
  if (state.updateFellBackFrom) {
    showNotice('', 'Se volvió a la versión anterior',
      'La versión ' + state.updateFellBackFrom + ' no pudo abrirse en este equipo, así que Ishe Client sigue con la ' + state.appVersion + '. Avísale a quien la publicó.', []);
  } else if (state.signedIn && state.pendingApproval) {
    showNotice('', 'Falta la aprobación de Mojang', PENDING_TEXT, []);
  } else if (!state.signedIn && !state.minecraftFound) {
    showNotice('', 'Inicia sesión para jugar',
      'Pulsa Iniciar sesión (abajo a la izquierda) y entra con la cuenta de Microsoft que tiene Minecraft: Java Edition. Si prefieres usar el launcher oficial de Minecraft, instálalo, ábrelo una vez con tu cuenta y ciérralo.', []);
  }

  for (const item of document.querySelectorAll('.nav-item')) {
    item.addEventListener('click', () => showView(item.dataset.view));
  }
  $('play').addEventListener('click', play);
  $('toggle-log').addEventListener('click', () => {
    const log = $('log');
    log.hidden = !log.hidden;
    $('toggle-log').textContent = log.hidden ? 'Ver detalles' : 'Ocultar detalles';
  });
  $('ram').addEventListener('change', async (event) => {
    const gigabytes = Number(event.target.value);
    const saved = await window.ishe.setRam(gigabytes);
    if (saved) state.ramGb = gigabytes;
    $('ram-hint').textContent = saved
      ? 'Guardado. Se aplica la próxima vez que pulses Jugar.'
      : 'No se pudo guardar el cambio.';
  });
  $('open-folder').addEventListener('click', () => window.ishe.openFolder());
  $('account-button').addEventListener('click', accountAction);
  $('account-name-link').addEventListener('click', () => {
    showView('ajustes');
    $('provisional').scrollIntoView({ block: 'center' });
    $('provisional-name').focus();
  });
  $('provisional-save').addEventListener('click', saveDisplayName);
  $('provisional-clear').addEventListener('click', clearDisplayName);
  $('provisional-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveDisplayName();
  });
  for (const key of ['color1', 'color2', 'fondo']) {
    const input = $('theme-' + key);
    // Mientras se mueve el selector se ve al momento; al soltar se guarda.
    input.addEventListener('input', () => applyTheme(Object.assign({}, state.theme, { [key]: input.value })));
    input.addEventListener('change', async () => themeResult(await window.ishe.setTheme({ [key]: input.value }), 'Guardado.'));
  }
  $('theme-logo').addEventListener('click', async () => themeResult(await window.ishe.pickLogo(), 'Logo cambiado.'));
  $('theme-logo-clear').addEventListener('click', async () => themeResult(await window.ishe.clearLogo(), 'Se usa el logo original.'));
  $('theme-reset').addEventListener('click', async () => themeResult(await window.ishe.resetTheme(), 'Colores y logo originales.'));
  $('update-check').addEventListener('click', () => window.ishe.updateCheck());
  $('update-restart').addEventListener('click', restartForUpdate);
  $('update-pill').addEventListener('click', restartForUpdate);
  $('update-banner-restart').addEventListener('click', restartForUpdate);
  $('update-banner-later').addEventListener('click', () => {
    const update = state.update || {};
    bannerDismissed = update.status + ':' + update.version;
    $('update-banner').hidden = true;
  });
  $('creator-key').addEventListener('click', creatorKeyAction);
  $('creator-build').addEventListener('click', creatorBuild);
  $('creator-open').addEventListener('click', () => window.ishe.creatorOpenFolder());
  $('login-cancel').addEventListener('click', cancelLogin);
  $('login-open').addEventListener('click', () => window.ishe.loginOpenPage());
  $('login-copy').addEventListener('click', async () => {
    const copied = await window.ishe.loginCopyCode();
    $('login-copy').textContent = copied ? 'Código copiado' : 'No se pudo copiar';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && loginOpen) cancelLogin();
  });
  document.body.dataset.ready = '1';
}

init();
