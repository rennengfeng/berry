import { createFileRoute } from '@tanstack/react-router'
import { PortalTokens } from '@/features/frontend-portal/portal-tokens'

export const Route = createFileRoute('/portal/tokens')({
  component: PortalTokens,
})
