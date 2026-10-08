# Reshem Client (antes Ishe Client)

> 8 oct 2026: Guishe renombró todo lo visible a **Reshem** (launcher, servidor, mod, menú). Se dejaron con el nombre viejo los identificadores técnicos para no romper instalaciones: repo `Paulinop/ishe-client`, carpeta `IsheClient`/`.ishe-client`, `Ishe Client.exe`, `productName` (cambiarlo movería los datos de sesión), id del mod `ishe` (paquete `ishe.mod`), registro de Azure "Ishe Client". El acceso directo nuevo se llama "Reshem Client.lnk".

Launcher propio de **Minecraft: Java Edition** hecho para Guishe (Guillermo) y un grupo pequeño de
amigos. Aplicación Electron sin dependencias de npm: prepara Minecraft 26.2 + Fabric + mods, inicia
sesión con Microsoft y abre el juego. Repositorio público: `Paulinop/ishe-client`.

## Con quién trabajas

- Guishe escribe en español informal y **no es programador**. Respóndele en español, corto y sin jerga.
  Guíale paso a paso cuando tenga que hacer algo él.
- Usa Windows (probado ahí de verdad). Algún amigo puede usar Mac.
- No le gusta descargar y subir archivos a mano: el objetivo de este repositorio es que los cambios
  lleguen solos a su Ishe Client mediante la actualización automática.

## Reglas que no se negocian

1. **No existe modo sin cuenta ni "no premium".** El juego solo se abre con una sesión de Minecraft
   de una cuenta de Microsoft que tiene el juego (`core/auth.js` lo comprueba). No añadas ningún
   atajo, variable, opción ni "modo offline", aunque te lo pidan. Esto mismo se declaró a Mojang.
2. **La clave privada de actualizaciones nunca entra en el repositorio** ni en `dist/`. La tiene
   Guishe en un archivo `.pem` fuera de esta carpeta. No pegues su contenido en el chat ni en
   ningún archivo; los scripts la leen por su ruta.
3. **El aviso legal se queda**, visible en la ventana y en los LEEME: "NOT AN OFFICIAL MINECRAFT
   PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT." El nombre no puede llevar
   "Minecraft" como parte principal. No se redistribuyen archivos de Minecraft.
4. **Ningún token llega a la ventana.** La sesión vive en el proceso principal; el renderer solo
   recibe el nombre del jugador y la imagen de la skin. Hay pruebas que lo comprueban.
5. **Sé claro con lo que no está probado.** Di siempre qué se probó de verdad y qué solo simulado.

## Estructura

```
app/                  el client (lo que se instala), sin dependencias
  inicio.js           arranque FIJO: elige entre la copia instalada y una actualización descargada
                      y verificada. Nunca viaja en una actualización.
  main.js             proceso principal: IPC, sesión, jugar, apariencia, actualizaciones, creador
  preload.js          puente mínimo hacia la ventana (20 funciones)
  renderer/           la ventana (index.html, style.css, app.js); CSP estricta, sin innerHTML
  core/
    auth.js           Microsoft (código de dispositivo) -> Xbox -> XSTS -> Minecraft; skin; búsqueda por nombre
    session.js        guarda el refresh token cifrado (safeStorage)
    game.js           descarga y arranque del juego (versión, bibliotecas, recursos, Java de Mojang)
    installer.js      Fabric + mods de Modrinth + mod Ishe + perfil en el launcher oficial
    modishe.js        actualiza el mod Ishe desde la release fija "mods" (aviso firmado + SHA-256)
    amigos.js         "código de amigos": escribe en <juego>/config/ishe.json la dirección del servidor de amigos (gemini_url_base) y el token (gemini_api_key)
    platform.js       detectar/abrir el launcher oficial
    paquete.js        formato de las actualizaciones: firma Ed25519 + SHA-256 por archivo
    versiones.js      registro de la versión en uso (estado.json)
    updater.js        busca y descarga actualizaciones de GitHub Releases
    creator.js        arma y firma una actualización
    tema.js           colores y logo
    clave-publica.js  clave pública con la que se verifican las actualizaciones
    cli.js            SOLO pruebas (no se reparte)
  test-hooks.js       SOLO pruebas (no se reparte); con él presente existe el "modo de pruebas"
  (extras/ ya no existe: e4steam se quitó en la 1.5.0; el mecanismo de "extras" del actualizador sigue, pero sin archivos)
  tema.json           apariencia por defecto; noticias.json: tarjetas de Novedades
instalador/           scripts que instalan el motor (Electron 44.5.1, SHA-256 fijados) + app/
recursos/             iconos, logo reducido, textos LEEME, guía del creador
tools/                construir.js, publicar.js y las pruebas
```

