import { createFileRoute } from '@tanstack/react-router'
import { ModelMonitor } from '@/features/frontend-portal/model-monitor'

export const Route = createFileRoute('/portal/monitor')({
  component: ModelMonitor,
})
