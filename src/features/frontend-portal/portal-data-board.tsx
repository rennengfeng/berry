import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Activity, Coins, DollarSign, Gauge, Clock, Boxes } from 'lucide-react'
import dayjs from 'dayjs'

type QuickRange = '7d' | '14d' | '30d'

function getRange(quick: QuickRange) {
  const now = dayjs()
  const days = quick === '7d' ? 7 : quick === '14d' ? 14 : 29
  return {
    start: now.subtract(days, 'day').startOf('day').unix(),
    end: now.endOf('day').unix(),
    days,
  }
}

function getPrevRange(quick: QuickRange) {
  const now = dayjs()
  const days = quick === '7d' ? 7 : quick === '14d' ? 14 : 29
  return {
    start: now.subtract(days * 2, 'day').startOf('day').unix(),
    end: now.subtract(days, 'day').endOf('day').unix(),
  }
}

export function PortalDataBoard() {
  const { t } = useTranslation()
  useAuthStore((s) => s.auth.user)
  const [quick, setQuick] = useState<QuickRange>('7d')

  const { start, end, days } = getRange(quick)
  const prev = getPrevRange(quick)

  // Current period stats
  const { data: statData } = useQuery({
    queryKey: ['portal-data-board-stat', start, end],
    queryFn: async () => {
      const res = await api.get('/api/data/self', {
        params: {
          start_timestamp: start,
          end_timestamp: end,
          default_time: days <= 7 ? 'hour' : 'day',
        },
      })
      return res.data?.data as Array<{
        date?: string
        quota?: number
        token?: number
        token_used?: number
        request_count?: number
        count?: number
        model_name?: string
      }> | undefined
    },
    staleTime: 30_000,
  })

  // Previous period stats for comparison
  const { data: prevStatData } = useQuery({
    queryKey: ['portal-data-board-stat-prev', prev.start, prev.end],
    queryFn: async () => {
      const res = await api.get('/api/data/self', {
        params: {
          start_timestamp: prev.start,
          end_timestamp: prev.end,
          default_time: days <= 7 ? 'hour' : 'day',
        },
      })
      return res.data?.data as Array<{
        quota?: number
        token?: number
        token_used?: number
        request_count?: number
        count?: number
      }> | undefined
    },
    staleTime: 60_000,
  })

  // User models count
  const { data: modelsData } = useQuery({
    queryKey: ['portal-user-models-count'],
    queryFn: async () => {
      const res = await api.get('/api/user/models')
      const arr = res.data?.data
      return Array.isArray(arr) ? arr.length : 0
    },
    staleTime: 60_000,
  })

  // Uptime status for success rate
  const { data: uptimeData } = useQuery({
    queryKey: ['portal-uptime-status'],
    queryFn: async () => {
      const res = await api.get('/api/uptime/status')
      const data = res.data?.data
      if (!Array.isArray(data)) return 0
      let total = 0
      let sum = 0
      for (const group of data) {
        if (group.monitors && Array.isArray(group.monitors)) {
          for (const m of group.monitors) {
            sum += m.uptime ?? 0
            total++
          }
        }
      }
      return total > 0 ? sum / total : 0
    },
    staleTime: 60_000,
  })

  // Compute totals
  const totalRequests = statData?.reduce((s, d) => s + (d.request_count ?? d.count ?? 0), 0) ?? 0
  const totalTokens = statData?.reduce((s, d) => s + (d.token ?? d.token_used ?? 0), 0) ?? 0
  const totalQuota = statData?.reduce((s, d) => s + (d.quota ?? 0), 0) ?? 0
  const totalSpend = (totalQuota / 500000).toFixed(2)

  const prevRequests = prevStatData?.reduce((s, d) => s + (d.request_count ?? d.count ?? 0), 0) ?? 0
  const prevTokens = prevStatData?.reduce((s, d) => s + (d.token ?? d.token_used ?? 0), 0) ?? 0
  const prevQuota = prevStatData?.reduce((s, d) => s + (d.quota ?? 0), 0) ?? 0

  const calcChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+100%' : '—'
    const pct = ((curr - prev) / prev) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  }

  const successRate = uptimeData ? `${uptimeData.toFixed(1)}%` : '—'
  const activeModels = modelsData ?? 0

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const reqChange = calcChange(totalRequests, prevRequests)
  const tokenChange = calcChange(totalTokens, prevTokens)
  const spendChange = calcChange(totalQuota, prevQuota)

  const statsCards = [
    { icon: Activity, label: t('portal.page.dashboard.totalRequests'), value: formatNum(totalRequests), change: reqChange, color: 'text-blue-400' },
    { icon: Coins, label: t('portal.page.dashboard.totalTokens'), value: formatNum(totalTokens), change: tokenChange, color: 'text-purple-400' },
    { icon: DollarSign, label: t('portal.page.dashboard.totalCost'), value: `$${totalSpend}`, change: spendChange, color: 'text-emerald-400' },
    { icon: Gauge, label: t('portal.page.dashboard.successRate'), value: successRate, change: '', color: 'text-cyan-400' },
    { icon: Clock, label: t('portal.page.dashboard.avgResponseTime'), value: '—', change: '', color: 'text-orange-400' },
    { icon: Boxes, label: t('portal.page.dashboard.activeModels'), value: String(activeModels), change: '', color: 'text-pink-400' },
  ]

  // Build chart data
  const chartData = (() => {
    if (!statData || statData.length === 0) {
      const result = []
      const now = dayjs()
      for (let i = days - 1; i >= 0; i--) {
        result.push({ date: now.subtract(i, 'day').format('MM-DD'), requests: 0 })
      }
      return result
    }
    const grouped: Record<string, { requests: number }> = {}
    for (const item of statData) {
      const date = item.date ?? ''
      const key = date.length > 5 ? date.slice(5) : date
      if (!grouped[key]) grouped[key] = { requests: 0 }
      grouped[key].requests += item.request_count ?? 0
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, requests: d.requests }))
  })()

  // Model distribution for pie chart (real data)
  const modelDistribution = (() => {
    const colors = ['#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#64748b']
    if (!statData || statData.length === 0) return []
    const modelMap: Record<string, number> = {}
    for (const item of statData) {
      const name = item.model_name ?? 'unknown'
      modelMap[name] = (modelMap[name] ?? 0) + (item.request_count ?? 0)
    }
    const sorted = Object.entries(modelMap).sort((a, b) => b[1] - a[1])
    const top5 = sorted.slice(0, 5)
    const othersVal = sorted.slice(5).reduce((s, [, v]) => s + v, 0)
    const result = top5.map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
    if (othersVal > 0) result.push({ name: 'others', value: othersVal, color: colors[5] })
    return result
  })()

  const pieTotal = modelDistribution.reduce((s, i) => s + i.value, 0)

  // Model ranking table (real data)
  const modelRanking = (() => {
    if (!statData || statData.length === 0) return []
    const modelMap: Record<string, { requests: number; quota: number }> = {}
    for (const item of statData) {
      const name = item.model_name ?? 'unknown'
      if (!modelMap[name]) modelMap[name] = { requests: 0, quota: 0 }
      modelMap[name].requests += item.request_count ?? 0
      modelMap[name].quota += item.quota ?? 0
    }
    const total = Object.values(modelMap).reduce((s, d) => s + d.requests, 0)
    return Object.entries(modelMap)
      .sort((a, b) => b[1].requests - a[1].requests)
      .slice(0, 5)
      .map(([name, d]) => ({
        name,
        requests: d.requests,
        percentage: total > 0 ? ((d.requests / total) * 100).toFixed(1) : '0',
        cost: `$${(d.quota / 500000).toFixed(2)}`,
      }))
  })()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('portal.page.dashboard.title')}</h1>
          <p className="mt-1 text-sm text-white/40">{t('portal.page.dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {(['7d', '14d', '30d'] as const).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuick(q)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
                  quick === q
                    ? 'bg-purple-500/80 text-white shadow'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                {q === '7d' ? `7${t('portal.page.dashboard.days')}` : q === '14d' ? `14${t('portal.page.dashboard.days')}` : `30${t('portal.page.dashboard.days')}`}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50">
            {dayjs.unix(start).format('YYYY-MM-DD')} ~ {dayjs.unix(end).format('YYYY-MM-DD')}
          </div>
        </div>
      </div>

      {/* 6 Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statsCards.map((card) => {
          const Icon = card.icon
          const isUp = card.change.startsWith('+')
          const isDown = card.change.startsWith('-')
          return (
            <div key={card.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${card.color.replace('text-', 'bg-')}`} />
                <span className="text-xs text-white/40">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
              {card.change && (
                <p className={`mt-1 text-xs ${isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-white/30'}`}>
                  {t('portal.page.dashboard.vsPrevPeriod')} {card.change}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Charts Row: Trend + Pie */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        {/* Request Trend */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-base font-semibold text-white">{t('portal.page.dashboard.requestTrend')}</h3>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" />{t('portal.page.dashboard.requests')}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{t('portal.page.dashboard.successRatePercent')}</span>
              </div>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReqBoard" x1="0" y1="0" x2="0" y2="1">
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
                <Area type="monotone" dataKey="requests" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorReqBoard)" name={t('portal.page.dashboard.requests')} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Request Distribution Pie */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <h3 className="mb-3 text-base font-semibold text-white">{t('portal.page.dashboard.requestDistribution')}</h3>
          {modelDistribution.length > 0 ? (
            <>
              <div className="relative flex h-[200px] items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={modelDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {modelDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center">
                  <p className="text-xl font-bold text-white">{formatNum(pieTotal)}</p>
                  <p className="text-xs text-white/40">{t('portal.page.dashboard.totalRequests')}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                {modelDistribution.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-white/70">{item.name}</span>
                    </div>
                    <span className="text-white/50">{pieTotal > 0 ? ((item.value / pieTotal) * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[300px] items-center justify-center">
              <p className="text-sm text-white/40">{t('portal.page.dashboard.noDistributionData')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Model Ranking + Recent Requests */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        {/* Model Usage Ranking */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">{t('portal.page.dashboard.modelRanking')}</h3>
            <button type="button" className="text-xs text-purple-400 hover:text-purple-300">{t('portal.page.dashboard.viewMore')} →</button>
          </div>
          {modelRanking.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-white/40">
                  <th className="pb-3 text-left font-medium">{t('portal.page.dashboard.rank')}</th>
                  <th className="pb-3 text-left font-medium">{t('portal.page.dashboard.callCount')}</th>
                  <th className="pb-3 text-left font-medium">{t('portal.page.dashboard.modelName')}</th>
                  <th className="pb-3 text-right font-medium">{t('portal.page.dashboard.modelShare')}</th>
                  <th className="pb-3 text-right font-medium">{t('portal.page.dashboard.actualCost')}</th>
                </tr>
              </thead>
              <tbody>
                {modelRanking.map((m, i) => (
                  <tr key={m.name} className="border-b border-white/[0.04]">
                    <td className="py-3 text-white/50">{i + 1}</td>
                    <td className="py-3 text-white/70">{m.requests.toLocaleString()}</td>
                    <td className="py-3 font-medium text-white/80">{m.name}</td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(Number(m.percentage), 100)}%` }} />
                        </div>
                        <span className="text-xs text-white/50">{m.percentage}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-white/60">{m.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-white/40">{t('portal.page.dashboard.noModelData')}</p>
            </div>
          )}
        </div>

        {/* Recent Requests */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">{t('portal.page.dashboard.realtimeRequests')}</h3>
            <button type="button" className="text-xs text-purple-400 hover:text-purple-300">{t('portal.page.dashboard.viewAll')}</button>
          </div>
          {modelRanking.length > 0 ? (
            <div className="space-y-3">
              {modelRanking.map((m) => (
                <div key={m.name} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                    <Activity className="h-4 w-4 text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/80">{m.name}</p>
                    <p className="text-xs text-white/40">/v1/chat/completions</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-400">{t('portal.page.dashboard.success')}</span>
                  </div>
                  <div className="shrink-0 text-right text-xs text-white/50">
                    {m.requests.toLocaleString()} Tokens
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-white/40">{t('portal.page.dashboard.noRealtimeData')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