## Cómo funcionan las actualizaciones

- Cada Ishe Client instalado pide al abrirse
  `https://github.com/Paulinop/ishe-client/releases/latest/download/ishe-client-actualizacion.json`.
- Ese "aviso" va firmado con la clave privada de Guishe. Si anuncia una versión mayor, se descarga
  `ishe-client-app-<versión>.bin` (unos 80 KB: los archivos de `app/` menos `inicio.js` y `extras/`).
- Se guarda en `<datos de la app>/actualizaciones/<versión>/`. En el siguiente arranque, `inicio.js`
  (el de la copia INSTALADA) vuelve a verificar firma y hashes y la usa. Si no arranca, vuelve sola a
  la anterior y la marca como mala.
- **Consecuencia importante:** lo que verifica es el `inicio.js` + `core/paquete.js` que cada
  persona tiene instalados. Si cambias `inicio.js`, el formato del paquete o `FILE_PATTERN`, las
  instalaciones existentes no lo reciben por actualización: hace falta reinstalar con el instalador.
  Evítalo salvo necesidad, y avisa a Guishe cuando ocurra.
- Un archivo nuevo en `app/` solo viaja si encaja en `FILE_PATTERN` de `core/paquete.js`
  (`main.js`, `preload.js`, `package.json`, `noticias.json`, `tema.json`, `core/*.js`,
  `renderer/*.html|css|js`, `assets/*.png|ico|icns`).

## IA para los amigos sin que usen la clave de Guishe

La clave de Gemini de Guishe NUNCA va en el mod, el launcher ni GitHub (el repositorio es público). Los amigos usan un servidor
propio de Guishe en Cloudflare Workers (carpeta `../ishe-proxy`: `worker.js`, `LEEME.md`, `crear-codigo.mjs`) que guarda la clave
y acepta solo códigos de amigo (tokens, revocables uno a uno, con límite diario). El mod usa `gemini_url_base` + `gemini_api_key`
(= token) de `config/ishe.json`, y lo mismo para la voz (`fish_url_base` = servidor + `/fish/v1/tts`, `fish_api_key` = token; la clave de Fish también vive solo en Cloudflare); el launcher los escribe al pegar el "código de amigos" en Ajustes. Estado: el código está hecho y
probado con un Google simulado; el servidor todavía lo tiene que desplegar Guishe (pasos en `ishe-proxy/LEEME.md`).

## Servidor propio y "entrar directo"

Ajustes > "Mi servidor" guarda `servidor` y `entrar` en `config.json`. Con `entrar` activo, Jugar arranca con `--quickPlayMultiplayer <dirección>` (`game.serverAddress` valida la dirección; sigue sin existir modo sin cuenta). El código de amigos puede traer la dirección (`s`). El servidor de Guishe vive en `../ishe-servidor` (Fabric 26.2 + mod Ishe + Simple Voice Chat, `online-mode=true`, lista blanca; la IA y la voz las hace el servidor con la clave de Guishe en `ishe-servidor/config/ishe.json`, solo en su PC). Probado: el servidor arranca con los mods y el juego real entra solo con `--quickPlayMultiplayer`. Sin probar: abrir puertos / túnel para amigos de fuera.

## Publicar el mod Ishe (sin tocar el launcher)

El mod Ishe vive en `../ishemod-template-26.2` (Minecraft 26.2). Al pulsar Jugar, el client mira la release
fija `mods` de GitHub (`ishe-mod.json` firmado + `ishe-<versión>-mc26.2.jar`) y baja el .jar si cambió.

