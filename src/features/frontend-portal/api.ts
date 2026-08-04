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
  icon?: string
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
  billing_unit?: string
  billing_expr?: string
  dashscope_native_pricing?: FrontendModel['dashscope_native_pricing']
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

  const vendorIconMap = new Map<number, string>()
  const vendorNameMap = new Map<number, string>()
  for (const v of pricing.vendors ?? []) {
    if (v.icon) vendorIconMap.set(v.id, v.icon)
    vendorNameMap.set(v.id, v.name)
  }

  const models: FrontendModel[] = (pricing.data ?? []).map((m) => {
    const monitors = monitorIndex.get(m.model_name) ?? []
    const resolvedVendorName = m.vendor_name || (m.vendor_id ? vendorNameMap.get(m.vendor_id) : undefined)
    return {
      model_name: m.model_name,
      description: m.description,
      vendor_id: m.vendor_id,
      vendor_name: resolvedVendorName,
      tags: m.tags,
      icon: m.icon || m.vendor_icon || (m.vendor_id ? vendorIconMap.get(m.vendor_id) : undefined),
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
      billing_unit: m.billing_unit,
      billing_expr: m.billing_expr,
      dashscope_native_pricing: m.dashscope_native_pricing,
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

/**
 * Aggregate /api/user/self + /api/data/self (today) + /api/notice +
 * /api/user/models + /api/uptime/status into the portal-shaped dashboard.
 * /api/data/self returns per-bucket rows, which we sum for today's totals.
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
    const res = await api.get('/api/data/self', {
      params: {
        start_timestamp: Math.floor(start.getTime() / 1000),
        end_timestamp: Math.floor(end.getTime() / 1000),
        default_time: 'hour',
      },
      skipErrorHandler: true,
    } as Record<string, unknown>)
    const rows = (res.data?.data ?? []) as Array<{
      count?: number
      token_used?: number
      quota?: number
    }>
    return rows.reduce<{ requests: number; tokens: number; quota: number }>(
      (acc, item) => {
        acc.requests += Number(item.count) || 0
        acc.tokens += Number(item.token_used) || 0
        acc.quota += Number(item.quota) || 0
        return acc
      },
      { requests: 0, tokens: 0, quota: 0 }
    )
  } catch {
    return { requests: 0, tokens: 0, quota: 0 }
  }
}

async function safeGetUserModelCount(): Promise<number> {
  try {
    const res = await api.get('/api/user/models', { skipErrorHandler: true } as Record<string, unknown>)
    const arr = res.data?.data
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

async function safeGetNotice(): Promise<string | undefined> {
  try {
    const res = await api.get('/api/notice', { skipErrorHandler: true } as Record<string, unknown>)
    return typeof res.data?.data === 'string' ? res.data.data : undefined
  } catch {
    return undefined
  }
}

async function safeGetUptimeStatus(): Promise<FrontendStatusGroup[]> {
  try {
    const res = await api.get('/api/uptime/status', { skipErrorHandler: true } as Record<string, unknown>)
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
  const res = await api.get('/api/token/?p=1&size=100', {
    skipErrorHandler: true,
  } as Record<string, unknown>)
  const items = res.data?.data?.items
  return Array.isArray(items) ? items : []
}

export async function getTokenKey(id: number): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await api.post(`/api/token/${id}/key`)
      const key = res.data?.data?.key ?? ''
      if (key) return key
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300))
    }
  }
  try {
    const res = await api.post('/api/token/batch/keys', { ids: [id] })
    const keys = res.data?.data?.keys ?? {}
    return keys[id] || keys[String(id)] || ''
  } catch {
    return ''
  }
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
  onChunk: (chunk: string, type: 'content' | 'reasoning') => void
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
      if (delta?.reasoning_content) {
        params.onChunk(delta.reasoning_content, 'reasoning')
      }
      if (delta?.content) {
        params.onChunk(delta.content, 'content')
      }
    } catch (error) {
      console.error('Failed to parse frontend portal stream chunk:', error)
      if (!completed) {
        close()
        params.onError('Failed to parse the streaming response.')
      }
    }
  })

  source.addEventListener('error', (event: Event & { data?: string; responseText?: string }) => {
    if (completed || source.readyState === 2) {
      return
    }

    const raw = event.data || event.responseText || ''
    let message = raw || '流式请求失败'
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          error?: { message?: string }
          message?: string
        }
        if (parsed.error?.message) {
          message = parsed.error.message
        } else if (parsed.message) {
          message = parsed.message
        }
      } catch {
        // Use raw text as-is
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

// ----------------------------------------------------------------------------
// Token model list — fetch available models for a given API key
// ----------------------------------------------------------------------------

export async function getTokenModels(token: string): Promise<string[]> {
  const res = await api.get('/v1/models', {
    headers: { Authorization: `Bearer ${token}` },
    skipErrorHandler: true,
    disableDuplicate: true,
  } as Record<string, unknown>)
  const data = res.data?.data
  return Array.isArray(data) ? data.map((m: { id: string }) => m.id) : []
}

// ----------------------------------------------------------------------------
// Image generation
// ----------------------------------------------------------------------------

type ImageGenerationResult = {
  data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
}

type ImageTaskPayload = {
  id?: string
  task_id?: string
  data?: ImageGenerationResult['data']
  output?: {
    task_id?: string
    task_status?: string
    message?: string
    code?: string
    results?: Array<{ url?: string; b64_image?: string; message?: string }>
    choices?: Array<{
      message?: {
        content?: Array<{ type?: string; text?: string; image?: string }>
      }
    }>
  }
  error?: { message?: string }
}

const IMAGE_TASK_POLL_INTERVAL_MS = 2500
const IMAGE_TASK_MAX_POLLS = 80

function extractImageTaskId(body: ImageTaskPayload): string {
  return body.output?.task_id || body.task_id || body.id || ''
}

function extractImagesFromTask(body: ImageTaskPayload): ImageGenerationResult['data'] {
  if (Array.isArray(body.data) && body.data.length > 0) return body.data
  const results = body.output?.results
  if (Array.isArray(results) && results.length > 0) {
    return results
      .map((item) => ({
        url: item.url,
        b64_json: item.b64_image,
        revised_prompt: item.message,
      }))
      .filter((item) => item.url || item.b64_json)
  }
  const choices = body.output?.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const images: ImageGenerationResult['data'] = []
    for (const choice of choices) {
      let revisedPrompt = ''
      for (const part of choice.message?.content ?? []) {
        if (part.text) revisedPrompt = part.text
        if (part.image) {
          if (part.image.startsWith('http')) {
            images.push({ url: part.image, revised_prompt: revisedPrompt })
          } else {
            images.push({ b64_json: part.image, revised_prompt: revisedPrompt })
          }
        }
      }
    }
    return images
  }
  return []
}

function assertImageTaskNotFailed(body: ImageTaskPayload) {
  const status = String(body.output?.task_status || '').toUpperCase()
  if (status === 'FAILED' || status === 'CANCELED') {
    throw new Error(body.output?.message || body.error?.message || 'Image generation task failed')
  }
}

async function fetchImageApiJson(
  path: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: unknown
): Promise<ImageTaskPayload> {
  const res = await fetch(path, {
    method,
    credentials: headers.Authorization ? 'omit' : 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = (await res.json().catch(() => ({}))) as ImageTaskPayload
  if (!res.ok) {
    throw new Error(payload.error?.message || payload.output?.message || `HTTP ${res.status}`)
  }
  return payload
}

async function resolveImageGenerationResponse(
  body: ImageTaskPayload,
  taskPathPrefix: '/dashscope/api/v1/tasks' | '/pg/images/tasks' | '/v1/image-tasks',
  headers?: Record<string, string>
): Promise<ImageGenerationResult> {
  const directImages = extractImagesFromTask(body)
  if (directImages.length > 0) return { data: directImages }

  const taskId = extractImageTaskId(body)
  if (!taskId) return { data: [] }

  if (taskPathPrefix === '/v1/image-tasks') {
    try {
      const taskBody = await fetchImageApiJson(
        `${taskPathPrefix}/${encodeURIComponent(taskId)}/resume-poll?timeout=120`,
        'POST',
        headers ?? {}
      )
      assertImageTaskNotFailed(taskBody)
      const images = extractImagesFromTask(taskBody)
      if (images.length > 0) return { data: images }
    } catch {
      // Fall back to short polling below so older backends still work.
    }
  }

  for (let i = 0; i < IMAGE_TASK_MAX_POLLS; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, IMAGE_TASK_POLL_INTERVAL_MS))
    const taskBody = headers
      ? await fetchImageApiJson(
          `${taskPathPrefix}/${encodeURIComponent(taskId)}`,
          'GET',
          headers
        )
      : ((await api.get(`${taskPathPrefix}/${encodeURIComponent(taskId)}`, {
          skipErrorHandler: true,
          disableDuplicate: true,
        } as Record<string, unknown>)).data as ImageTaskPayload)
    assertImageTaskNotFailed(taskBody)
    const images = extractImagesFromTask(taskBody)
    if (images.length > 0) return { data: images }
  }

  throw new Error('Image generation task timed out')
}

export async function sendTokenImageGeneration(params: {
  token: string
  model: string
  prompt: string
  size?: string
  quality?: string
  n?: number
  style?: string
  group?: string
  images?: string[]
  output_format?: string
  aspect_ratio?: string
  resolution?: string
  ratio?: string
}): Promise<ImageGenerationResult> {
  try {
    const payload = await fetchImageApiJson(
      '/v1/image-tasks/generations',
      'POST',
      { Authorization: `Bearer ${params.token}` },
      {
        model: params.model,
        prompt: params.prompt,
        response_format: 'url',
        ...(params.size && { size: params.size }),
        ...(params.quality && { quality: params.quality }),
        ...(params.n && { n: params.n }),
        ...(params.style && { style: params.style }),
        ...(params.group && { group: params.group }),
        ...(params.images && params.images.length > 0 && { images: params.images }),
        ...(params.output_format && { output_format: params.output_format }),
        ...(params.aspect_ratio && { aspect_ratio: params.aspect_ratio }),
        ...(params.resolution && { resolution: params.resolution }),
        ...(params.ratio && { ratio: params.ratio }),
      }
    )
    return resolveImageGenerationResponse(payload, '/v1/image-tasks', {
      Authorization: `Bearer ${params.token}`,
    })
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string } } }
    const msg = axiosErr?.response?.data?.error?.message || axiosErr?.response?.data?.message || (err instanceof Error ? err.message : '图像生成请求失败')
    throw new Error(msg)
  }
}

// ----------------------------------------------------------------------------
// Cookie-auth API functions (Playground-style, no Bearer token needed)
// ----------------------------------------------------------------------------

export async function getChatUserModels(): Promise<Array<{ label: string; value: string; groups?: string[]; endpoints?: string[] }>> {
  try {
    const res = await api.get('/api/pricing')
    const pricing = res.data as RawPricingResponse
    if (!pricing.success || !Array.isArray(pricing.data)) return []
    return pricing.data.map((m) => ({
      label: m.model_name,
      value: m.model_name,
      groups: m.enable_groups,
      endpoints: m.supported_endpoint_types,
    }))
  } catch {
    return []
  }
}

export async function getChatUserGroups(): Promise<Array<{ label: string; value: string; ratio?: number; desc?: string }>> {
  try {
    const res = await api.get('/api/user/self/groups')
    if (!res.data?.success || !res.data.data) return []
    const groupData = res.data.data as Record<string, { desc: string; ratio: number }>
    return Object.entries(groupData)
      .map(([group, info]) => ({
        label: group,
        value: group,
        ratio: info.ratio,
        desc: info.desc,
      }))
      .sort((a, b) => {
        if (a.value === 'default') return -1
        if (b.value === 'default') return 1
        if (a.value === 'auto') return 1
        if (b.value === 'auto') return -1
        return a.value.localeCompare(b.value)
      })
  } catch {
    return []
  }
}

export async function sendImageGeneration(params: {
  model: string
  prompt: string
  group?: string
  size?: string
  quality?: string
  n?: number
  style?: string
  images?: string[]
  output_format?: string
  aspect_ratio?: string
  resolution?: string
  ratio?: string
}): Promise<ImageGenerationResult> {
  try {
    const res = await api.post(
      '/pg/images/generations',
      {
        model: params.model,
        prompt: params.prompt,
        response_format: 'url',
        ...(params.group && { group: params.group }),
        ...(params.size && { size: params.size }),
        ...(params.quality && { quality: params.quality }),
        ...(params.n && { n: params.n }),
        ...(params.style && { style: params.style }),
        ...(params.images && params.images.length > 0 && { images: params.images }),
        ...(params.output_format && { output_format: params.output_format }),
        ...(params.aspect_ratio && { aspect_ratio: params.aspect_ratio }),
        ...(params.resolution && { resolution: params.resolution }),
        ...(params.ratio && { ratio: params.ratio }),
      },
      {
        headers: getCommonHeaders(),
        skipErrorHandler: true,
      } as Record<string, unknown>
    )
    return resolveImageGenerationResponse(res.data as ImageTaskPayload, '/pg/images/tasks', getCommonHeaders())
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string } } }
    const msg = axiosErr?.response?.data?.error?.message || axiosErr?.response?.data?.message || (err instanceof Error ? err.message : '图像生成请求失败')
    throw new Error(msg)
  }
}
