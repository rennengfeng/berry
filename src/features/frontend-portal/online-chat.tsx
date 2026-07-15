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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { SSE } from 'sse.js'
import {
  ImageIcon,
  MessageSquareIcon,
  SendIcon,
  SquareIcon,
  PlusIcon,
  Trash2Icon,
  PaperclipIcon,
  XIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from 'lucide-react'
import { getCommonHeaders } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader } from '@/components/ai-elements/loader'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { getApiKeySummaries, getChatUserGroups, getChatUserModels, sendImageGeneration } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMode = 'chat' | 'image'

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ChatMessage = {
  key: string
  from: 'user' | 'assistant'
  content: string | ContentPart[]
  reasoning?: string
  isReasoningStreaming?: boolean
  status: 'complete' | 'loading' | 'streaming' | 'error'
  images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
}

type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  mode: ChatMode
  createdAt: number
}

type ModelOption = { label: string; value: string; groups?: string[]; endpoints?: string[] }
type ApiKeyOption = { label: string; value: string; group: string; groupDesc?: string }

const IMAGE_SIZES = ['1024x1024', '1024x1792', '1792x1024', 'auto'] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDisplayText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content
  const textPart = content.find((p) => p.type === 'text')
  return textPart && 'text' in textPart ? textPart.text : ''
}

function getSessionTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.from === 'user')
  if (!first) return '新对话'
  const text = getDisplayText(first.content)
  return text.slice(0, 20) || '新对话'
}

function cleanErrorMessage(raw: string): string {
  let msg = raw
    .replace(/\s*\(request id:[^)]*\)/gi, '')
    .replace(/\$\s*(\d+)\.(\d{2})\d+/g, (_, a, b) => `$${a}.${b}`)
    // 隐藏上游渠道/分组等内部信息
    .replace(/upstream\s*group[:\s]*\S+/gi, '')
    .replace(/channel\s*#?\d+/gi, '')
    .replace(/渠道\s*#?\d+/gi, '')
    .replace(/上游分组[：:\s]*\S+/gi, '')
  // 不把真实错误强行替换成“选择分组/密钥”，在线聊天走 cookie 鉴权，固定文案会掩盖真正原因。
  if (/额度不足|insufficient.*quota/i.test(msg)) {
    msg += '\n如果您是订阅客户，请确认当前模型在订阅分组中可用。'
  }
  if (/订阅余额仅可用于/i.test(msg)) {
    msg = '订阅余额仅可用于对应的订阅分组。请确认当前模型在订阅分组中可用。'
  }
  if (/all]?\s*channels?\s*(unavailable|failed|exhausted)/i.test(msg) || /所有渠道/.test(msg)) {
    msg = '当前模型暂时不可用，请稍后重试或切换其他模型。'
  }
  return msg.trim()
}

// ---------------------------------------------------------------------------
// localStorage persistence (10MB budget, auto-evict oldest sessions)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'online-chat-sessions'
const EVICT_THRESHOLD_BYTES = 8 * 1024 * 1024
const MSG_MAX_CHARS = 8000
const MSG_HEAD_CHARS = 3000
const MSG_TAIL_CHARS = 2000

function truncateMessage(text: string): string {
  if (text.length <= MSG_MAX_CHARS) return text
  return text.slice(0, MSG_HEAD_CHARS) + '\n...[内容过长已省略]...\n' + text.slice(-MSG_TAIL_CHARS)
}

function stripBase64FromContent(content: string | ContentPart[]): string | ContentPart[] {
  if (typeof content === 'string') return truncateMessage(content)
  return content.map((p) => {
    if (p.type === 'image_url') {
      if (p.image_url.url.startsWith('data:')) {
        return { type: 'image_url' as const, image_url: { url: '[image]' } }
      }
      return p
    }
    if (p.type === 'text') {
      return { type: 'text' as const, text: truncateMessage(p.text) }
    }
    return p
  })
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ChatSession[]
  } catch {
    return []
  }
}

