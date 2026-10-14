'use strict';
// Interfaz de Reshem Client. Solo habla con el proceso principal a traves de
// window.ishe (ver preload.js); no tiene acceso al sistema.

const $ = (id) => document.getElementById(id);

// Nombre y categoria que se muestran para cada archivo de mod conocido.
const KNOWN_MODS = [
  [/^ishe-/i, 'Ishe (Nublado, Haku y más)', 'Ishe'],
  [/^plasmovoice/i, 'Plasmo Voice', 'Amigos'],
  [/^voicechat/i, 'Simple Voice Chat', 'Amigos'],
  [/^SimpleDiscordRichPresence/i, 'Discord Rich Presence', 'Amigos'],
  [/^fabric-api/i, 'Fabric API', 'Base'],
  [/^iris/i, 'Iris Shaders', 'Rendimiento'],
  [/^sodium/i, 'Sodium', 'Rendimiento'],
  [/^lithium/i, 'Lithium', 'Rendimiento'],
  [/^ferritecore/i, 'FerriteCore', 'Rendimiento'],
  [/^ immediatelyfast|^ImmediatelyFast/i, 'ImmediatelyFast', 'Rendimiento'],
  [/^entityculling/i, 'EntityCulling', 'Rendimiento'],
  [/^moreculling/i, 'More Culling', 'Rendimiento'],
  [/^c2me/i, 'C2ME (Chunks rápidos)', 'Rendimiento'],
  [/^noisium/i, 'Noisium', 'Rendimiento'],
  [/^scalablelux/i, 'ScalableLux', 'Rendimiento'],
  [/^badoptimizations|^BadOptimizations/i, 'BadOptimizations', 'Rendimiento'],
  [/^dynamic-fps/i, 'Dynamic FPS', 'Rendimiento'],
  [/^krypton/i, 'Krypton (Red optimizada)', 'Rendimiento'],
  [/^clumps|^Clumps/i, 'Clumps (XP agrupada)', 'Rendimiento'],
  [/^xaeroworldmap|^xaero/i, "Xaero's World Map", 'Extras'],
  [/^xaerominimap/i, "Xaero's Minimap", 'Extras'],
  [/^RoughlyEnoughItems/i, 'Roughly Enough Items (REI)', 'Extras'],
  [/^appleskin/i, 'AppleSkin', 'Extras'],
  [/^jade|^Jade/i, 'Jade (Info de bloques)', 'Extras'],
  [/^zoomify|^Zoomify/i, 'Zoomify', 'Extras'],
  [/^ trashslot|^trashslot/i, 'TrashSlot', 'Extras'],
  [/^immersive_paintings|^immersive-paintings/i, 'Immersive Paintings', 'Extras'],
  [/^customplayermodels|^custom-player-models|^CustomPlayerModels/i, 'Customizable Player Models', 'Extras'],
  [/^lambdynamiclights/i, 'LambDynamicLights', 'Extras'],
  [/^sound-physics-remastered/i, 'Sound Physics Remastered', 'Extras'],
  [/^MouseTweaks/i, 'Mouse Tweaks', 'Extras'],
  [/^Explorify/i, 'Explorify (Estructuras)', 'Extras'],
  [/^waystones/i, 'Waystones', 'Extras'],
  [/^gravestone/i, 'GraveStone (Tumbas)', 'Extras'],
  [/^comforts/i, 'Comforts (Sacos de dormir)', 'Extras'],
  [/^NatureCompass/i, "Nature's Compass", 'Extras'],
  [/^backpacked/i, 'Backpacked (Mochilas)', 'Extras'],
  [/^skinlayers3d/i, '3D Skin Layers', 'Extras'],
  [/^notenoughanimations/i, 'Not Enough Animations', 'Extras'],
  [/^visuality/i, 'Visuality (Partículas)', 'Extras'],
  [/^fallingtrees|^PandaFallingTrees/i, 'Falling Trees', 'Extras'],
  [/^AmbientSounds/i, 'AmbientSounds 6', 'Extras'],
  [/^travelersbackpack/i, "Traveler's Backpack", 'Extras'],
  [/^supplementaries/i, 'Supplementaries', 'Extras'],
  [/^FarmersDelight/i, "Farmer's Delight", 'Extras'],
  [/^lootr/i, 'Lootr (Cofres por jugador)', 'Extras'],
  [/^carryon/i, 'Carry On', 'Extras'],
  [/^jei-/i, 'Just Enough Items (JEI)', 'Extras'],
  [/^rightclickharvest/i, 'RightClickHarvest', 'Extras'],
  [/^fancymenu/i, 'FancyMenu', 'Menú'],
  [/^modmenu/i, 'Mod Menu', 'Menú'],
  [/^balm/i, 'Balm', 'Biblioteca'],
  [/^fzzy_config|^fzzy-config/i, 'Fzzy Config', 'Biblioteca'],
  [/^fabric-language-kotlin/i, 'Fabric Language Kotlin', 'Biblioteca'],
  [/^konkrete/i, 'Konkrete', 'Biblioteca'],
  [/^melody/i, 'Melody', 'Biblioteca'],
  [/^placeholder-api/i, 'Text Placeholder API', 'Biblioteca'],
  [/^architectury/i, 'Architectury API', 'Biblioteca'],
  [/^cloth-config/i, 'Cloth Config API', 'Biblioteca'],
  [/^yacl|^yet_another_config_lib/i, 'YetAnotherConfigLib', 'Biblioteca'],
  [/^CreativeCore/i, 'CreativeCore', 'Biblioteca'],
  [/^framework/i, 'Framework', 'Biblioteca'],
  [/^cardinal-components/i, 'Cardinal Components API', 'Biblioteca'],
  [/^moonlight/i, 'Moonlight Lib', 'Biblioteca'],
  [/^jamlib/i, 'JamLib', 'Biblioteca'],
  [/^puzzleslib|^PuzzlesLib/i, 'Puzzles Lib', 'Biblioteca'],
  [/^forgeconfigapiport|^ForgeConfigAPIPort/i, 'Forge Config API Port', 'Biblioteca'],
  [/^geckolib/i, 'GeckoLib', 'Biblioteca'],
  [/^owo-lib/i, 'oωo (owo-lib)', 'Biblioteca'],
  [/^spectrelib/i, 'SpectreLib', 'Biblioteca'],
  [/^resourcefullib/i, 'Resourceful Lib', 'Biblioteca'],
  [/^cristellib/i, 'Cristel Lib', 'Biblioteca'],
  [/^txnilib/i, 'TxniLib', 'Biblioteca'],
  [/^ cupboard|^cupboard/i, 'Cupboard', 'Biblioteca'],
  [/^ collective|^collective/i, 'Collective', 'Biblioteca'],
  [/^coroutil/i, 'CoroUtil', 'Biblioteca'],
  [/^watut/i, 'What Are They Up To', 'Extras'],
  [/^BetterAdvancements/i, 'Better Advancements', 'Extras'],
  [/^GlitchCore/i, 'GlitchCore', 'Biblioteca'],
  [/^TerraBlender/i, 'TerraBlender', 'Biblioteca'],
  [/^BiomesOPlenty/i, "Biomes O' Plenty", 'Extras'],
  [/^iris-flywheel-compat/i, 'Iris Flywheel Compat', 'Rendimiento'],
  [/^Create_/i, 'Create', 'Extras'],
  [/^ichunutil/i, 'iChunUtil', 'Biblioteca'],
  [/^backtools/i, 'BackTools', 'Extras'],
  [/^Ding/i, 'Ding', 'Extras'],
  [/^journeymap/i, 'JourneyMap', 'Extras'],
  [/^badpackets/i, 'Bad Packets', 'Biblioteca'],
  [/^wthit/i, 'WTHIT', 'Extras'],
  [/^InventoryProfilesNext/i, 'Inventory Profiles Next', 'Extras'],
  [/^libIPN/i, 'libIPN', 'Biblioteca'],
  [/^particular/i, 'Particular', 'Extras'],
  [/^BetterF3/i, 'BetterF3', 'Extras'],
  [/^amendments/i, 'Amendments', 'Extras'],
  [/^Sawmill/i, 'Universal Sawmill', 'Extras'],
  [/^accessories/i, 'Accessories', 'Biblioteca'],
  [/^artifacts/i, 'Artifacts', 'Extras'],
  [/^cobbledollars/i, 'CobbleDollars', 'Extras'],
  [/^Cobblemon/i, 'Cobblemon', 'Extras'],
  [/^VisualWorkbench/i, 'Visual Workbench', 'Extras'],
  [/^easyanvils|^EasyAnvils/i, 'Easy Anvils', 'Extras'],
  [/^easymagic|^EasyMagic/i, 'Easy Magic', 'Extras'],
  [/^SophisticatedCore|^sophisticatedcore/i, 'Sophisticated Core', 'Biblioteca'],
  [/^SophisticatedBackpacks|^sophisticatedbackpacks/i, 'Sophisticated Backpacks', 'Extras'],
  [/^treeharvester/i, 'Tree Harvester', 'Extras'],
  [/^leavesbegone|^LeavesBeGone/i, 'Leaves Be Gone', 'Extras'],
  [/^charmofundying/i, 'Charm of Undying', 'Extras'],
  [/^elytraslot/i, 'Elytra Slot', 'Extras'],
  [/^waystones/i, 'Waystones', 'Extras'],
  [/^cluttered/i, 'Cluttered', 'Extras'],
  [/^handcrafted/i, 'Handcrafted', 'Extras'],
  [/^chipped/i, 'Chipped', 'Extras'],
  [/^athena/i, 'Athena', 'Biblioteca'],
];
const CATEGORY_ORDER = ['Ishe', 'Amigos', 'Extras', 'Rendimiento', 'Menú', 'Base', 'Biblioteca', 'Otro'];

// Explicacion de cada motivo por el que puede fallar el inicio de sesion.
const REASON_TEXT = {
  network: ['Sin conexión con Microsoft', 'No hubo respuesta de los servidores de inicio de sesión. Revisa tu internet y vuelve a intentarlo.'],
  declined: ['Inicio de sesión cancelado', 'En la página de Microsoft se rechazó el acceso. Si fue sin querer, vuelve a pulsar Iniciar sesión.'],
  expired: ['El código caducó', 'Pulsa Iniciar sesión para obtener un código nuevo.'],
  'no-xbox-account': ['Esta cuenta no tiene perfil de Xbox', 'Entra una vez en xbox.com con esta cuenta de Microsoft para crear el perfil y vuelve a intentarlo.'],
  'xbox-region': ['Xbox Live no está disponible', 'Xbox Live no funciona en el país o región de esta cuenta.'],
  'xbox-adult-check': ['Falta verificar la edad', 'Esta cuenta necesita verificar la edad en xbox.com antes de poder jugar.'],
  'xbox-child': ['Cuenta de un menor', 'Un adulto tiene que añadir esta cuenta a su grupo familiar de Microsoft para que pueda jugar.'],
  'not-owned': ['Esta cuenta no tiene Minecraft', 'Reshem Client solo abre el juego con cuentas de Microsoft que tienen Minecraft: Java Edition. Se cerró la sesión.'],
  'session-expired': ['Tu sesión caducó', 'Pulsa Iniciar sesión para entrar otra vez con tu cuenta de Microsoft.'],
  unexpected: ['Algo no salió como se esperaba', 'Vuelve a intentarlo en unos minutos.'],
};
const PENDING_TEXT = 'Mojang todavía no ha aprobado Reshem Client para abrir el juego directamente. Hasta entonces, Jugar deja todo preparado y abre el launcher oficial.';

