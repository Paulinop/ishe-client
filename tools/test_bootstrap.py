"""Checks for the two launcher installers (Windows .ps1 and Mac .command).

The REAL official runtime archives are served from a local web server, so download, checksum,
unpacking and assembly run for real. Windows-only steps (shortcuts, starting the app) and
Mac-only tools (ditto, plutil, codesign, open) are skipped or replaced by recorders.

usage: test_bootstrap.py <pwsh> <boot dir> <electron zips dir> <shims dir> <electron-linux binary>
"""
import http.server, json, os, pathlib, plistlib, shutil, subprocess, sys, tempfile, threading

PWSH, BOOT, ZIPS, SHIMS, ELECTRON = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4]), sys.argv[5]
HITS = []


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        HITS.append(self.path)
        name = self.path.lstrip("/")
        corrupt = name.startswith("corrupt/")
        f = ZIPS / name.split("/")[-1]
        if not f.is_file():
            self.send_response(404); self.end_headers(); return
        data = f.read_bytes()
        if corrupt:
            data = data[:-1] + bytes([data[-1] ^ 0xFF])
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d" % server.server_port
checks = failures = 0


def check(cond, what):
    global checks, failures
    checks += 1
    failures += 0 if cond else 1
    print(("  ok   " if cond else "  FAIL ") + what)


def tree(root):
    return sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file())


APP_FILES = tree(BOOT / "win" / "app")

# =============================================================== Windows installer
print("W1 Windows: fresh install")
root = pathlib.Path(tempfile.mkdtemp(prefix="ishe boot win "))
dest = root / "Local" / "IsheClient"


def run_win(url, pkg=BOOT / "win", install=None):
    cmd = [PWSH, "-NoProfile", "-NonInteractive", "-File", str(pkg / "instalar-launcher.ps1"),
           "-InstallDir", str(install or dest), "-RuntimeUrl", url, "-NoShortcuts", "-NoLaunch", "-NoPause"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=600, stdin=subprocess.DEVNULL)
    return p.returncode, p.stdout + p.stderr


code, out = run_win(BASE + "/electron-v44.5.1-win32-x64.zip")
check(code == 0, "exit code 0 (got %d)%s" % (code, "" if code == 0 else "\n" + out[-600:]))
check((dest / "Ishe Client.exe").is_file() and not (dest / "electron.exe").exists(), "program installed as 'Ishe Client.exe'")
check((dest / "Ishe Client.exe").stat().st_size == 245726208, "it is the untouched official program (same size as in the official archive)")
check(tree(dest / "resources" / "app") == APP_FILES, "Ishe Client's files copied into resources\\app, nothing missing or extra")
check(not (dest / "resources" / "default_app.asar").exists(), "the runtime's demo app is removed")
check((dest / "version").read_text().strip() == "44.5.1" and (dest / "ffmpeg.dll").is_file() and (dest / "locales" / "es.pak").is_file(), "runtime files are complete")
check(not any(p.name.endswith(".instalando") for p in dest.parent.iterdir()) , "no temporary folder left behind")
check("test-hooks.js" not in " ".join(APP_FILES) and not any(f.endswith("cli.js") for f in APP_FILES), "no test code is shipped")

print("W2 Windows: run again = update the client without downloading the runtime")
(dest / "resources" / "app" / "obsoleto.js").write_text("old file from a previous version")
HITS.clear()
code, out = run_win(BASE + "/electron-v44.5.1-win32-x64.zip")
check(code == 0 and HITS == [], "second run downloads nothing")
check(tree(dest / "resources" / "app") == APP_FILES, "client files replaced cleanly (stale file from an older version is gone)")

print("W3 Windows: corrupted download")
dest3 = root / "Local3" / "IsheClient"
code, out = run_win(BASE + "/corrupt/electron-v44.5.1-win32-x64.zip", install=dest3)
check(code == 1 and "codigo de verificacion" in out and not dest3.exists() and not (dest3.parent.exists() and list(dest3.parent.iterdir())), "stops, explains, installs nothing")

