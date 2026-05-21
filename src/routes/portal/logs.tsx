import { createFileRoute } from '@tanstack/react-router'
import { PortalLogs } from '@/features/frontend-portal/portal-logs'

export const Route = createFileRoute('/portal/logs')({
  component: PortalLogs,
})
