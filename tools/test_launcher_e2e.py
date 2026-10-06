"""Drives the REAL launcher window (Electron under a virtual display) against local stand-ins
for Modrinth and Fabric, checks what it did on disk and on screen, and saves screenshots.

usage: test_launcher_e2e.py <electron binary> <app dir> <output dir> [creator private key .pem]
"""
import base64, hashlib, http.server, io, json, os, pathlib, shutil, subprocess, sys, tempfile, threading, urllib.parse
from PIL import Image

ELECTRON, APP, OUT = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
KEY_FILE = pathlib.Path(sys.argv[4]) if len(sys.argv) > 4 else None     # creator's private key (for update scenarios)
TOOLS = pathlib.Path(__file__).resolve().parent
APP_VERSION = json.loads((APP / "package.json").read_text())["version"]
E4STEAM = "e4steam-fabric-quilt-mc26.1-26.2-v0.3.2-guard.jar"
IDS = {"fabric-api": "P7dR8mSH", "sodium": "AANobbMI", "lithium": "gvQqBUqZ", "ferrite-core": "uXXizFIs",
       "fancymenu": "Wq5SjeWM", "modmenu": "mOgUt4GM", "melody": "CVT4pFB2", "konkrete": "J81TRJWm",
       "placeholder-api": "eXts2L7r"}
SLUG_OF = {v: k for k, v in IDS.items()}
FILES = {"fabric-api": "fabric-api-0.161.0+26.2.jar", "sodium": "sodium-fabric-0.9.2+mc26.2.jar",
         "lithium": "lithium-fabric-0.25.3+mc26.2.jar", "ferrite-core": "ferritecore-9.0.0-fabric.jar",
         "fancymenu": "fancymenu_fabric_3.9.14_MC_26.2.jar", "modmenu": "modmenu-20.0.3.jar",
         "melody": "melody_fabric_1.0.14_MC_26.2.jar", "konkrete": "Konkrete_fabric_1.9.9_MC_26.2.jar",
         "placeholder-api": "placeholder-api-3.1.0+26.2.jar"}
DEPS = {"fancymenu": ["melody", "fabric-api", "konkrete"], "modmenu": ["fabric-api", "placeholder-api"]}
BROKEN = set()   # slugs whose download is served with a wrong checksum


def blob(name):
    return ("fake jar: " + name).encode() * 50


def sha1(b):
    return hashlib.sha1(b).hexdigest()


# ---------------------------------------------------------------- stand-ins for Microsoft / Xbox / Minecraft Services
MS_REFRESH, MC_TOKEN = "ms-refresh-token-0001", "mc-access-token-SECRET"
AUTH = {}          # what the fake services answer; reset per scenario
AUTH_LOG = []      # (path, body) of every sign-in request
TEX_HITS = []      # skin image requests
UPDATE = {}        # file name -> bytes: what the stand-in "GitHub releases page" serves
UPDATE_HITS = []
SKIN_HASH = "31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb"
REAL_UUID, OTHER_UUID = "abcdef0123456789abcdef0123456789", "11112222333344445555666677778888"
PLAYERS = {"guishe_7": {"id": REAL_UUID, "name": "Guishe_7"}, "otrojugador": {"id": OTHER_UUID, "name": "OtroJugador"}}   # public name lookup
LOOKUP_HITS = []


def make_skin():
    """64x64 skin: orange face, one dark pixel on the hat layer at face position (3,3)."""
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for x in range(8, 16):
        for y in range(8, 16):
            im.putpixel((x, y), (200, 100, 50, 255))
    im.putpixel((43, 11), (10, 20, 30, 255))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


SKIN_PNG = make_skin()
FACE_EXPECTED = "200.100.50.255|10.20.30.255|200.100.50.255"


def auth_reset(**changes):
    AUTH.clear()
    AUTH.update(device="approve", approved=True, owned=True, refresh_ok=True, refresh_count=0, skin=True)
    TEX_HITS.clear()
    AUTH.update(changes)
    AUTH_LOG.clear()


auth_reset()

# ---------------------------------------------------------------- stand-in for Mojang's download servers
GAME = {}          # path -> bytes
GAME_HITS = []
FAKE_JAVA = b"""#!/bin/sh
for a in "$@"; do printf '%s\\n' "$a"; done > "$ISHE_FAKE_JAVA_OUT"
prev=""
for a in "$@"; do [ "$prev" = "--accessToken" ] && echo "session line: $a"; prev="$a"; done
echo "fake minecraft says hello"
[ "${ISHE_FAKE_JAVA_EXIT:-0}" != "0" ] && echo "Exception in thread main: fake crash" 1>&2
exit ${ISHE_FAKE_JAVA_EXIT:-0}
"""


def build_game(base, tamper=None):
    GAME.clear()

    def put(path, body):
        GAME[path] = body
        return body

    def lib(name, osname=None):
        g, a, v = name.split(":")[:3]
        c = name.split(":")[3] if name.count(":") == 3 else None
        rel = "%s/%s/%s/%s-%s%s.jar" % (g.replace(".", "/"), a, v, a, v, "-" + c if c else "")
        body = put("/game/libs/" + rel, ("jar:" + name).encode())
        e = {"name": name, "downloads": {"artifact": {"path": rel, "sha1": sha1(body), "size": len(body), "url": base + "/game/libs/" + rel}}}
        if osname:
            e["rules"] = [{"action": "allow", "os": {"name": osname}}]
        return e

    client = put("/game/client.jar", b"the game")
    a1, a2 = b"sound one", b"texture two"
    for a in (a1, a2):
        put("/game/assets/%s/%s" % (sha1(a)[:2], sha1(a)), a)
    index = put("/game/index32.json", json.dumps({"objects": {"minecraft/sounds/a.ogg": {"hash": sha1(a1), "size": len(a1)},
                                                              "minecraft/textures/b.png": {"hash": sha1(a2), "size": len(a2)}}}).encode())
    version = {
        "id": "26.2", "type": "release", "mainClass": "net.minecraft.client.main.Main",
        "arguments": {
            "game": ["--username", "${auth_player_name}", "--version", "${version_name}", "--gameDir", "${game_directory}",
                     "--assetsDir", "${assets_root}", "--assetIndex", "${assets_index_name}", "--uuid", "${auth_uuid}",
                     "--accessToken", "${auth_access_token}", "--clientId", "${clientid}", "--xuid", "${auth_xuid}",
                     "--versionType", "${version_type}",
                     {"rules": [{"action": "allow", "features": {"is_demo_user": True}}], "value": "--demo"}],
            "jvm": [{"rules": [{"action": "allow", "os": {"name": "osx"}}], "value": ["-XstartOnFirstThread"]},
                    "-Djava.library.path=${natives_directory}/java", "-Dminecraft.launcher.brand=${launcher_name}", "-cp", "${classpath}"],
            "default-user-jvm": [{"value": ["-Xms2G", "-Xmx4G"]}],
        },
        "assetIndex": {"id": "32", "sha1": sha1(index), "url": base + "/game/index32.json"}, "assets": "32",
        "javaVersion": {"component": "java-runtime-epsilon", "majorVersion": 25},
        "downloads": {"client": {"sha1": sha1(client), "size": len(client), "url": base + "/game/client.jar"}},
        "libraries": [lib("com.google.code.gson:gson:2.14.0"), lib("org.lwjgl:lwjgl:3.4.1"),
                      lib("org.lwjgl:lwjgl:3.4.1:natives-linux", "linux"), lib("org.lwjgl:lwjgl:3.4.1:natives-windows", "windows")],
    }
    vbody = put("/game/v/26.2.json", json.dumps(version).encode())
    put("/game/manifest.json", json.dumps({"versions": [{"id": "26.2", "type": "release", "url": base + "/game/v/26.2.json", "sha1": sha1(vbody)}]}).encode())
    jbin, jlib = put("/game/java/files/bin/java", FAKE_JAVA), put("/game/java/files/lib/modules", b"java modules")
    jman = put("/game/java/manifest.json", json.dumps({"files": {
        "bin": {"type": "directory"},
        "bin/java": {"type": "file", "executable": True, "downloads": {"raw": {"sha1": sha1(jbin), "size": len(jbin), "url": base + "/game/java/files/bin/java"}}},
        "lib": {"type": "directory"},
        "lib/modules": {"type": "file", "executable": False, "downloads": {"raw": {"sha1": sha1(jlib), "size": len(jlib), "url": base + "/game/java/files/lib/modules"}}}}}).encode())
    put("/game/java/all.json", json.dumps({"linux": {"java-runtime-epsilon": [{"manifest": {"sha1": sha1(jman), "url": base + "/game/java/manifest.json"}}]}}).encode())
    floader = put("/game/fabric/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar", b"jar:fabric-loader")
    if tamper:
        GAME[tamper] = b"tampered"
    return json.dumps({"id": "fabric-loader-0.19.5-26.2", "inheritsFrom": "26.2", "type": "release",
                       "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
                       "arguments": {"game": [], "jvm": ["-DFabricMcEmu= net.minecraft.client.main.Main "]},
                       "libraries": [{"name": "net.fabricmc:fabric-loader:0.19.5", "url": base + "/game/fabric/", "sha1": sha1(floader)}]})


