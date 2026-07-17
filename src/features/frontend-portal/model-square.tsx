import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, MessageSquare, X, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { getLobeIcon } from '@/lib/lobe-icon'
import { api } from '@/lib/api'
import { getFrontendModels } from './api'
import { parseModelTags } from './model-tags'
import { ModelBadges } from './model-badges'
import { ModelModalityBadge } from './model-modality-badge'
import { ModelModalities } from './model-modalities'
import type { FrontendModel } from './types'
import { Link } from '@tanstack/react-router'
import {
  parseTiersFromExpr,
  splitBillingExprAndRequestRules,
  type ParsedTier,
  type TierCondition,
} from '@/features/pricing/lib/billing-expr'

type PriceMode = 'site' | 'official'

type ModelRow = {
  model: FrontendModel
  group: string
  ratio: number
  parsed: ReturnType<typeof parseModelTags>
}

function formatCurrencyAmount(value: number, symbol: '$' | '¥'): string {
  if (!Number.isFinite(value)) return '-'
  return `${symbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })}`
}

function fixedBillingUnitLabel(model: FrontendModel, t: (key: string) => string): string {
  if (model.billing_unit === 'image') return t('per image')
  if (model.billing_unit === 'second') return t('per second')
  return t('per request')
}

function formatPrice(
  model: FrontendModel,
  type: 'input' | 'output' | 'cache_create' | 'cache_read',
  mode: PriceMode,
  ratio: number,
  t: (key: string) => string,
  symbol: '$' | '¥'
): string {
  if (model.quota_type === 1) {
    if (type === 'input') {
      const modelPrice = mode === 'official'
        ? Number(model.official_model_price ?? model.model_price ?? 0)
        : Number(model.model_price ?? 0)
      const r = mode === 'site' ? ratio : 1
      return `${formatCurrencyAmount(modelPrice * r, symbol)} / ${fixedBillingUnitLabel(model, t)}`
    }
    return '-'
  }

  const modelRatio = mode === 'official'
    ? Number(model.official_model_ratio ?? model.model_ratio ?? 0)
    : Number(model.model_ratio ?? 0)
  const r = mode === 'site' ? ratio : 1
  const base = modelRatio * 2 * r

  if (type === 'input') {
    return formatCurrencyAmount(base, symbol)
  }
  if (type === 'output') {
    const multiplier = Number(model.completion_ratio || 1)
    return formatCurrencyAmount(base * multiplier, symbol)
  }
  if (type === 'cache_create') {
    const createRatio = model.create_cache_ratio
    if (createRatio == null) return '-'
    return formatCurrencyAmount(base * Number(createRatio), symbol)
  }
  if (type === 'cache_read') {
    const cacheRatio = model.cache_ratio
    if (cacheRatio == null) return '-'
    return formatCurrencyAmount(base * Number(cacheRatio), symbol)
  }
  return '-'
}

function formatFixedPrice(model: FrontendModel, mode: PriceMode, ratio: number, symbol: '$' | '¥'): string {
  const modelPrice = mode === 'official'
    ? Number(model.official_model_price ?? model.model_price ?? 0)
    : Number(model.model_price ?? 0)
  const r = mode === 'site' ? ratio : 1
  return formatCurrencyAmount(modelPrice * r, symbol)
}

function isFixedUnitModel(model: FrontendModel): boolean {
  return model.quota_type === 1 || model.billing_unit === 'image' || model.billing_unit === 'second'
}

type TierPriceField = {
  field: 'inputPrice' | 'outputPrice' | 'cacheReadPrice' | 'cacheCreatePrice'
  labelKey: string
  tone?: 'green' | 'amber'
}

const TIER_PRICE_FIELDS: TierPriceField[] = [
  { field: 'inputPrice', labelKey: 'Input' },
  { field: 'outputPrice', labelKey: 'Output' },
  { field: 'cacheReadPrice', labelKey: 'Cache Read', tone: 'green' },
  { field: 'cacheCreatePrice', labelKey: 'Cache Write', tone: 'amber' },
]

