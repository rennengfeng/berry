import { useTranslation } from 'react-i18next'
import { useStatus } from '@/hooks/use-status'

type ContactEntry = {
  type: 'docs' | 'qq_group' | 'qq_service' | 'telegram' | 'wechat' | 'custom'
  title: string
  description: string
  action?: string
  link?: string
}

const DEFAULT_CONTACTS: ContactEntry[] = [
  {
    type: 'docs',
    title: '详细文档',
    description: '查阅文档能解决99%的问题',
    action: '联系我们',
  },
  {
    type: 'qq_group',
    title: 'QQ群',
    description: '寻求帮助? 交流讨论? 欢迎进群!',
  },
  {
    type: 'qq_service',
    title: '小客服QQ',
    description: '在线客服随时为您解答',
  },
  {
    type: 'telegram',
    title: 'TG群',
    description: '欢迎进群交流',
    action: '联系我们',
  },
]

export function PortalContact() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const source = (status?.data ?? status) as Record<string, unknown> | null | undefined

  const docsUrl =
    typeof source?.docs_link === 'string' && (source.docs_link as string).trim()
      ? (source.docs_link as string)
      : ''

  const contacts = DEFAULT_CONTACTS.map((c) => {
    if (c.type === 'docs' && docsUrl) {
      return { ...c, link: docsUrl }
    }
    return c
  })

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <p className="text-sm text-white/60">需要帮助？</p>
        <p className="text-sm text-white/60">
          我们的客服团队随时为您提供专业的帮助与服务。
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="mb-5 text-lg font-semibold text-white">{t('portal.contact')}</h2>
        <div className="space-y-4">
          {contacts.map((c) => (
            <div
              key={c.type}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium text-white">{c.title}</p>
                <p className="text-xs text-white/50">{c.description}</p>
              </div>
              {c.action ? (
                c.link ? (
                  <a
                    href={c.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-lg bg-orange-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-500"
                  >
                    {c.action}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg bg-orange-500/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-500"
                  >
                    {c.action}
                  </button>
                )
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
