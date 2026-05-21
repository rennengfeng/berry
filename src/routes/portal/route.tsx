import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { PortalLayout } from '@/features/frontend-portal/portal-layout'
import { useAuthStore } from '@/stores/auth-store'
import { getSelf } from '@/lib/api'
import { ROLE } from '@/lib/roles'

export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user) {
      try {
        const res = await getSelf()
        if (res?.success && res.data) {
          auth.setUser(res.data)
        } else {
          useAuthStore.getState().auth.reset()
          throw redirect({ to: '/sign-in', search: { redirect: '/portal' } })
        }
      } catch (e) {
        if (e instanceof Error || !(e && typeof e === 'object' && 'to' in e)) {
          useAuthStore.getState().auth.reset()
          throw redirect({ to: '/sign-in', search: { redirect: '/portal' } })
        }
        throw e
      }
    }

    const user = useAuthStore.getState().auth.user
    if (user && user.role >= ROLE.ADMIN) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: PortalRoute,
})

function PortalRoute() {
  return (
    <PortalLayout>
      <Outlet />
    </PortalLayout>
  )
}