print("W4 Windows: other failures")
code, out = run_win(BASE + "/no-such-file.zip", install=root / "Local4" / "IsheClient")
check(code == 1 and "No pude descargar" in out, "download error is explained")
foreign = root / "Local5" / "IsheClient"
foreign.mkdir(parents=True)
(foreign / "mis-cosas.txt").write_text("not ours")
code, out = run_win(BASE + "/electron-v44.5.1-win32-x64.zip", install=foreign)
check(code == 1 and (foreign / "mis-cosas.txt").read_text() == "not ours" and "no es de Ishe Client" in out, "refuses to overwrite a folder it did not create")
partial = pathlib.Path(tempfile.mkdtemp(prefix="ishe-pkg-"))
shutil.copy(BOOT / "win" / "instalar-launcher.ps1", partial)
code, out = run_win(BASE + "/electron-v44.5.1-win32-x64.zip", pkg=partial, install=root / "Local6" / "IsheClient")
check(code == 1 and "Extrae el .zip completo" in out, "zip not fully extracted: explained")
code, out = run_win("http://example.com/electron.zip", install=root / "Local7" / "IsheClient")
check(code == 1 and "no es segura" in out, "refuses a non-https download address")

print("W5 the installed client code actually runs on the same runtime version")
p = subprocess.run(["xvfb-run", "-a", "timeout", "10", ELECTRON, "--no-sandbox", "--disable-gpu", str(dest / "resources" / "app")],
                   capture_output=True, text=True, env=dict(os.environ, HOME=str(root / "home")))
bad = [l for l in p.stderr.splitlines() if "Error" in l and "bus" not in l.lower() and "gpu" not in l.lower() and "dbus" not in l.lower()]
check(p.returncode == 124 and not bad, "installed copy opens and keeps running (stopped by the test after 10 s)%s" % ("" if not bad else ": " + bad[0]))

# =================================================================== Mac installer
def run_mac(url, home, arch="arm64", macos="14.5", pkg=BOOT / "mac", codesign_exit="0"):
    log = home / "shim.log"
    env = dict(os.environ, PATH=str(SHIMS) + os.pathsep + os.environ["PATH"], HOME=str(home), SHIM_LOG=str(log),
               FAKE_ARCH=arch, FAKE_MACOS=macos, FAKE_CODESIGN_EXIT=codesign_exit, ISHE_NO_PAUSE="1", TMPDIR=str(home / "tmp"))
    if url:
        env["ISHE_RUNTIME_URL"] = url
    (home / "tmp").mkdir(parents=True, exist_ok=True)
    p = subprocess.run(["bash", str(pkg / "Instalar Ishe Client.command")], capture_output=True, text=True, timeout=600,
                       stdin=subprocess.DEVNULL, env=env, cwd="/")
    return p.returncode, p.stdout + p.stderr, (log.read_text() if log.exists() else "")


