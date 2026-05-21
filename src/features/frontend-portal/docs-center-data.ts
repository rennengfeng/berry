import type {
  FrontendPortalDocArticle,
  FrontendPortalDocCategory,
  FrontendPortalDocExternalLink,
  FrontendPortalDocsRegistry,
} from './types'

export const portalDocCategories: FrontendPortalDocCategory[] = [
  {
    id: 'quick-start',
    title: '快速开始',
    description: '面向新用户的开通、充值、Key 与模型使用说明。',
  },
  {
    id: 'cli-config',
    title: 'CLI 配置',
    description: 'Codex、Claude Code、Gemini 等命令行客户端接入方式。',
  },
  {
    id: 'extensions',
    title: '第三方接入',
    description: 'Curl、OpenCode、Cherry Studio、Zed 等外部工具对接。',
  },
  {
    id: 'faq',
    title: '常见问题',
    description: '排障建议、权限说明和高频问答。',
  },
]

const portalDocArticlesBase: FrontendPortalDocArticle[] = [
  {
    slug: 'intro',
    title: '平台简介',
    description: '用一页说明站点定位、前后台关系和用户最常用的入口。',
    category: 'quick-start',
    keywords: ['介绍', '首页', '平台', '入口', '新手'],
    markdown: `
# 平台简介

这个站点保留了 **NewAPI 的后端核心**，包括计费、转发、渠道、用户、余额和权限控制；你现在看到的前台页面，则是为了把这些能力整理成更适合用户使用的体验层。

## 你最常用的四个入口

1. **模型广场**：查看模型、价格、支持能力和监控状态。
2. **在线对话**：直接拿自己的 Key 在站内测试模型响应。
3. **订阅 / 充值中心**：购买套餐、充值余额、兑换码、查看账单。
4. **API Keys**：创建和管理调用密钥。

## 使用流程建议

1. 先在 **订阅 / 充值中心** 确认你有可用套餐或余额。
2. 到 **API Keys** 创建一个自己的 Key。
3. 在 **模型广场** 确认你要调用的模型名称和支持能力。
4. 需要先试一下时，直接去 **在线对话** 验证调用是否正常。

## 和原版后台的关系

- 前台页面更偏用户操作和信息展示。
- 原后台仍然负责渠道管理、倍率、模型映射、日志与系统设置。
- 这意味着你可以放心做前台二开，而不必碰高风险的账务核心逻辑。
`,
  },
  {
    slug: 'recharge-and-plan',
    title: '充值与套餐说明',
    description: '解释套餐、余额、兑换码和账单之间的关系。',
    category: 'quick-start',
    keywords: ['充值', '套餐', '订阅', '余额', '账单', '兑换码'],
    markdown: `
# 充值与套餐说明

文档中心参考了你提供的 \`rcdoc-main\` 结构，这一部分对应原始文档里的快速开始和充值说明。

## 套餐和余额有什么区别

- **套餐**：通常表示一段周期内可用的额度或特定模型权益。
- **余额**：更偏按量扣费，适合弹性使用。
- **扣费优先级**：由系统里的计费偏好决定，前台套餐页会直接展示当前策略。

## 什么时候该买套餐

- 你有稳定、持续的模型调用需求。
- 你需要某些套餐专属模型或分组。
- 你希望先锁定一段时间的成本。

## 什么时候该充值余额

- 你只是偶尔使用。
- 你需要补充超出套餐后的按量消耗。
- 你想先小额体验，再决定是否买套餐。

## 订单与账单

前台“订阅 / 充值中心”已经复用了原钱包能力，所以你可以直接：

- 选择支付方式发起充值
- 购买订阅套餐
- 使用兑换码
- 打开账单记录查看历史订单

> 建议：如果用户主要通过套餐使用模型，仍然保留一部分余额作为兜底，会更稳妥。
`,
  },
  {
    slug: 'apikey-guide',
    title: 'API Key 管理',
    description: '说明如何创建 Key、如何控制权限，以及常见报错怎么排查。',
    category: 'quick-start',
    keywords: ['apikey', 'key', '权限', '模型限制', '429'],
    markdown: `
# API Key 管理

这一节对应你参考文档里的 **ApiKey 管理**。

## 如何创建 Key

1. 进入 **API Keys** 页面。
2. 点击创建按钮，填写名称。
3. 根据用途决定是否限制模型、是否允许继续使用余额。

## 两个最关键的权限项

- **可用模型限制**：只允许这个 Key 调用一部分模型。
- **允许使用余额**：套餐额度用完后，是否允许继续走余额扣费。

## 常见问题排查顺序

1. 先确认当前 Key 是否启用了模型限制。
2. 再确认你调用的模型是否在允许列表里。
3. 如果套餐已耗尽，确认是否允许继续使用余额。
4. 如果提示 \`429\`，检查余额、限流和权限配置，不要第一反应就怀疑模型坏了。

## 建议

- 给不同用途创建不同 Key，例如开发、自动化脚本、团队共享各自分开。
- 不要把所有模型都暴露给所有 Key，便于控成本。
- 如果是第三方客户端接入，先在在线对话里试通，再复制到客户端配置。
`,
  },
  {
    slug: 'models-and-routing',
    title: '模型与渠道使用说明',
    description: '说明模型名、供应商、渠道分组和本站价 / 官方价的关系。',
    category: 'quick-start',
    keywords: ['模型', '渠道', 'group', 'vendor', '价格', '倍率'],
    markdown: `
# 模型与渠道使用说明

模型广场是这个前台改造里最核心的页面之一。

## 你在模型广场里会看到什么

- **模型名称**
- **供应商 / 分组**
- **输入价、输出价、缓存价、按次价**
- **Kuma 监控状态**
- **支持的接口类型**

## 官方价和本站价

- **官方价**：用于参考模型的原始计费基准。
- **本站价**：会叠加当前分组倍率，更接近用户实际看到的成本。

## 为什么同一个模型会有不同的可用性

因为底层仍然是 NewAPI 的渠道和分组逻辑：

- 不同分组可能绑定不同渠道
- 不同渠道可能有不同稳定性和倍率
- 同一个模型也可能在不同供应商下有不同表现

## 用户应该怎么用

1. 先筛到自己能用的供应商或分组。
2. 看监控健康度，优先选更稳定的项。
3. 比较官方价与本站价，理解实际成本。
4. 确认模型支持的接口再开始接入。
`,
  },
  {
    slug: 'curl-examples',
    title: 'Curl 调用示例',
    description: '给出通用的聊天接口示例，帮助用户快速测试接口连通性。',
    category: 'extensions',
    keywords: ['curl', 'chat completions', 'responses', '接口测试'],
    markdown: `
# Curl 调用示例

这一节参考了 \`rcdoc-main\` 里的 **Curl 调用示例**，先保留最常用的 OpenAI 兼容调用方式。

## Chat Completions

\`\`\`bash
curl https://your-domain.example/v1/chat/completions \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "你好，请用三句话介绍这个站点的调用流程。"
      }
    ],
    "stream": true
  }'
\`\`\`

## Responses

\`\`\`bash
curl https://your-domain.example/v1/responses \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "model": "gpt-4.1-mini",
    "input": "请帮我总结一下模型广场和在线对话的作用"
  }'
\`\`\`

## 测试建议

1. 先用在线对话验证 Key 和模型可用。
2. 再用 Curl 做一次最小请求。
3. 最后把同样配置迁移到你的客户端、脚本或插件。
`,
  },
  {
    slug: 'codex-cli',
    title: 'Codex CLI 配置思路',
    description: '给命令行用户一个清晰的接入思路，后续可继续扩成完整专题。',
    category: 'cli-config',
    keywords: ['codex', 'cli', '命令行', '配置'],
    markdown: `
# Codex CLI 配置思路

这部分参考了你提供文档中的 **Codex 配置** 分组，当前先做成 Portal 文档中心里的入门版。

## 配置前先确认三件事

1. 你已经创建了自己的 API Key。
2. 你知道要调用的模型名称。
3. 你已经确认当前 Key 对该模型有权限。

## 推荐接入步骤

1. 先在站内在线对话测试目标模型。
2. 再在本地 CLI 工具里填入 Base URL 和 API Key。
3. 如果 CLI 支持模型选择，再填入模型名。

## 常见坑

- Key 有效，但模型权限没开。
- 模型名写成了供应商展示名，而不是实际调用名。
- 套餐耗尽且 Key 又不允许继续走余额。

## 建议

先做最小配置跑通，再逐步补系统提示词、模型切换和高级参数，不要一开始就把配置堆满。
`,
  },
  {
    slug: 'third-party-apps',
    title: '第三方客户端接入建议',
    description: '说明如何从在线测试迁移到第三方应用，减少接入出错率。',
    category: 'extensions',
    keywords: ['客户端', '第三方', 'Cherry Studio', 'Zed', 'OpenCode'],
    markdown: `
# 第三方客户端接入建议

你给的参考仓库里已经把 Cherry Studio、OpenCode、Zed、WSL 等分开写了。Portal 文档中心首版先统一总结接入原则，后面可以继续拆成独立专题。

## 通用迁移路径

1. 在 **在线对话** 先验证 Key 是否可用。
2. 在 **模型广场** 确认目标模型名称和能力。
3. 在第三方客户端中填写：
   - Base URL
   - API Key
   - 模型名称

## 接入失败时先检查

- 客户端是否要求 OpenAI 兼容格式。
- 客户端是否默认补了不兼容的参数。
- 你填的是不是正确的接口根路径。
- 当前模型是否支持这个客户端使用的 endpoint。

## 最佳实践

- 把“模型测试”放在站内完成，把“正式使用”放到客户端里。
- 给不同客户端分配不同 Key，方便定位问题和控制额度。
`,
  },
  {
    slug: 'faq-codex',
    title: '常见问题与排障',
    description: '面向日常支持场景的首版 FAQ。',
    category: 'faq',
    keywords: ['faq', '排障', '问题', '权限', '报错'],
    markdown: `
# 常见问题与排障

## 为什么模型广场里能看到模型，但调用时报没有权限

因为“看得到”不代表“当前 Key 有权限”。优先检查：

- Key 是否限制了模型
- 当前用户组是否可用
- 套餐是否仍在有效期内

## 为什么套餐还在，但还是扣了余额

先看前台套餐页展示的 **Billing preference**。如果系统设置成了余额优先，或者套餐已不覆盖当前模型，就可能先走余额。

## 为什么同一个模型有时快有时慢

底层依然是渠道分发模型：

- 不同渠道响应时间不同
- 不同分组可能映射到不同上游
- 某些上游在高峰期会波动

## 我应该先看哪里排查问题

1. 看模型广场的监控状态。
2. 看 Key 权限和是否允许余额兜底。
3. 用在线对话做一次最小测试。
4. 再回到你的第三方客户端继续排查。
`,
  },
]

