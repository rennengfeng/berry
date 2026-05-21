import { createFileRoute } from '@tanstack/react-router'
import { SubscriptionHub } from '@/features/frontend-portal/subscription-hub'

export const Route = createFileRoute('/portal/topup')({
  component: SubscriptionHub,
})
