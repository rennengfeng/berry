export type OAuthCallbackMode = 'login' | 'bind'

const STORAGE_KEY = 'new-api:oauth-callback-mode'

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const OAUTH_CALLBACK_MODE_STORAGE_KEY = STORAGE_KEY

export function normalizeOAuthCallbackMode(value: unknown): OAuthCallbackMode {
  return value === 'bind' ? 'bind' : 'login'
}

export function getOAuthCallbackMode(): OAuthCallbackMode {
  return normalizeOAuthCallbackMode(storage()?.getItem(STORAGE_KEY))
}

export function setOAuthCallbackMode(mode: OAuthCallbackMode): void {
  storage()?.setItem(STORAGE_KEY, normalizeOAuthCallbackMode(mode))
}

export function clearOAuthCallbackMode(): void {
  storage()?.removeItem(STORAGE_KEY)
}

export function inferOAuthCallbackMode(): OAuthCallbackMode {
  if (typeof window !== 'undefined' && window.opener) return 'bind'
  return getOAuthCallbackMode()
}

export const resolveOAuthCallbackMode = inferOAuthCallbackMode
export const getCurrentOAuthCallbackMode = inferOAuthCallbackMode
export const readOAuthCallbackMode = getOAuthCallbackMode
export const saveOAuthCallbackMode = setOAuthCallbackMode
export const removeOAuthCallbackMode = clearOAuthCallbackMode

export function isOAuthBindMode(mode: unknown): boolean {
  return normalizeOAuthCallbackMode(mode) === 'bind'
}

export function isOAuthLoginMode(mode: unknown): boolean {
  return normalizeOAuthCallbackMode(mode) === 'login'
}

export default inferOAuthCallbackMode
