"""End-to-end checks for instalar-ishe-client.ps1 against a local stand-in for Modrinth and Fabric.

usage: test_installer.py <pwsh> <package dir>
The script under test is the real one; only the two base URLs and the folders are overridden.
"""
import base64, copy, hashlib, http.server, json, os, pathlib, shutil, subprocess, sys, tempfile, threading, urllib.parse

PWSH, PKG = sys.argv[1], pathlib.Path(sys.argv[2])
KIND = sys.argv[3] if len(sys.argv) > 3 else "ps"   # "ps" = Windows script, "perl" = Mac script
E4STEAM = "e4steam-fabric-quilt-mc26.1-26.2-v0.3.2-guard.jar"

IDS = {"fabric-api": "P7dR8mSH", "sodium": "AANobbMI", "lithium": "gvQqBUqZ", "ferrite-core": "uXXizFIs",
       "fancymenu": "Wq5SjeWM", "modmenu": "mOgUt4GM", "melody": "CVT4pFB2", "konkrete": "J81TRJWm",
       "placeholder-api": "eXts2L7r"}
SLUG_OF = {v: k for k, v in IDS.items()}


def blob(name):  # deterministic fake jar content
    return ("fake jar: " + name).encode() * 50


def version(slug, filename, vtype="release", deps=(), optional=(), bad_hash=False, url=None, extra_file=None):
    content = blob(filename)
    sha = hashlib.sha512(b"other" if bad_hash else content).hexdigest()
    files = []
    if extra_file:
        files.append({"filename": extra_file, "primary": False, "url": "BASE/files/" + extra_file,
                      "hashes": {"sha512": hashlib.sha512(blob(extra_file)).hexdigest()}})
    files.append({"filename": filename, "primary": True, "url": url or ("BASE/files/" + urllib.parse.quote(filename)),
                  "hashes": {"sha512": sha, "sha1": "0" * 40}})
    return {"project_id": IDS[slug], "version_number": filename, "version_type": vtype,
            "game_versions": ["26.2"], "loaders": ["fabric"], "files": files,
            "dependencies": [{"project_id": IDS[d], "dependency_type": "required"} for d in deps]
                            + [{"project_id": "optionalXX", "dependency_type": "optional"} for _ in optional]
                            + [{"project_id": None, "dependency_type": "required", "file_name": "embedded.jar"}]}


def base_state():
    return {
        "fabric-api": [version("fabric-api", "fabric-api-0.161.0+26.2.jar")],
        # a beta is listed first: the installer must still pick the release
        "sodium": [version("sodium", "sodium-fabric-0.9.3-beta.1+mc26.2.jar", vtype="beta"),
                   version("sodium", "sodium-fabric-0.9.2+mc26.2.jar")],
        "lithium": [version("lithium", "lithium-fabric-0.25.3+mc26.2.jar")],
        "ferrite-core": [version("ferrite-core", "ferritecore-9.0.0-fabric.jar")],
        "fancymenu": [version("fancymenu", "fancymenu_fabric_3.9.14_MC_26.2.jar",
                              deps=("melody", "fabric-api", "konkrete"), optional=(1,),
                              extra_file="fancymenu-sources.jar")],
        "modmenu": [version("modmenu", "modmenu-20.0.3.jar", deps=("fabric-api", "placeholder-api"))],
        "melody": [version("melody", "melody_fabric_1.0.14_MC_26.2.jar")],
        "konkrete": [version("konkrete", "Konkrete_fabric_1.9.9_MC_26.2.jar")],
        "placeholder-api": [version("placeholder-api", "placeholder-api-3.1.0+26.2.jar")],
    }


