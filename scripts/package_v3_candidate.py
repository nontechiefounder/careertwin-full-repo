#!/usr/bin/env python3
"""Build and verify the WorkByLine V3 Release Candidate zip archive.

Guarantees:
1. Never includes `.git` directories or `.git` worktree pointer files referencing external host paths.
2. Explicitly includes `rollback/careertwin_core08_app_archive.tar.gz` required by rollback scripts.
3. Explicitly includes `logs/verification/*.log` and `evidence/*` (excluding stale `pytest_results.xml`
   and excluding runtime `logs/pids`, `logs/services`, `logs/temporal.db`).
4. Generates `MANIFEST_SHA256.txt` for all packaged files and prints exact archive size & SHA-256.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import zipfile


def get_short_commit(root: Path) -> str:
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(root),
            capture_output=True,
            text=True,
            check=True,
        )
        return res.stdout.strip()
    except Exception:
        return "launch_ready"


def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    short_commit = get_short_commit(root)
    pkg_name = f"WorkByLine_Candidate_Handoff_{short_commit}"
    staging_dir = root / "staging_package" / pkg_name
    zip_path = root / f"{pkg_name}.zip"

    print(f"Creating candidate package: {pkg_name}")
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)

    exclude_dirs = {
        ".git",
        "node_modules",
        ".venv",
        "__pycache__",
        ".pytest_cache",
        ".next",
        "out",
        "build",
        "dist",
        "staging_package",
        "private-context-storage",
        "pids",
        "services",
        "rehearsal_core08_app",
    }
    exclude_extensions = {".pyc", ".pyo", ".tmp", ".zip", ".swp", ".db", ".db-shm", ".db-wal"}
    exclude_files = {".DS_Store", ".env", ".env.local", ".git", "pytest_results.xml", "temporal.db"}

    copied_files: list[tuple[Path, Path]] = []

    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)

        # Prune excluded directories (preserve .agents customization root and logs/verification)
        pruned_dirs = []
        for d in dirnames:
            if d in exclude_dirs:
                continue
            if d.startswith(".") and d != ".agents":
                continue
            if rel_dir == Path("logs") and d != "verification":
                continue
            pruned_dirs.append(d)
        dirnames[:] = pruned_dirs

        if "staging_package" in rel_dir.parts:
            continue

        for fname in filenames:
            if fname in exclude_files:
                continue
            if fname.startswith(".env") and fname != ".env.example":
                continue
            if any(fname.endswith(ext) for ext in exclude_extensions):
                # Explicitly allow sanitized acceptance trace zip in evidence/
                src_file_probe = Path(dirpath) / fname
                rel_probe = src_file_probe.relative_to(root)
                if fname == "trace.zip" and str(rel_probe).startswith("evidence/browser_acceptance"):
                    pass
                else:
                    continue

            src_file = Path(dirpath) / fname
            rel_path = src_file.relative_to(root)

            # Allow .tar.gz ONLY for the paired rollback archive
            if fname.endswith(".tar.gz") and str(rel_path) != "rollback/careertwin_core08_app_archive.tar.gz":
                continue

            # Allow .log files ONLY under evidence/ or logs/verification/
            if fname.endswith(".log") and not (
                rel_path.parts[0] == "evidence"
                or ( len(rel_path.parts) >= 2 and rel_path.parts[0] == "logs" and rel_path.parts[1] == "verification" )
            ):
                continue

            dst_file = staging_dir / rel_path
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_file, dst_file)
            copied_files.append((rel_path, dst_file))

    # Generate checksum manifest
    manifest_lines = []
    for rel_path, dst_file in sorted(copied_files, key=lambda x: str(x[0])):
        sha = compute_sha256(dst_file)
        manifest_lines.append(f"{sha}  {rel_path}\n")

    manifest_file = staging_dir / "MANIFEST_SHA256.txt"
    manifest_file.write_text("".join(manifest_lines), encoding="utf-8")

    manifest_sha = compute_sha256(manifest_file)
    print(f"Manifest created with {len(manifest_lines)} files. Manifest SHA256: {manifest_sha}")

    if zip_path.exists():
        zip_path.unlink()

    print(f"Archiving to {zip_path.name}...")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for dirpath, _, filenames in os.walk(staging_dir):
            for fname in sorted(filenames):
                file_full = Path(dirpath) / fname
                arcname = file_full.relative_to(staging_dir.parent)
                zipf.write(file_full, arcname)

    shutil.rmtree(root / "staging_package")

    # Verify archive contents
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        assert not any(n.endswith("/.git") or "/.git/" in n for n in names), "Found .git entry in package!"
        assert f"{pkg_name}/rollback/careertwin_core08_app_archive.tar.gz" in names, "Missing rollback archive in package!"
        assert not any(n.endswith("pytest_results.xml") for n in names), "Found stale pytest_results.xml in package!"
        assert f"{pkg_name}/evidence/browser_acceptance/trace.zip" in names, "Missing sanitized trace.zip in package!"

    zip_sha = compute_sha256(zip_path)
    zip_size = zip_path.stat().st_size
    print("Package created and verified successfully:")
    print(f"  Archive: {zip_path}")
    print(f"  Size: {zip_size:,} bytes")
    print(f"  SHA256: {zip_sha}")


if __name__ == "__main__":
    main()
