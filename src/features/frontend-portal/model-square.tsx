import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { getLobeIcon } from '@/lib/lobe-icon'
import { api } from '@/lib/api'
import { getFrontendModels } from './api'
import type { FrontendModel } from './types'

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
  }, [models, searchValue, vendorFilter, groupFilter, statusFilter, perfIndex, topLevelGroupRatio])

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
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">{t('portal.page.models.priceSource')}</span>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            <button
              type="button"
              onClick={() => setPriceMode('site')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                priceMode === 'site' ? 'bg-purple-500/80 text-white shadow' : 'text-white/50 hover:text-white/70'
              }`}
            >
              {t('portal.page.models.sitePrice')}
            </button>
            <button
              type="button"
              onClick={() => setPriceMode('official')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                priceMode === 'official' ? 'bg-purple-500/80 text-white shadow' : 'text-white/50 hover:text-white/70'
              }`}
            >
              {t('portal.page.models.officialPrice')}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t('portal.page.models.searchPlaceholder')}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#1a1a2e] px-3 py-2 text-sm text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('portal.page.models.allVendors')}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.name}>{v.name}</option>
          ))}
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#1a1a2e] px-3 py-2 text-sm text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('portal.page.models.allGroups')}</option>
          {Object.entries(usableGroups).map(([key]) => (
            <option key={key} value={key}>{key} ({topLevelGroupRatio[key] ?? 1}x)</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#1a1a2e] px-3 py-2 text-sm text-white focus:border-purple-400/50 focus:outline-none"
        >
          <option value="all">{t('portal.page.models.allStatus')}</option>
          <option value="available">{t('portal.page.models.available')}</option>
          <option value="unavailable">{t('portal.page.models.unavailable')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-white/50">{t('portal.page.models.loading')}</p>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-xs text-white/40">
                  <th className="min-w-[240px] px-4 py-3 font-medium">{t('portal.page.models.modelInfo')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.vendor')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.group')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.type')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.groupRatio')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.inputPrice')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.outputPrice')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.cacheCreate')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.cacheRead')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('portal.page.models.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { model, group, ratio } = row
                  const status = getRowStatus(row)
                  return (
                    <tr key={`${model.model_name}-${group}`} className="border-b border-white/[0.04] transition hover:bg-white/[0.02]">
                      <td className="min-w-[240px] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0">{getLobeIcon(model.icon || vendorIconMap.get(model.vendor_name ?? ''), 20)}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-white/90 whitespace-nowrap">{model.model_name}</p>
                            {model.description && (
                              <p className="mt-0.5 text-xs text-white/35 line-clamp-1">{model.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="shrink-0">{getLobeIcon(vendorIconMap.get(model.vendor_name ?? ''), 16)}</span>
                          <span className="text-xs text-white/60 whitespace-nowrap">{model.vendor_name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {group ? (
                          <span className="inline-block rounded bg-white/[0.06] px-2 py-0.5 text-xs text-white/60">{group}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          model.quota_type === 1
                            ? 'bg-orange-500/15 text-orange-400'
                            : 'bg-purple-500/15 text-purple-400'
                        }`}>
                          {model.quota_type === 1 ? t('portal.page.models.perRequest') : t('portal.page.models.perToken')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-white/60">
                        {ratio !== 1 ? `${ratio}x` : '1x'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-white/60">
                        {formatPrice(model, 'input', priceMode, ratio)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-white/60">
                        {formatPrice(model, 'output', priceMode, ratio)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-white/60">
                        {formatPrice(model, 'cache_create', priceMode, ratio)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-white/60">
                        {formatPrice(model, 'cache_read', priceMode, ratio)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {status === 'available' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t('portal.page.models.available')}
                          </span>
                        ) : status === 'degraded' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />{t('portal.page.models.degraded')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-white/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-white/30" />—
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-white/40">{t('portal.page.models.noModelsFound')}</p>
          </div>
        )}
      </div>

      {/* Footer info */}
      <p className="text-xs text-white/30">
        {t('portal.page.models.priceNote')}
      </p>
    </div>
  )
}
