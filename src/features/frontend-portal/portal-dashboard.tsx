import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { useStatus } from '@/hooks/use-status'
import { getSelf } from '@/lib/api'
import { formatQuota, formatNumber } from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'
import { BarChart3, Activity, Users, Bell, Globe } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import dayjs from 'dayjs'

export function PortalDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const setUser = useAuthStore((s) => s.auth.setUser)
  const { status } = useStatus()

  useEffect(() => {
    getSelf().then((res) => {
      if (res.success && res.data) {
        setUser(res.data as typeof user)
      }
    }).catch(() => {})
  }, [setUser])

  const source = (status?.data ?? status) as Record<string, unknown> | null | undefined
  const announcementsEnabled = source?.announcements_enabled !== false
  const announcements = (announcementsEnabled ? source?.announcements : []) as Array<{ content: string; publishDate: string; type?: string }> | undefined

  const apiInfoEnabled = source?.api_info_enabled !== false
  const apiInfoItems = (apiInfoEnabled ? source?.api_info : []) as Array<{ url: string; route: string; description: string; color: string }> | undefined
  const items = apiInfoItems ?? []

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.display_name
      ? user.display_name.slice(0, 2).toUpperCase()
      : 'U'

  const displayName = user?.display_name || user?.username || 'User'
  const roleLabel = getRoleLabel(user?.role ?? 1)

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar">
      {/* Top: Classic-style profile banner */}
      <div className="shrink-0 px-5 pt-2 pb-3">
        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Banner background */}
          <div className="relative h-12 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9InJnYmEoMTM5LDkyLDI0NiwwLjEpIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSJyZ2JhKDU5LDEzMCwyNDYsMC4wNSkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIvPjwvc3ZnPg==')] opacity-50" />
          </div>
          {/* Profile info */}
          <div className="relative px-5 pb-4">
            {/* Simplified: only username */}
            <div className="-mt-4 mb-3">
              <h2 className="text-xl font-bold">{displayName}</h2>
            </div>
            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('Current Balance')}</p>
                <p className="font-mono text-2xl font-bold tabular-nums">{formatQuota(user?.quota ?? 0)}</p>
              </div>
              <div className="ml-auto flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('Total Usage')}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">{formatQuota(user?.used_quota ?? 0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('Request Count')}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">{formatNumber(user?.request_count ?? 0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('User Group')}</span>
                  <span className="text-sm font-semibold">{user?.group || 'default'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: API Info + Announcements */}
      <div className="min-h-0 flex-1 px-5 pb-3">
        <div className="grid h-full grid-cols-1 gap-5 lg:grid-cols-[4fr_6fr]">
          {/* Left: API Info */}
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t('portal.page.home.discoverAPI')}</h3>
            </div>
            <div className="overflow-y-auto p-3 no-scrollbar" style={{ maxHeight: 'calc(100% - 44px)' }}>
              {items.length > 0 ? (
                <div className="space-y-2.5">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 transition hover:border-primary/30 hover:bg-muted/40"
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <Globe className="h-4 w-4" style={{ color: item.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.description}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.url}{item.route}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('portal.page.home.noModels')}</p>
              )}
            </div>
          </div>

          {/* Right: Announcements */}
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t('portal.page.home.latestNotice')}</h3>
            </div>
            <div className="overflow-y-auto p-4 no-scrollbar" style={{ maxHeight: 'calc(100% - 44px)' }}>
              {announcements && announcements.length > 0 ? (
                <div className="space-y-3">
                  {announcements.map((ann, idx) => (
                    <div key={idx} className="rounded-lg border border-border/40 bg-muted/20 p-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {ann.content}
                        </ReactMarkdown>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {dayjs(ann.publishDate).format('YYYY-MM-DD HH:mm')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('portal.page.home.noNotice')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