FABRIC_PROFILE = json.dumps({"id": "fabric-loader-0.19.5-26.2", "inheritsFrom": "26.2", "type": "release",
                             "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient", "libraries": []})


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        AUTH_LOG.append((path, body))
        j = lambda code, obj: self.send(code, json.dumps(obj).encode())
        if path == "/auth/devicecode":
            if AUTH["device"] == "down":
                return j(500, {})
            return j(200, {"device_code": "dev-code-1", "user_code": "ABCD1234", "verification_uri": "https://www.microsoft.com/link",
                           "interval": 1, "expires_in": 900})
        if path == "/auth/token":
            form = urllib.parse.parse_qs(body)
            if form.get("grant_type") == ["refresh_token"]:
                AUTH["refresh_count"] += 1
                if not AUTH["refresh_ok"] or form.get("refresh_token") != [MS_REFRESH]:
                    return j(400, {"error": "invalid_grant"})
                return j(200, {"access_token": "ms-access-renewed", "refresh_token": MS_REFRESH})
            if AUTH["device"] == "decline":
                return j(400, {"error": "authorization_declined"})
            if AUTH["device"] == "wait":
                return j(400, {"error": "authorization_pending"})
            return j(200, {"access_token": "ms-access-first", "refresh_token": MS_REFRESH})
        if path == "/auth/xbox":
            return j(200, {"Token": "xbl-token", "DisplayClaims": {"xui": [{"uhs": "user-hash"}]}})
        if path == "/auth/xsts":
            return j(200, {"Token": "xsts-token"})
        if path == "/auth/login":
            return j(200, {"access_token": MC_TOKEN, "expires_in": 86400}) if AUTH["approved"] else j(403, {"error": "FORBIDDEN"})
        j(404, {})

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        base = "http://127.0.0.1:%d" % self.server.server_port
        if path == "/auth/profile":
            AUTH_LOG.append((path, self.headers.get("Authorization", "")))
            if not AUTH["owned"]:
                return self.send(404, b'{"error":"NOT_FOUND"}')
            skins = [{"id": "x", "state": "ACTIVE", "url": "http://textures.minecraft.net/texture/" + SKIN_HASH, "variant": "CLASSIC"}] if AUTH["skin"] else []
            return self.send(200, json.dumps({"id": "abcdef0123456789abcdef0123456789", "name": "Guishe_7", "skins": skins}).encode())
        if path.startswith("/auth/lookup/"):
            LOOKUP_HITS.append(path)
            hit = PLAYERS.get(path[len("/auth/lookup/"):].lower())
            return self.send(200, json.dumps(hit).encode()) if hit else self.send(404, b'{"errorMessage":"not found"}')
        if path.startswith("/auth/session/"):
            value = base64.b64encode(json.dumps({"textures": {"SKIN": {"url": "http://textures.minecraft.net/texture/" + SKIN_HASH}}}).encode()).decode()
            return self.send(200, json.dumps({"id": path.split("/")[-1], "properties": [{"name": "textures", "value": value}]}).encode())
        if path.startswith("/auth/texture/"):
            TEX_HITS.append(path)
            return self.send(200, SKIN_PNG, "image/png") if path.endswith("/" + SKIN_HASH) else self.send(404, b"")
        if path.startswith("/update/"):
            name = urllib.parse.unquote(path[len("/update/"):])
            UPDATE_HITS.append(name)
            return self.send(200, UPDATE[name], "application/octet-stream") if name in UPDATE else self.send(404, b"")
        if path == "/auth/entitlements":
            return self.send(200, json.dumps({"items": [{"name": "game_minecraft"}, {"name": "product_minecraft"}]}).encode())
        if path.startswith("/game/"):
            GAME_HITS.append(path)
            return self.send(200, GAME[path], "application/octet-stream") if path in GAME else self.send(404, b"")
        if path == "/fabric/versions/loader/26.2":
            return self.send(200, json.dumps([{"loader": {"version": "0.19.5", "stable": True}}]).encode())
        if path == "/fabric/versions/loader/26.2/0.19.5/profile/json":
            return self.send(200, (FABRIC_FOR_GAME or FABRIC_PROFILE).encode())
        if path.startswith("/modrinth/project/") and path.endswith("/version"):
            slug = SLUG_OF.get(path.split("/")[3], path.split("/")[3])
            if slug not in FILES:
                return self.send(404, b"{}")
            name = FILES[slug]
            digest = hashlib.sha512(b"wrong" if slug in BROKEN else blob(name)).hexdigest()
            body = [{"project_id": IDS[slug], "version_type": "release",
                     "files": [{"filename": name, "primary": True, "url": base + "/files/" + urllib.parse.quote(name),
                                "hashes": {"sha512": digest}}],
                     "dependencies": [{"project_id": IDS[d], "dependency_type": "required"} for d in DEPS.get(slug, [])]}]
            return self.send(200, json.dumps(body).encode())
        if path.startswith("/files/"):
            return self.send(200, blob(urllib.parse.unquote(path[7:])), "application/java-archive")
        self.send(404, b"{}")


FABRIC_FOR_GAME = None
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d" % server.server_port

checks = failures = 0


def check(cond, what):
    global checks, failures
    checks += 1
    failures += 0 if cond else 1
    print(("  ok   " if cond else "  FAIL ") + what)


PROFILES = {"profiles": {"abc123": {"name": "", "type": "latest-release", "lastVersionId": "latest-release",
                                    "created": "2024-01-05T10:00:00.000Z", "lastUsed": "2026-10-01T18:22:11.482Z"}},
            "settings": {"keepLauncherOpen": True}, "version": 3}
EXPECTED_MODS = sorted(list(FILES.values()) + [E4STEAM])


def run(name, steps, with_minecraft=True, scenario="", root=None, java_exit="0", extra=None):
    root = root or pathlib.Path(tempfile.mkdtemp(prefix="ishe-e2e-"))
    mc, game = root / ".minecraft", root / ".ishe-client"
    if with_minecraft and not mc.exists():
        mc.mkdir()
        (mc / "launcher_profiles.json").write_text(json.dumps(PROFILES, indent=2))
    out = OUT / name
    shutil.rmtree(out, ignore_errors=True)
    env = dict(os.environ, ISHE_TEST_OUT=str(out), ISHE_TEST_STEPS=json.dumps(steps),
               ISHE_TEST_MODRINTH_API=BASE + "/modrinth", ISHE_TEST_FABRIC_META=BASE + "/fabric",
               ISHE_TEST_MINECRAFT_DIR=str(mc), ISHE_TEST_GAME_DIR=str(game),
               ISHE_TEST_USER_DATA=str(root / "userdata"), ISHE_TEST_SCENARIO=scenario,
               ISHE_TEST_AUTH_BASE=BASE + "/auth", ISHE_TEST_GAME_BASE=BASE + "/game", ISHE_TEST_WEAK_STORE="1",
               ISHE_FAKE_JAVA_OUT=str(root / "java-argv.txt"), ISHE_FAKE_JAVA_EXIT=java_exit)
    env.pop("ISHE_TEST_UPDATE_BASE", None)
    env.update(extra or {})
    p = subprocess.run(["xvfb-run", "-a", "-s", "-screen 0 1280x800x24", ELECTRON, "--no-sandbox", "--disable-gpu",
                        "--force-device-scale-factor=1", str(APP)], env=env, capture_output=True, text=True, timeout=180)
    result_file = out / "result.json"
    result = json.loads(result_file.read_text()) if result_file.exists() else {"steps": [], "errors": ["no result file; stderr: " + p.stderr[-800:]]}
    return root, mc, game, result


def mods(game):
    d = game / "mods"
    return sorted(f.name for f in d.iterdir()) if d.is_dir() else []


# ------------------------------------------------------------------ S1 first run, then settings, then second run
print("S1 first run in the real window, change memory, run again")
root, mc, game, r = run("s1", ["dump:inicio", "shot:01-inicio", "play", "dump:listo", "shot:02-listo", "log", "shot:03-detalles",
                               "view:mods", "dump:mods", "shot:04-mods", "view:ajustes", "ram:4", "dump:ajustes", "shot:05-ajustes",
                               "view:inicio", "play", "dump:segunda"])
