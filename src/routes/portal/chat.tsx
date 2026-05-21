import { createFileRoute } from '@tanstack/react-router'
import { OnlineChat } from '@/features/frontend-portal/online-chat'

export const Route = createFileRoute('/portal/chat')({
  component: OnlineChat,
})
