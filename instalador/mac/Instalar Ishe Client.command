#!/bin/bash
# Instalador del launcher Ishe Client para Mac.
# Doble clic en Finder, o desde Terminal:  bash "Instalar Ishe Client.command"
#
# Que hace:
#   1. Descarga el motor de la aplicacion (Electron) desde su pagina oficial en
#      GitHub, el adecuado para este Mac (chip Apple o Intel), y comprueba su
#      integridad (SHA-256).
#   2. Monta "Ishe Client.app" en la carpeta Aplicaciones de tu usuario
#      (~/Applications). No pide contrasena de administrador.
#   3. Abre Ishe Client.
#
# Se puede ejecutar otra vez para actualizar Ishe Client: no vuelve a descargar
# el motor si ya esta.

set -u
cd "$(dirname "$0")" || exit 1

APP_NAME="Ishe Client"
VERSION="44.5.1"
SHA_ARM64="1d75703019bb16461ae65f3081d7e6f5c0b11e901d0ccb5c343bcf7bcdd6435c"
SHA_X64="e567d13833d0e161d7749727355b98643461df3395b537cfa7bdddf8a8bfedff"
BASE_URL="https://github.com/electron/electron/releases/download/v${VERSION}"
WORK=""

pause() {
  if [ -z "${ISHE_NO_PAUSE:-}" ]; then
    read -r -p "  Pulsa Enter para cerrar " _
  fi
}

cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

fail() {
  echo
  echo "  La instalacion se detuvo:"
  echo "   $1"
  echo
  pause
  exit 1
}

step() {
  echo
  echo "== $1"
}

echo
echo "  ===================================="
echo "     Instalador del launcher Ishe Client"
echo "  ===================================="

[ -f "app/main.js" ] || fail "Falta la carpeta 'app'. Extrae el .zip completo en una carpeta y abre el instalador desde ahi."
command -v curl >/dev/null 2>&1 || fail "Este Mac no tiene curl, que el instalador necesita para descargar."
command -v shasum >/dev/null 2>&1 || fail "Este Mac no tiene shasum, que el instalador necesita para comprobar la descarga."

ARCH="$(uname -m)"
case "$ARCH" in
  arm64)  PACKAGE="darwin-arm64"; EXPECTED="$SHA_ARM64" ;;
  x86_64) PACKAGE="darwin-x64";   EXPECTED="$SHA_X64" ;;
  *) fail "No reconozco el tipo de procesador de este equipo ($ARCH)." ;;
esac

MAJOR="$(sw_vers -productVersion 2>/dev/null | cut -d. -f1)"
case "$MAJOR" in
  ''|*[!0-9]*) MAJOR=0 ;;
esac
if [ "$MAJOR" -lt 13 ]; then
  fail "Ishe Client necesita macOS 13 o mas reciente. En este Mac usa el instalador sin ventana (IsheClient-Instalador-Mac.zip)."
fi

DEST_DIR="${ISHE_INSTALL_DIR:-$HOME/Applications}"
APP="$DEST_DIR/$APP_NAME.app"
MARK="$APP/Contents/Resources/ishe-client-motor.txt"
URL="${ISHE_RUNTIME_URL:-$BASE_URL/electron-v${VERSION}-${PACKAGE}.zip}"
case "$URL" in
  https://*|http://127.0.0.1:*) ;;
  *) fail "La direccion de descarga no es segura." ;;
esac

# ---- la aplicacion no debe estar abierta ------------------------------------
while [ -z "${ISHE_NO_PAUSE:-}" ] && pgrep -f "$APP/Contents/MacOS" >/dev/null 2>&1; do
  echo "   Ishe Client esta abierto. Cierralo (Cmd + Q) para poder actualizarlo."
  read -r -p "   Cuando lo hayas cerrado, pulsa Enter " _
done

sign_app() {
  # Sin firma (aunque sea local) los Mac con chip Apple no abren la aplicacion.
  xattr -cr "$1" >/dev/null 2>&1
  codesign --force --deep --sign - "$1" >/dev/null 2>&1
}

copy_client_into() {
  # $1 = carpeta .app. Copia Ishe Client y su icono dentro del motor.
  rm -rf "$1/Contents/Resources/app"
  cp -R "app" "$1/Contents/Resources/app" || return 1
  if [ -f "app/assets/icon.icns" ]; then
    cp "app/assets/icon.icns" "$1/Contents/Resources/electron.icns" || return 1
  fi
  [ -f "$1/Contents/Resources/app/main.js" ]
}

