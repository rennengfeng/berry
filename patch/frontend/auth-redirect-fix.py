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
    if (PROJECT_ROOT / "src").exists():
        return PROJECT_ROOT
    raise SystemExit(f"auth redirect patch failed: missing frontend root {candidate}")


root = frontend_root()
path = root / "src" / "features" / "auth" / "hooks" / "use-auth-redirect.ts"
if not path.exists():
    raise SystemExit(f"auth redirect patch failed: missing {path}")

path.write_text(
    """import { useNavigate } from '@tanstack/react-router'
import i18n from 'i18next'
import {
  getSavedLanguage,
  sanitizeAuthRedirect,
} from '@/features/auth/lib/auth-redirect'
import { saveUserId } from '@/features/auth/lib/storage'
import { applyAuthBundle, getSelf, isAuthBundle } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'
import type { User } from '@/features/users/types'

function targetForUser(user: { role?: number }, redirectTo?: string): string {
  const isAdmin = (user.role ?? 0) >= ROLE.ADMIN
  const defaultPath = isAdmin ? '/dashboard' : '/portal'
  const sanitized =
    typeof window !== 'undefined'
      ? sanitizeAuthRedirect(redirectTo, window.location.origin)
      : null

  if (!sanitized) return defaultPath
  if (isAdmin && sanitized.startsWith('/portal')) return defaultPath
  if (
    !isAdmin &&
    (sanitized.startsWith('/dashboard') || sanitized.startsWith('/_authenticated'))
  ) {
    return defaultPath
  }
  return sanitized
}

function replaceToAuthTarget(target: string): boolean {
  if (typeof window !== 'undefined') {
    window.location.replace(target)
    return true
  }
  return false
}

export function useAuthRedirect() {
  const navigate = useNavigate()
  const { auth } = useAuthStore()

  const handleLoginSuccess = async (
    loginData?: AuthBundle | { id?: number; role?: number } | null,
    redirectTo?: string
  ) => {
    if (isAuthBundle(loginData)) {
      applyAuthBundle(loginData)
      saveUserId(loginData.user.id)
      const savedLang = getSavedLanguage(loginData.user)
      if (savedLang && savedLang !== i18n.language) {
        await i18n.changeLanguage(savedLang)
      }
      const target = targetForUser(loginData.user, redirectTo)
      if (!replaceToAuthTarget(target)) {
        navigate({ to: target as never, replace: true })
      }
      return
    }

    if (loginData?.id) saveUserId(loginData.id)

    try {
      const self = await getSelf()
      if (self?.success && self.data) {
        const user = self.data as User
        auth.setUser(user)
        if (user.id) saveUserId(user.id)
        const savedLang = getSavedLanguage(user)
        if (savedLang && savedLang !== i18n.language) {
          await i18n.changeLanguage(savedLang)
        }
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    }

    const user = useAuthStore.getState().auth.user
    const target = targetForUser(user ?? {}, redirectTo)
    if (!replaceToAuthTarget(target)) {
      navigate({ to: target as never, replace: true })
    }
  }

  const redirectTo2FA = () => {
    navigate({ to: '/otp', replace: true })
  }

  const redirectToLogin = () => {
    navigate({ to: '/sign-in', replace: true })
  }

  const redirectToRegister = () => {
    navigate({ to: '/sign-up', replace: true })
  }

  return {
    handleLoginSuccess,
    redirectTo2FA,
    redirectToLogin,
    redirectToRegister,
  }
}
""",
    encoding="utf-8",
)
print("applied auth redirect frontend patch for berry")
