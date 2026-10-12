# Instalador de los mods de Reshem para el launcher oficial de Minecraft (Windows)
# Compatible con Windows PowerShell 5.1. Solo caracteres ASCII a proposito.
#
# Que hace:
#   1. Comprueba que existe la carpeta .minecraft del launcher oficial (con una cuenta de Minecraft Java).
#   2. Descarga el motor de la aplicacion (Electron, solo para usarlo como "Node") y comprueba su integridad (SHA-256).
#   3. Instala Fabric para Minecraft 26.2 y todos los mods de Reshem dentro de .minecraft (carpeta "mods"),
#      y anade el perfil "Reshem Client" al launcher oficial (guarda copia de seguridad de sus perfiles).
#   4. Borra lo temporal. No toca mundos, capturas ni mods que hayas puesto tu.
#
# No necesita permisos de administrador. Se puede ejecutar otra vez para actualizar los mods.

param(
    [string]$MinecraftDir = "",
    [string]$RuntimeUrl = "https://github.com/electron/electron/releases/download/v44.5.1/electron-v44.5.1-win32-x64.zip",
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RuntimeSha256 = "9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db"
$ServerAddress = "fried-recently.tun.ply.gg"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ExitCode = 1

function Write-Step([string]$Text) { Write-Host ""; Write-Host ("== " + $Text) -ForegroundColor Cyan }
function Write-Info([string]$Text) { Write-Host ("   " + $Text) }
function Wait-ForUser([string]$Prompt) { if (-not $NoPause) { [void](Read-Host $Prompt) } }

function Install-Main {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

    Write-Host ""
    Write-Host "  ====================================" -ForegroundColor Cyan
    Write-Host "    Mods de Reshem para Minecraft" -ForegroundColor Cyan
    Write-Host "  ====================================" -ForegroundColor Cyan

    if ([string]::IsNullOrEmpty($MinecraftDir)) { $script:MinecraftDir = Join-Path $env:APPDATA ".minecraft" }
    Write-Info ("Carpeta de Minecraft: " + $MinecraftDir)

    $perfiles = Join-Path $MinecraftDir "launcher_profiles.json"
    if (-not (Test-Path -LiteralPath $perfiles -PathType Leaf)) {
        throw ("No encuentro el launcher oficial de Minecraft en " + $MinecraftDir + ". Instala el launcher de Minecraft (minecraft.net), abrelo una vez con tu cuenta, cierralo y vuelve a ejecutar este instalador.")
    }

    $abierto = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match "^(MinecraftLauncher|Minecraft)$" })
    if ($abierto.Count -gt 0) {
        Write-Host ""
        Write-Host "   El launcher de Minecraft esta abierto. Cierralo por completo para poder anadir el perfil." -ForegroundColor Yellow
        Wait-ForUser "   Cuando lo hayas cerrado, pulsa Enter"
    }

    if (-not ($RuntimeUrl.StartsWith("https://") -or $RuntimeUrl.StartsWith("http://127.0.0.1:"))) { throw "La direccion de descarga no es segura." }
    $work = Join-Path ([System.IO.Path]::GetTempPath()) ("reshem-mods-" + [Guid]::NewGuid().ToString("N"))
    [void](New-Item -ItemType Directory -Force -Path $work)
    try {
        Write-Step "Descargando el motor de la aplicacion (unos 150 MB, puede tardar unos minutos)"
        $zip = Join-Path $work "runtime.zip"
        try { Invoke-WebRequest -UseBasicParsing -Uri $RuntimeUrl -OutFile $zip }
        catch { throw ("No pude descargar el motor. Revisa tu conexion a internet y vuelve a intentarlo. (" + $_.Exception.Message + ")") }
        $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $RuntimeSha256) { throw "La descarga no coincide con su codigo de verificacion. No se instalo nada; vuelve a intentarlo." }
        Write-Info "Descarga comprobada."

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $motor = Join-Path $work "motor"
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $motor)
        $electron = Join-Path $motor "electron.exe"
        if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) { throw "El paquete descargado no tiene el contenido esperado." }

        $cli = Join-Path $ScriptDir "instalar-mods.js"
        if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw "No encuentro los archivos del instalador. Extrae el .zip completo." }

        Write-Step "Instalando Fabric y los mods de Reshem en .minecraft"
        $env:ELECTRON_RUN_AS_NODE = "1"
        try {
            & $electron $cli --minecraft-dir $MinecraftDir
            $script:ExitCode = $LASTEXITCODE
        } finally {
            Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
        }
    } finally {
        try { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue } catch { }
    }

    Write-Host ""
    if ($script:ExitCode -le 2) {
        Write-Host "  Listo. Para jugar:" -ForegroundColor Green
        Write-Host "   1. Abre el launcher de Minecraft."
        Write-Host "   2. Elige el perfil 'Reshem Client' (abajo a la izquierda) y pulsa JUGAR."
        Write-Host ("   3. En Multijugador agrega el servidor:  " + $ServerAddress)
        if ($script:ExitCode -eq 2) { Write-Host "   (Hubo avisos arriba: si algo falla, vuelve a ejecutar este instalador.)" -ForegroundColor Yellow }
    } else {
        Write-Host "  La instalacion no se completo. Revisa los mensajes de arriba." -ForegroundColor Red
    }
}

try {
    Install-Main
} catch {
    Write-Host ""
    Write-Host ("  " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "  No se toco ningun mundo ni ningun otro perfil."
    $script:ExitCode = 1
}
Wait-ForUser "  Pulsa Enter para cerrar"
exit $script:ExitCode
