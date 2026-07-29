#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src").exists():
        return PROJECT_ROOT
    raise SystemExit(f"auth redirect patch failed: missing frontend root {candidate}")


root = frontend_root()
path = root / "src" / "features" / "auth" / "hooks" / "use-auth-redirect.ts"
if not path.exists():
    raise SystemExit(f"auth redirect patch failed: missing {path}")

text = path.read_text(encoding="utf-8")

if "function replaceToAuthTarget(" not in text:
    text = re.sub(
        r"(function targetForUser\(user: \{ role\?: number \}, redirectTo\?: string\): string \{.*?\n\}\n)",
        r"""\1
function replaceToAuthTarget(target: string): boolean {
  if (typeof window !== 'undefined') {
    window.location.replace(target)
    return true
  }
  return false
}
""",
        text,
        count=1,
        flags=re.S,
    )

text = text.replace(
    "      navigate({ href: targetForUser(loginData.user, redirectTo), replace: true })",
    "      const target = targetForUser(loginData.user, redirectTo)\n"
    "      if (!replaceToAuthTarget(target)) {\n"
    "        navigate({ to: target as never, replace: true })\n"
    "      }",
)
text = text.replace(
    "    navigate({ href: targetForUser(user ?? {}, redirectTo), replace: true })",
    "    const target = targetForUser(user ?? {}, redirectTo)\n"
    "    if (!replaceToAuthTarget(target)) {\n"
    "      navigate({ to: target as never, replace: true })\n"
    "    }",
)

path.write_text(text, encoding="utf-8")
print("applied auth redirect frontend patch for berry")