function getDynamicTiers(model: FrontendModel): ParsedTier[] {
  if (model.billing_mode !== 'tiered_expr' || !model.billing_expr) return []
  const { billingExpr } = splitBillingExprAndRequestRules(model.billing_expr)
  return parseTiersFromExpr(billingExpr)
}

type CardPriceColumn = {
  key: string
  labelKey: string
  official: string
  site: string
  tone?: 'green' | 'amber'
}

function cardPriceColumns(
  model: FrontendModel,
  tier: ParsedTier | undefined,
  ratio: number,
  t: (key: string) => string
): CardPriceColumn[] {
  if (isFixedUnitModel(model)) {
    return [
      {
        key: 'price',
        labelKey: 'Price',
        official: `${formatFixedPrice(model, 'official', ratio, '$')}/次`,
        site: `${formatFixedPrice(model, 'site', ratio, '¥')}/次`,
      },
    ]
  }

  if (tier) {
    return TIER_PRICE_FIELDS.flatMap((item) => {
      const value = Number(tier[item.field] ?? 0)
      if (!Number.isFinite(value) || value <= 0) return []
      return [{
        key: item.field,
        labelKey: item.labelKey,
        official: `${formatCurrencyAmount(value, '$')}/M`,
        site: `${formatCurrencyAmount(value * ratio, '¥')}/M`,
        tone: item.tone,
      }]
    })
  }

  const fields: Array<{
    key: 'input' | 'output' | 'cache_read' | 'cache_create'
    labelKey: string
    tone?: 'green' | 'amber'
  }> = [
    { key: 'input', labelKey: 'Input' },
    { key: 'output', labelKey: 'Output' },
    { key: 'cache_read', labelKey: 'Cache Read', tone: 'green' },
    { key: 'cache_create', labelKey: 'Cache Write', tone: 'amber' },
  ]

  return fields.flatMap((field) => {
    const official = formatPrice(model, field.key, 'official', ratio, t, '$')
    const site = formatPrice(model, field.key, 'site', ratio, t, '¥')
    if (official === '-' && site === '-') return []
    return [{
      key: field.key,
      labelKey: field.labelKey,
      official: official === '-' ? '-' : `${official}/M`,
      site: site === '-' ? '-' : `${site}/M`,
      tone: field.tone,
    }]
  })
}

function cardPriceGridColumns(count: number): string {
  return `minmax(72px, 0.9fr) repeat(${Math.max(count, 1)}, minmax(58px, 1fr))`
}

function tierConditionLabel(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value >= 1_000_000) {
    const n = value / 1_000_000
    return `${Number.isInteger(n) ? n : n.toFixed(1)}M`
  }
  if (value >= 1000) {
    const n = value / 1000
    return `${Number.isInteger(n) ? n : n.toFixed(1)}K`
  }
  return String(value)
}

function tierConditionsSummary(
  conditions: TierCondition[],
  t: (key: string) => string
): string {
  if (!conditions.length) return t('Default')
  const varLabel: Record<TierCondition['var'], string> = {
    p: t('Input'),
    c: t('Output'),
    len: t('Length'),
  }
  const opLabel: Record<TierCondition['op'], string> = {
    '<': '<',
    '<=': '≤',
    '>': '>',
    '>=': '≥',
  }
  return conditions
    .map((c) => `${varLabel[c.var]} ${opLabel[c.op] ?? c.op} ${tierConditionLabel(c.value)}`)
    .join(' && ')
}

function tierGridColumns(count: number): string {
  const priceCols = count > 0 ? `repeat(${count}, 90px)` : '90px'
  return `84px 126px ${priceCols}`
}

function rowKey(row: Pick<ModelRow, 'model' | 'group'>): string {
  return `${row.model.model_name}-${row.group}`
}

