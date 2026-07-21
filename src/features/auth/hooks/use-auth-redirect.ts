/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useNavigate } from '@tanstack/react-router'
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
  if (!isAdmin && (sanitized.startsWith('/dashboard') || sanitized.startsWith('/_authenticated'))) {
    return defaultPath
  }
  return sanitized
}

/**
 * Hook for handling authentication redirects and user data management
 */
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
      navigate({ href: targetForUser(loginData.user, redirectTo), replace: true })
      return
    }

    if (loginData?.id) {
      saveUserId(loginData.id)
    }

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
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    }

    const user = useAuthStore.getState().auth.user
    navigate({ href: targetForUser(user ?? {}, redirectTo), replace: true })
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
