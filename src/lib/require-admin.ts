/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'

/**
 * 原生（官方）路由访问守卫：仅管理员可访问。
 * 未登录 → 跳登录页；已登录但非管理员 → 跳 403 拦截。
 * 用于 TanStack Router 的 beforeLoad。
 */
export function requireAdmin() {
  const { auth } = useAuthStore.getState()
  if (!auth.user) {
    throw redirect({ to: '/sign-in' })
  }
  if (auth.user.role < ROLE.ADMIN) {
    throw redirect({ to: '/403' })
  }
}
