#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def frontend_root() -> Path:
    args = sys.argv[1:]
    candidates: list[Path] = []
    if args:
        base = Path(args[0]).resolve()
        frontend = args[1] if len(args) > 1 else "berry"
        candidates.extend([base / "web" / frontend, base])
    candidates.append(Path.cwd())
    for candidate in candidates:
        if (candidate / "src").is_dir() and (candidate / "package.json").exists():
            return candidate
    raise SystemExit("OAuth callback mode compatibility patch failed: frontend root not found")


def main() -> None:
    root = frontend_root()
    target = root / "src" / "features" / "auth" / "lib" / "oauth-callback-mode.ts"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "export type OAuthCallbackMode = 'login' | 'bind'\n\n"
        "const STORAGE_KEY = 'new-api:oauth-callback-mode'\n\n"
        "function storage(): Storage | null {\n"
        "  if (typeof window === 'undefined') return null\n"
        "  try {\n"
        "    return window.sessionStorage\n"
        "  } catch {\n"
        "    return null\n"
        "  }\n"
        "}\n\n"
        "export const OAUTH_CALLBACK_MODE_STORAGE_KEY = STORAGE_KEY\n\n"
        "export function normalizeOAuthCallbackMode(value: unknown): OAuthCallbackMode {\n"
        "  return value === 'bind' ? 'bind' : 'login'\n"
        "}\n\n"
        "export function getOAuthCallbackMode(): OAuthCallbackMode {\n"
        "  return normalizeOAuthCallbackMode(storage()?.getItem(STORAGE_KEY))\n"
        "}\n\n"
        "export function setOAuthCallbackMode(mode: OAuthCallbackMode): void {\n"
        "  storage()?.setItem(STORAGE_KEY, normalizeOAuthCallbackMode(mode))\n"
        "}\n\n"
        "export function clearOAuthCallbackMode(): void {\n"
        "  storage()?.removeItem(STORAGE_KEY)\n"
        "}\n\n"
        "export function inferOAuthCallbackMode(): OAuthCallbackMode {\n"
        "  if (typeof window !== 'undefined' && window.opener) return 'bind'\n"
        "  return getOAuthCallbackMode()\n"
        "}\n\n"
        "export const resolveOAuthCallbackMode = inferOAuthCallbackMode\n"
        "export const getCurrentOAuthCallbackMode = inferOAuthCallbackMode\n"
        "export const readOAuthCallbackMode = getOAuthCallbackMode\n"
        "export const saveOAuthCallbackMode = setOAuthCallbackMode\n"
        "export const removeOAuthCallbackMode = clearOAuthCallbackMode\n\n"
        "export function isOAuthBindMode(mode: unknown): boolean {\n"
        "  return normalizeOAuthCallbackMode(mode) === 'bind'\n"
        "}\n\n"
        "export function isOAuthLoginMode(mode: unknown): boolean {\n"
        "  return normalizeOAuthCallbackMode(mode) === 'login'\n"
        "}\n\n"
        "export default inferOAuthCallbackMode\n",
        encoding="utf-8",
    )
    print("applied OAuth callback mode compatibility frontend patch")


if __name__ == "__main__":
    main()