let state = null;
let running = false;
let loginOpen = false;
const exitedLaunches = new Set();

function bump(key) {
  document.body.dataset[key] = String(Number(document.body.dataset[key] || 0) + 1);
}

// ---- apariencia ----------------------------------------------------------------

const DEFAULT_BACKGROUND = '#0b110a';

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
  root.setProperty('--on-accent', luminance(mix(theme.color1, theme.color2, 0.5)) > 0.3 ? '#0b0d14' : '#ffffff');
  const derived = { '--bg': theme.fondo, '--panel': mix(theme.fondo, '#ffffff', 0.04), '--panel-2': mix(theme.fondo, '#ffffff', 0.075),
    '--line': mix(theme.fondo, '#ffffff', 0.15), '--deep': mix(theme.fondo, '#000000', 0.25) };
  for (const [name, value] of Object.entries(derived)) {
    if (theme.fondo === DEFAULT_BACKGROUND) root.removeProperty(name); else root.setProperty(name, value);
  }
  const logo = $('brand-logo');
  const wanted = theme.logo || '../assets/logo.png';
  if (logo.getAttribute('src') !== wanted) logo.setAttribute('src', wanted);
  logo.classList.toggle('is-custom', Boolean(theme.logo));
  document.body.dataset.theme = [theme.color1, theme.color2, theme.fondo, theme.logo ? 'logo' : ''].join(',');
}

// ---- version y actualizaciones --------------------------------------------------

function renderUpdate() {
  const update = state.update || { status: 'idle' };
  const texts = {
    idle: 'Actualizaciones automáticas activadas.',
    checking: 'Buscando una versión nueva…',
    none: 'Tienes la última versión.',
    downloading: 'Descargando la versión ' + update.version + '…',
    ready: 'La versión ' + update.version + ' ya está descargada. Reinicia Reshem Client para usarla.' + (update.notes ? ' Novedades: ' + update.notes : ''),
    'needs-installer': 'La versión ' + update.version + ' necesita instalar Reshem Client de nuevo con el instalador más reciente.',
    error: update.detail === 'network'
      ? 'No pude buscar versiones nuevas: no hubo conexión con GitHub.'
      : 'No pude actualizar: ' + (update.detail || 'error desconocido') + '.',
  };
  $('version-line').textContent = 'Reshem Client ' + state.appVersion + ' · motor Electron ' + state.engine;
  $('update-status').textContent = texts[update.status] || texts.idle;
  $('update-check').disabled = update.status === 'checking' || update.status === 'downloading';
  $('update-restart').hidden = update.status !== 'ready';
  const pill = $('update-pill');
  pill.hidden = update.status !== 'ready';
  pill.textContent = 'Versión ' + update.version + ' lista · Reiniciar';
  document.body.dataset.updateStatus = update.status;
  renderUpdateBanner(update);
}

let bannerDismissed = '';

function renderUpdateBanner(update) {
  const showing = ['downloading', 'ready', 'needs-installer'].includes(update.status)
    && bannerDismissed !== update.status + ':' + update.version;
  $('update-banner').hidden = !showing;
  if (!showing) return;
  const ready = update.status === 'ready';
  $('update-banner-title').textContent = 'Hay una actualización: versión ' + update.version;
  $('update-banner-detail').textContent = ready
    ? (update.notes || 'Reinicia Reshem Client para usarla.')
    : update.status === 'downloading'
      ? 'Se está descargando, te avisamos cuando esté lista.'
      : 'Hay que instalar Reshem Client de nuevo con el instalador más reciente.';
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
      $('creator-result').textContent = 'Ese archivo no es la clave de actualizaciones de Reshem Client.';
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
  $('loading-status').textContent = text;
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
  const iconFiles = ['assets/items/nether_star.png', 'assets/items/elytra.png', 'assets/items/totem_de_eon.png'];
  const tags = ['LAUNCHER', 'NUEVO MOD', 'SERVIDOR'];
  (news || []).slice(0, 2).forEach((item, idx) => {
    const card = el('article', 'news-card');
    const icon = el('span', 'news-icon is-tone-' + (idx % 3));
    icon.setAttribute('aria-hidden', 'true');
    const iconImg = el('img', 'mc-pixel-icon');
    iconImg.src = iconFiles[idx % iconFiles.length];
    iconImg.alt = '';
    icon.appendChild(iconImg);
    card.appendChild(icon);

    const content = el('div', 'news-content');
    const head = el('div', 'news-head');
    head.appendChild(el('span', 'news-tag is-tone-' + (idx % 3), tags[idx % tags.length]));
    if (item.fecha) head.appendChild(el('span', 'news-date', item.fecha));
    content.appendChild(head);
    content.appendChild(el('h3', 'news-title', item.titulo));
    content.appendChild(el('p', 'news-text', item.texto));
    card.appendChild(content);
    box.appendChild(card);
  });
  if (!news || news.length === 0) box.appendChild(el('p', 'page-lead', 'Sin novedades.'));
}

let modsFilterQuery = '';

const PREVIEW_PACK_MODS = [
  { name: 'Ishe (Nublado, Haku y Eventos)', category: 'Ishe', file: 'Mod principal del servidor' },
  { name: 'Simple Voice Chat', category: 'Amigos', file: 'Voz por proximidad y con IA' },
  { name: 'Emotecraft (+1800 Emotes)', category: 'Amigos', file: 'Animaciones de jugador' },
  { name: 'Sodium + Lithium + Iris', category: 'Rendimiento', file: 'Máximos FPS y Shaders BSL' },
  { name: 'FerriteCore & ImmediatelyFast', category: 'Rendimiento', file: 'Optimización de memoria RAM y GPU' },
  { name: 'EntityCulling & MoreCulling', category: 'Rendimiento', file: 'Oculta entidades y caras no visibles' },
  { name: "Xaero's World Map & Minimap", category: 'Extras', file: 'Mapa del mundo y waypoints' },
  { name: "Alex's Caves & Better End", category: 'Extras', file: 'Dimensiones y cuevas nuevas' },
  { name: 'The Bumblezone (La Colmena)', category: 'Extras', file: 'Dimensión de la Perla de Miel' },
  { name: 'Mutant Monsters & Creeper', category: 'Extras', file: 'Criaturas del reto' },
  { name: "Farmer's Delight & Handcrafted", category: 'Extras', file: 'Cocina, muebles y decoración' },
  { name: "Traveler's Backpack & Lootr", category: 'Extras', file: 'Mochilas y cofres individuales' },
  { name: 'Waystones & GraveStone', category: 'Extras', file: 'Teletransporte y tumbas seguras' },
  { name: 'Sound Physics & AmbientSounds', category: 'Extras', file: 'Acústica realista y sonidos de biomas' },
  { name: 'LambDynamicLights & Visuality', category: 'Extras', file: 'Antorchas en mano y partículas' },
  { name: '3D Skin Layers & Animations', category: 'Extras', file: 'Capas 3D y animaciones en tercera persona' },
  { name: 'Roughly Enough Items (REI)', category: 'Extras', file: 'Recetas y usos de todos los objetos' },
  { name: 'Jade & AppleSkin', category: 'Extras', file: 'Información de bloques y saturación' },
  { name: 'Supplementaries & Amendments', category: 'Extras', file: 'Bloques funcionales y decoración' },
  { name: 'Carry On & RightClickHarvest', category: 'Extras', file: 'Cargar cofres y cosecha rápida' },
  { name: 'Fabric API & Cloth Config', category: 'Base', file: 'Núcleo base de Fabric 26.2' },
];

function renderMods(installed) {
  const box = $('mods');
  box.replaceChildren();
  const q = modsFilterQuery.trim().toLowerCase();
  if (!installed || installed.mods.length === 0) {
    $('mods-lead').textContent = 'Pack oficial Reshem · Se descargan automáticamente al pulsar Jugar.';
    const previewList = PREVIEW_PACK_MODS.filter((m) => !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    for (const mod of previewList) {
      const row = el('div', 'mod is-preview');
      const icon = el('span', 'mod-icon cat-' + CATEGORY_ORDER.indexOf(mod.category), mod.name[0].toUpperCase());
      icon.setAttribute('aria-hidden', 'true');
      row.appendChild(icon);
      const text = el('div', 'mod-text');
      text.appendChild(el('span', 'mod-preview-title', mod.name));
      text.appendChild(el('span', 'mod-file', mod.file));
      row.appendChild(text);
      row.appendChild(el('span', 'mod-tag cat-' + CATEGORY_ORDER.indexOf(mod.category), mod.category));
      box.appendChild(row);
    }
    return;
  }
  $('mods-lead').textContent = installed.mods.length + ' mods instalados · ' + installed.fabric;
  const mods = installed.mods
    .map(describeMod)
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.file.toLowerCase().includes(q))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  for (const mod of mods) {
    const row = el('div', 'mod');
    const icon = el('span', 'mod-icon cat-' + CATEGORY_ORDER.indexOf(mod.category), mod.name[0].toUpperCase());
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);
    const text = el('div', 'mod-text');
    text.appendChild(el('span', 'mod-name', mod.name));
    const file = el('span', 'mod-file', mod.file);
    file.title = mod.file;
    text.appendChild(file);
    row.appendChild(text);
    row.appendChild(el('span', 'mod-tag cat-' + CATEGORY_ORDER.indexOf(mod.category), mod.category));
    box.appendChild(row);
  }
}

function renderSettings() {
  const select = $('ram');
  select.replaceChildren();
  for (const gigabytes of state.ramChoices) {
    const option = el('option', '', gigabytes === 0 ? 'Automática (Recomendada)' : gigabytes + ' GB');
    option.value = String(gigabytes);
    if (gigabytes === state.ramGb) option.selected = true;
    select.appendChild(option);
  }
  $('game-dir').textContent = state.gameDir;
  const shadersOn = state.shadersEnabled !== false;
  $('shaders-toggle').textContent = 'Shaders BSL: ' + (shadersOn ? 'Activados' : 'Apagados (+FPS)');
  $('shaders-toggle').classList.toggle('is-primary', shadersOn);
  $('mc-profile-ver').textContent = shadersOn ? 'Fabric + BSL' : 'Fabric (Altos FPS)';
  $('session-hint').textContent = state.sessionSaved
    ? 'Sesión cifrada en este equipo. Cuenta Microsoft con Minecraft: Java Edition.'
    : 'Cuenta Microsoft con Minecraft: Java Edition.';
  const canType = Boolean(state.signedIn && state.pendingApproval);
  $('provisional').hidden = !canType;
  $('provisional-clear').hidden = !(canType && state.playerName);
}

// ---- Visor 3D de Skin y Guardarropa -----------------------------------------------

