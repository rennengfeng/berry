import { createFileRoute } from '@tanstack/react-router'
import { PortalDashboard } from '@/features/frontend-portal/portal-dashboard'

export const Route = createFileRoute('/portal/')({
  component: PortalDashboard,
})
