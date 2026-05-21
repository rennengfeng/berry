import { useState } from 'react'
import { BookOpen, Code, Key, Zap, MessageSquare, ChevronRight } from 'lucide-react'
import { useStatus } from '@/hooks/use-status'

type DocSection = {
  id: string
  title: string
  icon: typeof BookOpen
  content: string[]
}

function useBrandName() {
  const { status } = useStatus()
  const source = (status?.data ?? status) as Record<string, unknown> | null | undefined
  return typeof source?.system_name === 'string' && source.system_name.trim()
    ? source.system_name.trim()
    : 'New API'
}

export function PortalDocs() {
  const brandName = useBrandName()
  const [activeSection, setActiveSection] = useState('quickstart')

  const sections: DocSection[] = [
    {
      id: 'quickstart',
      title: '快速开始',
      icon: Zap,
      content: [
        `欢迎使用 ${brandName}！本平台提供与 OpenAI 兼容的 API 接口，支持多种主流大语言模型。`,
        '1. 在「令牌管理」页面创建一个 API Key',
        '2. 将 API Base URL 设置为本站地址（如 https://your-domain.com）',
        '3. 使用创建的 Key 作为 Authorization Bearer Token 发起请求',
        '4. 在「模型广场」查看所有可用模型及其价格',
      ],
    },
    {
      id: 'api-usage',
      title: 'API 调用',
      icon: Code,
      content: [
        '本站 API 完全兼容 OpenAI 格式，支持以下端点：',
        '• POST /v1/chat/completions — 对话补全',
        '• POST /v1/completions — 文本补全',
        '• POST /v1/embeddings — 文本向量化',
        '• POST /v1/images/generations — 图片生成',
        '• POST /v1/audio/transcriptions — 语音转文字',
        '• GET /v1/models — 获取可用模型列表',
        '',
        '请求示例（curl）：',
        'curl -X POST https://your-domain.com/v1/chat/completions \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "Authorization: Bearer sk-your-key" \\',
        '  -d \'{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}\'',
      ],
    },
    {
      id: 'auth',
      title: '认证与密钥',
      icon: Key,
      content: [
        '所有 API 请求需要在 Header 中携带有效的 API Key：',
        'Authorization: Bearer sk-xxxxxxxx',
        '',
        '密钥管理：',
        '• 在「令牌管理」页面可以创建、启用、停用密钥',
        '• 每个密钥可以设置独立的额度限制和过期时间',
        '• 密钥创建后仅显示一次完整内容，请妥善保存',
        '• 建议为不同用途创建不同的密钥，便于管理和追踪',
      ],
    },
    {
      id: 'models',
      title: '模型与计费',
      icon: MessageSquare,
      content: [
        '计费方式：',
        '• 按量计费：根据输入/输出 Token 数量计费',
        '• 按次计费：每次请求固定费用',
        '',
        '价格查看：',
        '• 在「模型广场」可查看所有模型的本站价格和官方价格',
        '• 价格单位为 $/1M Tokens（每百万 Token 的美元价格）',
        '• 不同分组可能有不同的倍率，实际价格 = 模型价格 × 分组倍率',
        '',
        '余额管理：',
        '• 在「获取订阅」页面可以充值余额',
        '• 在「数据看板」可以查看消耗统计',
        '• 在「使用日志」可以查看每次请求的详细记录',
      ],
    },
    {
      id: 'sdk',
      title: 'SDK 接入',
      icon: BookOpen,
      content: [
        'Python (openai 库)：',
        'from openai import OpenAI',
        'client = OpenAI(api_key="sk-xxx", base_url="https://your-domain.com/v1")',
        'response = client.chat.completions.create(',
        '    model="gpt-4o",',
        '    messages=[{"role": "user", "content": "Hello"}]',
        ')',
        '',
        'Node.js (openai 库)：',
        'import OpenAI from "openai";',
        'const client = new OpenAI({ apiKey: "sk-xxx", baseURL: "https://your-domain.com/v1" });',
        'const response = await client.chat.completions.create({',
        '  model: "gpt-4o",',
        '  messages: [{ role: "user", content: "Hello" }],',
        '});',
      ],
    },
  ]

  const active = sections.find((s) => s.id === activeSection) ?? sections[0]

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-xl font-bold text-white">{brandName} 使用文档</h2>
        <p className="mt-1 text-sm text-white/50">
          API 接入指南、认证说明、模型计费与 SDK 示例
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon
            const isActive = section.id === activeSection
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  isActive
                    ? 'bg-orange-500/15 text-orange-300'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{section.title}</span>
                {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
              </button>
            )
          })}
        </nav>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 className="mb-4 text-lg font-semibold text-white">{active.title}</h3>
          <div className="space-y-2">
            {active.content.map((line, i) => {
              if (line === '') return <div key={i} className="h-3" />
              const isCode =
                line.startsWith('curl ') ||
                line.startsWith('  -') ||
                line.startsWith('from ') ||
                line.startsWith('import ') ||
                line.startsWith('const ') ||
                line.startsWith('client') ||
                line.startsWith('response') ||
                line.startsWith('}') ||
                line.startsWith(')') ||
                line.startsWith('    ')
              if (isCode) {
                return (
                  <p key={i} className="font-mono text-sm text-orange-300/80">
                    {line}
                  </p>
                )
              }
              return (
                <p key={i} className="text-sm leading-relaxed text-white/70">
                  {line}
                </p>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