check(not r["errors"], "no errors in the window or console: %s" % (r["errors"] or "none"))
by = {s["label"]: s for s in r["steps"]}
check(by.get("inicio", {}).get("news") == 3 and "primera vez" in by.get("inicio", {}).get("status", ""), "start screen shows news and the first-run hint")
check(by.get("inicio", {}).get("nodeAccess") is False and by["inicio"]["bridge"] == "clearDisplayName,clearLogo,creatorBuild,creatorForgetKey,creatorLoadKey,creatorOpenFolder,getState,loginCancel,loginCopyCode,loginOpenPage,loginStart,logout,onEvent,openFolder,pickLogo,play,resetTheme,setDisplayName,setRam,setTheme,updateCheck,updateRestart", "page has no system access, only the 22 bridge functions")
check(by["inicio"]["nameLinkHidden"] is True and by["inicio"]["provisionalHidden"] is True, "signed out: nothing offers to type a player name")
check(by["inicio"]["footVersion"] == "Ishe Client " + APP_VERSION and by["inicio"]["updateStatus"] == "idle" and not UPDATE_HITS, "shows its version; without a releases page configured for the test it contacts nobody")
check(by["inicio"]["legal"] == "NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT." and by["inicio"]["legal"] in by["inicio"]["pageText"], "official disclaimer is visible on the main screen")
check("NO ES UN PRODUCTO OFICIAL DE MINECRAFT. NO ESTÁ APROBADO POR MOJANG NI MICROSOFT, NI ASOCIADO CON ELLOS." in by.get("ajustes", {}).get("pageText", ""), "Settings shows the disclaimer in Spanish too")
check(by["inicio"]["accountName"] == "Sin sesión" and by["inicio"]["accountButton"] == "Iniciar sesión" and by["inicio"]["state"]["signedIn"] is False, "starts signed out")
check(not (root / "java-argv.txt").exists() and not AUTH_LOG and not GAME_HITS, "signed out: Play never starts the game, never contacts sign-in or game servers")
check("Abriendo el launcher oficial" in by.get("listo", {}).get("status", "") and by["listo"]["statusClass"].endswith("is-good"), "after Play: success message")
check("elige el perfil «Ishe Client»" in by.get("listo", {}).get("noticeText", "") and by["listo"]["noticeItems"] == [], "after Play: tells the user the last step, no warnings")
check(by.get("listo", {}).get("playLabel") == "JUGAR" and by["listo"]["playDisabled"] is False, "Play button is usable again")
check(mods(game) == EXPECTED_MODS, "mods folder holds exactly the 9 mods + e4steam")
prof = json.loads((mc / "launcher_profiles.json").read_text())
check(prof["profiles"].get("ishe-client", {}).get("lastVersionId") == "fabric-loader-0.19.5-26.2" and prof["profiles"]["ishe-client"]["gameDir"] == str(game), "official launcher profile created and pointing at the client folder")
check("abc123" in prof["profiles"] and prof["settings"] == {"keepLauncherOpen": True}, "existing profile and settings preserved")
check(len(by.get("mods", {}).get("mods", [])) == 10 and "e4steam (corregido)" in by["mods"]["mods"] and "Sodium" in by["mods"]["mods"], "Mods screen lists the 10 mods with friendly names")
check(by.get("ajustes", {}).get("ram") == "4" and "Guardado" in by["ajustes"]["ramHint"] and by["ajustes"]["gameDir"] == str(game), "Settings: memory saved, folder shown")
check(prof["profiles"]["ishe-client"].get("javaArgs") == "-Xmx4G" and "ya estaba" in by.get("segunda", {}).get("log", ""), "second Play applies 4 GB to the profile and re-downloads nothing")
check(len([f for f in mc.iterdir() if ".antes-de-ishe-" in f.name]) == 2, "one backup per profile change (2 changes -> 2 backups)")

# ------------------------------------------------------------------ S2 official launcher is open
print("S2 official launcher is open when the profile has to be written")
root2, mc2, game2, r2 = run("s2", ["play", "dump:abierto", "shot:01-cerrar-launcher"], scenario="launcher-open")
before = json.dumps(PROFILES, indent=2)
s = (r2["steps"] or [{}])[0]
check(not r2["errors"] and (mc2 / "launcher_profiles.json").read_text() == before, "profile file is NOT touched while the launcher is open")
check("cierra el launcher oficial" in s.get("status", "") and "Ciérralo y vuelve a pulsar Jugar" in s.get("noticeText", ""), "window asks to close the launcher and press Play again")
check(mods(game2) == EXPECTED_MODS, "mods were still prepared")
root2, mc2, game2, r2b = run("s2b", ["play", "dump:reintento"], root=root2)
check("Abriendo el launcher oficial" in (r2b["steps"] or [{}])[0].get("status", "") and "ishe-client" in json.loads((mc2 / "launcher_profiles.json").read_text())["profiles"], "after closing it, Play again finishes the job")

# ------------------------------------------------------------------ S3 no Minecraft on this computer
print("S3 Minecraft is not installed")
root3, mc3, game3, r3 = run("s3", ["dump:sin-mc", "shot:01-sin-minecraft", "play", "dump:detenido", "shot:02-detenido"], with_minecraft=False)
b3 = {s["label"]: s for s in r3["steps"]}
check(not r3["errors"] and b3.get("sin-mc", {}).get("noticeTitle") == "Inicia sesión para jugar" and "launcher oficial" in b3["sin-mc"]["noticeText"], "start screen explains the two ways to play")
check(b3.get("detenido", {}).get("statusClass", "").endswith("is-bad") and "launcher oficial" in b3["detenido"]["noticeText"] and not game3.exists(), "Play stops with an explanation and creates nothing")

# ------------------------------------------------------------------ S4 one mod fails to download
print("S4 one mod download is corrupted")
BROKEN.add("lithium")
root4, mc4, game4, r4 = run("s4", ["play", "dump:aviso", "shot:01-con-avisos"])
BROKEN.clear()
s4 = (r4["steps"] or [{}])[0]
check(not r4["errors"] and "hubo avisos" in s4.get("noticeTitle", "") and any("lithium" in i for i in s4.get("noticeItems", [])), "window reports the warning and names the mod")
check("lithium-fabric-0.25.3+mc26.2.jar" not in mods(game4) and len(mods(game4)) == 9 and "ishe-client" in json.loads((mc4 / "launcher_profiles.json").read_text())["profiles"], "the bad file is not installed; everything else is, and the profile exists")


# ================================================================== sign-in and direct start (simulated services)
def argv(root):
    f = root / "java-argv.txt"
    return f.read_text().split("\n")[:-1] if f.exists() else None


def after(args, flag):
    return args[args.index(flag) + 1] if args and flag in args else None


def paths(prefix):
    return [p for p, _ in AUTH_LOG if p.startswith(prefix)]


def secrets_in(obj):
    text = json.dumps(obj)
    return [x for x in (MS_REFRESH, MC_TOKEN, "ms-access-first", "ms-access-renewed", "xsts-token", "dev-code-1") if x in text]


FABRIC_FOR_GAME = build_game(BASE)

# ------------------------------------------------------------------ S5 sign in, then Play starts the game itself
print("S5 sign in with Microsoft, then Play starts the game directly")
auth_reset()
GAME_HITS.clear()
root5, mc5, game5, r5 = run("s5", ["login", "dump:dialogo", "shot:01-codigo", "login-open", "login-copy", "dump:copiado", "login-wait",
                                   "dump:sesion", "shot:02-sesion", "view:ajustes", "dump:ajustes", "view:inicio",
                                   "play", "wait-exit", "dump:jugado", "shot:03-jugado"])