1. En `ishemod-template-26.2`: `./gradlew build` (sube `version` en gradle.properties si cambió algo).
2. `node tools/publicar_mod.js --jar <ruta a build/libs/ishe-X.Y.Z.jar> --clave "<ruta al .pem>"` crea y comprueba el aviso
   en `dist/mod/` sin publicar nada.
3. **Pide permiso a Guishe** y repite con `--subir` (necesita `gh auth login`): sube/reemplaza los archivos de la release `mods`.
4. Prueba: `node tools/test_mod.js app` (servidor simulado, sin la clave real).

## Publicar una versión nueva

1. Haz los cambios en `app/`.
2. Sube el número en `app/package.json` (tres números: `1.2.2`, `1.3.0`…). Nunca reutilices uno publicado.
3. Pon en `app/noticias.json` una primera tarjeta con título `Versión X.Y.Z…` y el texto de qué cambió.
4. Pasa las pruebas (abajo).
5. `node tools/publicar.js --clave "<ruta al .pem>"` crea y comprueba la actualización en
   `dist/actualizacion/` sin publicar nada. Revísalo.
6. **Pide permiso a Guishe** y entonces repite con `--subir`: crea la release `vX.Y.Z` en GitHub con
   el aviso, el paquete y los dos instaladores. Necesita `gh auth login` hecho por él.
7. Haz commit y push del código de esa versión.

`node tools/construir.js` solo arma los instaladores (`dist/*.zip`), sin firmar ni publicar.

Guishe también puede crear una actualización desde la propia aplicación (Ajustes > "Para el creador");
esa vía empaqueta lo que tiene instalado, con sus colores y logo. Si se usa `publicar.js`, la
apariencia por defecto es la de `app/tema.json`.

## Pruebas

Solo con Node 22 o más nuevo (funcionan en Windows, Mac y Linux):

```
node tools/test_auth.js app
node tools/test_game.js app
node tools/test_platform.js app
node tools/test_update.js app "<ruta al .pem>"
node tools/test_mod.js app
node tools/test_amigos.js app
node tools/test_servidor.js app
node tools/test_ui_ids.js app            # cada id que usa app.js existe en index.html
node tools/test_gatos.js app             # cada pelaje y pose de los gatitos tiene su dibujo
# test-hooks.js tambien entiende eval:<etiqueta>|<codigo>, size:<ancho>x<alto> y wait:<ms> (para cazar bugs en la ventana real)
node tools/prueba_ventana.js "<carpeta del motor Electron>" app out-ventana   # ABRE la ventana real con datos aislados (Windows/Mac/Linux)
```

Solo en Linux (necesitan `xvfb-run`, Python 3 con Pillow y el binario de Electron 44.5.1 para Linux):

```
python3 tools/test_launcher_e2e.py <electron> app e2e-out "<ruta al .pem>"   # la ventana real, 147 comprobaciones
python3 tools/test_installer.py "$(which node)" app node                      # núcleo del instalador
python3 tools/test_bootstrap.py <pwsh> dist <carpeta con los .zip de Electron> tools/shims <electron>
```

Todas usan servicios simulados en `127.0.0.1`. El modo de pruebas solo existe si `app/test-hooks.js`
está presente; `dist/app` no lo lleva. No añadas variables de prueba que funcionen sin ese archivo.
Añade una comprobación a las pruebas con cada cambio de comportamiento.

## Estado (6 de octubre de 2026)

- Versión del código: ver `app/package.json` (publicadas hasta la 1.2.7 al 6 de octubre de 2026). La actualización
  automática ya funciona de verdad contra GitHub Releases.
- Azure: aplicación "Ishe Client", Application (client) ID `777b4ef5-0f7c-47c7-b03a-a9fefbfa49c2`,
  solo cuentas personales, cliente público (sin secreto).
- **Mojang aprobó ese ID el 7 de octubre de 2026** (correo de Mojang Enforcement: la app quedó en su lista de
  permitidos). Todavía NO se ha probado un inicio de sesión real después de la aprobación; puede tardar en
  aplicarse. Si `login_with_xbox` aún da 403, la aplicación muestra "Esperando a Mojang".
