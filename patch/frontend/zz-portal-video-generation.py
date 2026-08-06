#!/usr/bin/env python3
import json
from pathlib import Path
import re
import sys


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"
ROOT = PROJECT_ROOT / "web" / FRONTEND
if not ROOT.exists():
    ROOT = PROJECT_ROOT


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"portal video patch failed: missing {path}")
    return path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"portal video patch failed: {label} anchor not found")
    return text.replace(old, new, 1)


def replace_once_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"portal video patch failed: {label} anchor not found")
    return new_text


ONLINE_CHAT_I18N_REPLACEMENTS = {
    "label: '视频生成'": "label: t('Video Generation')",
    "label: 'Agent 模式'": "label: t('Agent Mode')",
    "label: '音乐生成'": "label: t('Music Generation')",
    "label: '配音生成'": "label: t('Voice Generation')",
    "label: '数字人'": "label: t('Digital Human')",
    "label: '动作模仿'": "label: t('Motion Imitation')",
    "'视频任务已提交，但没有返回视频地址。'": "t('Video task submitted, but no video URL was returned.')",
    "'视频生成失败'": "t('Video generation failed')",
    "'请描述这张图片'": "t('Please describe this image')",
    "function cleanErrorMessage(raw: string): string {": "function cleanErrorMessage(raw: string, translate: (key: string) => string = (key) => key): string {",
    "msg += '\\n如果您是订阅客户，请确认当前模型在订阅分组中可用。'": "msg += `\\n${translate('If you are a subscriber, please confirm that this model is available in your subscription group.')}`",
    "msg = '订阅余额仅可用于对应的订阅分组。请确认当前模型在订阅分组中可用。'": "msg = translate('Subscription balance can only be used with the corresponding subscription group. Please confirm that this model is available there.')",
    "msg = '当前模型暂时不可用，请稍后重试或切换其他模型。'": "msg = translate('This model is temporarily unavailable. Please try again later or switch to another model.')",
    "cleanErrorMessage(errorMessage)": "cleanErrorMessage(errorMessage, t)",
    "cleanErrorMessage(rawMsg)": "cleanErrorMessage(rawMsg, t)",
    "function formatImageSize(size: string): string {": "function formatImageSize(size: string, translate: (key: string) => string = (key) => key): string {",
    "if (size === 'auto' || size === '') return '智能'": "if (size === 'auto' || size === '') return translate('Smart')",
    "function formatImageQualityLabel(quality: string): string {": "function formatImageQualityLabel(quality: string, translate: (key: string) => string): string {",
    "return '低'": "return translate('Low')",
    "return '中'": "return translate('Medium')",
    "return '高'": "return translate('High')",
    "return '自动'": "return translate('Auto')",
    "function formatImageResolutionLabel(resolution: ImageResolutionTier): string {": "function formatImageResolutionLabel(resolution: ImageResolutionTier, translate: (key: string) => string): string {",
    "return '标清 1K'": "return translate('Standard 1K')",
    "return '高清 2K'": "return translate('HD 2K')",
    "return '超清 4K'": "return translate('Ultra 4K')",
    "let errorMessage = '请求失败'": "let errorMessage = t('Request failed')",
    "'图像生成失败'": "t('Image generation failed')",
    "formatImageQualityLabel(quality)": "formatImageQualityLabel(quality, t)",
    "formatImageResolutionLabel(resolution)": "formatImageResolutionLabel(resolution, t)",
    "formatImageSize(imageRequestSettings.detail)": "formatImageSize(imageRequestSettings.detail, t)",
    "chatMode === 'video' ? '视频生成' : chatMode === 'image' ? '图片对话' : '新对话'": "chatMode === 'video' ? t('Video Generation') : chatMode === 'image' ? t('Image Generation') : t('New Chat')",
    "? '描述你想生成的视频'": "? t('Describe the video you want to generate')",
    "? '描述你想生成的视频...'": "? t('Describe the video you want...')",
    ">创作类型</div>": ">{t('Creation Type')}</div>",
    'title="视频参数"': "title={t('Video Parameters')}",
    'title="视频生成"': "title={t('Video Generation')}",
    ">比例</div>": ">{t('Aspect ratio')}</div>",
    ">分辨率</div>": ">{t('Resolution')}</div>",
    ">时长</div>": ">{t('Video Duration')}</div>",
    "[activeModel, resolveRequestGroup]": "[activeModel, resolveRequestGroup, t]",
    "[activeModel, selectedApiKeyId, resolveRequestGroup, imageAspectRatio, imageResolution, imageCount, imageQuality, imageOutputFormat, imageProvider, pendingImages]": "[activeModel, selectedApiKeyId, resolveRequestGroup, imageAspectRatio, imageResolution, imageCount, imageQuality, imageOutputFormat, imageProvider, pendingImages, t]",
    "[activeModel, selectedApiKeyId, resolveRequestGroup, videoAspectRatio, videoResolution, videoDuration, pendingImages]": "[activeModel, selectedApiKeyId, resolveRequestGroup, videoAspectRatio, videoResolution, videoDuration, pendingImages, t]",
    "[inputText, pendingImages, selectedGroups, activeSessionId, chatMode, messages, sendChat, sendImage, sendVideo]": "[inputText, pendingImages, selectedGroups, activeSessionId, chatMode, messages, sendChat, sendImage, sendVideo, t]",
}


