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
import axios, { type AxiosRequestConfig } from 'axios'
import i18next from 'i18next'
import { toast } from 'sonner'
import {
  useAuthStore,
  type AuthBootstrapState,
  type AuthBundle,
  type AuthUser,
  type LoginSession,
} from '@/stores/auth-store'

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipBusinessError?: boolean
    skipErrorHandler?: boolean
    disableDuplicate?: boolean
    skipAuthRefresh?: boolean
    authRetry?: boolean
    acceptAuthRotation?: boolean
  }
}

export type ApiRequestConfig = AxiosRequestConfig

export type RefreshOutcome =
  | { kind: 'authenticated'; bundle: AuthBundle }
  | { kind: 'anonymous' }
  | { kind: 'transient_error'; error: unknown }
  | { kind: 'out_of_sync'; code?: string }

export interface AuthTokenRotation {
  access_token: string
  token_type: string
  access_expires_at: number
  session: LoginSession
}

export class AuthRotationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthRotationError'
  }
}

const baseURL = ''

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Cache-Control': 'no-store',
  },
})

const authClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Cache-Control': 'no-store',
  },
})

const inFlightGet = new Map<string, Promise<unknown>>()
const originalGet = api.get.bind(api)

api.get = ((url: string, config: ApiRequestConfig = {}) => {
  if (config.disableDuplicate) return originalGet(url, config)

  const params = config.params ? JSON.stringify(config.params) : '{}'
  const sessionSID = useAuthStore.getState().auth.session?.sid || 'anonymous'
  const key = `${sessionSID}:${url}?${params}`
  const existingRequest = inFlightGet.get(key)
  if (existingRequest) return existingRequest

  const request = originalGet(url, config).finally(() => {
    inFlightGet.delete(key)
  })
  inFlightGet.set(key, request)
  return request
}) as typeof api.get

let refreshPromise: Promise<RefreshOutcome> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false
  return (
    Number.isInteger(value.id) &&
    Number(value.id) > 0 &&
    typeof value.username === 'string' &&
    typeof value.role === 'number'
  )
}

function isLoginSession(value: unknown): value is LoginSession {
  if (!isRecord(value)) return false
  return (
    typeof value.sid === 'string' &&
    value.sid.length > 0 &&
    typeof value.current === 'boolean' &&
    typeof value.login_method === 'string' &&
    typeof value.ip === 'string' &&
    typeof value.user_agent === 'string' &&
    typeof value.created_at === 'number' &&
    typeof value.last_active_at === 'number' &&
    typeof value.expires_at === 'number'
  )
}

function hasValidTokenFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.access_token === 'string' &&
    value.access_token.length > 0 &&
    typeof value.token_type === 'string' &&
    value.token_type.length > 0 &&
    typeof value.access_expires_at === 'number' &&
    Number.isFinite(value.access_expires_at) &&
    value.access_expires_at > 0
  )
}

export function isAuthBundle(value: unknown): value is AuthBundle {
  if (!isRecord(value)) return false
  return (
    hasValidTokenFields(value) &&
    isAuthUser(value.user) &&
    isLoginSession(value.session)
  )
}

function isAuthTokenRotation(value: unknown): value is AuthTokenRotation {
  return (
    isRecord(value) &&
    hasValidTokenFields(value) &&
    isLoginSession(value.session) &&
    value.session.current
  )
}

export function applyAuthBundle(bundle: AuthBundle): void {
  useAuthStore.getState().auth.setBundle(bundle)
}

export function applyAuthRotation(value: unknown): void {
  if (!isAuthTokenRotation(value)) {
    throw new AuthRotationError('Invalid authentication rotation response')
  }

  const auth = useAuthStore.getState().auth
  if (!auth.user || !auth.session) {
    throw new AuthRotationError('Authentication rotation has no active session')
  }
  if (value.session.sid !== auth.session.sid) {
    throw new AuthRotationError('Authentication rotation session mismatch')
  }

  applyAuthBundle({
    access_token: value.access_token,
    token_type: value.token_type,
    access_expires_at: value.access_expires_at,
    session: value.session,
    user: auth.user,
  })
}

export function clearAuthentication(
  _synchronizeTabs = true,
  bootstrapState: AuthBootstrapState = 'complete'
): void {
  useAuthStore.getState().auth.reset(bootstrapState)
}

export function clearAuthenticatedClientState(queryClient?: {
  clear: () => void
}): void {
  clearAuthentication()
  queryClient?.clear()
}

async function requestRefresh(): Promise<RefreshOutcome> {
  const expectedSID = useAuthStore.getState().auth.session?.sid
  try {
    const response = await authClient.post('/api/user/auth/refresh', undefined, {
      headers: expectedSID ? { 'X-Auth-Session': expectedSID } : undefined,
    })
    const payload = response.data
    if (payload?.success === true && isAuthBundle(payload.data)) {
      applyAuthBundle(payload.data)
      return { kind: 'authenticated', bundle: payload.data }
    }
    clearAuthentication(false)
    return { kind: 'out_of_sync', code: payload?.code }
  } catch (error: unknown) {
    if (!axios.isAxiosError(error)) {
      useAuthStore.getState().auth.setBootstrapState('idle')
      return { kind: 'transient_error', error }
    }
    if (error.response?.status === 401) {
      clearAuthentication(true)
      return { kind: 'anonymous' }
    }
    if (error.response?.status === 409) {
      clearAuthentication(false)
      return {
        kind: 'out_of_sync',
        code:
          typeof error.response.data?.code === 'string'
            ? error.response.data.code
            : undefined,
      }
    }
    useAuthStore.getState().auth.setBootstrapState('idle')
    return { kind: 'transient_error', error }
  }
}