const skin3d = {
  image: null,
  source: '',
  variant: 'classic',
  selectedWardrobeId: '',
  selectedName: '',
  yaw: -0.48,
  pitch: 0.22,
  dragging: false,
  lastX: 0,
  lastY: 0,
  walk: true,
  spin: false,
  layers: true,
  pixelCanvas: document.createElement('canvas'),
  pixelData: null,
};
skin3d.pixelCanvas.width = 64;
skin3d.pixelCanvas.height = 64;

function loadSkin3dTexture(src, variant, label, wardrobeId) {
  skin3d.variant = variant === 'slim' ? 'slim' : 'classic';
  skin3d.selectedWardrobeId = wardrobeId || '';
  skin3d.selectedName = label || '';
  if (!src) {
    const fallback = state && state.wardrobe && state.wardrobe[0];
    const fallbackSrc = fallback && (fallback.dataUrl || fallback.skin);
    if (fallbackSrc) {
      src = fallbackSrc;
      skin3d.variant = fallback.variant || 'classic';
      skin3d.selectedWardrobeId = fallback.id || '';
      skin3d.selectedName = fallback.name || 'Explorador Reshem';
    }
  }
  $('skin-3d-label').textContent = skin3d.selectedName || 'Tu personaje';
  const modelPill = $('skin-3d-model-pill');
  if (modelPill) modelPill.textContent = skin3d.variant === 'slim' ? 'Alex' : 'Steve';
  const applyBtn = $('skin-3d-apply');
  if (applyBtn) {
    applyBtn.disabled = !skin3d.selectedWardrobeId;
    applyBtn.textContent = skin3d.selectedName
      ? 'Equipar «' + skin3d.selectedName + '»'
      : 'Equipar en mi cuenta';
  }
  if (!src) {
    skin3d.image = null;
    skin3d.pixelData = null;
    skin3d.source = '';
    return;
  }
  if (skin3d.source === src && skin3d.pixelData) return;
  skin3d.source = src;
  const img = new Image();
  img.onload = () => {
    if (img.width < 64 || img.width % 64 !== 0) return;
    const ctx = skin3d.pixelCanvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    const scaleH = img.height >= img.width ? 64 : 32;
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 64, scaleH);
    skin3d.pixelData = ctx.getImageData(0, 0, 64, 64).data;
    skin3d.image = img;
    skin3d.modern = img.height >= img.width;
    renderSkin3dFrame(performance.now(), false);
  };
  img.src = src;
}

function drawSkin2dPreview(canvas, skin, w, h) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  if (!skin) {
    ctx.fillStyle = '#34452f';
    for (const [x, y, pw, ph] of [[4, 0, 8, 8], [4, 8, 8, 12], [0, 8, 4, 12], [12, 8, 4, 12], [4, 20, 4, 12], [8, 20, 4, 12]]) {
      ctx.fillRect(x, y, pw, ph);
    }
    return;
  }
  const image = new Image();
  image.onload = () => {
    if (image.width < 64 || image.width % 64 !== 0) return;
    const unit = image.width / 64;
    const modern = image.height >= image.width;
    ctx.clearRect(0, 0, 16, 32);
    const part = (sx, sy, pw, ph, dx, dy, flip) => {
      if (!flip) {
        ctx.drawImage(image, sx * unit, sy * unit, pw * unit, ph * unit, dx, dy, pw, ph);
        return;
      }
      ctx.save();
      ctx.translate(dx + pw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, sx * unit, sy * unit, pw * unit, ph * unit, 0, 0, pw, ph);
      ctx.restore();
    };
    part(8, 8, 8, 8, 4, 0);
    part(20, 20, 8, 12, 4, 8);
    part(44, 20, 4, 12, 0, 8);
    part(modern ? 36 : 44, modern ? 52 : 20, 4, 12, 12, 8, !modern);
    part(4, 20, 4, 12, 4, 20);
    part(modern ? 20 : 4, modern ? 52 : 20, 4, 12, 8, 20, !modern);
    part(40, 8, 8, 8, 4, 0);
    if (modern) {
      part(20, 36, 8, 12, 4, 8);
      part(44, 36, 4, 12, 0, 8);
      part(52, 52, 4, 12, 12, 8);
      part(4, 36, 4, 12, 4, 20);
      part(4, 52, 4, 12, 8, 20);
    }
  };
  image.src = skin;
}

function buildPartFaces(box, uv, isOuter) {
  const [w, h, d] = box.size;
  const inf = isOuter ? 0.35 : 0;
  const x0 = -w / 2 - inf;
  const x1 = w / 2 + inf;
  const y0 = box.yOffset - h - inf;
  const y1 = box.yOffset + inf;
  const z0 = -d / 2 - inf;
  const z1 = d / 2 + inf;
  const [u, v] = uv;
  return [
    { c00: [x0, y1, z1], c10: [x1, y1, z1], c01: [x0, y0, z1], c11: [x1, y0, z1], u0: u + d, v0: v + d, uw: w, vh: h, shade: 1.0, normal: [0, 0, 1] },
    { c00: [x1, y1, z0], c10: [x0, y1, z0], c01: [x1, y0, z0], c11: [x0, y0, z0], u0: u + d + w + d, v0: v + d, uw: w, vh: h, shade: 0.72, normal: [0, 0, -1] },
    { c00: [x1, y1, z1], c10: [x1, y1, z0], c01: [x1, y0, z1], c11: [x1, y0, z0], u0: u + d + w, v0: v + d, uw: d, vh: h, shade: 0.84, normal: [1, 0, 0] },
    { c00: [x0, y1, z0], c10: [x0, y1, z1], c01: [x0, y0, z0], c11: [x0, y0, z1], u0: u, v0: v + d, uw: d, vh: h, shade: 0.86, normal: [-1, 0, 0] },
    { c00: [x0, y1, z0], c10: [x1, y1, z0], c01: [x0, y1, z1], c11: [x1, y1, z1], u0: u + d, v0: v, uw: w, vh: d, shade: 1.08, normal: [0, 1, 0] },
    { c00: [x0, y0, z1], c10: [x1, y0, z1], c01: [x0, y0, z0], c11: [x1, y0, z0], u0: u + d + w, v0: v, uw: w, vh: d, shade: 0.58, normal: [0, -1, 0] },
  ];
}