I18N_EN = {
    "Agent Mode": "Agent Mode",
    "Aspect ratio": "Aspect ratio",
    "Creation Type": "Creation Type",
    "Describe the video you want to generate": "Describe the video you want to generate",
    "Describe the video you want...": "Describe the video you want...",
    "Digital Human": "Digital Human",
    "HD 2K": "HD 2K",
    "High": "High",
    "Image generation failed": "Image generation failed",
    "Low": "Low",
    "Medium": "Medium",
    "Motion Imitation": "Motion Imitation",
    "Music Generation": "Music Generation",
    "New Chat": "New Chat",
    "Please describe this image": "Please describe this image",
    "Resolution": "Resolution",
    "Smart": "Smart",
    "Standard 1K": "Standard 1K",
    "Ultra 4K": "Ultra 4K",
    "Video Duration": "Duration",
    "Video Generation": "Video Generation",
    "Video Parameters": "Video Parameters",
    "Video generation failed": "Video generation failed",
    "Video task submitted, but no video URL was returned.": "Video task submitted, but no video URL was returned.",
    "Voice Generation": "Voice Generation",
    "If you are a subscriber, please confirm that this model is available in your subscription group.": "If you are a subscriber, please confirm that this model is available in your subscription group.",
    "Subscription balance can only be used with the corresponding subscription group. Please confirm that this model is available there.": "Subscription balance can only be used with the corresponding subscription group. Please confirm that this model is available there.",
    "This model is temporarily unavailable. Please try again later or switch to another model.": "This model is temporarily unavailable. Please try again later or switch to another model.",
}


I18N_ZH = {
    "Agent Mode": "Agent 模式",
    "Aspect ratio": "比例",
    "Creation Type": "创作类型",
    "Describe the video you want to generate": "描述你想生成的视频",
    "Describe the video you want...": "描述你想生成的视频...",
    "Digital Human": "数字人",
    "HD 2K": "高清 2K",
    "High": "高",
    "Image generation failed": "图像生成失败",
    "Low": "低",
    "Medium": "中",
    "Motion Imitation": "动作模仿",
    "Music Generation": "音乐生成",
    "New Chat": "发起新对话",
    "Please describe this image": "请描述这张图片",
    "Resolution": "分辨率",
    "Smart": "智能",
    "Standard 1K": "标清 1K",
    "Ultra 4K": "超清 4K",
    "Video Duration": "时长",
    "Video Generation": "视频生成",
    "Video Parameters": "视频参数",
    "Video generation failed": "视频生成失败",
    "Video task submitted, but no video URL was returned.": "视频任务已提交，但没有返回视频地址。",
    "Voice Generation": "配音生成",
    "If you are a subscriber, please confirm that this model is available in your subscription group.": "如果您是订阅客户，请确认当前模型在订阅分组中可用。",
    "Subscription balance can only be used with the corresponding subscription group. Please confirm that this model is available there.": "订阅余额仅可用于对应的订阅分组。请确认当前模型在订阅分组中可用。",
    "This model is temporarily unavailable. Please try again later or switch to another model.": "当前模型暂时不可用，请稍后重试或切换其他模型。",
}