STATE = {"mods": base_state(), "requests": []}
FABRIC_PROFILE = json.dumps({"id": "fabric-loader-0.19.5-26.2", "inheritsFrom": "26.2", "type": "release",
                             "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
                             "arguments": {"game": [], "jvm": ["-DFabricMcEmu= net.minecraft.client.main.Main "]},
                             "libraries": [{"name": "net.fabricmc:fabric-loader:0.19.5", "url": "https://maven.fabricmc.net/"}]},
                            separators=(",", ":"))


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        STATE["requests"].append((path, self.headers.get("User-Agent", "")))
        base = "http://127.0.0.1:%d" % self.server.server_port
        if path == "/fabric/versions/loader/26.2":
            body = json.dumps([{"loader": {"version": "0.19.6", "stable": False}, "launcherMeta": {}},
                               {"loader": {"version": "0.19.5", "stable": True}, "launcherMeta": {}},
                               {"loader": {"version": "0.19.4", "stable": True}, "launcherMeta": {}}])
            return self.send(200, body.encode())
        if path == "/fabric/versions/loader/26.2/0.19.5/profile/json":
            return self.send(200, FABRIC_PROFILE.encode())
        if path.startswith("/modrinth/project/") and path.endswith("/version"):
            key = path.split("/")[3]
            slug = SLUG_OF.get(key, key)
            if slug not in STATE["mods"]:
                return self.send(404, b'{"error":"not_found"}')
            body = json.dumps(STATE["mods"][slug]).replace("BASE", base)
            return self.send(200, body.encode())
        if path.startswith("/files/"):
            name = urllib.parse.unquote(path[len("/files/"):])
            return self.send(200, blob(name), "application/java-archive")
        self.send(404, b"{}")


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d" % server.server_port

checks = failures = 0


def check(cond, what):
    global checks, failures
    checks += 1
    if not cond:
        failures += 1
    print(("  ok   " if cond else "  FAIL ") + what)


ORIGINAL_PROFILES = {
    "profiles": {
        "0f8e9c": {"created": "2024-01-05T10:00:00.000Z", "icon": "Grass", "lastUsed": "2026-10-01T18:22:11.482Z",
                   "lastVersionId": "latest-release", "name": "", "type": "latest-release"},
        "mi perfil": {"created": "2025-03-02T09:30:00.000Z", "gameDir": "C:\\Juegos\\Mods & Cosas",
                      "icon": "data:image/png;base64,AAAA", "javaArgs": "-Xmx4G -XX:+UseG1GC",
                      "lastVersionId": "fabric-loader-0.16.5-1.21.1", "name": "Ñandú <modpack> \"viejo\"",
                      "resolution": {"height": 720, "width": 1280}, "type": "custom"},
    },
    "settings": {"crashAssistance": True, "enableAdvanced": False, "keepLauncherOpen": True,
                 "profileSorting": "ByLastPlayed", "locale": "es-MX", "emptyList": [], "nothing": None},
    "version": 3,
}


def make_env(profile_files=("launcher_profiles.json",), raw=None):
    root = pathlib.Path(tempfile.mkdtemp(prefix="ishe-test-"))
    mc, game = root / ".minecraft", root / ".ishe-client"
    mc.mkdir()
    for name in profile_files:
        (mc / name).write_bytes(raw if raw is not None else json.dumps(ORIGINAL_PROFILES, indent=2, ensure_ascii=False).encode("utf-8"))
    return root, mc, game


def run(mc, game, pkg=PKG, extra=()):
    if KIND == "node":
        cmd = [PWSH, str(pkg / "core" / "cli.js"),
               "--modrinth-api", BASE + "/modrinth", "--fabric-meta", BASE + "/fabric",
               "--minecraft-dir", str(mc), "--game-dir", str(game), "--no-pause", *extra]
    elif KIND == "perl":
        cmd = [PWSH, str(pkg / "instalar-ishe-client.pl"),
               "--modrinth-api", BASE + "/modrinth", "--fabric-meta", BASE + "/fabric",
               "--minecraft-dir", str(mc), "--game-dir", str(game), "--no-pause", *extra]
    else:
        cmd = [PWSH, "-NoProfile", "-NonInteractive", "-File", str(pkg / "instalar-ishe-client.ps1"),
               "-ModrinthApi", BASE + "/modrinth", "-FabricMeta", BASE + "/fabric",
               "-MinecraftDir", str(mc), "-GameDir", str(game), "-NoPause", *extra]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL)
    return p.returncode, p.stdout + p.stderr


def mods(game):
    d = game / "mods"
    return sorted(f.name for f in d.iterdir()) if d.is_dir() else []


def same_ignoring_time_format(a, b):
    """PowerShell 7 re-serialises ISO timestamps; Windows PowerShell 5.1 keeps the text. Compare instants."""
    from datetime import datetime
    def norm(v):
        if isinstance(v, dict):
            return {k: norm(x) for k, x in v.items()}
        if isinstance(v, list):
            return [norm(x) for x in v]
        if isinstance(v, str):
            try:
                return ("time", datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp())
            except ValueError:
                return v
        return v
    return norm(a) == norm(b)


