import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, User, Shield, Bell } from 'lucide-react'

export function PortalSettings() {
  const { user, auth } = useAuthStore((s) => s.auth)
  const navigate = useNavigate()

  const handleSignOut = () => {
    auth.reset()
    navigate({ to: '/sign-in' })
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-lg font-semibold text-white/90">设置中心</h2>
        <p className="mt-1 text-sm text-white/50">管理账户信息与偏好设置</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-rose-500 text-lg font-bold text-white">
            {(user?.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-base font-semibold text-white/90">{user?.display_name || user?.username || 'User'}</p>
            <p className="text-sm text-white/50">{user?.email || '未绑定邮箱'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/80">
          <User className="h-4 w-4" /> 账户信息
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-4 py-3">
            <span className="text-sm text-white/60">用户名</span>
            <span className="text-sm text-white/90">{user?.username || '-'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-4 py-3">
            <span className="text-sm text-white/60">邮箱</span>
            <span className="text-sm text-white/90">{user?.email || '未绑定'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-4 py-3">
            <span className="text-sm text-white/60">角色</span>
            <span className="text-sm text-white/90">{user?.role === 100 ? '管理员' : '普通用户'}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/80">
          <Shield className="h-4 w-4" /> 安全
        </h3>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </div>
  )
}
