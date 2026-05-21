import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Gift, RefreshCw, Search, Users, Wallet } from 'lucide-react'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { api, getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { toast } from 'sonner'
import { DEFAULT_DISCOUNT_RATE } from '@/features/wallet/constants'
import { PaymentConfirmDialog } from '@/features/wallet/components/dialogs/payment-confirm-dialog'
import { TransferDialog } from '@/features/wallet/components/dialogs/transfer-dialog'
import {
  useAffiliate,
  usePayment,
  useRedemption,
  useTopupInfo,
  useWaffoPancakePayment,
} from '@/features/wallet/hooks'
import { useBillingHistory } from '@/features/wallet/hooks/use-billing-history'
import {
  getDefaultPaymentType,
  getMinTopupAmount,
  isWaffoPancakePayment,
} from '@/features/wallet/lib'
import {
  formatTimestamp,
  getPaymentMethodName,
  getStatusConfig,
} from '@/features/wallet/lib/billing'
import type {
  PaymentMethod,
  PresetAmount,
  UserWalletData,
} from '@/features/wallet/types'
import { getSelfSubscriptionFull } from '@/features/subscriptions/api'

export function SubscriptionHub() {
  const { t } = useTranslation()
  const authUser = useAuthStore((s) => s.auth.user)
  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>()
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [redemptionCode, setRedemptionCode] = useState('')
  const [copied, setCopied] = useState(false)

  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()
  const {
    amount: paymentAmount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
  } = usePayment()
  const { affiliateLink, transferQuota, transferring } = useAffiliate()
  const { redeeming, redeemCode } = useRedemption()
  const { processing: pancakeProcessing, processWaffoPancakePayment } = useWaffoPancakePayment()

  const effectiveUsdExchangeRate = useMemo(() => {
    return currency?.quotaDisplayType === 'USD' ? 1 : currency?.usdExchangeRate || 1
  }, [currency?.quotaDisplayType, currency?.usdExchangeRate])

  const subscriptionQuery = useQuery({
    queryKey: ['frontend-subscription-hub-self'],
    queryFn: getSelfSubscriptionFull,
    staleTime: 30_000,
  })

  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => { fetchUser() }, [fetchUser])

  useEffect(() => {
    if (topupInfo && topupAmount === 0) {
      const minTopup = getMinTopupAmount(topupInfo)
      setTopupAmount(minTopup)
      void calculatePaymentAmount(minTopup, getDefaultPaymentType(topupInfo))
    }
  }, [topupInfo, topupAmount, calculatePaymentAmount])

  const getCurrentPaymentType = useCallback(() => {
    return selectedPaymentMethod?.type || getDefaultPaymentType(topupInfo)
  }, [selectedPaymentMethod, topupInfo])

  const handleSelectPreset = (preset: PresetAmount) => {
    setTopupAmount(preset.value)
    setSelectedPreset(preset.value)
    setCustomAmount('')
    void calculatePaymentAmount(preset.value, getCurrentPaymentType())
  }

  const handleCustomAmountChange = (val: string) => {
    setCustomAmount(val)
    setSelectedPreset(null)
    const num = Number(val)
    if (Number.isFinite(num) && num > 0) {
      setTopupAmount(num)
      void calculatePaymentAmount(num, getCurrentPaymentType())
    }
  }

  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    setSelectedPaymentMethod(method)
    setPaymentLoading(method.type)
    try {
      const minTopup = getMinTopupAmount(topupInfo)
      if (topupAmount < minTopup) return
      await calculatePaymentAmount(topupAmount, method.type)
      setConfirmDialogOpen(true)
    } finally {
      setPaymentLoading(null)
    }
  }

  const handlePaymentConfirm = async () => {
    if (!selectedPaymentMethod) return
    const isPancake = isWaffoPancakePayment(selectedPaymentMethod.type)
    const success = isPancake
      ? await processWaffoPancakePayment(topupAmount)
      : await processPayment(topupAmount, selectedPaymentMethod.type)
    if (success) {
      setConfirmDialogOpen(false)
      await fetchUser()
    }
  }

  const handleRedeem = async () => {
    if (!redemptionCode) return
    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      await fetchUser()
    }
  }

  const handleTransfer = async (amount: number) => {
    const success = await transferQuota(amount)
    if (success) await fetchUser()
    return success
  }

  const handleTopup = () => {
    const methods = topupInfo?.pay_methods ?? []
    if (methods.length === 1) {
      handlePaymentMethodSelect(methods[0])
    } else if (methods.length > 1 && selectedPaymentMethod) {
      handlePaymentMethodSelect(selectedPaymentMethod)
    } else if (methods.length > 1) {
      handlePaymentMethodSelect(methods[0])
    }
  }

  const copyInviteLink = () => {
    if (!affiliateLink) return
    navigator.clipboard.writeText(affiliateLink)
    setCopied(true)
    toast.success(t('portal.page.topup.linkCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const getDiscountRate = useCallback(() => {
    return topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE
  }, [topupInfo, topupAmount])

  const balance = formatQuota(user?.quota ?? 0)
  const minTopup = getMinTopupAmount(topupInfo)
  const hasRechargeOptions = !!topupInfo?.enable_online_topup || !!topupInfo?.enable_stripe_topup
  const allSubscriptions = subscriptionQuery.data?.data?.all_subscriptions ?? []

  const {
    records,
    total,
    keyword,
    loading: billingLoading,
    handleSearch,
    refresh: refreshBilling,
  } = useBillingHistory({ initialPageSize: 5 })

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">{t('portal.page.topup.title')}</h1>
          <p className="mt-1 text-sm text-white/40">{t('portal.page.topup.subtitle')}</p>
        </div>

        {/* Balance + Preset Amounts */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs text-white/40">{t('portal.page.topup.currentBalance')}</p>
            <button
              type="button"
              onClick={() => void fetchUser()}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              {t('portal.page.topup.topupHistory')} &gt;
            </button>
          </div>
          <div className="mb-5 flex items-center gap-2">
            <p className="text-3xl font-bold text-purple-400">{userLoading ? '--' : balance}</p>
            <button type="button" onClick={() => void fetchUser()} className="text-white/40 hover:text-white/60">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-3 text-xs text-white/40">{t('portal.page.topup.selectAmount')}</p>
          <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {presetAmounts.map((preset) => {
              const active = selectedPreset === preset.value && !customAmount
              const discount = preset.discount && preset.discount !== 1
                ? `+${((preset.discount - 1) * 100).toFixed(0)}%`
                : null
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`relative rounded-lg border p-3 text-left transition ${
                    active
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <p className="text-lg font-bold text-white">${preset.value}</p>
                  {discount && (
                    <span className="absolute right-2 top-2 text-[10px] font-medium text-orange-400">{discount}</span>
                  )}
                  {active && (
                    <span className="absolute right-2 bottom-2 flex h-4 w-4 items-center justify-center rounded-full bg-purple-500">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => { setSelectedPreset(null); setCustomAmount(String(topupAmount || '')) }}
              className={`rounded-lg border p-3 text-left transition ${
                customAmount
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              <p className="text-sm font-bold text-white">{t('portal.page.topup.customAmount')}</p>
              <p className="mt-0.5 text-[10px] text-white/40">{t('portal.page.topup.enterAnyAmount')}</p>
            </button>
          </div>

          {customAmount !== '' && (
            <div className="mb-5">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                min={minTopup}
                placeholder={`${t('portal.page.topup.minimum')} $${minTopup}`}
                className="w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
          )}

          {/* Payment Methods */}
          <div className="mb-5">
            <p className="mb-2 text-xs text-white/40">{t('portal.page.topup.paymentMethod')}</p>
            <div className="flex flex-wrap gap-2">
              {(topupInfo?.pay_methods ?? []).map((method) => (
                <button
                  key={method.type}
                  type="button"
                  onClick={() => setSelectedPaymentMethod(method)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition ${
                    selectedPaymentMethod?.type === method.type
                      ? 'border-purple-500 bg-purple-500/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20'
                  }`}
                >
                  {method.icon && <img src={method.icon} alt="" className="h-5 w-5" />}
                  {method.name}
                </button>
              ))}
              {(!topupInfo?.pay_methods || topupInfo.pay_methods.length === 0) && (
                <span className="text-sm text-white/40">{t('portal.page.topup.noPaymentMethods')}</span>
              )}
            </div>
          </div>

          {/* Topup Button */}
          <button
            type="button"
            onClick={handleTopup}
            disabled={!hasRechargeOptions || topupAmount < minTopup || !!paymentLoading}
            className="w-full rounded-lg bg-emerald-500 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:px-16"
          >
            {paymentLoading ? t('portal.page.topup.processing') : t('portal.page.topup.topupNow')}
          </button>
        </div>

        {/* Subscription Plans + Referral */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          {/* Plans */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">{t('portal.page.topup.subscriptionPlans')}</h3>
                <p className="mt-0.5 text-xs text-white/40">{t('portal.page.topup.subscriptionDesc')}</p>
              </div>
            </div>
            {allSubscriptions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {allSubscriptions.slice(0, 4).map((plan: any, i: number) => {
                  const colors = ['text-white/70', 'text-orange-400', 'text-purple-400', 'text-yellow-400']
                  return (
                    <div key={plan.id || i} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                      <p className={`text-sm font-semibold ${colors[i % 4]}`}>{plan.name || `${t('portal.page.topup.plan')} ${i + 1}`}</p>
                      <p className="mt-0.5 text-xs text-white/40">{plan.description || ''}</p>
                      <p className="mt-3">
                        <span className={`text-xl font-bold ${colors[i % 4]}`}>
                          ${((plan.price ?? 0) / 100).toFixed(1)}
                        </span>
                        <span className="text-xs text-white/40"> /{t('portal.page.topup.month')}</span>
                      </p>
                      <button
                        type="button"
                        className="mt-4 w-full rounded-lg bg-purple-600 py-2 text-xs font-medium text-white transition hover:bg-purple-700"
                      >
                        {t('portal.page.topup.selectPlan')}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10">
                <p className="text-sm text-white/40">{t('portal.page.topup.noPlans')}</p>
              </div>
            )}
          </div>

          {/* Referral Sidebar */}
          <div className="space-y-4">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
              <h3 className="text-base font-semibold text-white">{t('portal.page.topup.referral')}</h3>
              <p className="mt-0.5 text-xs text-white/40">{t('portal.page.topup.referralDesc')}</p>

              <div className="mt-4">
                <p className="mb-1.5 text-xs text-white/40">{t('portal.page.topup.myInviteLink')}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60 font-mono">
                    {affiliateLink || t('portal.page.topup.generating')}
                  </div>
                  <button
                    type="button"
                    onClick={copyInviteLink}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{user?.aff_count ?? 0}</p>
                  <p className="text-[10px] text-white/40">{t('portal.page.topup.totalInvites')}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{user?.aff_count ?? 0}</p>
                  <p className="text-[10px] text-white/40">{t('portal.page.topup.validInvites')}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-purple-400">
                    {formatQuota(user?.aff_history_quota ?? 0)}
                  </p>
                  <p className="text-[10px] text-white/40">{t('portal.page.topup.totalRewards')}</p>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-white/50">
                <p className="font-medium text-white/70">{t('portal.page.topup.rewardRules')}</p>
                <p className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-purple-400" />
                  {t('portal.page.topup.rule1')}
                </p>
                <p className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-purple-400" />
                  {t('portal.page.topup.rule2')}
                </p>
                <p className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-purple-400" />
                  {t('portal.page.topup.rule3')}
                </p>
              </div>

              <button
                type="button"
                onClick={copyInviteLink}
                className="mt-4 w-full rounded-lg bg-purple-600 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-purple-700"
              >
                <Users className="mr-1.5 inline h-3.5 w-3.5" />
                {t('portal.page.topup.inviteFriends')}
              </button>
            </div>
          </div>
        </div>

        {/* Order History */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">{t('portal.page.topup.orderHistory')}</h3>
            </div>
            <button
              type="button"
              onClick={() => void refreshBilling()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
            >
              <RefreshCw className="h-3 w-3" /> {t('portal.page.topup.refresh')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-white/40">
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.orderNo')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.type')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.product')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.amount')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.payMethod')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.status')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('portal.page.topup.createTime')}</th>
                </tr>
              </thead>
              <tbody>
                {billingLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-white/40">{t('portal.page.topup.loading')}</td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-white/40">{t('portal.page.topup.noOrders')}</td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const statusCfg = getStatusConfig(record.status)
                    return (
                      <tr key={record.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.02]">
                        <td className="px-3 py-3 font-mono text-xs text-white/60">{record.trade_no}</td>
                        <td className="px-3 py-3 text-xs text-white/60">{t('portal.page.topup.topup')}</td>
                        <td className="px-3 py-3 text-xs text-white/60">
                          {t('portal.page.topup.accountTopup')} ${record.money?.toFixed?.(0) ?? record.money}
                        </td>
                        <td className="px-3 py-3 text-xs text-white/80">
                          {formatCurrencyFromUSD(record.money, { digitsLarge: 2, digitsSmall: 2, abbreviate: false })}
                        </td>
                        <td className="px-3 py-3 text-xs text-white/60">{getPaymentMethodName(record.payment_method)}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs ${
                            record.status === 1 ? 'text-emerald-400' : 'text-white/50'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              record.status === 1 ? 'bg-emerald-400' : 'bg-white/30'
                            }`} />
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-white/40">{formatTimestamp(record.create_time)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {total > 5 && (
            <p className="mt-3 text-center text-xs text-purple-400 cursor-pointer hover:text-purple-300">
              {t('portal.page.topup.viewMore')} &gt;
            </p>
          )}
        </div>
      </div>

      <PaymentConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handlePaymentConfirm}
        topupAmount={topupAmount}
        paymentAmount={paymentAmount}
        paymentMethod={selectedPaymentMethod}
        calculating={calculating}
        processing={processing || pancakeProcessing}
        discountRate={getDiscountRate()}
        usdExchangeRate={effectiveUsdExchangeRate}
      />

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        availableQuota={user?.aff_quota ?? 0}
        transferring={transferring}
      />
    </>
  )
}
