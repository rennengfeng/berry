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
import axios from 'axios'
import { api, clearAuthentication, refreshAuthentication } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { getAffiliateCode } from './lib/storage'
import type {
  LoginPayload,
  LoginResponse,
  Login2FAResponse,
  TwoFAPayload,
  RegisterPayload,
  ApiResponse,
} from './types'

// ============================================================================
// Authentication APIs
// ============================================================================

// ----------------------------------------------------------------------------
// Login & Logout
// ----------------------------------------------------------------------------

// User login with username and password
export async function login(payload: LoginPayload) {
  const turnstile = payload.turnstile ?? ''
  const res = await api.post<LoginResponse>(
    `/api/user/login?turnstile=${turnstile}`,
    {
      username: payload.username,
      password: payload.password,
    },
    { skipAuthRefresh: true }
  )
  return res.data
}

// Two-factor authentication login
export async function login2fa(payload: TwoFAPayload) {
  const res = await api.post<Login2FAResponse>('/api/user/login/2fa', payload, {
    skipAuthRefresh: true,
  })
  return res.data
}

// User logout
export async function logout(): Promise<ApiResponse> {
  const sid = useAuthStore.getState().auth.session?.sid
  try {
    const res = await api.post('/api/user/auth/logout', undefined, {
      headers: sid ? { 'X-Auth-Session': sid } : undefined,
      skipAuthRefresh: true,
      skipErrorHandler: true,
    })
    clearAuthentication()
    return res.data
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const outcome = await refreshAuthentication()
      if (outcome.kind === 'authenticated') return logout()
      if (outcome.kind === 'anonymous') return { success: true, message: '' }
    }
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 405)
    ) {
      const res = await api.get('/api/user/logout', {
        skipAuthRefresh: true,
        skipErrorHandler: true,
      })
      clearAuthentication()
      return res.data
    }
    throw error
  }
}

// ----------------------------------------------------------------------------
// Password Management
// ----------------------------------------------------------------------------

// Send password reset email
export async function sendPasswordResetEmail(
  email: string,
  turnstile?: string
): Promise<ApiResponse> {
  const res = await api.get('/api/reset_password', {
    params: { email, turnstile },
  })
  return res.data
}

// ----------------------------------------------------------------------------
// OAuth
// ----------------------------------------------------------------------------

// Start GitHub OAuth flow
export async function githubOAuthStart(clientId: string, state: string) {
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=user:email`
  window.open(url)
}

// Get OAuth state for CSRF protection
export async function createOAuthFlow(
  provider: string,
  intent: 'login' | 'bind' = 'login'
): Promise<string> {
  const aff = intent === 'login' ? getAffiliateCode() : ''
  const res = await api.post(
    '/api/oauth/state',
    { provider, intent, aff: aff || undefined },
    { skipAuthRefresh: intent === 'login' }
  )
  if (res.data?.success) {
    if (typeof res.data.data === 'string') return res.data.data
    if (typeof res.data.data?.flow_token === 'string') {
      return res.data.data.flow_token
    }
  }
  throw new Error(res.data?.message || 'Failed to initialize OAuth')
}

export async function getOAuthState(provider = 'github'): Promise<string> {
  return createOAuthFlow(provider, 'login')
}

// WeChat login by authorization code
export async function wechatLoginByCode(code: string): Promise<ApiResponse> {
  const res = await api.get('/api/oauth/wechat', {
    params: { code },
    skipAuthRefresh: true,
  })
  return res.data
}

// ----------------------------------------------------------------------------
// Registration
// ----------------------------------------------------------------------------

// User registration
export async function register(payload: RegisterPayload): Promise<ApiResponse> {
  const res = await api.post(`/api/user/register`, payload, {
    params: { turnstile: payload.turnstile ?? '' },
  })
  return res.data
}

// Send email verification code
export async function sendEmailVerification(
  email: string,
  turnstile?: string
): Promise<ApiResponse> {
  const res = await api.get('/api/verification', {
    params: { email, turnstile },
  })
  return res.data
}

// Bind email to OAuth account
export async function bindEmail(
  email: string,
  code: string
): Promise<ApiResponse> {
  const res = await api.post('/api/oauth/email/bind', {
    email,
    code,
  })
  return res.data
}