function renderSkin3dFrame(time, force) {
  const view = $('view-skins');
  if (!force && (!view || !view.classList.contains('is-active'))) return;
  const canvas = $('skin-3d-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  if (!document.body.classList.contains('quieto') && skin3d.spin && !skin3d.dragging) {
    skin3d.yaw += 0.012;
  }

  const walkAngle = (!document.body.classList.contains('quieto') && skin3d.walk)
    ? Math.sin(time * 0.0038) * 0.48
    : 0;
  const bobY = (!document.body.classList.contains('quieto') && skin3d.walk)
    ? Math.abs(Math.cos(time * 0.0038)) * 0.65
    : 0;

  const armW = skin3d.variant === 'slim' ? 3 : 4;
  const armPivotX = 4 + armW / 2;
  const modern = skin3d.modern !== false;

  const parts = [
    { pivot: [0, 6 + bobY, 0], rotX: Math.sin(time * 0.0018) * 0.04, rotY: Math.sin(time * 0.0012) * 0.08, size: [8, 8, 8], yOffset: 8, uv: [0, 0], outer: [32, 0] },
    { pivot: [0, 6 + bobY, 0], rotX: 0, rotY: 0, size: [8, 12, 4], yOffset: 0, uv: [16, 16], outer: modern ? [16, 32] : null },
    { pivot: [-armPivotX, 6 + bobY, 0], rotX: walkAngle, rotY: 0, size: [armW, 12, 4], yOffset: 0, uv: [40, 16], outer: modern ? [40, 32] : null },
    { pivot: [armPivotX, 6 + bobY, 0], rotX: -walkAngle, rotY: 0, size: [armW, 12, 4], yOffset: 0, uv: modern ? [32, 48] : [40, 16], outer: modern ? [48, 48] : null },
    { pivot: [-2, -6 + bobY, 0], rotX: -walkAngle, rotY: 0, size: [4, 12, 4], yOffset: 0, uv: [0, 16], outer: modern ? [0, 32] : null },
    { pivot: [2, -6 + bobY, 0], rotX: walkAngle, rotY: 0, size: [4, 12, 4], yOffset: 0, uv: modern ? [16, 48] : [0, 16], outer: modern ? [0, 48] : null },
  ];

  const cosY = Math.cos(skin3d.yaw);
  const sinY = Math.sin(skin3d.yaw);
  const cosP = Math.cos(skin3d.pitch);
  const sinP = Math.sin(skin3d.pitch);

  const transformPoint = (pt, part) => {
    let [x, y, z] = pt;
    if (part.rotY) {
      const cy = Math.cos(part.rotY);
      const sy = Math.sin(part.rotY);
      const nx = x * cy + z * sy;
      const nz = -x * sy + z * cy;
      x = nx; z = nz;
    }
    if (part.rotX) {
      const cx = Math.cos(part.rotX);
      const sx = Math.sin(part.rotX);
      const ny = y * cx - z * sx;
      const nz = y * sx + z * cx;
      y = ny; z = nz;
    }
    x += part.pivot[0];
    y += part.pivot[1];
    z += part.pivot[2];

    const rx = x * cosY + z * sinY;
    const rz = -x * sinY + z * cosY;
    const ry = y * cosP - rz * sinP;
    const fz = y * sinP + rz * cosP;
    const scale = 8.4 * (54 / (54 - fz * 0.32));
    return [cw / 2 + rx * scale, ch / 2 - ry * scale + 10, fz];
  };

  const quads = [];
  const data = skin3d.pixelData;

  for (const part of parts) {
    const layersList = [false];
    if (skin3d.layers && part.outer) layersList.push(true);
    for (const isOuter of layersList) {
      const faces = buildPartFaces(part, isOuter ? part.outer : part.uv, isOuter);
      for (const face of faces) {
        const p00 = transformPoint(face.c00, part);
        const p10 = transformPoint(face.c10, part);
        const p01 = transformPoint(face.c01, part);
        const crossZ = (p10[0] - p00[0]) * (p01[1] - p00[1]) - (p10[1] - p00[1]) * (p01[0] - p00[0]);
        if (!isOuter && crossZ <= 0) continue;

        const uw = face.uw;
        const vh = face.vh;
        for (let py = 0; py < vh; py++) {
          const ty0 = py / vh;
          const ty1 = (py + 1) / vh;
          for (let px = 0; px < uw; px++) {
            let r = 82, g = 114, b = 74, a = 255;
            if (data) {
              const tx = Math.min(63, Math.max(0, face.u0 + px));
              const ty = Math.min(63, Math.max(0, face.v0 + py));
              const idx = (ty * 64 + tx) * 4;
              a = data[idx + 3];
              if (a < 24) continue;
              r = data[idx];
              g = data[idx + 1];
              b = data[idx + 2];
            } else if (isOuter) {
              continue;
            }
            const tx0 = px / uw;
            const tx1 = (px + 1) / uw;
            const bilerp = (u, v) => [
              face.c00[0] * (1 - u) * (1 - v) + face.c10[0] * u * (1 - v) + face.c01[0] * (1 - u) * v + face.c11[0] * u * v,
              face.c00[1] * (1 - u) * (1 - v) + face.c10[1] * u * (1 - v) + face.c01[1] * (1 - u) * v + face.c11[1] * u * v,
              face.c00[2] * (1 - u) * (1 - v) + face.c10[2] * u * (1 - v) + face.c01[2] * (1 - u) * v + face.c11[2] * u * v,
            ];
            const q0 = transformPoint(bilerp(tx0, ty0), part);
            const q1 = transformPoint(bilerp(tx1, ty0), part);
            const q2 = transformPoint(bilerp(tx1, ty1), part);
            const q3 = transformPoint(bilerp(tx0, ty1), part);
            const zAvg = (q0[2] + q1[2] + q2[2] + q3[2]) * 0.25 + (isOuter ? 0.12 : 0);
            const sr = Math.min(255, Math.round(r * face.shade));
            const sg = Math.min(255, Math.round(g * face.shade));
            const sb = Math.min(255, Math.round(b * face.shade));
            quads.push({ q0, q1, q2, q3, z: zAvg, color: 'rgb(' + sr + ',' + sg + ',' + sb + ')' });
          }
        }
      }
    }
  }

  quads.sort((a, b) => a.z - b.z);
  for (const q of quads) {
    ctx.fillStyle = q.color;
    ctx.strokeStyle = q.color;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(q.q0[0], q.q0[1]);
    ctx.lineTo(q.q1[0], q.q1[1]);
    ctx.lineTo(q.q2[0], q.q2[1]);
    ctx.lineTo(q.q3[0], q.q3[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function initSkin3dStudio() {
  const canvas = $('skin-3d-canvas');
  if (!canvas) return;
  canvas.addEventListener('pointerdown', (e) => {
    skin3d.dragging = true;
    skin3d.lastX = e.clientX;
    skin3d.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!skin3d.dragging) return;
    const dx = e.clientX - skin3d.lastX;
    const dy = e.clientY - skin3d.lastY;
    skin3d.lastX = e.clientX;
    skin3d.lastY = e.clientY;
    skin3d.yaw += dx * 0.014;
    skin3d.pitch = Math.max(-0.85, Math.min(0.85, skin3d.pitch + dy * 0.012));
  });
  const endDrag = () => { skin3d.dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  $('skin-3d-walk').addEventListener('click', () => {
    skin3d.walk = !skin3d.walk;
    $('skin-3d-walk').classList.toggle('is-active', skin3d.walk);
  });
  $('skin-3d-spin').addEventListener('click', () => {
    skin3d.spin = !skin3d.spin;
    $('skin-3d-spin').classList.toggle('is-active', skin3d.spin);
  });
  $('skin-3d-hat').addEventListener('click', () => {
    skin3d.layers = !skin3d.layers;
    $('skin-3d-hat').classList.toggle('is-active', skin3d.layers);
  });
  $('skin-3d-reset').addEventListener('click', () => {
    skin3d.yaw = -0.48;
    skin3d.pitch = 0.22;
  });

  function loop(t) {
    renderSkin3dFrame(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function ensureDefaultWardrobeSkin() {
  if (!state) return [];
  if (!Array.isArray(state.wardrobe)) state.wardrobe = [];
  if (state.playerSkin) {
    const cleanName = state.playerName ? state.playerName : 'Mi skin actual';
    const existingIdx = state.wardrobe.findIndex((w) => w && w.id === 'mi-skin-actual');
    const entry = {
      id: 'mi-skin-actual',
      name: cleanName,
      variant: ($('skin-variant') && $('skin-variant').value === 'slim') ? 'slim' : 'classic',
      createdAt: 'Por defecto',
      dataUrl: state.playerSkin,
    };
    if (existingIdx > 0) {
      state.wardrobe.splice(existingIdx, 1);
      state.wardrobe.unshift(entry);
    } else if (existingIdx === 0) {
      state.wardrobe[0] = Object.assign({}, state.wardrobe[0], entry);
    } else {
      state.wardrobe.unshift(entry);
    }
  }
  return state.wardrobe;
}

function renderWardrobe() {
  const grid = $('wardrobe-grid');
  if (!grid) return;
  grid.replaceChildren();
  const list = ensureDefaultWardrobeSkin();
  $('wardrobe-count').textContent = list.length + (list.length === 1 ? ' guardada' : ' guardadas');
  if (list.length === 0) {
    grid.appendChild(el('p', 'page-lead', 'Aún no tienes skins guardadas.'));
    return;
  }
  if (!skin3d.selectedWardrobeId && list[0]) {
    const first = list[0];
    loadSkin3dTexture(first.dataUrl || first.skin, first.variant, first.name, first.id);
  }
  list.forEach((item, idx) => {
    const skinUrl = item.dataUrl || item.skin;
    const isDefaultFirst = idx === 0;
    const card = el('div', 'wardrobe-item' + (skin3d.selectedWardrobeId === item.id ? ' is-selected' : '') + (isDefaultFirst ? ' is-default-skin' : ''));

    if (isDefaultFirst) {
      card.appendChild(el('span', 'wardrobe-default-badge', item.id === 'mi-skin-actual' ? 'TU SKIN' : 'POR DEFECTO'));
    } else {
      const delBtn = el('button', 'wardrobe-del', '×');
      delBtn.type = 'button';
      delBtn.title = 'Eliminar skin';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await window.ishe.skinWardrobeDelete(item.id);
        if (res && res.wardrobe) {
          state.wardrobe = res.wardrobe;
          if (skin3d.selectedWardrobeId === item.id) {
            skin3d.selectedWardrobeId = '';
            loadSkin3dTexture(state.playerSkin, $('skin-variant').value, '', '');
          }
          renderWardrobe();
        }
      });
      card.appendChild(delBtn);
    }

    const previewWrap = el('div', 'wardrobe-preview');
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 32;
    c.className = 'wardrobe-canvas';
    drawSkin2dPreview(c, skinUrl, 16, 32);
    previewWrap.appendChild(c);
    card.appendChild(previewWrap);

    const nameEl = el('div', 'wardrobe-name', item.name);
    card.appendChild(nameEl);
    card.appendChild(el('div', 'wardrobe-meta', (isDefaultFirst ? 'Por defecto · ' : '') + (item.variant === 'slim' ? 'Alex' : 'Steve')));

    card.addEventListener('click', async () => {
      loadSkin3dTexture(skinUrl, item.variant, item.name, item.id);
      renderWardrobe();
      await equipWardrobeItem(item);
    });
    grid.appendChild(card);
  });
}

let equipWardrobeItem = async () => {};

// ---- Galeria de capturas (comunidad + locales) -------------------------------------

let activePhotoModal = null;

function openPhotoModal(item) {
  activePhotoModal = item;
  $('photo-modal-img').setAttribute('src', item.dataUrl);
  $('photo-modal-title').textContent = item.title || 'Captura de Reshem';
  $('photo-modal-meta').textContent = (item.author ? 'Por ' + item.author : 'Captura local') + (item.date ? ' · ' + item.date : '');
  $('photo-modal-share').hidden = item.source === 'community' || Boolean(item.shared);
  $('photo-modal-copy').textContent = 'Copiar foto';
  $('photo-modal').hidden = false;
}

function closePhotoModal() {
  $('photo-modal').hidden = true;
  activePhotoModal = null;
}

function buildPhotoCard(item, compact) {
  const card = el('article', 'photo-card' + (compact ? ' is-compact' : ''));
  const imgWrap = el('div', 'photo-thumb-wrap');
  const img = document.createElement('img');
  img.className = 'photo-thumb';
  img.setAttribute('src', item.dataUrl);
  img.setAttribute('alt', item.title || 'Captura');
  imgWrap.appendChild(img);
  if (item.badge) imgWrap.appendChild(el('span', 'photo-badge', item.badge));
  card.appendChild(imgWrap);

  const body = el('div', 'photo-body');
  body.appendChild(el('strong', 'photo-title', item.title || 'Captura'));
  body.appendChild(el('span', 'photo-meta', (item.author ? item.author : 'En tu PC') + (item.date ? ' · ' + item.date : '')));
  card.appendChild(body);

  card.addEventListener('click', () => openPhotoModal(item));
  return card;
}

function renderGallery() {
  const gallery = (state && state.gallery) || { community: [], local: [] };
  const shared = gallery.community || gallery.shared || [];
  const local = gallery.local || [];
  const bgCheck = $('background-check');
  if (bgCheck && state) bgCheck.checked = state.runInBackground !== false;
  const autoCheck = $('gallery-auto-check');
  if (autoCheck && state) {
    autoCheck.checked = state.autoUploadScreenshots !== false;
  }

  const homeBox = $('home-gallery');
  if (homeBox) {
    homeBox.replaceChildren();
    const badges = ['EN VIVO', 'SHADERS BSL', 'EXPLORACIÓN'];
    shared.slice(0, 3).forEach((item, idx) => {
      const copy = Object.assign({ badge: item.badge || badges[idx % badges.length] }, item);
      homeBox.appendChild(buildPhotoCard(copy, true));
    });
  }

  const commBox = $('gallery-community');
  if (commBox) {
    commBox.replaceChildren();
    for (const item of shared) {
      commBox.appendChild(buildPhotoCard(item, false));
    }
    if (shared.length === 0) commBox.appendChild(el('div', 'gallery-empty', 'Sin fotos compartidas aún.'));
  }

  const localBox = $('gallery-local');
  if (localBox) {
    localBox.replaceChildren();
    for (const item of local) {
      localBox.appendChild(buildPhotoCard(item, false));
    }
    if (local.length === 0) {
      localBox.appendChild(el('div', 'gallery-empty', 'Pulsa F2 dentro del juego para guardar y subir tus capturas automáticamente.'));
    }
  }
}

// ---- Cuenta y estado del servidor --------------------------------------------------

function renderAccount() {
  const avatar = $('account-avatar');
  const name = state.playerName;
  if (!state.signedIn) {
    $('account-name').textContent = 'Sin sesión';
    $('account-sub').textContent = 'Microsoft';
    $('account-button').textContent = 'Entrar';
  } else {
    $('account-name').textContent = name || 'Tu cuenta';
    $('account-sub').textContent = state.pendingApproval ? 'Esperando a Mojang' : 'En línea';
    $('account-button').textContent = 'Salir';
  }
  const canType = Boolean(state.signedIn && state.pendingApproval);
  $('account-name-link').hidden = !(canType && !name);
  avatar.textContent = state.signedIn && name ? name[0].toUpperCase() : '?';
  avatar.classList.toggle('is-empty', !(state.signedIn && name));
  drawFace(state.playerSkin);
  drawBody(state.playerSkin);
  ensureDefaultWardrobeSkin();
  if (!skin3d.selectedWardrobeId || skin3d.selectedWardrobeId === 'mi-skin-actual') {
    const first = state.wardrobe && state.wardrobe[0];
    if (first) {
      loadSkin3dTexture(first.dataUrl || first.skin, first.variant, first.name, first.id);
    } else {
      loadSkin3dTexture(state.playerSkin, $('skin-variant').value, name || 'Tu personaje', '');
    }
  }
  renderWardrobe();
  $('skin-title').textContent = state.signedIn && name ? 'Skin · ' + name : 'Nueva skin';
}

/** Dibuja el personaje entero (de frente, con sus capas) en la tarjeta de la skin. */
function drawBody(skin) {
  const canvas = $('skin-canvas');
  if (!skin) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 16, 32);
    context.fillStyle = '#34452f';
    for (const [x, y, w, h] of [[4, 0, 8, 8], [4, 8, 8, 12], [0, 8, 4, 12], [12, 8, 4, 12], [4, 20, 4, 12], [8, 20, 4, 12]]) context.fillRect(x, y, w, h);
    canvas.classList.add('is-empty');
    delete canvas.dataset.source;
    return;
  }
  if (canvas.dataset.source === skin) return;
  const image = new Image();
  image.onload = () => {
    if (state.playerSkin !== skin || image.width < 64 || image.width % 64 !== 0) return;
    const unit = image.width / 64;
    const modern = image.height >= image.width;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, 16, 32);
    const part = (sx, sy, w, h, dx, dy, flip) => {
      if (!flip) {
        context.drawImage(image, sx * unit, sy * unit, w * unit, h * unit, dx, dy, w, h);
        return;
      }
      context.save();
      context.translate(dx + w, dy);
      context.scale(-1, 1);
      context.drawImage(image, sx * unit, sy * unit, w * unit, h * unit, 0, 0, w, h);
      ctx.restore();
    };
    part(8, 8, 8, 8, 4, 0);
    part(20, 20, 8, 12, 4, 8);
    part(44, 20, 4, 12, 0, 8);
    part(modern ? 36 : 44, modern ? 52 : 20, 4, 12, 12, 8, !modern);
    part(4, 20, 4, 12, 4, 20);
    part(modern ? 20 : 4, modern ? 52 : 20, 4, 12, 8, 20, !modern);
    part(40, 8, 8, 8, 4, 0);
    if (modern) {
      part(20, 36, 8, 12, 4, 8);
      part(44, 36, 4, 12, 0, 8);
      part(52, 52, 4, 12, 12, 8);
      part(4, 36, 4, 12, 4, 20);
      part(4, 52, 4, 12, 8, 20);
    }
    canvas.dataset.source = skin;
    canvas.classList.remove('is-empty');
  };
  image.src = skin;
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
    const data = context.getImageData(0, 0, 8, 8).data;
    const pixel = (x, y) => Array.from(data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)).join('.');
    document.body.dataset.face = pixel(0, 0) + '|' + pixel(3, 3) + '|' + pixel(7, 7);
  };
  image.src = skin;
}