EXPECTED_V1 = sorted(["fabric-api-0.161.0+26.2.jar", "sodium-fabric-0.9.2+mc26.2.jar", "lithium-fabric-0.25.3+mc26.2.jar",
                      "ferritecore-9.0.0-fabric.jar", "fancymenu_fabric_3.9.14_MC_26.2.jar", "modmenu-20.0.3.jar",
                      "melody_fabric_1.0.14_MC_26.2.jar", "Konkrete_fabric_1.9.9_MC_26.2.jar",
                      "placeholder-api-3.1.0+26.2.jar", E4STEAM])

# ---------------------------------------------------------------- T1 fresh install
print("T1 fresh install")
root, mc, game = make_env()
original_bytes = (mc / "launcher_profiles.json").read_bytes()
code, out = run(mc, game)
check(code == 0, "exit code 0 (got %d)" % code)
if code != 0:
    print(out)
check(mods(game) == EXPECTED_V1, "mods folder holds exactly the 9 mods + e4steam: %s" % (mods(game) if mods(game) != EXPECTED_V1 else "yes"))
for name in EXPECTED_V1:
    if name != E4STEAM:
        check((game / "mods" / name).read_bytes() == blob(name), "content intact: " + name) if name.startswith(("sodium", "Konkrete")) else None
check((game / "mods" / E4STEAM).read_bytes() == (PKG / "extras" / E4STEAM).read_bytes(), "e4steam copied byte-for-byte")
vdir = mc / "versions" / "fabric-loader-0.19.5-26.2"
check((vdir / "fabric-loader-0.19.5-26.2.json").read_text() == FABRIC_PROFILE, "Fabric version file saved exactly as served (stable 0.19.5, not the newer unstable 0.19.6)")
check((vdir / "fabric-loader-0.19.5-26.2.jar").stat().st_size == 0, "placeholder jar created")
new = json.loads((mc / "launcher_profiles.json").read_text(encoding="utf-8"))
entry = new["profiles"].get("ishe-client", {})
check(entry.get("name") == "Ishe Client" and entry.get("type") == "custom", "profile 'Ishe Client' added")
check(entry.get("lastVersionId") == "fabric-loader-0.19.5-26.2", "profile points at the Fabric version")
check(entry.get("gameDir") == str(game), "profile uses the separate game folder")
icon = entry.get("icon", "")
check(icon.startswith("data:image/png;base64,") and base64.b64decode(icon.split(",", 1)[1])[:8] == b"\x89PNG\r\n\x1a\n", "profile icon is a valid PNG data URI")
without = copy.deepcopy(new); without["profiles"].pop("ishe-client", None)
check(same_ignoring_time_format(without, ORIGINAL_PROFILES), "every other profile and setting is preserved (unicode, quotes, nested, empty list, null)")
backups = [f for f in mc.iterdir() if ".antes-de-ishe-" in f.name]
check(len(backups) == 1 and backups[0].read_bytes() == original_bytes, "backup of launcher_profiles.json equals the original bytes")
manifest = json.loads((game / "ishe-client-instalado.json").read_text())
check(sorted(m["file"] for m in manifest["mods"]) == EXPECTED_V1, "manifest lists what was installed")
check(not any("optionalXX" in r[0] for r in STATE["requests"]), "optional dependencies are not fetched")
check(all(r[1].startswith("IsheClient-") for r in STATE["requests"]), "every request carries the User-Agent")
check(sum(1 for r in STATE["requests"] if r[0] == "/files/fabric-api-0.161.0%2B26.2.jar" or r[0] == "/files/fabric-api-0.161.0+26.2.jar") == 1, "shared dependency (Fabric API) downloaded once")
check("fancymenu-sources.jar" not in mods(game), "only the primary file of a version is installed")

