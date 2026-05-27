import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
import { Search, RotateCcw, Activity, Zap, Clock, AlertTriangle, Download, RefreshCw, ChevronRight } from 'lucide-react'
import dayjs from 'dayjs'

type TimeGranularity = 'hour' | 'day' | 'week'

type LogItem = {
  id: number
  created_at: number
  token_name?: string
  model_name?: string
  quota?: number
  prompt_tokens?: number
  completion_tokens?: number
  channel?: number
  group?: string
  use_time?: number
  request_time?: number
  type?: number
  is_stream?: boolean
  content?: string
  ip?: string
  other?: string
  request_id?: string
}

function parseOther(other?: string): { frt?: number; cache_tokens?: number; cache_creation_tokens?: number } | null {
  if (!other) return null
  try {
    const data = JSON.parse(other)
    return {
      frt: data.frt ?? data.first_response_time,
      cache_tokens: data.cache_tokens ?? data.cached_tokens,
      cache_creation_tokens: data.cache_creation_tokens,
    }
  } catch {
    return null
  }
}

export function PortalLogs() {
  const { t } = useTranslation()
  const [startDate] = useState(() => dayjs().subtract(7, 'day').startOf('day'))
  const [endDate] = useState(() => dayjs().endOf('day'))
  const [granularity, setGranularity] = useState<TimeGranularity>('day')

  const [keyFilter, setKeyFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ipFilter, setIpFilter] = useState('')
  const [minTokens, setMinTokens] = useState('')
  const [maxTokens, setMaxTokens] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const range = (() => {
    const end = endDate.unix()
    if (granularity === 'hour') {
      return { start: dayjs().subtract(1, 'day').startOf('day').unix(), end }
    }
    if (granularity === 'week') {
      return { start: dayjs().subtract(29, 'day').startOf('day').unix(), end }
    }
    return { start: startDate.unix(), end }
  })()

  const { data: statData } = useQuery({
    queryKey: ['portal-log-stat-range', range.start, range.end],
    queryFn: async () => {
      const res = await api.get('/api/log/self/stat', {
        params: { start_timestamp: range.start, end_timestamp: range.end },
      })
      return res.data?.data as {
        request_count?: number
        total_token?: number
        quota?: number
        rpm?: number
        tpm?: number
      } | undefined
    },
    staleTime: 30_000,
  })

  const { data: chartRawData } = useQuery({
    queryKey: ['portal-log-chart-data', range.start, range.end, granularity],
    queryFn: async () => {
      const res = await api.get('/api/data/self', {
        params: {
          start_timestamp: range.start,
          end_timestamp: range.end,
          default_time: granularity,
        },
      })
      return res.data?.data as Array<{
        date?: string
        request_count?: number
        count?: number
        quota?: number
        token?: number
        token_used?: number
      }> | undefined
    },
    staleTime: 30_000,
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portal-logs', range.start, range.end, keyFilter, modelFilter, statusFilter, page, pageSize],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p: page,
        size: pageSize,
        start_timestamp: range.start,
        end_timestamp: range.end,
      }
      if (keyFilter) params.token_name = keyFilter
      if (modelFilter) params.model_name = modelFilter
      if (statusFilter && statusFilter !== 'all') params.type = statusFilter === 'success' ? 0 : 1
      const res = await api.get('/api/log/self', { params })
      return res.data?.data as { items?: LogItem[]; total?: number } | undefined
    },
    staleTime: 15_000,
  })

  const logs = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const reset = () => {
    setKeyFilter('')
    setModelFilter('')
    setStatusFilter('')
    setIpFilter('')
    setMinTokens('')
    setMaxTokens('')
    setPage(1)
  }

  const totalRequests = statData?.rpm ?? statData?.request_count ?? 0
  const totalTokens = statData?.tpm ?? statData?.total_token ?? 0
  const avgTime = 0

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const statsCards = [
    { icon: Activity, label: t('portal.page.logs.todayRequests'), value: formatNum(totalRequests), color: 'text-blue-400', dotColor: 'bg-blue-400' },
    { icon: Zap, label: t('portal.page.logs.todayTokens'), value: formatNum(totalTokens), color: 'text-purple-400', dotColor: 'bg-purple-400' },
    { icon: Clock, label: t('portal.page.logs.avgResponseTime'), value: avgTime > 0 ? `${avgTime}ms` : '—', color: 'text-cyan-400', dotColor: 'bg-cyan-400' },
    { icon: AlertTriangle, label: t('portal.page.logs.errorRate'), value: '—', color: 'text-orange-400', dotColor: 'bg-orange-400' },
  ]

  const chartData = (() => {
    if (!chartRawData || chartRawData.length === 0) {
      const result = []
      const now = dayjs()
      if (granularity === 'hour') {
        for (let i = 23; i >= 0; i--) {
          result.push({ date: now.subtract(i, 'hour').format('HH:mm'), requests: 0, errors: 0 })
        }
      } else {
        const days = granularity === 'week' ? 4 : 7
        for (let i = days - 1; i >= 0; i--) {
          result.push({ date: now.subtract(i, granularity === 'week' ? 'week' : 'day').format('MM-DD'), requests: 0, errors: 0 })
        }
      }
      return result
    }
    const grouped: Record<string, { requests: number; errors: number }> = {}
    for (const item of chartRawData) {
      const date = item.date ?? ''
      let key: string
      if (granularity === 'hour') {
        key = date.length >= 13 ? date.slice(11, 16) : date.length > 5 ? date.slice(5) : date
      } else {
        key = date.length > 5 ? date.slice(5, 10) : date
      }
      if (!grouped[key]) grouped[key] = { requests: 0, errors: 0 }
      grouped[key].requests += item.request_count ?? item.count ?? 0
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, requests: d.requests, errors: d.errors }))
  })()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('portal.page.logs.title')}</h1>
          <p className="mt-1 text-sm text-white/40">{t('portal.page.logs.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50">
          {startDate.format('YYYY/M/D HH:mm')} → {endDate.format('YYYY/M/D HH:mm')}
        </div>
      </div>

      {/* Stats Cards + Quick Filter — side by side, filter spans full height */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        {/* Left column: stats + chart stacked */}
        <div className="space-y-5">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {statsCards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]">
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${card.dotColor}`} />
                    <span className="text-xs text-white/40">{card.label}</span>
                  </div>
                  <p className="mt-1 text-xl font-bold text-white">{card.value}</p>
                </div>
              )
            })}
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-base font-semibold text-white">{t('portal.page.logs.requestTrend')}</h3>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" />{t('portal.page.logs.requests')}</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" />{t('portal.page.logs.errors')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                  {(['hour', 'day', 'week'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGranularity(g)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        granularity === g ? 'bg-purple-500/80 text-white shadow' : 'text-white/50 hover:text-white/70'
                      }`}
                    >
                      {g === 'hour' ? t('portal.page.logs.hour') : g === 'day' ? t('portal.page.logs.day') : t('portal.page.logs.week')}
                    </button>
                  ))}
                </div>
                <button type="button" className="rounded-lg border border-white/10 p-1.5 text-white/50 hover:bg-white/5" title={t('portal.page.logs.export')}>
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorLogReq2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.25)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  />
                  <Area type="monotone" dataKey="requests" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorLogReq2)" name={t('portal.page.logs.requests')} />
                  <Area type="monotone" dataKey="errors" stroke="#f97316" strokeWidth={1.5} fill="none" name={t('portal.page.logs.errors')} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right column: Quick Filter panel — spans full height of left column */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5 self-stretch flex flex-col">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{t('portal.page.logs.quickFilter')}</h3>
            <button type="button" onClick={reset} className="text-xs text-white/40 hover:text-white/60">{t('portal.page.logs.clear')}</button>
          </div>
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="mb-1.5 text-xs text-white/40">API Key</p>
                <input
                  type="text"
                  value={keyFilter}
                  onChange={(e) => setKeyFilter(e.target.value)}
                  placeholder="sk-xxxx..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-purple-400/50 focus:outline-none"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-white/40">{t('portal.page.logs.model')}</p>
                <select
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a2e] px-2.5 py-2 text-xs text-white focus:border-purple-400/50 focus:outline-none"
                >
                  <option value="">{t('portal.page.logs.allModels')}</option>
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-white/40">{t('portal.page.logs.status')}</p>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a2e] px-2.5 py-2 text-xs text-white focus:border-purple-400/50 focus:outline-none"
                >
                  <option value="">{t('portal.page.logs.allStatus')}</option>
                  <option value="success">{t('portal.page.logs.success')}</option>
                  <option value="error">{t('portal.page.logs.failed')}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="mb-1.5 text-xs text-white/40">{t('portal.page.logs.ipAddress')}</p>
                <input
                  type="text"
                  value={ipFilter}
                  onChange={(e) => setIpFilter(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-purple-400/50 focus:outline-none"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-white/40">{t('portal.page.logs.minTokens')}</p>
                <input
                  type="text"
                  value={minTokens}
                  onChange={(e) => setMinTokens(e.target.value)}
                  placeholder={t('portal.page.logs.minValue')}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-purple-400/50 focus:outline-none"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-white/40">{t('portal.page.logs.maxTokens')}</p>
                <input
                  type="text"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  placeholder={t('portal.page.logs.maxValue')}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white placeholder:text-white/25 focus:border-purple-400/50 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div className="mt-auto flex items-center gap-3 pt-5">
            <button
              type="button"
              onClick={reset}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2.5 text-xs text-white/60 hover:bg-white/5"
            >
              <RotateCcw className="h-3 w-3" /> {t('portal.page.logs.reset')}
            </button>
            <button
              type="button"
              onClick={() => { setPage(1); refetch() }}
              className="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2.5 text-xs font-medium text-white shadow hover:bg-purple-500"
            >
              <Search className="h-3 w-3" /> {t('portal.page.logs.searchLogs')}
            </button>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-white">{t('portal.page.logs.logList')}</h3>
            <span className="text-xs text-white/40">{t('portal.page.logs.totalRecords', { count: total.toLocaleString() })}</span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
          >
            <RefreshCw className="h-3 w-3" /> {t('portal.page.logs.refresh')}
          </button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-white/50">{t('portal.page.logs.loading')}</p>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-white/40">
                  <th className="w-6 px-2 py-2.5"></th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.time')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.tokenName')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.group')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.type')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.model')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.timingHeader')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.inputTokens')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.cost')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.logs.status')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isError = log.type === 1
                  const isExpanded = expandedId === log.id
                  const totalTokens = (log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0)
                  const cost = (log.quota ?? 0) / 500000
                  const otherData = parseOther(log.other)
                  const firstResponseTime = otherData?.frt ? (otherData.frt / 1000).toFixed(1) : null

                  return (
                    <Fragment key={log.id}>
                      <tr
                        className={`border-b border-white/[0.04] text-white/70 transition cursor-pointer ${isError ? 'bg-red-500/[0.03]' : 'hover:bg-white/[0.02]'}`}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-2 py-3 text-white/30">
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </td>
                        <td className="px-3 py-3 text-xs text-white/50">{dayjs.unix(log.created_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                        <td className="px-3 py-3 text-xs font-mono text-white/50">{log.token_name ? `${log.token_name.slice(0, 6)}···` : '—'}</td>
                        <td className="px-3 py-3">
                          {log.group ? (
                            <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-300">{log.group}</span>
                          ) : <span className="text-xs text-white/30">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs ${isError ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/10 text-blue-300'}`}>
                            {isError ? t('portal.page.logs.error') : t('portal.page.logs.consume')}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-white/80">{log.model_name || '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {log.use_time ? (
                            <span className="text-white/60">
                              {log.use_time}s
                              {firstResponseTime && <span className="ml-1 text-white/30">{firstResponseTime}s</span>}
                              {log.is_stream && <span className="ml-1 rounded bg-cyan-500/10 px-1 text-[10px] text-cyan-400">{t('portal.page.logs.stream')}</span>}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs text-white/60">
                          {totalTokens.toLocaleString()}
                          {otherData?.cache_tokens ? (
                            <span className="ml-1 text-[10px] text-white/30">
                              {t('portal.page.logs.cacheRead')} {otherData.cache_tokens.toLocaleString()}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium text-white/70">${cost.toFixed(6)}</td>
                        <td className="px-3 py-3">
                          {isError ? (
                            <span className="inline-block rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-400">{t('portal.page.logs.failed')}</span>
                          ) : (
                            <span className="inline-block rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">{t('portal.page.logs.success')}</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                          <td colSpan={10} className="px-6 py-4">
                            <div className="space-y-2 text-xs text-white/50">
                              {log.request_id && (
                                <div className="flex gap-2">
                                  <span className="text-white/30 w-24 shrink-0">Request ID</span>
                                  <span className="font-mono text-white/60">{log.request_id}</span>
                                </div>
                              )}
                              {otherData?.cache_tokens != null && (
                                <div className="flex gap-2">
                                  <span className="text-white/30 w-24 shrink-0">{t('portal.page.logs.cacheTokens')}</span>
                                  <span className="text-white/60">{otherData.cache_tokens.toLocaleString()}</span>
                                </div>
                              )}
                              {otherData?.cache_creation_tokens != null && (
                                <div className="flex gap-2">
                                  <span className="text-white/30 w-24 shrink-0">{t('portal.page.logs.cacheCreation')}</span>
                                  <span className="text-white/60">{otherData.cache_creation_tokens.toLocaleString()}</span>
                                </div>
                              )}
                              {log.content && (
                                <div className="flex gap-2">
                                  <span className="text-white/30 w-24 shrink-0">{t('portal.page.logs.logDetail')}</span>
                                  <span className="text-white/60 break-all">{log.content}</span>
                                </div>
                              )}
                              {log.ip && (
                                <div className="flex gap-2">
                                  <span className="text-white/30 w-24 shrink-0">IP</span>
                                  <span className="text-white/60">{log.ip}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10">
            <div className="text-center">
              <p className="text-sm font-medium text-white/50">{t('portal.page.logs.noData')}</p>
              <p className="mt-1 text-xs text-white/30">{t('portal.page.logs.noRecordsFound')}</p>
            </div>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-white/40">
            <div className="flex items-center gap-2">
              <span>{t('portal.page.logs.perPage')}</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="rounded border border-white/10 bg-[#1a1a2e] px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>{t('portal.page.logs.totalItems', { count: total.toLocaleString() })}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-white/10 px-2.5 py-1 transition hover:bg-white/5 disabled:opacity-30"
              >
                ‹
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    page === p ? 'bg-purple-600 text-white' : 'border border-white/10 hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              ))}
              {totalPages > 5 && <span className="px-1">...</span>}
              {totalPages > 5 && (
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    page === totalPages ? 'bg-purple-600 text-white' : 'border border-white/10 hover:bg-white/5'
                  }`}
                >
                  {totalPages}
                </button>
              )}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-white/10 px-2.5 py-1 transition hover:bg-white/5 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
