#!/usr/bin/env python3
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
                  <PopoverTrigger render={<Button variant="outline" size="sm" className="h-9 min-w-[11.5rem] justify-center gap-1 px-3 text-xs" disabled={isGenerating} title="视频参数" />}>
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{resolveVideoRequestSettings(videoAspectRatio, videoResolution, videoDuration).summary.replace(/ · /g, ' ')}</span>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" sideOffset={10} className="w-[min(94vw,34rem)] rounded-xl border border-white/10 bg-[#151124]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
                    <div className="space-y-4">
                      <div className="space-y-2"><div className="text-xs text-white/55">比例</div><div className="grid grid-cols-6 gap-1.5 rounded-xl bg-white/[0.04] p-1.5">
                        {VIDEO_ASPECT_OPTIONS.map((ratio) => <button key={ratio} type="button" aria-pressed={videoAspectRatio === ratio} className={cn(imageChipClass(videoAspectRatio === ratio), 'h-[4.25rem] min-w-0 flex-col gap-1 px-1')} onClick={() => setVideoAspectRatio(ratio)}><span className={cn('rounded-[3px] border', aspectPreviewClass(ratio), videoAspectRatio === ratio ? 'border-violet-200 bg-violet-200/40' : 'border-white/30 bg-white/10')} /><span className="text-[10px] leading-none">{ratio}</span></button>)}
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
    if "if (chatMode === 'video') return { label: '视频生成', Icon: VideoIcon }" not in text:
        text = replace_once(
            text,
            "      if (chatMode === 'image') return { label: t('Image Generation'), Icon: ImageIcon }\n      return { label: t('Chat'), Icon: MessageSquareIcon }\n",
            "      if (chatMode === 'image') return { label: t('Image Generation'), Icon: ImageIcon }\n      if (chatMode === 'video') return { label: '视频生成', Icon: VideoIcon }\n      return { label: t('Chat'), Icon: MessageSquareIcon }\n",
            "missing active video mode label",
        )
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
                  <PopoverTrigger render={<Button variant="outline" size="sm" className="h-9 min-w-[11.5rem] justify-center gap-1 px-3 text-xs" disabled={isGenerating} title="视频参数" />}>
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{videoRequestSettings.summary.replace(/ · /g, ' ')}</span>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" sideOffset={10} className="w-[min(94vw,34rem)] rounded-xl border border-white/10 bg-[#151124]/95 p-3 text-white shadow-2xl backdrop-blur-xl">
                    <div className="space-y-4">
                      <div className="space-y-2"><div className="text-xs text-white/55">比例</div><div className="grid grid-cols-6 gap-1.5 rounded-xl bg-white/[0.04] p-1.5">
                        {VIDEO_ASPECT_OPTIONS.map((ratio) => <button key={ratio} type="button" aria-pressed={videoAspectRatio === ratio} className={cn(imageChipClass(videoAspectRatio === ratio), 'h-[4.25rem] min-w-0 flex-col gap-1 px-1')} onClick={() => setVideoAspectRatio(ratio)}><span className={cn('rounded-[3px] border', aspectPreviewClass(ratio), videoAspectRatio === ratio ? 'border-violet-200 bg-violet-200/40' : 'border-white/30 bg-white/10')} /><span className="text-[10px] leading-none">{ratio}</span></button>)}
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
    write(rel, text)


def main() -> None:
    patch_api()
    patch_online_chat()
    print("applied portal video generation frontend patch")


if __name__ == "__main__":
    main()
