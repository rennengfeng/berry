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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsSection } from '../components/settings-section'
import {
  fetchUpstreamRatios,
  getUpstreamChannels,
  updateSystemOption,
} from '../api'
import type { RatioDifference, UpstreamChannel, UpstreamConfig } from '../types'
import { useUpdateOption } from '../hooks/use-update-option'
import { ToolPriceSettings } from './tool-price-settings'

const PRICING_OPTION_KEY = 'billing_setting.dashscope_native_pricing'
const BILLING_MODE_OPTION_KEY = 'billing_setting.billing_mode'
const DASH_SCOPE_NATIVE_BILLING_MODE = 'dashscope_native'

type NativeUnit =
  | 'character'
  | 'character_10k'
  | 'audio_second'
  | 'image'
  | 'video_second'
  | 'video_task'
  | 'request'
  | 'token_input_output'

type NativePricingSpec = {
  unit: NativeUnit
  price?: number
  prices?: Record<string, number>
  input_price?: number
  output_price?: number
  cache_read_price?: number
  cache_write_price?: number
}

type ConditionRow = {
  id: number
  key: string
  price: number
}

type PricingRow = {
  id: number
  model: string
  unit: NativeUnit
  price: number
  conditions: ConditionRow[]
  inputPrice: number
  outputPrice: number
  cacheReadPrice: number
  cacheWritePrice: number
}

type SyncRow = {
  id: string
  model: string
  field: 'dashscope_native_pricing' | 'billing_mode'
  fieldLabel: string
  current: string
  upstream: string
  source: string
  spec?: NativePricingSpec
  mode?: string
}

type DashScopeNativePricingProps = {
  pricingDefault: string
  toolPricesDefault: string
  billingModeDefault: string
}

const UNIT_OPTIONS: Array<{ value: NativeUnit; label: string }> = [
  { value: 'token_input_output', label: 'Input/output tokens' },
  { value: 'request', label: 'Requests' },
  { value: 'video_task', label: 'Video tasks' },
  { value: 'video_second', label: 'Video seconds' },
  { value: 'audio_second', label: 'Audio seconds' },
  { value: 'image', label: 'Images' },
  { value: 'character', label: '10K characters' },
]

const VIDEO_CONDITION_OPTIONS = ['480P', '720P', '1080P']
const IMAGE_CONDITION_OPTIONS = ['1K', '2K', '4K', 'standard', 'high']