b5 = {x["label"]: x for x in r5["steps"]}
check(not r5["errors"], "no errors in the window or console: %s" % (r5["errors"] or "none"))
d = b5.get("dialogo", {})
check(d.get("loginHidden") is False and d.get("loginCode") == "ABCD1234" and d.get("loginPage") == "www.microsoft.com/link", "dialog shows Microsoft's code and page")
check("nunca en Ishe Client" in d.get("pageText", "") and (OUT / "s5" / "opened-url.txt").read_text() == "https://www.microsoft.com/link", "password is typed only at Microsoft: the button opens exactly Microsoft's page")
check(b5.get("copiado", {}).get("loginCopy") == "Código copiado", "copy-code button works")
se = b5.get("sesion", {})
check(se.get("loginHidden") is True and se.get("accountName") == "Guishe_7" and se.get("accountSub") == "Minecraft: Java Edition" and se.get("accountButton") == "Cerrar sesión", "after approving: account shown, dialog closed")
check("Sesión iniciada como Guishe_7" in se.get("status", "") and se.get("state", {}).get("pendingApproval") is False, "status confirms the session")
check(not secrets_in(r5), "no token or session ever reaches the window (state, text, log): %s" % (secrets_in(r5) or "none"))
check("se guarda cifrada" in b5.get("ajustes", {}).get("sessionHint", ""), "Settings says the session is stored encrypted")
a5 = argv(root5)
check(a5 is not None and after(a5, "--username") == "Guishe_7" and after(a5, "--uuid") == "abcdef0123456789abcdef0123456789" and after(a5, "--accessToken") == MC_TOKEN, "game started with the signed-in account")
check(a5 is not None and after(a5, "--gameDir") == str(game5) and after(a5, "--version") == "fabric-loader-0.19.5-26.2" and "net.fabricmc.loader.impl.launch.knot.KnotClient" in a5 and "--demo" not in a5, "game started with Fabric in the Ishe Client folder")
cp5 = (after(a5, "-cp") or "").split(":")
check(len(cp5) == 5 and all(os.path.isfile(f) for f in cp5) and cp5[-1] == str(mc5 / "versions" / "26.2" / "26.2.jar") and not any("natives-windows" in f for f in cp5), "classpath: Fabric + 3 libraries for this system + the game, all downloaded")
check("-Xmx4G" in (a5 or []) and (game5 / "runtime" / "java-runtime-epsilon" / "linux" / "bin" / "java").is_file(), "Java downloaded into the client folder; recommended memory used")
check(mods(game5) == EXPECTED_MODS, "mods were prepared before starting")
j = b5.get("jugado", {})
check("Minecraft se cerró. Pulsa Jugar" in j.get("status", "") and j.get("playLabel") == "JUGAR" and j.get("playDisabled") is False and j.get("noticeHidden") is True, "after the game closes normally the launcher is ready again")
check(all(w in j.get("log", "") for w in ("Comprobando tu cuenta", "Descargando Minecraft", "Descargando bibliotecas", "Preparando Java", "Abriendo Minecraft")), "details list every step")
check(paths("/auth/") == ["/auth/devicecode", "/auth/token", "/auth/xbox", "/auth/xsts", "/auth/login", "/auth/profile"] and AUTH["refresh_count"] == 0, "sign-in chain ran once; Play reused the session in memory: %s" % paths("/auth/"))
sfile = root5 / "userdata" / "sesion.json"
check(sfile.is_file() and MS_REFRESH not in sfile.read_text() and MC_TOKEN not in sfile.read_text() and (sfile.stat().st_mode & 0o077) == 0, "session file exists, holds no readable token, and is private to the user")
check(json.loads(sfile.read_text()).get("account") == {"name": "Guishe_7", "uuid": "abcdef0123456789abcdef0123456789"}, "session file remembers only the player name and id next to the protected token")
others = [f for f in (root5 / "userdata").rglob("*") if f.is_file() and f != sfile and f.stat().st_size < 5_000_000]
check(not any(MS_REFRESH.encode() in f.read_bytes() or MC_TOKEN.encode() in f.read_bytes() for f in others), "no other file of the launcher contains a token")

# ------------------------------------------------------------------ S5b reopen: session is remembered; then sign out
print("S5b reopen the launcher: still signed in, Play renews the session; then sign out")
AUTH_LOG.clear()
GAME_HITS.clear()
(root5 / "java-argv.txt").unlink()
root5, mc5, game5, r5b = run("s5b", ["dump:reabierto", "shot:01-recordado", "play", "wait-exit", "dump:jugado", "logout", "dump:salio", "shot:02-sin-sesion", "play", "dump:sin-sesion"], root=root5)
c5 = {x["label"]: x for x in r5b["steps"]}
check(not r5b["errors"] and c5.get("reabierto", {}).get("accountName") == "Guishe_7" and "abrir Minecraft como Guishe_7" in c5["reabierto"]["status"], "account remembered without signing in again")
check(paths("/auth/")[:2] == ["/auth/token", "/auth/xbox"] and "/auth/devicecode" not in paths("/auth/") and AUTH["refresh_count"] == 1, "Play renewed the saved session silently (no code needed)")
check(after(argv(root5), "--accessToken") == MC_TOKEN, "game started again")
check(sorted(set(GAME_HITS)) == ["/game/java/all.json", "/game/manifest.json"], "second start downloads nothing again: %s" % sorted(set(GAME_HITS)))
o = c5.get("salio", {})
check(o.get("accountName") == "Sin sesión" and o.get("state", {}).get("signedIn") is False and not sfile.exists(), "sign out: account gone and session file deleted")
(root5 / "java-argv.txt").unlink()
n_auth = len(AUTH_LOG)
check("launcher oficial" in c5.get("sin-sesion", {}).get("status", "") and argv(root5) is None, "signed out again: Play does NOT start the game (hands off to the official launcher)")
root5, mc5, game5, r5c = run("s5c", ["dump:otra-vez"], root=root5)
check((r5c["steps"] or [{}])[0].get("accountName") == "Sin sesión", "after signing out, reopening stays signed out")

# ------------------------------------------------------------------ S6 Mojang has not approved the app yet
print("S6 Mojang has not approved the application yet (403)")
auth_reset(approved=False)
root6, mc6, game6, r6 = run("s6", ["login", "login-wait", "dump:pendiente", "shot:01-pendiente", "play", "dump:oficial", "shot:02-launcher-oficial"])
b6 = {x["label"]: x for x in r6["steps"]}
pe = b6.get("pendiente", {})
check(not r6["errors"] and pe.get("accountName") == "Tu cuenta" and pe.get("accountSub") == "Esperando a Mojang" and pe.get("noticeTitle") == "Falta la aprobación de Mojang", "window explains that Mojang's approval is pending")
of = b6.get("oficial", {})
check("Abriendo el launcher oficial" in of.get("status", "") and "todavía no ha aprobado" in of.get("noticeText", "") and "perfil «Ishe Client»" in of.get("noticeText", ""), "Play falls back to the official launcher and says why")
check(argv(root6) is None and "ishe-client" in json.loads((mc6 / "launcher_profiles.json").read_text())["profiles"], "game is NOT started without a Minecraft session; official profile is ready")
auth_reset(approved=True)
root6, mc6, game6, r6b = run("s6b", ["dump:antes", "play", "wait-exit", "dump:aprobado"], root=root6)
b6b = {x["label"]: x for x in r6b["steps"]}
check(b6b.get("antes", {}).get("accountSub") == "Esperando a Mojang" and "/auth/devicecode" not in paths("/auth/"), "pending session is remembered")
check(after(argv(root6), "--username") == "Guishe_7" and b6b.get("aprobado", {}).get("accountName") == "Guishe_7" and b6b["aprobado"]["accountSub"] == "Minecraft: Java Edition", "once Mojang approves, Play starts the game directly with no new sign-in")

# ------------------------------------------------------------------ S7 the account does not own the game
print("S7 the Microsoft account does not own Minecraft: Java Edition")
auth_reset(owned=False)
root7, mc7, game7, r7 = run("s7", ["login", "login-wait", "dump:sin-juego", "shot:01-sin-juego", "play", "dump:despues"])
b7 = {x["label"]: x for x in r7["steps"]}
ng = b7.get("sin-juego", {})
check(not r7["errors"] and ng.get("noticeTitle") == "Esta cuenta no tiene Minecraft" and ng.get("accountName") == "Sin sesión" and ng.get("state", {}).get("signedIn") is False, "sign-in is refused and explained; nobody is signed in")
check(not (root7 / "userdata" / "sesion.json").exists() and argv(root7) is None, "nothing is saved and the game is not started")

