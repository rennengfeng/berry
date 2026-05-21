import { createFileRoute } from '@tanstack/react-router'
import { PortalProfile } from '@/features/frontend-portal/portal-profile'

export const Route = createFileRoute('/portal/settings')({
  component: PortalProfile,
})
