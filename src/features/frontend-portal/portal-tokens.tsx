import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { KeyRound, Search, Plus, CheckCircle, XCircle, Copy, Eye, EyeOff, Loader2, ArrowRightLeft, Power, PowerOff, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiKeysProvider, useApiKeys } from '@/features/keys/components/api-keys-provider'
import { ApiKeysMutateDrawer } from '@/features/keys/components/api-keys-mutate-drawer'
import { CCSwitchDialog } from '@/features/keys/components/dialogs/cc-switch-dialog'
import { deleteApiKey, updateApiKeyStatus } from '@/features/keys/api'
import { quotaUnitsToDollars } from '@/lib/format'
import type { ApiKey } from '@/features/keys/types'

export function PortalTokens() {
  return (
    <ApiKeysProvider>
      <PortalTokensInner />
    </ApiKeysProvider>
  )
}

function PortalTokensInner() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null)
  const pageSize = 20

  const { resolveRealKey, resolvedKeys, loadingKeys, markKeyCopied, copiedKeyId } = useApiKeys()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portal-tokens', page, search],
    queryFn: async () => {
      const params: Record<string, unknown> = { p: page, size: pageSize }
      if (search) params.keyword = search
      const res = await api.get('/api/token/', { params })
      return res.data?.data as { items?: ApiKey[]; total?: number } | undefined
    },
    staleTime: 15_000,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const enabled = items.filter((tk) => tk.status === 1).length
  const disabled = items.filter((tk) => tk.status !== 1).length

  const handleCopyKey = async (token: ApiKey) => {
    let key = resolvedKeys[token.id]
    if (!key) {
      key = (await resolveRealKey(token.id)) ?? ''
    }
    if (key) {
      navigator.clipboard.writeText(key)
      markKeyCopied(token.id)
      toast.success(t('Copied'))
    }
  }

  const [hiddenKeys, setHiddenKeys] = useState<Record<number, boolean>>({})
  const [ccSwitchOpen, setCcSwitchOpen] = useState(false)
  const [ccSwitchKey, setCcSwitchKey] = useState('')

  const handleViewKey = async (token: ApiKey) => {
    if (resolvedKeys[token.id]) {
      setHiddenKeys((prev) => ({ ...prev, [token.id]: !prev[token.id] }))
      return
    }
    await resolveRealKey(token.id)
  }

  const handleDisable = async (token: ApiKey) => {
    const newStatus = token.status === 1 ? 2 : 1
    const res = await updateApiKeyStatus(token.id, newStatus)
    if (res.success) {
      toast.success(newStatus === 1 ? t('Enabled') : t('Disabled'))
      refetch()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const handleDelete = async (token: ApiKey) => {
    if (!confirm(t('Are you sure you want to delete token "{{name}}"? This action cannot be undone.', { name: token.name }))) return
    const res = await deleteApiKey(token.id)
    if (res.success) {
      toast.success(t('Deleted'))
      refetch()
    } else {
      toast.error(res.message || t('Delete failed'))
    }
  }

  const handleCcSwitch = async (token: ApiKey) => {
    let key = resolvedKeys[token.id]
    if (!key) {
      key = (await resolveRealKey(token.id)) ?? ''
    }
    if (key) {
      setCcSwitchKey(key)
      setCcSwitchOpen(true)
    }
  }

  const handleEdit = (token: ApiKey) => {
    setEditingKey(token)
    setDrawerOpen(true)
  }

  const handleCreate = () => {
    setEditingKey(null)
    setDrawerOpen(true)
  }

  const formatQuota = (token: ApiKey) => {
    if (token.unlimited_quota) return t('Unlimited')
    const remaining = quotaUnitsToDollars(token.remain_quota)
    const used = quotaUnitsToDollars(token.used_quota)
    const total = remaining + used
    return `$${remaining.toFixed(2)} / $${total.toFixed(2)}`
  }

  const formatModels = (token: ApiKey) => {
    if (!token.model_limits_enabled || !token.model_limits) return t('Unlimited')
    const models = token.model_limits.split(',').filter(Boolean)
    if (models.length <= 2) return models.join(', ')
    return `${models.slice(0, 2).join(', ')} +${models.length - 2}`
  }

  const getStatusLabel = (status: number) => {
    switch (status) {
      case 1: return { text: t('Enabled'), cls: 'bg-green-500/10 text-green-400' }
      case 2: return { text: t('Disabled'), cls: 'bg-red-500/10 text-red-400' }
      case 3: return { text: t('Expired'), cls: 'bg-orange-500/10 text-orange-400' }
      case 4: return { text: t('Exhausted'), cls: 'bg-yellow-500/10 text-yellow-400' }
      default: return { text: t('Unknown'), cls: 'bg-gray-500/10 text-gray-400' }
    }
  }

  const statsCards = [
    { icon: KeyRound, label: t('Total Tokens'), value: total, color: 'text-purple-400', bg: 'from-purple-500/20 to-purple-600/10' },
    { icon: CheckCircle, label: t('Enabled'), value: enabled, color: 'text-green-400', bg: 'from-green-500/20 to-green-600/10' },
    { icon: XCircle, label: t('Disabled'), value: disabled, color: 'text-orange-400', bg: 'from-orange-500/20 to-orange-600/10' },
  ]

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('API Keys')}</h1>
          <p className="mt-1 text-sm text-white/40">{t('Create and manage your API access tokens for secure API calls')}</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-purple-500"
        >
          <Plus className="h-4 w-4" />
          {t('Create Token')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {statsCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${card.bg}`}>
                <Icon className={`h-4.5 w-4.5 ${card.color}`} />
              </div>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              <p className="mt-0.5 text-xs text-white/40">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Token List */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
        {/* Search */}
        <div className="mb-4 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder={t('Search token name...')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-64 rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
          </div>
          <span className="text-xs text-white/40">{t('{{count}} tokens total', { count: total })}</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="py-8 text-center text-sm text-white/50">{t('Loading...')}</p>
        ) : items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-white/40">
                  <th className="px-3 py-2.5 text-center">{t('Name')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Status')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Quota')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Group')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Key')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Models')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((token) => {
                  const status = getStatusLabel(token.status)
                  const fullKey = resolvedKeys[token.id]
                  const isLoadingKey = loadingKeys[token.id]
                  const isCopied = copiedKeyId === token.id
                  const isHidden = !fullKey || hiddenKeys[token.id]
                  return (
                    <tr key={token.id} className="border-b border-white/5 text-white/70 transition hover:bg-white/[0.03]">
                      <td className="px-3 py-3 text-center">
                        <span className="font-medium text-white/90">{token.name}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${status.cls}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-white/60">
                        {formatQuota(token)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {token.group ? (
                          <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-300">
                            {token.group}
                          </span>
                        ) : (
                          <span className="text-xs text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <code className="max-w-[200px] truncate rounded bg-white/5 px-1.5 py-0.5 text-xs text-white/50">
                            {fullKey && !isHidden ? fullKey : `sk-...${token.key.slice(-4)}`}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleViewKey(token)}
                            className="text-white/30 transition hover:text-white/60"
                            title={fullKey && !isHidden ? t('Hide key') : t('Show full key')}
                          >
                            {isLoadingKey ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : fullKey && !isHidden ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyKey(token)}
                            className={`transition ${isCopied ? 'text-green-400' : 'text-white/30 hover:text-white/60'}`}
                            title={t('Copy')}
                          >
                            {isCopied ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-white/50" title={token.model_limits || ''}>
                          {formatModels(token)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDisable(token)}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                              token.status === 1
                                ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300'
                                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 hover:text-green-300'
                            }`}
                          >
                            {token.status === 1 ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                            {token.status === 1 ? t('Disable') : t('Enable')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(token)}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 transition hover:bg-blue-500/20 hover:text-blue-300"
                          >
                            <Pencil className="h-3 w-3" />
                            {t('Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCcSwitch(token)}
                            className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-400 transition hover:bg-cyan-500/20 hover:text-cyan-300"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            {t('Import CCS')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(token)}
                            className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                          >
                            <Trash2 className="h-3 w-3" />
                            {t('Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10">
            <div className="text-center">
              <KeyRound className="mx-auto mb-2 h-8 w-8 text-white/20" />
              <p className="text-sm font-medium text-white/50">{t('No tokens yet')}</p>
              <p className="mt-1 text-xs text-white/30">{t('Click the button above to create your first token')}</p>
            </div>
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-white/40">
            <span>{t('{{count}} records total', { count: total })}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-30"
              >
                {t('Previous')}
              </button>
              <span className="text-white/60">{t('Page {{page}}', { page })}</span>
              <button
                type="button"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-30"
              >
                {t('Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      <ApiKeysMutateDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) {
            setEditingKey(null)
            refetch()
          }
        }}
        currentRow={editingKey ?? undefined}
      />

      <CCSwitchDialog
        open={ccSwitchOpen}
        onOpenChange={setCcSwitchOpen}
        tokenKey={ccSwitchKey}
      />
    </div>
  )
}
