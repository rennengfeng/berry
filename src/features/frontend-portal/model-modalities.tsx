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
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

const MODALITY: Record<string, { cls: string; title: string; path: ReactNode }> = {
  text: {
    cls: 'from-sky-400 to-sky-500 shadow-sky-200',
    title: 'Text',
    path: (
      <>
        <path d="M4 7V4h16v3" />
        <path d="M9 20h6" />
        <path d="M12 4v16" />
      </>
    ),
  },
  image: {
    cls: 'from-pink-400 to-rose-500 shadow-pink-200',
    title: 'Image',
    path: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
  },
  audio: {
    cls: 'from-amber-400 to-orange-500 shadow-amber-200',
    title: 'Audio',
    path: (
      <>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </>
    ),
  },
  video: {
    cls: 'from-violet-400 to-purple-500 shadow-violet-200',
    title: 'Video',
    path: (
      <>
        <rect x="2" y="6" width="14" height="12" rx="2" />
        <path d="m22 8-6 4 6 4V8Z" />
      </>
    ),
  },
  file: {
    cls: 'from-blue-400 to-indigo-500 shadow-blue-200',
    title: 'File',
    path: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    ),
  },
}

type ModelModalitiesProps = {
  input: string[]
  output: string[]
}

export function ModelModalities({ input, output }: ModelModalitiesProps) {
  if (!input.length && !output.length) return null

  const renderGroup = (mods: string[]) =>
    mods.map((m) => {
      const def = MODALITY[m]
      if (!def) return null
      return (
        <span
          key={m}
          title={def.title}
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br shadow-sm ${def.cls}`}
        >
          <svg
            className="h-2.5 w-2.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            {def.path}
          </svg>
        </span>
      )
    })

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {renderGroup(input)}
      {input.length > 0 && output.length > 0 && (
        <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
      )}
      {renderGroup(output)}
    </span>
  )
}
