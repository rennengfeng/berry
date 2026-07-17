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

/**
 * 模型「控制标签」约定与解析。
 *
 * 复用模型元信息的 tags 字段做前端控制位，无需任何后端改动：
 *  - 角标：以 ! 开头的标签 → 卡片右上角彩色角标。可叠加多个。
 *      · 命中预设（!new / !火 / !极速 / !推荐，或 emoji）→ 自动带 emoji、配色与多语言
 *      · 其它任意文案（!⚡闪促、!-10%、!🎁）→ 原样渲染为促销样式角标
 *        ⚠ 自定义角标不做翻译，请用语言中立内容（数字 / 百分号 / emoji，如 !-10%、!🔥），
 *          避免写 !限时9折 这类纯中文——俄/英用户看不懂。
 *  - 精选：!精选_N（兼容 !精选N / 精选_N / featured_N）→ 进入首页精选区，N 为排序（小的在前，无序号默认 9999）
 *
 * 这些控制标签都会从可见标签（卡片标签列表、筛选按钮）中剔除。
 *
 * 示例 tags：`对话,Tools,!精选1,!new,!🔥,!-10%`
 * 想新增一种预设角标：往下面的 BADGE_DEFS 里加一行即可（无需改组件）。
 */

export type ModelBadgeVariant =
  | 'red'
  | 'orange'
  | 'amber'
  | 'blue'
  | 'green'
  | 'violet'
  | 'rose'

export type ModelBadge = {
  key: string
  icon?: string
  label: string
  i18nKey?: string
  variant: ModelBadgeVariant
}

type BadgeDef = {
  match: string[]
  variant: ModelBadgeVariant
  icon?: string
  label?: string
  i18nKey?: string
}

const BADGE_DEFS: BadgeDef[] = [
  { match: ['new', '新', '🆕'], variant: 'red', i18nKey: 'NEW' },
  { match: ['hot', '热', '火', '🔥'], variant: 'orange', icon: '🔥' },
  { match: ['turbo', 'fast', '极速', '⚡', '⚡️'], variant: 'amber', icon: '⚡' },
  { match: ['recommend', 'pick', '推荐'], variant: 'violet', icon: '⭐' },
]

const BADGE_INDEX = new Map<string, BadgeDef>()
for (const def of BADGE_DEFS) {
  for (const m of def.match) BADGE_INDEX.set(m.toLowerCase(), def)
}

const FEATURED_RE = /^(?:精选|featured)[\s_:：-]*(\d+)?$/i
const DEFAULT_FEATURED_ORDER = 9999

export const BADGE_VARIANT_CLASS: Record<ModelBadgeVariant, string> = {
  red: 'bg-red-500 text-white',
  orange: 'bg-orange-500 text-white',
  amber: 'bg-amber-400 text-white',
  blue: 'bg-blue-500 text-white',
  green: 'bg-emerald-500 text-white',
  violet: 'bg-violet-500 text-white',
  rose: 'bg-gradient-to-r from-rose-500 to-orange-500 text-white',
}

export type ParsedModelTags = {
  badges: ModelBadge[]
  isFeatured: boolean
  featuredOrder: number
  visibleTags: string[]
  inputModalities: string[]
  outputModalities: string[]
  squareOrder: number
}

export function parseModelTags(tags?: string): ParsedModelTags {
  const result: ParsedModelTags = {
    badges: [],
    isFeatured: false,
    featuredOrder: DEFAULT_FEATURED_ORDER,
    visibleTags: [],
    inputModalities: [],
    outputModalities: [],
    squareOrder: 9999,
  }
  if (!tags) return result

  const seen = new Set<string>()
  const pushBadge = (b: ModelBadge) => {
    if (seen.has(b.key)) return
    seen.add(b.key)
    result.badges.push(b)
  }

  for (const raw of tags.split(',')) {
    const tag = raw.trim()
    if (!tag) continue

    const hasBang = tag.startsWith('!') || tag.startsWith('！')
    const body = hasBang ? tag.slice(1).trim() : tag
    if (!body) continue

    const featured = FEATURED_RE.exec(body)
    if (featured) {
      result.isFeatured = true
      if (featured[1] != null) {
        const order = Number.parseInt(featured[1], 10)
        if (Number.isFinite(order)) result.featuredOrder = order
      }
      continue
    }

    if (hasBang) {
      const def = BADGE_INDEX.get(body.toLowerCase())
      if (def) {
        pushBadge({
          key: def.variant,
          icon: def.icon,
          label: def.label ?? '',
          i18nKey: def.i18nKey,
          variant: def.variant,
        })
      } else {
        pushBadge({ key: `custom:${body}`, label: body, variant: 'rose' })
      }
      continue
    }

    const mod = body.match(/^(in|out)[:：](text|image|audio|video|files?)$/i)
    if (mod) {
      const kind = mod[2].toLowerCase() === 'files' ? 'file' : mod[2].toLowerCase()
      const arr = mod[1].toLowerCase() === 'in' ? result.inputModalities : result.outputModalities
      if (!arr.includes(kind)) arr.push(kind)
      continue
    }

    const sq = body.match(/^#(\d+)$/)
    if (sq) {
      const n = Number.parseInt(sq[1], 10)
      if (Number.isFinite(n)) result.squareOrder = n
      continue
    }

    result.visibleTags.push(body)
  }

  return result
}
