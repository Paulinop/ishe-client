# Instalador del launcher Ishe Client para Windows
# Compatible con Windows PowerShell 5.1. Solo caracteres ASCII a proposito.
#
# Que hace:
#   1. Descarga el motor de la aplicacion (Electron) desde su pagina oficial en
#      GitHub y comprueba su integridad (SHA-256).
#   2. Lo instala en  %LOCALAPPDATA%\IsheClient  junto con Ishe Client.
#   3. Crea accesos directos en el escritorio y en el menu Inicio.
#   4. Abre Ishe Client.
#
# No necesita permisos de administrador. Se puede ejecutar otra vez para
# actualizar Ishe Client: no vuelve a descargar el motor si ya esta.

param(
    [string]$InstallDir = "",
    [string]$RuntimeUrl = "https://github.com/electron/electron/releases/download/v44.5.1/electron-v44.5.1-win32-x64.zip",
    [switch]$NoShortcuts,
    [switch]$NoLaunch,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$AppName = "Ishe Client"
$RuntimeVersion = "44.5.1"
$RuntimeSha256 = "9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ExitCode = 1

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host ("== " + $Text) -ForegroundColor Cyan
}

function Write-Info([string]$Text) {
    Write-Host ("   " + $Text)
}

function Wait-ForUser([string]$Prompt) {
    if (-not $NoPause) {
        [void](Read-Host $Prompt)
    }
}

function Test-RuntimeReady([string]$Dir) {
    $exe = Join-Path $Dir ($AppName + ".exe")
    $versionFile = Join-Path $Dir "version"
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) { return $false }
    $found = ([System.IO.File]::ReadAllText($versionFile)).Trim().TrimStart("v")
    return ($found -eq $RuntimeVersion)
}