function saveSessions(sessions: ChatSession[]) {
  const cleaned = sessions.map((s) => ({
    ...s,
    messages: s.messages.map((m) => ({
      ...m,
      content: stripBase64FromContent(m.content),
    })),
  }))

  let json = JSON.stringify(cleaned)
  while (new Blob([json]).size > EVICT_THRESHOLD_BYTES && cleaned.length > 1) {
    cleaned.pop()
    json = JSON.stringify(cleaned)
  }

  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch {
    // quota exceeded — evict oldest and retry
    if (cleaned.length > 1) {
      cleaned.pop()
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
      } catch {
        // give up silently
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnlineChat() {
  const { t } = useTranslation()

  // Mode & selectors
  const [chatMode, setChatMode] = useState<ChatMode>('chat')
  const [models, setModels] = useState<ModelOption[]>([])
  const [apiKeyOptions, setApiKeyOptions] = useState<ApiKeyOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('')
  const [imageSize, setImageSize] = useState<string>('1024x1024')

  // Sessions (chat history) — initialized from localStorage
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions())
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = loadSessions()
    return saved.length > 0 ? saved[0].id : ''
  })

  // Messages & generation state
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadSessions()
    return saved.length > 0 ? saved[0].messages : []
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [inputText, setInputText] = useState('')
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sseRef = useRef<SSE | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedApiKey = useMemo(
    () => apiKeyOptions.find((key) => key.value === selectedApiKeyId),
    [apiKeyOptions, selectedApiKeyId]
  )
  const selectedGroup = selectedApiKey?.group || ''
  const selectedApiKeyLabel = selectedApiKey?.label || t('API Key')

  // Filter models by selected group and chat mode
  const filteredModels = useMemo(() => {
    let filtered = models
    if (selectedGroup) {
      filtered = filtered.filter((m) => {
        if (!m.groups || m.groups.length === 0) return true
        return m.groups.includes(selectedGroup)
      })
    }
    // Simple name-based filter: contains "image" → image model, otherwise → chat model
    if (chatMode === 'image') {
      filtered = filtered.filter((m) => /image/i.test(m.value))
    } else {
      filtered = filtered.filter((m) => !/image/i.test(m.value))
    }
    return filtered
  }, [models, selectedGroup, chatMode])

  // Auto-select first model when filtered list changes
  useEffect(() => {
    if (filteredModels.length > 0 && !filteredModels.find((m) => m.value === selectedModel)) {
      setSelectedModel(filteredModels[0].value)
    }
  }, [filteredModels, selectedModel])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Persist sessions to localStorage (debounced via microtask)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      const toSave = sessions.map((s) =>
        s.id === activeSessionId
          ? { ...s, messages, title: getSessionTitle(messages) }
          : s
      )
      saveSessions(toSave)
    }, 500)
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current) }
  }, [sessions, messages, activeSessionId])

  // Load active API keys. The selected key's group is used as the billing group
  // for playground requests; group data is only used to show a friendly label.
  useEffect(() => {
    Promise.all([getChatUserGroups(), getApiKeySummaries()]).then(([usableGroups, tokens]) => {
      const usableGroupMap = new Map(usableGroups.map((group) => [group.value, group]))
      const keyOptions: ApiKeyOption[] = tokens
        .filter((token) => token.status === 1)
        .map((token) => {
          const group = token.group || 'default'
          return {
            label: token.name || group,
            value: String(token.id),
            group,
            groupDesc: usableGroupMap.get(group)?.desc,
          }
        })
      setApiKeyOptions(keyOptions)
      setSelectedApiKeyId((current) =>
        current && keyOptions.some((option) => option.value === current)
          ? current
          : keyOptions[0]?.value || ''
      )
    })
    getChatUserModels().then((m) => {
      setModels(m)
      if (m.length > 0) setSelectedModel(m[0].value)
    })
  }, [])

  useEffect(() => {
    if (!selectedApiKeyId || apiKeyOptions.length === 0) return
    if (apiKeyOptions.some((option) => option.value === selectedApiKeyId)) return
    setSelectedApiKeyId(apiKeyOptions[0].value)
  }, [apiKeyOptions, selectedApiKeyId])

  // Create new session
  const createNewSession = useCallback(() => {
    // Save current session if it has messages
    if (activeSessionId && messages.length > 0) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages, title: getSessionTitle(messages) }
            : s
        )
      )
    }
    const newSession: ChatSession = {
      id: nanoid(),
      title: '新对话',
      messages: [],
      mode: chatMode,
      createdAt: Date.now(),
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(newSession.id)
    setMessages([])
  }, [activeSessionId, messages, chatMode])

  // Switch session
  const switchSession = useCallback(
    (sessionId: string) => {
      // Save current
      if (activeSessionId && messages.length > 0) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, messages, title: getSessionTitle(messages) }
              : s
          )
        )
      }
      const target = sessions.find((s) => s.id === sessionId)
      if (target) {
        setActiveSessionId(sessionId)
        setMessages(target.messages)
        setChatMode(target.mode)
      }
    },
    [activeSessionId, messages, sessions]
  )

  // Delete session
  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId('')
        setMessages([])
      }
    },
    [activeSessionId]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
    setIsGenerating(false)
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.from === 'assistant' && last.status !== 'complete' && last.status !== 'error') {
        const updated = [...prev]
        updated[updated.length - 1] = { ...last, status: 'complete', isReasoningStreaming: false }
        return updated
      }
      return prev
    })
  }, [])

  // Send chat message (streaming)
  const sendChat = useCallback(
    (allMessages: ChatMessage[]) => {
      if (!selectedModel) {
        return
      }

      const apiMessages = allMessages
        .filter((m) => m.status === 'complete' || m.from === 'user')
        .map((m) => ({
          role: m.from === 'user' ? 'user' : 'assistant',
          content: m.content,
        }))

      const assistantMsg: ChatMessage = {
        key: nanoid(),
        from: 'assistant',
        content: '',
        status: 'loading',
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsGenerating(true)
      const requestGroup = selectedGroup || apiKeyOptions[0]?.group || ''

      const source = new SSE('/pg/chat/completions', {
        headers: getCommonHeaders(),
        method: 'POST',
        payload: JSON.stringify({
          model: selectedModel,
          group: requestGroup,
          messages: apiMessages,
          stream: true,
        }),
      })

      sseRef.current = source

      source.addEventListener('message', (e: MessageEvent) => {
        if (e.data === '[DONE]') {
          source.close()
          sseRef.current = null
          setIsGenerating(false)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.from === 'assistant' && last.status !== 'error') {
              const updated = [...prev]
              updated[updated.length - 1] = { ...last, status: 'complete', isReasoningStreaming: false }
              return updated
            }
            return prev
          })
          return
        }

        try {
          const chunk = JSON.parse(e.data) as {
            choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>
          }
          const delta = chunk.choices?.[0]?.delta
          if (delta) {
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (!last || last.from !== 'assistant') return prev
              const updated = [...prev]
              let msg = { ...last, status: 'streaming' as const }
              if (delta.reasoning_content) {
                msg = {
                  ...msg,
                  reasoning: (msg.reasoning || '') + delta.reasoning_content,
                  isReasoningStreaming: true,
                }
              }
              if (delta.content) {
                msg = {
                  ...msg,
                  content: (typeof msg.content === 'string' ? msg.content : '') + delta.content,
                  isReasoningStreaming: false,
                }
              }
              updated[updated.length - 1] = msg
              return updated
            })
          }
        } catch {
          // ignore parse errors
        }
      })

      source.addEventListener('error', (e: Event & { data?: string }) => {
        if (sseRef.current?.readyState === 2) return
        source.close()
        sseRef.current = null
        setIsGenerating(false)

        let errorMessage = '请求失败'
        const rawData = (e as { data?: string }).data
        if (rawData) {
          try {
            const parsed = JSON.parse(rawData) as { error?: { message?: string }; message?: string }
            errorMessage = parsed.error?.message || parsed.message || errorMessage
          } catch {
            errorMessage = rawData
          }
        }
        errorMessage = cleanErrorMessage(errorMessage)

        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.from === 'assistant' && last.status !== 'complete') {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, content: errorMessage, status: 'error', isReasoningStreaming: false }
            return updated
          }
          return prev
        })
      })

      source.addEventListener('readystatechange', (e: Event & { readyState?: number }) => {
        const httpStatus = (source as unknown as { status?: number }).status
        if (e.readyState !== undefined && e.readyState >= 2 && httpStatus !== undefined && httpStatus !== 200) {
          source.close()
          sseRef.current = null
          setIsGenerating(false)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.from === 'assistant' && last.status !== 'complete') {
              const updated = [...prev]
              updated[updated.length - 1] = { ...last, content: `HTTP ${httpStatus}`, status: 'error', isReasoningStreaming: false }
              return updated
            }
            return prev
          })
        }
      })

      try {
        source.stream()
      } catch {
        setIsGenerating(false)
        sseRef.current = null
      }
    },
    [selectedModel, selectedGroup, apiKeyOptions, t]
  )

  // Send image generation
  const sendImage = useCallback(
    async (prompt: string) => {
      if (!selectedModel) {
        return
      }

      const userMsg: ChatMessage = { key: nanoid(), from: 'user', content: prompt, status: 'complete' }
      const assistantMsg: ChatMessage = { key: nanoid(), from: 'assistant', content: '', status: 'loading' }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsGenerating(true)
      const requestGroup = selectedGroup || apiKeyOptions[0]?.group || ''

      try {
        const res = await sendImageGeneration({
          model: selectedModel,
          prompt,
          group: requestGroup,
          size: imageSize,
        })
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.from === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: res.data?.[0]?.revised_prompt || prompt,
              images: res.data,
              status: 'complete',
            }
          }
          return updated
        })
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : '图像生成失败'
        const msg = cleanErrorMessage(rawMsg)
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.from === 'assistant') {
            updated[updated.length - 1] = { ...last, content: msg, status: 'error' }
          }
          return updated
        })
      } finally {
        setIsGenerating(false)
      }
    },
    [selectedModel, selectedGroup, apiKeyOptions, imageSize, t]
  )

  // Handle submit
  const handleSubmit = useCallback(() => {
    const text = inputText.trim()
    if (!text && pendingImages.length === 0) return
    if (!selectedGroup) return

    // Auto-create session if none active
    if (!activeSessionId) {
      const newSession: ChatSession = {
        id: nanoid(),
        title: text.slice(0, 20) || '图片对话',
        messages: [],
        mode: chatMode,
        createdAt: Date.now(),
      }
      setSessions((prev) => [newSession, ...prev])
      setActiveSessionId(newSession.id)
    }

    setInputText('')

    if (chatMode === 'image') {
      sendImage(text)
      setPendingImages([])
      return
    }

    // Build user message with optional images
    let content: string | ContentPart[]
    if (pendingImages.length > 0) {
      content = [
        { type: 'text' as const, text: text || '请描述这张图片' },
        ...pendingImages.map((url) => ({
          type: 'image_url' as const,
          image_url: { url },
        })),
      ]
    } else {
      content = text
    }

    const userMsg: ChatMessage = { key: nanoid(), from: 'user', content, status: 'complete' }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setPendingImages([])
    sendChat(newMessages)
  }, [inputText, pendingImages, selectedGroup, activeSessionId, chatMode, messages, sendChat, sendImage])

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Handle paste (images) — stage, don't send immediately
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const files: File[] = []
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }

    if (files.length > 0) {
      e.preventDefault()
      for (const file of files) {
        const reader = new FileReader()
        reader.onload = () => {
          setPendingImages((prev) => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setPendingImages((prev) => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      }
    }
    e.target.value = ''
  }

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="flex h-full p-2">
      <div className="flex h-full w-full overflow-hidden rounded-xl border shadow-sm">
        {/* Left sidebar: collapsible */}
        <div
          className={cn(
            'flex shrink-0 flex-col border-r bg-card transition-all',
            sidebarOpen ? 'w-56' : 'w-12'
          )}
        >
          {/* Collapse/Expand toggle */}
          <div className={cn('flex items-center border-b', sidebarOpen ? 'gap-2 px-3 py-2.5' : 'flex-col gap-1 py-2.5')}>
            {sidebarOpen ? (
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <PanelLeftCloseIcon className="h-4 w-4 shrink-0" />
                <span>{t('Collapse')}</span>
              </button>
            ) : (
              <button
                onClick={() => setSidebarOpen(true)}
                title={t('Expand sidebar')}
                className="flex items-center justify-center rounded p-1 transition hover:bg-accent"
              >
                <PanelLeftOpenIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* New chat button */}
          {sidebarOpen ? (
            <button
              onClick={createNewSession}
              className="mx-2 mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-accent"
            >
              <PlusIcon className="h-4 w-4" />
              <span>{t('New Chat')}</span>
            </button>
          ) : (
            <div className="mt-2 flex justify-center">
              <Button variant="ghost" size="icon-sm" onClick={createNewSession} title={t('New Chat')}>
                <PlusIcon className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* History list */}
          <div className="mt-2 flex-1 overflow-y-auto no-scrollbar">
            {sidebarOpen && sessions.length > 0 && (
              <div className="px-3 pb-1">
                <span className="text-xs font-medium text-muted-foreground">{t('Recent')}</span>
              </div>
            )}
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group flex cursor-pointer items-center transition hover:bg-accent',
                  sidebarOpen ? 'gap-2 px-3 py-2 text-sm' : 'justify-center py-2',
                  activeSessionId === session.id && 'bg-accent'
                )}
                onClick={() => switchSession(session.id)}
                title={!sidebarOpen ? session.title : undefined}
              >
                {session.mode === 'image' ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <MessageSquareIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                {sidebarOpen && (
                  <>
                    <span className="flex-1 truncate">{session.title}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(session.id)
                      }}
                    >
                      <Trash2Icon className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {sessions.length === 0 && sidebarOpen && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('No chat history')}
              </p>
            )}
          </div>
        </div>

      {/* Right: chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="mx-auto w-full max-w-4xl px-4 py-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center py-20">
                <p className="text-muted-foreground text-sm">
                  {chatMode === 'chat'
                    ? t('Start a conversation')
                    : t('Describe the image you want to generate')}
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.key}
                className={cn(
                  'mb-4',
                  msg.from === 'user' ? 'flex justify-end' : 'flex justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-4 py-3',
                    msg.from === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  {/* Reasoning block */}
                  {msg.from === 'assistant' && msg.reasoning && (
                    <Reasoning defaultOpen={true} isStreaming={msg.isReasoningStreaming}>
                      <ReasoningTrigger />
                      <ReasoningContent>{msg.reasoning}</ReasoningContent>
                    </Reasoning>
                  )}

                  {/* Loading state */}
                  {msg.from === 'assistant' && msg.status === 'loading' && (
                    <div className="flex items-center gap-2">
                      <Loader />
                      <Shimmer className="text-sm" duration={1}>
                        {chatMode === 'image' ? t('Generating...') : t('Responding...')}
                      </Shimmer>
                    </div>
                  )}

                  {/* Error state */}
                  {msg.status === 'error' && (
                    <div className="text-sm text-destructive">
                      {t('Request failed')}: {getDisplayText(msg.content)}
                    </div>
                  )}

                  {/* Content */}
                  {msg.status !== 'error' && msg.status !== 'loading' && getDisplayText(msg.content) && (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      {msg.from === 'assistant' ? (
                        <Response>{getDisplayText(msg.content)}</Response>
                      ) : (
                        <span>{getDisplayText(msg.content)}</span>
                      )}
                    </div>
                  )}

                  {/* User attached images */}
                  {msg.from === 'user' && Array.isArray(msg.content) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.content
                        .filter((p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url')
                        .map((p, i) => (
                          <img
                            key={i}
                            src={p.image_url.url}
                            alt="attached"
                            className="h-20 w-20 rounded border object-cover"
                          />
                        ))}
                    </div>
                  )}

                  {/* Generated images */}
                  {msg.images && msg.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {msg.images.map((img, i) => (
                        <a
                          key={i}
                          href={img.url || `data:image/png;base64,${img.b64_json}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border transition hover:shadow-md"
                        >
                          <img
                            src={img.url || `data:image/png;base64,${img.b64_json}`}
                            alt={img.revised_prompt || 'generated'}
                            className="max-h-80 max-w-full object-contain"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom input area */}
        <div className="shrink-0 border-t bg-card px-4 py-3">
          <div className="mx-auto w-full max-w-4xl">
            {/* Pending images preview */}
            {pendingImages.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingImages.map((url, i) => (
                  <div key={i} className="group relative">
                    <img
                      src={url}
                      alt={`pending-${i}`}
                      className="h-16 w-16 rounded-md border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingImage(i)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow transition group-hover:opacity-100"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:ring-1 focus-within:ring-ring">
              {/* File upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
                title={t('Upload image')}
              >
                <PaperclipIcon className="h-4 w-4" />
              </Button>

              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={isGenerating}
                placeholder={
                  chatMode === 'chat'
                    ? t('Type a message, Enter to send, Shift+Enter for new line')
                    : t('Describe the image you want...')
                }
                className="field-sizing-content max-h-32 min-h-[2.5rem] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                rows={1}
              />
              {isGenerating ? (
                <Button size="icon-sm" variant="destructive" onClick={stopGeneration} className="shrink-0">
                  <SquareIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  onClick={handleSubmit}
                  disabled={(!inputText.trim() && pendingImages.length === 0) || !selectedGroup}
                  className="shrink-0"
                >
                  <SendIcon className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Controls row — evenly distributed */}
            <div className={cn('mt-2 grid gap-2', chatMode === 'image' ? 'grid-cols-5' : 'grid-cols-4')}>
              {/* Mode switch */}
              <div className="flex items-center rounded-lg border p-0.5">
                <Button
                  variant={chatMode === 'chat' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setChatMode('chat')}
                  className="h-7 flex-1 gap-1 px-1 text-xs"
                >
                  <MessageSquareIcon className="h-3.5 w-3.5" />
                  {t('Chat')}
                </Button>
                <Button
                  variant={chatMode === 'image' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setChatMode('image')}
                  className="h-7 flex-1 gap-1 px-1 text-xs"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t('Image')}
                </Button>
              </div>

              {/* Image size (only in image mode) */}
              {chatMode === 'image' && (
                <Select value={imageSize} onValueChange={setImageSize}>
                  <SelectTrigger className="h-7 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* API key selector: the selected key's group is used for billing. */}
              <Select
                value={selectedApiKeyId}
                onValueChange={setSelectedApiKeyId}
                disabled={isGenerating || apiKeyOptions.length === 0}
              >
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue>{selectedApiKeyLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {apiKeyOptions.map((key) => (
                    <SelectItem key={key.value} value={key.value} className="text-xs">
                      {key.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Model selector */}
              <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isGenerating}>
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue placeholder={t('Model')} />
                </SelectTrigger>
                <SelectContent>
                  {filteredModels.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
