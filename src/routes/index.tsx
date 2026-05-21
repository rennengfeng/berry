import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Headphones,
  Lock,
  Moon,
  Shield,
  Zap,
  DollarSign,
  Puzzle,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { api } from '@/lib/api'
import { getLobeIcon } from '@/lib/lobe-icon'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function useHomePageContent() {
  return useQuery({
    queryKey: ['home-page-content'],
    queryFn: async () => {
      const res = await api.get('/api/home_page_content')
      return (res.data?.data as string) || ''
    },
    staleTime: 120_000,
  })
}

const DEFAULT_FAQ = [
  {
    question: '我该如何使用？',
    answer: '你只需替换你使用应用程序/项目中的API地址和KEY即可。如果你有任何问题，请随时联系我们。',
  },
  {
    question: '我的信息会被泄漏吗？',
    answer: '我们严格保护信息和交互数据，仅转发数据不保存数据，数据传输全程加密，保障服务安全性。',
  },
  {
    question: '连接API失败或者中断怎么办？',
    answer: '请检查网络连接和API Key是否正确。如持续出现问题，请联系客服，我们会第一时间协助排查。',
  },
  {
    question: '你们是怎么计算费用的？',
    answer: '按照模型官方定价的倍率计费，按量付费无隐形费用。具体价格请查看价格页面。',
  },
]

const NAV_LINKS: Array<{ label: string; to: string; external?: boolean; useDocsUrl?: boolean }> = []

