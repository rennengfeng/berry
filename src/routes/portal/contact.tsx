import { createFileRoute } from '@tanstack/react-router'
import { PortalContact } from '@/features/frontend-portal/portal-contact'

export const Route = createFileRoute('/portal/contact')({
  component: PortalContact,
})
