/**
 * 多语言内容解析：管理员在后台内容字段里可填 JSON
 *   {"zh":"中文","en":"English","ru":"Русский"}
 * 前端按当前界面语言显示对应文案；纯文本/HTML/URL 原样返回（向后兼容）。
 */
export type ContentLang = 'zh' | 'en' | 'ru'

export function normalizeContentLang(l?: string): ContentLang {
  if (!l) return 'en'
  if (l.startsWith('ru')) return 'ru'
  if (l.startsWith('zh')) return 'zh'
  return 'en'
}

export function pickLang(text: string | undefined | null, lang: string): string {
  if (!text) return ''
  const s = String(text).trim()
  // 仅当整体是一个 JSON 对象时才尝试解析为多语言映射
  if (s.startsWith('{') && s.endsWith('}')) {
    try {
      const obj = JSON.parse(s)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const norm = normalizeContentLang(lang)
        const v =
          obj[norm] ??
          obj[lang] ??
          obj.en ??
          obj.zh ??
          Object.values(obj)[0]
        if (typeof v === 'string') return v
      }
    } catch {
      /* 不是合法 JSON，按纯文本处理 */
    }
  }
  return text
}
