import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { KeyRound, Search, Plus, CheckCircle, XCircle, Copy, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiKeysProvider, useApiKeys } from '@/features/keys/components/api-keys-provider'
import { ApiKeysMutateDrawer } from '@/features/keys/components/api-keys-mutate-drawer'
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
  const enabled = items.filter((t) => t.status === 1).length
  const disabled = items.filter((t) => t.status !== 1).length

  const handleCopyKey = async (token: ApiKey) => {
    let key = resolvedKeys[token.id]
    if (!key) {
      key = (await resolveRealKey(token.id)) ?? ''
    }
    if (key) {
      navigator.clipboard.writeText(key)
      markKeyCopied(token.id)
      toast.success('已复制到剪贴板')
    }
  }

  const [hiddenKeys, setHiddenKeys] = useState<Record<number, boolean>>({})

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
      toast.success(newStatus === 1 ? '已启用' : '已禁用')
      refetch()
    } else {
      toast.error(res.message || '操作失败')
    }
  }

  const handleDelete = async (token: ApiKey) => {
    if (!confirm(`确定要删除令牌 "${token.name}" 吗？此操作不可撤销。`)) return
    const res = await deleteApiKey(token.id)
    if (res.success) {
      toast.success('已删除')
      refetch()
    } else {
      toast.error(res.message || '删除失败')
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
    if (token.unlimited_quota) return '无限额度'
    const remaining = quotaUnitsToDollars(token.remain_quota)
    const used = quotaUnitsToDollars(token.used_quota)
    const total = remaining + used
    return `$${remaining.toFixed(2)} / $${total.toFixed(2)}`
  }

  const formatModels = (token: ApiKey) => {
    if (!token.model_limits_enabled || !token.model_limits) return '无限制'
    const models = token.model_limits.split(',').filter(Boolean)
    if (models.length <= 2) return models.join(', ')
    return `${models.slice(0, 2).join(', ')} +${models.length - 2}`
  }

  const getStatusLabel = (status: number) => {
    switch (status) {
      case 1: return { text: '已启用', cls: 'bg-green-500/10 text-green-400' }
      case 2: return { text: '已禁用', cls: 'bg-red-500/10 text-red-400' }
      case 3: return { text: '已过期', cls: 'bg-orange-500/10 text-orange-400' }
      case 4: return { text: '已耗尽', cls: 'bg-yellow-500/10 text-yellow-400' }
      default: return { text: '未知', cls: 'bg-gray-500/10 text-gray-400' }
    }
  }

  const statsCards = [
    { icon: KeyRound, label: '总令牌', value: total, color: 'text-purple-400', bg: 'from-purple-500/20 to-purple-600/10' },
    { icon: CheckCircle, label: '已启用', value: enabled, color: 'text-green-400', bg: 'from-green-500/20 to-green-600/10' },
    { icon: XCircle, label: '已禁用', value: disabled, color: 'text-orange-400', bg: 'from-orange-500/20 to-orange-600/10' },
  ]

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">令牌管理</h1>
          <p className="mt-1 text-sm text-white/40">创建和管理您的 API 访问令牌，用于安全调用 API 服务</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-purple-500"
        >
          <Plus className="h-4 w-4" />
          创建令牌
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
              placeholder="搜索令牌名称..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-64 rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
          </div>
          <span className="text-xs text-white/40">共 {total} 个令牌</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="py-8 text-center text-sm text-white/50">加载中...</p>
        ) : items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-white/40">
                  <th className="px-3 py-2.5">名称</th>
                  <th className="px-3 py-2.5">状态</th>
                  <th className="px-3 py-2.5">额度</th>
                  <th className="px-3 py-2.5">分组</th>
                  <th className="px-3 py-2.5">密钥</th>
                  <th className="px-3 py-2.5">可用模型</th>
                  <th className="px-3 py-2.5">操作</th>
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
                      <td className="px-3 py-3">
                        <span className="font-medium text-white/90">{token.name}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${status.cls}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-white/60">
                        {formatQuota(token)}
                      </td>
                      <td className="px-3 py-3">
                        {token.group ? (
                          <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-300">
                            {token.group}
                          </span>
                        ) : (
                          <span className="text-xs text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="max-w-[200px] truncate rounded bg-white/5 px-1.5 py-0.5 text-xs text-white/50">
                            {fullKey && !isHidden ? fullKey : `sk-...${token.key.slice(-4)}`}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleViewKey(token)}
                            className="text-white/30 transition hover:text-white/60"
                            title={fullKey && !isHidden ? '隐藏密钥' : '查看完整密钥'}
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
                            title="复制"
                          >
                            {isCopied ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-white/50" title={token.model_limits || ''}>
                          {formatModels(token)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleDisable(token)}
                            className={`text-xs font-medium transition ${
                              token.status === 1
                                ? 'text-orange-400 hover:text-orange-300'
                                : 'text-green-400 hover:text-green-300'
                            }`}
                          >
                            {token.status === 1 ? '禁用' : '启用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(token)}
                            className="text-xs font-medium text-blue-400 transition hover:text-blue-300"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(token)}
                            className="text-xs font-medium text-red-400 transition hover:text-red-300"
                          >
                            删除
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
              <p className="text-sm font-medium text-white/50">暂无令牌</p>
              <p className="mt-1 text-xs text-white/30">点击上方按钮创建您的第一个令牌</p>
            </div>
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-white/40">
            <span>共 {total} 条记录</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-30"
              >
                上一页
              </button>
              <span className="text-white/60">第 {page} 页</span>
              <button
                type="button"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-30"
              >
                下一页
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
    </div>
  )
}
