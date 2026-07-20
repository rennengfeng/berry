import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, RefreshCw } from 'lucide-react'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useSystemConfig } from '@/hooks/use-system-config'
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
import { getSelfSubscriptionFull, getPublicPlans } from '@/features/subscriptions/api'
import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import { formatDuration, formatResetPeriod } from '@/features/subscriptions/lib'
import type { PlanRecord } from '@/features/subscriptions/types'

export function SubscriptionHub() {
  const { t } = useTranslation()
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

  const { topupInfo, presetAmounts } = useTopupInfo()
  const {
    amount: paymentAmount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
  } = usePayment()
  const { transferQuota, transferring } = useAffiliate()
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

  const plansQuery = useQuery({
    queryKey: ['frontend-subscription-hub-plans'],
    queryFn: getPublicPlans,
    staleTime: 60_000,
  })

  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanRecord | null>(null)

  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch {
      setUser(null)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (topupInfo && topupAmount === 0) {
      const minTopup = getMinTopupAmount(topupInfo)
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const getDiscountRate = useCallback(() => {
    return topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE
  }, [topupInfo, topupAmount])

  const balance = formatQuota(user?.quota ?? 0)
  const minTopup = getMinTopupAmount(topupInfo)
  const hasRechargeOptions = !!topupInfo?.enable_online_topup || !!topupInfo?.enable_stripe_topup
  const allSubscriptions = subscriptionQuery.data?.data?.all_subscriptions ?? []
  const publicPlans = plansQuery.data?.data ?? []

  const {
    records,
    total,
    loading: billingLoading,
    refresh: refreshBilling,
  } = useBillingHistory({ initialPageSize: 5 })

  const currentTimestamp = subscriptionQuery.dataUpdatedAt / 1000

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

          {/* Redemption Code */}
          <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <p className="mb-2 text-sm font-medium text-white/70">{t('portal.page.topup.haveCode')}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={redemptionCode}
                onChange={(e) => setRedemptionCode(e.target.value)}
                placeholder={t('portal.page.topup.enterCode')}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRedeem}
                disabled={!redemptionCode || redeeming}
                className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redeeming ? t('portal.page.topup.processing') : t('portal.page.topup.redeem')}
              </button>
            </div>
            {topupInfo?.topup_link && (
              <p className="mt-2 text-xs text-white/40">
                {t('Need a redemption code?')}{' '}
                <a
                  href={topupInfo.topup_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-purple-400 transition hover:text-purple-300 hover:underline"
                >
                  {t('Get one here')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            )}
          </div>
        </div>

        {/* Subscription Plans + My Subscriptions */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          {/* Plans */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5 min-h-[480px]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">{t('portal.page.topup.subscriptionPlans')}</h3>
                <p className="mt-0.5 text-xs text-white/40">{t('portal.page.topup.subscriptionDesc')}</p>
              </div>
            </div>
            {publicPlans.length > 0 ? (
              <div className="max-h-[420px] overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {publicPlans.map((p: PlanRecord, i: number) => {
                    const plan = p?.plan
                    if (!plan) return null
                    const price = Number(plan.price_amount || 0).toFixed(2)
                    const totalAmount = Number(plan.total_amount || 0)
                    const limit = Number(plan.max_purchase_per_user || 0)
                    const resetLabel = formatResetPeriod(plan, t)
                    const noReset = resetLabel === t('No Reset')
                    const benefits = [
                      { label: `${t('Validity Period')}: ${formatDuration(plan, t)}` },
                      !noReset ? { label: `${t('Quota Reset')}: ${resetLabel}` } : null,
                      { label: `${t('Total Quota')}: ${totalAmount > 0 ? formatQuota(totalAmount) : t('Unlimited')}` },
                      limit > 0 ? { label: `${t('Purchase Limit')}: ${limit}` } : null,
                      plan.upgrade_group ? { label: `${t('Upgrade Group')}: ${plan.upgrade_group}` } : null,
                    ].filter(Boolean) as { label: string }[]

                    return (
                      <div key={plan.id} className="flex aspect-[3/4] flex-col rounded-xl border border-white/8 bg-white/[0.02] p-4">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-orange-400">{plan.title || `${t('portal.page.topup.plan')} ${i + 1}`}</p>
                          <p className="mt-1.5 text-xs leading-relaxed text-white/70">{plan.subtitle || ''}</p>
                          <div className="mt-3 space-y-1.5">
                            {benefits.map((item) => (
                              <div key={item.label} className="flex items-center gap-2 text-xs text-white/60">
                                <Check className="h-3 w-3 shrink-0 text-blue-400" />
                                <span>{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-auto space-y-3">
                          <p>
                            <span className="text-sm font-semibold text-orange-400">
                              ${price}
                            </span>
                            <span className="text-xs text-white/40"> /{formatDuration(plan, t)}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => { setSelectedPlan(p); setPurchaseOpen(true) }}
                            className="w-full rounded-lg bg-purple-600 py-2 text-xs font-medium text-white transition hover:bg-purple-700"
                          >
                            {t('portal.page.topup.selectPlan')}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10">
                <p className="text-sm text-white/40">{t('portal.page.topup.noPlans')}</p>
              </div>
            )}
          </div>

          {/* My Subscriptions Sidebar */}
          <div className="flex flex-col">
            <div className="flex flex-1 flex-col rounded-xl border border-white/8 bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">{t('portal.page.topup.mySubscriptions')}</h3>
                <button
                  type="button"
                  onClick={() => void subscriptionQuery.refetch()}
                  className="text-white/40 hover:text-white/60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${subscriptionQuery.isFetching ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {allSubscriptions.length > 0 ? (
                <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar pr-1" style={{ maxHeight: '390px' }}>
                  {allSubscriptions.map((sub) => {
                    const subscription = sub.subscription
                    if (!subscription) return null
                    const totalAmount = Number(subscription.amount_total || 0)
                    const usedAmount = Number(subscription.amount_used || 0)
                    const isExpired = (subscription.end_time || 0) < currentTimestamp
                    const isCancelled = subscription.status === 'cancelled'
                    const isActive = subscription.status === 'active' && !isExpired
                    const remainDays = Math.max(
                      0,
                      Math.ceil(((subscription.end_time || 0) - currentTimestamp) / 86400)
                    )
                    const usagePercent = totalAmount > 0 ? Math.round((usedAmount / totalAmount) * 100) : 0

                    return (
                      <div key={subscription.id} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-white/80">
                            {subscription.upgrade_group || `${t('portal.page.topup.subscription')} #${subscription.id}`}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isActive
                              ? 'bg-green-500/10 text-green-400'
                              : isCancelled
                                ? 'bg-gray-500/10 text-gray-400'
                                : 'bg-orange-500/10 text-orange-400'
                          }`}>
                            {isActive ? t('portal.page.topup.active') : isCancelled ? t('portal.page.topup.cancelled') : t('portal.page.topup.expired')}
                          </span>
                        </div>

                        {isActive && (
                          <p className="mt-1.5 text-[11px] text-white/40">
                            {t('portal.page.topup.daysRemaining', { count: remainDays })}
                          </p>
                        )}

                        <p className="mt-1 text-[11px] text-white/40">
                          {isActive ? t('portal.page.topup.validUntil') : isCancelled ? t('portal.page.topup.cancelledAt') : t('portal.page.topup.expiredAt')}{' '}
                          {new Date((subscription.end_time || 0) * 1000).toLocaleDateString()}
                        </p>

                        {totalAmount > 0 && (
                          <>
                            <div className="mt-2 flex items-center justify-between text-[11px]">
                              <span className="text-white/40">{t('portal.page.topup.quotaUsage')}</span>
                              <span className="text-white/60">{formatQuota(usedAmount)} / {formatQuota(totalAmount)}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-orange-400' : 'bg-purple-500'}`}
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                              />
                            </div>
                          </>
                        )}
                        {totalAmount === 0 && (
                          <p className="mt-2 text-[11px] text-white/40">{t('portal.page.topup.quotaUnlimited')}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10">
                  <p className="text-xs text-white/40">{t('portal.page.topup.noActiveSubscriptions')}</p>
                </div>
              )}
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

      <SubscriptionPurchaseDialog
        open={purchaseOpen}
        onOpenChange={(open) => {
          setPurchaseOpen(open)
          if (!open) {
            subscriptionQuery.refetch()
          }
        }}
        plan={selectedPlan}
        enableStripe={!!topupInfo?.enable_stripe_topup}
        enableCreem={!!topupInfo?.enable_creem_topup}
        enableOnlineTopUp={!!topupInfo?.enable_online_topup}
        epayMethods={(topupInfo?.pay_methods ?? []).filter(
          (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem'
        )}
      />
    </>
  )
}