function Install-Main {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch { }

    Write-Host ""
    Write-Host "  ====================================" -ForegroundColor Cyan
    Write-Host "     Instalador del launcher Ishe Client" -ForegroundColor Cyan
    Write-Host "  ====================================" -ForegroundColor Cyan

    if ([string]::IsNullOrEmpty($InstallDir)) {
        $script:InstallDir = Join-Path $env:LOCALAPPDATA "IsheClient"
    }
    $appSource = Join-Path $ScriptDir "app"
    if (-not (Test-Path -LiteralPath (Join-Path $appSource "main.js") -PathType Leaf)) {
        throw "Falta la carpeta 'app'. Extrae el .zip completo en una carpeta y ejecuta el instalador desde ahi."
    }
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "Ishe Client necesita Windows de 64 bits."
    }

    # ---- la aplicacion no debe estar abierta --------------------------------
    while ($true) {
        $running = @(Get-Process -Name $AppName -ErrorAction SilentlyContinue)
        if ($running.Count -eq 0 -or $NoPause) { break }
        Write-Host "   Ishe Client esta abierto. Cierralo para poder actualizarlo." -ForegroundColor Yellow
        Wait-ForUser "   Cuando lo hayas cerrado, pulsa Enter"
    }

    # ---- motor de la aplicacion --------------------------------------------
    if (Test-RuntimeReady $InstallDir) {
        Write-Step "El motor de la aplicacion ya esta instalado"
        Write-Info ("Electron " + $RuntimeVersion)
    } else {
        Write-Step "Descargando el motor de la aplicacion (unos 150 MB, puede tardar unos minutos)"
        if (-not ($RuntimeUrl.StartsWith("https://") -or $RuntimeUrl.StartsWith("http://127.0.0.1:"))) {
            throw "La direccion de descarga no es segura."
        }
        $work = Join-Path ([System.IO.Path]::GetTempPath()) ("ishe-client-" + [Guid]::NewGuid().ToString("N"))
        [void](New-Item -ItemType Directory -Force -Path $work)
        try {
            $zip = Join-Path $work "runtime.zip"
            try {
                Invoke-WebRequest -UseBasicParsing -Uri $RuntimeUrl -OutFile $zip
            } catch {
                throw ("No pude descargar el motor de la aplicacion. Revisa tu conexion a internet y vuelve a intentarlo. (" + $_.Exception.Message + ")")
            }
            $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne $RuntimeSha256) {
                throw "La descarga no coincide con su codigo de verificacion. No se instalo nada; vuelve a intentarlo."
            }
            Write-Info "Descarga comprobada."

            Write-Step "Instalando"
            # Se desempaqueta junto a la carpeta final (mismo disco) y luego se cambia el nombre.
            [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $InstallDir))
            $unpacked = $InstallDir + ".instalando"
            if (Test-Path -LiteralPath $unpacked) { Remove-Item -LiteralPath $unpacked -Recurse -Force }
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $unpacked)
            if (-not (Test-Path -LiteralPath (Join-Path $unpacked "electron.exe") -PathType Leaf)) {
                Remove-Item -LiteralPath $unpacked -Recurse -Force
                throw "El paquete descargado no tiene el contenido esperado."
            }
            Rename-Item -LiteralPath (Join-Path $unpacked "electron.exe") -NewName ($AppName + ".exe")
            $defaultApp = Join-Path (Join-Path $unpacked "resources") "default_app.asar"
            if (Test-Path -LiteralPath $defaultApp) { Remove-Item -LiteralPath $defaultApp -Force }
            [System.IO.File]::WriteAllText((Join-Path $unpacked "ishe-client-carpeta.txt"), "Carpeta creada por el instalador de Ishe Client. Se puede borrar para desinstalar.")

            # Sustituye una instalacion anterior del motor (solo si la carpeta es nuestra).
            if (Test-Path -LiteralPath $InstallDir) {
                $marker = Join-Path $InstallDir "ishe-client-carpeta.txt"
                $children = @(Get-ChildItem -LiteralPath $InstallDir -Force)
                if ($children.Count -gt 0 -and -not (Test-Path -LiteralPath $marker)) {
                    Remove-Item -LiteralPath $unpacked -Recurse -Force
                    throw ("La carpeta " + $InstallDir + " ya existe y no es de Ishe Client. Elige otra o vaciala.")
                }
                Remove-Item -LiteralPath $InstallDir -Recurse -Force
            }
            Rename-Item -LiteralPath $unpacked -NewName (Split-Path -Leaf $InstallDir)
            Write-Info ("Instalado en " + $InstallDir)
        } finally {
            if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    # ---- Ishe Client (se copia siempre: asi tambien sirve para actualizar) ----
    Write-Step "Copiando Ishe Client"
    $resources = Join-Path $InstallDir "resources"
    $appTarget = Join-Path $resources "app"
    if (Test-Path -LiteralPath $appTarget) { Remove-Item -LiteralPath $appTarget -Recurse -Force }
    Copy-Item -LiteralPath $appSource -Destination $appTarget -Recurse -Force
    $exe = Join-Path $InstallDir ($AppName + ".exe")
    if (-not (Test-Path -LiteralPath (Join-Path $appTarget "main.js") -PathType Leaf) -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw "La instalacion quedo incompleta. Vuelve a ejecutar el instalador."
    }
    Write-Info "Listo."

    # ---- accesos directos ---------------------------------------------------
    if (-not $NoShortcuts) {
        Write-Step "Creando accesos directos"
        try {
            $shell = New-Object -ComObject WScript.Shell
            $icon = Join-Path (Join-Path $appTarget "assets") "icon.ico"
            $places = @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))
            foreach ($place in $places) {
                if ([string]::IsNullOrEmpty($place) -or -not (Test-Path -LiteralPath $place)) { continue }
                $link = $shell.CreateShortcut((Join-Path $place ($AppName + ".lnk")))
                $link.TargetPath = $exe
                $link.WorkingDirectory = $InstallDir
                $link.Description = "Ishe Client"
                if (Test-Path -LiteralPath $icon) { $link.IconLocation = $icon }
                $link.Save()
            }
            Write-Info "Acceso directo 'Ishe Client' en el escritorio y en el menu Inicio."
        } catch {
            Write-Host ("   AVISO: no pude crear los accesos directos. Abre Ishe Client desde " + $exe) -ForegroundColor Yellow
        }
    }

    Write-Host ""
    Write-Host "  Ishe Client quedo instalado." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Abrelo con el acceso directo 'Ishe Client' del escritorio y pulsa JUGAR."
    Write-Host ""
    if (-not $NoLaunch) {
        try { Start-Process -FilePath $exe -WorkingDirectory $InstallDir } catch { }
    }
    $script:ExitCode = 0
}

try {
    Install-Main | Out-Null
} catch {
    Write-Host ""
    Write-Host "  La instalacion se detuvo:" -ForegroundColor Red
    Write-Host ("   " + $_.Exception.Message) -ForegroundColor Red
    Write-Host ""
    $script:ExitCode = 1
}
Wait-ForUser "  Pulsa Enter para cerrar"
exit $script:ExitCode