# ---------------------------------------------------------------- T2 run again
print("T2 run again (nothing changed)")
(game / "mods" / "mi-mod-propio.jar").write_bytes(b"user mod")
created_before = entry.get("created")
STATE["requests"].clear()
code, out = run(mc, game)
check(code == 0, "exit code 0")
check(mods(game) == sorted(EXPECTED_V1 + ["mi-mod-propio.jar"]), "no duplicates, and a mod the user added is still there")
check(not any(r[0].startswith("/files/") for r in STATE["requests"]), "nothing is downloaded again when hashes already match")
again = json.loads((mc / "launcher_profiles.json").read_text(encoding="utf-8"))
check(len(again["profiles"]) == 3, "still exactly one Ishe Client profile")
check(same_ignoring_time_format({"c": again["profiles"]["ishe-client"]["created"]}, {"c": created_before}), "profile creation date is kept")

# ---------------------------------------------------------------- T3 update
print("T3 a mod publishes a new version")
STATE["mods"]["sodium"] = [version("sodium", "sodium-fabric-0.9.4+mc26.2.jar"), version("sodium", "sodium-fabric-0.9.2+mc26.2.jar")]
code, out = run(mc, game)
check(code == 0, "exit code 0")
now = mods(game)
check("sodium-fabric-0.9.4+mc26.2.jar" in now and "sodium-fabric-0.9.2+mc26.2.jar" not in now, "new Sodium installed and the old file removed (no duplicate mod)")
check("mi-mod-propio.jar" in now and len(now) == 11, "user mod untouched, nothing else changed")

# ---------------------------------------------------------------- T4 corrupted download
print("T4 a download does not match its checksum")
STATE["mods"]["lithium"] = [version("lithium", "lithium-fabric-0.26.0+mc26.2.jar", bad_hash=True)]
code, out = run(mc, game)
now = mods(game)
check(code == 2, "exit code 2 = finished with warnings (got %d)" % code)
check("lithium-fabric-0.26.0+mc26.2.jar" not in now and not any(n.endswith(".descargando") for n in now), "bad file is not installed and no partial file is left")
check("lithium-fabric-0.25.3+mc26.2.jar" in now, "the previous working Lithium is kept")
check("AVISO" in out and "lithium" in out, "the warning names the mod")

# ---------------------------------------------------------------- T5 mod missing for this version
print("T5 a mod has no build for 26.2")
STATE["mods"]["lithium"] = []
code, out = run(mc, game)
check(code == 2 and "lithium-fabric-0.25.3+mc26.2.jar" in mods(game), "warning, and the installed Lithium is kept")
STATE["mods"] = base_state()

# ---------------------------------------------------------------- T6 hostile file names from the API
print("T6 unsafe file names / paths from the API are refused")
for bad in ["..\\..\\evil.jar", "sub/evil.jar", "C:evil.jar", "evil.exe", ".hidden.jar"]:
    r2, mc2, game2 = make_env()
    STATE["mods"]["ferrite-core"] = [version("ferrite-core", "ferritecore-9.0.0-fabric.jar")]
    STATE["mods"]["ferrite-core"][0]["files"][0]["filename"] = bad
    code, out = run(mc2, game2)
    stray = [str(p.relative_to(r2)) for p in r2.rglob("*") if p.is_file() and ("evil" in p.name or p.name.startswith(".hidden"))]
    check(code == 2 and not stray, "refused %r, nothing written outside or inside mods" % bad)
    shutil.rmtree(r2)
STATE["mods"] = base_state()

# ---------------------------------------------------------------- T7 launcher never opened / other layouts
print("T7 launcher profile file variants")
r3, mc3, game3 = make_env(profile_files=())
code, out = run(mc3, game3)
check(code == 2 and mods(game3) == EXPECTED_V1 and "Abre el launcher oficial una vez" in out, "no profile file: mods installed, clear instruction shown")
r4, mc4, game4 = make_env(profile_files=("launcher_profiles_microsoft_store.json",))
code, out = run(mc4, game4)
ms = json.loads((mc4 / "launcher_profiles_microsoft_store.json").read_text(encoding="utf-8"))
check(code == 0 and "ishe-client" in ms["profiles"], "Microsoft Store launcher file is handled")
r5, mc5, game5 = make_env(profile_files=("launcher_profiles.json", "launcher_profiles_microsoft_store.json"))
code, out = run(mc5, game5)
check(code == 0 and all("ishe-client" in json.loads((mc5 / n).read_text(encoding="utf-8"))["profiles"] for n in ("launcher_profiles.json", "launcher_profiles_microsoft_store.json")), "both files present: both updated")
garbage = b'{"profiles": {"a": {"name": "x"}, '
r6, mc6, game6 = make_env(raw=garbage)
code, out = run(mc6, game6)
check(code == 2 and (mc6 / "launcher_profiles.json").read_bytes() == garbage, "damaged profile file is left byte-for-byte untouched")
r7, mc7, game7 = make_env(raw=b'{"settings": {"locale": "es"}}')
code, out = run(mc7, game7)
p7 = json.loads((mc7 / "launcher_profiles.json").read_text())
check(code == 0 and "ishe-client" in p7["profiles"] and p7["settings"] == {"locale": "es"}, "file without a profiles section gets one")