def patch_api() -> None:
    rel = "src/features/frontend-portal/api.ts"
    text = read(rel)
    if "export async function sendTokenVideoGeneration(" in text:
        return

    text = replace_once(
        text,
        """type ImageGenerationResult = {
  data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
}
""",
        """type ImageGenerationResult = {
  data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
}

type VideoGenerationResult = {
  data: Array<{ url: string; format?: string }>
  task_id?: string
}

type VideoTaskPayload = {
  id?: string
  task_id?: string
  status?: string
  progress?: number | string
  url?: string
  data?: Array<{ url?: string; format?: string }>
  metadata?: { url?: string; video_url?: string; format?: string }
  output?: {
    task_id?: string
    task_status?: string
    video_url?: string
    results?: Array<{ url?: string; video_url?: string; format?: string }>
    message?: string
  }
  error?: { message?: string }
}
""",
        "video API types",
    )
    text = replace_once(
        text,
        """const IMAGE_TASK_POLL_INTERVAL_MS = 2500
const IMAGE_TASK_MAX_POLLS = 80
""",
        """const IMAGE_TASK_POLL_INTERVAL_MS = 2500
const IMAGE_TASK_MAX_POLLS = 80
const VIDEO_TASK_POLL_INTERVAL_MS = 5000
const VIDEO_TASK_MAX_POLLS = 120
""",
        "video polling constants",
    )
    text = replace_once(
        text,
        """function assertImageTaskNotFailed(body: ImageTaskPayload) {
  const status = String(body.output?.task_status || '').toUpperCase()
  if (status === 'FAILED' || status === 'CANCELED') {
    throw new Error(body.output?.message || body.error?.message || 'Image generation task failed')
  }
}
""",
        """function assertImageTaskNotFailed(body: ImageTaskPayload) {
  const status = String(body.output?.task_status || '').toUpperCase()
  if (status === 'FAILED' || status === 'CANCELED') {
    throw new Error(body.output?.message || body.error?.message || 'Image generation task failed')
  }
}

function extractVideoTaskId(body: VideoTaskPayload): string {
  return body.output?.task_id || body.task_id || body.id || ''
}

function extractVideosFromTask(body: VideoTaskPayload): VideoGenerationResult['data'] {
  if (Array.isArray(body.data) && body.data.length > 0) {
    return body.data
      .map((item) => ({ url: item.url || '', format: item.format }))
      .filter((item) => item.url)
  }
  const directUrl = body.metadata?.url || body.metadata?.video_url || body.output?.video_url || body.url
  if (directUrl) return [{ url: directUrl, format: body.metadata?.format }]
  const results = body.output?.results
  if (Array.isArray(results) && results.length > 0) {
    return results
      .map((item) => ({ url: item.url || item.video_url || '', format: item.format }))
      .filter((item) => item.url)
  }
  return []
}

function assertVideoTaskNotFailed(body: VideoTaskPayload) {
  const status = String(body.status || body.output?.task_status || '').toLowerCase()
  if (['failed', 'failure', 'error', 'canceled', 'cancelled'].includes(status)) {
    throw new Error(body.error?.message || body.output?.message || 'Video generation task failed')
  }
}
""",
        "video task helpers",
    )
    text = replace_once(
        text,
        """async function resolveImageGenerationResponse(
""",
        """async function fetchVideoApiJson(
  path: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: unknown
): Promise<VideoTaskPayload> {
  const requestUrl = resolvePortalRelayUrl(path)
  const res = await fetch(requestUrl, {
    method,
    credentials: headers.Authorization ? 'omit' : 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const rawText = await res.text().catch(() => '')
  let payload: VideoTaskPayload = {}
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as VideoTaskPayload
    } catch {
      payload = {}
    }
  }
  if (!res.ok) {
    const message = payload.error?.message || payload.output?.message || rawText || `HTTP ${res.status}`
    const detail = `${method} ${path} -> HTTP ${res.status}${res.url ? ` (${res.url})` : ''}`
    throw new Error(`${message}\n${detail}`)
  }
  return payload
}

async function resolveImageGenerationResponse(
""",
        "video API request helper",
    )
    marker = """// ----------------------------------------------------------------------------
// Cookie-auth API functions (Playground-style, no Bearer token needed)
// ----------------------------------------------------------------------------
"""
    video_function = """export async function sendTokenVideoGeneration(params: {
  token: string
  model: string
  prompt: string
  group?: string
  size?: string
  duration?: number
  image?: string
  images?: string[]
}): Promise<VideoGenerationResult> {
  const headers = { Authorization: `Bearer ${params.token}` }
  const payload = await fetchVideoApiJson('/v1/videos', 'POST', headers, {
    model: params.model,
    prompt: params.prompt,
    response_format: 'url',
    ...(params.group && { group: params.group }),
    ...(params.size && { size: params.size }),
    ...(params.duration && { duration: params.duration }),
    ...(params.image && { image: params.image }),
    ...(params.images && params.images.length > 0 && { images: params.images }),
  })

  const directVideos = extractVideosFromTask(payload)
  const taskId = extractVideoTaskId(payload)
  if (directVideos.length > 0) return { data: directVideos, task_id: taskId }
  if (!taskId) return { data: [] }

  for (let i = 0; i < VIDEO_TASK_MAX_POLLS; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, VIDEO_TASK_POLL_INTERVAL_MS))
    const taskBody = await fetchVideoApiJson(`/v1/videos/${encodeURIComponent(taskId)}`, 'GET', headers)
    assertVideoTaskNotFailed(taskBody)
    const videos = extractVideosFromTask(taskBody)
    if (videos.length > 0) return { data: videos, task_id: taskId }
  }

  throw new Error('Video generation task timed out')
}

"""
    text = replace_once(text, marker, video_function + marker, "video API function marker")
    write(rel, text)