if [ -f "$MARK" ] && [ "$(cat "$MARK" 2>/dev/null)" = "${VERSION}-${PACKAGE}" ] && [ -d "$APP/Contents/MacOS" ]; then
  step "El motor de la aplicacion ya esta instalado"
  echo "   Electron $VERSION ($PACKAGE)"
  step "Copiando Ishe Client"
  copy_client_into "$APP" || fail "No pude copiar Ishe Client dentro de la aplicacion."
  sign_app "$APP" || fail "No pude firmar la aplicacion en este Mac (codesign fallo)."
  echo "   Listo."
else
  if [ -e "$APP" ] && [ ! -f "$MARK" ]; then
    fail "Ya existe \"$APP\" y no la creo este instalador. Muevela o borrala y vuelve a intentarlo."
  fi

  step "Descargando el motor de la aplicacion (unos 130 MB, puede tardar unos minutos)"
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/ishe-client.XXXXXX")" || fail "No pude crear una carpeta temporal."
  if [ "${URL#https://}" != "$URL" ]; then
    curl -fL --proto '=https' --proto-redir '=https' --retry 2 -# -o "$WORK/runtime.zip" "$URL" \
      || fail "No pude descargar el motor de la aplicacion. Revisa tu conexion a internet y vuelve a intentarlo."
  else
    curl -fL --retry 2 -s -o "$WORK/runtime.zip" "$URL" \
      || fail "No pude descargar el motor de la aplicacion. Revisa tu conexion a internet y vuelve a intentarlo."
  fi
  ACTUAL="$(shasum -a 256 "$WORK/runtime.zip" | cut -d' ' -f1)"
  [ "$ACTUAL" = "$EXPECTED" ] || fail "La descarga no coincide con su codigo de verificacion. No se instalo nada; vuelve a intentarlo."
  echo "   Descarga comprobada."

  step "Instalando"
  mkdir -p "$WORK/unpacked" || fail "No pude preparar la carpeta temporal."
  if command -v ditto >/dev/null 2>&1; then
    ditto -x -k "$WORK/runtime.zip" "$WORK/unpacked" || fail "No pude desempaquetar la descarga."
  else
    unzip -q "$WORK/runtime.zip" -d "$WORK/unpacked" || fail "No pude desempaquetar la descarga."
  fi
  NEW="$WORK/unpacked/Electron.app"
  [ -d "$NEW/Contents/MacOS" ] || fail "El paquete descargado no tiene el contenido esperado."

  rm -f "$NEW/Contents/Resources/default_app.asar"
  copy_client_into "$NEW" || fail "No pude copiar Ishe Client dentro de la aplicacion."
  PLIST="$NEW/Contents/Info.plist"
  plutil -replace CFBundleName -string "$APP_NAME" "$PLIST" \
    && plutil -replace CFBundleDisplayName -string "$APP_NAME" "$PLIST" \
    && plutil -replace CFBundleIdentifier -string "client.ishe.launcher" "$PLIST" \
    || fail "No pude preparar la aplicacion (plutil fallo)."
  printf '%s' "${VERSION}-${PACKAGE}" > "$NEW/Contents/Resources/ishe-client-motor.txt"
  mv "$NEW" "$WORK/unpacked/$APP_NAME.app" || fail "No pude preparar la aplicacion."
  NEW="$WORK/unpacked/$APP_NAME.app"
  sign_app "$NEW" || fail "No pude firmar la aplicacion en este Mac (codesign fallo)."

  mkdir -p "$DEST_DIR" || fail "No pude crear la carpeta $DEST_DIR."
  if [ -e "$APP" ]; then
    rm -rf "$APP"   # solo se llega aqui si la creo este instalador (tiene su marca)
  fi
  mv "$NEW" "$APP" || fail "No pude mover la aplicacion a $DEST_DIR."
  echo "   Instalado en $APP"
fi

echo
echo "  Ishe Client quedo instalado."
echo
echo "  Esta en la carpeta Aplicaciones de tu usuario:"
echo "   $APP"
echo "  Abrelo desde ahi (o buscalo con Spotlight: Cmd + Espacio, 'Ishe Client') y pulsa JUGAR."
echo
if [ -z "${ISHE_NO_LAUNCH:-}" ]; then
  open "$APP" >/dev/null 2>&1
fi
pause
exit 0