// Estado del servidor de Ishe (se pregunta cada pocos segundos). Con el juego directo, si esta cerrado JUGAR se pone gris.
let serverState = { watching: false, online: true, players: 0, max: 0, sample: [] };

function directToServer() {
  return Boolean(state && state.signedIn && !state.pendingApproval && state.joinServer && state.server);
}

function serverClosed() {
  return directToServer() && serverState.watching && !serverState.online;
}

function renderServerWidgets() {
  const dot = $('sidebar-server-dot');
  const heroDot = $('hero-server-dot');
  const statusEl = $('sidebar-server-label');
  const pingEl = $('sidebar-server-ping');
  const playersEl = $('sidebar-server-players');
  const pill = $('server-live-pill');
  const pillText = $('hero-server-text');
  const chips = $('server-players-chips');
  if (!dot || !statusEl || !playersEl || !pill || !pillText || !chips) return;

  chips.replaceChildren();
  if (!serverState.watching) {
    dot.className = 'server-dot is-idle';
    if (heroDot) heroDot.className = 'server-dot is-idle';
    statusEl.textContent = 'Reshem Server';
    if (pingEl) pingEl.textContent = '';
    playersEl.textContent = 'Fabric 26.2';
    pill.className = 'server-live-pill';
    pillText.textContent = 'Servidor Oficial · 26.2';
    chips.hidden = true;
    return;
  }

  if (serverState.online) {
    const pingText = serverState.ms ? serverState.ms + ' ms' : '';
    const countText = serverState.players + (serverState.max ? '/' + serverState.max : '') + ' en línea';
    dot.className = 'server-dot is-online';
    if (heroDot) heroDot.className = 'server-dot is-online';
    statusEl.textContent = 'Abierto';
    if (pingEl) pingEl.textContent = pingText;
    playersEl.textContent = countText;
    pill.className = 'server-live-pill is-online';
    pillText.textContent = 'Abierto · ' + countText + (pingText ? ' · ' + pingText : '');
    const sample = Array.isArray(serverState.sample) ? serverState.sample : [];
    for (const pName of sample.slice(0, 8)) {
      chips.appendChild(el('span', 'player-chip', pName));
    }
    chips.hidden = sample.length === 0;
  } else {
    dot.className = 'server-dot is-offline';
    if (heroDot) heroDot.className = 'server-dot is-offline';
    statusEl.textContent = 'Cerrado';
    if (pingEl) pingEl.textContent = '';
    playersEl.textContent = 'Fuera de línea';
    pill.className = 'server-live-pill is-offline';
    pillText.textContent = 'Servidor apagado';
    chips.hidden = true;
  }
}

async function pollServer() {
  let next = null;
  try { next = await window.ishe.serverStatus(); } catch (_) { next = null; }
  if (!next) return;
  const before = serverClosed();
  serverState = next;
  renderServerWidgets();
  refreshPlayButton();
  if (!running && !(state && state.gameRunning) && document.getElementById('notice').hidden && before !== serverClosed()) idleStatus();
}

function refreshPlayButton() {
  const button = $('play');
  const closed = serverClosed();
  button.disabled = running || Boolean(state && state.gameRunning) || closed;
  button.title = closed ? 'El servidor está apagado ahora mismo.' : '';
  button.textContent = running ? 'PREPARANDO…' : (state && state.gameRunning ? 'JUGANDO' : (closed ? 'CERRADO' : 'JUGAR'));
  $('account-button').disabled = running;
}

function idleStatus() {
  if (state.gameRunning) {
    setStatus('Minecraft en ejecución.', 'good');
  } else if (serverClosed()) {
    setStatus('Servidor cerrado. Se activará al abrir.', 'warn');
  } else if (directToServer() && serverState.watching && serverState.online) {
    setStatus('Servidor abierto' + (serverState.players > 0 ? ' · ' + serverState.players + ' jugando' : '') + (state.playerName ? ' · ' + state.playerName : ''), 'good');
  } else if (state.signedIn && !state.pendingApproval) {
    setStatus('Listo para jugar' + (state.playerName ? ' como ' + state.playerName : '') + '.');
  } else if (state.signedIn) {
    setStatus((state.playerName ? 'Hola, ' + state.playerName + '. ' : '') + 'Pendiente de aprobación de Mojang.');
  } else if (!state.minecraftFound) {
    setStatus('Inicia sesión con Microsoft para entrar al servidor.', 'warn');
  } else {
    setStatus('Listo para preparar y abrir Reshem.');
  }
}

function applyState(next) {
  state = next;
  $('foot-version').textContent = 'Reshem Client ' + state.appVersion;
  $('foot-mc').textContent = 'Minecraft ' + state.mcVersion + ' · Fabric';
  renderNews(state.news);
  renderMods(state.installed);
  renderSettings();
  applyTheme(state.theme);
  renderUpdate();
  renderCreator();
  renderAccount();
  renderGallery();
  renderServerWidgets();
  refreshPlayButton();
}

function updateScrollParallax() {
  const mainEl = document.querySelector('.main');
  if (!mainEl) return;
  const maxScroll = Math.max(1, mainEl.scrollHeight - mainEl.clientHeight);
  const progress = maxScroll > 4
    ? Math.min(1, Math.max(0, mainEl.scrollTop / Math.min(maxScroll, 520)))
    : 0;
  document.documentElement.style.setProperty('--scroll-p', progress.toFixed(4));
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
  const mainEl = document.querySelector('.main');
  if (mainEl) {
    mainEl.scrollTop = 0;
    updateScrollParallax();
  }
}

function setProgress(done, total) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const percent = Math.max(4, Math.round(ratio * 100)) + '%';
  $('progress-bar').style.width = percent;
  $('loading-bar').style.width = percent;
}