const portalDocArticleEnhancements: Record<
  string,
  {
    cover?: string
    updated_at?: string
    status?: 'published' | 'draft'
    is_pinned?: boolean
    sort_order?: number
    featured_rank?: number
    external_links?: FrontendPortalDocExternalLink[]
  }
> = {
  intro: {
    cover:
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80',
    updated_at: '2026-05-15',
    status: 'published',
    is_pinned: true,
    sort_order: 10,
    featured_rank: 98,
    external_links: [
      {
        title: 'OpenAI API Quickstart',
        href: 'https://platform.openai.com/docs/quickstart',
        description: 'Use this when users need a baseline OpenAI-compatible request example.',
      },
    ],
  },
  'recharge-and-plan': {
    cover:
      'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80',
    updated_at: '2026-05-14',
    status: 'published',
    sort_order: 20,
    featured_rank: 95,
    external_links: [
      {
        title: 'Billing Best Practices',
        href: 'https://platform.openai.com/docs/guides/rate-limits',
        description: 'Reference material for explaining quotas, limits, and usage expectations.',
      },
    ],
  },
  'apikey-guide': {
    cover:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    updated_at: '2026-05-13',
    status: 'published',
    is_pinned: true,
    sort_order: 30,
    featured_rank: 96,
    external_links: [
      {
        title: 'OpenAI Authentication',
        href: 'https://platform.openai.com/docs/api-reference/authentication',
        description: 'Helpful for users comparing standard Bearer token flows.',
      },
    ],
  },
  'curl-examples': {
    updated_at: '2026-05-12',
    status: 'published',
    sort_order: 40,
    featured_rank: 90,
    external_links: [
      {
        title: 'API Reference',
        href: 'https://platform.openai.com/docs/api-reference',
        description: 'Useful for expanding from the portal example into a complete request payload.',
      },
    ],
  },
  'codex-cli': {
    updated_at: '2026-05-11',
    status: 'draft',
    sort_order: 50,
    featured_rank: 88,
    external_links: [
      {
        title: 'Codex CLI Reference',
        href: 'https://platform.openai.com/docs/guides/tools',
        description: 'Example upstream documentation link for CLI-oriented onboarding.',
      },
    ],
  },
}

