import { createFileRoute } from '@tanstack/react-router'
import { PortalDocs } from '@/features/frontend-portal/portal-docs'

export const Route = createFileRoute('/portal/docs')({
  component: PortalDocs,
})
