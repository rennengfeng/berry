import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, RotateCw, Gauge, Zap, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { getFrontendUptimeStatus } from './api'

const STATUS_BAR_COLOR: Record<number, string> = {
  1: 'bg-emerald-500',
  0: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
}

const STATUS_DOT_COLOR: Record<number, string> = {
  1: 'bg-emerald-500',
  0: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
}

type PerfModelSummary = {
  model_name: string
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
  request_count?: number
}

export function ModelMonitor() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const source = (status?.data ?? status) as Record<string, unknown> | null | undefined
  const uptimeEnabled = Boolean(source?.uptime_kuma_enabled)

  const { data: uptimeData, isLoading: uptimeLoading, isFetching, refetch } = useQuery({
    queryKey: ['frontend-uptime-status'],
    queryFn: getFrontendUptimeStatus,
    staleTime: 30_000,
  })

  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ['portal-perf-metrics-summary'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/perf-metrics/summary', {
          skipErrorHandler: true,
          disableDuplicate: true,
        })
        return res.data?.data?.models as PerfModelSummary[] | undefined
      } catch {
        return []
      }
    },
    staleTime: 60_000,
  })

  const groups = uptimeData ?? []
  const allMonitors = useMemo(
    () => groups.flatMap((group) => group.monitors ?? []),
    [groups]
  )
  const perfModels = perfData ?? []

  return (
    <div className="space-y-5">
      {/* Uptime Kuma — 服务可用性 */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Activity className="h-5 w-5 text-emerald-400" />
            {t('portal.monitor.serviceAvailability')}
          </h2>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RotateCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
        </div>

        {!uptimeEnabled ? (
          <p className="text-sm text-white/40">{t('portal.monitor.uptimeDisabled')}</p>
        ) : uptimeLoading ? (
          <p className="text-sm text-white/40">{t('portal.monitor.loading')}</p>
        ) : allMonitors.length === 0 ? (
          <p className="text-sm text-white/40">{t('portal.monitor.noData')}</p>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.categoryName}>
                <p className="mb-3 text-sm font-bold text-white/80">{group.categoryName}</p>
                <div className="space-y-4">
                  {(group.monitors ?? []).map((monitor) => {
                    const uptimePct = ((monitor.uptime ?? 0) * 100).toFixed(2)
                    const barColor = STATUS_BAR_COLOR[monitor.status] ?? 'bg-white/30'
                    const dotColor = STATUS_DOT_COLOR[monitor.status] ?? 'bg-white/30'
                    return (
                      <div key={`${group.categoryName}-${monitor.name}`} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', dotColor)} />
                            <span className="text-sm font-medium text-white/90">{monitor.name}</span>
                          </div>
                          <span className="text-sm font-medium text-white/90">{uptimePct}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/40">{t('portal.monitor.uptime')}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={cn('h-full rounded-full transition-all', barColor)}
                              style={{ width: `${Math.max(0, Math.min(100, Number(uptimePct)))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-4 border-t border-white/[0.06] pt-3">
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="h-2 w-2 rounded-full bg-rose-500" />{t('portal.monitor.statusDown')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />{t('portal.monitor.statusUp')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="h-2 w-2 rounded-full bg-amber-500" />{t('portal.monitor.statusSlow')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <span className="h-2 w-2 rounded-full bg-blue-500" />{t('portal.monitor.statusMaintenance')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Perf Metrics — 性能指标 */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Gauge className="h-5 w-5 text-orange-400" />
          {t('portal.monitor.perfMetrics')}
        </h2>

        {perfLoading ? (
          <p className="text-sm text-white/40">{t('portal.monitor.loading')}</p>
        ) : perfModels.length === 0 ? (
          <p className="text-sm text-white/40">{t('portal.monitor.noPerfData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/50">
                  <th className="pb-3 pr-4 font-medium">{t('portal.monitor.model')}</th>
                  <th className="pb-3 pr-4 font-medium">{t('portal.monitor.avgLatency')}</th>
                  <th className="pb-3 pr-4 font-medium">{t('portal.monitor.successRate')}</th>
                  <th className="pb-3 pr-4 font-medium">TPS</th>
                  <th className="pb-3 font-medium">{t('portal.monitor.requestCount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {perfModels.map((m) => {
                  const rate = m.success_rate > 1 ? m.success_rate : m.success_rate * 100
                  return (
                    <tr key={m.model_name} className="text-white/80">
                      <td className="py-3 pr-4 font-medium text-white">{m.model_name}</td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-amber-400" />
                          {m.avg_latency_ms.toFixed(0)}ms
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle className={cn('h-3.5 w-3.5', rate >= 95 ? 'text-emerald-400' : rate >= 80 ? 'text-amber-400' : 'text-rose-400')} />
                          {rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 pr-4">{m.avg_tps.toFixed(1)}</td>
                      <td className="py-3">{m.request_count ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
