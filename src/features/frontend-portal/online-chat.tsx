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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { SSE } from 'sse.js'
import {
  ImageIcon,
  MessageSquareIcon,
  SendIcon,
  SquareIcon,
  BotIcon,
  CheckIcon,
  ChevronUpIcon,
  MicIcon,
  MusicIcon,
  PersonStandingIcon,
  PlusIcon,
  Trash2Icon,
  PaperclipIcon,
  UserRoundIcon,
  VideoIcon,
  XIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { getCommonHeaders } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { getApiKeySummaries, getChatUserModels, getTokenKey, sendTokenImageGeneration } from './api'

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
type ApiKeyOption = { label: string; value: string; groups: string[]; modelLimitsEnabled?: boolean; modelLimits?: string[] }

type ImageProvider = 'qwen' | 'gpt' | 'gemini' | 'generic'
type ImageAspectRatio =
  | 'auto'
  | '21:9'
  | '16:9'
  | '3:2'
  | '4:3'
  | '1:1'
  | '3:4'
  | '2:3'
  | '9:16'
  | '9:21'
type ImageResolutionTier = '1K' | '2K' | '4K'
type ImageRequestSettings = {
  size: string
  quality?: string
  aspect_ratio?: string
  resolution?: string
  ratio?: string
  summary: string
  detail: string
}

const IMAGE_COUNT_OPTIONS = ['1', '2', '3', '4'] as const
const IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const
const IMAGE_OUTPUT_FORMATS = ['auto', 'png', 'jpeg', 'webp'] as const
const IMAGE_ASPECT_OPTIONS: ImageAspectRatio[] = ['auto', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '9:21']
const QWEN_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']
const GPT_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']
const GEMINI_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']

const QWEN_SIZE_BY_TIER_RATIO: Record<ImageResolutionTier, Partial<Record<ImageAspectRatio, string>>> = {
  '1K': {
    auto: '1024*1024',
    '21:9': '1344*576',
    '1:1': '1024*1024',
    '16:9': '1344*768',
    '3:2': '1248*832',
    '9:16': '768*1344',
    '4:3': '1184*864',
    '3:4': '864*1184',
    '2:3': '832*1248',
    '9:21': '576*1344',
  },
  '2K': {
    auto: '2048*2048',
    '21:9': '2688*1152',
    '1:1': '2048*2048',
    '16:9': '2688*1536',
    '3:2': '2496*1664',
    '9:16': '1536*2688',
    '4:3': '2368*1728',
    '3:4': '1728*2368',
    '2:3': '1664*2496',
    '9:21': '1152*2688',
  },
  '4K': {
    auto: '4096*4096',
    '21:9': '5376*2304',
    '1:1': '4096*4096',
    '16:9': '5376*3072',
    '3:2': '4992*3328',
    '9:16': '3072*5376',
    '4:3': '4736*3456',
    '3:4': '3456*4736',
    '2:3': '3328*4992',
    '9:21': '2304*5376',
  },
}

const GPT_SIZE_BY_RATIO: Record<ImageAspectRatio, string> = {
  auto: 'auto',
  '21:9': '1792x768',
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '9:21': '768x1792',
}

function getImageProvider(model: string): ImageProvider {
  const value = model.toLowerCase()
  if (value.startsWith('qwen-image')) return 'qwen'
  if (value.includes('gpt-image') || value.includes('dall-e')) return 'gpt'
  if (value.includes('gemini')) return 'gemini'
  return 'generic'
}

function getModelCapability(model: ModelOption): ChatMode | 'video' | 'audio' {
  const name = model.value.toLowerCase()
  const endpointList = (model.endpoints ?? []).map((item) => item.toLowerCase())

  if (endpointList.length > 0) {
    if (
      endpointList.some(
        (item) =>
          item.includes('image') ||
          item.includes('text2image') ||
          item.includes('image2image')
      )
    )
      return 'image'
    if (endpointList.some((item) => item.includes('video'))) return 'video'
    if (endpointList.some((item) => /(audio|speech|tts|asr)/i.test(item))) return 'audio'
  }

  const haystack = name

  if (/(^|[/_\s-])(audio|tts|asr|speech|voice|music|song)([/_\s-]|$)/i.test(haystack) || /(cosyvoice|whisper|qwen-audio)/i.test(haystack)) {
    return 'audio'
  }
  if (/(^|[/_\s-])(video|t2v|i2v|r2v|kf2v)([/_\s-]|$)/i.test(haystack) || /(happyhorse|wanx?\d|sora|veo|kling|hailuo)/i.test(haystack)) {
    return 'video'
  }
  if (/(^|[/_\s-])(image|images|text2image|image2image)([/_\s-]|$)/i.test(haystack) || /(qwen-image|gpt-image|dall-e|imagen|flux|midjourney|stable-diffusion)/i.test(haystack)) {
    return 'image'
  }
  if (endpointList.some((item) => ['openai', 'openai-response', 'openai-response-compact', 'gemini', 'anthropic'].includes(item))) {
    return 'chat'
  }
  return 'chat'
}

function getImageAspectOptions(provider: ImageProvider): ImageAspectRatio[] {
  if (provider === 'gpt') return ['auto', '1:1', '21:9', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16', '9:21']
  if (provider === 'qwen') return ['1:1', '21:9', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16', '9:21']
  if (provider === 'gemini') return ['1:1', '21:9', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16', '9:21']
  return IMAGE_ASPECT_OPTIONS
}

function getImageResolutionOptions(provider: ImageProvider, model: string): ImageResolutionTier[] {
  if (provider === 'gpt') return GPT_RESOLUTION_OPTIONS
  if (provider === 'gemini' && !/4k/i.test(model)) return ['1K', '2K', '4K']
  if (provider === 'gemini') return GEMINI_RESOLUTION_OPTIONS
  if (provider === 'qwen') return QWEN_RESOLUTION_OPTIONS
  return ['1K', '2K', '4K']
}

function resolveQwenSize(aspectRatio: ImageAspectRatio, resolution: ImageResolutionTier): string {
  return (
    QWEN_SIZE_BY_TIER_RATIO[resolution]?.[aspectRatio] ||
    QWEN_SIZE_BY_TIER_RATIO['2K'][aspectRatio] ||
    QWEN_SIZE_BY_TIER_RATIO['2K']['1:1'] ||
    '2048*2048'
  )
}

function resolveGenericSize(aspectRatio: ImageAspectRatio, resolution: ImageResolutionTier): string {
  if (aspectRatio === 'auto') return 'auto'
  const [wRaw, hRaw] = aspectRatio.split(':')
  const w = Number(wRaw) || 1
  const h = Number(hRaw) || 1
  const longEdge = resolution === '4K' ? 3840 : resolution === '1K' ? 1024 : 2048
  if (w >= h) {
    const height = Math.round(longEdge * (h / w))
    return `${longEdge}x${height}`
  }
  const width = Math.round(longEdge * (w / h))
  return `${width}x${longEdge}`
}

function resolveImageRequestSettings(
  provider: ImageProvider,
  model: string,
  aspectRatio: ImageAspectRatio,
  resolution: ImageResolutionTier,
  quality: string,
  count: string
): ImageRequestSettings {
  const selectedCount = String(Math.max(1, Number(count) || 1))
  if (provider === 'qwen') {
    const size = resolveQwenSize(aspectRatio, resolution)
    return {
      size,
      resolution,
      ratio: aspectRatio,
      aspect_ratio: aspectRatio,
      summary: `${aspectRatio} · ${resolution} · ${selectedCount}`,
      detail: size,
    }
  }
  if (provider === 'gpt') {
    const size = GPT_SIZE_BY_RATIO[aspectRatio] || '1024x1024'
    return {
      size,
      quality,
      resolution,
      summary: `${formatImageSize(size)} · ${quality} · ${selectedCount}`,
      detail: size,
    }
  }
  if (provider === 'gemini') {
    const safeResolution = getImageResolutionOptions(provider, model).includes(resolution) ? resolution : '2K'
    const detail = resolveGenericSize(aspectRatio, safeResolution)
    return {
      size: aspectRatio,
      quality: safeResolution,
      aspect_ratio: aspectRatio,
      resolution: safeResolution,
      ratio: aspectRatio,
      summary: `${aspectRatio} · ${safeResolution} · ${selectedCount}`,
      detail,
    }
  }
  const size = resolveGenericSize(aspectRatio, resolution)
  return {
    size,
    quality,
    aspect_ratio: aspectRatio === 'auto' ? undefined : aspectRatio,
    resolution,
    ratio: aspectRatio === 'auto' ? undefined : aspectRatio,
    summary: `${aspectRatio} · ${resolution} · ${selectedCount}`,
    detail: size,
  }
}

function formatImageSize(size: string): string {
  if (size === 'auto' || size === '') return '智能'
  return size.replace('*', '×')
}

function formatImageQualityLabel(quality: string): string {
  switch (quality) {
    case 'low':
      return '低'
    case 'medium':
      return '中'
    case 'high':
      return '高'
    case 'auto':
      return '自动'
    default:
      return quality
  }
}

function formatImageResolutionLabel(resolution: ImageResolutionTier): string {
  switch (resolution) {
    case '1K':
      return '标清 1K'
    case '2K':
      return '高清 2K'
    case '4K':
      return '超清 4K'
    default:
      return resolution
  }
}

function getImageSizePreview(size: string): { width: string; height: string } | null {
  const match = size.match(/^(\d+)[x*](\d+)$/)
  if (!match) return null
  return { width: match[1], height: match[2] }
}

function imageChipClass(selected: boolean): string {
  return cn(
    'inline-flex min-w-0 items-center justify-center rounded-lg border text-sm transition',
    selected
      ? 'border-violet-400/70 bg-violet-500/20 text-white shadow-[0_0_0_1px_rgba(139,92,246,0.25)]'
      : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white'
  )
}

function aspectPreviewClass(ratio: ImageAspectRatio): string {
  if (ratio === 'auto') return 'aspect-square w-7'
  const [wRaw, hRaw] = ratio.split(':')
  const w = Math.max(1, Number(wRaw) || 1)
  const h = Math.max(1, Number(hRaw) || 1)
  if (w / h >= 2) return 'h-3 w-9'
  if (w > h) return 'h-4 w-8'
  if (w === h) return 'h-6 w-6'
  if (h / w >= 2) return 'h-8 w-3'
  return 'h-8 w-5'
}

function splitGroupList(group?: string): string[] {
  return Array.from(
    new Set(
      (group || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

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

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.key === 'string' &&
    (item.from === 'user' || item.from === 'assistant') &&
    (typeof item.content === 'string' || Array.isArray(item.content)) &&
    (item.status === 'complete' ||
      item.status === 'loading' ||
      item.status === 'streaming' ||
      item.status === 'error')
  )
}

function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    Array.isArray(item.messages) &&
    item.messages.every(isChatMessage) &&
    (item.mode === 'chat' || item.mode === 'image') &&
    typeof item.createdAt === 'number'
  )
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isChatSession)
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
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('1:1')
  const [imageResolution, setImageResolution] = useState<ImageResolutionTier>('2K')
  const [imageQuality, setImageQuality] = useState<string>('medium')
  const [imageCount, setImageCount] = useState<string>('1')
  const [imageOutputFormat, setImageOutputFormat] = useState<string>('auto')
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)

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
  const selectedGroups = useMemo(
    () => selectedApiKey?.groups ?? [],
    [selectedApiKey]
  )
  const selectedApiKeyLabel = selectedApiKey?.label || t('API Key')

  // Filter models by selected key groups and chat mode
  const filteredModels = useMemo(() => {
    let filtered = models
    if (selectedGroups.length > 0) {
      filtered = filtered.filter((m) => {
        if (!m.groups || m.groups.length === 0) return true
        return selectedGroups.some((group) => group === 'auto' || m.groups?.includes(group))
      })
    }
    if (selectedApiKey?.modelLimitsEnabled) {
      const allowed = new Set(selectedApiKey.modelLimits ?? [])
      filtered = filtered.filter((m) => allowed.has(m.value))
    }
    filtered = filtered.filter((m) => getModelCapability(m) === chatMode)
    return filtered
  }, [models, selectedGroups, selectedApiKey, chatMode])

  const activeModel = useMemo(() => {
    if (filteredModels.some((m) => m.value === selectedModel)) return selectedModel
    return filteredModels[0]?.value || ''
  }, [filteredModels, selectedModel])

  const imageProvider = useMemo(() => getImageProvider(activeModel), [activeModel])
  const imageAspectOptions = useMemo(() => getImageAspectOptions(imageProvider), [imageProvider])
  const imageResolutionOptions = useMemo(
    () => getImageResolutionOptions(imageProvider, activeModel),
    [imageProvider, activeModel]
  )
  const imageRequestSettings = useMemo(
    () => resolveImageRequestSettings(imageProvider, activeModel, imageAspectRatio, imageResolution, imageQuality, imageCount),
    [imageProvider, activeModel, imageAspectRatio, imageResolution, imageQuality, imageCount]
  )
  const imageSizePreview = useMemo(
    () => getImageSizePreview(imageRequestSettings.detail),
    [imageRequestSettings.detail]
  )
  const activeModeMeta = useMemo(
    () =>
      chatMode === 'image'
        ? { label: t('Image Generation'), Icon: ImageIcon }
        : { label: t('Chat'), Icon: MessageSquareIcon },
    [chatMode, t]
  )
  const ActiveModeIcon = activeModeMeta.Icon
  const creationModeOptions = useMemo(
    () => [
      { key: 'chat', label: t('Chat'), Icon: MessageSquareIcon, mode: 'chat' as const },
      { key: 'image', label: t('Image Generation'), Icon: ImageIcon, mode: 'image' as const },
      { key: 'agent', label: 'Agent 模式', Icon: BotIcon, disabled: true },
      { key: 'video', label: '视频生成', Icon: VideoIcon, disabled: true },
      { key: 'music', label: '音乐生成', Icon: MusicIcon, disabled: true },
      { key: 'voice', label: '配音生成', Icon: MicIcon, disabled: true },
      { key: 'digital-human', label: '数字人', Icon: UserRoundIcon, disabled: true },
      { key: 'motion', label: '动作模仿', Icon: PersonStandingIcon, disabled: true },
    ],
    [t]
  )

  useEffect(() => {
    const aspectOptions = getImageAspectOptions(imageProvider)
    if (!aspectOptions.includes(imageAspectRatio)) {
      setImageAspectRatio(aspectOptions[0])
    }
    const resolutionOptions = getImageResolutionOptions(imageProvider, activeModel)
    if (!resolutionOptions.includes(imageResolution)) {
      setImageResolution(resolutionOptions[0])
    }
    if (imageProvider === 'gpt' && !IMAGE_QUALITY_OPTIONS.includes(imageQuality as (typeof IMAGE_QUALITY_OPTIONS)[number])) {
      setImageQuality('medium')
    }
  }, [imageProvider, activeModel, imageAspectRatio, imageResolution, imageQuality])

  const resolveRequestGroup = useCallback(
    (modelValue = activeModel) => {
      if (selectedGroups.length === 0) return ''
      const model = models.find((item) => item.value === modelValue)
      const modelGroups = model?.groups?.filter(Boolean) ?? []
      if (modelGroups.length === 0) return selectedGroups[0]
      return (
        selectedGroups.find((group) => group === 'auto' || modelGroups.includes(group)) ||
        selectedGroups[0]
      )
    },
    [activeModel, models, selectedGroups]
  )

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

  // Load active API keys. The selected key's groups constrain the playground
  // model list and one matching group is sent with each request.
  useEffect(() => {
    getApiKeySummaries()
      .then((tokens) => {
        const keyOptions: ApiKeyOption[] = tokens
          .filter((token) => token.status === 1)
          .map((token) => {
            const groups = splitGroupList(token.group)
            const modelLimits = (token.model_limits || '')
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
            return {
              label: token.name || groups.join(',') || 'default',
              value: String(token.id),
              groups: groups.length > 0 ? groups : ['default'],
              modelLimitsEnabled: Boolean(token.model_limits_enabled),
              modelLimits,
            }
          })
        setApiKeyOptions(keyOptions)
        setSelectedApiKeyId((current) =>
          current && keyOptions.some((option) => option.value === current)
            ? current
            : keyOptions[0]?.value || ''
        )
      })
      .catch(() => {
        setApiKeyOptions([])
        setSelectedApiKeyId('')
      })
    getChatUserModels()
      .then((m) => {
        setModels(m)
        if (m.length > 0) setSelectedModel(m[0].value)
      })
      .catch(() => {
        setModels([])
        setSelectedModel('')
      })
  }, [])

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
      if (!activeModel) {
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
      const requestGroup = resolveRequestGroup()

      const source = new SSE('/pg/chat/completions', {
        headers: getCommonHeaders(),
        method: 'POST',
        payload: JSON.stringify({
          model: activeModel,
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
    [activeModel, resolveRequestGroup]
  )

  // Send image generation
  const sendImage = useCallback(
    async (prompt: string) => {
      if (!activeModel) {
        return
      }

      const userMsg: ChatMessage = { key: nanoid(), from: 'user', content: prompt, status: 'complete' }
      const assistantMsg: ChatMessage = { key: nanoid(), from: 'assistant', content: '', status: 'loading' }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsGenerating(true)
      const requestGroup = resolveRequestGroup()

      try {
        if (!selectedApiKeyId) {
          throw new Error('No enabled API key found. Create or enable one first.')
        }
        const rawKey = await getTokenKey(Number(selectedApiKeyId))
        if (!rawKey) {
          throw new Error('Failed to load API key')
        }
        const token = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
        const count = Math.max(1, Number(imageCount) || 1)
        const imageRequest = resolveImageRequestSettings(
          imageProvider,
          activeModel,
          imageAspectRatio,
          imageResolution,
          imageQuality,
          imageCount
        )
        const requests = Array.from({ length: count }, () =>
          sendTokenImageGeneration({
            token,
            model: activeModel,
            prompt,
            group: requestGroup,
            size: imageRequest.size,
            n: 1,
            quality: imageRequest.quality,
            output_format: imageOutputFormat !== 'auto' ? imageOutputFormat : undefined,
            images: pendingImages,
            aspect_ratio: imageRequest.aspect_ratio,
            resolution: imageRequest.resolution,
            ratio: imageRequest.ratio,
          })
        )
        const results = await Promise.all(requests)
        const images = results.flatMap((item) => item.data ?? [])
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.from === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: images[0]?.revised_prompt || prompt,
              images,
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
    [activeModel, selectedApiKeyId, resolveRequestGroup, imageAspectRatio, imageResolution, imageCount, imageQuality, imageOutputFormat, imageProvider, pendingImages]
  )

  // Handle submit
  const handleSubmit = useCallback(() => {
    const text = inputText.trim()
    if (!text && pendingImages.length === 0) return
    if (selectedGroups.length === 0) return

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
  }, [inputText, pendingImages, selectedGroups, activeSessionId, chatMode, messages, sendChat, sendImage])

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
                  disabled={
                    (!inputText.trim() && pendingImages.length === 0) ||
                    selectedGroups.length === 0 ||
                    filteredModels.length === 0 ||
                    !activeModel
                  }
                  className="shrink-0"
                >
                  <SendIcon className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Controls row */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Creation type */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 min-w-[8.75rem] justify-between gap-2 px-3 text-xs"
                      disabled={isGenerating}
                    />
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ActiveModeIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{activeModeMeta.label}</span>
                  </span>
                  <ChevronUpIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-60 rounded-2xl p-1.5 shadow-xl">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">创作类型</div>
                  {creationModeOptions.map((option, index) => (
                    <Fragment key={option.key}>
                      {index === 2 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        disabled={option.disabled}
                        onClick={() => option.mode && setChatMode(option.mode)}
                        className="min-h-10 gap-2 rounded-xl px-2 py-2 text-sm"
                      >
                        <option.Icon className="h-4 w-4" />
                        <span className="flex-1">{option.label}</span>
                        {option.mode === chatMode && <CheckIcon className="h-4 w-4" />}
                      </DropdownMenuItem>
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* API key selector: the selected key's group is used for billing. */}
              <Select
                value={selectedApiKeyId}
                onValueChange={(value) => setSelectedApiKeyId(value ?? '')}
                disabled={isGenerating || apiKeyOptions.length === 0}
              >
                <SelectTrigger className="h-9 min-w-[11rem] flex-1 text-xs">
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
              <Select value={activeModel} onValueChange={(value) => setSelectedModel(value ?? '')} disabled={isGenerating}>
                <SelectTrigger className="h-9 min-w-[12rem] flex-1 text-xs">
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

              {chatMode === 'image' && (
                <Popover open={imageSettingsOpen} onOpenChange={setImageSettingsOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 min-w-[11.5rem] justify-center gap-1 px-3 text-xs"
                        disabled={isGenerating}
                        title={t('Settings')}
                      />
                    }
                  >
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{imageRequestSettings.summary.replace(/ · /g, ' ')}</span>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={10}
                    className="w-[min(92vw,36rem)] rounded-2xl border border-white/10 bg-[#151124]/95 p-4 text-white shadow-2xl backdrop-blur-xl"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-xs text-white/55">{t('Aspect ratio')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {imageAspectOptions.map((ratio) => (
                            <button
                              key={ratio}
                              type="button"
                              className={cn(imageChipClass(imageAspectRatio === ratio), 'h-[3.7rem] w-[4.15rem] flex-col gap-1 px-1.5')}
                              onClick={() => setImageAspectRatio(ratio)}
                            >
                              <span
                                className={cn(
                                  'rounded-[3px] border',
                                  aspectPreviewClass(ratio),
                                  imageAspectRatio === ratio ? 'border-violet-200 bg-violet-200/40' : 'border-white/30 bg-white/10'
                                )}
                              />
                              <span className="text-[11px] leading-none">{ratio === 'auto' ? t('Auto') : ratio}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {imageProvider === 'gpt' ? (
                        <div className="space-y-2">
                          <div className="text-xs text-white/55">{t('Quality')}</div>
                          <div className="grid grid-cols-4 gap-2">
                            {IMAGE_QUALITY_OPTIONS.map((quality) => (
                              <button
                                key={quality}
                                type="button"
                                className={cn(imageChipClass(imageQuality === quality), 'h-10 px-3')}
                                onClick={() => setImageQuality(quality)}
                              >
                                {formatImageQualityLabel(quality)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-xs text-white/55">{t('Resolution')}</div>
                          <div className="grid grid-cols-3 gap-2">
                            {imageResolutionOptions.map((resolution) => (
                              <button
                                key={resolution}
                                type="button"
                                className={cn(imageChipClass(imageResolution === resolution), 'h-10 px-3')}
                                onClick={() => setImageResolution(resolution)}
                              >
                                {formatImageResolutionLabel(resolution)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="text-xs text-white/55">{t('Count')}</div>
                        <div className="grid grid-cols-4 gap-2">
                          {IMAGE_COUNT_OPTIONS.map((count) => (
                            <button
                              key={count}
                              type="button"
                              className={cn(imageChipClass(imageCount === count), 'h-10 px-3')}
                              onClick={() => setImageCount(count)}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs text-white/55">{t('Output format')}</div>
                        <div className="grid grid-cols-4 gap-2">
                          {IMAGE_OUTPUT_FORMATS.map((format) => (
                            <button
                              key={format}
                              type="button"
                              className={cn(imageChipClass(imageOutputFormat === format), 'h-10 px-3')}
                              onClick={() => setImageOutputFormat(format)}
                            >
                              {format}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-xs text-white/45">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                          <span className="mr-2">W</span>
                          <span className="text-white">{imageSizePreview?.width ?? formatImageSize(imageRequestSettings.detail)}</span>
                        </div>
                        <span className="text-white/45">×</span>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                          <span className="mr-2">H</span>
                          <span className="text-white">{imageSizePreview?.height ?? formatImageSize(imageRequestSettings.detail)}</span>
                        </div>
                        <span>PX</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
