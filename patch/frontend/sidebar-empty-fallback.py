#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src" / "hooks").exists():
        return PROJECT_ROOT
    raise SystemExit(f"sidebar fallback patch failed: missing frontend root {candidate}")


def main() -> None:
    root = frontend_root()
    path = root / "src" / "hooks" / "use-sidebar-config.ts"
    if not path.exists():
        return

    text = path.read_text(encoding="utf-8")
    if "filteredNavGroups.length === 0 && navGroups.length > 0" in text:
        print("applied sidebar empty fallback frontend patch")
        return

    old = """  return filteredNavGroups
}
"""
    new = """  // Never let optional sidebar module settings hide the entire backend
  // navigation. If config filtering removes every item, keep the original
  // navigation so admins can still recover settings and manage the system.
  if (filteredNavGroups.length === 0 && navGroups.length > 0) {
    return navGroups
  }

  return filteredNavGroups
}
"""
    if old not in text:
        raise SystemExit(f"sidebar fallback patch failed: return anchor not found in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("applied sidebar empty fallback frontend patch")


if __name__ == "__main__":
    main()
