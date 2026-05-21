import { createFileRoute } from '@tanstack/react-router'
import { PortalAffiliate } from '@/features/frontend-portal/portal-affiliate'

export const Route = createFileRoute('/portal/affiliate')({
  component: PortalAffiliate,
})