# ---------------------------------------------------------------- T8 hard stops
print("T8 hard stops leave everything alone")
r8 = pathlib.Path(tempfile.mkdtemp(prefix="ishe-test-"))
code, out = run(r8 / "no-minecraft", r8 / ".ishe-client")
check(code == 1 and not (r8 / ".ishe-client").exists() and "launcher oficial" in out, "Minecraft not installed: stops with an explanation, creates nothing")
tampered = pathlib.Path(tempfile.mkdtemp(prefix="ishe-pkg-"))
shutil.copytree(PKG, tampered / "pkg")
(tampered / "pkg" / "extras" / E4STEAM).write_bytes(b"not the real jar")
r9, mc9, game9 = make_env()
before = (mc9 / "launcher_profiles.json").read_bytes()
code, out = run(mc9, game9, pkg=tampered / "pkg")
check(code == 1 and not game9.exists() and (mc9 / "launcher_profiles.json").read_bytes() == before and not (mc9 / "versions").exists(), "altered e4steam file: stops before touching anything")
missing = pathlib.Path(tempfile.mkdtemp(prefix="ishe-pkg-"))
shutil.copytree(PKG, missing / "pkg")
(missing / "pkg" / "extras" / E4STEAM).unlink()
code, out = run(mc9, game9, pkg=missing / "pkg")
check(code == 1 and "Extrae el .zip completo" in out, "zip not fully extracted: stops with an explanation")

if KIND != "perl":
    print("\n%d/%d checks passed" % (checks - failures, checks))
    sys.exit(1 if failures else 0)

# ---------------------------------------------------------------- T9 default Mac folders (Mac script only)
if KIND == "perl":
    print("T9 default folders on a Mac (no folder options given)")
    home = pathlib.Path(tempfile.mkdtemp(prefix="ishe home with spaces "))
    support = home / "Library" / "Application Support"
    (support / "minecraft").mkdir(parents=True)
    (support / "minecraft" / "launcher_profiles.json").write_text(json.dumps(ORIGINAL_PROFILES), encoding="utf-8")
    env = dict(os.environ, HOME=str(home))
    p = subprocess.run([PWSH, str(PKG / "instalar-ishe-client.pl"), "--modrinth-api", BASE + "/modrinth",
                        "--fabric-meta", BASE + "/fabric", "--no-pause"],
                       capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL, env=env)
    prof = json.loads((support / "minecraft" / "launcher_profiles.json").read_text(encoding="utf-8"))
    check(p.returncode == 0 and mods(support / "ishe-client") == EXPECTED_V1, "installs into ~/Library/Application Support/ishe-client")
    check(prof["profiles"]["ishe-client"]["gameDir"] == str(support / "ishe-client"), "profile points at that folder (path with spaces)")
    check((support / "minecraft" / "versions" / "fabric-loader-0.19.5-26.2" / "fabric-loader-0.19.5-26.2.json").is_file(), "Fabric version placed in ~/Library/Application Support/minecraft/versions")
    # the pause at the end must not hang or fail when there is no keyboard attached
    p2 = subprocess.run([PWSH, str(PKG / "instalar-ishe-client.pl"), "--modrinth-api", BASE + "/modrinth",
                         "--fabric-meta", BASE + "/fabric"], capture_output=True, text=True, timeout=300,
                        stdin=subprocess.DEVNULL, env=env)
    check(p2.returncode == 0 and "Pulsa Enter para cerrar" in p2.stdout, "interactive mode (with the final pause) completes")
    print("\n%d/%d checks passed (including T9)" % (checks - failures, checks))
    sys.exit(1 if failures else 0)
