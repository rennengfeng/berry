/*
Copyright (C) 2023-2026 QuantumNous
*/
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, Coins, KeyRound, ReceiptText, Send, Wallet } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { formatNumber, formatQuota } from '@/lib/format'
import { computeTimeRange } from '@/lib/time'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { PortalShell } from './portal-shell'

function getAnnouncementText(content?: string) {
  if (!content) return '暂无公告，您可以稍后再查看公告内容。'
  return content.replace(/<[^>]+>/g, '').trim()
}

export function UserHome() {
  const user = useAuthStore((state) => state.auth.user)
  const dayRange = useMemo(() => computeTimeRange(1), [])
  const { items: announcements } = useAnnouncements()

  const dayStatsQuery = useQuery({
    queryKey: ['portal-home-day-stats', dayRange.start_timestamp, dayRange.end_timestamp],
    queryFn: async () =>
      getUserQuotaDates({
        start_timestamp: dayRange.start_timestamp,
        end_timestamp: dayRange.end_timestamp,
        default_time: 'hour',
      }),
    staleTime: 60_000,
  })

  const todayStats = useMemo(() => {
    const rows = dayStatsQuery.data?.data ?? []
    return rows.reduce(
      (acc, item) => {
        acc.requests += Number(item.count) || 0
        acc.tokens += Number(item.token_used) || 0
        acc.quota += Number(item.quota) || 0
        return acc
      },
      { requests: 0, tokens: 0, quota: 0 }
    )
  }, [dayStatsQuery.data?.data])

  const cards = [
    {
      title: '今日请求',
      value: formatNumber(todayStats.requests),
      desc: '当日内发起的请求总量',
      icon: Send,
    },
    {
      title: '总请求',
      value: formatNumber(Number(user?.request_count ?? 0)),
      desc: '账户历史累计请求量',
      icon: ReceiptText,
    },
    {
      title: '今日 Token',
      value: formatNumber(todayStats.tokens),
      desc: '当日内使用的 Token 消耗',
      icon: KeyRound,
    },
    {
      title: '总 Token',
      value: formatNumber(Number(user?.used_quota ?? 0)),
      desc: '历史累计 Token 消耗',
      icon: Coins,
    },
    {
      title: '今日花费',
      value: `$${formatQuota(todayStats.quota)}`,
      desc: '当日额度消耗折算',
      icon: Wallet,
    },
    {
      title: '总花费',
      value: `$${formatQuota(Number(user?.used_quota ?? 0))}`,
      desc: '累计额度消耗折算',
      icon: Wallet,
    },
  ]

  return (
    <PortalShell>
      <section className='space-y-4 pt-3'>
        <div>
          <h1 className='text-3xl leading-tight font-bold'>欢迎回来，{user?.username || '用户'}</h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            NewAPI 用户所需：余额、今日用量、公告、邀请、密钥和模型入口集中展示，后台核心逻辑保持沿用。
          </p>
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]'>
          <div className='grid gap-3 sm:grid-cols-2'>
            {cards.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title} className='rounded-xl'>
                  <CardHeader className='pb-2'>
                    <div className='flex items-center justify-between'>
                      <CardTitle className='text-muted-foreground text-xs font-medium'>
                        {item.title}
                      </CardTitle>
                      <Icon className='text-muted-foreground size-4' />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-semibold'>{item.value}</div>
                    <p className='text-muted-foreground mt-1 text-xs'>{item.desc}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className='rounded-xl'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <Bell className='size-4' />
                  公告
                </CardTitle>
                <span className='text-muted-foreground text-xs'>暂无动态</span>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {announcements.length > 0 ? (
                announcements.slice(0, 5).map((item, index) => (
                  <div key={`${item.id ?? 'notice'}-${index}`} className='rounded-lg border p-3 text-sm'>
                    {getAnnouncementText(item.content)}
                  </div>
                ))
              ) : (
                <div className='text-muted-foreground rounded-lg border p-3 text-sm'>
                  当前暂无新的公告，后续通知会展示在这里。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </PortalShell>
  )
}
