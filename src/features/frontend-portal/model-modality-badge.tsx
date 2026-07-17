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
type ModelModalityBadgeProps = {
  modelName: string
  tags?: string
}

export function ModelModalityBadge({ modelName, tags }: ModelModalityBadgeProps) {
  const name = modelName.toLowerCase()
  const tagStr = tags?.toLowerCase() ?? ''
  const isImage =
    name.includes('image') ||
    name.includes('dall-e') ||
    name.includes('midjourney') ||
    name.includes('stable-diffusion') ||
    name.includes('flux') ||
    tagStr.includes('生图') ||
    name.includes('imagen') ||
    name.includes('veo') ||
    name.includes('generate')
  const isVision = name.includes('vision') || tagStr.includes('视觉') || tagStr.includes('vision')
  const isAudio =
    name.includes('tts') ||
    name.includes('whisper') ||
    name.includes('transcribe') ||
    name.includes('audio') ||
    tagStr.includes('语音')

  if (isImage) {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-pink-400 to-rose-500 shadow-sm shadow-pink-200" title="Image">
        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
      </span>
    )
  }
  if (isAudio) {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-200" title="Audio">
        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
      </span>
    )
  }
  if (isVision) {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm shadow-emerald-200" title="Vision">
        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
      </span>
    )
  }
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br from-sky-400 to-sky-500 shadow-sm shadow-sky-200" title="Text">
      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>
    </span>
  )
}
