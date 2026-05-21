/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Bot,
  Download,
  History,
  KeyRound,
  Layers3,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { FrontendPortalOnlineChatModuleId } from './types'
import {
  getApiKeySummaries,
  getFrontendModels,
  getTokenKey,
  openTokenChatCompletionStream,
  sendTokenChatCompletion,
} from './api'
import {
  type PortalTemplate,
  PortalShell,
  usePortalAppearance,
} from './portal-shell'
import { usePortalSettings } from './portal-settings'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind: 'welcome' | 'message'
}

type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

type StoredOnlineChatState = {
  activeSessionId?: string
  selectedTokenId?: string
  selectedModel?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
  messages?: ChatMessage[]
  sessions?: ChatSession[]
}

const STORAGE_KEY = 'frontend_portal_online_chat_state'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_STREAM = true
const DEFAULT_SESSION_TITLE = 'New chat'

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createMessage(
  role: ChatMessage['role'],
  content: string,
  kind: ChatMessage['kind'] = 'message'
): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    kind,
  }
}

function createWelcomeMessages(welcomeMessage: string): ChatMessage[] {
  return [createMessage('assistant', welcomeMessage, 'welcome')]
}

function createSession(welcomeMessage: string, title = DEFAULT_SESSION_TITLE) {
  const now = Date.now()
  return {
    id: createId(),
    title,
    messages: createWelcomeMessages(welcomeMessage),
    createdAt: now,
    updatedAt: now,
  } satisfies ChatSession
}

function isWelcomeOnlyConversation(messages: ChatMessage[]): boolean {
  return (
    messages.length === 0 ||
    (messages.length === 1 && messages[0].kind === 'welcome')
  )
}

function deriveSessionTitle(
  messages: ChatMessage[],
  fallback = DEFAULT_SESSION_TITLE
) {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim().length > 0
  )

  if (!firstUserMessage) {
    return fallback
  }

  const singleLine = firstUserMessage.content.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= 28) {
    return singleLine
  }
  return `${singleLine.slice(0, 28)}...`
}

function sanitizeStoredMessages(
  value: unknown,
  welcomeMessage: string
): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    return createWelcomeMessages(welcomeMessage)
  }

  const parsed = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const record = item as Record<string, unknown>
      const role = record.role
      const content = record.content
      const kind = record.kind

      if (
        (role !== 'user' && role !== 'assistant') ||
        typeof content !== 'string' ||
        content.trim().length === 0
      ) {
        return null
      }

      return {
        id:
          typeof record.id === 'string' && record.id.length > 0
            ? record.id
            : createId(),
        role,
        content,
        kind: kind === 'welcome' ? 'welcome' : 'message',
      } satisfies ChatMessage
    })
    .filter((item): item is ChatMessage => item !== null)

  return parsed.length > 0 ? parsed : createWelcomeMessages(welcomeMessage)
}

function sanitizeStoredSessions(
  value: unknown,
  welcomeMessage: string,
  legacyMessages?: unknown
): ChatSession[] {
  if (!Array.isArray(value) || value.length === 0) {
    const migratedMessages = sanitizeStoredMessages(legacyMessages, welcomeMessage)
    return [
      {
        ...createSession(welcomeMessage),
        title: deriveSessionTitle(migratedMessages),
        messages: migratedMessages,
      },
    ]
  }

  const parsed = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const record = item as Record<string, unknown>
      const messages = sanitizeStoredMessages(record.messages, welcomeMessage)
      const createdAt =
        typeof record.createdAt === 'number' ? record.createdAt : Date.now()
      const updatedAt =
        typeof record.updatedAt === 'number' ? record.updatedAt : createdAt
      const fallbackTitle =
        typeof record.title === 'string' && record.title.trim().length > 0
          ? record.title.trim()
          : DEFAULT_SESSION_TITLE

      return {
        id:
          typeof record.id === 'string' && record.id.length > 0
            ? record.id
            : createId(),
        title: deriveSessionTitle(messages, fallbackTitle),
        messages,
        createdAt,
        updatedAt,
      } satisfies ChatSession
    })
    .filter((item): item is ChatSession => item !== null)

  return parsed.length > 0 ? parsed : [createSession(welcomeMessage)]
}

function loadStoredState(welcomeMessage: string): Required<StoredOnlineChatState> {
  if (typeof window === 'undefined') {
    const session = createSession(welcomeMessage)
    return {
      activeSessionId: session.id,
      selectedTokenId: '',
      selectedModel: '',
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      stream: DEFAULT_STREAM,
      messages: session.messages,
      sessions: [session],
    }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const session = createSession(welcomeMessage)
      return {
        activeSessionId: session.id,
        selectedTokenId: '',
        selectedModel: '',
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS,
        stream: DEFAULT_STREAM,
        messages: session.messages,
        sessions: [session],
      }
    }

    const parsed = JSON.parse(raw) as StoredOnlineChatState
    const sessions = sanitizeStoredSessions(
      parsed.sessions,
      welcomeMessage,
      parsed.messages
    )
    const matchedSession = sessions.some(
      (session) => session.id === parsed.activeSessionId
    )

    return {
      activeSessionId: matchedSession ? parsed.activeSessionId || sessions[0].id : sessions[0].id,
      selectedTokenId:
        typeof parsed.selectedTokenId === 'string' ? parsed.selectedTokenId : '',
      selectedModel:
        typeof parsed.selectedModel === 'string' ? parsed.selectedModel : '',
      temperature:
        typeof parsed.temperature === 'number'
          ? Math.min(2, Math.max(0, parsed.temperature))
          : DEFAULT_TEMPERATURE,
      maxTokens:
        typeof parsed.maxTokens === 'number' && parsed.maxTokens > 0
          ? Math.round(parsed.maxTokens)
          : DEFAULT_MAX_TOKENS,
      stream:
        typeof parsed.stream === 'boolean' ? parsed.stream : DEFAULT_STREAM,
      messages: sessions[0]?.messages ?? createWelcomeMessages(welcomeMessage),
      sessions,
    }
  } catch (error) {
    console.error('Failed to load frontend portal online chat state:', error)
    const session = createSession(welcomeMessage)
    return {
      activeSessionId: session.id,
      selectedTokenId: '',
      selectedModel: '',
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      stream: DEFAULT_STREAM,
      messages: session.messages,
      sessions: [session],
    }
  }
}

function formatSessionTime(timestamp: number) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp)
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}

function getSessionPreview(messages: ChatMessage[]) {
  const previewSource = [...messages]
    .reverse()
    .find((message) => message.kind !== 'welcome' && message.content.trim())

  if (!previewSource) {
    return 'Start a new conversation'
  }

  const singleLine = previewSource.content.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= 42) {
    return singleLine
  }
  return `${singleLine.slice(0, 42)}...`
}

function getTemplateInsetClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'rounded-xl border border-cyan-500/18 bg-slate-950/35'
  }
  if (template === 'paper') {
    return 'rounded-md border border-stone-300/80 bg-white/88'
  }
  return 'rounded-2xl border border-orange-200/60 bg-white/82 shadow-[0_16px_40px_rgba(251,146,60,0.06)]'
}

function getHeroMetricClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'rounded-xl border border-cyan-500/18 bg-slate-950/40 font-mono'
  }
  if (template === 'paper') {
    return 'rounded-md border border-stone-300/80 bg-white/92'
  }
  return 'rounded-[1.4rem] border border-orange-200/60 bg-white/84 shadow-[0_12px_32px_rgba(251,146,60,0.06)]'
}

function getMetaBadgeClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'border-cyan-400/18 bg-slate-950/44 font-mono text-cyan-50'
  }
  if (template === 'paper') {
    return 'border-stone-300/80 bg-white/92 text-stone-800'
  }
  return 'border-white/10 bg-white/5 text-white/80'
}

function getFieldClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'border-cyan-500/18 bg-slate-950/46'
  }
  if (template === 'paper') {
    return 'border-stone-300/80 bg-white/92'
  }
  return 'border-white/10 bg-white/5'
}

function getWorkspaceSurfaceClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'rounded-[1.1rem] border border-cyan-500/16 bg-slate-950/38'
  }
  if (template === 'paper') {
    return 'rounded-[0.95rem] border border-stone-300/80 bg-white/92'
  }
  return 'rounded-[1.35rem] border border-white/10 bg-white/5 backdrop-blur'
}

function getDialogSurfaceClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'border-cyan-500/18 bg-slate-950/96 text-cyan-50'
  }
  if (template === 'paper') {
    return 'border-stone-300/80 bg-[rgba(255,252,248,0.98)] text-stone-900'
  }
  return 'border-white/10 bg-[rgba(10,10,20,0.98)] text-white/90'
}

function getInteractiveHoverClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'hover:border-cyan-400/35 hover:bg-cyan-500/8'
  }
  if (template === 'paper') {
    return 'hover:border-stone-400/80 hover:bg-stone-100/85'
  }
  return 'hover:border-white/20 hover:bg-white/5'
}

function getAvatarSurfaceClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'border border-cyan-500/16 bg-slate-950/48 text-cyan-100'
  }
  if (template === 'paper') {
    return 'border border-stone-300/80 bg-white/92 text-stone-800'
  }
  return 'border border-white/10 bg-orange-500/15 text-orange-300'
}

function getAssistantBubbleClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'rounded-xl border border-cyan-500/16 bg-slate-950/50'
  }
  if (template === 'paper') {
    return 'rounded-md border border-stone-300/80 bg-stone-50'
  }
  return 'rounded-2xl border border-white/10 bg-white/5 text-white/90'
}

function getDangerActionClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'border-rose-500/30 bg-rose-950/28 text-rose-50 hover:bg-rose-900/35'
  }
  if (template === 'paper') {
    return 'border-rose-300/75 bg-rose-50/95 text-rose-900 hover:bg-rose-100/90'
  }
  return 'border-rose-200/80 bg-rose-50/95 text-rose-900 hover:bg-rose-100/92'
}

function HeroMetric(props: {
  label: string
  value: string
  hint: string
  icon: ComponentType<{ className?: string }>
  template: PortalTemplate
}) {
  const Icon = props.icon

  return (
    <div className={cn('p-4', getHeroMetricClass(props.template))}>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-[11px] uppercase tracking-[0.14em]'>
            {props.label}
          </p>
          <p className='mt-2 text-2xl font-semibold'>{props.value}</p>
          <p className='text-muted-foreground mt-2 text-xs leading-5'>
            {props.hint}
          </p>
        </div>
        <span className='bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl'>
          <Icon className='size-5' />
        </span>
      </div>
    </div>
  )
}

function QuickRoute(props: {
  eyebrow: string
  title: string
  description: string
  template: PortalTemplate
  href?: string
  onClick?: () => void
  emphasis?: 'primary' | 'default'
  disabled?: boolean
}) {
  const className = cn(
    'group block border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm',
    getHeroMetricClass(props.template),
    props.emphasis === 'primary' &&
      (props.template === 'console'
        ? 'border-cyan-400/24 bg-cyan-500/8'
        : props.template === 'paper'
          ? 'border-stone-400/80 bg-stone-50/95'
          : 'border-primary/15 bg-primary/5'),
    props.disabled && 'pointer-events-none opacity-60'
  )

  const content = (
    <>
      <p className='text-muted-foreground text-[11px] uppercase tracking-[0.16em]'>
        {props.eyebrow}
      </p>
      <div className='mt-2 flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-sm font-semibold'>{props.title}</p>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>
            {props.description}
          </p>
        </div>
        <ArrowRight className='text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-1' />
      </div>
    </>
  )

  if (props.href) {
    return (
      <a href={props.href} className={className}>
        {content}
      </a>
    )
  }

  return (
    <button type='button' className={className} onClick={props.onClick}>
      {content}
    </button>
  )
}

