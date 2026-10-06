# Ishe Client

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
  preload.js          puente mínimo hacia la ventana (18 funciones)
  renderer/           la ventana (index.html, style.css, app.js); CSP estricta, sin innerHTML
  core/
    auth.js           Microsoft (código de dispositivo) -> Xbox -> XSTS -> Minecraft; skin; búsqueda por nombre
    session.js        guarda el refresh token cifrado (safeStorage)
    game.js           descarga y arranque del juego (versión, bibliotecas, recursos, Java de Mojang)
    installer.js      Fabric + mods de Modrinth + perfil en el launcher oficial
    platform.js       detectar/abrir el launcher oficial
    paquete.js        formato de las actualizaciones: firma Ed25519 + SHA-256 por archivo
    versiones.js      registro de la versión en uso (estado.json)
    updater.js        busca y descarga actualizaciones de GitHub Releases
    creator.js        arma y firma una actualización
    tema.js           colores y logo
    clave-publica.js  clave pública con la que se verifican las actualizaciones
    cli.js            SOLO pruebas (no se reparte)
  test-hooks.js       SOLO pruebas (no se reparte); con él presente existe el "modo de pruebas"
  extras/             e4steam modificado (SHA-256 fijado en installer.js)
  tema.json           apariencia por defecto; noticias.json: tarjetas de Novedades
instalador/           scripts que instalan el motor (Electron 44.5.1, SHA-256 fijados) + app/
recursos/             iconos, logo reducido, textos LEEME, guía del creador
tools/                construir.js, publicar.js y las pruebas
e4steam-guard/        código de la corrección de e4steam (ver su LEEME.md)
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

## Publicar una versión nueva

1. Haz los cambios en `app/`.
2. Sube el número en `app/package.json` (tres números: `1.2.2`, `1.3.0`…). Nunca reutilices uno publicado.
3. Pon en `app/noticias.json` una primera tarjeta con título `Versión X.Y.Z…` y el texto de qué cambió.
4. Pasa las pruebas (abajo).
5. `node tools/publicar.js --clave "<ruta al .pem>"` crea y comprueba la actualización en
   `dist/actualizacion/` sin publicar nada. Revísalo.
6. **Pide permiso a Guishe** y entonces repite con `--subir`: crea la release `vX.Y.Z` en GitHub con
   el aviso, el paquete, e4steam y los dos instaladores. Necesita `gh auth login` hecho por él.
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

- Versión del código: **1.2.1**. Guishe tiene instalada la **1.2.0** en Windows. Todavía no hay
  ninguna release publicada en GitHub: la 1.2.1 sería la primera prueba real de la actualización.
- Azure: aplicación "Ishe Client", Application (client) ID `777b4ef5-0f7c-47c7-b03a-a9fefbfa49c2`,
  solo cuentas personales, cliente público (sin secreto).
- **Mojang aún no ha aprobado ese ID** (formulario enviado el 6 de octubre de 2026, sin plazo).
  Hasta entonces `login_with_xbox` responde 403, la aplicación muestra "Esperando a Mojang" y Jugar
  abre el launcher oficial. Al aprobarlo, todo lo demás debería funcionar sin cambios.
- Comprobado de verdad en el Windows de Guishe: instalación, ventana, colores y logo, e inicio de
  sesión real con Microsoft hasta el rechazo esperado de Mojang.
- Solo simulado, nunca real: arranque directo del juego, descarga del juego y de Java, skin y nombre
  desde Mojang, búsqueda de jugador por nombre, actualización contra GitHub, todo en Mac, y los mods
  dentro del juego (incluido e4steam modificado).
- Cuentas con Game Pass: la comprobación de propiedad usa `/entitlements/mcstore` y, si viene vacía,
  `/entitlements/license`; no se pudo verificar con una cuenta real.

## Apariencia fija (decisión de Guishe, versión 1.2.3)

Logo del gato con gafas y un solo color de acento (`app/tema.json`, `color2` = `color1`). La apariencia NO es
personalizable: se quitó la tarjeta de Ajustes y los IPC de tema. Para cambiarla, edita `app/tema.json` y publica.
Pendiente: las secciones s14 y s16 de `tools/test_launcher_e2e.py` (solo Linux, no se corrieron) comprueban la
personalización antigua y hay que quitarlas o adaptarlas.

## Ideas pendientes que pidió Guishe

- Imagen de fondo en Inicio, textos y novedades editables, elegir mods desde la aplicación.
- Cuando Mojang apruebe el ID: quitar la casilla del nombre provisional y mostrar el perfil real.
- Probar en Mac.