const TAG_I18N_KEY: Record<string, string> = {
  '文本推理': 'portal.tag.text',
  text: 'portal.tag.text',
  reasoning: 'portal.tag.text',
  '推理': 'portal.tag.text',
  '图像': 'portal.tag.image',
  image: 'portal.tag.image',
  '音频': 'portal.tag.voice',
  voice: 'portal.tag.voice',
  audio: 'portal.tag.voice',
  '视频': 'portal.tag.video',
  video: 'portal.tag.video',
  '视觉': 'portal.tag.visual',
  visual: 'portal.tag.visual',
  vision: 'portal.tag.visual',
  tools: 'portal.tag.tools',
  '工具': 'portal.tag.tools',
  files: 'portal.tag.files',
  file: 'portal.tag.files',
  '文件': 'portal.tag.files',
}

function tagLabel(tag: string, t: (key: string) => string): string {
  const key = TAG_I18N_KEY[tag] ?? TAG_I18N_KEY[tag.trim().toLowerCase()]
  return key ? t(key) : tag
}

export function ModelSquare() {
  const { t, i18n } = useTranslation()
  const uiLang = i18n.language?.startsWith('ru') ? 'ru' : i18n.language?.startsWith('zh') ? 'zh' : 'en'
  const pickDesc = (text?: string) => {
    if (!text) return ''
    const s = text.trim()
    if (s.startsWith('{') && s.endsWith('}')) {
      try {
        const value = JSON.parse(s) as Record<string, string>
        if (value && typeof value === 'object') {
          return value[uiLang] || value.en || value.zh || Object.values(value)[0] || ''
        }
      } catch {
        // Keep plain text descriptions unchanged when the value is not valid JSON.
      }
    }
    return text
  }
  const [searchValue, setSearchValue] = useState('')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [tierSelection, setTierSelection] = useState<Record<string, string>>({})
  const [selectedModel, setSelectedModel] = useState<ModelRow | null>(null)

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
      for (const tag of parseModelTags(m.tags).visibleTags) tagSet.add(tag)
    }
    return Array.from(tagSet).sort()
  }, [models])

  const rows = useMemo(() => {
    let filtered = models
    if (searchValue) {
      const q = searchValue.toLowerCase()
      filtered = filtered.filter((m) =>
        m.model_name.toLowerCase().includes(q) ||
        (pickDesc(m.description) ?? '').toLowerCase().includes(q) ||
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
        return parseModelTags(m.tags).visibleTags.includes(tagFilter)
      })
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((m) => {
        const perf = perfIndex.get(m.model_name)
        if (statusFilter === 'available') return !perf || perf.success_rate > 0.95
        return perf !== undefined && perf.success_rate <= 0.95
      })
    }

    const sorted = [...filtered].sort((a, b) => {
      const oa = parseModelTags(a.tags).squareOrder
      const ob = parseModelTags(b.tags).squareOrder
      return oa - ob || a.model_name.localeCompare(b.model_name)
    })

    const result: ModelRow[] = []
    for (const model of sorted) {
      const parsed = parseModelTags(model.tags)
      const groups = groupFilter !== 'all'
        ? [groupFilter]
        : (model.enable_groups ?? [])

      if (groups.length === 0) {
        result.push({ model, group: '', ratio: 1, parsed })
      } else {
        for (const g of groups) {
          const ratio = topLevelGroupRatio[g] ?? model.group_ratio?.[g] ?? 1
          result.push({ model, group: g, ratio, parsed })
        }
      }
    }
    return result
  }, [models, searchValue, vendorFilter, groupFilter, tagFilter, statusFilter, perfIndex, topLevelGroupRatio, uiLang])

  const selectedKey = selectedModel ? rowKey(selectedModel) : ''
  const selectedDynamicTiers = selectedModel ? getDynamicTiers(selectedModel.model) : []
  const selectedActiveTier = selectedDynamicTiers.find((tier) => tier.label === tierSelection[selectedKey]) ?? selectedDynamicTiers[0]
  const selectedTierFields = TIER_PRICE_FIELDS.filter((field) =>
    selectedDynamicTiers.some((tier) => {
      const value = Number(tier[field.field] ?? 0)
      return Number.isFinite(value) && value > 0
    })
  )

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
            const { model, ratio, parsed } = row
            const key = rowKey(row)
            const dynamicTiers = getDynamicTiers(model)
            const activeTier =
              dynamicTiers.find((tier) => tier.label === tierSelection[key]) ??
              dynamicTiers[0]
            const priceColumns = cardPriceColumns(model, activeTier, ratio, t)

            return (
              <div
                key={key}
                onClick={() => setSelectedModel(row)}
                className="group relative cursor-pointer rounded-xl border border-white/8 bg-white/[0.02] p-5 transition hover:border-indigo-400/30 hover:shadow-sm"
              >
                <ModelBadges badges={parsed.badges} cornerClass="rounded-tr-xl" />
                {/* Row 1: Icon + Name + Modality badge + Copy */}
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04]">
                    {getLobeIcon(model.icon || vendorIconMap.get(model.vendor_name ?? ''), 18)}
                  </div>
                  <h3 className="text-base font-bold text-white line-clamp-1">{model.model_name}</h3>
                  <ModelModalities input={parsed.inputModalities} output={parsed.outputModalities} />
                  <ModelModalityBadge modelName={model.model_name} tags={model.tags} />
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
                  {pickDesc(model.description) || t('No description available')}
                </p>

                {dynamicTiers.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {dynamicTiers.map((tier) => {
                      const active = activeTier?.label === tier.label
                      return (
                        <button
                          key={tier.label}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTierSelection((prev) => ({ ...prev, [key]: tier.label }))
                          }}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                            active
                              ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100'
                              : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/75'
                          }`}
                          title={tierConditionsSummary(tier.conditions, t)}
                        >
                          {tier.label || t('Default')}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Row 3: Price table */}
                <div className="mx-2 text-xs">
                  <div className="space-y-1">
                    <div
                      className="grid items-center text-center font-semibold text-white/65"
                      style={{ gridTemplateColumns: cardPriceGridColumns(priceColumns.length) }}
                    >
                      <div className="px-1.5 py-0.5">{t('Price')}</div>
                      {priceColumns.map((column) => (
                        <div key={`head-${column.key}`} className="px-1.5 py-0.5 leading-tight">
                          {t(column.labelKey)}
                        </div>
                      ))}
                    </div>
                    {[
                      { key: 'official', label: t('portal.page.models.officialPrice'), valueKey: 'official' as const },
                      { key: 'site', label: t('portal.page.models.sitePrice'), valueKey: 'site' as const },
                    ].map((row) => (
                      <div
                        key={row.key}
                        className="grid items-center text-center text-white/90"
                        style={{ gridTemplateColumns: cardPriceGridColumns(priceColumns.length) }}
                      >
                        <div className="px-1.5 py-0.5 font-semibold">{row.label}</div>
                        {priceColumns.map((column) => {
                          const cls =
                            column.tone === 'green'
                              ? 'text-emerald-300'
                              : column.tone === 'amber'
                                ? 'text-amber-300'
                                : 'text-white'
                          return (
                            <div key={`${row.key}-${column.key}`} className={`px-1.5 py-0.5 font-medium ${cls}`}>
                              {column[row.valueKey]}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Row 4: Tags */}
                {parsed.visibleTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {parsed.visibleTags.map((tg) => (
                      <span key={tg} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/60">
                        {tagLabel(tg, t)}
                      </span>
                    ))}
                  </div>
                )}
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
            className="relative h-full w-full max-w-[820px] overflow-y-auto border-l border-white/10 bg-[#0f0f1a] p-6 shadow-2xl"
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
                {pickDesc(selectedModel.model.description) || t('No model description available')}
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

              {selectedDynamicTiers.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-medium text-white/70">
                      {selectedModel.group || t('Default')}
                    </span>
                    <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-purple-300">
                      {t('Dynamic Pricing')}
                    </span>
                    <span className="text-white/35">
                      {t('portal.page.models.sitePrice')} · {t('Per 1M tokens')}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="w-max min-w-[600px] overflow-hidden rounded-lg border border-white/10">
                      <div
                        className="grid gap-1.5 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/40"
                        style={{
                          gridTemplateColumns: tierGridColumns(selectedTierFields.length),
                        }}
                      >
                        <div>{t('Tier')}</div>
                        <div>{t('Conditions')}</div>
                        {selectedTierFields.map((field) => (
                          <div key={field.field} className="text-right">
                            {t(field.labelKey)}
                          </div>
                        ))}
                      </div>
                      <div className="divide-y divide-white/8">
                        {selectedDynamicTiers.map((tier) => {
                          const active = selectedActiveTier?.label === tier.label
                          return (
                            <div
                              key={`detail-tier-row-${tier.label}`}
                              className={`grid gap-1.5 px-3 py-3 ${active ? 'bg-indigo-500/10' : 'bg-white/[0.01]'}`}
                              style={{
                                gridTemplateColumns: tierGridColumns(selectedTierFields.length),
                              }}
                            >
                              <div className="pt-0.5">
                                <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-200">
                                  {tier.label || t('Default')}
                                </span>
                              </div>
                              <div className="text-xs leading-5 text-white/50">
                                {tierConditionsSummary(tier.conditions, t)}
                              </div>
                              {selectedTierFields.map((field) => {
                                const value = Number(tier[field.field] ?? 0)
                                const cls =
                                  field.tone === 'green'
                                    ? 'text-emerald-300'
                                    : field.tone === 'amber'
                                      ? 'text-amber-300'
                                      : 'text-white'
                                return (
                                  <div key={field.field} className={`text-right font-mono text-xs font-semibold ${cls}`}>
                                    {value > 0 ? formatCurrencyAmount(value * selectedModel.ratio, '¥') : '-'}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
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
                        <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
                          {isFixedUnitModel(selectedModel.model) ? fixedBillingUnitLabel(selectedModel.model, t) : t('Token-based')}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <div className="space-y-1">
                          {isFixedUnitModel(selectedModel.model) ? (
                            <div className="text-xs">
                              <span className="font-semibold text-white">{formatFixedPrice(selectedModel.model, 'site', selectedModel.ratio, '¥')}</span>
                              <span className="text-white/40"> / {fixedBillingUnitLabel(selectedModel.model, t)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="text-xs">
                                <span className="font-semibold text-white">{t('Input')} {formatPrice(selectedModel.model, 'input', 'site', selectedModel.ratio, t, '¥')}</span>
                                <span className="text-white/40"> / {t('Per 1M tokens')}</span>
                              </div>
                              <div className="text-xs">
                                <span className="font-semibold text-white">{t('Output')} {formatPrice(selectedModel.model, 'output', 'site', selectedModel.ratio, t, '¥')}</span>
                                <span className="text-white/40"> / {t('Per 1M tokens')}</span>
                              </div>
                              {formatPrice(selectedModel.model, 'cache_read', 'site', selectedModel.ratio, t, '¥') !== '-' && (
                                <div className="text-xs">
                                  <span className="font-semibold text-green-600">{t('Cache Read')} {formatPrice(selectedModel.model, 'cache_read', 'site', selectedModel.ratio, t, '¥')}</span>
                                  <span className="text-white/40"> / {t('Per 1M tokens')}</span>
                                </div>
                              )}
                              {formatPrice(selectedModel.model, 'cache_create', 'site', selectedModel.ratio, t, '¥') !== '-' && (
                                <div className="text-xs">
                                  <span className="font-semibold text-amber-600">{t('Cache Create')} {formatPrice(selectedModel.model, 'cache_create', 'site', selectedModel.ratio, t, '¥')}</span>
                                  <span className="text-white/40"> / {t('Per 1M tokens')}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
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