const DEFAULT_PRICING: Record<string, NativePricingSpec> = {
  'cosyvoice-v3.5-plus': {
    unit: 'character',
    price: 1.5 / 7.3,
  },
  'cosyvoice-v3.5-flash': {
    unit: 'character',
    price: 0.8 / 7.3,
  },
  'qwen-image-2.0': {
    unit: 'image',
    price: 0.2 / 7.3,
  },
  'qwen-image-2.0-2026-03-03': {
    unit: 'image',
    price: 0.2 / 7.3,
  },
  'qwen-image-2.0-pro': {
    unit: 'image',
    price: 0.5 / 7.3,
  },
  'qwen-image-2.0-pro-2026-06-22': {
    unit: 'image',
    price: 0.5 / 7.3,
  },
  'qwen-image-2.0-pro-2026-04-22': {
    unit: 'image',
    price: 0.5 / 7.3,
  },
  'qwen-image-2.0-pro-2026-03-03': {
    unit: 'image',
    price: 0.5 / 7.3,
  },
  'happyhorse-1.1-t2v': {
    unit: 'video_second',
    prices: {
      '480P': 0.45 / 7.3,
      '720P': 0.9 / 7.3,
      '1080P': 1.2 / 7.3,
    },
  },
  'happyhorse-1.1-i2v': {
    unit: 'video_second',
    prices: {
      '480P': 0.45 / 7.3,
      '720P': 0.9 / 7.3,
      '1080P': 1.2 / 7.3,
    },
  },
  'happyhorse-1.1-r2v': {
    unit: 'video_second',
    prices: {
      '480P': 0.45 / 7.3,
      '720P': 0.9 / 7.3,
      '1080P': 1.2 / 7.3,
    },
  },
  'happyhorse-1.0-t2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.9 / 7.3,
      '1080P': 1.6 / 7.3,
    },
  },
  'happyhorse-1.0-i2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.9 / 7.3,
      '1080P': 1.6 / 7.3,
    },
  },
  'happyhorse-1.0-r2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.9 / 7.3,
      '1080P': 1.6 / 7.3,
    },
  },
  'happyhorse-1.0-video-edit': {
    unit: 'video_second',
    prices: {
      '720P': 0.9 / 7.3,
      '1080P': 1.6 / 7.3,
    },
  },
  'wan2.7-t2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.7-t2v-2026-06-12': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.7-t2v-2026-04-25': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.7-i2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.7-i2v-2026-04-25': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.6-t2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.6-i2v': {
    unit: 'video_second',
    prices: {
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.5-t2v-preview': {
    unit: 'video_second',
    prices: {
      '480P': 0.3 / 7.3,
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.5-i2v-preview': {
    unit: 'video_second',
    prices: {
      '480P': 0.3 / 7.3,
      '720P': 0.6 / 7.3,
      '1080P': 1 / 7.3,
    },
  },
  'wan2.2-t2v-plus': {
    unit: 'video_second',
    prices: {
      '480P': 0.14 / 7.3,
      '1080P': 0.7 / 7.3,
    },
  },
  'wan2.2-i2v-plus': {
    unit: 'video_second',
    prices: {
      '480P': 0.14 / 7.3,
      '1080P': 0.7 / 7.3,
    },
  },
  'wan2.2-i2v-flash': {
    unit: 'video_second',
    prices: {
      '480P': 0.1 / 7.3,
      '720P': 0.2 / 7.3,
      '1080P': 0.48 / 7.3,
    },
  },
  'wan2.2-kf2v-flash': {
    unit: 'video_second',
    prices: {
      '480P': 0.1 / 7.3,
      '720P': 0.2 / 7.3,
      '1080P': 0.48 / 7.3,
    },
  },
  'wanx2.1-t2v-turbo': {
    unit: 'video_second',
    prices: {
      '480P': 0.24 / 7.3,
      '720P': 0.24 / 7.3,
    },
  },
  'wanx2.1-t2v-plus': {
    unit: 'video_second',
    prices: {
      '720P': 0.7 / 7.3,
    },
  },
  'wanx2.1-i2v-turbo': {
    unit: 'video_second',
    prices: {
      '480P': 0.24 / 7.3,
      '720P': 0.24 / 7.3,
    },
  },
  'wanx2.1-i2v-plus': {
    unit: 'video_second',
    prices: {
      '720P': 0.7 / 7.3,
    },
  },
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isNativeUnit(value: unknown): value is NativeUnit {
  return UNIT_OPTIONS.some((option) => option.value === value) || value === 'character_10k'
}

function conditionOptions(unit: NativeUnit, currentKey?: string): string[] {
  const defaults =
    unit === 'video_second'
      ? VIDEO_CONDITION_OPTIONS
      : unit === 'image'
        ? IMAGE_CONDITION_OPTIONS
        : []
  if (currentKey && !defaults.includes(currentKey)) {
    return [currentKey, ...defaults]
  }
  return defaults
}

function defaultConditions(unit: NativeUnit, price: number): ConditionRow[] {
  if (unit === 'video_second') {
    return VIDEO_CONDITION_OPTIONS.map((key, index) => ({
      id: index + 1,
      key,
      price,
    }))
  }
  return []
}

function parsePricing(rawValue: string | undefined): Record<string, NativePricingSpec> {
  if (!rawValue || !rawValue.trim()) return { ...DEFAULT_PRICING }
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PRICING }
    }
    const result: Record<string, NativePricingSpec> = { ...DEFAULT_PRICING }
    for (const [model, rawSpec] of Object.entries(parsed)) {
      if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) continue
      const spec = rawSpec as Record<string, unknown>
      result[model] = {
        unit: isNativeUnit(spec.unit) ? spec.unit : 'request',
        price: numberValue(spec.price),
        prices:
          spec.prices && typeof spec.prices === 'object' && !Array.isArray(spec.prices)
            ? Object.fromEntries(
                Object.entries(spec.prices as Record<string, unknown>).map(([key, value]) => [
                  key,
                  numberValue(value),
                ])
              )
            : undefined,
        input_price: numberValue(spec.input_price),
        output_price: numberValue(spec.output_price),
        cache_read_price: numberValue(spec.cache_read_price),
        cache_write_price: numberValue(spec.cache_write_price),
      }
    }
    return result
  } catch {
    return { ...DEFAULT_PRICING }
  }
}