function handleEvent(event) {
  if (!event || typeof event !== 'object') return;
  if (event.type === 'step') {
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
  } else if (event.type === 'gallery') {
    if (state && event.gallery) {
      state.gallery = event.gallery;
      renderGallery();
      if (event.autoUploaded && $('gallery-status')) {
        $('gallery-status').textContent = '¡Captura subida automáticamente a la galería de la comunidad!';
      }
    }
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
  if (!loginOpen) return;
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
  setStatus('Sesión cerrada. Reshem Client ya no guarda nada de tu cuenta.');
  bump('logoutDone');
}

function gameExited(event) {
  if (event.launchId) exitedLaunches.add(event.launchId);
  if (event.state) applyState(event.state);
  if (event.failed) {
    setStatus('Minecraft se cerró con un error' + (event.code === null || event.code === undefined ? '.' : ' (código ' + event.code + ').'), 'bad');
    showNotice('bad', 'El juego se cerró con un error',
      'Estas son sus últimas líneas. El registro completo está en logs/latest.log, dentro de la carpeta de Reshem Client (Ajustes).', event.tail || []);
  } else {
    setStatus('Minecraft se cerró. Pulsa Jugar para volver a entrar.');
  }
  bump('gameExits');
}

function showResult(result) {
  if (!result || result.status === 'busy') return;
  if (result.status === 'launched' && exitedLaunches.has(result.launchId)) return;
  if (result.state) applyState(result.state);
  const problems = result.problems || [];
  const pending = result.handoff === 'pending-approval';

  if (result.status === 'server-closed') {
    serverState = { watching: true, online: false, players: 0, max: 0, sample: [] };
    renderServerWidgets();
    refreshPlayButton();
    setStatus('Reshem server está cerrado ahora mismo. Cuando el dueño lo abra, JUGAR se enciende solo.', 'warn');
    return;
  }
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
        (pending ? PENDING_TEXT + ' ' : '') + 'No pude abrir el launcher oficial de Minecraft. Ábrelo, elige el perfil «Reshem Client» y pulsa Jugar.', problems);
    } else {
      setStatus(result.opened === 'opened'
        ? 'Listo. Se abrió el launcher oficial de Minecraft.'
        : 'El juego está preparado. Abriendo el launcher oficial de Minecraft…', 'good');
      showNotice(problems.length ? '' : 'good',
        problems.length ? 'Último paso (hubo avisos)' : 'Último paso',
        (pending ? PENDING_TEXT + ' ' : '') + 'En el launcher oficial elige el perfil «Reshem Client» y pulsa Jugar. Si no se abrió solo, ábrelo tú.', problems);
    }
    return;
  }
  if (result.status === 'needs-close') {
    setStatus('Falta un paso: cierra el launcher oficial.', 'warn');
    showNotice('', 'Cierra el launcher oficial de Minecraft',
      (pending ? PENDING_TEXT + ' ' : '') + 'Los mods ya están listos. Para añadir el perfil «Reshem Client» el launcher oficial tiene que estar cerrado del todo. Ciérralo y vuelve a pulsar Jugar.',
      problems.filter((p) => !p.includes('está abierto')));
    return;
  }
  if (result.status === 'no-profile') {
    setStatus('No pude añadir el perfil al launcher oficial.', 'warn');
    showNotice('', 'Falta el perfil «Reshem Client»',
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
  showLoading();
  try {
    showResult(await window.ishe.play());
  } catch (error) {
    setStatus('No se pudo preparar el juego.', 'bad');
    showNotice('bad', 'Error inesperado', String(error && error.message ? error.message : error), []);
  } finally {
    running = false;
    hideLoading();
    refreshPlayButton();
    $('progress').hidden = true;
    bump('playDone');
  }
}

// ---- gatitos que pasean por abajo (máximo 4 en pantalla, cada uno con nombre editable) ----

const PELAJES = [['crema', 'Crema'], ['naranja', 'Naranja'], ['negro', 'Negro'], ['siames', 'Siamés'], ['gris', 'Gris'],
  ['blanco', 'Blanco'], ['esmoquin', 'Esmoquin'], ['carey', 'Carey'], ['atigrado', 'Atigrado'], ['tricolor', 'Tricolor']];
const NOMBRES = {
  crema: 'Michi', naranja: 'Tigre', negro: 'Sombra', siames: 'Luna', gris: 'Bruma',
  blanco: 'Copo', esmoquin: 'Fígaro', carey: 'Canela', atigrado: 'Raya', tricolor: 'Miel',
};
const MAULLIDOS = ['miau', '¡miau!', 'prrr…', 'mrrp', 'miau miau'];
const MAX_GATOS_PANTALLA = 4;
const catPrefs = {
  pelaje: 'crema',
  nombre: 'Michi',
  elegidos: ['negro', 'siames', 'naranja', 'crema'],
  nombres: Object.assign({}, NOMBRES),
  activos: true,
  quieto: false,
};

function isValidCoat(id) {
  return PELAJES.some((p) => p[0] === id);
}

function getCatName(id) {
  const custom = catPrefs.nombres && typeof catPrefs.nombres[id] === 'string' ? catPrefs.nombres[id].trim() : '';
  return custom || NOMBRES[id] || 'Michi';
}

function loadCatPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('ishe.gatito') || '{}');
    if (isValidCoat(saved.pelaje)) catPrefs.pelaje = saved.pelaje;
    if (saved.nombres && typeof saved.nombres === 'object') {
      for (const [id] of PELAJES) {
        if (typeof saved.nombres[id] === 'string' && saved.nombres[id].trim()) {
          catPrefs.nombres[id] = saved.nombres[id].trim().slice(0, 14);
        }
      }
    }
    if (typeof saved.nombre === 'string' && saved.nombre.trim()) {
      catPrefs.nombre = saved.nombre.trim().slice(0, 14);
      if (!saved.nombres || !saved.nombres[catPrefs.pelaje]) {
        catPrefs.nombres[catPrefs.pelaje] = catPrefs.nombre;
      }
    }
    if (Array.isArray(saved.elegidos)) {
      const valid = [];
      for (const c of saved.elegidos) {
        if (isValidCoat(c) && !valid.includes(c) && valid.length < MAX_GATOS_PANTALLA) valid.push(c);
      }
      if (valid.length > 0) catPrefs.elegidos = valid;
    } else if (!catPrefs.elegidos.includes(catPrefs.pelaje)) {
      catPrefs.elegidos[catPrefs.elegidos.length - 1] = catPrefs.pelaje;
    }
    catPrefs.nombre = getCatName(catPrefs.pelaje);
    if (saved.activos === false) catPrefs.activos = false;
    if (saved.quieto === true) catPrefs.quieto = true;
  } catch (_) { /* sin almacenamiento: se usan los valores por defecto */ }
}

function saveCatPrefs() {
  try { localStorage.setItem('ishe.gatito', JSON.stringify(catPrefs)); } catch (_) { /* no pasa nada */ }
}

function setElementCoat(node, coatId) {
  if (!node || !coatId) return;
  node.dataset.pelaje = coatId;
  if (node.classList.contains('pelo-' + coatId)) return;
  for (const [id] of PELAJES) node.classList.remove('pelo-' + id);
  node.classList.add('pelo-' + coatId);
}

function applyCatPrefs() {
  const chosen = (catPrefs.elegidos && catPrefs.elegidos.length ? catPrefs.elegidos : ['negro', 'siames', 'naranja', catPrefs.pelaje]).slice(0, MAX_GATOS_PANTALLA);
  const stripCats = document.querySelectorAll('.gatitos .gato');
  stripCats.forEach((node, idx) => {
    const coat = chosen[idx];
    if (coat) {
      node.hidden = false;
      setElementCoat(node, coat);
    } else {
      node.hidden = true;
    }
  });
  const sentado = $('gato-sentado');
  if (sentado) setElementCoat(sentado, catPrefs.pelaje);
  const counter = $('cat-slot-counter');
  if (counter) counter.textContent = '(' + chosen.length + '/' + MAX_GATOS_PANTALLA + ')';
  document.body.classList.toggle('sin-gatos', !catPrefs.activos);
  document.body.classList.toggle('quieto', catPrefs.quieto);
}

function renderCatSettings() {
  const box = $('pelajes');
  box.replaceChildren();
  const chosen = catPrefs.elegidos || [];
  for (const [id, label] of PELAJES) {
    const isFocused = id === catPrefs.pelaje;
    const slotIdx = chosen.indexOf(id);
    const isOnScreen = slotIdx !== -1;
    const button = el('button', 'pelaje' + (isOnScreen ? ' is-on-screen' : ''));
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(isFocused));
    button.dataset.coat = id;

    const badge = el('span', 'pelaje-badge' + (isOnScreen ? ' is-active' : ''), isOnScreen ? '✓ ' + (slotIdx + 1) : '+');
    badge.title = isOnScreen
      ? 'En pantalla (clic para quitar de los 4 activos)'
      : 'Clic para mostrar en pantalla (máx. 4)';
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = catPrefs.elegidos.indexOf(id);
      if (idx !== -1) {
        if (catPrefs.elegidos.length > 1) catPrefs.elegidos.splice(idx, 1);
      } else if (catPrefs.elegidos.length < MAX_GATOS_PANTALLA) {
        catPrefs.elegidos.push(id);
      } else {
        catPrefs.elegidos[MAX_GATOS_PANTALLA - 1] = id;
      }
      catPrefs.pelaje = id;
      catPrefs.nombre = getCatName(id);
      saveCatPrefs();
      applyCatPrefs();
      renderCatSettings();
    });
    button.appendChild(badge);

    const cat = el('span', 'gato pelo-' + id + ' st-sit');
    cat.appendChild(el('span', 'sprite'));
    button.appendChild(cat);
    buildSprites(button);

    button.appendChild(el('span', 'pelaje-name', getCatName(id)));
    button.appendChild(el('span', 'pelaje-sub', label));

    button.addEventListener('click', () => {
      const wasFocused = catPrefs.pelaje === id;
      const idx = catPrefs.elegidos.indexOf(id);
      catPrefs.pelaje = id;
      if (idx === -1) {
        if (catPrefs.elegidos.length < MAX_GATOS_PANTALLA) {
          catPrefs.elegidos.push(id);
        } else {
          catPrefs.elegidos[MAX_GATOS_PANTALLA - 1] = id;
        }
      } else if (wasFocused && catPrefs.elegidos.length > 1) {
        catPrefs.elegidos.splice(idx, 1);
      }
      catPrefs.nombre = getCatName(id);
      saveCatPrefs();
      applyCatPrefs();
      renderCatSettings();
      $('gato-nombre').focus();
    });
    box.appendChild(button);
  }
  const activeLabel = (PELAJES.find((p) => p[0] === catPrefs.pelaje) || ['crema', 'Crema'])[1];
  const nameLabel = $('gato-nombre-label');
  if (nameLabel) nameLabel.textContent = 'Nombre (' + activeLabel + '):';
  $('gato-nombre').value = getCatName(catPrefs.pelaje);
  $('gato-nombre').placeholder = NOMBRES[catPrefs.pelaje] || 'Michi';
  $('gatitos-activos').checked = catPrefs.activos;
  $('animaciones-pausa').checked = catPrefs.quieto;
}

function catFx(target, text, hearts) {
  const layer = $('gatitos-fx');
  if (layer.children.length > 16) return;
  const rect = target.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  if (text) {
    const bubble = el('div', 'burbuja', text);
    bubble.style.left = Math.round(center) + 'px';
    bubble.style.top = Math.max(4, Math.round(rect.top - 24)) + 'px';
    layer.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1900);
  }
  for (let i = 0; i < hearts; i++) {
    const heart = el('span', 'corazon');
    heart.style.left = Math.round(center - 13 + (i - 1) * 20) + 'px';
    heart.style.top = Math.max(4, Math.round(rect.top - 30)) + 'px';
    heart.style.animationDelay = (i * 0.18) + 's';
    layer.appendChild(heart);
    setTimeout(() => heart.remove(), 1700 + i * 180);
  }
}

const POSES = ['walk', 'run', 'sit', 'groom', 'sleep', 'ovillo', 'stretch', 'crouch', 'scratch', 'yawn'];

function buildSprites(root) {
  for (const sprite of root.querySelectorAll('.sprite')) {
    if (sprite.childElementCount) continue;
    for (const layer of ['o', 'b', 's', 't', 'm', '1', '2', 'd', 'l', 'e', 'n', 'i', 'u']) sprite.appendChild(el('i', 'l-' + layer));
  }
}

