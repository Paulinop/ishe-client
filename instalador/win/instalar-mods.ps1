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
    [string]$InstallDir = "",
    [string]$RuntimeUrl = "https://github.com/electron/electron/releases/download/v44.5.1/electron-v44.5.1-win32-x64.zip",
    [switch]$NoShortcuts,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RuntimeVersion = "44.5.1"
$RuntimeSha256 = "9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db"
$ServerAddress = "fried-recently.tun.ply.gg"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ExitCode = 1

function Write-Step([string]$Text) { Write-Host ""; Write-Host ("== " + $Text) -ForegroundColor Cyan }
function Write-Info([string]$Text) { Write-Host ("   " + $Text) }
function Wait-ForUser([string]$Prompt) { if (-not $NoPause) { [void](Read-Host $Prompt) } }

function Test-MotorReady([string]$Dir) {
    $exe = Join-Path $Dir "electron.exe"
    $versionFile = Join-Path $Dir "version"
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) { return $false }
    $found = ([System.IO.File]::ReadAllText($versionFile)).Trim().TrimStart("v")
    return ($found -eq $RuntimeVersion)
}

function Install-Main {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

    Write-Host ""
    Write-Host "  ====================================" -ForegroundColor Cyan
    Write-Host "    Mods de Reshem para Minecraft" -ForegroundColor Cyan
    Write-Host "  ====================================" -ForegroundColor Cyan

    if ([string]::IsNullOrEmpty($MinecraftDir)) { $script:MinecraftDir = Join-Path $env:APPDATA ".minecraft" }
    if ([string]::IsNullOrEmpty($InstallDir)) { $script:InstallDir = Join-Path $env:LOCALAPPDATA "ReshemMods" }
    if (-not (Test-Path -LiteralPath $MinecraftDir -PathType Container)) {
        [void](New-Item -ItemType Directory -Force -Path $MinecraftDir)
    }
    Write-Info ("Carpeta de Minecraft: " + $MinecraftDir)

    $perfiles = Join-Path $MinecraftDir "launcher_profiles.json"
    if (-not (Test-Path -LiteralPath $perfiles -PathType Leaf)) {
        [System.IO.File]::WriteAllText($perfiles, "{`"profiles`":{}}", (New-Object System.Text.UTF8Encoding($false)))
    }

    $abierto = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match "^(MinecraftLauncher|Minecraft)$" })
    if ($abierto.Count -gt 0) {
        Write-Host ""
        Write-Host "   El launcher de Minecraft esta abierto. Cierralo por completo para poder anadir el perfil." -ForegroundColor Yellow
        Wait-ForUser "   Cuando lo hayas cerrado, pulsa Enter"
    }

    [void](New-Item -ItemType Directory -Force -Path $InstallDir)
    $motor = Join-Path $InstallDir "motor"
    if (Test-MotorReady $motor) {
        Write-Step "El motor del actualizador ya esta listo"
    } else {
        if (-not ($RuntimeUrl.StartsWith("https://") -or $RuntimeUrl.StartsWith("http://127.0.0.1:"))) { throw "La direccion de descarga no es segura." }
        $work = Join-Path ([System.IO.Path]::GetTempPath()) ("reshem-mods-" + [Guid]::NewGuid().ToString("N"))
        [void](New-Item -ItemType Directory -Force -Path $work)
        try {
            Write-Step "Descargando el motor del actualizador (solo la primera vez, unos 150 MB)"
            $zip = Join-Path $work "runtime.zip"
            try { Invoke-WebRequest -UseBasicParsing -Uri $RuntimeUrl -OutFile $zip }
            catch { throw ("No pude descargar el motor. Revisa tu conexion a internet y vuelve a intentarlo. (" + $_.Exception.Message + ")") }
            $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne $RuntimeSha256) { throw "La descarga no coincide con su codigo de verificacion. No se instalo nada; vuelve a intentarlo." }
            Write-Info "Descarga comprobada."

            Add-Type -AssemblyName System.IO.Compression.FileSystem
            if (Test-Path -LiteralPath $motor) { Remove-Item -LiteralPath $motor -Recurse -Force }
            [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $motor)
        } finally {
            try { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue } catch { }
        }
    }

    $electron = Join-Path $motor "electron.exe"
    if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) { throw "El motor descargado no tiene el contenido esperado." }

    if ($ScriptDir -ne $InstallDir) {
        $appSrc = Join-Path $ScriptDir "app"
        $appDst = Join-Path $InstallDir "app"
        if (Test-Path -LiteralPath $appSrc) {
            if (Test-Path -LiteralPath $appDst) { Remove-Item -LiteralPath $appDst -Recurse -Force }
            Copy-Item -LiteralPath $appSrc -Destination $appDst -Recurse -Force
        }
        Copy-Item -LiteralPath (Join-Path $ScriptDir "instalar-mods.js") -Destination (Join-Path $InstallDir "instalar-mods.js") -Force
        Copy-Item -LiteralPath (Join-Path $ScriptDir "instalar-mods.ps1") -Destination (Join-Path $InstallDir "instalar-mods.ps1") -Force
    }

    if (-not $NoShortcuts) {
        try {
            $shell = New-Object -ComObject WScript.Shell
            $icon = Join-Path (Join-Path (Join-Path $InstallDir "app") "assets") "icon.ico"
            $desktop = [Environment]::GetFolderPath("Desktop")
            if (-not [string]::IsNullOrEmpty($desktop) -and (Test-Path -LiteralPath $desktop)) {
                $link = $shell.CreateShortcut((Join-Path $desktop "Actualizar Mods de Reshem.lnk"))
                $link.TargetPath = "powershell.exe"
                $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $InstallDir "instalar-mods.ps1") + "`""
                $link.WorkingDirectory = $InstallDir
                $link.Description = "Actualiza todos los mods de Reshem en .minecraft"
                if (Test-Path -LiteralPath $icon) { $link.IconLocation = $icon }
                $link.Save()
            }
        } catch { }
    }

    $cli = Join-Path $InstallDir "instalar-mods.js"
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { $cli = Join-Path $ScriptDir "instalar-mods.js" }

    Write-Step "Sincronizando Fabric, shaders y mods de Reshem en .minecraft"
    $env:ELECTRON_RUN_AS_NODE = "1"
    try {
        & $electron $cli --minecraft-dir $MinecraftDir
        $script:ExitCode = $LASTEXITCODE
    } finally {
        Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }

    Write-Host ""
    if ($script:ExitCode -le 2) {
        Write-Host "  Listo. Todo actualizado para entrar al servidor:" -ForegroundColor Green
        Write-Host "   1. Abre tu launcher de Minecraft."
        Write-Host "   2. Elige el perfil 'Reshem Client' (o Fabric 26.2) y pulsa JUGAR."
        Write-Host ("   3. El menu principal ya entra directo al servidor (" + $ServerAddress + ").")
        Write-Host "   4. Quedo el icono 'Actualizar Mods de Reshem' en tu Escritorio para actualizar en segundos."
        if ($script:ExitCode -eq 2) { Write-Host "   (Hubo avisos arriba: si algo falla, vuelve a ejecutarlo.)" -ForegroundColor Yellow }
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
