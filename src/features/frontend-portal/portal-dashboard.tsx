import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useStatus } from '@/hooks/use-status'
import { Bell, Wallet, Zap, Coins, TrendingUp, Boxes, Globe } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getFrontendDashboard } from './api'
import dayjs from 'dayjs'

type QuickRange = '7' | '14' | '30'

export function PortalDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const { status } = useStatus()
  const [timeRange, setTimeRange] = useState<QuickRange>('7')

  const { data: dashboard } = useQuery({
    queryKey: ['portal-frontend-dashboard'],
    queryFn: getFrontendDashboard,
    staleTime: 30_000,
  })

  // Chart data from API
  const days = Number(timeRange)
  const actualDays = days >= 30 ? 29 : days
  const chartStart = dayjs().subtract(actualDays, 'day').startOf('day').unix()
  const chartEnd = dayjs().endOf('day').unix()

  const { data: chartRawData } = useQuery({
    queryKey: ['portal-home-chart', chartStart, chartEnd],
    queryFn: async () => {
      const res = await api.get('/api/data/self', {
        params: {
          start_timestamp: chartStart,
          end_timestamp: chartEnd,
          default_time: days <= 7 ? 'hour' : 'day',
        },
      })
      return res.data?.data as Array<{
        date?: string
        quota?: number
        token?: number
        request_count?: number
        model_name?: string
      }> | undefined
    },
    staleTime: 30_000,
  })

  const balance = ((user?.quota ?? 0) / 500000).toFixed(2)
  const todayRequests = dashboard?.today?.rpm ?? 0
  const todayTokens = dashboard?.today?.tpm ?? 0
  const totalSpend = ((dashboard?.today?.quota ?? 0) / 500000).toFixed(2)

  const source = (status?.data ?? status) as Record<string, unknown> | null | undefined
  const announcementsEnabled = source?.announcements_enabled !== false
  const announcements = (announcementsEnabled ? source?.announcements : []) as Array<{ content: string; publishDate: string; type?: string }> | undefined

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const modelsCount = dashboard?.models_count ?? 0

  const statsCards = [
    { icon: Wallet, label: t('portal.page.home.balance'), value: `$${balance}`, color: 'text-emerald-400', iconBg: 'bg-emerald-500/15' },
    { icon: Zap, label: t('portal.page.home.todayRequests'), value: formatNum(todayRequests), color: 'text-blue-400', iconBg: 'bg-blue-500/15' },
    { icon: Coins, label: t('portal.page.home.todayTokens'), value: formatNum(todayTokens), color: 'text-purple-400', iconBg: 'bg-purple-500/15' },
    { icon: TrendingUp, label: t('portal.page.home.totalSpend'), value: `$${totalSpend}`, color: 'text-orange-400', iconBg: 'bg-orange-500/15' },
    { icon: Boxes, label: t('portal.page.home.availableModels'), value: String(modelsCount), color: 'text-cyan-400', iconBg: 'bg-cyan-500/15' },
  ]

  // Build chart data
  const chartData = (() => {
    if (!chartRawData || chartRawData.length === 0) {
      const result = []
      const now = dayjs()
      for (let i = days - 1; i >= 0; i--) {
        result.push({ date: now.subtract(i, 'day').format('MM-DD'), requests: 0 })
      }
      return result
    }
    const grouped: Record<string, number> = {}
    for (const item of chartRawData) {
      const date = item.date ?? ''
      const key = date.length > 5 ? date.slice(5) : date
      grouped[key] = (grouped[key] ?? 0) + (item.request_count ?? 0)
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, requests]) => ({ date, requests }))
  })()

  const totalChartRequests = chartData.reduce((s, d) => s + d.requests, 0)

  // Request distribution by model (from chart data)
  const requestDistribution = (() => {
    const colors = ['#8b5cf6', '#6366f1', '#3b82f6', '#f59e0b', '#64748b']
    if (!chartRawData || chartRawData.length === 0) return []
    const modelMap: Record<string, number> = {}
    for (const item of chartRawData) {
      const name = item.model_name ?? 'unknown'
      modelMap[name] = (modelMap[name] ?? 0) + (item.request_count ?? 0)
    }
    const sorted = Object.entries(modelMap).sort((a, b) => b[1] - a[1])
    const top4 = sorted.slice(0, 4)
    const othersVal = sorted.slice(4).reduce((s, [, v]) => s + v, 0)
    const result = top4.map(([name, value], i) => ({ name, value, color: colors[i] }))
    if (othersVal > 0) result.push({ name: t('portal.page.home.others'), value: othersVal, color: colors[4] })
    return result
  })()

  const pieTotal = requestDistribution.reduce((s, i) => s + i.value, 0)

  return (
    <div className="space-y-5">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          {t('portal.page.home.welcome')}, {user?.display_name || user?.username || 'User'} 👋
        </h1>
        <p className="mt-1 text-sm text-white/40">
          {t('portal.page.home.subtitle')}
        </p>
      </div>

      {/* Stats Cards - 5 columns */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statsCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="rounded-xl border border-white/8 bg-white/[0.02] p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-white/40">{card.label}</span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Row: Request Stats + Request Distribution */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* Request Stats Chart */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">{t('portal.page.home.requestStats')}</h3>
              <p className="mt-0.5 text-xs text-white/40">{t('portal.page.home.requestStatsDesc', { days: timeRange })}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                {(['7', '14', '30'] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setTimeRange(range)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      timeRange === range
                        ? 'bg-purple-500/80 text-white shadow'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    {range}{t('portal.page.home.days')}
                  </button>
                ))}
              </div>
              <span className="text-lg font-bold text-white">{formatNum(totalChartRequests)}</span>
              <span className="text-xs text-white/40">{t('portal.page.home.totalRequests')}</span>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReqHome" x1="0" y1="0" x2="0" y2="1">
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
                  itemStyle={{ color: '#8b5cf6' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorReqHome)" name={t('portal.page.home.requests')} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Request Distribution Pie */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <h3 className="mb-3 text-base font-semibold text-white">{t('portal.page.home.requestDistribution')}</h3>
          {requestDistribution.length > 0 ? (
            <>
              <div className="relative flex h-[220px] items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={requestDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={90}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {requestDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center">
                  <p className="text-xl font-bold text-white">{formatNum(pieTotal)}</p>
                  <p className="text-xs text-white/40">{t('portal.page.home.totalRequests')}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                {requestDistribution.map((item) => (
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
              <div className="text-center">
                <p className="text-lg font-bold text-white">0</p>
                <p className="text-xs text-white/40">{t('portal.page.home.totalRequests')}</p>
                <p className="mt-4 text-sm text-white/30">{t('portal.page.home.noDistributionData')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* API Info */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
            <Globe className="h-4 w-4 text-purple-400" />
            {t('portal.page.home.discoverAPI')}
          </h3>
          {(() => {
            const apiInfoEnabled = source?.api_info_enabled !== false
            const apiInfoItems = (apiInfoEnabled ? source?.api_info : []) as Array<{ url: string; route: string; description: string; color: string }> | undefined
            const items = apiInfoItems ?? []

            if (items.length === 0) {
              return <p className="text-sm text-white/40">{t('portal.page.home.noModels')}</p>
            }

            return (
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3 transition hover:border-purple-500/30 hover:bg-white/[0.04]"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <Globe className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white/90">{item.description}</p>
                      <p className="truncate text-xs text-white/50">{item.url}{item.route}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Announcements */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
            <Bell className="h-4 w-4 text-purple-400" />
            {t('portal.page.home.latestNotice')}
          </h3>
          {announcements && announcements.length > 0 ? (
            <div className="max-h-[220px] space-y-3 overflow-y-auto">
              {announcements.map((ann, idx) => (
                <div key={idx} className="rounded-lg border border-white/6 bg-white/[0.02] p-3">
                  <div className="prose prose-invert prose-sm text-white/70">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {ann.content}
                    </ReactMarkdown>
                  </div>
                  <p className="mt-2 text-xs text-white/30">
                    {dayjs(ann.publishDate).format('YYYY-MM-DD HH:mm')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/40">{t('portal.page.home.noNotice')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
