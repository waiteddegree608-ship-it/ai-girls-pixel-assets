"""Validate catalogued WebP sprites and build reproducible ZIPs. Python 3.9+."""

import hashlib
import json
from pathlib import Path
import re
import struct
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def webp_size(data):
    """Read the native canvas size from a RIFF WebP image header."""
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP" or int.from_bytes(data[4:8], "little") + 8 != len(data):
        raise ValueError("Invalid WebP container")
    chunk, header = data[12:16], data[20:30]
    if chunk == b"VP8X" and len(header) == 10:
        return tuple(int.from_bytes(header[i:i+3], "little") + 1 for i in (4, 7))
    if chunk == b"VP8L" and header[:1] == b"\x2f":
        bits = int.from_bytes(header[1:5], "little")
        return (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1
    if chunk == b"VP8 " and header[3:6] == b"\x9d\x01\x2a":
        width, height = struct.unpack("<HH", header[6:10])
        return width & 0x3fff, height & 0x3fff
    raise ValueError("Unsupported WebP size header")


def load_art(catalog):
    art = {}
    ids = set()
    for character in catalog["characters"]:
        owner = character["id"]
        if not SLUG.fullmatch(owner) or owner in ids or not character["assets"]:
            raise ValueError(f"Invalid or duplicate character: {owner}")
        ids.add(owner)
        for sprite in character["assets"]:
            name, path = sprite["id"], sprite["path"]
            if not SLUG.fullmatch(name) or path != f"characters/{owner}/{name}.webp" or path in art:
                raise ValueError(f"Invalid or duplicate sprite path: {path}")
            data = (ROOT / path).read_bytes()
            if hashlib.sha256(data).hexdigest() != sprite["sha256"]:
                raise ValueError(f"Checksum mismatch: {path}")
            layout = sprite["layout"]
            columns, rows, w, h = (layout[k] for k in ("columns", "rows", "frameWidth", "frameHeight"))
            if not all(type(n) is int and n > 0 for n in (columns, rows, w, h)):
                raise ValueError(f"Invalid frame geometry: {path}")
            size = (sprite["width"], sprite["height"])
            if size != (w * columns, h * rows) or size != webp_size(data):
                raise ValueError(f"Grid does not match native WebP size: {path}")
            for sequence in sprite.get("sequences", []):
                start, count = sequence["start"], sequence["count"]
                if start < 0 or count < 1 or start + count > columns * rows:
                    raise ValueError(f"Sequence outside its grid: {path}")
            art[path] = data
    files = set()
    for path in (ROOT / "characters").rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Unexpected symlink: {path}")
        if path.is_file():
            files.add(path.relative_to(ROOT).as_posix())
    if set(art) != files:
        raise ValueError(f"Files differ from catalog: {sorted(set(art) ^ files)}")
    return art


def write_pack(path, files):
    names = sorted(files)
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as temp:
        staged = Path(temp.name)
    try:
        with zipfile.ZipFile(staged, "w") as archive:
            for name in names:
                # Store already-compressed WebPs and use stable metadata across hosts.
                entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, files[name])
        with zipfile.ZipFile(staged) as archive:
            if archive.namelist() != names or any(archive.read(n) != files[n] for n in names):
                raise ValueError(f"Archive verification failed: {path.name}")
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)
    print(f"{path.name}: {len(files)-2} images, {path.stat().st_size:,} bytes")


def main():
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    art = load_art(catalog)
    credits = (ROOT / "CREDITS.md").read_text(encoding="utf-8").encode("utf-8")
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)

    def pack(name, characters):
        subset = dict(catalog, characters=characters)
        encoded = (json.dumps(subset, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        files = {"catalog.json": encoded, "CREDITS.md": credits}
        for character in characters:
            for sprite in character["assets"]:
                path = sprite["path"]
                files[path] = art[path]
        write_pack(output / (name + ".zip"), files)

    pack("ai-girls-pixel-assets", catalog["characters"])
    for character in catalog["characters"]:
        pack(character["id"], [character])


if __name__ == "__main__":
    main()
