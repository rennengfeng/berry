import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Copy, Users, CheckCircle, Gift, DollarSign, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function PortalAffiliate() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  const { data: affCode } = useQuery({
    queryKey: ['portal-aff-code'],
    queryFn: async () => {
      const res = await api.get('/api/user/aff')
      return res.data?.data as string | undefined
    },
    staleTime: 60_000,
  })

  const inviteCode = affCode ?? user?.aff_code ?? ''
  const inviteCount = user?.aff_count ?? 0
  const affQuota = user?.aff_history_quota ?? 0
  const inviteLink = inviteCode
    ? `${window.location.origin}/register?aff=${inviteCode}`
    : ''

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    toast.success(t('portal.page.affiliate.linkCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const statsCards = [
    { icon: Users, label: t('portal.page.affiliate.totalInvites'), value: String(inviteCount), color: 'text-blue-400', iconBg: 'bg-blue-500/15' },
    { icon: CheckCircle, label: t('portal.page.affiliate.validInvites'), value: String(inviteCount), color: 'text-emerald-400', iconBg: 'bg-emerald-500/15' },
    { icon: DollarSign, label: t('portal.page.affiliate.totalRewards'), value: `$${(affQuota / 500000).toFixed(2)}`, color: 'text-purple-400', iconBg: 'bg-purple-500/15' },
    { icon: Gift, label: t('portal.page.affiliate.pendingRewards'), value: `$${(affQuota / 500000).toFixed(2)}`, color: 'text-orange-400', iconBg: 'bg-orange-500/15' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t('portal.page.affiliate.title')}</h1>
        <p className="mt-1 text-sm text-white/40">{t('portal.page.affiliate.subtitle')}</p>
      </div>

      {/* Invite Link + Stats */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_auto]">
        {/* Invite Link */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <p className="mb-2 text-xs text-white/40">{t('portal.page.affiliate.myInviteLink')}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/70 font-mono truncate">
              {inviteLink || t('portal.page.affiliate.generating')}
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/[0.08] hover:text-white"
              title={t('portal.page.affiliate.copyLink')}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-white/30">{t('portal.page.affiliate.shareTip')}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {statsCards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-4 min-w-[140px]">
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconBg}`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </div>
                <p className="text-xl font-bold text-white">{card.value}</p>
                <p className="mt-0.5 text-xs text-white/40">{card.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Reward Rules */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
        <h3 className="mb-4 text-base font-semibold text-white">{t('portal.page.affiliate.rewardRules')}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
            <p className="mb-2 text-sm font-medium text-purple-400">{t('portal.page.affiliate.youGet')}</p>
            <div className="space-y-1.5 text-xs text-white/60">
              <p className="flex items-center gap-2">
                <Gift className="h-3.5 w-3.5 text-purple-400" />
                {t('portal.page.affiliate.rule1')}
              </p>
              <p className="flex items-center gap-2">
                <Gift className="h-3.5 w-3.5 text-purple-400" />
                {t('portal.page.affiliate.rule2')}
              </p>
            </div>
            <p className="mt-3 text-right text-xs text-purple-400/60">{t('portal.page.affiliate.noLimit')}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="mb-2 text-sm font-medium text-emerald-400">{t('portal.page.affiliate.friendGets')}</p>
            <div className="space-y-1.5 text-xs text-white/60">
              <p className="flex items-center gap-2">
                <Gift className="h-3.5 w-3.5 text-emerald-400" />
                {t('portal.page.affiliate.friendRule1')}
              </p>
            </div>
            <p className="mt-3 text-right text-xs text-emerald-400/60">{t('portal.page.affiliate.newUsersOnly')}</p>
          </div>
        </div>
      </div>

      {/* Invite Records */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{t('portal.page.affiliate.inviteRecords')}</h3>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
          >
            <RefreshCw className="h-3 w-3" /> {t('portal.page.affiliate.refresh')}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex items-center gap-2">
          {[t('portal.page.affiliate.all'), t('portal.page.affiliate.registered'), t('portal.page.affiliate.rewarded'), t('portal.page.affiliate.pendingReward')].map((tab, i) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(i)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeTab === i
                  ? 'bg-purple-500/80 text-white shadow'
                  : 'border border-white/10 text-white/50 hover:text-white/70'
              }`}
            >
              {tab} ({i === 0 ? inviteCount : 0})
            </button>
          ))}
        </div>

        {/* Table */}
        {inviteCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-white/40">
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.affiliate.user')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.affiliate.registerTime')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.affiliate.status')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.affiliate.firstTopupTime')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.affiliate.rewardAmount')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.affiliate.rewardStatus')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-white/40">
                    {t('portal.page.affiliate.recordsNote')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10">
            <div className="text-center">
              <p className="text-sm text-white/50">{t('portal.page.affiliate.noRecords')}</p>
              <p className="mt-1 text-xs text-white/30">{t('portal.page.affiliate.shareToInvite')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
