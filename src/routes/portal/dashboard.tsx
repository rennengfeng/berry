import { createFileRoute } from '@tanstack/react-router'
import { PortalDataBoard } from '@/features/frontend-portal/portal-data-board'

export const Route = createFileRoute('/portal/dashboard')({
  component: PortalDataBoard,
})