function startCats() {
  const strip = document.querySelector('.gatitos');
  if (!strip) return;
  const PERSONALITY = {
    negro: { speed: 28, rest: { sit: 3, sleep: 2, ovillo: 2, groom: 2, yawn: 1, stretch: 1 }, pause: [4500, 10000], walk: [6000, 13000] },
    siames: { speed: 42, rest: { groom: 4, sit: 2, scratch: 2, stretch: 2, yawn: 1 }, pause: [2800, 6500], walk: [4500, 9500] },
    naranja: { speed: 58, rest: { crouch: 3, run: 3, sit: 1, groom: 1, stretch: 2 }, pause: [1400, 3600], walk: [5000, 11000] },
    gris: { speed: 32, rest: { sleep: 3, ovillo: 3, yawn: 2, stretch: 2, sit: 2 }, pause: [6000, 14000], walk: [4000, 8500] },
    tuyo: { speed: 38, rest: { sit: 3, groom: 2, stretch: 2, yawn: 1, crouch: 2, run: 2 }, pause: [2600, 7500], walk: [4500, 10000] },
  };
  const DURATION = { crouch: [1000, 1800], run: [1500, 2800], yawn: [1500, 2400], stretch: [1800, 2900], scratch: [1800, 3400] };
  const between = (range) => range[0] + Math.random() * (range[1] - range[0]);
  const pick = (weights) => {
    const entries = Object.entries(weights);
    let roll = Math.random() * entries.reduce((sum, entry) => sum + entry[1], 0);
    for (const [name, weight] of entries) { roll -= weight; if (roll < 0) return name; }
    return entries[0][0];
  };
  let width = strip.clientWidth || 760;
  const now = performance.now();
  const INITIAL_STATES = ['sit', 'walk', 'run', 'groom'];
  const cats = [...strip.querySelectorAll('.gato')].map((node, idx, arr) => {
    const base = ['negro', 'siames', 'naranja', 'gris'].find((n) => node.classList.contains(n)) || 'tuyo';
    const slotW = Math.max(120, (width - 80) / Math.max(1, arr.length));
    return {
      el: node,
      base,
      p: PERSONALITY[base] || PERSONALITY.tuyo,
      x: Math.min(Math.max(8, Math.round((idx + 0.25) * slotW)), Math.max(8, width - 80)),
      y: 0,
      vy: 0,
      dir: idx % 2 === 0 ? 1 : -1,
      state: INITIAL_STATES[idx % INITIAL_STATES.length],
      until: now + between([1200, 4800]),
      fxAt: 0,
    };
  });
  const keepInside = (cat) => {
    const catWidth = cat.el.offsetWidth || 72;
    if (cat.x < 4) { cat.x = 4; if (cat.state === 'walk' || cat.state === 'run') { cat.dir = 1; cat.el.classList.remove('izq'); } }
    if (cat.x > width - catWidth - 4) { cat.x = Math.max(4, width - catWidth - 4); if (cat.state === 'walk' || cat.state === 'run') { cat.dir = -1; cat.el.classList.add('izq'); } }
  };
  window.addEventListener('resize', () => {
    width = strip.clientWidth || 760;
    for (const cat of cats) {
      keepInside(cat);
      cat.el.style.transform = 'translate3d(' + Math.round(cat.x) + 'px,' + Math.round(-cat.y) + 'px,0)';
    }
  });
  const nameOf = (cat) => {
    const coat = cat.el.dataset.pelaje || (cat.base === 'tuyo' ? catPrefs.pelaje : cat.base);
    return getCatName(coat);
  };
  function setState(cat, nextState, at) {
    const prev = cat.state;
    cat.state = nextState;
    cat.until = at + between(DURATION[nextState] || (nextState === 'walk' ? cat.p.walk : cat.p.pause));
    cat.el.classList.remove(...POSES.map((pose) => 'st-' + pose));
    cat.el.classList.add('st-' + nextState);
    if (nextState === 'walk' && Math.random() < 0.4) cat.dir = -cat.dir;
    if (nextState === 'run' && prev === 'crouch') {
      cat.vy = 115; // salto de caza al arrancar a correr
    }
    cat.el.classList.toggle('izq', cat.dir < 0);
  }
  function next(cat) {
    if (cat.state === 'crouch') return 'run';
    if (cat.state === 'yawn') return Math.random() < 0.6 ? (Math.random() < 0.5 ? 'sleep' : 'ovillo') : 'sit';
    if (cat.state === 'walk') return pick(cat.p.rest);
    return 'walk';
  }
  cats.forEach((cat, idx) => {
    const initSt = INITIAL_STATES[idx % INITIAL_STATES.length];
    setState(cat, initSt, now);
    if (idx === 0) cat.until = now + between([1200, 2600]);
    cat.el.style.transform = 'translate3d(' + Math.round(cat.x) + 'px,0,0)';
    cat.el.addEventListener('mouseenter', () => {
      const t = performance.now();
      if (t - now < 2200) return;
      if (cat.state !== 'sit') setState(cat, 'sit', t);
      cat.until = t + 2600;
      if (t - cat.fxAt > 1500) { cat.fxAt = t; catFx(cat.el, nameOf(cat), 0); }
    });
    cat.el.addEventListener('click', () => {
      const t = performance.now();
      cat.vy = 95;
      if (cat.state !== 'sit') setState(cat, 'sit', t);
      cat.until = t + 3800;
      cat.fxAt = t;
      catFx(cat.el, MAULLIDOS[Math.floor(Math.random() * MAULLIDOS.length)], 3);
    });
  });
  let last = now;
  function frame(time) {
    const dt = Math.min(100, time - last);
    last = time;
    if (!document.body.classList.contains('quieto') && !document.body.classList.contains('sin-gatos')) {
      for (const cat of cats) {
        if (cat.el.hidden) continue;
        if (cat.el.classList.contains('st-walk') && cat.state !== 'walk') {
          cat.state = 'walk';
          cat.until = Math.max(cat.until, time + 3000);
        }
        if (cat.state === 'walk' || cat.state === 'run') {
          cat.x += cat.dir * cat.p.speed * (cat.state === 'run' ? 2.5 : 1) * dt / 1000;
        }
        if (cat.y > 0 || cat.vy !== 0) {
          cat.y += cat.vy * (dt / 1000);
          cat.vy -= 380 * (dt / 1000);
          if (cat.y <= 0) { cat.y = 0; cat.vy = 0; }
        }
        keepInside(cat);
        if (time > cat.until) setState(cat, next(cat), time);
        cat.el.style.transform = 'translate3d(' + Math.round(cat.x) + 'px,' + Math.round(-cat.y) + 'px,0)';
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---- escena segun la hora (noche, dia, ocaso) ---------------------------------------

function applyMomento() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  let momento = 'dia';
  if (hour < 6 || hour >= 20) momento = 'noche'; else if (hour < 8 || hour >= 17) momento = 'ocaso';
  document.body.dataset.momento = momento;
  const t = Math.min(1, Math.max(0, momento === 'noche' ? (hour >= 20 ? hour - 20 : hour + 4) / 10 : (hour - 6) / 14));
  const astro = $('hero-astro');
  astro.style.left = (6 + t * 82).toFixed(1) + '%';
  astro.style.top = Math.round(78 - Math.sin(Math.PI * t) * 58) + 'px';
}

// ---- pantalla de carga -------------------------------------------------------------

const TIPS = [
  'Pulsa sobre un gatito para acariciarlo.',
  'Los creepers huyen de los gatos. Por eso aquí no hay ninguno.',
  'Más memoria ayuda con muchos mods, pero no uses más de la mitad de la de tu PC.',
  'En la pestaña Aspectos puedes girar tu personaje en 3D y guardar todas tus skins.',
  'En la pestaña Capturas puedes ver y compartir fotos del servidor con todos.',
  'La primera vez tarda más: se descargan el juego y los mods. Las siguientes son rápidas.',
  'A los gatos les encanta dormir en una cama. En Ajustes eliges cómo es el tuyo.',
  'Reshem Client busca versiones nuevas cada vez que lo abres.',
];
let tipTimer = 0;
let tipIndex = 0;

function showLoading() {
  tipIndex = Math.floor(Math.random() * TIPS.length);
  $('loading-tip').textContent = TIPS[tipIndex];
  clearInterval(tipTimer);
  tipTimer = setInterval(() => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    $('loading-tip').textContent = TIPS[tipIndex];
  }, 5000);
  $('loading').hidden = false;
  document.body.classList.add('cargando');
  $('loading-hide').focus();
}

function hideLoading() {
  clearInterval(tipTimer);
  $('loading').hidden = true;
  document.body.classList.remove('cargando');
}

async function init() {
  window.ishe.onEvent(handleEvent);
  initSkin3dStudio();
  applyState(await window.ishe.getState());
  idleStatus();
  if (state.updateFellBackFrom) {
    showNotice('', 'Se volvió a la versión anterior',
      'La versión ' + state.updateFellBackFrom + ' no pudo abrirse en este equipo, así que Reshem Client sigue con la ' + state.appVersion + '. Avísale a quien la publicó.', []);
  } else if (state.signedIn && state.pendingApproval) {
    showNotice('', 'Falta la aprobación de Mojang', PENDING_TEXT, []);
  }

  for (const item of document.querySelectorAll('.nav-item')) {
    item.addEventListener('click', () => showView(item.dataset.view));
  }
  const mainEl = document.querySelector('.main');
  if (mainEl) {
    mainEl.addEventListener('scroll', updateScrollParallax, { passive: true });
    window.addEventListener('resize', updateScrollParallax, { passive: true });
    updateScrollParallax();
  }
  $('hero-open-skins').addEventListener('click', () => showView('skins'));
  $('settings-open-skins').addEventListener('click', () => showView('skins'));
  $('play').addEventListener('click', play);
  $('toggle-log').addEventListener('click', () => {
    const log = $('log');
    log.hidden = !log.hidden;
    $('toggle-log').textContent = log.hidden ? 'Ver detalles' : 'Ocultar detalles';
  });
  $('mods-search').addEventListener('input', (event) => {
    modsFilterQuery = event.target.value || '';
    renderMods(state.installed);
  });
  $('ram').addEventListener('change', async (event) => {
    const gigabytes = Number(event.target.value);
    const saved = await window.ishe.setRam(gigabytes);
    if (saved) state.ramGb = gigabytes;
    $('ram-hint').textContent = saved
      ? 'Guardado. Se aplica la próxima vez que pulses Jugar.'
      : 'No se pudo guardar el cambio.';
  });
  $('shaders-toggle').addEventListener('click', async () => {
    const enabled = state.shadersEnabled === false;
    const saved = await window.ishe.setShaders(enabled);
    if (saved && saved.ok !== false) {
      state.shadersEnabled = enabled;
      renderSettings();
    }
    $('shaders-hint').textContent = saved && saved.ok !== false
      ? (enabled ? 'Shaders BSL activados para la próxima partida.' : 'Modo altos FPS activado (sin shaders al arrancar).')
      : 'No se pudo guardar el ajuste de shaders.';
  });
  $('repair-mods').addEventListener('click', async () => {
    $('repair-mods').disabled = true;
    $('shaders-hint').textContent = 'Limpiando caché de mods…';
    const res = await window.ishe.repairMods();
    $('repair-mods').disabled = false;
    if (res && res.state) applyState(res.state);
    $('shaders-hint').textContent = res && res.ok
      ? 'Listo. Caché de mods limpiada. Pulsa Jugar en Inicio para verificar todo.'
      : 'No se pudo limpiar la caché.';
  });

  // ---- skin y guardarropa
  const SKIN_MESSAGES = {
    'no-session': 'Inicia sesión primero (arriba a la izquierda) para equiparla en tu cuenta de Minecraft.',
    'session': 'Tu sesión caducó: vuelve a iniciar sesión.',
    'invalid': 'Esa imagen no vale: tiene que ser un PNG de 64×64 (o 64×32) y pesar poco.',
    'unreadable': 'No pude leer ese archivo.',
    'network': 'Sin conexión con Mojang. Inténtalo otra vez.',
    'refused': 'Mojang no aceptó el cambio. Inténtalo en un rato.',
    'name-invalid': 'Ese nombre no es válido (letras, números y guion bajo, hasta 16).',
    'name-not-found': 'No encontré a ese jugador.',
    'no-skin': 'Ese jugador no tiene una skin propia que copiar.',
  };
  async function changeSkin(mode, value) {
    const hint = $('skin-hint');
    hint.textContent = 'Cambiando la skin…';
    let result = null;
    try { result = await window.ishe.skinChange(mode, value, $('skin-variant').value); } catch (_) { result = null; }
    if (result && result.wardrobe) {
      state.wardrobe = result.wardrobe;
      renderWardrobe();
    }
    if (result && result.ok) {
      hint.textContent = '¡Listo! Tu skin cambió. Se ve la próxima vez que entres al juego.';
      if (state && state.playerSkin) {
        loadSkin3dTexture(state.playerSkin, $('skin-variant').value, state.playerName || 'Tu skin', 'mi-skin-actual');
      }
    } else if (result && result.reason === 'cancelled') {
      hint.textContent = 'El PNG tiene que ser de 64×64 (o 64×32).';
    } else {
      hint.textContent = (result && SKIN_MESSAGES[result.reason]) || 'No se pudo cambiar la skin.';
    }
  }
  equipWardrobeItem = async (item) => {
    const hint = $('skin-hint');
    hint.textContent = 'Equipando «' + item.name + '» en tu cuenta…';
    let result = null;
    try { result = await window.ishe.skinWardrobeUse(item.id); } catch (_) { result = null; }
    if (result && result.ok) {
      hint.textContent = '¡«' + item.name + '» equipada en tu cuenta! Se verá al entrar al juego.';
    } else {
      hint.textContent = (result && SKIN_MESSAGES[result.reason]) || 'Vista previa 3D activa. Inicia sesión con Microsoft para subirla a tu cuenta.';
    }
  };
  for (const item of document.querySelectorAll('.seg-item')) {
    item.addEventListener('click', () => {
      $('skin-variant').value = item.dataset.variant;
      skin3d.variant = item.dataset.variant === 'slim' ? 'slim' : 'classic';
      const modelPill = $('skin-3d-model-pill');
      if (modelPill) modelPill.textContent = skin3d.variant === 'slim' ? 'Alex' : 'Steve';
      for (const other of document.querySelectorAll('.seg-item')) {
        const on = other === item;
        other.classList.toggle('is-active', on);
        other.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    });
  }
  $('skin-file').addEventListener('click', () => changeSkin('file', ''));
  $('skin-copy').addEventListener('click', () => changeSkin('player', $('skin-player').value));
  $('skin-3d-apply').addEventListener('click', async () => {
    const item = (state && state.wardrobe || []).find((w) => w.id === skin3d.selectedWardrobeId);
    if (item) await equipWardrobeItem(item);
  });
  $('wardrobe-add-file').addEventListener('click', async () => {
    const hint = $('skin-hint');
    hint.textContent = 'Elige un archivo PNG de 64×64…';
    const customLabel = $('wardrobe-name').value.trim();
    const res = await window.ishe.skinWardrobeAdd('file', '', customLabel, $('skin-variant').value);
    if (res && res.ok) {
      state.wardrobe = res.wardrobe || [];
      $('wardrobe-name').value = '';
      const added = state.wardrobe.find((w) => w.id === res.id) || state.wardrobe[0];
      if (added) loadSkin3dTexture(added.dataUrl || added.skin, added.variant, added.name, added.id);
      renderWardrobe();
      hint.textContent = '¡Guardada en tu guardarropa! Puedes girarla en 3D o pulsar Usar.';
    } else if (res && res.reason !== 'cancelled') {
      hint.textContent = SKIN_MESSAGES[res.reason] || 'No se pudo guardar esa skin.';
    } else {
      hint.textContent = 'Puedes guardar todas tus skins favoritas y cambiarlas con 1 clic.';
    }
  });
  $('wardrobe-save-current').addEventListener('click', async () => {
    const hint = $('skin-hint');
    const typedPlayer = $('skin-player').value.trim();
    const customLabel = $('wardrobe-name').value.trim();
    let res = null;
    if (typedPlayer) {
      hint.textContent = 'Guardando skin de ' + typedPlayer + '…';
      res = await window.ishe.skinWardrobeAdd('player', typedPlayer, customLabel || typedPlayer, $('skin-variant').value);
    } else if (state && state.signedIn && state.playerSkin) {
      res = await window.ishe.skinWardrobeAdd('current', '', customLabel || ('Skin de ' + (state.playerName || 'jugador')), $('skin-variant').value);
    } else {
      res = await window.ishe.skinWardrobeAdd('file', '', customLabel, $('skin-variant').value);
    }
    if (res && res.ok) {
      state.wardrobe = res.wardrobe || [];
      $('wardrobe-name').value = '';
      const added = state.wardrobe.find((w) => w.id === res.id) || state.wardrobe[0];
      if (added) loadSkin3dTexture(added.dataUrl || added.skin, added.variant, added.name, added.id);
      renderWardrobe();
      hint.textContent = 'Skin guardada en tu guardarropa.';
    } else if (res && res.reason !== 'cancelled') {
      hint.textContent = SKIN_MESSAGES[res && res.reason] || 'No se pudo guardar la skin.';
    } else {
      hint.textContent = '';
    }
  });
  $('wardrobe-add-player').addEventListener('click', async () => {
    const hint = $('skin-hint');
    const targetName = $('skin-player').value.trim();
    if (!targetName) {
      hint.textContent = 'Escribe primero el nombre del jugador en la caja de arriba.';
      $('skin-player').focus();
      return;
    }
    hint.textContent = 'Buscando la skin de ' + targetName + '…';
    const customLabel = $('wardrobe-name').value.trim() || targetName;
    const res = await window.ishe.skinWardrobeAdd('player', targetName, customLabel, $('skin-variant').value);
    if (res && res.ok) {
      state.wardrobe = res.wardrobe || [];
      $('wardrobe-name').value = '';
      const added = state.wardrobe.find((w) => w.id === res.id) || state.wardrobe[0];
      if (added) loadSkin3dTexture(added.dataUrl || added.skin, added.variant, added.name, added.id);
      renderWardrobe();
      hint.textContent = '¡Skin de ' + targetName + ' guardada en tu guardarropa y cargada en el visor 3D!';
    } else {
      hint.textContent = SKIN_MESSAGES[res && res.reason] || 'No pude traer la skin de ese jugador.';
    }
  });

  // ---- galeria de capturas
  $('home-see-gallery').addEventListener('click', () => showView('capturas'));
  $('gallery-folder-btn').addEventListener('click', () => window.ishe.galleryOpenFolder());
  if ($('background-check')) {
    $('background-check').addEventListener('change', async (e) => {
      const enabled = Boolean(e.target.checked);
      if (state) state.runInBackground = enabled;
      if (window.ishe.setBackground) await window.ishe.setBackground(enabled);
      $('background-hint').textContent = enabled
        ? 'Al cerrar con la X queda un icono junto al reloj; desde ahí lo abres o lo cierras del todo.'
        : 'Al cerrar la ventana, Reshem Client se cierra del todo.';
    });
  }
  if ($('gallery-auto-check')) {
    $('gallery-auto-check').addEventListener('change', async (e) => {
      const enabled = Boolean(e.target.checked);
      if (state) state.autoUploadScreenshots = enabled;
      if (window.ishe.setAutoScreenshots) {
        await window.ishe.setAutoScreenshots(enabled);
      }
      $('gallery-status').textContent = enabled
        ? 'Subida automática activada al tomar capturas con F2.'
        : 'Subida automática desactivada.';
    });
  }
  $('gallery-refresh-btn').addEventListener('click', async () => {
    $('gallery-status').textContent = 'Sincronizando fotos de la comunidad…';
    const gallery = await window.ishe.galleryList();
    if (gallery) {
      state.gallery = gallery;
      renderGallery();
      $('gallery-status').textContent = 'Galería actualizada.';
    }
  });
  $('gallery-upload-btn').addEventListener('click', async () => {
    $('gallery-status').textContent = 'Elige una captura o imagen para compartir…';
    const res = await window.ishe.galleryUploadFile(state.playerName ? 'Captura de ' + state.playerName : '');
    if (res && res.ok) {
      state.gallery = res.gallery;
      renderGallery();
      $('gallery-status').textContent = res.uploadedToCloud
        ? '¡Foto publicada! Ya aparece para todos en la galería.'
        : '¡Foto agregada a la galería destacada!';
    } else if (res && res.reason !== 'cancelled') {
      $('gallery-status').textContent = 'No se pudo subir esa imagen.';
    } else {
      $('gallery-status').textContent = '';
    }
  });
  $('photo-modal-close').addEventListener('click', closePhotoModal);
  $('photo-modal').addEventListener('click', (e) => {
    if (e.target === $('photo-modal')) closePhotoModal();
  });
  $('photo-modal-copy').addEventListener('click', async () => {
    if (!activePhotoModal) return;
    const ok = await window.ishe.galleryCopy(activePhotoModal.id, activePhotoModal.source);
    $('photo-modal-copy').textContent = ok ? '¡Foto copiada!' : 'No se pudo copiar';
  });
  $('photo-modal-share').addEventListener('click', async () => {
    if (!activePhotoModal || !activePhotoModal.id) return;
    $('photo-modal-share').disabled = true;
    $('photo-modal-share').textContent = 'Subiendo…';
    const res = await window.ishe.galleryShare(activePhotoModal.id, activePhotoModal.title || '');
    $('photo-modal-share').disabled = false;
    $('photo-modal-share').textContent = '¡Compartida!';
    if (res && res.ok) {
      state.gallery = res.gallery;
      renderGallery();
    }
  });

  // ---- nombre provisional (compatibilidad con pruebas)
  $('provisional-save').addEventListener('click', async () => {
    const res = await window.ishe.setDisplayName($('provisional-name').value);
    if (res && res.state) applyState(res.state);
    $('provisional-hint').textContent = res && res.ok ? 'Nombre guardado.' : 'Ese nombre no vale.';
    bump('nameDone');
  });
  $('provisional-clear').addEventListener('click', async () => {
    const res = await window.ishe.setDisplayName('');
    if (res && res.state) applyState(res.state);
    $('provisional-hint').textContent = 'Nombre quitado.';
    bump('nameDone');
  });

  setInterval(pollServer, 8000);
  pollServer();
  $('open-folder').addEventListener('click', () => window.ishe.openFolder());
  $('account-button').addEventListener('click', accountAction);
  $('account-name-link').addEventListener('click', () => {
    showView('ajustes');
  });
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
    else if (event.key === 'Escape' && !$('photo-modal').hidden) closePhotoModal();
    else if (event.key === 'Escape' && !$('loading').hidden) hideLoading();
  });
  buildSprites(document);
  loadCatPrefs();
  applyCatPrefs();
  renderCatSettings();
  $('animaciones-pausa').addEventListener('change', (event) => { catPrefs.quieto = event.target.checked; saveCatPrefs(); applyCatPrefs(); });
  $('gato-nombre').addEventListener('input', (event) => {
    const val = event.target.value.slice(0, 14);
    catPrefs.nombre = val;
    catPrefs.nombres[catPrefs.pelaje] = val.trim() || NOMBRES[catPrefs.pelaje] || 'Michi';
    saveCatPrefs();
    const activeCard = document.querySelector('#pelajes .pelaje[data-coat="' + catPrefs.pelaje + '"] .pelaje-name');
    if (activeCard) activeCard.textContent = getCatName(catPrefs.pelaje);
  });
  $('gatitos-activos').addEventListener('change', (event) => { catPrefs.activos = event.target.checked; saveCatPrefs(); applyCatPrefs(); });
  $('gato-sentado').addEventListener('click', () => catFx($('gato-sentado'), getCatName(catPrefs.pelaje), 3));
  $('loading-hide').addEventListener('click', hideLoading);
  applyMomento();
  setInterval(applyMomento, 5 * 60 * 1000);
  startCats();
  setTimeout(() => {
    document.body.dataset.ready = '1';
  }, 450);
}

init();
