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
 * 原生（官方）路由守卫 —— 有对应二开页面的：非管理员重定向到该二开页。
 *   - 默认 fallback = /portal（二开门户首页；未登录会再被 portal 守卫导到登录页）
 *   - 模型相关原生页（/pricing 等）传 /portal/models
 */
export function requireAdmin(fallback: string = '/portal') {
  const { auth } = useAuthStore.getState()
  if (!auth.user || !auth.accessToken || auth.user.role < ROLE.ADMIN) {
    throw redirect({ to: fallback })
  }
}

/**
 * 原生（官方）路由守卫 —— 没有对应二开页面的：直接拦截。
 * 未登录 → 登录页；已登录非管理员 → 403。
 */
export function requireAdminBlock() {
  const { auth } = useAuthStore.getState()
  if (!auth.user || !auth.accessToken) {
    throw redirect({ to: '/sign-in' })
  }
  if (auth.user.role < ROLE.ADMIN) {
    throw redirect({ to: '/403' })
  }
}
