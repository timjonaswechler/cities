"""Verify the recovered TypeScript baseline, not the lost historical archive."""
from hashlib import sha256
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
archive = root / "backlog/typescript-2026-10-14"
manifest = json.loads(archive.with_suffix(".manifest.json").read_text())
checked = 0
for entry in manifest["files"]:
    if entry["path"].startswith("node_modules/"):
        continue
    path = archive / entry["path"]
    if "symlink" in entry:
        assert path.is_symlink() and str(path.readlink()) == entry["symlink"], path
    else:
        assert path.is_file(), f"Missing: {path}"
        assert sha256(path.read_bytes()).hexdigest() == entry["sha256"], f"Changed: {path}"
    checked += 1
print(f"Verified {checked} recovered archive files and symlinks.")
