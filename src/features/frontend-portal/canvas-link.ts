import type { ChatPreset } from '@/features/chat/lib/chat-links'

export function isCanvasPreset(preset: ChatPreset): boolean {
  const text = `${preset.name} ${preset.url}`.toLowerCase()
  return (
    text.includes('canvas.best') ||
    text.includes('infinite-canvas') ||
    text.includes('canvas ') ||
    text.includes('canvas.') ||
    text.includes('/canvas') ||
    text.includes('无限画布') ||
    text.includes('холст')
  )
}