function pricingToRows(pricing: Record<string, NativePricingSpec>): PricingRow[] {
  return Object.entries(pricing).map(([model, spec], index) => ({
    id: index + 1,
    model,
    unit: spec.unit,
    price: numberValue(spec.price),
    conditions: Object.entries(spec.prices || {}).map(([key, price], childIndex) => ({
      id: childIndex + 1,
      key,
      price: numberValue(price),
    })),
    inputPrice: numberValue(spec.input_price),
    outputPrice: numberValue(spec.output_price),
    cacheReadPrice: numberValue(spec.cache_read_price),
    cacheWritePrice: numberValue(spec.cache_write_price),
  }))
}

function rowsToPricing(rows: PricingRow[]): Record<string, NativePricingSpec> {
  const result: Record<string, NativePricingSpec> = {}
  for (const row of rows) {
    const model = row.model.trim()
    if (!model) continue
    if (row.unit === 'token_input_output') {
      result[model] = {
        unit: row.unit,
        input_price: numberValue(row.inputPrice),
        output_price: numberValue(row.outputPrice),
        cache_read_price: numberValue(row.cacheReadPrice),
        cache_write_price: numberValue(row.cacheWritePrice),
      }
      continue
    }
    const prices: Record<string, number> = {}
    for (const condition of row.conditions) {
      const key = condition.key.trim()
      if (key) prices[key] = numberValue(condition.price)
    }
    result[model] = {
      unit: row.unit,
      price: numberValue(row.price),
      ...(Object.keys(prices).length > 0 ? { prices } : {}),
    }
  }
  return result
}

function parseBillingMode(rawValue: string | undefined): Record<string, string> {
  if (!rawValue || !rawValue.trim()) return {}
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([model, mode]) => model.trim() && typeof mode === 'string'
      )
    ) as Record<string, string>
  } catch {
    return {}
  }
}

function formatSpec(spec: NativePricingSpec | string | null | undefined): string {
  if (!spec) return '-'
  if (typeof spec === 'string') {
    try {
      return formatSpec(JSON.parse(spec) as NativePricingSpec)
    } catch {
      return spec
    }
  }
  if (spec.unit === 'token_input_output') {
    return `in ${numberValue(spec.input_price)} / out ${numberValue(spec.output_price)}`
  }
  return `${spec.unit} / ${numberValue(spec.price)}${Object.keys(spec.prices || {}).length ? ` (+${Object.keys(spec.prices || {}).length})` : ''}`
}

function formatBillingMode(value: unknown): string {
  if (!value || value === 'same') return '-'
  return String(value)
}

function parseSyncedSpec(value: unknown): NativePricingSpec | null {
  if (!value || value === 'same' || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const spec = parsed as Record<string, unknown>
    return {
      unit: isNativeUnit(spec.unit) ? spec.unit : 'request',
      price: numberValue(spec.price),
      prices:
        spec.prices && typeof spec.prices === 'object' && !Array.isArray(spec.prices)
          ? Object.fromEntries(
              Object.entries(spec.prices as Record<string, unknown>).map(([key, price]) => [
                key,
                numberValue(price),
              ])
            )
          : undefined,
      input_price: numberValue(spec.input_price),
      output_price: numberValue(spec.output_price),
      cache_read_price: numberValue(spec.cache_read_price),
      cache_write_price: numberValue(spec.cache_write_price),
    }
  } catch {
    return null
  }
}

