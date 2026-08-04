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
import type { AuthUser } from '@/stores/auth-store'

export type FrontendModelStatus = {
  name: string
  uptime: number
  status: number
  group?: string
}

export type FrontendStatusGroup = {
  categoryName: string
  monitors: FrontendModelStatus[]
}

export type FrontendPortalQuickLink = {
  href: string
  title: string
  description: string
  icon: string
}

export type FrontendPortalDocCategory = {
  id: string
  title: string
  description: string
}

export type FrontendPortalDocExternalLink = {
  title: string
  href: string
  description?: string
}

export type FrontendPortalDocArticle = {
  slug: string
  title: string
  description: string
  category: string
  keywords: string[]
  markdown: string
  cover?: string
  updated_at?: string
  status?: 'published' | 'draft'
  is_pinned?: boolean
  sort_order?: number
  featured_rank?: number
  external_links?: FrontendPortalDocExternalLink[]
}

export type FrontendPortalDocsRegistry = {
  categories: FrontendPortalDocCategory[]
  articles: FrontendPortalDocArticle[]
}

export type FrontendPortalHomeModuleId =
  | 'stats'
  | 'dashboard'
  | 'notice'
  | 'invite'
  | 'status'
  | 'quick_links'

export type FrontendPortalHomeModule = {
  id: FrontendPortalHomeModuleId
  enabled: boolean
}

export type FrontendPortalModelSquareModuleId =
  | 'stats'
  | 'filters'
  | 'price_table'

export type FrontendPortalModelSquareModule = {
  id: FrontendPortalModelSquareModuleId
  enabled: boolean
}

export type FrontendPortalOnlineChatModuleId =
  | 'identity'
  | 'tips'
  | 'chat_panel'

export type FrontendPortalOnlineChatModule = {
  id: FrontendPortalOnlineChatModuleId
  enabled: boolean
}

export type FrontendPortalPromptPreset = {
  title: string
  content: string
}

export type FrontendPortalInfoBlock = {
  title: string
  content: string
}

export type FrontendPortalDocsCenterModuleId =
  | 'hero_highlights'
  | 'category_nav'
  | 'related_articles'
  | 'featured_links'

export type FrontendPortalDocsCenterModule = {
  id: FrontendPortalDocsCenterModuleId
  enabled: boolean
}

export type FrontendPortalSettings = {
  home: {
    badge: string
    title: string
    subtitle: string
    modules: FrontendPortalHomeModule[]
    quick_links: FrontendPortalQuickLink[]
  }
  model_square: {
    group_mode: 'vendor' | 'group'
    layout_mode: 'sidebar' | 'stacked'
    default_price_mode: 'site' | 'official'
    modules: FrontendPortalModelSquareModule[]
    sidebar_title: string
    sidebar_description: string
    hero_badge: string
    hero_title: string
    hero_subtitle: string
  }
  online_chat: {
    layout_mode: 'sidebar' | 'stacked'
    badge: string
    title: string
    subtitle: string
    system_prompt: string
    welcome_message: string
    input_placeholder: string
    sidebar_title: string
    sidebar_description: string
    tips: string
    prompt_presets: FrontendPortalPromptPreset[]
    modules: FrontendPortalOnlineChatModule[]
  }
  subscription_hub: {
    badge: string
    title: string
    subtitle: string
    highlights: string[]
    faq: FrontendPortalInfoBlock[]
    modules: FrontendPortalSubscriptionHubModule[]
  }
  docs_center: {
    badge: string
    title: string
    subtitle: string
    hero_highlights: FrontendPortalInfoBlock[]
    featured_links: FrontendPortalQuickLink[]
    modules: FrontendPortalDocsCenterModule[]
  }
}

export type FrontendPortalSubscriptionHubModuleId =
  | 'summary'
  | 'plans'
  | 'topup'
  | 'invite'
  | 'faq'

export type FrontendPortalSubscriptionHubModule = {
  id: FrontendPortalSubscriptionHubModuleId
  enabled: boolean
}

export type DashScopeNativePricing = {
  unit: string
  price?: number
  prices?: Record<string, number>
  input_price?: number
  output_price?: number
  cache_read_price?: number
  cache_write_price?: number
}

export type FrontendModel = {
  model_name: string
  description?: string
  icon?: string
  tags?: string
  vendor_id?: number
  vendor_name?: string
  quota_type: number
  model_ratio: number
  model_price?: number
  official_model_ratio?: number
  official_model_price?: number
  completion_ratio: number
  cache_ratio?: number | null
  create_cache_ratio?: number | null
  enable_groups: string[]
  supported_endpoint_types?: string[]
  group_ratio?: Record<string, number>
  status?: FrontendModelStatus | null
  monitor?: FrontendModelStatus | null
  monitors?: FrontendModelStatus[]
  billing_mode?: string
  billing_unit?: string
  billing_expr?: string
  dashscope_native_pricing?: DashScopeNativePricing
}

export type FrontendModelsPayload = {
  models: FrontendModel[]
  vendors: Array<{ id: number; name: string; icon?: string }>
  group_ratio: Record<string, number>
  usable_group: Record<string, string>
  supported_endpoint: Record<string, unknown>
  auto_groups: string[]
  status_groups: FrontendStatusGroup[]
}

export type FrontendDashboardPayload = {
  user: AuthUser
  today: {
    quota: number
    rpm: number
    tpm: number
  }
  models_count: number
  status_groups: FrontendStatusGroup[]
  notice?: string
  portal?: FrontendPortalSettings
}

export type FrontendSettingsPayload = {
  portal: FrontendPortalSettings
  docs_registry?: FrontendPortalDocsRegistry | null
}

export type ApiKeySummary = {
  id: number
  name: string
  key?: string
  status: number
  group?: string
  model_limits_enabled?: boolean
  model_limits?: string
  remain_quota: number
  unlimited_quota: boolean
}