# ------------------------------------------------------------------ S8 declined, cancelled, and service down
print("S8 sign-in declined / cancelled / Microsoft unreachable")
auth_reset(device="decline")
root8, mc8, game8, r8 = run("s8", ["login", "login-wait", "dump:rechazado"])
x8 = (r8["steps"] or [{}])[0]
check(not r8["errors"] and x8.get("noticeTitle") == "Inicio de sesión cancelado" and x8.get("accountName") == "Sin sesión" and x8.get("loginHidden") is True, "declined at Microsoft: explained, not signed in")
auth_reset(device="wait")
root8, mc8, game8, r8b = run("s8b", ["login", "login-cancel", "dump:cancelado", "sleep:2500", "dump:despues"])
polls = len([p for p in paths("/auth/token")])
b8 = {x["label"]: x for x in r8b["steps"]}
check(not r8b["errors"] and b8.get("cancelado", {}).get("loginHidden") is True and b8.get("despues", {}).get("accountName") == "Sin sesión" and polls <= 1, "Cancel closes the dialog and stops asking Microsoft (polls after cancel: %d)" % polls)
auth_reset(device="down")
root8, mc8, game8, r8c = run("s8c", ["login-fail", "dump:caido"])
x8c = (r8c["steps"] or [{}])[0]
check(not r8c["errors"] and x8c.get("loginHidden") is True and x8c.get("statusClass", "").endswith("is-bad") and x8c.get("noticeTitle") == "Algo no salió como se esperaba", "Microsoft unreachable: dialog closes with an explanation")

# ------------------------------------------------------------------ S9 the game crashes
print("S9 the game closes with an error")
auth_reset()
root9, mc9, game9, r9 = run("s9", ["login", "login-wait", "play", "wait-exit", "dump:error", "shot:01-juego-con-error"], java_exit="1")
x9 = (r9["steps"] or [{}])[0]
check(not r9["errors"] and "se cerró con un error (código 1)" in x9.get("status", "") and any("fake crash" in i for i in x9.get("noticeItems", [])), "window shows the exit code and the game's last lines")
check(any("session line: ***" in i for i in x9.get("noticeItems", [])) and not secrets_in(r9), "the session is masked in those lines")
check(x9.get("playLabel") == "JUGAR" and x9.get("playDisabled") is False, "Play is usable again")

# ------------------------------------------------------------------ S10 no official launcher installed at all
print("S10 signed in on a computer without the official launcher")
auth_reset()
root10, mc10, game10, r10 = run("s10", ["dump:inicio", "login", "login-wait", "play", "wait-exit", "dump:jugado"], with_minecraft=False)
b10 = {x["label"]: x for x in r10["steps"]}
check(not r10["errors"] and after(argv(root10), "--username") == "Guishe_7" and (mc10 / "versions" / "26.2" / "26.2.jar").is_file(), "the game is downloaded and started without needing the official launcher")
check("Minecraft se cerró" in b10.get("jugado", {}).get("status", "") and b10["jugado"]["noticeHidden"] is True and not (mc10 / "launcher_profiles.json").exists(), "no warnings about the missing official launcher")

# ------------------------------------------------------------------ S11 official launcher open while signed in
print("S11 signed in while the official launcher is open")
auth_reset()
root11, mc11, game11, r11 = run("s11", ["login", "login-wait", "play", "wait-exit", "dump:jugado"], scenario="launcher-open")
x11 = (r11["steps"] or [{}])[0]
check(not r11["errors"] and after(argv(root11), "--username") == "Guishe_7" and (mc11 / "launcher_profiles.json").read_text() == before, "game starts anyway and the official launcher's file is left untouched")
check(x11.get("noticeHidden") is True, "no request to close the official launcher")

# ------------------------------------------------------------------ S12 saved session no longer valid
print("S12 the saved session expired")
auth_reset()
root12, mc12, game12, r12 = run("s12", ["login", "login-wait"])
auth_reset(refresh_ok=False)
root12, mc12, game12, r12b = run("s12b", ["play", "dump:caducada", "shot:01-caducada"], root=root12)
x12 = (r12b["steps"] or [{}])[0]
check(not r12b["errors"] and x12.get("noticeTitle") == "Tu sesión caducó" and x12.get("accountName") == "Sin sesión" and argv(root12) is None and not (root12 / "userdata" / "sesion.json").exists(), "expired session: explained, signed out, game not started")

# ------------------------------------------------------------------ S13 a game file arrives corrupted
print("S13 a game library download is corrupted")
auth_reset()
FABRIC_FOR_GAME = build_game(BASE, tamper="/game/libs/com/google/code/gson/gson/2.14.0/gson-2.14.0.jar")
root13, mc13, game13, r13 = run("s13", ["login", "login-wait", "play", "dump:danado", "shot:01-descarga-danada"])
x13 = (r13["steps"] or [{}])[0]
check(not r13["errors"] and x13.get("noticeTitle") == "El arranque se detuvo" and "gson-2.14.0.jar" in x13.get("noticeText", "") and argv(root13) is None, "corrupted download: start is stopped and the file is named")
check(not (mc13 / "libraries" / "com" / "google" / "code" / "gson" / "gson" / "2.14.0" / "gson-2.14.0.jar").exists() and x13.get("playDisabled") is False, "the bad file is not kept; Play can be retried")
FABRIC_FOR_GAME = build_game(BASE)


# ================================================================== look, player face, updates and the creator's tools
def steps_of(result):
    return {x["label"]: x for x in result["steps"]}


def state_file(root):
    f = root / "userdata" / "actualizaciones" / "estado.json"
    return json.loads(f.read_text()) if f.exists() else {}


def logo_image(src):
    return Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])))


# ------------------------------------------------------------------ S14 colours and logo from Settings
print("S14 change colours and logo in Settings")
big_logo = pathlib.Path(tempfile.mkdtemp(prefix="ishe-logo-")) / "mi-logo.png"
Image.new("RGB", (600, 300), (255, 40, 90)).save(big_logo)
not_image = big_logo.parent / "no-es-imagen.png"
not_image.write_text("hola, no soy una imagen")
root14, mc14, game14, r14 = run("s14", ["view:ajustes", "dump:antes", "theme:color1=#ff3366", "theme:color2=#ffaa00", "theme:fondo=#101a14", "dump:colores",
                                         "shot:01-colores", "theme:fondo=#ffffff", "dump:claro", "theme-logo", "dump:logo", "shot:02-logo",
                                         "view:inicio", "shot:03-inicio-personalizado"], extra={"ISHE_TEST_LOGO_FILE": str(big_logo)})
t = steps_of(r14)
check(not r14["errors"], "no errors in the window or console: %s" % (r14["errors"] or "none"))
check(t.get("antes", {}).get("cssColor1") == "#5ee7ff" and t["antes"]["cssBg"] == "#0d0f16" and t["antes"]["logoSrc"] == "../assets/logo.png" and t["antes"]["themeResetDisabled"] is True, "starts with the original colours and logo")
c = t.get("colores", {})
check(c.get("cssColor1") == "#ff3366" and c.get("cssColor2") == "#ffaa00" and c.get("cssBg") == "#101a14" and c.get("bodyBackground") == "rgb(16, 26, 20)" and c.get("cssPanel") not in ("", "#141722"), "new colours are applied to the window at once (accents, background and panels)")
check(c.get("themeHint") == "Guardado." and c.get("themeResetDisabled") is False and c.get("state", {}).get("theme", {}).get("color1") == "#ff3366", "and saved")
cl = t.get("claro", {})
check("demasiado claro" in cl.get("themeHint", "") and cl.get("cssBg") == "#101a14" and cl.get("state", {}).get("theme", {}).get("fondo") == "#101a14", "a light background (unreadable text) is refused and the previous one stays")
lg = t.get("logo", {})
check(lg.get("logoSrc", "").startswith("data:image/png;base64,") and lg.get("logoSize") == [256, 128] and logo_image(lg["logoSrc"]).size == (256, 128), "logo replaced with the chosen picture, reduced to 256 px")
check(logo_image(lg["logoSrc"]).convert("RGB").getpixel((100, 60)) == (255, 40, 90), "the reduced logo is the same picture")
cfg14 = json.loads((root14 / "userdata" / "config.json").read_text())
check(cfg14.get("tema", {}).get("color2") == "#ffaa00" and cfg14["tema"]["logo"].startswith("data:image/png") and cfg14.get("ramGb") == 0, "saved in this computer's settings, next to the other settings")
root14, mc14, game14, r14b = run("s14b", ["dump:reabierto", "view:ajustes", "ram:6", "dump:ram", "theme-logo", "dump:mala", "theme-logo-clear", "dump:sin-logo", "theme-reset", "dump:original"],
                                 root=root14, extra={"ISHE_TEST_LOGO_FILE": str(not_image)})
