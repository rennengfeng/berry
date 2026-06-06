import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, ExternalLink, MessageSquare, BookOpen, X, Copy, Type, Image } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { getLobeIcon } from '@/lib/lobe-icon'
import { api } from '@/lib/api'
import { getFrontendModels } from './api'
import type { FrontendModel } from './types'
import { Link } from '@tanstack/react-router'

type PriceMode = 'site' | 'official'

type ModelRow = {
  model: FrontendModel
  group: string
  ratio: number
}

function formatPrice(
  model: FrontendModel,
  type: 'input' | 'output' | 'cache_create' | 'cache_read',
  mode: PriceMode,
  ratio: number
): string {
  if (model.quota_type === 1) {
    if (type === 'input') {
      const modelPrice = mode === 'official'
        ? Number(model.official_model_price ?? model.model_price ?? 0)
        : Number(model.model_price ?? 0)
      const r = mode === 'site' ? ratio : 1
      return `${formatCurrencyFromUSD(modelPrice * r, { digitsLarge: 4, digitsSmall: 4, abbreviate: false })} / 次`
    }
    return '-'
  }

  const modelRatio = mode === 'official'
    ? Number(model.official_model_ratio ?? model.model_ratio ?? 0)
    : Number(model.model_ratio ?? 0)
  const r = mode === 'site' ? ratio : 1
  const base = modelRatio * 2 * r

  if (type === 'input') {
    return formatCurrencyFromUSD(base, { digitsLarge: 4, digitsSmall: 4, abbreviate: false })
  }
  if (type === 'output') {
    const multiplier = Number(model.completion_ratio || 1)
    return formatCurrencyFromUSD(base * multiplier, { digitsLarge: 4, digitsSmall: 4, abbreviate: false })
  }
  if (type === 'cache_create') {
    const createRatio = model.create_cache_ratio
    if (createRatio == null) return '-'
    return formatCurrencyFromUSD(base * Number(createRatio), { digitsLarge: 4, digitsSmall: 4, abbreviate: false })
  }
  if (type === 'cache_read') {
    const cacheRatio = model.cache_ratio
    if (cacheRatio == null) return '-'
    return formatCurrencyFromUSD(base * Number(cacheRatio), { digitsLarge: 4, digitsSmall: 4, abbreviate: false })
  }
  return '-'
}

