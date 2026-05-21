import { createFileRoute } from '@tanstack/react-router'
import { ModelSquare } from '@/features/frontend-portal/model-square'

export const Route = createFileRoute('/portal/models')({
  component: ModelSquare,
})
