import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, RotateCw, Gauge, Zap, CheckCircle } from 'lucide-react'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { getFrontendUptimeStatus } from './api'
import { usePortalAppearance } from './portal-shell'

const STATUS_COLOR_MAP: Record<number, string> = {
  1: 'bg-emerald-500',
  0: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
}

function statusText(status: number) {
  if (status === 1) return '正常'
  if (status === 0) return '异常'
  if (status === 2) return '高延迟'
  if (status === 3) return '维护中'
  return '未知'
}

type PerfModelSummary = {
  model_name: string
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
  request_count?: number
}

export function ModelMonitor() {
  const appearance = usePortalAppearance()
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
      const res = await api.get('/api/perf-metrics/summary')
      return res.data?.data?.models as PerfModelSummary[] | undefined
    },
    staleTime: 60_000,
  })

  const groups = uptimeData ?? []
  const monitors = useMemo(
    () => groups.flatMap((group) => group.monitors ?? []),
    [groups]
  )
  const perfModels = perfData ?? []

  return (
    <div className="space-y-5">
      {/* Uptime Kuma section */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Activity className="h-5 w-5 text-emerald-400" />
            服务可用性
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
          <p className="text-sm text-white/40">
            后台已关闭 Uptime Kuma 展示，请先在系统设置中启用。
          </p>
        ) : uptimeLoading ? (
          <p className="text-sm text-white/40">加载中...</p>
        ) : monitors.length === 0 ? (
          <p className="text-sm text-white/40">暂无服务监控数据</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.categoryName}>
                <p className="mb-2 text-sm font-medium text-white/70">{group.categoryName}</p>
                <div className="space-y-2">
                  {(group.monitors ?? []).map((monitor) => {
                    const uptimePct = ((monitor.uptime ?? 0) * 100).toFixed(2)
                    const displayName = monitor.group
                      ? `${monitor.group} / ${monitor.name}`
                      : monitor.name
                    return (
                      <div key={`${group.categoryName}-${monitor.group ?? ''}-${monitor.name}`}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                STATUS_COLOR_MAP[monitor.status] ?? 'bg-white/30'
                              )}
                            />
                            <span className="text-white/80">{displayName}</span>
                            <span className="text-xs text-white/40">{statusText(monitor.status)}</span>
                          </div>
                          <span className="font-medium text-white">{uptimePct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, Number(uptimePct)))}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Perf Metrics section */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Gauge className="h-5 w-5 text-orange-400" />
          性能指标
        </h2>

        {perfLoading ? (
          <p className="text-sm text-white/40">加载中...</p>
        ) : perfModels.length === 0 ? (
          <p className="text-sm text-white/40">暂无性能数据</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/50">
                  <th className="pb-3 pr-4 font-medium">模型</th>
                  <th className="pb-3 pr-4 font-medium">平均延迟</th>
                  <th className="pb-3 pr-4 font-medium">成功率</th>
                  <th className="pb-3 pr-4 font-medium">TPS</th>
                  <th className="pb-3 font-medium">请求数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {perfModels.map((m) => (
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
                        <CheckCircle className={cn('h-3.5 w-3.5', m.success_rate >= 0.95 ? 'text-emerald-400' : m.success_rate >= 0.8 ? 'text-amber-400' : 'text-rose-400')} />
                        {(m.success_rate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 pr-4">{m.avg_tps.toFixed(1)}</td>
                    <td className="py-3">{m.request_count ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
