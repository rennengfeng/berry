import { useAuthStore } from '@/stores/auth-store'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Shield } from 'lucide-react'

export function PortalSettings() {
  const { auth } = useAuthStore((s) => s.auth)
  const navigate = useNavigate()

  const handleSignOut = () => {
    auth.reset()
    navigate({ to: '/sign-in' })
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-lg font-semibold text-white/90">设置中心</h2>
        <p className="mt-1 text-sm text-white/50">管理账户偏好设置</p>
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
