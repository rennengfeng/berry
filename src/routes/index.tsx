import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Globe,
  Headphones,
  Lock,
  Shield,
  Zap,
  DollarSign,
  Puzzle,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
      const res = await api.get('/api/home_page_content', {
        skipErrorHandler: true,
      } as Record<string, unknown>)
      return (res.data?.data as string) || ''
    },
    staleTime: 120_000,
  })
}

function LandingPage() {
  const { t, i18n } = useTranslation()
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

  const DEFAULT_FAQ = [
    { question: t('What is Onpleas?'), answer: t('Onpleas is a unified AI model API aggregation platform. One API key to access OpenAI, Claude, Gemini, DeepSeek and 100+ models — no multi-platform setup needed.') },
    { question: t('How do I get started?'), answer: t('Three steps: 1. Register on the site; 2. Top up or get quota; 3. Get your API Key and start calling. Takes under 5 minutes. Compatible with OpenAI standard API format for seamless migration.') },
    { question: t('Which AI models are supported?'), answer: t('50+ mainstream AI models including OpenAI (GPT-4o, GPT-5, o-series), Anthropic Claude, Google, and more. Continuously expanding.') },
    { question: t('How is data security ensured?'), answer: t('We respect your privacy. All data is transmitted via encrypted channels. We strictly comply with applicable laws and regulations. Use with confidence.') },
  ]
  const faqItems = faqFromBackend && faqFromBackend.length > 0 ? faqFromBackend : DEFAULT_FAQ

  const { data: pricingData } = useQuery({
    queryKey: ['landing-pricing'],
    queryFn: async () => {
      const res = await api.get('/api/pricing', {
        skipErrorHandler: true,
      } as Record<string, unknown>)
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

  const switchLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('i18nextLng', next)
  }

  const stats = [
    { value: `${modelCount || 100}+`, label: t('AI Models') },
    { value: '99.9%', label: t('Uptime') },
    { value: '10ms', label: t('Avg Latency') },
    { value: '10K+', label: t('Developers') },
    { value: '100M+', label: t('API Calls') },
    { value: '7×24h', label: t('Support') },
  ]

  const features = [
    {
      icon: Boxes,
      title: t('Rich Models'),
      desc: t('Access mainstream AI models globally, continuously updated to meet various business needs'),
      highlight: `${modelCount || 100}+ ${t('Models')}`,
    },
    {
      icon: Shield,
      title: t('Reliable'),
      desc: t('Multiple protection mechanisms, 99.9% availability, enterprise-grade stability'),
      highlight: '99.9% SLA',
    },
    {
      icon: Lock,
      title: t('Secure & Compliant'),
      desc: t('Encrypted data transmission, no user data stored, strict privacy compliance'),
      highlight: t('Security Certified'),
    },
    {
      icon: DollarSign,
      title: t('Transparent Pricing'),
      desc: t('Pay-as-you-go, no hidden fees, competitive pricing, cost-effective'),
      highlight: t('From $0.01/1K calls'),
    },
    {
      icon: Puzzle,
      title: t('Quick Integration'),
      desc: t('Standard API interface, easy to use, multi-language SDK support'),
      highlight: t('5-min setup'),
    },
    {
      icon: Headphones,
      title: t('Professional Support'),
      desc: t('24/7 technical support, professional team at your service'),
      highlight: '7×24h',
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

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={switchLang}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10"
            >
              <Globe className="h-3.5 w-3.5" />
              {i18n.language === 'zh' ? 'EN' : '中文'}
            </button>

            {user ? (
              <Link
                to={user.role >= ROLE.ADMIN ? '/dashboard' : '/portal'}
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                {t('Console')}
              </Link>
            ) : (
              <Link
                to="/sign-in"
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                {t('Get Started')}
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
              {t('All In One · Connect Top AI Capabilities')}
            </div>
            <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t('Unified')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">AI</span> {t('Model Gateway')}
            </h1>
            <p className="mb-8 max-w-lg text-base leading-relaxed text-white/50">
              {homeContent || t('Aggregate {{count}}+ top AI models and services, providing stable, efficient, and secure API services for developers and enterprises', { count: modelCount || 100 })}
            </p>

            <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-white/60">
              {[t('Reliable'), t('Secure & Compliant'), t('Transparent Pricing'), t('Quick Integration')].map((tag) => (
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
                {t('Start Now')}
                <ChevronRight className="h-4 w-4" />
              </button>
              <a
                href={docsUrl || '/docs/'}
                target={docsUrl ? '_blank' : undefined}
                rel={docsUrl ? 'noreferrer noopener' : undefined}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10"
              >
                {t('API Docs')}
              </a>
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
            {t('Why Choose')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">{systemName}</span>
          </h2>
          <p className="mt-3 text-sm text-white/40">{t('Professional AI model aggregation platform, empowering your business')}</p>
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
            <p className="mb-8 text-center text-sm text-white/30">{t('Trusted Partners')}</p>
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
            <h2 className="mb-8 text-center text-2xl font-bold text-white">{t('FAQ')}</h2>
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
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="text-xs text-white/30">
              © {new Date().getFullYear()} {systemName}. All rights reserved.
            </span>
            <div className="flex items-center gap-4">
              <Link to="/about" className="text-xs text-white/30 hover:text-white/60 transition">{t('About')}</Link>
              <Link to="/privacy-policy" className="text-xs text-white/30 hover:text-white/60 transition">{t('Privacy Policy')}</Link>
              <Link to="/user-agreement" className="text-xs text-white/30 hover:text-white/60 transition">{t('Terms of Service')}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
