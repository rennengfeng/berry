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
/**
 * Berry portal API layer.
 *
 * The portal pages were originally written against three convenience
 * endpoints (`/api/frontend/{models,dashboard,settings}`) that did not exist
 * in upstream new-api. This module re-implements the same shapes by
 * aggregating the real, upstream-supported endpoints in the browser, so the
 * Go backend stays untouched and the overlay survives version bumps.
 */
import { SSE } from 'sse.js'
import { api, getCommonHeaders, getSelf, getStatus } from '@/lib/api'
import type { AuthUser } from '@/stores/auth-store'
import type {
  ApiKeySummary,
  FrontendDashboardPayload,
  FrontendModel,
  FrontendModelsPayload,
  FrontendSettingsPayload,
  FrontendStatusGroup,
} from './types'

// ----------------------------------------------------------------------------
// Pricing → FrontendModelsPayload
// ----------------------------------------------------------------------------

type RawPricingModel = {
  model_name: string
  description?: string
  vendor_id?: number
  vendor_name?: string
  vendor_icon?: string
  quota_type: number
  model_ratio: number
  completion_ratio: number
  model_price?: number
  cache_ratio?: number | null
  create_cache_ratio?: number | null
  enable_groups?: string[]
  tags?: string
  supported_endpoint_types?: string[]
  group_ratio?: Record<string, number>
  billing_mode?: string
  billing_expr?: string
}

type RawPricingResponse = {
  success: boolean
  message?: string
  data?: RawPricingModel[]
  vendors?: Array<{ id: number; name: string; icon?: string }>
  group_ratio?: Record<string, number>
  usable_group?: Record<string, { desc?: string; ratio?: number } | string>
  supported_endpoint?: Record<string, unknown>
  auto_groups?: string[]
}

/**
 * Pull /api/pricing and /api/uptime/status in parallel and assemble the same
 * payload the portal pages expect. Pricing already contains official ratios
 * (`model_ratio`, `model_price`); we don't have a separate "site price"
 * endpoint, so we mirror those into the official_* fields so the
 * official-vs-site toggle on the model square has something to render.
 */
export async function getFrontendModels(): Promise<FrontendModelsPayload> {
  const [pricingRes, statusGroups] = await Promise.all([
    api.get('/api/pricing'),
    safeGetUptimeStatus(),
  ])
  const pricing = pricingRes.data as RawPricingResponse

  const monitorIndex = new Map<string, FrontendStatusGroup['monitors'][number][]>()
  for (const g of statusGroups) {
    for (const m of g.monitors) {
      let group: string | undefined
      let modelName: string
      if (m.name.includes('/')) {
        const slashIdx = m.name.indexOf('/')
        group = m.name.slice(0, slashIdx)
        modelName = m.name.slice(slashIdx + 1)
      } else {
        modelName = m.name
      }
      const entry = { ...m, name: modelName, group }
      const arr = monitorIndex.get(modelName)
      if (arr) { arr.push(entry) } else { monitorIndex.set(modelName, [entry]) }
    }
  }

  const models: FrontendModel[] = (pricing.data ?? []).map((m) => {
    const monitors = monitorIndex.get(m.model_name) ?? []
    return {
      model_name: m.model_name,
      description: m.description,
      vendor_id: m.vendor_id,
      vendor_name: m.vendor_name,
      tags: m.tags,
      icon: m.vendor_icon,
      quota_type: m.quota_type,
      model_ratio: m.model_ratio,
      completion_ratio: m.completion_ratio,
      model_price: m.model_price,
      official_model_ratio: m.model_ratio,
      official_model_price: m.model_price,
      cache_ratio: m.cache_ratio ?? null,
      create_cache_ratio: m.create_cache_ratio ?? null,
      enable_groups: m.enable_groups ?? [],
      supported_endpoint_types: m.supported_endpoint_types,
      group_ratio: m.group_ratio,
      monitors,
      status: monitors[0] ?? null,
      monitor: monitors[0] ?? null,
      billing_mode: m.billing_mode,
      billing_expr: m.billing_expr,
    }
  })

  // /api/pricing returns usable_group as {desc,ratio}; portal expects {string}.
  const usable_group: Record<string, string> = {}
  const rawUsable = pricing.usable_group ?? {}
  for (const key of Object.keys(rawUsable)) {
    const v = rawUsable[key]
    if (typeof v === 'string') {
      usable_group[key] = v
    } else if (v && typeof v === 'object') {
      usable_group[key] = v.desc ?? key
    }
  }

  return {
    models,
    vendors: pricing.vendors ?? [],
    group_ratio: pricing.group_ratio ?? {},
    usable_group,
    supported_endpoint: pricing.supported_endpoint ?? {},
    auto_groups: pricing.auto_groups ?? [],
    status_groups: statusGroups,
  }
}

// ----------------------------------------------------------------------------
// Dashboard → FrontendDashboardPayload
// ----------------------------------------------------------------------------

type RawSelfStatItem = {
  count?: number
  quota?: number
  prompt_tokens?: number
  completion_tokens?: number
}

/**
 * Aggregate /api/user/self + /api/log/self/stat (today) + /api/notice +
 * /api/user/models + /api/uptime/status into the portal-shaped dashboard.
 * The numbers map to RPM/TPM as best-effort: there is no minute-level rate
 * endpoint upstream, so we surface today's totals divided per minute window
 * and let the consumer label them appropriately.
 */
export async function getFrontendDashboard(): Promise<FrontendDashboardPayload> {
  const [user, todayStat, modelsCount, notice, statusGroups] = await Promise.all([
    safeGetSelf(),
    safeGetSelfStatToday(),
    safeGetUserModelCount(),
    safeGetNotice(),
    safeGetUptimeStatus(),
  ])

  return {
    user: user as AuthUser,
    today: {
      quota: todayStat.quota,
      rpm: todayStat.requests,
      tpm: todayStat.tokens,
    },
    models_count: modelsCount,
    status_groups: statusGroups,
    notice,
  }
}