export const portalDocArticles: FrontendPortalDocArticle[] =
  portalDocArticlesBase.map((article) => {
    const enhancement = portalDocArticleEnhancements[article.slug]
    return {
      ...article,
      ...(enhancement ?? {}),
      external_links: enhancement?.external_links ?? article.external_links ?? [],
    }
  })

export const portalDocsArticleMap = new Map(
  portalDocArticles.map((article) => [article.slug, article])
)

export const defaultDocsRegistry: FrontendPortalDocsRegistry = {
  categories: portalDocCategories,
  articles: portalDocArticles,
}

function collectDocsRegistry(
  value: unknown
): FrontendPortalDocsRegistry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawCategories = Array.isArray(
    (value as { categories?: unknown[] }).categories
  )
    ? (value as { categories: unknown[] }).categories
    : []
  const rawArticles = Array.isArray((value as { articles?: unknown[] }).articles)
    ? (value as { articles: unknown[] }).articles
    : []

  const categories = rawCategories
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const candidate = item as Record<string, unknown>
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
      const title =
        typeof candidate.title === 'string' ? candidate.title.trim() : ''
      const description =
        typeof candidate.description === 'string'
          ? candidate.description.trim()
          : ''

      if (!id || !title) {
        return null
      }

      return {
        id,
        title,
        description,
      } satisfies FrontendPortalDocCategory
    })
    .filter((item): item is FrontendPortalDocCategory => item !== null)

  const categoryIds = new Set(categories.map((item) => item.id))
  const articles: FrontendPortalDocArticle[] = rawArticles.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const candidate = item as Record<string, unknown>
    const slug = typeof candidate.slug === 'string' ? candidate.slug.trim() : ''
    const title =
      typeof candidate.title === 'string' ? candidate.title.trim() : ''
    const description =
      typeof candidate.description === 'string'
        ? candidate.description.trim()
        : ''
    const category =
      typeof candidate.category === 'string' ? candidate.category.trim() : ''
    const markdown =
      typeof candidate.markdown === 'string' ? candidate.markdown : ''
    const keywords = Array.isArray(candidate.keywords)
      ? candidate.keywords
          .map((keyword) =>
            typeof keyword === 'string' ? keyword.trim() : ''
          )
          .filter((keyword) => keyword.length > 0)
      : []
    const cover =
      typeof candidate.cover === 'string' ? candidate.cover.trim() : ''
    const updatedAt =
      typeof candidate.updated_at === 'string'
        ? candidate.updated_at.trim()
        : ''
    const status =
      candidate.status === 'draft' ? 'draft' : 'published'
    const isPinned =
      typeof candidate.is_pinned === 'boolean'
        ? candidate.is_pinned
        : candidate.is_pinned === 'true'
          ? true
          : false
    const sortOrder =
      typeof candidate.sort_order === 'number'
        ? candidate.sort_order
        : typeof candidate.sort_order === 'string'
          ? Number(candidate.sort_order)
          : NaN
    const featuredRank =
      typeof candidate.featured_rank === 'number'
        ? candidate.featured_rank
        : typeof candidate.featured_rank === 'string'
          ? Number(candidate.featured_rank)
          : NaN
    const externalLinks: FrontendPortalDocExternalLink[] = Array.isArray(
      candidate.external_links
    )
      ? candidate.external_links.flatMap((link) => {
          if (!link || typeof link !== 'object') {
            return []
          }
          const record = link as Record<string, unknown>
          const title =
            typeof record.title === 'string' ? record.title.trim() : ''
          const href =
            typeof record.href === 'string' ? record.href.trim() : ''
          const description =
            typeof record.description === 'string'
              ? record.description.trim()
              : ''

          if (!title || !href) {
            return []
          }

          return [
            {
              title,
              href,
              ...(description ? { description } : {}),
            },
          ]
        })
      : []

    if (!slug || !title || !category || !markdown || !categoryIds.has(category)) {
      return []
    }

    return [
      {
        slug,
        title,
        description,
        category,
        keywords,
        markdown,
        ...(cover ? { cover } : {}),
        ...(updatedAt ? { updated_at: updatedAt } : {}),
        status,
        ...(isPinned ? { is_pinned: true } : {}),
        ...(Number.isFinite(sortOrder) ? { sort_order: sortOrder } : {}),
        ...(Number.isFinite(featuredRank)
          ? { featured_rank: featuredRank }
          : {}),
        external_links: externalLinks,
      },
    ]
  })

  if (categories.length === 0 || articles.length === 0) {
    return null
  }

  return {
    categories,
    articles,
  }
}

export function isDocsRegistry(
  value: unknown
): value is FrontendPortalDocsRegistry {
  return collectDocsRegistry(value) !== null
}

export function normalizeDocsRegistry(
  value: unknown
): FrontendPortalDocsRegistry {
  return collectDocsRegistry(value) ?? defaultDocsRegistry
}

export function createDocsArticleMap(registry: FrontendPortalDocsRegistry) {
  return new Map(registry.articles.map((article) => [article.slug, article]))
}