u = steps_of(r14b)
check(not r14b["errors"] and u.get("reabierto", {}).get("cssColor1") == "#ff3366" and u["reabierto"]["cssBg"] == "#101a14" and u["reabierto"]["logoSize"] == [256, 128], "after reopening, colours and logo are still there")
check(u.get("ram", {}).get("state", {}).get("ramGb") == 6 and u["ram"]["state"]["theme"]["color1"] == "#ff3366", "changing another setting does not lose the look")
check("No pude leer esa imagen" in u.get("mala", {}).get("themeHint", "") and u["mala"]["logoSize"] == [256, 128], "a file that is not a picture is refused and the logo stays")
check(u.get("sin-logo", {}).get("logoSrc") == "../assets/logo.png" and u["sin-logo"]["cssColor1"] == "#ff3366", "'remove my logo' brings back the original logo only")
o = u.get("original", {})
check(o.get("cssColor1") == "#5ee7ff" and o.get("cssColor2") == "#8b5cf6" and o.get("cssBg") == "#0d0f16" and o.get("cssPanel") == "#141722" and o.get("themeResetDisabled") is True and json.loads((root14 / "userdata" / "config.json").read_text())["tema"] == {}, "'back to the original' restores everything")

# ------------------------------------------------------------------ S15 the player's face and name
print("S15 player's face and name after signing in")
auth_reset()
root15, mc15, game15, r15 = run("s15", ["dump:antes", "login", "login-wait", "sleep:1200", "dump:cara", "shot:01-cara"])
f = steps_of(r15)
check(not r15["errors"] and f.get("antes", {}).get("faceHidden") is True and f["antes"]["avatarHidden"] is False, "signed out: no face")
check(f.get("cara", {}).get("accountName") == "Guishe_7" and f["cara"]["faceHidden"] is False and f["cara"]["avatarHidden"] is True, "signed in: the face replaces the initial, next to the name")
check(f["cara"]["nameLinkHidden"] is True and f["cara"]["provisionalHidden"] is True and f["cara"]["state"]["playerNameProvisional"] is False, "with the real profile from Mojang there is no typed name")
check(f.get("cara", {}).get("face") == FACE_EXPECTED, "the face is cut from the player's skin, with its second layer on top: %s" % f.get("cara", {}).get("face"))
check(TEX_HITS == ["/auth/texture/" + SKIN_HASH] and (root15 / "userdata" / ("skin-" + "abcdef0123456789abcdef0123456789" + ".png")).read_bytes() == SKIN_PNG, "skin downloaded once from the textures server and kept for next time")
check(not secrets_in(r15), "still no token reaches the window")
TEX_HITS.clear()
AUTH_LOG.clear()
root15, mc15, game15, r15b = run("s15b", ["sleep:600", "dump:reabierto", "logout", "dump:salio"], root=root15)
g = steps_of(r15b)
check(g.get("reabierto", {}).get("face") == FACE_EXPECTED and g["reabierto"]["accountName"] == "Guishe_7" and not TEX_HITS and not AUTH_LOG, "after reopening, name and face appear at once without contacting any server")
check(g.get("salio", {}).get("faceHidden") is True and g["salio"]["state"]["playerSkin"] == "" and not list((root15 / "userdata").glob("skin-*.png")), "signing out removes the face and the saved skin")
auth_reset(skin=False)
root15c, mc15c, game15c, r15c = run("s15c", ["login", "login-wait", "sleep:800", "dump:sin-skin"])
x15 = (r15c["steps"] or [{}])[0]
check(not r15c["errors"] and x15.get("faceHidden") is True and x15.get("avatarHidden") is False and x15.get("accountName") == "Guishe_7", "account without a custom skin: the initial is shown")

# ------------------------------------------------------------------ S19 typed player name while Mojang has not approved
print("S19 while Mojang's approval is pending: type your player name to see your character")
auth_reset(approved=False)
LOOKUP_HITS.clear()
root19, mc19, game19, r19 = run("s19", ["login", "login-wait", "dump:pendiente", "name-link", "dump:enlace", "name:NoExiste", "dump:no-existe", "name:mal nombre!", "dump:invalido",
                                         "name:otrojugador", "dump:con-nombre", "view:inicio", "shot:01-personaje-provisional", "play", "dump:jugar"])
n19 = steps_of(r19)
check(not r19["errors"], "no errors in the window or console: %s" % (r19["errors"] or "none"))
check(n19.get("pendiente", {}).get("accountName") == "Tu cuenta" and n19["pendiente"]["nameLinkHidden"] is False and n19["pendiente"]["faceHidden"] is True, "pending: the account box offers 'show my character'")
check(n19.get("enlace", {}).get("activeView") == "view-ajustes" and n19["enlace"]["focused"] == "provisional-name" and n19["enlace"]["provisionalHidden"] is False, "the link goes straight to the name field in Settings")
check("No existe ningún jugador" in n19.get("no-existe", {}).get("provisionalHint", "") and n19["no-existe"]["accountName"] == "Tu cuenta", "a name that does not exist is explained and nothing changes")
check("letras, números" in n19.get("invalido", {}).get("provisionalHint", "") and LOOKUP_HITS == ["/auth/lookup/NoExiste", "/auth/lookup/otrojugador"], "an oddly written name is refused without asking any server")
cn = n19.get("con-nombre", {})
check(cn.get("accountName") == "OtroJugador" and cn.get("accountSub") == "Esperando a Mojang" and cn.get("face") == FACE_EXPECTED and cn.get("faceHidden") is False, "name (with its real capitals) and face appear; it still says approval is pending")
check(cn.get("state", {}).get("playerNameProvisional") is True and "escribiste tú" in cn.get("accountTitle", "") and cn.get("nameLinkHidden") is True and cn.get("provisionalClearHidden") is False, "it is marked as a typed, unconfirmed name")
check("Abriendo el launcher oficial" in n19.get("jugar", {}).get("status", "") and argv(root19) is None, "the typed name does NOT start the game: Play still hands off to the official launcher")
check(not secrets_in(r19), "no token reaches the window")
LOOKUP_HITS.clear()
TEX_HITS.clear()
root19, mc19, game19, r19b = run("s19b", ["sleep:500", "dump:reabierto", "view:ajustes", "name-clear", "dump:quitado", "name:Guishe_7", "dump:otra-vez"], root=root19)
m19 = steps_of(r19b)
check(not r19b["errors"] and m19.get("reabierto", {}).get("accountName") == "OtroJugador" and m19["reabierto"]["face"] == FACE_EXPECTED and "Hola, OtroJugador" in m19["reabierto"]["status"], "after reopening, the typed name and face are still shown")
check(m19.get("quitado", {}).get("accountName") == "Tu cuenta" and m19["quitado"]["faceHidden"] is True and not (root19 / "userdata" / ("skin-%s.png" % OTHER_UUID)).exists(), "'remove' takes the name and face away")
check(m19.get("otra-vez", {}).get("accountName") == "Guishe_7", "and another name can be typed")
auth_reset(approved=True)
PLAYERS_BACKUP = dict(PLAYERS)
root19, mc19, game19, r19c = run("s19c", ["view:ajustes", "name:otrojugador", "dump:otro", "view:inicio", "play", "wait-exit", "sleep:800", "dump:aprobado"], root=root19)
a19 = steps_of(r19c)
ap = a19.get("aprobado", {})
check(not r19c["errors"] and a19.get("otro", {}).get("accountName") == "OtroJugador" and after(argv(root19), "--username") == "Guishe_7" and after(argv(root19), "--uuid") == REAL_UUID, "once Mojang approves, the game starts with the account's REAL player, never the typed name")
check(ap.get("accountName") == "Guishe_7" and ap.get("state", {}).get("playerNameProvisional") is False and ap.get("provisionalHidden") is True and ap.get("face") == FACE_EXPECTED, "and the window now shows the real name and face")
check(json.loads((root19 / "userdata" / "config.json").read_text()).get("provisional") is None and not (root19 / "userdata" / ("skin-%s.png" % OTHER_UUID)).exists(), "the typed name is forgotten")

if KEY_FILE is None:
    print("(update and creator scenarios skipped: no creator key given)")