def patch_online_chat() -> None:
    rel = "src/features/frontend-portal/online-chat.tsx"
    text = read(rel)
    if "type ChatMode = 'chat' | 'image' | 'video'" not in text:
        text = replace_once(
            text,
            "import { getApiKeySummaries, getChatUserModels, getTokenKey, sendTokenImageGeneration } from './api'",
            "import { getApiKeySummaries, getChatUserModels, getTokenKey, sendTokenImageGeneration, sendTokenVideoGeneration } from './api'",
            "online chat API import",
        )
        text = replace_once(text, "type ChatMode = 'chat' | 'image'", "type ChatMode = 'chat' | 'image' | 'video'", "chat mode type")
        text = replace_once(
            text,
            "  images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>\n",
            "  images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>\n  videos?: Array<{ url: string; format?: string }>\n",
            "chat message video field",
        )
        text = replace_once(
            text,
            "type ImageResolutionTier = '1K' | '2K' | '4K'\n",
            """type ImageResolutionTier = '1K' | '2K' | '4K'
type VideoAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
type VideoResolutionTier = '480' | '720' | '1080'
type VideoDuration = '5' | '10' | '15'
""",
            "video setting types",
        )
        text = replace_once(
            text,
            "const GEMINI_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']\n",
            """const GEMINI_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']
const VIDEO_ASPECT_OPTIONS: VideoAspectRatio[] = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
const VIDEO_RESOLUTION_OPTIONS: VideoResolutionTier[] = ['480', '720', '1080']
const VIDEO_DURATION_OPTIONS: VideoDuration[] = ['5', '10', '15']
const VIDEO_SIZE_BY_RESOLUTION_RATIO: Record<VideoResolutionTier, Record<VideoAspectRatio, string>> = {
  '480': { '21:9': '1120x480', '16:9': '832x480', '4:3': '640x480', '1:1': '624x624', '3:4': '480x640', '9:16': '480x832' },
  '720': { '21:9': '1680x720', '16:9': '1280x720', '4:3': '960x720', '1:1': '960x960', '3:4': '720x960', '9:16': '720x1280' },
  '1080': { '21:9': '2520x1080', '16:9': '1920x1080', '4:3': '1440x1080', '1:1': '1440x1440', '3:4': '1080x1440', '9:16': '1080x1920' },
}
""",
            "video setting options",
        )
        helper_anchor = "function getImageSizePreview(size: string): { width: string; height: string } | null {\n"
        video_helpers = """function resolveVideoRequestSettings(aspectRatio: VideoAspectRatio, resolution: VideoResolutionTier, duration: VideoDuration): VideoRequestSettings {
  const size = VIDEO_SIZE_BY_RESOLUTION_RATIO[resolution][aspectRatio]
  return { size, duration: Number(duration), summary: `${aspectRatio} · ${resolution}P · ${duration}s`, detail: size }
}

"""
        text = replace_once(text, helper_anchor, video_helpers + helper_anchor, "video settings helpers")
        text = replace_once(text, "(item.mode === 'chat' || item.mode === 'image')", "(item.mode === 'chat' || item.mode === 'image' || item.mode === 'video')", "session mode validation")
        text = replace_once(
            text,
            "  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)\n",
            """  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9')
  const [videoResolution, setVideoResolution] = useState<VideoResolutionTier>('480')
  const [videoDuration, setVideoDuration] = useState<VideoDuration>('5')
  const [videoSettingsOpen, setVideoSettingsOpen] = useState(false)
""",
            "video setting state",
        )
        text = replace_once(
            text,
            "      { key: 'video', label: '视频生成', Icon: VideoIcon, disabled: true },",
            "      { key: 'video', label: '视频生成', Icon: VideoIcon, mode: 'video' as const },",
            "enable video creation mode",
        )
        text = replace_once(
            text,
            """      chatMode === 'image'
        ? { label: t('Image Generation'), Icon: ImageIcon }
        : { label: t('Chat'), Icon: MessageSquareIcon },
""",
            """      chatMode === 'image'
        ? { label: t('Image Generation'), Icon: ImageIcon }
        : chatMode === 'video'
          ? { label: '视频生成', Icon: VideoIcon }
          : { label: t('Chat'), Icon: MessageSquareIcon },
""",
            "active video mode label",
        )
        send_marker = "  // Handle submit\n"
        send_video = """  const sendVideo = useCallback(
    async (prompt: string) => {
      if (!activeModel) return
      const userMsg: ChatMessage = { key: nanoid(), from: 'user', content: prompt, status: 'complete' }
      const assistantMsg: ChatMessage = { key: nanoid(), from: 'assistant', content: '', status: 'loading' }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsGenerating(true)
      try {
        if (!selectedApiKeyId) throw new Error('No enabled API key found. Create or enable one first.')
        const rawKey = await getTokenKey(Number(selectedApiKeyId))
        if (!rawKey) throw new Error('Failed to load API key')
        const token = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
        const settings = resolveVideoRequestSettings(videoAspectRatio, videoResolution, videoDuration)
        const result = await sendTokenVideoGeneration({
          token,
          model: activeModel,
          prompt,
          group: resolveRequestGroup(),
          size: settings.size,
          duration: settings.duration,
          image: pendingImages[0],
          images: pendingImages,
        })
        const videos = result.data ?? []
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          return last?.from === 'assistant'
            ? [...updated.slice(0, -1), { ...last, content: prompt, videos, status: 'complete' }]
            : updated
        })
      } catch (err) {
        const message = cleanErrorMessage(err instanceof Error ? err.message : '视频生成失败')
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          return last?.from === 'assistant'
            ? [...updated.slice(0, -1), { ...last, content: message, status: 'error' }]
            : updated
        })
      } finally {
        setIsGenerating(false)
      }
    },
    [activeModel, selectedApiKeyId, resolveRequestGroup, videoAspectRatio, videoResolution, videoDuration, pendingImages]
  )

"""
        text = replace_once(text, send_marker, send_video + send_marker, "send video function marker")
        text = replace_once(
            text,
            """    if (chatMode === 'image') {
      sendImage(text)
      setPendingImages([])
      return
    }
""",
            """    if (chatMode === 'image') {
      sendImage(text)
      setPendingImages([])
      return
    }
    if (chatMode === 'video') {
      sendVideo(text)
      setPendingImages([])
      return
    }
""",
            "video submit branch",
        )
        text = text.replace(
            "}, [inputText, pendingImages, selectedGroups, activeSessionId, chatMode, messages, sendChat, sendImage])",
            "}, [inputText, pendingImages, selectedGroups, activeSessionId, chatMode, messages, sendChat, sendImage, sendVideo])",
            1,
        )
        text = text.replace(
            "{session.mode === 'image' ? (\n                  <ImageIcon",
            "{session.mode === 'image' ? (\n                  <ImageIcon",
            1,
        )
        text = text.replace(
            """                {session.mode === 'image' ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
""",
            """                {session.mode === 'image' ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : session.mode === 'video' ? (
                  <VideoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
""",
            1,
        )
        text = text.replace(
            ": t('Describe the image you want to generate')}",
            ": chatMode === 'video' ? '描述你想生成的视频' : t('Describe the image you want to generate')}",
            1,
        )
        text = text.replace(
            "{chatMode === 'image' ? t('Generating...') : t('Responding...')}",
            "{chatMode === 'image' || chatMode === 'video' ? t('Generating...') : t('Responding...')}",
            1,
        )
        text = text.replace(
            ": t('Describe the image you want...')}",
            ": chatMode === 'video' ? '描述你想生成的视频...' : t('Describe the image you want...')}",
            1,
        )
        video_render = """                  {msg.videos && msg.videos.length > 0 && (
                    <div className="mt-2 flex flex-col gap-3">
                      {msg.videos.map((video, i) => (
                        <a key={i} href={video.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border bg-black transition hover:shadow-md">
                          <video src={video.url} controls playsInline className="max-h-96 w-full max-w-full object-contain" />
                        </a>
                      ))}
                    </div>
                  )}

"""
        text = replace_once(text, "                  {/* Generated images */}\n", video_render + "                  {/* Generated images */}\n", "video result render")
        video_popover = """              {chatMode === 'video' && (
                <Popover open={videoSettingsOpen} onOpenChange={setVideoSettingsOpen}>
                  <PopoverTrigger render={<Button variant="outline" size="sm" className={cn('h-9 min-w-[11.5rem] justify-center gap-1 px-3 text-xs', videoSettingsOpen ? 'border-[#8B5CF6]/70 bg-[#7C3AED]/20 text-white shadow-sm shadow-[#7C3AED]/20 hover:bg-[#7C3AED]/30' : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-[#8B5CF6]/60 hover:bg-[#7C3AED]/15')} disabled={isGenerating} title="视频参数" />}>
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{resolveVideoRequestSettings(videoAspectRatio, videoResolution, videoDuration).summary.replace(/ · /g, ' ')}</span>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" sideOffset={10} className="w-[min(94vw,34rem)] rounded-xl border border-[#8B5CF6]/25 bg-[#151124]/95 p-3 text-white shadow-2xl shadow-[#7C3AED]/15 backdrop-blur-xl">
                    <div className="space-y-4">
                      <div className="space-y-2"><div className="text-xs text-white/55">比例</div><div className="grid grid-cols-6 gap-1.5 rounded-xl bg-white/[0.04] p-1.5">
                        {VIDEO_ASPECT_OPTIONS.map((ratio) => <button key={ratio} type="button" aria-pressed={videoAspectRatio === ratio} className={cn(imageChipClass(videoAspectRatio === ratio), 'h-[4.25rem] min-w-0 flex-col gap-1 px-1')} onClick={() => setVideoAspectRatio(ratio)}><span className={cn('rounded-[3px] border', aspectPreviewClass(ratio), videoAspectRatio === ratio ? 'border-[#8B5CF6] bg-[#7C3AED]/45' : 'border-white/30 bg-white/10')} /><span className="text-[10px] leading-none">{ratio}</span></button>)}
                      </div></div>
                      <div className="space-y-2"><div className="text-xs text-white/55">分辨率</div><div className="grid grid-cols-3 gap-2">
                        {VIDEO_RESOLUTION_OPTIONS.map((resolution) => <button key={resolution} type="button" aria-pressed={videoResolution === resolution} className={cn(imageChipClass(videoResolution === resolution), 'h-10 px-3')} onClick={() => setVideoResolution(resolution)}>{resolution}P</button>)}
                      </div></div>
                      <div className="space-y-2"><div className="text-xs text-white/55">时长</div><div className="grid grid-cols-3 gap-2">
                        {VIDEO_DURATION_OPTIONS.map((duration) => <button key={duration} type="button" aria-pressed={videoDuration === duration} className={cn(imageChipClass(videoDuration === duration), 'h-10 px-3')} onClick={() => setVideoDuration(duration)}>{duration}s</button>)}
                      </div></div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
"""
        text = replace_once(text, "            </div>\n          </div>\n        </div>\n      </div>\n      </div>\n    </div>", video_popover + "            </div>\n          </div>\n        </div>\n      </div>\n      </div>\n    </div>", "video settings popover")
    # Self-heal partially patched files.  The one-key updater always starts
    # from a moving upstream target, so never use a single broad guard as proof
    # that every video insertion below is present.
    if not re.search(
        r"import\s+\{[^}\n]*\bsendTokenVideoGeneration\b[^}\n]*\}\s+from\s+'\.\/api'",
        text,
    ):
        if "sendTokenImageGeneration } from './api'" in text:
            text = replace_once(
                text,
                "sendTokenImageGeneration } from './api'",
                "sendTokenImageGeneration, sendTokenVideoGeneration } from './api'",
                "missing video API import",
            )
        else:
            text = replace_once_regex(
                text,
                r"(import\s+\{[^}\n]*sendTokenImageGeneration)([^}\n]*\}\s+from\s+'\.\/api')",
                r"\1, sendTokenVideoGeneration\2",
                "missing video API import",
            )
    if "type ChatMode = 'chat' | 'image' | 'video'" not in text:
        text = replace_once(text, "type ChatMode = 'chat' | 'image'", "type ChatMode = 'chat' | 'image' | 'video'", "missing video chat mode")
    if "videos?: Array<{ url: string; format?: string }>" not in text:
        text = replace_once(
            text,
            "  images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>\n",
            "  images?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>\n  videos?: Array<{ url: string; format?: string }>\n",
            "missing chat message video field",
        )
    if "type VideoAspectRatio =" not in text:
        text = replace_once(
            text,
            "type ImageResolutionTier = '1K' | '2K' | '4K'\n",
            """type ImageResolutionTier = '1K' | '2K' | '4K'
type VideoAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
type VideoResolutionTier = '480' | '720' | '1080'
type VideoDuration = '5' | '10' | '15'
""",
            "missing video setting types",
        )
    if "type VideoRequestSettings =" not in text:
        text = replace_once(
            text,
            """type ImageRequestSettings = {
  size: string
  quality?: string
  aspect_ratio?: string
  resolution?: string
  ratio?: string
  summary: string
  detail: string
}
""",
            """type ImageRequestSettings = {
  size: string
  quality?: string
  aspect_ratio?: string
  resolution?: string
  ratio?: string
  summary: string
  detail: string
}
type VideoRequestSettings = {
  size: string
  duration: number
  summary: string
  detail: string
}
""",
            "missing video request settings type",
        )
    if "const VIDEO_ASPECT_OPTIONS" not in text:
        text = replace_once(
            text,
            "const GEMINI_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']\n",
            """const GEMINI_RESOLUTION_OPTIONS: ImageResolutionTier[] = ['1K', '2K', '4K']
const VIDEO_ASPECT_OPTIONS: VideoAspectRatio[] = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
const VIDEO_RESOLUTION_OPTIONS: VideoResolutionTier[] = ['480', '720', '1080']
const VIDEO_DURATION_OPTIONS: VideoDuration[] = ['5', '10', '15']
""",
            "missing video option constants",
        )
    if "const VIDEO_SIZE_BY_RESOLUTION_RATIO" not in text:
        text = replace_once(
            text,
            "const VIDEO_DURATION_OPTIONS: VideoDuration[] = ['5', '10', '15']\n",
            """const VIDEO_DURATION_OPTIONS: VideoDuration[] = ['5', '10', '15']
const VIDEO_SIZE_BY_RESOLUTION_RATIO: Record<VideoResolutionTier, Record<VideoAspectRatio, string>> = {
  '480': { '21:9': '1120x480', '16:9': '832x480', '4:3': '640x480', '1:1': '624x624', '3:4': '480x640', '9:16': '480x832' },
  '720': { '21:9': '1680x720', '16:9': '1280x720', '4:3': '960x720', '1:1': '960x960', '3:4': '720x960', '9:16': '720x1280' },
  '1080': { '21:9': '2520x1080', '16:9': '1920x1080', '4:3': '1440x1080', '1:1': '1440x1440', '3:4': '1080x1440', '9:16': '1080x1920' },
}
""",
            "missing video size map",
        )
    if "function aspectPreviewClass(ratio: ImageAspectRatio | VideoAspectRatio)" not in text and "function aspectPreviewClass(ratio: ImageAspectRatio)" in text:
        text = replace_once(
            text,
            "function aspectPreviewClass(ratio: ImageAspectRatio)",
            "function aspectPreviewClass(ratio: ImageAspectRatio | VideoAspectRatio)",
            "missing video aspect preview type",
        )
    if "function resolveVideoRequestSettings(" in text and "const size = VIDEO_SIZE_BY_RESOLUTION_RATIO[resolution][aspectRatio]" not in text:
        text = replace_once_regex(
            text,
            r"function resolveVideoRequestSettings\((?:.|\n)*?\n\}\n\nfunction getImageSizePreview",
            """function resolveVideoRequestSettings(
  aspectRatio: VideoAspectRatio,
  resolution: VideoResolutionTier,
  duration: VideoDuration
): VideoRequestSettings {
  const size = VIDEO_SIZE_BY_RESOLUTION_RATIO[resolution][aspectRatio]
  return {
    size,
    duration: Number(duration),
    summary: `${aspectRatio} · ${resolution}P · ${duration}s`,
    detail: size,
  }
}

function getImageSizePreview""",
            "stale video settings helper",
        )
    if "resolveVideoRequestSettings(" in text and "function resolveVideoRequestSettings(" not in text:
        helper_anchor = "function getImageSizePreview(size: string): { width: string; height: string } | null {\n"
        video_helpers = """function resolveVideoRequestSettings(
  aspectRatio: VideoAspectRatio,
  resolution: VideoResolutionTier,
  duration: VideoDuration
): VideoRequestSettings {
  const size = VIDEO_SIZE_BY_RESOLUTION_RATIO[resolution][aspectRatio]
  return {
    size,
    duration: Number(duration),
    summary: `${aspectRatio} · ${resolution}P · ${duration}s`,
    detail: size,
  }
}

"""
        text = replace_once(text, helper_anchor, video_helpers + helper_anchor, "missing video settings helper")
    if "const [videoAspectRatio, setVideoAspectRatio]" not in text:
        text = replace_once(
            text,
            "  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)\n",
            """  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9')
  const [videoResolution, setVideoResolution] = useState<VideoResolutionTier>('480')
  const [videoDuration, setVideoDuration] = useState<VideoDuration>('5')
  const [videoSettingsOpen, setVideoSettingsOpen] = useState(false)
""",
            "missing video setting state",
        )
    if "const videoRequestSettings = useMemo(" not in text:
        text = replace_once(
            text,
            """  const imageSizePreview = useMemo(
    () => getImageSizePreview(imageRequestSettings.detail),
    [imageRequestSettings.detail]
  )
""",
            """  const imageSizePreview = useMemo(
    () => getImageSizePreview(imageRequestSettings.detail),
    [imageRequestSettings.detail]
  )
  const videoRequestSettings = useMemo(
    () => resolveVideoRequestSettings(videoAspectRatio, videoResolution, videoDuration),
    [videoAspectRatio, videoResolution, videoDuration]
  )
  const videoSizePreview = useMemo(
    () => getImageSizePreview(videoRequestSettings.detail),
    [videoRequestSettings.detail]
  )
""",
            "missing video request memo",
        )
    if "{ key: 'video', label: '视频生成', Icon: VideoIcon, disabled: true }" in text:
        text = replace_once(
            text,
            "{ key: 'video', label: '视频生成', Icon: VideoIcon, disabled: true }",
            "{ key: 'video', label: '视频生成', Icon: VideoIcon, mode: 'video' as const }",
            "disabled video mode option",
        )
    if (
        "if (chatMode === 'video') return { label: t('Video Generation'), Icon: VideoIcon }" not in text
        and "if (chatMode === 'video') return { label: '视频生成', Icon: VideoIcon }" not in text
    ):
        anchor = "      if (chatMode === 'image') return { label: t('Image Generation'), Icon: ImageIcon }\n      return { label: t('Chat'), Icon: MessageSquareIcon }\n"
        replacement = "      if (chatMode === 'image') return { label: t('Image Generation'), Icon: ImageIcon }\n      if (chatMode === 'video') return { label: t('Video Generation'), Icon: VideoIcon }\n      return { label: t('Chat'), Icon: MessageSquareIcon }\n"
        text = replace_once(text, anchor, replacement, "missing active video mode label")
    if "const sendVideo = useCallback(" not in text:
        send_video = """  // Send video generation
  const sendVideo = useCallback(
    async (prompt: string) => {
      if (!activeModel) return
      const userMsg: ChatMessage = { key: nanoid(), from: 'user', content: prompt, status: 'complete' }
      const assistantMsg: ChatMessage = { key: nanoid(), from: 'assistant', content: '', status: 'loading' }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsGenerating(true)
      try {
        if (!selectedApiKeyId) throw new Error('No enabled API key found. Create or enable one first.')
        const rawKey = await getTokenKey(Number(selectedApiKeyId))
        if (!rawKey) throw new Error('Failed to load API key')
        const token = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
        const settings = resolveVideoRequestSettings(videoAspectRatio, videoResolution, videoDuration)
        const result = await sendTokenVideoGeneration({
          token,
          model: activeModel,
          prompt,
          group: resolveRequestGroup(),
          size: settings.size,
          duration: settings.duration,
          image: pendingImages[0],
          images: pendingImages,
        })
        const videos = result.data ?? []
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          return last?.from === 'assistant'
            ? [...updated.slice(0, -1), { ...last, content: videos.length > 0 ? prompt : '视频任务已提交，但没有返回视频地址。', videos, status: videos.length > 0 ? 'complete' : 'error' }]
            : updated
        })
      } catch (err) {
        const message = cleanErrorMessage(err instanceof Error ? err.message : '视频生成失败')
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          return last?.from === 'assistant'
            ? [...updated.slice(0, -1), { ...last, content: message, status: 'error' }]
            : updated
        })
      } finally {
        setIsGenerating(false)
      }
    },
    [activeModel, selectedApiKeyId, resolveRequestGroup, videoAspectRatio, videoResolution, videoDuration, pendingImages]
  )

"""
        text = replace_once(text, "  // Handle submit\n", send_video + "  // Handle submit\n", "missing send video function")
    if "if (chatMode === 'video') {" not in text:
        text = replace_once(
            text,
            """    if (chatMode === 'image') {
      sendImage(text)
      setPendingImages([])
      return
    }
""",
            """    if (chatMode === 'image') {
      sendImage(text)
      setPendingImages([])
      return
    }
    if (chatMode === 'video') {
      sendVideo(text)
      setPendingImages([])
      return
    }
""",
            "missing video submit branch",
        )
    if "sendChat, sendImage, sendVideo" not in text:
        text = text.replace(
            "sendChat, sendImage])",
            "sendChat, sendImage, sendVideo])",
            1,
        )
    if "msg.videos && msg.videos.length > 0" not in text:
        video_render = """                  {msg.videos && msg.videos.length > 0 && (
                    <div className="mt-2 flex flex-col gap-3">
                      {msg.videos.map((video, i) => (
                        <a key={i} href={video.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border bg-black transition hover:shadow-md">
                          <video src={video.url} controls playsInline className="max-h-96 w-full max-w-full object-contain" />
                        </a>
                      ))}
                    </div>
                  )}

"""
        text = replace_once(text, "                  {/* Generated images */}\n", video_render + "                  {/* Generated images */}\n", "missing video result render")
    if "{chatMode === 'video' && (" not in text:
        video_popover = """              {chatMode === 'video' && (
                <Popover open={videoSettingsOpen} onOpenChange={setVideoSettingsOpen}>
                  <PopoverTrigger render={<Button variant="outline" size="sm" className={cn('h-9 min-w-[11.5rem] justify-center gap-1 px-3 text-xs', videoSettingsOpen ? 'border-[#8B5CF6]/70 bg-[#7C3AED]/20 text-white shadow-sm shadow-[#7C3AED]/20 hover:bg-[#7C3AED]/30' : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-[#8B5CF6]/60 hover:bg-[#7C3AED]/15')} disabled={isGenerating} title="视频参数" />}>
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{videoRequestSettings.summary.replace(/ · /g, ' ')}</span>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" sideOffset={10} className="w-[min(94vw,34rem)] rounded-xl border border-[#8B5CF6]/25 bg-[#151124]/95 p-3 text-white shadow-2xl shadow-[#7C3AED]/15 backdrop-blur-xl">
                    <div className="space-y-4">
                      <div className="space-y-2"><div className="text-xs text-white/55">比例</div><div className="grid grid-cols-6 gap-1.5 rounded-xl bg-white/[0.04] p-1.5">
                        {VIDEO_ASPECT_OPTIONS.map((ratio) => <button key={ratio} type="button" aria-pressed={videoAspectRatio === ratio} className={cn(imageChipClass(videoAspectRatio === ratio), 'h-[4.25rem] min-w-0 flex-col gap-1 px-1')} onClick={() => setVideoAspectRatio(ratio)}><span className={cn('rounded-[3px] border', aspectPreviewClass(ratio), videoAspectRatio === ratio ? 'border-[#8B5CF6] bg-[#7C3AED]/45' : 'border-white/30 bg-white/10')} /><span className="text-[10px] leading-none">{ratio}</span></button>)}
                      </div></div>
                      <div className="space-y-2"><div className="text-xs text-white/55">分辨率</div><div className="grid grid-cols-3 gap-2">
                        {VIDEO_RESOLUTION_OPTIONS.map((resolution) => <button key={resolution} type="button" aria-pressed={videoResolution === resolution} className={cn(imageChipClass(videoResolution === resolution), 'h-10 px-3')} onClick={() => setVideoResolution(resolution)}>{resolution}P</button>)}
                      </div></div>
                      <div className="space-y-2"><div className="text-xs text-white/55">时长</div><div className="grid grid-cols-3 gap-2">
                        {VIDEO_DURATION_OPTIONS.map((duration) => <button key={duration} type="button" aria-pressed={videoDuration === duration} className={cn(imageChipClass(videoDuration === duration), 'h-10 px-3')} onClick={() => setVideoDuration(duration)}>{duration}s</button>)}
                      </div></div>
                      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-xs text-white/45"><div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"><span className="mr-2">W</span><span className="text-white">{videoSizePreview?.width}</span></div><span className="text-white/45">×</span><div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"><span className="mr-2">H</span><span className="text-white">{videoSizePreview?.height}</span></div><span>PX</span></div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
"""
        text = replace_once(text, "            </div>\n          </div>\n        </div>\n      </div>\n      </div>\n    </div>", video_popover + "            </div>\n          </div>\n        </div>\n      </div>\n      </div>\n    </div>", "missing video settings popover")
    style_replacements = {
        "'border-violet-300/80 bg-violet-500/85 text-white shadow-sm'": "'border-[#8B5CF6] bg-[#7C3AED] text-white shadow-sm shadow-[#7C3AED]/35 hover:bg-[#6D28D9]'",
        "'border-primary bg-primary text-white shadow-sm shadow-primary/25 hover:bg-primary/90'": "'border-[#8B5CF6] bg-[#7C3AED] text-white shadow-sm shadow-[#7C3AED]/35 hover:bg-[#6D28D9]'",
        "'border-white/10 bg-white/[0.04] text-white/65 hover:border-primary/50 hover:bg-primary/15 hover:text-white'": "'border-white/10 bg-white/[0.04] text-white/70 hover:border-[#8B5CF6]/70 hover:bg-[#7C3AED]/20 hover:text-white'",
        "'border-primary/15 bg-primary/5 text-white/70 hover:border-primary/40 hover:bg-primary/10 hover:text-white'": "'border-white/10 bg-white/[0.04] text-white/70 hover:border-[#8B5CF6]/70 hover:bg-[#7C3AED]/20 hover:text-white'",
        "border border-white/10 bg-[#151124]/95 p-4 text-white shadow-2xl backdrop-blur-xl": "border border-[#8B5CF6]/25 bg-[#151124]/95 p-4 text-white shadow-2xl shadow-[#7C3AED]/15 backdrop-blur-xl",
        "border border-primary/20 bg-[#151124]/95 p-4 text-white shadow-2xl shadow-primary/10 backdrop-blur-xl": "border border-[#8B5CF6]/25 bg-[#151124]/95 p-4 text-white shadow-2xl shadow-[#7C3AED]/15 backdrop-blur-xl",
        "border border-white/10 bg-[#151124]/95 p-3 text-white shadow-2xl backdrop-blur-xl": "border border-[#8B5CF6]/25 bg-[#151124]/95 p-3 text-white shadow-2xl shadow-[#7C3AED]/15 backdrop-blur-xl",
        "border border-primary/20 bg-[#151124]/95 p-3 text-white shadow-2xl shadow-primary/10 backdrop-blur-xl": "border border-[#8B5CF6]/25 bg-[#151124]/95 p-3 text-white shadow-2xl shadow-[#7C3AED]/15 backdrop-blur-xl",
        "'border-violet-200 bg-violet-200/40' : 'border-white/30 bg-white/10'": "'border-[#8B5CF6] bg-[#7C3AED]/45' : 'border-white/30 bg-white/10'",
        "'border-white/80 bg-white/45' : 'border-primary/20 bg-primary/10'": "'border-[#8B5CF6] bg-[#7C3AED]/45' : 'border-white/30 bg-white/10'",
    }
    for old, new in style_replacements.items():
        text = text.replace(old, new)
    for old, new in ONLINE_CHAT_I18N_REPLACEMENTS.items():
        text = text.replace(old, new)
    write(rel, text)


def patch_locale_file(rel: str, entries: dict[str, str]) -> None:
    path = ROOT / rel
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    translations = data.setdefault("translation", {})
    changed = False
    for key, value in entries.items():
        if translations.get(key) != value:
            translations[key] = value
            changed = True
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_static_i18n_keys() -> None:
    rel = "src/i18n/static-keys.ts"
    path = ROOT / rel
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    missing = [key for key in I18N_EN if f"'{key}'" not in text]
    if not missing:
        return
    block = "".join(f"  '{key}',\n" for key in missing)
    if "  // Roles\n" in text:
        text = text.replace("  // Roles\n", block + "\n  // Roles\n", 1)
    else:
        text = text.replace("]\n", block + "]\n", 1)
    path.write_text(text, encoding="utf-8")


def patch_i18n() -> None:
    patch_locale_file("src/i18n/locales/en.json", I18N_EN)
    patch_locale_file("src/i18n/locales/zh.json", I18N_ZH)
    patch_static_i18n_keys()


def main() -> None:
    patch_api()
    patch_online_chat()
    patch_i18n()
    print("applied portal video generation frontend patch")


if __name__ == "__main__":
    main()
