#!/usr/bin/env python3
"""Sanitize Playwright trace archives and verification logs.

Replaces raw JWTs, tokens, and cookies with sanitized placeholders
to comply with Audit Finding I: Evidence sanitization.
"""
from __future__ import annotations

import io
import re
import sys
import zipfile
from pathlib import Path

JWT_REGEX = re.compile(r'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}')
COOKIE_REGEX = re.compile(r'sb-[a-zA-Z0-9_-]+-auth-token(=|%3D)[^;&\s"]+')
BEARER_REGEX = re.compile(r'(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}')


def sanitize_text(content: str) -> str:
    content = JWT_REGEX.sub('[SANITIZED_JWT_TOKEN]', content)
    content = COOKIE_REGEX.sub('sb-auth-token=[SANITIZED_COOKIE]', content)
    content = BEARER_REGEX.sub('Bearer [SANITIZED_BEARER_TOKEN]', content)
    return content


def sanitize_trace_zip(zip_path: Path) -> int:
    if not zip_path.exists():
        print(f"File not found: {zip_path}")
        return 0

    print(f"Sanitizing trace zip: {zip_path}")
    temp_buffer = io.BytesIO()
    total_redactions = 0

    with zipfile.ZipFile(zip_path, 'r') as zin:
        with zipfile.ZipFile(temp_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                # Attempt decoding text files
                if any(item.filename.endswith(ext) for ext in ('.json', '.trace', '.network', '.txt', '.log')):
                    try:
                        text = data.decode('utf-8', errors='replace')
                        initial_len = len(text)
                        sanitized = sanitize_text(text)
                        if sanitized != text:
                            # Count occurrences replaced
                            matches = len(JWT_REGEX.findall(text)) + len(COOKIE_REGEX.findall(text)) + len(BEARER_REGEX.findall(text))
                            total_redactions += matches
                            data = sanitized.encode('utf-8')
                    except Exception as e:
                        print(f"Warning sanitizing {item.filename}: {e}")
                zout.writestr(item, data)

    # Overwrite the original zip with the sanitized buffer
    zip_path.write_bytes(temp_buffer.getvalue())
    print(f"Sanitization complete: Redacted {total_redactions} sensitive tokens in {zip_path.name}")
    return total_redactions


def sanitize_text_file(filepath: Path) -> int:
    if not filepath.exists():
        return 0
    try:
        content = filepath.read_text(encoding='utf-8', errors='replace')
        sanitized = sanitize_text(content)
        if sanitized != content:
            matches = len(JWT_REGEX.findall(content)) + len(COOKIE_REGEX.findall(content))
            filepath.write_text(sanitized, encoding='utf-8')
            print(f"Redacted {matches} sensitive tokens in {filepath.name}")
            return matches
    except Exception as e:
        print(f"Warning reading {filepath}: {e}")
    return 0


def main():
    root = Path(__file__).resolve().parent.parent
    evidence_dir = root / 'evidence'
    
    total = 0
    # Sanitize trace.zip
    trace_zip = evidence_dir / 'browser_acceptance' / 'trace.zip'
    if trace_zip.exists():
        total += sanitize_trace_zip(trace_zip)

    # Sanitize json, log, and report files in evidence
    for f in evidence_dir.rglob('*'):
        if f.is_file() and f.suffix in ('.json', '.log', '.txt', '.xml') and f != trace_zip:
            total += sanitize_text_file(f)

    # Sanitize logs/verification
    logs_dir = root / 'logs' / 'verification'
    if logs_dir.exists():
        for f in logs_dir.rglob('*.log'):
            total += sanitize_text_file(f)

    print(f"\nTotal sensitive tokens sanitized across evidence and logs: {total}")

    # Verify zero remaining JWTs in trace.zip
    if trace_zip.exists():
        with zipfile.ZipFile(trace_zip, 'r') as z:
            for name in z.namelist():
                if name.endswith(('.json', '.trace', '.network')):
                    raw = z.read(name).decode('utf-8', errors='ignore')
                    rem = JWT_REGEX.findall(raw)
                    if rem:
                        print(f"ERROR: {name} still contains {len(rem)} JWTs!")
                        sys.exit(1)
        print("VERIFIED: Zero raw JWT tokens remaining in trace.zip.")


if __name__ == '__main__':
    main()