export function ModelSquare() {
  const { t } = useTranslation()
  const [priceMode, setPriceMode] = useState<PriceMode>('site')
  const [searchValue, setSearchValue] = useState('')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [selectedModel, setSelectedModel] = useState<{ model: FrontendModel; group: string; ratio: number } | null>(null)

  const { data: payload, isLoading } = useQuery({
    queryKey: ['portal-frontend-models'],
    queryFn: getFrontendModels,
    staleTime: 60_000,
  })

  const { data: perfData } = useQuery({
    queryKey: ['portal-perf-metrics-summary'],
    queryFn: async () => {
      const res = await api.get('/api/perf-metrics/summary')
      return res.data?.data?.models as Array<{
        model_name: string
        success_rate: number
        avg_latency_ms: number
      }> | undefined
    },
    staleTime: 60_000,
  })

  const models = payload?.models ?? []
  const topLevelGroupRatio = payload?.group_ratio ?? {}
  const usableGroups = payload?.usable_group ?? {}

  const vendors = useMemo(() => {
    const all = payload?.vendors ?? []
    const vendorNamesWithModels = new Set(models.map((m) => m.vendor_name).filter(Boolean))
    return all.filter((v) => vendorNamesWithModels.has(v.name))
  }, [payload?.vendors, models])

  const vendorIconMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of payload?.vendors ?? []) {
      if (v.icon) map.set(v.name, v.icon)
    }
    return map
  }, [payload?.vendors])

  const perfIndex = useMemo(() => {
    const map = new Map<string, { success_rate: number; avg_latency_ms: number }>()
    for (const m of perfData ?? []) {
      const rate = m.success_rate > 1 ? m.success_rate / 100 : m.success_rate
      map.set(m.model_name, { success_rate: rate, avg_latency_ms: m.avg_latency_ms })
    }
    return map
  }, [perfData])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const m of models) {
      if (m.tags) {
        m.tags.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => tagSet.add(t))
      }
    }
    return Array.from(tagSet).sort()
  }, [models])

  const rows = useMemo(() => {
    let filtered = models
    if (searchValue) {
      const q = searchValue.toLowerCase()
      filtered = filtered.filter((m) =>
        m.model_name.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q) ||
        (m.vendor_name ?? '').toLowerCase().includes(q)
      )
    }
    if (vendorFilter !== 'all') {
      filtered = filtered.filter((m) => m.vendor_name === vendorFilter)
    }
    if (groupFilter !== 'all') {
      filtered = filtered.filter((m) => (m.enable_groups ?? []).includes(groupFilter))
    }
    if (tagFilter !== 'all') {
      filtered = filtered.filter((m) => {
        const tags = m.tags ? m.tags.split(',').map((t) => t.trim()) : []
        return tags.includes(tagFilter)
      })
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((m) => {
        const perf = perfIndex.get(m.model_name)
        if (statusFilter === 'available') return !perf || perf.success_rate > 0.95
        return perf !== undefined && perf.success_rate <= 0.95
      })
    }

    const result: ModelRow[] = []
    for (const model of filtered) {
      const groups = groupFilter !== 'all'
        ? [groupFilter]
        : (model.enable_groups ?? [])

      if (groups.length === 0) {
        result.push({ model, group: '', ratio: 1 })
      } else {
        for (const g of groups) {
          const ratio = topLevelGroupRatio[g] ?? model.group_ratio?.[g] ?? 1
          result.push({ model, group: g, ratio })
        }
      }
    }
    return result
  }, [models, searchValue, vendorFilter, groupFilter, tagFilter, statusFilter, perfIndex, topLevelGroupRatio])

  const getRowStatus = (row: ModelRow): 'available' | 'degraded' | 'unknown' => {
    const monitors = row.model.monitors ?? []
    if (monitors.length === 0) {
      const perf = perfIndex.get(row.model.model_name)
      if (!perf) return 'available'
      return perf.success_rate > 0.95 ? 'available' : 'degraded'
    }
    if (row.group) {
      const match = monitors.find((m) => m.group === row.group)
      if (!match) return 'unknown'
      return match.status === 1 ? 'available' : 'degraded'
    }
    if (monitors.some((m) => m.status === 0)) return 'degraded'
    return 'available'
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('portal.page.models.title')}</h1>
          <p className="mt-1 text-sm text-white/40">{t('portal.page.models.subtitle')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t('portal.page.models.searchPlaceholder')}
            className="w-full rounded-lg border border-white/8 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-purple-400/50 focus:outline-none"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="rounded-lg border border-white/8 bg-[#1a1a2e] px-2.5 py-2 text-xs text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('portal.page.models.allVendors')}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.name}>{v.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/8 bg-[#1a1a2e] px-2.5 py-2 text-xs text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('portal.page.models.allStatus')}</option>
          <option value="available">{t('portal.page.models.available')}</option>
          <option value="unavailable">{t('portal.page.models.unavailable')}</option>
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-lg border border-white/8 bg-[#1a1a2e] px-2.5 py-2 text-xs text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('All Groups')}</option>
          {Object.keys(usableGroups).map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-lg border border-white/8 bg-[#1a1a2e] px-2.5 py-2 text-xs text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('All Tags')}</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>

      {/* Card Grid */}
      {isLoading ? (
        <div className="py-12 text-center">
          <p className="text-sm text-white/50">{t('portal.page.models.loading')}</p>
        </div>
      ) : rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const { model, group, ratio } = row
            const status = getRowStatus(row)

            // Parse tags from model.tags string
            const rawTags = model.tags ? model.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
            const tagColors: Record<string, string> = {
              '对话': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
              'chat': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
              'tools': 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
              'moe': 'bg-pink-500/10 text-pink-400 border border-pink-500/20',
              'vision': 'bg-green-500/10 text-green-400 border border-green-500/20',
              '视觉': 'bg-green-500/10 text-green-400 border border-green-500/20',
              'prefix': 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
              'fim': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
              '推理': 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
              '推理模型': 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
              '生图': 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
            }

            return (
              <div
                key={`${model.model_name}-${group}`}
                onClick={() => setSelectedModel(row)}
                className="group cursor-pointer rounded-xl border border-white/8 bg-white/[0.02] p-5 transition hover:border-indigo-400/30 hover:shadow-sm"
              >
                {/* Row 1: Icon + Name + Modality badge + Copy */}
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04]">
                    {getLobeIcon(model.icon || vendorIconMap.get(model.vendor_name ?? ''), 18)}
                  </div>
                  <h3 className="text-base font-bold text-white line-clamp-1">{model.model_name}</h3>
                  {/* Modality badge - small icon with shadow like OpenRouter */}
                  {(() => {
                    const name = model.model_name.toLowerCase()
                    const tags = model.tags?.toLowerCase() ?? ''
                    const isImage = name.includes('image') || name.includes('dall-e') || name.includes('midjourney') || name.includes('stable-diffusion') || name.includes('flux') || tags.includes('生图') || name.includes('imagen') || name.includes('veo') || name.includes('generate')
                    const isVision = name.includes('vision') || tags.includes('视觉') || tags.includes('vision')
                    const isAudio = name.includes('tts') || name.includes('whisper') || name.includes('transcribe') || name.includes('audio') || tags.includes('语音')
                    if (isImage) {
                      return (
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-pink-400 to-rose-500 shadow-sm shadow-pink-200" title="Image">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                        </span>
                      )
                    }
                    if (isAudio) {
                      return (
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-200" title="Audio">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                        </span>
                      )
                    }
                    if (isVision) {
                      return (
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm shadow-emerald-200" title="Vision">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                        </span>
                      )
                    }
                    return (
                      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-indigo-400 to-violet-500 shadow-sm shadow-purple-500/20" title="Text">
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>
                      </span>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(model.model_name)
                      toast.success(t('Copied'))
                    }}
                    className="shrink-0 rounded p-1 text-white/30 opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.06] hover:text-white/50"
                    title={t('Copy model name')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Row 2: Description */}
                <p className="mb-3 text-xs leading-relaxed text-white/50 line-clamp-2">
                  {model.description || t('No description available')}
                </p>

                {/* Row 3: Provider + Pricing (single line, OpenRouter style) */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                  <span>by <span className="text-white/60">{model.vendor_name || 'Unknown'}</span></span>
                  <span className="text-gray-200">|</span>
                  <span>{formatPrice(model, 'input', 'official', ratio)} {t('input')}</span>
                  <span className="text-gray-200">|</span>
                  <span>{formatPrice(model, 'output', 'official', ratio)} {t('output')}</span>
                  {formatPrice(model, 'cache_read', 'official', ratio) !== '-' && (
                    <>
                      <span className="text-gray-200">|</span>
                      <span>{formatPrice(model, 'cache_read', 'official', ratio)} {t('cache read')}</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/8">
          <p className="text-sm text-white/40">{t('portal.page.models.noModelsFound')}</p>
        </div>
      )}

      {/* Model Detail — Side Panel (newapi style) */}
      {selectedModel && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedModel(null)}>
          <div className="flex-1 bg-black/30" />
          <div
            className="relative h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#0f0f1a] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedModel(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-white/40 transition hover:bg-white/[0.06] hover:text-white/60"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
                {getLobeIcon(selectedModel.model.icon || vendorIconMap.get(selectedModel.model.vendor_name ?? ''), 32)}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">{selectedModel.model.model_name}</h2>
                <p className="mt-1 text-sm text-white/50">{selectedModel.model.vendor_name}</p>
              </div>
            </div>

            {/* Basic Info Section */}
            <div className="mb-6 rounded-lg border border-white/8 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600">ℹ</span>
                <h3 className="text-sm font-semibold text-white">{t('Basic Info')}</h3>
              </div>
              <p className="text-sm text-white/50">
                {selectedModel.model.description || t('No model description available')}
              </p>
            </div>

            {/* API Endpoint Section */}
            <div className="mb-6 rounded-lg border border-white/8 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-50 text-green-600">⚡</span>
                <h3 className="text-sm font-semibold text-white">{t('API Endpoint')}</h3>
              </div>
              <p className="mb-3 text-xs text-white/40">{t('Supported endpoint types for this model')}</p>
              {(selectedModel.model.supported_endpoint_types ?? ['openai: /v1/chat/completions']).map((ep, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span className="text-white/70">{typeof ep === 'string' ? ep : `openai: /v1/chat/completions`}</span>
                  </div>
                  <span className="text-xs text-white/40">POST</span>
                </div>
              ))}
            </div>

            {/* Pricing Section */}
            <div className="mb-6 rounded-lg border border-white/8 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-50 text-orange-600">💰</span>
                <h3 className="text-sm font-semibold text-white">{t('Pricing')}</h3>
              </div>
              <p className="mb-3 text-xs text-white/40">{t('Price per group')}</p>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs text-white/40">
                    <th className="pb-2 text-left font-medium">{t('Group')}</th>
                    <th className="pb-2 text-left font-medium">{t('Billing Type')}</th>
                    <th className="pb-2 text-right font-medium">{t('Price')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50">
                    <td className="py-2">
                      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-white/60">{selectedModel.group}</span>
                    </td>
                    <td className="py-2">
                      <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">{t('Token-based')}</span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="space-y-1">
                        <div className="text-xs">
                          <span className="font-semibold text-white">{t('Input')} {formatPrice(selectedModel.model, 'input', priceMode, selectedModel.ratio)}</span>
                          <span className="text-white/40"> / 1M Tokens</span>
                        </div>
                        <div className="text-xs">
                          <span className="font-semibold text-white">{t('Output')} {formatPrice(selectedModel.model, 'output', priceMode, selectedModel.ratio)}</span>
                          <span className="text-white/40"> / 1M Tokens</span>
                        </div>
                        {formatPrice(selectedModel.model, 'cache_read', priceMode, selectedModel.ratio) !== '-' && (
                          <div className="text-xs">
                            <span className="font-semibold text-green-600">{t('Cache Read')} {formatPrice(selectedModel.model, 'cache_read', priceMode, selectedModel.ratio)}</span>
                            <span className="text-white/40"> / 1M Tokens</span>
                          </div>
                        )}
                        {formatPrice(selectedModel.model, 'cache_create', priceMode, selectedModel.ratio) !== '-' && (
                          <div className="text-xs">
                            <span className="font-semibold text-amber-600">{t('Cache Create')} {formatPrice(selectedModel.model, 'cache_create', priceMode, selectedModel.ratio)}</span>
                            <span className="text-white/40"> / 1M Tokens</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                to="/portal/chat"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                <MessageSquare className="h-4 w-4" />
                {t('Online Experience')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