async function safeGetSelf(): Promise<AuthUser | null> {
  try {
    const res = await getSelf()
    return (res?.data as AuthUser) ?? null
  } catch {
    return null
  }
}

async function safeGetSelfStatToday(): Promise<{
  requests: number
  tokens: number
  quota: number
}> {
  try {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const res = await api.get('/api/log/self/stat', {
      params: {
        type: 0,
        start_timestamp: Math.floor(start.getTime() / 1000),
        end_timestamp: Math.floor(end.getTime() / 1000),
      },
    })
    const item = (res.data?.data ?? {}) as RawSelfStatItem
    return {
      requests: item.count ?? 0,
      tokens: (item.prompt_tokens ?? 0) + (item.completion_tokens ?? 0),
      quota: item.quota ?? 0,
    }
  } catch {
    return { requests: 0, tokens: 0, quota: 0 }
  }
}

async function safeGetUserModelCount(): Promise<number> {
  try {
    const res = await api.get('/api/user/models')
    const arr = res.data?.data
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

async function safeGetNotice(): Promise<string | undefined> {
  try {
    const res = await api.get('/api/notice')
    return typeof res.data?.data === 'string' ? res.data.data : undefined
  } catch {
    return undefined
  }
}

async function safeGetUptimeStatus(): Promise<FrontendStatusGroup[]> {
  try {
    const res = await api.get('/api/uptime/status')
    const data = res.data?.data
    return Array.isArray(data) ? (data as FrontendStatusGroup[]) : []
  } catch {
    return []
  }
}

/** Public re-export so model-monitor.tsx keeps its existing call. */
export async function getFrontendUptimeStatus(): Promise<FrontendStatusGroup[]> {
  return safeGetUptimeStatus()
}

// ----------------------------------------------------------------------------
// Settings → FrontendSettingsPayload
// ----------------------------------------------------------------------------

/**
 * No backing endpoint upstream — return null so usePortalSettings falls
 * through to its built-in defaults (`defaultPortalSettings`,
 * `defaultDocsRegistry`). This keeps the page editable in code without
 * touching the server.
 *
 * Returning `null` (instead of throwing) avoids a noisy error toast on every
 * page load through the global axios interceptor.
 */
export async function getFrontendSettings(): Promise<FrontendSettingsPayload | null> {
  return null
}

// ----------------------------------------------------------------------------
// Branding helpers
// ----------------------------------------------------------------------------

/** Read system branding (system_name / logo / footer / etc.) from /api/status. */
export async function getSystemBranding(): Promise<Record<string, unknown>> {
  try {
    const status = await getStatus()
    return (status ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ----------------------------------------------------------------------------
// Token (API key) helpers — unchanged
// ----------------------------------------------------------------------------

export async function getApiKeySummaries(): Promise<ApiKeySummary[]> {
  const res = await api.get('/api/token/?p=1&size=100')
  const items = res.data?.data?.items
  return Array.isArray(items) ? items : []
}

export async function getTokenKey(id: number): Promise<string> {
  const res = await api.post(`/api/token/${id}/key`)
  return res.data?.data?.key ?? ''
}

export async function sendTokenChatCompletion(params: {
  token: string
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  max_tokens?: number
}) {
  const res = await api.post(
    '/v1/chat/completions',
    {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${params.token}`,
      },
      skipErrorHandler: true,
    } as Record<string, unknown>
  )
  return res.data
}

export function openTokenChatCompletionStream(params: {
  token: string
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  max_tokens?: number
  onChunk: (chunk: string) => void
  onComplete: () => void
  onError: (message: string) => void
}) {
  const source = new SSE('/v1/chat/completions', {
    headers: {
      ...getCommonHeaders(),
      Authorization: `Bearer ${params.token}`,
    },
    method: 'POST',
    payload: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens,
      stream: true,
    }),
  })

  let completed = false

  const close = () => {
    source.close()
  }

  source.addEventListener('message', (event: MessageEvent) => {
    if (event.data === '[DONE]') {
      completed = true
      close()
      params.onComplete()
      return
    }

    try {
      const chunk = JSON.parse(event.data) as {
        choices?: Array<{
          delta?: { content?: string; reasoning_content?: string }
        }>
      }

      const delta = chunk.choices?.[0]?.delta
      const content = delta?.content || delta?.reasoning_content
      if (content) {
        params.onChunk(content)
      }
    } catch (error) {
      console.error('Failed to parse frontend portal stream chunk:', error)
      if (!completed) {
        close()
        params.onError('Failed to parse the streaming response.')
      }
    }
  })

  source.addEventListener('error', (event: Event & { data?: string }) => {
    if (completed || source.readyState === 2) {
      return
    }

    let message = event.data || 'Streaming request failed.'
    if (event.data) {
      try {
        const parsed = JSON.parse(event.data) as {
          error?: { message?: string }
        }
        if (parsed.error?.message) {
          message = parsed.error.message
        }
      } catch {
        // Ignore non-JSON error payloads.
      }
    }

    close()
    params.onError(message)
  })

  source.addEventListener(
    'readystatechange',
    (event: Event & { readyState?: number }) => {
      const status = (source as unknown as { status?: number }).status
      if (
        !completed &&
        event.readyState !== undefined &&
        event.readyState >= 2 &&
        status !== undefined &&
        status !== 200
      ) {
        close()
        params.onError(`HTTP ${status}: streaming connection closed.`)
      }
    }
  )

  source.stream()
  return close
}
