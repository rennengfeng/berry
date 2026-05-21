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
import { useQuery } from '@tanstack/react-query'
import { getFrontendSettings } from './api'
import { defaultDocsRegistry, normalizeDocsRegistry } from './docs-center-data'
import type { FrontendPortalSettings } from './types'

export const defaultPortalSettings: FrontendPortalSettings = {
  home: {
    badge: '用户前台模板',
    title: '欢迎回来，{{name}}',
    subtitle:
      '这里是新版用户首页：余额、今日用量、公告、邀请、密钥和模型入口集中展示，后台核心逻辑仍沿用 NewAPI。',
    modules: [
      { id: 'stats', enabled: true },
      { id: 'dashboard', enabled: true },
      { id: 'notice', enabled: true },
      { id: 'invite', enabled: true },
      { id: 'status', enabled: true },
      { id: 'quick_links', enabled: true },
    ],
    quick_links: [
      {
        href: '/model-square',
        title: '模型广场',
        description: '查看模型、价格和可用性',
        icon: 'bot',
      },
      {
        href: '/online-chat',
        title: '在线对话',
        description: '选择 Key + 模型直接体验',
        icon: 'key',
      },
      {
        href: '/subscription-hub',
        title: '订阅/充值',
        description: '套餐、余额与支付入口',
        icon: 'wallet',
      },
      {
        href: '/docs-center',
        title: '文档中心',
        description: '快速开始、Curl 示例与接入说明',
        icon: 'link',
      },
      {
        href: '/keys',
        title: 'API Keys',
        description: '创建和管理调用密钥',
        icon: 'credit-card',
      },
    ],
  },
  model_square: {
    group_mode: 'vendor',
    layout_mode: 'sidebar',
    default_price_mode: 'site',
    modules: [
      { id: 'stats', enabled: true },
      { id: 'filters', enabled: true },
      { id: 'price_table', enabled: true },
    ],
    sidebar_title: '渠道列表',
    sidebar_description: '先按供应商归类，后续可替换为模板化渠道分组。',
    hero_badge: '模型广场 MVP',
    hero_title: '模型、价格、稳定性放在一个地方看',
    hero_subtitle:
      '左侧按渠道/供应商筛选，右侧横排价格表；本站价会叠加当前可用分组倍率，官方价展示原始倍率参考。',
  },
  online_chat: {
    layout_mode: 'sidebar',
    badge: '在线对话 MVP',
    title: '直接在站内测试你的 API Key',
    subtitle:
      '保留 NewAPI 原有扣费、转发、权限逻辑，前台只提供一个用户友好的体验入口。',
    system_prompt: 'You are a helpful assistant in an API playground.',
    welcome_message:
      '选择一个 API Key 和模型，就可以直接在站内发起一次 /v1/chat/completions 测试。',
    input_placeholder:
      '输入一条消息，例如：用三句话介绍这个站点的 API 调用流程',
    sidebar_title: '选择调用身份',
    sidebar_description:
      '使用用户自己的 API Key 调本站 OpenAI 兼容接口，不绕过原扣费和分发。',
    tips:
      '如果没有 Key，请先到 API Keys 创建。这个页面目前做非流式 MVP，后续可继续接入流式输出、参数面板和历史会话。',
    prompt_presets: [
      {
        title: 'Summarize site flow',
        content:
          'Use three short paragraphs to explain how a user calls this site API from key creation to response return.',
      },
      {
        title: 'Price explanation',
        content:
          'Explain the difference between official price, site price, and group ratio in simple terms.',
      },
      {
        title: 'Sample curl',
        content:
          'Generate a curl example for /v1/chat/completions and explain each important field.',
      },
    ],
    modules: [
      { id: 'identity', enabled: true },
      { id: 'tips', enabled: true },
      { id: 'chat_panel', enabled: true },
    ],
  },
  subscription_hub: {
    badge: '订阅/充值',
    title: '订阅/充值',
    subtitle:
      '账户余额、充值入口、套餐选择和订单历史集中在一个用户中心页面，计费核心仍沿用 NewAPI。',
    highlights: [
      'Subscription and wallet charging continue to use the original NewAPI core.',
      'Users can buy plans, recharge quota, redeem codes, and review payment history in one place.',
      'Referral rewards stay available and can still be transferred back into balance.',
    ],
    faq: [
      {
        title: 'What is the difference between a plan and wallet balance?',
        content:
          'Plans usually unlock a package with its own quota cycle, while wallet balance is the flexible pay-as-you-go amount already used by NewAPI billing.',
      },
      {
        title: 'Will this page change billing logic?',
        content:
          'No. This page only repackages the user experience. Pricing, payment requests, quota changes, and subscription rules still come from the existing backend.',
      },
      {
        title: 'Where can users review recharge records?',
        content:
          'The topup panel still opens the existing billing history dialog, so users can track recent recharge and payment records without leaving the portal.',
      },
    ],
    modules: [
      { id: 'summary', enabled: true },
      { id: 'plans', enabled: true },
      { id: 'topup', enabled: true },
      { id: 'invite', enabled: true },
      { id: 'faq', enabled: true },
    ],
  },
  docs_center: {
    badge: 'Docs center',
    title: 'Keep onboarding, API examples, and troubleshooting in one place',
    subtitle:
      'Turn the new portal into a reusable knowledge hub: keep the layout stable, but let operations edit the hero copy and recommended links from system settings.',
    hero_highlights: [
      {
        title: 'Quick start path',
        content:
          'Explain recharge, key creation, model lookup, and the first successful request in one short path.',
      },
      {
        title: 'CLI and app onboarding',
        content:
          'Bridge the gap between in-site testing and real client tools such as Codex CLI, Cherry Studio, or custom scripts.',
      },
      {
        title: 'Troubleshooting first',
        content:
          'Keep permission, quota, model naming, and compatibility notes close to the actual portal pages.',
      },
    ],
    featured_links: [
      {
        href: '/subscription-hub',
        title: 'Get quota first',
        description:
          'Review plans, recharge, redemption, and payment records before creating a key.',
        icon: 'wallet',
      },
      {
        href: '/model-square',
        title: 'Check models',
        description:
          'Confirm model names, pricing mode, supported endpoints, and monitor health.',
        icon: 'bot',
      },
      {
        href: '/online-chat',
        title: 'Run a live test',
        description:
          'Validate the key and model in the built-in playground before moving to third-party apps.',
        icon: 'key',
      },
    ],
    modules: [
      { id: 'hero_highlights', enabled: true },
      { id: 'category_nav', enabled: true },
      { id: 'related_articles', enabled: true },
      { id: 'featured_links', enabled: true },
    ],
  },
}

export function usePortalSettings() {
  const query = useQuery({
    queryKey: ['frontend-portal-settings'],
    queryFn: getFrontendSettings,
    staleTime: 60_000,
  })

  return {
    ...query,
    portal: query.data?.portal ?? defaultPortalSettings,
    docsRegistry: normalizeDocsRegistry(
      query.data?.docs_registry ?? defaultDocsRegistry
    ),
  }
}