else:
    NEXT = ".".join(APP_VERSION.split(".")[:2] + [str(int(APP_VERSION.split(".")[2]) + 1)])
    NEXT2 = ".".join(APP_VERSION.split(".")[:2] + [str(int(APP_VERSION.split(".")[2]) + 2)])
    NEXT3 = ".".join(APP_VERSION.split(".")[:2] + [str(int(APP_VERSION.split(".")[2]) + 3)])
    NEXT4 = ".".join(APP_VERSION.split(".")[:2] + [str(int(APP_VERSION.split(".")[2]) + 4)])
    NEXT5 = ".".join(APP_VERSION.split(".")[:2] + [str(int(APP_VERSION.split(".")[2]) + 5)])
    NEXT6 = ".".join(APP_VERSION.split(".")[:2] + [str(int(APP_VERSION.split(".")[2]) + 6)])
    UPD = {"ISHE_TEST_UPDATE_BASE": BASE + "/update"}
    KEY_TEXT = KEY_FILE.read_text()
    KEY_BODY = "".join(l for l in KEY_TEXT.splitlines() if "-----" not in l)

    # -------------------------------------------------------------- S16 the creator makes a new version by himself
    print("S16 the creator sets his look and creates version %s" % NEXT)
    wrong_key = big_logo.parent / "otra.pem"
    subprocess.run(["node", "-e", "const c=require('crypto');process.stdout.write(c.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))"],
                   stdout=open(wrong_key, "w"), check=True)
    outdir = pathlib.Path(tempfile.mkdtemp(prefix="ishe-creator-"))
    rootC, mcC, gameC, rW = run("s16-otra-clave", ["view:ajustes", "dump:sin-clave", "creator-key", "dump:otra"], extra={"ISHE_TEST_KEY_FILE": str(wrong_key), "ISHE_TEST_CREATOR_OUT": str(outdir)})
    w = steps_of(rW)
    check(not rW["errors"] and w.get("sin-clave", {}).get("creatorBuildDisabled") is True and "Falta cargar la clave" in w["sin-clave"]["creatorKeyStatus"], "without the key nobody can create an update")
    check("no es la clave" in w.get("otra", {}).get("creatorResult", "") and w["otra"]["creatorBuildDisabled"] is True and not (rootC / "userdata" / "clave-creador.bin").exists(), "somebody else's key is refused")
    rootC, mcC, gameC, r16 = run("s16", ["view:ajustes", "theme:color1=#ff3366", "theme:color2=#ffaa00", "theme-logo", "creator-key", "dump:clave",
                                          "creator-fill:%s|" % APP_VERSION, "creator-build", "dump:repetida",
                                          "creator-fill:%s|Colores nuevos y mi logo." % NEXT, "creator-build", "dump:creada", "shot:01-actualizacion-creada"],
                                 root=rootC, extra={"ISHE_TEST_KEY_FILE": str(KEY_FILE), "ISHE_TEST_CREATOR_OUT": str(outdir), "ISHE_TEST_LOGO_FILE": str(big_logo)})
    k = steps_of(r16)
    check(not r16["errors"], "no errors in the window or console: %s" % (r16["errors"] or "none"))
    check("Clave cargada" in k.get("clave", {}).get("creatorKeyStatus", "") and k["clave"]["creatorBuildDisabled"] is False and k["clave"]["creatorVersion"] == NEXT, "with his key loaded the creator can build; next version number is suggested")
    keyfile = rootC / "userdata" / "clave-creador.bin"
    check(keyfile.is_file() and b"PRIVATE KEY" not in keyfile.read_bytes() and KEY_BODY.encode() not in keyfile.read_bytes() and (keyfile.stat().st_mode & 0o077) == 0, "the key is kept protected on his computer, not readable")
    check(KEY_BODY not in json.dumps(r16) and "PRIVATE KEY" not in json.dumps(r16), "the key never reaches the window")
    check("mayor que la actual" in k.get("repetida", {}).get("creatorResult", "") and k["repetida"]["creatorStepsHidden"] is True, "re-using the current version number is refused")
    folder = outdir / ("Ishe Client %s - actualizacion" % NEXT)
    made = sorted(f.name for f in folder.iterdir()) if folder.is_dir() else []
    cr = k.get("creada", {})
    check(made == sorted([E4STEAM, "LEEME - como publicar.txt", "ishe-client-actualizacion.json", "ishe-client-app-%s.bin" % NEXT]), "the update folder holds the notice, the package, e4steam and the instructions: %s" % made)
    check(str(folder) in cr.get("creatorResult", "") and cr.get("creatorStepsHidden") is False and cr.get("creatorTag") == "v" + NEXT and "ishe-client-app-%s.bin" % NEXT in cr.get("creatorFiles", ""), "the window shows where it is and the steps to publish it")
    check(folder.is_dir() and (folder / ("ishe-client-app-%s.bin" % NEXT)).stat().st_size < 500_000 and not any(b"PRIVATE KEY" in f.read_bytes() or KEY_BODY.encode() in f.read_bytes() for f in folder.iterdir()), "the package is small and no output file contains the key")

    # -------------------------------------------------------------- S17 a friend's launcher updates by itself
    print("S17 a friend's launcher finds %s, downloads only the client files, and uses it after restarting" % NEXT)
    UPDATE.clear()
    UPDATE.update({f.name: f.read_bytes() for f in folder.iterdir() if not f.name.startswith("LEEME")})
    UPDATE_HITS.clear()
    rootF, mcF, gameF, r17 = run("s17", ["update-wait:ready", "dump:lista", "shot:01-actualizacion-lista", "view:ajustes", "dump:ajustes", "restart"], extra=UPD)
    a = steps_of(r17)
    check(not r17["errors"], "no errors in the window or console: %s" % (r17["errors"] or "none"))
    check(a.get("lista", {}).get("footVersion") == "Ishe Client " + APP_VERSION and a["lista"]["updatePillHidden"] is False and a["lista"]["updatePill"] == "Versión %s lista · Reiniciar" % NEXT, "found and downloaded in the background; a button offers to restart")
    check("ya está descargada" in a.get("ajustes", {}).get("updateText", "") and "Colores nuevos y mi logo." in a["ajustes"]["updateText"], "Settings shows the new version and what changed")
    check(sorted(UPDATE_HITS) == ["ishe-client-actualizacion.json", "ishe-client-app-%s.bin" % NEXT], "downloaded only the notice and the small package (not e4steam, not the engine): %s" % sorted(UPDATE_HITS))
    st = state_file(rootF)
    check(st.get("version") == NEXT and st.get("confirmada") is False and (rootF / "userdata" / "actualizaciones" / NEXT / "main.js").is_file() and not (rootF / "userdata" / "actualizaciones" / NEXT / "inicio.js").exists(), "new version stored beside the installed one; the installed app itself is not modified")
    UPDATE_HITS.clear()
    rootF, mcF, gameF, r17b = run("s17b", ["update-wait:none", "dump:nueva", "shot:02-version-nueva", "play", "dump:jugar", "view:ajustes", "dump:ajustes"], root=rootF, extra=UPD)
    b = steps_of(r17b)
    n = b.get("nueva", {})
    check(not r17b["errors"] and n.get("footVersion") == "Ishe Client " + NEXT and n.get("state", {}).get("appVersion") == NEXT, "after restarting it runs the new version")
    check(n.get("cssColor1") == "#ff3366" and n.get("cssColor2") == "#ffaa00" and n.get("logoSize") == [256, 128] and n.get("state", {}).get("themeCustom") is False, "the friend gets the creator's colours and logo")
    check(n.get("newsTitles", [""])[0] == "Versión " + NEXT and n.get("newsTexts", [""])[0] == "Colores nuevos y mi logo.", "the creator's notes appear first in the news")
    check(n.get("updateStatus") == "none" and n.get("updatePillHidden") is True and UPDATE_HITS == ["ishe-client-actualizacion.json"], "it checks again, sees it is up to date, downloads nothing")
    st = state_file(rootF)
    check(st.get("version") == NEXT and st.get("confirmada") is True and st.get("malas") == [], "the new version is marked as working")
    check("Abriendo el launcher oficial" in b.get("jugar", {}).get("status", "") and mods(gameF) == EXPECTED_MODS, "Play works from the updated copy (e4steam taken from the installed one)")
    check(("Ishe Client " + NEXT) in b.get("ajustes", {}).get("versionLine", "") and "última versión" in b["ajustes"]["updateText"], "Settings shows the version in use")

    # -------------------------------------------------------------- S18 things that must NOT update the launcher
    print("S18 a tampered copy, a forged update and updates that do not start")
    main_js = rootF / "userdata" / "actualizaciones" / NEXT / "main.js"
    main_js.write_text(main_js.read_text() + "\n// alguien toco este archivo\n")
    UPDATE_HITS.clear()
    rootF, mcF, gameF, r18 = run("s18", ["dump:tocado", "update-wait:ready", "dump:rebajada"], root=rootF, extra=UPD)
    c18 = steps_of(r18)
    check(not r18["errors"] and c18.get("tocado", {}).get("footVersion") == "Ishe Client " + APP_VERSION, "a downloaded copy whose files were changed is not used: the installed version runs instead")
    check("ishe-client-app-%s.bin" % NEXT in UPDATE_HITS and state_file(rootF).get("version") == NEXT, "and the genuine update is downloaded again")
    # forged update signed by somebody else
    forged = pathlib.Path(tempfile.mkdtemp(prefix="ishe-forged-"))
    subprocess.run(["node", "-e", """
const path=require('path');const fs=require('fs');const app=process.argv[1];
const paquete=require(path.join(app,'core','paquete.js'));
const env=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const m=JSON.parse(Buffer.from(env.aviso,'base64'));
m.version=process.argv[4];m.paquete.archivo=paquete.bundleName(m.version);
fs.writeFileSync(process.argv[5],paquete.sign(m,fs.readFileSync(process.argv[3],'utf8')));
""", str(APP.resolve()), str(folder / "ishe-client-actualizacion.json"), str(wrong_key), "9.9.9", str(forged / "ishe-client-actualizacion.json")], check=True)
    UPDATE.clear()
    UPDATE["ishe-client-actualizacion.json"] = (forged / "ishe-client-actualizacion.json").read_bytes()
    rootG, mcG, gameG, r18b = run("s18b", ["update-wait:error", "view:ajustes", "dump:falsa", "shot:01-actualizacion-falsa"], extra=UPD)
    x18 = (r18b["steps"] or [{}])[0]
    check(not r18b["errors"] and "no está firmado por el creador" in x18.get("updateText", "") and x18.get("updatePillHidden") is True and not (rootG / "userdata" / "actualizaciones").exists(), "an update not signed with the creator's key is refused and nothing is installed")
    # a signed update whose code cannot even be loaded
    broken = pathlib.Path(tempfile.mkdtemp(prefix="ishe-broken-"))
    subprocess.run(["node", str(TOOLS / "make_update.js"), str(APP), str(KEY_FILE), NEXT2, str(broken), "throw"], check=True)
    UPDATE.clear()
    UPDATE.update({f.name: f.read_bytes() for f in broken.iterdir() if not f.name.startswith("LEEME")})
    # rootF currently has NEXT downloaded (unconfirmed after re-download): confirm it first, then receive the broken one
    rootF, mcF, gameF, r18c = run("s18c", ["dump:antes", "update-wait:ready", "dump:rota-lista"], root=rootF, extra=UPD)
    d = steps_of(r18c)
    st = state_file(rootF)
    check(not r18c["errors"] and d.get("antes", {}).get("footVersion") == "Ishe Client " + NEXT and st.get("version") == NEXT2 and st.get("anterior") == NEXT, "running %s, the launcher downloads %s and keeps %s as the fallback" % (NEXT, NEXT2, NEXT))
    rootF, mcF, gameF, r18d = run("s18d", ["dump:no-llega"], root=rootF, extra=UPD)
    st = state_file(rootF)
    check(r18d["steps"] == [] and NEXT2 in st.get("malas", []) and st.get("version") == NEXT and st.get("confirmada") is True, "the broken version fails to load: it is marked bad and the launcher closes to restart on %s" % NEXT)
    UPDATE_HITS.clear()
    rootF, mcF, gameF, r18e = run("s18e", ["update-wait:none", "dump:vuelta", "shot:02-vuelta-atras"], root=rootF, extra=UPD)
    x = (r18e["steps"] or [{}])[0]
    check(not r18e["errors"] and x.get("footVersion") == "Ishe Client " + NEXT and x.get("noticeTitle") == "Se volvió a la versión anterior" and NEXT2 in x.get("noticeText", ""), "next start: back on %s, with a notice naming the version that failed" % NEXT)
    check(UPDATE_HITS == ["ishe-client-actualizacion.json"] and x.get("updateStatus") == "none" and not (rootF / "userdata" / "actualizaciones" / NEXT2).exists(), "the bad version is not downloaded again and its files are removed")
    rootF, mcF, gameF, r18f = run("s18f", ["dump:sin-aviso"], root=rootF, extra=UPD)
    check((r18f["steps"] or [{}])[0].get("noticeTitle") != "Se volvió a la versión anterior", "the notice is shown once only")
    # a signed update that starts but never shows its window
    hang = pathlib.Path(tempfile.mkdtemp(prefix="ishe-hang-"))
    subprocess.run(["node", str(TOOLS / "make_update.js"), str(APP), str(KEY_FILE), NEXT3, str(hang), "exit"], check=True)
    UPDATE.clear()
    UPDATE.update({f.name: f.read_bytes() for f in hang.iterdir() if not f.name.startswith("LEEME")})
    rootF, mcF, gameF, _ = run("s18g", ["update-wait:ready"], root=rootF, extra=UPD)
    tries = []
    for i in range(2):
        rootF, mcF, gameF, rr = run("s18h%d" % i, ["dump:x"], root=rootF, extra=UPD)
        tries.append((len(rr["steps"]), state_file(rootF).get("intentos")))
    rootF, mcF, gameF, r18i = run("s18i", ["dump:tercera"], root=rootF, extra=UPD)
    st = state_file(rootF)
    x = (r18i["steps"] or [{}])[0]
    check(tries == [(0, 1), (0, 2)] and x.get("footVersion") == "Ishe Client " + NEXT and NEXT3 in st.get("malas", []) and NEXT3 in x.get("noticeText", ""), "a version that never gets to show its window is dropped after two tries, back to %s: %s" % (NEXT, tries))
    # signed updates that load but fail while preparing the window, or never show one
    for version, mode, label in ((NEXT4, "reject", "fails while preparing its window"), (NEXT5, "silent", "never shows a window")):
        bad = pathlib.Path(tempfile.mkdtemp(prefix="ishe-bad-"))
        subprocess.run(["node", str(TOOLS / "make_update.js"), str(APP), str(KEY_FILE), version, str(bad), mode], check=True)
        UPDATE.clear()
        UPDATE.update({f.name: f.read_bytes() for f in bad.iterdir() if not f.name.startswith("LEEME")})
        rootF, mcF, gameF, _ = run("s18-%s-a" % mode, ["update-wait:ready"], root=rootF, extra=UPD)
        rootF, mcF, gameF, rb = run("s18-%s-b" % mode, ["dump:x"], root=rootF, extra=dict(UPD, ISHE_TEST_WATCHDOG_MS="2500"))
        st = state_file(rootF)
        check(rb["steps"] == [] and version in st.get("malas", []) and st.get("version") == NEXT and st.get("fallo") == version, "a version that %s gives up on its own in the same start and goes back to %s" % (label, NEXT))
        rootF, mcF, gameF, rc = run("s18-%s-c" % mode, ["dump:x"], root=rootF, extra=UPD)
        xb = (rc["steps"] or [{}])[0]
        check(not rc["errors"] and xb.get("footVersion") == "Ishe Client " + NEXT and version in xb.get("noticeText", ""), "and the next start works on %s and says which version failed" % NEXT)
    # a good newer version still arrives afterwards
    good = pathlib.Path(tempfile.mkdtemp(prefix="ishe-good-"))
    subprocess.run(["node", str(TOOLS / "make_update.js"), str(APP), str(KEY_FILE), NEXT6, str(good), "ok"], check=True)
    UPDATE.clear()
    UPDATE.update({f.name: f.read_bytes() for f in good.iterdir() if not f.name.startswith("LEEME")})
    rootF, mcF, gameF, _ = run("s18j", ["update-wait:ready"], root=rootF, extra=UPD)
    rootF, mcF, gameF, r18k = run("s18k", ["update-wait:none", "dump:buena"], root=rootF, extra=UPD)
    x = (r18k["steps"] or [{}])[0]
    left = sorted(f.name for f in (rootF / "userdata" / "actualizaciones").iterdir())
    check(not r18k["errors"] and x.get("footVersion") == "Ishe Client " + NEXT6 and left == [NEXT6, "estado.json"], "a later good version installs normally and old copies are cleaned up: %s" % left)
    # emergency start flag: run the installed copy without touching the record
    p = subprocess.run(["xvfb-run", "-a", ELECTRON, "--no-sandbox", "--disable-gpu", str(APP), "--ishe-instalada"],
                       env=dict(os.environ, ISHE_TEST_OUT=str(OUT / "s18-flag"), ISHE_TEST_STEPS=json.dumps(["dump:x"]), ISHE_TEST_USER_DATA=str(rootF / "userdata"),
                                ISHE_TEST_MINECRAFT_DIR=str(mcF), ISHE_TEST_GAME_DIR=str(gameF)), capture_output=True, text=True, timeout=120)
    flagged = json.loads((OUT / "s18-flag" / "result.json").read_text())
    check((flagged["steps"] or [{}])[0].get("footVersion") == "Ishe Client " + APP_VERSION and state_file(rootF).get("version") == NEXT6, "the emergency start uses the installed copy and leaves the downloaded version in place")

print("\n%d/%d checks passed" % (checks - failures, checks))
sys.exit(1 if failures else 0)
