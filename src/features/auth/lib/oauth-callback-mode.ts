export type OAuthCallbackMode = 'login' | 'bind'

const STORAGE_KEY = 'new-api:oauth-callback-mode'
const PROVIDER_KEY = 'new-api:oauth-bind-provider'
const STATE_KEY = 'new-api:oauth-bind-state'

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

export function getOAuthSessionStorage(target?: Window | null): Storage | null {
  if (!target) return storage()
  try {
    return target.sessionStorage
  } catch {
    return null
  }
}

export function markOAuthBindPopup(targetStorage: Storage | null, provider: string, state: string): boolean {
  if (!targetStorage || !provider || !state) return false
  try {
    targetStorage.setItem(STORAGE_KEY, 'bind')
    targetStorage.setItem(PROVIDER_KEY, provider)
    targetStorage.setItem(STATE_KEY, state)
    return true
  } catch {
    return false
  }
}

export function inferOAuthCallbackMode(provider?: string, state?: string, options?: { opener?: Window | null; storage?: Storage | null }): OAuthCallbackMode {
  const targetStorage = options?.storage ?? storage()
  const mode = normalizeOAuthCallbackMode(targetStorage?.getItem(STORAGE_KEY))
  const markedProvider = targetStorage?.getItem(PROVIDER_KEY)
  const markedState = targetStorage?.getItem(STATE_KEY)
  if (mode === 'bind' && (!provider || !markedProvider || markedProvider === provider) && (!state || !markedState || markedState === state)) return 'bind'
  if (typeof window !== 'undefined' && window.opener) return 'bind'
  if (options?.opener) return 'bind'
  return 'login'
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
