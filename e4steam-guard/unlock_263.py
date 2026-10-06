"""Lift the 'Minecraft < 26.3' cap in an already-patched e4steam 0.3.2 jar (metadata only)."""
import sys, zipfile, copy

src, dst = sys.argv[1], sys.argv[2]
EDITS = {
    "fabric.mod.json": (b'"minecraft": ">=26.1- <26.3-"', b'"minecraft": ">=26.1- <26.4-"'),
    "META-INF/neoforge.mods.toml": (b'versionRange = "[1.20.2,26.3)"', b'versionRange = "[1.20.2,26.4)"'),
    "META-INF/mods.toml": (b'versionRange = "[1.20.2,26.3)"', b'versionRange = "[1.20.2,26.4)"'),
}
NOTICE = "META-INF/E4STEAM-UNOFFICIAL-PATCH.txt"
EXTRA = b"""

EXPERIMENTAL Minecraft 26.3 variant
-----------------------------------
Additionally, in THIS file the declared Minecraft range was widened so the
loader accepts Minecraft 26.3 (official 0.3.2 declares 26.3 unsupported):
    fabric.mod.json / META-INF/*.toml: upper bound 26.3 -> 26.4
No code was changed for 26.3 and this combination has NOT been run in the
game. e4steam's author has not released 26.3 support. Expect that it may
fail to start or to connect; if it does, use Minecraft 26.2 instead.
"""
done = []
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
    zout.comment = zin.comment
    for info in zin.infolist():
        data = zin.read(info.filename)
        if info.filename in EDITS:
            old, new = EDITS[info.filename]
            if data.count(old) != 1:
                raise SystemExit(f"{info.filename}: expected exactly one {old!r}, found {data.count(old)}")
            data = data.replace(old, new)
            done.append(info.filename)
        elif info.filename == NOTICE:
            data = data.rstrip(b"\n") + EXTRA
            done.append(info.filename)
        out = copy.copy(info)
        zout.writestr(out, data, compress_type=info.compress_type)
if NOTICE not in done or len(done) < 2:
    raise SystemExit(f"unexpected edit set: {done}")
print(f"{dst.split('/')[-1]}: edited {done}")
