#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"
NATIVE_ID = 10001
LEGACY_ID = 59
LABEL = "Ali SDK / DashScope Native"
NATIVE_ENDPOINT = "dashscope_native"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src" / "features" / "channels").exists():
        return PROJECT_ROOT
    raise SystemExit(f"DashScope Native frontend patch failed: missing frontend root {candidate}")


def patch_constants(root: Path) -> None:
    path = root / "src" / "features" / "channels" / "constants.ts"
    text = path.read_text(encoding="utf-8")
    text = text.replace(f"  {LEGACY_ID}: '{LABEL}',\n", f"  {NATIVE_ID}: '{LABEL}',\n")
    if f"  {NATIVE_ID}: '{LABEL}'," not in text:
        text, count = re.subn(
            r"(\n} as const)",
            f"\n  {NATIVE_ID}: '{LABEL}',\\1",
            text,
            count=1,
        )
        if count != 1:
            raise SystemExit("DashScope Native frontend patch failed: CHANNEL_TYPES anchor not found")

    order_pattern = r"(const CHANNEL_TYPE_DISPLAY_ORDER: number\[\] = \[)(.*?)(\n\])"
    match = re.search(order_pattern, text, flags=re.S)
    if not match:
        raise SystemExit("DashScope Native frontend patch failed: channel display order not found")
    order = [int(value) for value in re.findall(r"\d+", match.group(2))]
    order = [value for value in order if value not in {LEGACY_ID, NATIVE_ID}]
    try:
        ali_index = order.index(17) + 1
    except ValueError:
        ali_index = len(order)
    order.insert(ali_index, NATIVE_ID)
    replacement = match.group(1) + "\n  " + ", ".join(map(str, order)) + "," + match.group(3)
    text = text[:match.start()] + replacement + text[match.end():]

    fetch_pattern = r"(export const MODEL_FETCHABLE_TYPES = new Set\(\[)(.*?)(\n\]\))"
    match = re.search(fetch_pattern, text, flags=re.S)
    if match:
        fetchable = [int(value) for value in re.findall(r"\d+", match.group(2))]
        fetchable = [value for value in fetchable if value not in {LEGACY_ID, NATIVE_ID}]
        fetchable.append(NATIVE_ID)
        replacement = match.group(1) + "\n  " + ", ".join(map(str, fetchable)) + "," + match.group(3)
        text = text[:match.start()] + replacement + text[match.end():]

    path.write_text(text, encoding="utf-8")


def patch_locale(path: Path, key: str, value: str) -> None:
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    translation = data.setdefault("translation", {})
    if not isinstance(translation, dict):
        raise SystemExit(f"DashScope Native frontend patch failed: invalid translation namespace in {path}")
    if translation.get(key) != value:
        translation[key] = value
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_static_keys(root: Path) -> None:
    path = root / "src" / "i18n" / "static-keys.ts"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    if f"'{LABEL}'" in text or f'"{LABEL}"' in text:
        return
    marker = "] as const"
    if marker in text:
        text = text.replace(marker, f"  '{LABEL}',\n{marker}", 1)
        path.write_text(text, encoding="utf-8")


def main() -> None:
    root = frontend_root()
    patch_constants(root)
    patch_locale(root / "src" / "i18n" / "locales" / "zh.json", LABEL, "阿里SDK / DashScope 原生协议")
    patch_locale(root / "src" / "i18n" / "locales" / "en.json", LABEL, LABEL)
    patch_static_keys(root)
    print(f"applied DashScope Native channel frontend patch for {FRONTEND}")


if __name__ == "__main__":
    main()