MAC_APP_FILES = tree(BOOT / "mac" / "app")
for arch, package in (("arm64", "darwin-arm64"), ("x86_64", "darwin-x64")):
    print("M1 Mac (%s): fresh install" % arch)
    home = pathlib.Path(tempfile.mkdtemp(prefix="ishe boot mac "))
    HITS.clear()
    code, out, log = run_mac(BASE + "/electron-v44.5.1-%s.zip" % package, home, arch=arch)
    app = home / "Applications" / "Ishe Client.app"
    check(code == 0, "exit code 0 (got %d)%s" % (code, "" if code == 0 else "\n" + out[-600:]))
    check(HITS == ["/electron-v44.5.1-%s.zip" % package], "downloads the runtime for this kind of Mac (%s)" % package)
    check((app / "Contents" / "MacOS" / "Electron").is_file() and os.access(app / "Contents" / "MacOS" / "Electron", os.X_OK), "app assembled in ~/Applications with its program executable")
    info = plistlib.load(open(app / "Contents" / "Info.plist", "rb")) if (app / "Contents" / "Info.plist").is_file() else {}
    check(info.get("CFBundleName") == "Ishe Client" and info.get("CFBundleDisplayName") == "Ishe Client" and info.get("CFBundleIdentifier") == "client.ishe.launcher" and info.get("CFBundleExecutable") == "Electron", "app is named Ishe Client; program entry left intact")
    check(tree(app / "Contents" / "Resources" / "app") == MAC_APP_FILES and not (app / "Contents" / "Resources" / "default_app.asar").exists(), "Ishe Client's files are inside; the runtime's demo app is removed")
    check((app / "Contents" / "Resources" / "electron.icns").read_bytes() == (BOOT / "mac" / "app" / "assets" / "icon.icns").read_bytes(), "app icon replaced with the Ishe Client icon")
    check((app / "Contents" / "Resources" / "ishe-client-motor.txt").read_text() == "44.5.1-" + package, "runtime marker written")
    links = [p for p in app.rglob("*") if p.is_symlink()]
    check(len(links) >= 10 and all(p.exists() for p in links), "framework links inside the app are intact (%d)" % len(links))
    sign = [l for l in log.splitlines() if l.startswith("codesign")]
    check(len(sign) == 1 and "--force --deep --sign -" in sign[0] and sign[0].endswith("Ishe Client.app"), "the finished app is signed locally, after every change to it")
    check(log.splitlines()[-1].startswith("open ") and log.splitlines()[-1].endswith("Applications/Ishe Client.app"), "the app is opened at the end")
    check(not list((home / "tmp").iterdir()), "temporary files cleaned up")

    if arch == "arm64":
        print("M2 Mac: run again = update the client without downloading the runtime")
        (app / "Contents" / "Resources" / "app" / "obsoleto.js").write_text("old")
        HITS.clear()
        code, out, log2 = run_mac(BASE + "/electron-v44.5.1-%s.zip" % package, home, arch=arch)
        new_log = log2[len(log):]
        check(code == 0 and HITS == [], "second run downloads nothing")
        check(tree(app / "Contents" / "Resources" / "app") == MAC_APP_FILES, "client files replaced cleanly")
        check("codesign --force --deep --sign -" in new_log, "app is signed again after the update")

print("M3 Mac: failures")
home = pathlib.Path(tempfile.mkdtemp(prefix="ishe boot mac "))
code, out, log = run_mac(BASE + "/corrupt/electron-v44.5.1-darwin-arm64.zip", home)
check(code == 1 and "codigo de verificacion" in out and not (home / "Applications").exists() and not list((home / "tmp").iterdir()), "corrupted download: stops, installs nothing, cleans up")
code, out, log = run_mac(BASE + "/electron-v44.5.1-darwin-x64.zip", home, arch="arm64")
check(code == 1 and "codigo de verificacion" in out, "runtime for the wrong kind of Mac is rejected by its checksum")
code, out, log = run_mac(BASE + "/electron-v44.5.1-darwin-arm64.zip", home, macos="12.7.6")
check(code == 1 and "macOS 13" in out and HITS[-1] != "/never", "old macOS: explained before downloading anything")
code, out, log = run_mac(BASE + "/electron-v44.5.1-darwin-arm64.zip", home, codesign_exit="1")
check(code == 1 and "codesign" in out and not (home / "Applications" / "Ishe Client.app").exists(), "signing failure: stops and leaves no half-made app")
foreign = home / "Applications" / "Ishe Client.app"
foreign.mkdir(parents=True)
(foreign / "nota.txt").write_text("not ours")
code, out, log = run_mac(BASE + "/electron-v44.5.1-darwin-arm64.zip", home)
check(code == 1 and (foreign / "nota.txt").read_text() == "not ours" and "no la creo este instalador" in out, "refuses to replace an app it did not create")
code, out, log = run_mac("http://example.com/x.zip", pathlib.Path(tempfile.mkdtemp(prefix="ishe boot mac ")))
check(code == 1 and "no es segura" in out, "refuses a non-https download address")
code, out, log = run_mac(BASE + "/electron-v44.5.1-darwin-arm64.zip", pathlib.Path(tempfile.mkdtemp(prefix="ishe boot mac ")), arch="ppc")
check(code == 1 and "tipo de procesador" in out, "unknown processor: explained")

print("\n%d/%d checks passed" % (checks - failures, checks))
sys.exit(1 if failures else 0)