export function OnlineChat() {
  const appearance = usePortalAppearance()
  const { portal } = usePortalSettings()
  const onlineChat = portal.online_chat

  const initialState = useMemo(
    () => loadStoredState(onlineChat.welcome_message),
    [onlineChat.welcome_message]
  )

  const [activeSessionId, setActiveSessionId] = useState(
    initialState.activeSessionId
  )
  const [selectedTokenId, setSelectedTokenId] = useState(
    initialState.selectedTokenId
  )
  const [selectedModel, setSelectedModel] = useState(initialState.selectedModel)
  const [temperature, setTemperature] = useState(initialState.temperature)
  const [maxTokens, setMaxTokens] = useState(initialState.maxTokens)
  const [stream, setStream] = useState(initialState.stream)
  const [input, setInput] = useState('')
  const [sessions, setSessions] = useState<ChatSession[]>(initialState.sessions)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState('')
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const streamCloserRef = useRef<null | (() => void)>(null)
  const streamTargetRef = useRef<null | { sessionId: string; messageId: string }>(
    null
  )

  const keysQuery = useQuery({
    queryKey: ['frontend-api-keys'],
    queryFn: getApiKeySummaries,
  })
  const modelsQuery = useQuery({
    queryKey: ['frontend-models-for-chat'],
    queryFn: getFrontendModels,
    staleTime: 60_000,
  })

  useEffect(() => {
    const stored = loadStoredState(onlineChat.welcome_message)
    setActiveSessionId(stored.activeSessionId)
    setSelectedTokenId(stored.selectedTokenId)
    setSelectedModel(stored.selectedModel)
    setTemperature(stored.temperature)
    setMaxTokens(stored.maxTokens)
    setStream(stored.stream)
    setSessions(stored.sessions)
    setHasHydrated(true)
  }, [onlineChat.welcome_message])

  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return
    }

    const payload = {
      activeSessionId,
      selectedTokenId,
      selectedModel,
      temperature,
      maxTokens,
      stream,
      sessions,
    } satisfies Omit<StoredOnlineChatState, 'messages'>

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.error('Failed to save frontend portal online chat state:', error)
    }
  }, [
    activeSessionId,
    hasHydrated,
    maxTokens,
    selectedModel,
    selectedTokenId,
    sessions,
    stream,
    temperature,
  ])

  useEffect(() => {
    return () => {
      streamCloserRef.current?.()
      streamCloserRef.current = null
      streamTargetRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id ?? '')
    }
  }, [activeSessionId, sessions])

  useEffect(() => {
    if (!hasHydrated) {
      return
    }

    if (keysQuery.data?.length) {
      const matched = keysQuery.data.some(
        (item) => String(item.id) === selectedTokenId
      )
      if (!selectedTokenId || !matched) {
        setSelectedTokenId(String(keysQuery.data[0].id))
      }
    }
  }, [hasHydrated, keysQuery.data, selectedTokenId])

  useEffect(() => {
    if (!hasHydrated) {
      return
    }

    if (modelsQuery.data?.models?.length) {
      const matched = modelsQuery.data.models.some(
        (item) => item.model_name === selectedModel
      )
      if (!selectedModel || !matched) {
        setSelectedModel(modelsQuery.data.models[0].model_name)
      }
    }
  }, [hasHydrated, modelsQuery.data, selectedModel])

  useEffect(() => {
    if (!hasHydrated) {
      return
    }

    setSessions((current) =>
      current.map((session) =>
        isWelcomeOnlyConversation(session.messages)
          ? {
              ...session,
              messages: createWelcomeMessages(onlineChat.welcome_message),
              updatedAt: Date.now(),
            }
          : session
      )
    )
  }, [hasHydrated, onlineChat.welcome_message])

  const currentKey = useMemo(
    () =>
      (keysQuery.data ?? []).find((item) => String(item.id) === selectedTokenId),
    [keysQuery.data, selectedTokenId]
  )

  const currentSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions]
  )
  const currentMessages =
    currentSession?.messages ?? createWelcomeMessages(onlineChat.welcome_message)
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  )
  const activeSessionMessageCount =
    currentSession?.messages.filter((message) => message.kind !== 'welcome').length ?? 0
  const deleteTargetSession = useMemo(
    () => sessions.find((session) => session.id === deleteSessionId) ?? null,
    [deleteSessionId, sessions]
  )

  const enabledModules = onlineChat.modules.filter((item) => item.enabled)
  const chatPanelIndex = enabledModules.findIndex(
    (item) => item.id === 'chat_panel'
  )
  const sidebarModules =
    onlineChat.layout_mode === 'sidebar' && chatPanelIndex >= 0
      ? enabledModules.slice(0, chatPanelIndex)
      : []
  const trailingModules =
    onlineChat.layout_mode === 'sidebar' && chatPanelIndex >= 0
      ? enabledModules.slice(chatPanelIndex + 1)
      : []
  const showChatPanel = enabledModules.some((item) => item.id === 'chat_panel')
  const stackedModules =
    onlineChat.layout_mode === 'stacked' || !showChatPanel
      ? enabledModules
      : []

  const updateSession = (
    sessionId: string,
    updater: (session: ChatSession) => ChatSession
  ) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? updater(session) : session
      )
    )
  }

  const updateSessionMessages = (
    sessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => {
    updateSession(sessionId, (session) => {
      const nextMessages = updater(session.messages)
      return {
        ...session,
        messages: nextMessages,
        title: deriveSessionTitle(nextMessages, session.title),
        updatedAt: Date.now(),
      }
    })
  }

  const stopStreaming = (fallbackMessage?: string) => {
    streamCloserRef.current?.()
    streamCloserRef.current = null
    setIsStreaming(false)

    const target = streamTargetRef.current
    streamTargetRef.current = null

    if (!fallbackMessage || !target) {
      return
    }

    updateSessionMessages(target.sessionId, (messages) =>
      messages.map((message) =>
        message.id === target.messageId
          ? {
              ...message,
              content: message.content.trim() || fallbackMessage,
            }
          : message
      )
    )
  }

  const sendMutation = useMutation({
    mutationFn: async (params: {
      content: string
      sessionId: string
      requestMessages: ChatMessage[]
    }) => {
      const tokenId = Number(selectedTokenId)
      if (!tokenId) throw new Error('Please choose an API key first.')
      if (!selectedModel) throw new Error('Please choose a model first.')

      const token = await getTokenKey(tokenId)
      if (!token) throw new Error('Failed to read the selected API key.')

      return sendTokenChatCompletion({
        token,
        model: selectedModel,
        temperature,
        max_tokens: maxTokens > 0 ? maxTokens : undefined,
        messages: [
          {
            role: 'system',
            content: onlineChat.system_prompt,
          },
          ...params.requestMessages
            .filter((message) => message.kind !== 'welcome')
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        ],
      })
    },
    onSuccess: (response, variables) => {
      const content =
        response?.choices?.[0]?.message?.content ||
        response?.choices?.[0]?.text ||
        'The model returned successfully, but the response body was empty.'

      updateSessionMessages(variables.sessionId, (messages) => [
        ...messages,
        createMessage('assistant', content, 'message'),
      ])
    },
    onError: (error, variables) => {
      const message =
        error instanceof Error ? error.message : 'Failed to send the request.'
      toast.error(message)
      updateSessionMessages(variables.sessionId, (messages) => [
        ...messages,
        createMessage(
          'assistant',
          'Request failed. Please check the selected key, model permission, and upstream status, then try again.',
          'message'
        ),
      ])
    },
  })
  const isBusy = sendMutation.isPending || isStreaming

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [currentMessages, isStreaming, sendMutation.isPending])

  const handleStopGeneration = () => {
    if (!isStreaming) {
      return
    }
    stopStreaming('Generation stopped.')
  }

  const handleSend = () => {
    const content = input.trim()
    if (!content || isBusy || !currentSession) {
      return
    }
    if (!selectedTokenId) {
      toast.error('Please choose an API key first.')
      return
    }
    if (!selectedModel) {
      toast.error('Please choose a model first.')
      return
    }

    const sessionId = currentSession.id
    const userMessage = createMessage('user', content, 'message')
    const requestMessages = [...currentMessages, userMessage]

    setInput('')

    if (stream) {
      const assistantMessage = createMessage('assistant', '', 'message')
      updateSessionMessages(sessionId, (messages) => [
        ...messages,
        userMessage,
        assistantMessage,
      ])
      setIsStreaming(true)
      streamTargetRef.current = {
        sessionId,
        messageId: assistantMessage.id,
      }

      void getTokenKey(Number(selectedTokenId))
        .then((token) => {
          if (!token) {
            throw new Error('Failed to read the selected API key.')
          }

          streamCloserRef.current = openTokenChatCompletionStream({
            token,
            model: selectedModel,
            temperature,
            max_tokens: maxTokens > 0 ? maxTokens : undefined,
            messages: [
              {
                role: 'system',
                content: onlineChat.system_prompt,
              },
              ...requestMessages
                .filter((message) => message.kind !== 'welcome')
                .map((message) => ({
                  role: message.role,
                  content: message.content,
                })),
            ],
            onChunk: (chunk) => {
              updateSessionMessages(sessionId, (messages) =>
                messages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        content: message.content + chunk,
                      }
                    : message
                )
              )
            },
            onComplete: () => {
              streamCloserRef.current = null
              streamTargetRef.current = null
              setIsStreaming(false)
              updateSessionMessages(sessionId, (messages) =>
                messages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        content:
                          message.content.trim() ||
                          'The stream completed, but no content was returned.',
                      }
                    : message
                )
              )
            },
            onError: (message) => {
              toast.error(message)
              streamCloserRef.current = null
              streamTargetRef.current = null
              setIsStreaming(false)
              updateSessionMessages(sessionId, (messages) =>
                messages.map((currentMessage) =>
                  currentMessage.id === assistantMessage.id
                    ? {
                        ...currentMessage,
                        content:
                          currentMessage.content.trim() ||
                          'Request failed. Please check the selected key, model permission, and upstream status, then try again.',
                      }
                    : currentMessage
                )
              )
            },
          })
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to start the streaming request.'
          toast.error(message)
          streamCloserRef.current = null
          streamTargetRef.current = null
          setIsStreaming(false)
          updateSessionMessages(sessionId, (messages) =>
            messages.map((currentMessage) =>
              currentMessage.id === assistantMessage.id
                ? {
                    ...currentMessage,
                    content:
                      currentMessage.content.trim() ||
                      'Request failed. Please check the selected key, model permission, and upstream status, then try again.',
                  }
                : currentMessage
            )
          )
        })

      return
    }

    updateSessionMessages(sessionId, (messages) => [...messages, userMessage])
    sendMutation.mutate({
      content,
      sessionId,
      requestMessages,
    })
  }

  const handleClearConversation = () => {
    if (!currentSession) {
      return
    }
    setInput('')
    updateSession(currentSession.id, (session) => ({
      ...session,
      title: DEFAULT_SESSION_TITLE,
      messages: createWelcomeMessages(onlineChat.welcome_message),
      updatedAt: Date.now(),
    }))
  }

  const handleCreateSession = () => {
    if (isBusy) {
      return
    }
    const session = createSession(onlineChat.welcome_message)
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
    setInput('')
  }

  const handleStartRenameSession = (session: ChatSession) => {
    if (isBusy) {
      return
    }
    setRenamingSessionId(session.id)
    setRenamingTitle(session.title)
  }

  const handleCancelRenameSession = () => {
    setRenamingSessionId(null)
    setRenamingTitle('')
  }

  const handleSubmitRenameSession = () => {
    if (!renamingSessionId) {
      return
    }

    const nextTitle = renamingTitle.trim() || DEFAULT_SESSION_TITLE
    updateSession(renamingSessionId, (session) => ({
      ...session,
      title: nextTitle,
      updatedAt: Date.now(),
    }))
    setRenamingSessionId(null)
    setRenamingTitle('')
  }

  const exportSession = (session: ChatSession) => {
    if (typeof window === 'undefined') {
      return
    }

    const lines = [
      `# ${session.title}`,
      '',
      `Exported: ${new Date().toLocaleString()}`,
      `Updated: ${new Date(session.updatedAt).toLocaleString()}`,
      '',
      ...session.messages.flatMap((message) => [
        `## ${message.role === 'user' ? 'User' : 'Assistant'}`,
        '',
        message.content,
        '',
      ]),
    ]

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const safeTitle = session.title.replace(/[<>:"/\\|?*]+/g, '-')
    anchor.href = url
    anchor.download = `${safeTitle || 'chat-session'}.md`
    anchor.click()
    window.URL.revokeObjectURL(url)
    toast.success('Session exported.')
  }

  const handleDeleteSession = (sessionId: string) => {
    if (isBusy) {
      return
    }

    if (sessions.length === 1) {
      const replacement = createSession(onlineChat.welcome_message)
      setSessions([replacement])
      setActiveSessionId(replacement.id)
      setInput('')
      return
    }

    const remaining = sessions.filter((session) => session.id !== sessionId)
    setSessions(remaining)

    if (activeSessionId === sessionId) {
      const nextSession = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setActiveSessionId(nextSession?.id ?? '')
      setInput('')
    }
  }

  const handleConfirmDeleteSession = () => {
    if (!deleteSessionId) {
      return
    }
    handleDeleteSession(deleteSessionId)
    setDeleteSessionId(null)
  }

  const template = appearance.template
  const isConsole = template === 'console'
  const isPaper = template === 'paper'
  const sessionCount = sessions.length
  const totalMessages = sessions.reduce((count, session) => {
    return (
      count + session.messages.filter((message) => message.kind !== 'welcome').length
    )
  }, 0)
  const activeSessionPreview = currentSession
    ? getSessionPreview(currentSession.messages)
    : 'Start a new conversation'
  const activeSessionUpdatedAt = currentSession
    ? formatSessionTime(currentSession.updatedAt)
    : '--'
  const modelCount = modelsQuery.data?.models?.length ?? 0
  const keyCount = keysQuery.data?.length ?? 0
  const promptPresetCount = onlineChat.prompt_presets.length
  const heroMetrics = [
    {
      label: 'Active model',
      value: selectedModel || 'Choose a model',
      hint: `${modelCount} model route(s) available in the current portal scope.`,
      icon: Bot,
    },
    {
      label: 'Active key',
      value: currentKey?.name || 'Choose a key',
      hint: `${keyCount} key(s) available for in-site testing.`,
      icon: KeyRound,
    },
    {
      label: 'Sessions',
      value: `${sessionCount}`,
      hint: `${totalMessages} prompt/response message(s) stored locally.`,
      icon: History,
    },
    {
      label: 'Streaming mode',
      value: stream ? 'Enabled' : 'Disabled',
      hint: `Temperature ${temperature.toFixed(2)} · Max ${maxTokens} tokens.`,
      icon: SlidersHorizontal,
    },
  ]
  const chatRoutes = [
    {
      eyebrow: isConsole ? 'Route 01' : isPaper ? 'Fresh thread' : 'Primary route',
      title: 'Start a fresh session',
      description:
        'Open a clean thread when you want a separate prompt chain or a dedicated model test.',
      onClick: handleCreateSession,
      disabled: isBusy,
      emphasis: 'primary' as const,
    },
    {
      eyebrow: isConsole ? 'Route 02' : isPaper ? 'Archive it' : 'Save the run',
      title: 'Export the current thread',
      description:
        'Download the active conversation as Markdown so you can archive, review, or reuse it elsewhere.',
      onClick: () => currentSession && exportSession(currentSession),
      disabled: !currentSession || isBusy,
    },
    {
      eyebrow: isConsole ? 'Route 03' : isPaper ? 'Need setup help' : 'Portal support',
      title: 'Review models and setup guides',
      description:
        'Move to model square or docs center when you need pricing, endpoint, or onboarding context before another test.',
      href: '/model-square',
      disabled: false,
    },
  ]
  const templateEditorialNote = isConsole
    ? 'Console mode keeps the session archive, transcript stream, and controls visible together like a lightweight operations desk.'
    : isPaper
      ? 'Paper mode slows the interface down and treats the transcript more like something to read, compare, and annotate.'
      : 'Default mode keeps a practical workspace balance between setup, transcript, and session history without feeling like a raw console.'
  const readinessNotes = [
    {
      label: 'Current session',
      value: currentSession?.title || DEFAULT_SESSION_TITLE,
    },
    {
      label: 'Latest preview',
      value: activeSessionPreview,
    },
    {
      label: 'Prompt presets',
      value: `${promptPresetCount} available`,
    },
    {
      label: 'Session updated',
      value: activeSessionUpdatedAt,
    },
  ]

  const identityCard = (
    <Card
      className={cn(
        appearance.panelClass,
        isConsole && 'font-mono',
        isPaper && 'border-stone-300/70 bg-white/92'
      )}
    >
      <CardHeader>
        <Badge className='mb-2 w-fit' variant='outline'>
          {onlineChat.badge} / {appearance.templateLabel}
        </Badge>
        <CardTitle>{onlineChat.sidebar_title}</CardTitle>
        <CardDescription>{onlineChat.sidebar_description}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <label className='block space-y-2'>
          <span className='text-sm font-medium'>API Key</span>
          <select
            className='border-input bg-background h-9 w-full rounded-lg border px-3 text-sm'
            value={selectedTokenId}
            onChange={(event) => setSelectedTokenId(event.target.value)}
          >
            {keysQuery.data?.length ? (
              keysQuery.data.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name} {key.key ? `(${key.key})` : ''}
                </option>
              ))
            ) : (
              <option value=''>No API key available</option>
            )}
          </select>
        </label>

        <label className='block space-y-2'>
          <span className='text-sm font-medium'>Model</span>
          <select
            className='border-input bg-background h-9 w-full rounded-lg border px-3 text-sm'
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
          >
            {modelsQuery.data?.models?.length ? (
              modelsQuery.data.models.map((model) => (
                <option key={model.model_name} value={model.model_name}>
                  {model.model_name}
                </option>
              ))
            ) : (
              <option value=''>No model available</option>
            )}
          </select>
        </label>

        <div
          className={cn(
            'grid gap-3 text-sm',
            isConsole ? 'grid-cols-1' : 'sm:grid-cols-3 lg:grid-cols-1'
          )}
        >
          {[
            {
              label: 'Key',
              value: currentKey?.name || 'Not selected',
            },
            {
              label: 'Model',
              value: selectedModel || 'Not selected',
            },
            {
              label: 'Sessions',
              value: `${sessionCount}`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                'px-3 py-3',
                getTemplateInsetClass(template)
              )}
            >
              <p className='text-muted-foreground text-[11px] uppercase tracking-[0.14em]'>
                {item.label}
              </p>
              <p className='mt-1 text-sm font-medium'>{item.value}</p>
            </div>
          ))}
        </div>

        <div className={cn('p-3 text-sm', getTemplateInsetClass(template))}>
          <div className='font-medium'>Current session</div>
          <div className='text-muted-foreground mt-1 space-y-1 text-xs leading-5'>
            <p>{currentSession?.title || DEFAULT_SESSION_TITLE}</p>
            <p>{getSessionPreview(currentMessages)}</p>
          </div>
        </div>

        <div className={cn('space-y-2 p-3 text-sm', getTemplateInsetClass(template))}>
          <div className='flex items-center gap-2 font-medium'>
            <ShieldCheck className='size-4' />
            Readiness
          </div>
          <div className='space-y-2 text-xs leading-5'>
            {readinessNotes.map((item) => (
              <div key={item.label}>
                <p className='text-muted-foreground uppercase tracking-[0.12em]'>
                  {item.label}
                </p>
                <p className='mt-1'>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-1'>
          <Button
            className='w-full'
            variant='outline'
            onClick={() => {
              window.location.href = '/keys'
            }}
          >
            <KeyRound className='size-4' />
            Manage API Keys
          </Button>
          <Button
            className='w-full'
            variant='outline'
            onClick={() => {
              window.location.href = '/model-square'
            }}
          >
            <Bot className='size-4' />
            Open model square
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const tipsCard = (
    <Card
      className={cn(
        appearance.panelClass,
        isConsole && 'font-mono',
        isPaper && 'border-stone-300/70 bg-white/92'
      )}
    >
      <CardHeader>
        <CardTitle>Usage tips</CardTitle>
        <CardDescription>
          Template copy and onboarding notes can be managed from system settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'text-muted-foreground p-4 text-sm leading-6 whitespace-pre-wrap',
            getTemplateInsetClass(template)
          )}
        >
          {onlineChat.tips}
        </div>
      </CardContent>
    </Card>
  )

  const sessionRail = (
    <div className={cn('space-y-3', isConsole ? 'p-4' : '')}>
      <div
        className={cn(
          'p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]',
          getWorkspaceSurfaceClass(template),
          isConsole ? 'h-full' : ''
        )}
      >
        <div className='mb-3 flex items-center justify-between gap-3'>
          <div className='space-y-1'>
            <div className='flex items-center gap-2 text-sm font-medium'>
              <History className='size-4' />
              历史会话
            </div>
            <p className='text-muted-foreground text-xs'>
              {sessionCount} 个会话
            </p>
          </div>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='hidden'
              disabled={!currentSession || isBusy}
              onClick={() => currentSession && exportSession(currentSession)}
            >
              <Download className='mr-1 size-4' />
              Export
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className={getFieldClass(template)}
              disabled={isBusy}
              onClick={handleCreateSession}
            >
              <MessageSquarePlus className='mr-1 size-4' />
              新建对话
            </Button>
          </div>
        </div>

        <div className='hidden'>
          <div className={cn('p-3 text-sm', getTemplateInsetClass(template))}>
            <p className='text-muted-foreground text-[11px] uppercase tracking-[0.14em]'>
              Active session
            </p>
            <p className='mt-1 truncate text-sm font-medium'>
              {currentSession?.title || DEFAULT_SESSION_TITLE}
            </p>
          </div>
          <div className={cn('p-3 text-sm', getTemplateInsetClass(template))}>
            <p className='text-muted-foreground text-[11px] uppercase tracking-[0.14em]'>
              Messages
            </p>
            <p className='mt-1 text-sm font-medium'>{activeSessionMessageCount}</p>
          </div>
          <div className={cn('p-3 text-sm', getTemplateInsetClass(template))}>
            <p className='text-muted-foreground text-[11px] uppercase tracking-[0.14em]'>
              Updated
            </p>
            <p className='mt-1 text-sm font-medium'>{activeSessionUpdatedAt}</p>
          </div>
        </div>

        <div
          className={cn(
            'space-y-2 overflow-y-auto pr-1',
            isPaper ? 'max-h-72' : 'max-h-[calc(100dvh-27rem)]'
          )}
        >
          {sortedSessions.map((session) => {
            const isActive = session.id === currentSession?.id
            const isRenaming = renamingSessionId === session.id
            return (
              <div
                key={session.id}
                className={cn(
                  'border transition-all duration-200',
                  getWorkspaceSurfaceClass(template),
                  isActive
                    ? isConsole
                      ? 'border-cyan-400/35 bg-cyan-500/10'
                      : isPaper
                        ? 'border-stone-500/45 bg-stone-50'
                        : 'border-primary bg-primary/5'
                    : getInteractiveHoverClass(template)
                )}
              >
                <div className='flex items-start gap-2 p-2'>
                  <div className='min-w-0 flex-1 px-2 py-2'>
                    {isRenaming ? (
                      <div className='space-y-2'>
                        <Input
                          className={getFieldClass(template)}
                          autoFocus
                          value={renamingTitle}
                          onChange={(event) => setRenamingTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              handleSubmitRenameSession()
                            }
                            if (event.key === 'Escape') {
                              handleCancelRenameSession()
                            }
                          }}
                        />
                        <div className='flex gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            className={getFieldClass(template)}
                            onClick={handleSubmitRenameSession}
                          >
                            保存
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className={getFieldClass(template)}
                            onClick={handleCancelRenameSession}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type='button'
                        className='min-w-0 text-left'
                        disabled={isBusy}
                        onClick={() => setActiveSessionId(session.id)}
                      >
                        <div className='flex items-center gap-2'>
                          <div className='truncate text-sm font-medium'>
                            {session.title}
                          </div>
                          {isActive ? (
                            <Badge variant='secondary' className='text-[10px]'>
                              当前
                            </Badge>
                          ) : null}
                        </div>
                        <div className='text-muted-foreground mt-1 line-clamp-2 text-xs leading-5'>
                          {getSessionPreview(session.messages)}
                        </div>
                        <div className='mt-2 flex flex-wrap items-center gap-2 text-[11px]'>
                          <span className='text-muted-foreground'>
                            {formatSessionTime(session.updatedAt)}
                          </span>
                          <Badge
                            variant='outline'
                            className={cn('text-[10px]', getMetaBadgeClass(template))}
                          >
                            {
                              session.messages.filter(
                                (message) => message.kind !== 'welcome'
                              ).length
                            }{' '}
                            msgs
                          </Badge>
                        </div>
                      </button>
                    )}
                  </div>
                  {!isRenaming && (
                    <div className='mt-1 flex shrink-0 flex-col gap-1'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className={getFieldClass(template)}
                        disabled={isBusy}
                        onClick={() => handleStartRenameSession(session)}
                      >
                        <Pencil className='mr-1 size-4' />
                        重命名
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className={getFieldClass(template)}
                        disabled={isBusy}
                        onClick={() => exportSession(session)}
                      >
                        <Download className='mr-1 size-4' />
                        导出
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className={cn(getFieldClass(template), getDangerActionClass(template))}
                        disabled={isBusy}
                        onClick={() => setDeleteSessionId(session.id)}
                      >
                        <Trash2 className='mr-1 size-4' />
                        删除
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  const controlsRail = (
    <div className='space-y-3'>
      <div className={cn('p-4', getWorkspaceSurfaceClass(template))}>
        <div className='mb-3 flex items-center gap-2 text-sm font-medium'>
          <KeyRound className='size-4' />
          对话设置
        </div>
        <div className='space-y-3'>
          <label className='block space-y-2'>
            <span className='text-sm font-medium'>令牌</span>
            <select
              className={cn('h-10 w-full rounded-lg border px-3 text-sm', getFieldClass(template))}
              value={selectedTokenId}
              onChange={(event) => setSelectedTokenId(event.target.value)}
            >
              {keysQuery.data?.length ? (
                keysQuery.data.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name}
                  </option>
                ))
              ) : (
                <option value=''>暂无可用 Key</option>
              )}
            </select>
          </label>

          <label className='block space-y-2'>
            <span className='text-sm font-medium'>模型</span>
            <select
              className={cn('h-10 w-full rounded-lg border px-3 text-sm', getFieldClass(template))}
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {modelsQuery.data?.models?.length ? (
                modelsQuery.data.models.map((model) => (
                  <option key={model.model_name} value={model.model_name}>
                    {model.model_name}
                  </option>
                ))
              ) : (
                <option value=''>暂无可用模型</option>
              )}
            </select>
          </label>

          <details className={cn('rounded-xl border px-4 py-3', getFieldClass(template))}>
            <summary className='cursor-pointer text-sm font-medium'>高级参数</summary>
            <div className='mt-4 space-y-4'>
              <div className='space-y-3'>
                <div className='flex items-center justify-between text-sm'>
                  <span>Temperature</span>
                  <span className='text-muted-foreground'>{temperature.toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={2}
                  step={0.1}
                  value={[temperature]}
                  onValueChange={(value) =>
                    setTemperature(
                      Array.isArray(value)
                        ? (value[0] ?? DEFAULT_TEMPERATURE)
                        : value
                    )
                  }
                />
              </div>

              <label className='block space-y-2'>
                <span className='text-sm font-medium'>Max tokens</span>
                <Input
                  className={getFieldClass(template)}
                  type='number'
                  min={1}
                  max={32768}
                  value={maxTokens}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)
                    if (!Number.isFinite(nextValue) || nextValue <= 0) {
                      setMaxTokens(DEFAULT_MAX_TOKENS)
                      return
                    }
                    setMaxTokens(Math.min(32768, Math.round(nextValue)))
                  }}
                />
              </label>

              <div className='flex items-center justify-between rounded-lg border px-3 py-2'>
                <span className='text-sm font-medium'>流式输出</span>
                <Switch checked={stream} onCheckedChange={setStream} />
              </div>
            </div>
          </details>

          {onlineChat.prompt_presets.length > 0 ? (
            <div className='space-y-2'>
              <div className='text-sm font-medium'>快捷提示词</div>
              <div className='flex flex-wrap gap-2'>
                {onlineChat.prompt_presets.slice(0, 4).map((preset) => (
                  <Button
                    key={`${preset.title}-${preset.content}`}
                    type='button'
                    variant='outline'
                    size='sm'
                    className={getFieldClass(template)}
                    disabled={isBusy}
                    onClick={() => setInput(preset.content)}
                  >
                    {preset.title}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className='hidden'>
        <div className='mb-2 flex items-center gap-2 font-medium'>
          <Layers3 className='size-4' />
          当前会话
        </div>
        <div className='text-muted-foreground space-y-2 text-xs leading-5'>
          <p>标题：{currentSession?.title || DEFAULT_SESSION_TITLE}</p>
          <p>消息数：{activeSessionMessageCount}</p>
          <p>更新时间：{activeSessionUpdatedAt}</p>
        </div>
      </div>
    </div>
  )

  const messageRail = (
    <div
      className={cn(
        'space-y-3 overflow-y-auto pr-1',
        'max-h-[62vh] min-h-[24rem]'
      )}
    >
      {currentMessages.map((message) => {
        const isUser = message.role === 'user'
        return (
          <div
            key={message.id}
            className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            {!isUser && (
              <span className='bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-full'>
                <Bot className='size-4' />
              </span>
            )}
            <div
              className={cn(
                'max-w-[78%] px-4 py-3 text-sm leading-6 whitespace-pre-wrap',
                isUser
                  ? 'bg-primary text-primary-foreground rounded-2xl'
                    : message.kind === 'welcome'
                      ? cn(getTemplateInsetClass(template), 'text-foreground')
                    : cn(getAssistantBubbleClass(template))
              )}
            >
              {message.content}
            </div>
            {isUser && (
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full',
                  getAvatarSurfaceClass(template)
                )}
              >
                <UserRound className='size-4' />
              </span>
            )}
          </div>
        )
      })}

      {isBusy && (
        <div className='text-muted-foreground text-sm'>
          {isStreaming ? 'Streaming reply...' : 'The model is generating a reply...'}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  )

  const composerPanel = (
    <div
      className={cn(
        'border p-2 shadow-[0_16px_40px_rgba(15,23,42,0.05)]',
        getWorkspaceSurfaceClass(template)
      )}
    >
      <Textarea
        className='min-h-24 border-0 bg-transparent focus-visible:ring-0'
        placeholder={onlineChat.input_placeholder}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            handleSend()
          }
        }}
      />
      <div
        className={cn(
          'mt-2 flex gap-3',
          isPaper ? 'flex-col' : 'items-center justify-between'
        )}
      >
        <p className='text-muted-foreground text-xs'>
          Ctrl/Cmd + Enter 发送。会话、模型和参数会保存在当前浏览器。
        </p>
        {isStreaming ? (
          <Button variant='outline' onClick={handleStopGeneration}>
            <Square className='size-4' />
            停止
          </Button>
        ) : (
          <Button
            disabled={
              sendMutation.isPending ||
              !input.trim() ||
              !selectedTokenId ||
              !selectedModel
            }
            onClick={handleSend}
          >
            <Send className='size-4' />
            发送
          </Button>
        )}
      </div>
    </div>
  )

  const workflowPanel = (
    <div
      className={cn(
        'grid gap-3',
        isConsole
          ? 'xl:grid-cols-3'
          : isPaper
            ? 'lg:grid-cols-1'
            : 'lg:grid-cols-3'
      )}
    >
      {chatRoutes.map((item) => (
        <QuickRoute
          key={item.title}
          eyebrow={item.eyebrow}
          title={item.title}
          description={item.description}
          template={template}
          href={item.href}
          onClick={item.onClick}
          emphasis={item.emphasis}
          disabled={item.disabled}
        />
      ))}
    </div>
  )

  const workspacePulseCard = (
    <Card
      className={cn(
        appearance.panelClass,
        isConsole && 'font-mono',
        isPaper && 'border-stone-300/70 bg-white/92'
      )}
    >
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ShieldCheck className='size-4' />
          {isConsole
            ? 'Workspace pulse'
            : isPaper
              ? 'Conversation briefing'
              : 'Workspace pulse'}
        </CardTitle>
        <CardDescription>
          {isConsole
            ? 'Keep the active session, streaming state, and route context visible before you send the next prompt.'
            : isPaper
              ? 'A slower summary rail for the current thread before you continue reading or writing.'
              : 'A compact summary rail for the active thread, current route, and prompt posture.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {[
          {
            title: 'Session title',
            value: currentSession?.title || DEFAULT_SESSION_TITLE,
          },
          {
            title: 'Latest preview',
            value: activeSessionPreview,
          },
          {
            title: 'Prompt posture',
            value: `${stream ? 'Streaming' : 'Single reply'} / ${temperature.toFixed(2)} temp`,
          },
          {
            title: 'Support route',
            value: 'Models, docs, and keys stay one click away from the chat workspace.',
          },
        ].map((item) => (
          <div key={item.title} className={cn('p-3', getTemplateInsetClass(template))}>
            <p className='text-muted-foreground text-[11px] uppercase tracking-[0.14em]'>
              {item.title}
            </p>
            <p className='mt-2 text-sm leading-6'>{item.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )

  const defaultWorkspaceGuide = (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.85fr)]'>
      <div className={cn('p-4', getTemplateInsetClass(template))}>
        <p className='text-sm font-medium'>Workspace overview</p>
        <p className='text-muted-foreground mt-2 text-sm leading-6'>
          Keep setup close to the transcript, leave history visible, and switch sessions without losing the active draft.
        </p>
      </div>
      {workspacePulseCard}
    </div>
  )

  const consoleTranscriptGuide = (
    <div className='space-y-4'>
      <div className={cn('p-3 text-sm', getTemplateInsetClass(template))}>
        <div className='font-medium'>Live conversation buffer</div>
        <div className='text-muted-foreground mt-1 text-xs leading-5'>
          Switch sessions on the left, keep the stream centered, and treat the right rail like a control surface.
        </div>
      </div>
      <div className={cn('p-3 text-sm', getTemplateInsetClass(template))}>
        <div className='font-medium'>Current session state</div>
        <div className='text-muted-foreground mt-1 grid gap-1 text-xs leading-5'>
          <p>Title: {currentSession?.title || DEFAULT_SESSION_TITLE}</p>
          <p>Messages: {activeSessionMessageCount}</p>
          <p>Updated: {activeSessionUpdatedAt}</p>
        </div>
      </div>
    </div>
  )

  const paperTranscriptGuide = (
    <div className='space-y-4'>
      <div className={cn('p-4', getTemplateInsetClass(template))}>
        <p className='text-sm font-medium'>Reading-first transcript</p>
        <p className='text-muted-foreground mt-2 text-sm leading-6'>
          The paper template weakens the control-room feeling and gives more room to read, compare, and annotate a conversation.
        </p>
      </div>
      <div className={cn('p-4', getTemplateInsetClass(template))}>
        <p className='text-sm font-medium'>Session notes</p>
        <div className='text-muted-foreground mt-2 space-y-2 text-sm leading-6'>
          <p>Current session: {currentSession?.title || DEFAULT_SESSION_TITLE}</p>
          <p>Last updated: {activeSessionUpdatedAt}</p>
          <p>Readable preview: {activeSessionPreview}</p>
        </div>
      </div>
    </div>
  )

  const visibleMessages = currentMessages.filter(
    (message) => message.kind !== 'welcome'
  )
  const useDarkChat = false
  const compactSelectClass =
    useDarkChat
      ? 'h-10 rounded-xl border border-orange-200/70 bg-orange-50/90 px-3 text-sm text-slate-800 outline-none transition hover:border-orange-300/80 focus:border-orange-400/80'
      : 'h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition'
  const darkIconButtonClass =
    useDarkChat
      ? 'border-orange-200/70 bg-orange-50/90 text-slate-700 hover:border-orange-300/80 hover:bg-orange-100/80'
      : 'border-input bg-background text-foreground'

  const chatCard = (
    <div
      className='flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-white/90 backdrop-blur'
    >
      <div className='flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3'>
        <div className='flex items-center gap-2'>
          <Bot className='size-4 text-[#d77a55]' />
          <h2 className='text-base font-semibold tracking-tight'>在线对话</h2>
        </div>
      </div>

      <div className='grid min-h-0 flex-1 xl:grid-cols-[292px_minmax(0,1fr)]'>
        <aside
          className={cn(
            'min-h-0 overflow-y-auto border-b p-4 xl:border-r xl:border-b-0',
            useDarkChat ? 'border-orange-200/60 bg-orange-50/55' : 'border-white/10 bg-transparent'
          )}
        >
          <div className='mb-4 flex items-center justify-between gap-3'>
            <Button
              type='button'
              variant='ghost'
              className='h-10 flex-1 justify-start rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:text-orange-200'
              disabled={isBusy}
              onClick={handleCreateSession}
            >
              <MessageSquarePlus className='size-4' />
              新建对话
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              className='text-white/50 hover:bg-white/5 hover:text-red-400'
              disabled={!currentSession || isBusy}
              onClick={() => currentSession && setDeleteSessionId(currentSession.id)}
            >
              <Trash2 className='size-4' />
            </Button>
          </div>

          <div className='space-y-2'>
            {sortedSessions.length === 0 ? (
              <div className='py-12 text-center text-sm text-white/40'>
                暂无对话
              </div>
            ) : (
              sortedSessions.map((session) => {
                const isActive = session.id === currentSession?.id
                return (
                  <button
                    key={session.id}
                    type='button'
                    disabled={isBusy}
                    className={cn(
                      'w-full rounded-2xl border px-4 py-3 text-left transition-all',
                      isActive
                        ? 'border-orange-500/30 bg-orange-500/10 shadow-none'
                        : 'border-transparent hover:border-white/10 hover:bg-white/5'
                    )}
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='truncate text-sm font-medium text-white/90'>
                        {session.title}
                      </span>
                      {isActive ? (
                        <span className='rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] text-orange-300'>
                          当前
                        </span>
                      ) : null}
                    </div>
                    <p className='mt-2 line-clamp-2 text-xs leading-5 text-white/40'>
                      {getSessionPreview(session.messages)}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section
          className={cn(
            'flex min-h-0 flex-col',
            useDarkChat ? 'bg-orange-50/40' : 'bg-transparent'
          )}
        >
          <div className='mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col'>
          <div className='min-h-0 flex-1 overflow-y-auto p-5'>
            {visibleMessages.length === 0 ? (
              <div className='grid h-full min-h-0 place-items-center'>
                <div className='text-center'>
                  <div className='mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_25%,#f2e9ff,#7c63d9_58%,#2c244c)] shadow-[0_16px_34px_rgba(124,99,217,0.28)]'>
                    <Bot className='size-5 text-white' />
                  </div>
                  <p className='text-sm text-stone-500'>开始新的对话吧</p>
                </div>
              </div>
            ) : (
              <div className='space-y-4'>
                {visibleMessages.map((message) => {
                  const isUser = message.role === 'user'
                  return (
                    <div
                      key={message.id}
                      className={cn('flex gap-3', isUser && 'justify-end')}
                    >
                      {!isUser ? (
                        <span className='grid size-9 shrink-0 place-items-center rounded-full bg-white/5 border border-white/10 text-orange-400'>
                          <Bot className='size-4' />
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          'max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap',
                          isUser
                            ? 'border border-orange-500/30 bg-orange-500/10 text-white/90'
                            : 'border border-white/10 bg-white/5 text-white/80'
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  )
                })}
                {isBusy ? (
                  <div className='text-sm text-slate-500'>
                    {isStreaming ? '正在流式回复...' : '模型正在生成回复...'}
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className='shrink-0 p-4 pt-3'>
            <div className='rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur'>
              <Textarea
                className='min-h-16 resize-none border-0 bg-transparent px-2 text-white/90 placeholder:text-white/40 focus-visible:ring-0'
                placeholder='输入消息，Enter 发送，Shift+Enter 换行'
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSend()
                  }
                }}
              />
              <div className='mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                <div className='grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap'>
                  <select
                    className={compactSelectClass}
                    value={selectedTokenId}
                    onChange={(event) => setSelectedTokenId(event.target.value)}
                  >
                    {keysQuery.data?.length ? (
                      keysQuery.data.map((key) => (
                        <option key={key.id} value={key.id}>
                          令牌 · {key.name}
                        </option>
                      ))
                    ) : (
                      <option value=''>令牌 · 暂无可用 Key</option>
                    )}
                  </select>
                  <button
                    type='button'
                    className='h-10 rounded-xl border border-orange-200/70 bg-orange-50/90 px-3 text-left text-sm text-slate-800'
                  >
                    渠道 · 自动
                  </button>
                  <select
                    className={compactSelectClass}
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                  >
                    {modelsQuery.data?.models?.length ? (
                      modelsQuery.data.models.map((model) => (
                        <option key={model.model_name} value={model.model_name}>
                          模型 · {model.model_name}
                        </option>
                      ))
                    ) : (
                      <option value=''>模型 · 暂无可用模型</option>
                    )}
                  </select>
                  <button
                    type='button'
                    className='grid h-10 w-10 place-items-center rounded-xl border border-orange-200/70 bg-orange-50/90 text-slate-500 hover:border-orange-300/80 hover:text-orange-700'
                    title='上传图片'
                  >
                    <Layers3 className='size-4' />
                  </button>
                </div>

                {isStreaming ? (
                  <Button
                    type='button'
                    variant='outline'
                    className={darkIconButtonClass}
                    onClick={handleStopGeneration}
                  >
                    <Square className='size-4' />
                    停止
                  </Button>
                ) : (
                  <Button
                    type='button'
                    className='size-12 rounded-full border border-orange-300/80 bg-orange-200 text-orange-900 shadow-[0_10px_22px_rgba(251,146,60,0.18)] hover:bg-orange-300/85'
                    disabled={
                      sendMutation.isPending ||
                      !input.trim() ||
                      !selectedTokenId ||
                      !selectedModel
                    }
                    onClick={handleSend}
                  >
                    <Send className='size-5' />
                  </Button>
                )}
              </div>
            </div>
          </div>
          </div>
        </section>
      </div>
    </div>
  )

  const renderModule = (moduleId: FrontendPortalOnlineChatModuleId) => {
    switch (moduleId) {
      case 'identity':
        return <div key='identity'>{identityCard}</div>
      case 'tips':
        return <div key='tips'>{tipsCard}</div>
      case 'chat_panel':
        return <div key='chat_panel'>{chatCard}</div>
      default:
        return null
    }
  }

  const content = <div className='min-h-0'>{chatCard}</div>

  return (
    <PortalShell>
      {content}
      <AlertDialog
        open={deleteSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSessionId(null)
          }
        }}
      >
        <AlertDialogContent
          className={cn(
            'border shadow-[0_24px_80px_rgba(15,23,42,0.20)]',
            getDialogSurfaceClass(template)
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will remove "${deleteTargetSession?.title || DEFAULT_SESSION_TITLE}" and its local messages from history. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(getFieldClass(template), getTemplateInsetClass(template))}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteSession}
              className={cn(getFieldClass(template), getDangerActionClass(template))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalShell>
  )
}
