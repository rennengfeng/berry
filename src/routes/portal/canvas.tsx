import { createFileRoute } from '@tanstack/react-router'
import { InfiniteCanvas } from '@/features/frontend-portal/infinite-canvas'

export const Route = createFileRoute('/portal/canvas')({
  component: InfiniteCanvas,
})