- 1.3.0 añade el mod Ishe (release fija `mods`) y Simple Voice Chat a lo que instala Jugar.
- Comprobado de verdad en el Windows de Guishe: instalación, ventana, colores y logo, e inicio de
  sesión real con Microsoft hasta el rechazo esperado de Mojang.
- Solo simulado, nunca real: arranque directo del juego, descarga del juego y de Java, skin y nombre
  desde Mojang, búsqueda de jugador por nombre, actualización contra GitHub, todo en Mac, y los mods
  dentro del juego.
- Cuentas con Game Pass: la comprobación de propiedad usa `/entitlements/mcstore` y, si viene vacía,
  `/entitlements/license`; no se pudo verificar con una cuenta real.

## e4steam (quitado en la 1.5.0)

Guishe pidió quitarlo porque ahora juegan en su servidor propio (Ishe server). `installer.js` ya no lo instala y, si quedó un
`e4steam-…guard.jar` en la carpeta de mods de una versión anterior, lo borra al pulsar Jugar (y lo olvida de la lista de mods
instalados). Se borraron `app/extras/` y `e4steam-guard/`. PENDIENTE: `tools/test_installer.py` y `tools/test_launcher_e2e.py`
(solo Linux, no se corrieron) todavía esperan e4steam y hay que adaptarlos.

## Apariencia fija (decisión de Guishe, versión 1.2.3)

Logo del gato con gafas y un solo color de acento (`app/tema.json`, `color2` = `color1`). La apariencia NO es
personalizable: se quitó la tarjeta de Ajustes y los IPC de tema. Para cambiarla, edita `app/tema.json` y publica.
Diseño 1.2.4: barra superior (sin panel lateral), gato en `assets/gato.png`, acento dorado único. Pantalla de carga (`#loading`, consejos en `TIPS`), caricias a los gatos (`catFx`) y gatito propio de cada persona (`catPrefs`, en localStorage) están en `renderer/app.js`. Fondo de mina animado (1.2.5): capa `.mina` detrás de toda la ventana; el Inicio conserva su cielo (estrellas, nubes, colinas, sol/luna según la hora con `applyMomento`) porque a Guishe le gusta así y NO quiere que se quite; sus dibujos los genera `node tools/generar_mina.js` (bloque MINA-INICIO de `style.css`, no editar a mano). Al abrir, `main.js` (`refreshShortcutIcons`) pone el icono `assets/gato.ico` en el acceso directo propio de Windows (escritorio y menú Inicio). Los gatitos de píxeles (propios, no son archivos de Minecraft) los dibuja `node tools/generar_gatos.js` dentro de `style.css` (10 pelajes x 10 poses; cada pose se dibuja una vez en capas con máscaras y el pelaje es solo una lista de colores en `COATS`: para un pelaje nuevo añade una línea en `COATS` y su nombre en `PELAJES` de `app.js`, y corre el generador; no edites el bloque a mano). Su comportamiento (caminar, sentarse, asearse, dormir; cada uno con su carácter) está en `startCats()` de `renderer/app.js`. Al quitar bloques del HTML corre `test_ui_ids.js`: la 1.2.3 salió rota por borrar una tarjeta que app.js necesitaba.
Pendiente: las secciones s14 y s16 de `tools/test_launcher_e2e.py` (solo Linux, no se corrieron) comprueban la
personalización antigua y hay que quitarlas o adaptarlas.

## Ideas pendientes que pidió Guishe

- Imagen de fondo en Inicio, textos y novedades editables, elegir mods desde la aplicación.
- Cuando Mojang apruebe el ID: quitar la casilla del nombre provisional y mostrar el perfil real.
- Probar en Mac.


