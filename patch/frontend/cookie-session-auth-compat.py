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
    raise SystemExit(f"cookie session auth patch failed: missing frontend root {candidate}")


def write_if_exists(root: Path, rel: str, text: str) -> None:
    path = root / rel
    if not path.exists():
        return
    path.write_text(text, encoding="utf-8")


def patch_api_bootstrap(root: Path) -> None:
    auth_session_path = root / "src" / "lib" / "auth-session.ts"
    if auth_session_path.exists():
        auth_session_text = auth_session_path.read_text(encoding="utf-8")
        if (
            "export async function bootstrapAuthentication(): Promise<RefreshOutcome> {"
            in auth_session_text
            and "hasStaleSession" in auth_session_text
        ):
            return

    path = root / "src" / "lib" / "api.ts"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    replacement = """export async function bootstrapAuthentication(): Promise<RefreshOutcome> {
  const auth = useAuthStore.getState().auth
  const now = Math.floor(Date.now() / 1000)
  if (
    auth.user &&
    auth.accessToken &&
    auth.accessExpiresAt &&
    auth.accessExpiresAt > now
  ) {
    auth.setBootstrapState('complete')
    return {
      kind: 'authenticated',
      bundle: {
        access_token: auth.accessToken,
        token_type: 'Bearer',
        access_expires_at: auth.accessExpiresAt,
        user: auth.user,
        session: auth.session!,
      },
    }
  }

  if (auth.user) {
    auth.setBootstrapState('complete')
    return { kind: 'anonymous' }
  }

  auth.setBootstrapState('checking')
  return refreshAuthentication()
}"""
    start = text.find("export async function bootstrapAuthentication(): Promise<RefreshOutcome> {")
    if start < 0:
        if auth_session_path.exists() and "bootstrapAuthentication" in auth_session_text:
            return
        raise SystemExit("cookie session auth patch failed: bootstrapAuthentication anchor not found")
    depth = 0
    end = -1
    for index in range(text.find("{", start), len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end < 0:
        raise SystemExit("cookie session auth patch failed: bootstrapAuthentication function is unterminated")
    if text[start:end] != replacement:
        path.write_text(text[:start] + replacement + text[end:], encoding="utf-8")


root = frontend_root()

write_if_exists(
    root,
    "src/routes/portal/route.tsx",
    """import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { PortalLayout } from '@/features/frontend-portal/portal-layout'
import { getSelf } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

async function loadPortalUser(): Promise<AuthUser | null> {
  const auth = useAuthStore.getState().auth
  if (auth.user) return auth.user

  try {
    const res = await getSelf()
    if (res?.success && res.data) {
      auth.setUser(res.data)
      return res.data as AuthUser
    }
  } catch (_error) {
    // Keep route guard quiet; the redirect below is the user-facing result.
  }

  useAuthStore.getState().auth.reset()
  return null
}

export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const user = await loadPortalUser()
    if (!user) {
      throw redirect({ to: '/sign-in', search: { redirect: '/portal' } })
    }
    if (user.role >= ROLE.ADMIN) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: PortalRoute,
})

function PortalRoute() {
  return (
    <PortalLayout>
      <Outlet />
    </PortalLayout>
  )
}
""",
)

write_if_exists(
    root,
    "src/routes/(auth)/sign-in.tsx",
    """import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@/features/auth/sign-in'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  component: SignIn,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const user = useAuthStore.getState().auth.user
    if (user) {
      const isAdmin = user.role >= ROLE.ADMIN
      const defaultPath = isAdmin ? '/dashboard' : '/portal'
      const target =
        search?.redirect && !(isAdmin && search.redirect.startsWith('/portal'))
          ? search.redirect
          : defaultPath
      throw redirect({ to: target })
    }
  },
})
""",
)

write_if_exists(
    root,
    "src/lib/require-admin.ts",
    """import { redirect } from '@tanstack/react-router'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

/**
 * 原生（官方）路由守卫：有对应二开页面的，非管理员重定向到该二开页。
 */
export function requireAdmin(fallback: string = '/portal') {
  const { auth } = useAuthStore.getState()
  if (!auth.user || auth.user.role < ROLE.ADMIN) {
    throw redirect({ to: fallback })
  }
}

/**
 * 原生（官方）路由守卫：没有对应二开页面的，直接拦截。
 */
export function requireAdminBlock() {
  const { auth } = useAuthStore.getState()
  if (!auth.user) {
    throw redirect({ to: '/sign-in' })
  }
  if (auth.user.role < ROLE.ADMIN) {
    throw redirect({ to: '/403' })
  }
}
""",
)

patch_api_bootstrap(root)
print("applied cookie session auth compatibility frontend patch for berry")