function isDashScopeNativeChannel(channel: UpstreamChannel): boolean {
  const name = channel.name.toLowerCase()
  return (
    channel.type === 59 ||
    channel.type === 10001 ||
    name.includes('dashscope native') ||
    name.includes('dashscope') ||
    name.includes('阿里sdk')
  )
}

function getNextId(rows: Array<{ id: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1
}

export function DashScopeNativePricing({
  pricingDefault,
  toolPricesDefault,
  billingModeDefault,
}: DashScopeNativePricingProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<PricingRow[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [syncRows, setSyncRows] = useState<SyncRow[]>([])
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setRows(pricingToRows(parsePricing(pricingDefault)))
  }, [pricingDefault])

  const currentPricing = useMemo(() => rowsToPricing(rows), [rows])
  const { data: channelsData } = useQuery({
    queryKey: ['dashscope-native-sync-channels'],
    queryFn: getUpstreamChannels,
  })
  const nativeChannels = useMemo(
    () => (channelsData?.data ?? []).filter(isDashScopeNativeChannel),
    [channelsData?.data]
  )

  useEffect(() => {
    if (!selectedChannelId && nativeChannels.length > 0) {
      setSelectedChannelId(String(nativeChannels[0].id))
    }
  }, [nativeChannels, selectedChannelId])

  const fetchMutation = useMutation({
    mutationFn: fetchUpstreamRatios,
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message || t('Failed to fetch upstream prices'))
        return
      }
      const errors = data.data.test_results.filter((result) => result.status === 'error')
      if (errors.length > 0) {
        toast.warning(errors.map((result) => `${result.name}: ${result.error}`).join(', '))
      }
      const nextRows: SyncRow[] = []
      for (const [model, fields] of Object.entries(data.data.differences)) {
        const fieldMap = fields as Record<string, RatioDifference>
        const pricingDiff = fieldMap.dashscope_native_pricing
        if (pricingDiff) {
          for (const [source, upstreamValue] of Object.entries(pricingDiff.upstreams)) {
            const spec = parseSyncedSpec(upstreamValue)
            if (spec) {
              nextRows.push({
                id: `${model}:dashscope_native_pricing:${source}`,
                model,
                field: 'dashscope_native_pricing',
                fieldLabel: t('Native price'),
                current: formatSpec(pricingDiff.current as string | null),
                upstream: formatSpec(spec),
                source,
                spec,
              })
            }
          }
        }
        const modeDiff = fieldMap.billing_mode
        if (modeDiff) {
          for (const [source, upstreamValue] of Object.entries(modeDiff.upstreams)) {
            if (typeof upstreamValue === 'string' && upstreamValue !== 'same') {
              nextRows.push({
                id: `${model}:billing_mode:${source}`,
                model,
                field: 'billing_mode',
                fieldLabel: t('Billing mode'),
                current: formatBillingMode(modeDiff.current),
                upstream: formatBillingMode(upstreamValue),
                source,
                mode: upstreamValue,
              })
            }
          }
        }
      }
      setSyncRows(nextRows)
      setSelectedSyncIds(new Set(nextRows.map((row) => row.id)))
      if (nextRows.length === 0 && errors.length > 0) {
        toast.error(t('DashScope Native price sync did not return usable prices'))
        return
      }
      toast.success(
        nextRows.length > 0
          ? t('DashScope Native prices fetched successfully')
          : t('No DashScope Native price differences found')
      )
    },
    onError: (error: Error) => toast.error(error.message || t('Failed to fetch upstream prices')),
  })

  const applySyncMutation = useMutation({
    mutationFn: async ({
      nextPricing,
      nextBillingMode,
    }: {
      nextPricing: Record<string, NativePricingSpec>
      nextBillingMode: Record<string, string>
    }) => {
      const pricingResult = await updateSystemOption({
        key: PRICING_OPTION_KEY,
        value: JSON.stringify(nextPricing),
      })
      if (!pricingResult.success) return pricingResult
      return updateSystemOption({
        key: BILLING_MODE_OPTION_KEY,
        value: JSON.stringify(nextBillingMode),
      })
    },
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message || t('Failed to sync prices'))
        return
      }
      toast.success(t('Prices synced successfully'))
      queryClient.invalidateQueries({ queryKey: ['system-options'] })
      setSyncRows([])
      setSelectedSyncIds(new Set())
    },
    onError: (error: Error) => toast.error(error.message || t('Failed to sync prices')),
  })

  const updateRow = useCallback((id: number, patch: Partial<PricingRow>) => {
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
  }, [])

  const updateCondition = useCallback(
    (rowId: number, conditionId: number, patch: Partial<ConditionRow>) => {
      setRows((previous) =>
        previous.map((row) =>
          row.id === rowId
            ? {
                ...row,
                conditions: row.conditions.map((condition) =>
                  condition.id === conditionId ? { ...condition, ...patch } : condition
                ),
              }
            : row
        )
      )
    },
    []
  )

  const changeUnit = useCallback((row: PricingRow, unit: NativeUnit) => {
    const nextConditions =
      unit === 'video_second'
        ? defaultConditions(unit, row.price)
        : unit === 'image'
          ? []
          : []
    updateRow(row.id, { unit, conditions: nextConditions })
  }, [updateRow])

  const addRow = useCallback(() => {
    setRows((previous) => [
      ...previous,
      {
        id: getNextId(previous),
        model: '',
        unit: 'request',
        price: 0,
        conditions: [],
        inputPrice: 0,
        outputPrice: 0,
        cacheReadPrice: 0,
        cacheWritePrice: 0,
      },
    ])
  }, [])

  const removeRow = useCallback((id: number) => {
    setRows((previous) => previous.filter((row) => row.id !== id))
  }, [])

  const addCondition = useCallback((row: PricingRow) => {
    const options = conditionOptions(row.unit)
    const used = new Set(row.conditions.map((condition) => condition.key))
    const nextKey = options.find((option) => !used.has(option)) || options[0] || 'default'
    updateRow(row.id, {
      conditions: [
        ...row.conditions,
        { id: getNextId(row.conditions), key: nextKey, price: row.price },
      ],
    })
  }, [updateRow])

  const removeCondition = useCallback((rowId: number, conditionId: number) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId
          ? { ...row, conditions: row.conditions.filter((condition) => condition.id !== conditionId) }
          : row
      )
    )
  }, [])

  const handleSave = useCallback(async () => {
    const nextBillingMode = parseBillingMode(billingModeDefault)
    for (const model of Object.keys(currentPricing)) {
      nextBillingMode[model] = DASH_SCOPE_NATIVE_BILLING_MODE
    }
    const pricingResult = await updateOption.mutateAsync({
      key: PRICING_OPTION_KEY,
      value: JSON.stringify(currentPricing),
    })
    if (pricingResult.success) {
      const billingModeResult = await updateSystemOption({
        key: BILLING_MODE_OPTION_KEY,
        value: JSON.stringify(nextBillingMode),
      })
      if (!billingModeResult.success) {
        toast.error(billingModeResult.message || t('Failed to update setting'))
      } else {
        queryClient.invalidateQueries({ queryKey: ['system-options'] })
        toast.success(t('Prices saved successfully'))
      }
    }
  }, [billingModeDefault, currentPricing, queryClient, t, updateOption])

  const handleFetchSync = useCallback(() => {
    const selected = nativeChannels.find((channel) => String(channel.id) === selectedChannelId)
    if (!selected) {
      toast.warning(t('Please select a DashScope Native channel'))
      return
    }
    const upstream: UpstreamConfig = {
      id: selected.id,
      name: selected.name,
      base_url: selected.base_url,
      endpoint: 'dashscope_native',
    }
    fetchMutation.mutate({ upstreams: [upstream], timeout: 10 })
  }, [fetchMutation, nativeChannels, selectedChannelId, t])

  const handleApplySync = useCallback(() => {
    const nextBillingMode = parseBillingMode(billingModeDefault)
    const nextPricing = { ...currentPricing }
    for (const row of syncRows) {
      if (!selectedSyncIds.has(row.id)) continue
      if (row.field === 'dashscope_native_pricing' && row.spec) {
        nextPricing[row.model] = row.spec
      }
      if (row.field === 'billing_mode' && row.mode) {
        nextBillingMode[row.model] = row.mode
      }
    }
    applySyncMutation.mutate({ nextPricing, nextBillingMode })
  }, [applySyncMutation, billingModeDefault, currentPricing, selectedSyncIds, syncRows])

  const allSyncSelected = syncRows.length > 0 && selectedSyncIds.size === syncRows.length
  const someSyncSelected = selectedSyncIds.size > 0 && !allSyncSelected

  return (
    <SettingsSection
      title={t('Ali SDK / DashScope Native Pricing')}
      description={t('Configure pricing used only by Ali SDK / DashScope Native channels')}
    >
      <Tabs defaultValue='native-models' className='space-y-6'>
        <TabsList className='grid w-full grid-cols-3'>
          <TabsTrigger value='native-models'>{t('Native model prices')}</TabsTrigger>
          <TabsTrigger value='tool-prices'>{t('Tool prices')}</TabsTrigger>
          <TabsTrigger value='upstream-sync'>{t('Upstream price sync')}</TabsTrigger>
        </TabsList>
        <TabsContent value='native-models' className='space-y-4'>
          <Alert>
            <AlertDescription>
              {t('These prices are isolated to Ali SDK / DashScope Native channels and are not used by ordinary NewAPI model pricing.')}
            </AlertDescription>
          </Alert>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Button variant='outline' size='sm' onClick={addRow}>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add model')}
            </Button>
            <Button onClick={handleSave} disabled={updateOption.isPending}>
              {t('Save DashScope Native pricing')}
            </Button>
          </div>
          <div className='overflow-hidden rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead className='w-[200px]'>{t('Billing unit')}</TableHead>
                  <TableHead>{t('Price configuration')}</TableHead>
                  <TableHead className='w-[80px] text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='py-8 text-center text-muted-foreground'>
                      {t('No DashScope Native pricing configured')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className='align-top'>
                      <TableCell>
                        <Input
                          value={row.model}
                          placeholder='qwen-image-2.0'
                          onChange={(event) => updateRow(row.id, { model: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          items={UNIT_OPTIONS.map((option) => ({
                            value: option.value,
                            label: t(option.label),
                          }))}
                          value={row.unit}
                          onValueChange={(value) => value && changeUnit(row, value as NativeUnit)}
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              {UNIT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {t(option.label)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {row.unit === 'token_input_output' ? (
                          <div className='grid gap-3 sm:grid-cols-2'>
                            {[
                              ['Input price', 'inputPrice'],
                              ['Output price', 'outputPrice'],
                              ['Cache read price', 'cacheReadPrice'],
                              ['Cache write price', 'cacheWritePrice'],
                            ].map(([label, key]) => (
                              <label key={key} className='space-y-1 text-sm'>
                                <span className='text-muted-foreground'>{t(label)}</span>
                                <Input
                                  type='number'
                                  min={0}
                                  step='0.000001'
                                  value={row[key as keyof PricingRow] as number}
                                  onChange={(event) =>
                                    updateRow(row.id, {
                                      [key]: numberValue(event.target.value),
                                    } as Partial<PricingRow>)
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className='space-y-3'>
                            <label className='block max-w-[240px] space-y-1 text-sm'>
                              <span className='text-muted-foreground'>{t('Default price')}</span>
                              <Input
                                type='number'
                                min={0}
                                step='0.000001'
                                value={row.price}
                                onChange={(event) =>
                                  updateRow(row.id, { price: numberValue(event.target.value) })
                                }
                              />
                            </label>
                            {(row.unit === 'video_second' || row.unit === 'image') && (
                              <div className='space-y-2'>
                                <div className='text-sm font-medium'>{t('Conditional prices')}</div>
                                {row.conditions.map((condition) => (
                                  <div key={condition.id} className='grid gap-2 sm:grid-cols-[180px_180px_32px]'>
                                    <Select
                                      items={conditionOptions(row.unit, condition.key).map((key) => ({
                                        value: key,
                                        label: key,
                                      }))}
                                      value={condition.key}
                                      onValueChange={(value) =>
                                        value && updateCondition(row.id, condition.id, { key: value })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder={t('Resolution / quality')} />
                                      </SelectTrigger>
                                      <SelectContent alignItemWithTrigger={false}>
                                        <SelectGroup>
                                          {conditionOptions(row.unit, condition.key).map((key) => (
                                            <SelectItem key={key} value={key}>
                                              {key}
                                            </SelectItem>
                                          ))}
                                        </SelectGroup>
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      type='number'
                                      min={0}
                                      step='0.000001'
                                      value={condition.price}
                                      onChange={(event) =>
                                        updateCondition(row.id, condition.id, {
                                          price: numberValue(event.target.value),
                                        })
                                      }
                                    />
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      onClick={() => removeCondition(row.id, condition.id)}
                                      aria-label={t('Delete')}
                                    >
                                      <Trash2 className='h-4 w-4 text-destructive' />
                                    </Button>
                                  </div>
                                ))}
                                <Button variant='ghost' size='sm' onClick={() => addCondition(row)}>
                                  <Plus className='mr-2 h-4 w-4' />
                                  {t('Add pricing condition')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={() => removeRow(row.id)}
                          aria-label={t('Delete')}
                        >
                          <Trash2 className='h-4 w-4 text-destructive' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value='tool-prices'>
          <ToolPriceSettings defaultValue={toolPricesDefault} />
        </TabsContent>
        <TabsContent value='upstream-sync' className='space-y-4'>
          <Alert>
            <AlertDescription>
              {t('DashScope Native sync uses the selected channel base URL to choose the built-in domestic or international official price catalog, then writes native pricing and billing mode together.')}
            </AlertDescription>
          </Alert>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Select
              items={nativeChannels.map((channel) => ({
                value: String(channel.id),
                label: channel.name,
              }))}
              value={selectedChannelId}
              onValueChange={(value) => value && setSelectedChannelId(value)}
            >
              <SelectTrigger className='w-full sm:w-80'>
                <SelectValue placeholder={t('Select DashScope Native channel')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {nativeChannels.map((channel) => (
                    <SelectItem key={channel.id} value={String(channel.id)}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              onClick={handleFetchSync}
              disabled={fetchMutation.isPending || nativeChannels.length === 0}
            >
              <RefreshCcw className='mr-2 h-4 w-4' />
              {t('Fetch DashScope Native prices')}
            </Button>
            <Button
              variant='secondary'
              onClick={handleApplySync}
              disabled={selectedSyncIds.size === 0 || applySyncMutation.isPending}
            >
              <CheckSquare className='mr-2 h-4 w-4' />
              {t('Apply Sync')}
            </Button>
          </div>
          <div className='overflow-hidden rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-[44px]'>
                    <Checkbox
                      checked={allSyncSelected}
                      indeterminate={someSyncSelected}
                      onCheckedChange={(checked) => {
                        setSelectedSyncIds(
                          checked ? new Set(syncRows.map((row) => row.id)) : new Set()
                        )
                      }}
                      aria-label={t('Select all sync changes')}
                    />
                  </TableHead>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Field')}</TableHead>
                  <TableHead>{t('Current')}</TableHead>
                  <TableHead>{t('Upstream')}</TableHead>
                  <TableHead>{t('Source')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className='py-8 text-center text-muted-foreground'>
                      {nativeChannels.length === 0
                        ? t('No DashScope Native channels found')
                        : t('No DashScope Native price differences found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  syncRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSyncIds.has(row.id)}
                          onCheckedChange={(checked) => {
                            setSelectedSyncIds((previous) => {
                              const next = new Set(previous)
                              if (checked) next.add(row.id)
                              else next.delete(row.id)
                              return next
                            })
                          }}
                          aria-label={`${t('Select')} ${row.model} ${row.fieldLabel}`}
                        />
                      </TableCell>
                      <TableCell className='font-mono text-sm'>{row.model}</TableCell>
                      <TableCell>{row.fieldLabel}</TableCell>
                      <TableCell>{row.current}</TableCell>
                      <TableCell>{row.upstream}</TableCell>
                      <TableCell>{row.source}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </SettingsSection>
  )
}