## 1.6.0: servidor por defecto, estado, skin, menu
- La tarjeta "Mi servidor" y "Tus mundos" se quitaron de Ajustes (todos entran siempre a Ishe server); rediseño de Ajustes/Mods en el bloque REDISEÑO 1.6 al final de `style.css`.
- `main.js` `DEFAULT_SERVER` ('fried-recently.tun.ply.gg', tunel playit) es la direccion por defecto; la tarjeta de "codigo de amigos" se quito de la ventana (la IA corre en el servidor con las claves del dueño). `amigos.js` y sus IPC siguen en el codigo sin usarse.
- `core/estado-servidor.js`: ping de estado (handshake+status, SRV). `play()` devuelve `server-closed` y la ventana pone JUGAR gris "CERRADO" (sondea cada 8 s).
- `core/skin.js` + IPC `ishe:skin-change`: cambiar skin (PNG 64x64 o copiar de un jugador). Sin probar contra Mojang real.
- CSS: las animaciones ya no se apagan por el ajuste de Windows (`@media not all`); el ajuste propio "Pausar las animaciones" sigue.
- El menu principal (FancyMenu) lo instala el mod Ishe 1.3.0 (`FancyMenuPaquete`, entrypoint preLaunch).
- Shaders (1.6.0): `installer.js` instala Iris (en `MOD_PROJECTS`) y `installShaders` baja Complementary Reimagined (Modrinth, cargador `iris`) a `shaderpacks/` y lo activa SOLO la primera vez escribiendo `config/iris.properties` (despues la eleccion es de cada quien). Probado con Modrinth simulado (`tools/test_shaders.js`) y dentro del juego real (Iris 1.11.4 + el paquete r5.9.3 en MC 26.2, panorama capturado con shaders). Sin probar: rendimiento en PCs flojas de los amigos.
- Menu principal (mod 1.3.0): panorama propio de Ishe (Nublado + Haku en su puesto, capturado con shaders con `src/gametest/.../IsheFondoTest`, que hay que registrar a mano en el fabric.mod.json de gametest) + logo/botones dibujados por `tools/disenar_menu.js` (Electron del Ishe Client instalado; disenos HTML en `tools/diseno/`).
- Menu 8 oct: titulo RESHEM y botones JUGAR/OPCIONES/SALIR hechos en Blockbench (plugin Minecraft Title Generator; los PNG originales estan en `ishemod-template-26.2/tools/diseno/bb/`, se recomponen con `node tools/disenar_menu.js`). Usan texturas de Mojang: no subir a un repo publico sin pensarlo.
- Reto del servidor (mod 1.4.0, 8 oct): ruleta estilo Dedsafio (`reto/RuletaReto`), misiones diarias (`reto/MisionesDiarias`), avisos a la izquierda y HUD de intis (`client/RetoCliente`), aviso al gastar un totem (`mixin/LivingEntityMixin`). Intis: ya no hay inti de bronce; plata vale 1 y oro 10. Probado en el juego real con `IsheRetoTest` y arrancando el servidor dedicado; sin probar: varias horas de juego con amigos y el equilibrio de dificultad.
- Narrador apagado SIEMPRE (8 oct): el launcher lo fija en `options.txt` antes de abrir el juego (`game.fixOptions`, `tools/test_opciones.js`) y el mod tambien (`OpcionesFijas`, en el preLaunch, antes de que Minecraft lea las opciones): `narrator:0`, `narratorHotkey:false`, `onboardAccessibility:false`.
- Balance del reto: los eventos de la ruleta escalan con `Director.nivelDe(jugador)` (incluye el bono de la ruleta, max `ruleta_nivel_maximo`=12); premios en `RuletaReto`, `MisionesDiarias` y `Director` (emboscada 15+6*nivel). Sin probar con amigos: puede pedir ajustes.
- Mods extra (8 oct): Xaero's World Map, TrashSlot (+Balm), Immersive Paintings (+Fzzy Config, Fabric Language Kotlin), Customizable Player Models y LambDynamicLights, en `MOD_PROJECTS`. Se probaron ARRANCANDO el juego real con todos juntos. LECCION: Modrinth dice que Sparkle's Morpher, Emotecraft (y su Player Animation Library) sirven para 26.2 pero NO arrancan (mixins viejos / dependen de 1.21.1): hay que probar cada mod nuevo en el juego, no fiarse de la etiqueta. No salen para 26.2: Souper Secret Settings, Immersive Damage Indicators, WaterFrames, Pehkui, Morpher; Immersive Portals no existe para 26.2 y choca con Sodium/Iris. Los de contenido (TrashSlot, Immersive Paintings, CPM + sus dependencias) tambien estan en `ishe-servidor/mods`.