function LandingPage() {
  const navigate = useNavigate()
  const { status } = useStatus()
  const user = useAuthStore((s) => s.auth.user)
  const { data: homeContent } = useHomePageContent()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const source = (status?.data ?? status) as Record<string, unknown> | null | undefined
  const systemName =
    typeof source?.system_name === 'string' && source.system_name.trim()
      ? (source.system_name as string)
      : 'New API'
  const docsUrl =
    typeof source?.docs_link === 'string' && (source.docs_link as string).trim()
      ? (source.docs_link as string)
      : ''
  const faqEnabled = source?.faq_enabled !== false
  const faqFromBackend = Array.isArray(source?.faq) ? (source.faq as Array<{ question: string; answer: string }>) : null
  const faqItems = faqFromBackend && faqFromBackend.length > 0 ? faqFromBackend : DEFAULT_FAQ

  const { data: pricingData } = useQuery({
    queryKey: ['landing-pricing'],
    queryFn: async () => {
      const res = await api.get('/api/pricing')
      return res.data?.data as { vendors?: Array<{ id: number; name: string; icon?: string }>; models?: Array<{ model_name: string; vendor_name?: string }> } | undefined
    },
    staleTime: 120_000,
  })

  const vendors = pricingData?.vendors ?? []
  const modelCount = pricingData?.models?.length ?? 0

  const handleCTA = () => {
    if (!user) {
      navigate({ to: '/sign-in' })
    } else if (user.role >= ROLE.ADMIN) {
      navigate({ to: '/dashboard' })
    } else {
      navigate({ to: '/portal' })
    }
  }

  const stats = [
    { value: `${modelCount || 100}+`, label: 'AI模型' },
    { value: '99.9%', label: '服务可用性' },
    { value: '10ms', label: '平均响应时间' },
    { value: '10K+', label: '开发者' },
    { value: '1亿+', label: 'API调用次数' },
    { value: '7×24h', label: '技术支持' },
  ]

  const features = [
    {
      icon: Boxes,
      title: '模型丰富',
      desc: '接入全球主流AI模型，持续更新，满足各种业务需求',
      highlight: `${modelCount || 100}+ 模型`,
    },
    {
      icon: Shield,
      title: '稳定可靠',
      desc: '多重保障机制，99.9%服务可用性，企业级稳定性',
      highlight: '99.9% SLA',
    },
    {
      icon: Lock,
      title: '安全合规',
      desc: '数据加密传输，不存储用户数据，严格遵守隐私政策',
      highlight: '安全认证',
    },
    {
      icon: DollarSign,
      title: '价格透明',
      desc: '按量付费，无隐藏费用，价格优惠，成本可控',
      highlight: '最低0.1元/千次',
    },
    {
      icon: Puzzle,
      title: '快速集成',
      desc: '标准API接口，简单易用，多语言SDK支持',
      highlight: '5分钟集成',
    },
    {
      icon: Headphones,
      title: '专业支持',
      desc: '7×24小时技术支持，专业团队为您保驾护航',
      highlight: '7×24h 服务',
    },
  ]

  return (
    <div className="relative flex min-h-svh flex-col bg-[#0a0a14] text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a14]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="text-xl font-bold tracking-wide text-orange-400">
            {systemName}
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const href = link.useDocsUrl ? (docsUrl || '/docs/') : link.to
              if (link.external) {
                return (
                  <a
                    key={link.label}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-md px-3.5 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
                  >
                    {link.label}
                  </a>
                )
              }
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  className="rounded-md px-3.5 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                type="button"
                onClick={handleCTA}
                className="rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white shadow transition hover:from-purple-500 hover:to-indigo-500"
              >
                控制台
              </button>
            ) : (
              <Link
                to="/sign-in"
                className="rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white shadow transition hover:from-purple-500 hover:to-indigo-500"
              >
                开始使用
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(139,92,246,0.12),transparent_50%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.08),transparent_50%)]" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-300">
              <Zap className="h-3.5 w-3.5" />
              All In One · 连接全球顶级AI能力
            </div>
            <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              一站式 <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">AI</span> 模型聚合平台
            </h1>
            <p className="mb-8 max-w-lg text-base leading-relaxed text-white/50">
              {homeContent || `聚合 ${modelCount || 100}+ 顶级 AI 模型和服务，为开发者和企业提供稳定、高效、安全的 API 服务`}
            </p>

            <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-white/60">
              {['稳定可靠', '安全合规', '价格透明', '快速集成'].map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleCTA}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition hover:shadow-purple-500/30"
              >
                立即开始体验
                <ChevronRight className="h-4 w-4" />
              </button>
              {docsUrl ? (
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10"
                >
                  查看API文档
                </a>
              ) : (
                <a
                  href="/docs/"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10"
                >
                  查看API文档
                </a>
              )}
            </div>
          </div>

          {/* Hero decorative - orbital icons */}
          <div className="hidden lg:flex lg:justify-center">
            <div className="relative h-[360px] w-[360px]">
              <div className="absolute inset-[50px] rounded-full border border-dashed border-white/10" />
              <div className="absolute inset-[100px] rounded-full border border-dashed border-white/10" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/30 to-blue-500/30 shadow-lg">
                {getLobeIcon('OpenAI.Color', 36)}
              </div>
              {[
                { name: 'Claude.Color', angle: 0 },
                { name: 'Gemini.Color', angle: 45 },
                { name: 'DeepSeek.Color', angle: 90 },
                { name: 'Moonshot.Color', angle: 135 },
                { name: 'Zhipu.Color', angle: 180 },
                { name: 'Qwen.Color', angle: 225 },
                { name: 'Kling.Color', angle: 270 },
                { name: 'Midjourney.Color', angle: 315 },
              ].map((item) => {
                const r = 100
                const rad = (item.angle - 90) * (Math.PI / 180)
                const x = 180 + r * Math.cos(rad) - 22
                const y = 180 + r * Math.sin(rad) - 22
                return (
                  <div
                    key={item.name}
                    className="absolute flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 shadow-md backdrop-blur-sm border border-white/10"
                    style={{ left: x, top: y }}
                  >
                    {getLobeIcon(item.name, 24)}
                  </div>
                )
              })}
              {[
                { name: 'Mistral.Color', angle: 20 },
                { name: 'Meta.Color', angle: 70 },
                { name: 'Cohere.Color', angle: 120 },
                { name: 'Stability.Color', angle: 170 },
                { name: 'Perplexity.Color', angle: 220 },
                { name: 'Suno.Color', angle: 270 },
                { name: 'Baichuan.Color', angle: 320 },
              ].map((item) => {
                const r = 155
                const rad = (item.angle - 90) * (Math.PI / 180)
                const x = 180 + r * Math.cos(rad) - 18
                const y = 180 + r * Math.sin(rad) - 18
                return (
                  <div
                    key={item.name}
                    className="absolute flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 shadow border border-white/10"
                    style={{ left: x, top: y }}
                  >
                    {getLobeIcon(item.name, 20)}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 px-4 py-8">
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                {stat.value}
              </span>
              <span className="text-xs text-white/40">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="mx-auto w-full max-w-7xl px-6 py-20">
        <div className="mb-4 text-center">
          <h2 className="text-3xl font-bold text-white">
            为什么选择 <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">{systemName}</span>
          </h2>
          <p className="mt-3 text-sm text-white/40">专业的AI模型聚合平台，为您的业务赋能</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="group flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-7 transition hover:border-purple-500/30 hover:bg-white/[0.04]"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 transition group-hover:from-purple-500/30 group-hover:to-blue-500/30">
                  <Icon className="h-6 w-6 text-purple-300" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">{f.title}</h3>
                <p className="mb-4 flex-1 text-sm leading-relaxed text-white/45">{f.desc}</p>
                <span className="text-xs font-medium text-purple-400">{f.highlight}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Partners / Vendors */}
      {vendors.length > 0 && (
        <section className="border-t border-white/5 py-16">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-8 text-center text-sm text-white/30">值得信赖的合作伙伴</p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {vendors.slice(0, 8).map((v) => (
                <span
                  key={v.id}
                  className="text-sm font-medium text-white/40 transition hover:text-white/70"
                >
                  {v.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faqEnabled && (
        <section className="border-t border-white/5 py-16">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="mb-8 text-center text-2xl font-bold text-white">常见问题</h2>
            <div className="flex flex-col gap-3">
              {faqItems.map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/8 bg-white/[0.02] transition hover:border-white/15"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left"
                  >
                    <span className="text-sm font-medium text-white/85">{item.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {openFaq === i && (
                    <div className="border-t border-white/5 px-6 pb-5 pt-3">
                      <p className="text-sm leading-relaxed text-white/50">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-7xl px-6 text-center text-xs text-white/30">
          © {new Date().getFullYear()} {systemName}. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