export function refreshAuthentication(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = requestRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function bootstrapAuthentication(): Promise<RefreshOutcome> {
  const auth = useAuthStore.getState().auth
  const now = Math.floor(Date.now() / 1000)
  if (auth.user && auth.accessToken && auth.accessExpiresAt && auth.accessExpiresAt > now) {
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

  auth.setBootstrapState('checking')
  return refreshAuthentication()
}

function getUserId(): string | null {
  try {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('uid')
    }
  } catch {
    /* empty */
  }
  return null
}

export function getCommonHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const uid = getUserId()
  if (uid) {
    headers['New-Api-User'] = uid
  }

  const accessToken = useAuthStore.getState().auth.accessToken
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  return headers
}

export async function getFreshAuthHeaders(): Promise<Record<string, string>> {
  const auth = useAuthStore.getState().auth
  const refreshBefore = Math.floor(Date.now() / 1000) + 60
  if (
    auth.accessToken &&
    auth.accessExpiresAt &&
    auth.accessExpiresAt > refreshBefore
  ) {
    return getCommonHeaders()
  }

  const outcome = await refreshAuthentication()
  if (outcome.kind === 'authenticated') return getCommonHeaders()
  throw new Error(i18next.t('Session expired!'))
}

function redirectToSignIn(): void {
  if (
    typeof window !== 'undefined' &&
    window.location.pathname !== '/sign-in'
  ) {
    window.location.replace('/sign-in')
  }
}

function responseMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.message ||
      error.message ||
      i18next.t('Request failed')
    )
  }
  return error instanceof Error ? error.message : i18next.t('Request failed')
}

api.interceptors.response.use(
  (response) => {
    if (response.config.acceptAuthRotation && response.data?.success === true) {
      applyAuthRotation(response.data.data)
    }

    if (
      !response.config.skipBusinessError &&
      typeof response.data?.success === 'boolean' &&
      !response.data.success
    ) {
      toast.error(response.data.message || i18next.t('Request failed'))
    }
    return response
  },
  async (error) => {
    const config = error?.config as ApiRequestConfig | undefined
    const skipErrorHandler = config?.skipErrorHandler
    const status = error?.response?.status

    if (status === 401) {
      if (config && !config.skipAuthRefresh && !config.authRetry) {
        config.authRetry = true
        const outcome = await refreshAuthentication()
        if (outcome.kind === 'authenticated') {
          const token = useAuthStore.getState().auth.accessToken
          if (token) {
            config.headers = {
              ...config.headers,
              Authorization: `Bearer ${token}`,
            }
          }
          return api.request(config)
        }

        if (outcome.kind === 'anonymous' || outcome.kind === 'out_of_sync') {
          if (!skipErrorHandler) toast.error(i18next.t('Session expired!'))
          redirectToSignIn()
        }
      } else if (config?.authRetry) {
        clearAuthentication(false)
        if (!skipErrorHandler) toast.error(i18next.t('Session expired!'))
        redirectToSignIn()
      } else if (!skipErrorHandler) {
        toast.error(i18next.t('Session expired!'))
      }
    } else if (!skipErrorHandler) {
      toast.error(responseMessage(error))
    }
    return Promise.reject(error)
  }
)

api.interceptors.request.use((config) => {
  const uid = getUserId()
  if (uid) {
    config.headers['New-Api-User'] = uid
  }

  const accessToken = useAuthStore.getState().auth.accessToken
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

export async function getSelf() {
  const res = await api.get('/api/user/self', {
    skipErrorHandler: true,
  })
  return res.data
}

export async function getUserModels(): Promise<{
  success: boolean
  message?: string
  data?: string[]
}> {
  const res = await api.get('/api/user/models')
  return res.data
}

export async function getUserGroups(): Promise<{
  success: boolean
  message?: string
  data?: Record<string, { desc: string; ratio: number | string }>
}> {
  const res = await api.get('/api/user/self/groups')
  return res.data
}

export async function getStatus() {
  const res = await api.get('/api/status')
  return res.data?.data as Record<string, unknown>
}

export async function getNotice(): Promise<{
  success: boolean
  message?: string
  data?: string
}> {
  const res = await api.get('/api/notice')
  return res.data
}

export async function get2FAStatus() {
  const res = await api.get('/api/user/2fa/status')
  return res.data
}

export async function setup2FA() {
  const res = await api.post('/api/user/2fa/setup')
  return res.data
}

export async function enable2FA(code: string) {
  const res = await api.post(
    '/api/user/2fa/enable',
    { code },
    { acceptAuthRotation: true }
  )
  return res.data
}

export async function disable2FA(code: string) {
  const res = await api.post(
    '/api/user/2fa/disable',
    { code },
    { acceptAuthRotation: true }
  )
  return res.data
}

export async function regenerate2FABackupCodes(code: string) {
  const res = await api.post(
    '/api/user/2fa/backup_codes',
    { code },
    { acceptAuthRotation: true }
  )
  return res.data
}
