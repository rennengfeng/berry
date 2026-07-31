#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "openrouter"
OPTION_KEY = "billing_setting.dashscope_native_pricing"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src" / "features" / "system-settings").exists():
        return PROJECT_ROOT
    raise SystemExit(f"DashScope Native pricing UI patch failed: missing frontend root {candidate}")


def read(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"DashScope Native pricing UI patch failed: missing {path}")
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


COMPONENT = r'''/*
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Plus, RefreshCcw, Trash2 } from 'lucide-react'
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

const OPTION_KEY = 'billing_setting.dashscope_native_pricing'
const DASHSCOPE_NATIVE_CHANNEL_TYPE = 10001

type NativeUnit =
  | 'character'
  | 'audio_second'
  | 'image'
  | 'video_second'
  | 'video_task'
  | 'request'
  | 'token_input_output'

type NativePricingSpec = {
  unit: NativeUnit
  price: number
  prices?: Record<string, number>
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
}

type SyncRow = {
  model: string
  current: string
  upstream: string
  source: string
  spec: NativePricingSpec
}

type DashScopeNativePricingProps = {
  pricingDefault: string
  toolPricesDefault: string
}

const UNIT_OPTIONS: Array<{ value: NativeUnit; label: string }> = [
  { value: 'character', label: 'Characters' },
  { value: 'audio_second', label: 'Audio seconds' },
  { value: 'image', label: 'Images' },
  { value: 'video_second', label: 'Video seconds' },
  { value: 'video_task', label: 'Video tasks' },
  { value: 'request', label: 'Requests' },
  { value: 'token_input_output', label: 'Input/output tokens' },
]

const DEFAULT_PRICING: Record<string, NativePricingSpec> = {
  'cosyvoice-v3.5-plus': { unit: 'character', price: 0.000022 },
}

function isNativeUnit(value: unknown): value is NativeUnit {
  return UNIT_OPTIONS.some((option) => option.value === value)
}

function parsePricing(rawValue: string | undefined): Record<string, NativePricingSpec> {
  if (!rawValue || !rawValue.trim()) return { ...DEFAULT_PRICING }
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PRICING }
    }
    const result: Record<string, NativePricingSpec> = {}
    for (const [model, specValue] of Object.entries(parsed)) {
      if (!specValue || typeof specValue !== 'object' || Array.isArray(specValue)) {
        continue
      }
      const spec = specValue as Record<string, unknown>
      result[model] = {
        unit: isNativeUnit(spec.unit) ? spec.unit : 'request',
        price: Number(spec.price) || 0,
        prices:
          spec.prices && typeof spec.prices === 'object' && !Array.isArray(spec.prices)
            ? Object.fromEntries(
                Object.entries(spec.prices as Record<string, unknown>).map(([key, price]) => [
                  key,
                  Number(price) || 0,
                ])
              )
            : undefined,
      }
    }
    return Object.keys(result).length > 0 ? result : { ...DEFAULT_PRICING }
  } catch {
    return { ...DEFAULT_PRICING }
  }
}

function pricingToRows(pricing: Record<string, NativePricingSpec>): PricingRow[] {
  return Object.entries(pricing).map(([model, spec], index) => ({
    id: index + 1,
    model,
    unit: spec.unit,
    price: Number(spec.price) || 0,
    conditions: Object.entries(spec.prices || {}).map(([key, price], childIndex) => ({
      id: childIndex + 1,
      key,
      price: Number(price) || 0,
    })),
  }))
}

function rowsToPricing(rows: PricingRow[]): Record<string, NativePricingSpec> {
  const pricing: Record<string, NativePricingSpec> = {}
  for (const row of rows) {
    const model = row.model.trim()
    if (!model) continue
    const conditionPrices: Record<string, number> = {}
    for (const condition of row.conditions) {
      const key = condition.key.trim()
      if (!key) continue
      conditionPrices[key] = Number(condition.price) || 0
    }
    pricing[model] = {
      unit: row.unit,
      price: Number(row.price) || 0,
      ...(Object.keys(conditionPrices).length > 0 ? { prices: conditionPrices } : {}),
    }
  }
  return pricing
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
  const conditionCount = Object.keys(spec.prices || {}).length
  return `${spec.unit} / ${spec.price}${conditionCount ? ` (+${conditionCount})` : ''}`
}

function parseSyncedSpec(value: unknown): NativePricingSpec | null {
  if (!value || value === 'same' || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const spec = parsed as Record<string, unknown>
    return {
      unit: isNativeUnit(spec.unit) ? spec.unit : 'request',
      price: Number(spec.price) || 0,
      prices:
        spec.prices && typeof spec.prices === 'object' && !Array.isArray(spec.prices)
          ? Object.fromEntries(
              Object.entries(spec.prices as Record<string, unknown>).map(([key, price]) => [
                key,
                Number(price) || 0,
              ])
            )
          : undefined,
    }
  } catch {
    return null
  }
}

function isDashScopeNativeChannel(channel: UpstreamChannel): boolean {
  const name = channel.name.toLowerCase()
  return (
    channel.type === DASHSCOPE_NATIVE_CHANNEL_TYPE ||
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
}: DashScopeNativePricingProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<PricingRow[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  const [syncRows, setSyncRows] = useState<SyncRow[]>([])

  useEffect(() => {
    const initialRows = pricingToRows(parsePricing(pricingDefault))
    setRows(initialRows)
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

      const errorResults = data.data.test_results.filter((result) => result.status === 'error')
      if (errorResults.length > 0) {
        toast.warning(errorResults.map((result) => `${result.name}: ${result.error}`).join(', '))
      }

      const nextRows: SyncRow[] = []
      for (const [model, fields] of Object.entries(data.data.differences)) {
        const diff = (fields as Record<string, RatioDifference>).dashscope_native_pricing
        if (!diff) continue
        for (const [source, upstreamValue] of Object.entries(diff.upstreams)) {
          const spec = parseSyncedSpec(upstreamValue)
          if (!spec) continue
          nextRows.push({
            model,
            current: formatSpec(diff.current as string | null),
            upstream: formatSpec(spec),
            source,
            spec,
          })
        }
      }

      setSyncRows(nextRows)
      if (nextRows.length === 0) {
        toast.success(t('No DashScope Native price differences found'))
      } else {
        toast.success(t('DashScope Native prices fetched successfully'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to fetch upstream prices'))
    },
  })

  const applySyncMutation = useMutation({
    mutationFn: async (nextPricing: Record<string, NativePricingSpec>) => {
      return updateSystemOption({
        key: OPTION_KEY,
        value: JSON.stringify(nextPricing),
      })
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('Prices synced successfully'))
        queryClient.invalidateQueries({ queryKey: ['system-options'] })
        setSyncRows([])
      } else {
        toast.error(data.message || t('Failed to sync prices'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to sync prices'))
    },
  })

  const updateRow = useCallback(
    (id: number, field: 'model' | 'unit' | 'price', value: string | number) => {
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? ({ ...row, [field]: value } as PricingRow) : row
        )
      )
    },
    []
  )

  const updateCondition = useCallback(
    (rowId: number, conditionId: number, field: 'key' | 'price', value: string | number) => {
      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                conditions: row.conditions.map((condition) =>
                  condition.id === conditionId
                    ? ({ ...condition, [field]: value } as ConditionRow)
                    : condition
                ),
              }
            : row
        )
      )
    },
    []
  )

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { id: getNextId(prev), model: '', unit: 'request', price: 0, conditions: [] },
    ])
  }, [])

  const removeRow = useCallback((id: number) => {
    setRows((prev) => prev.filter((row) => row.id !== id))
  }, [])

  const addCondition = useCallback((rowId: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              conditions: [
                ...row.conditions,
                { id: getNextId(row.conditions), key: '', price: row.price },
              ],
            }
          : row
      )
    )
  }, [])

  const removeCondition = useCallback((rowId: number, conditionId: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              conditions: row.conditions.filter((condition) => condition.id !== conditionId),
            }
          : row
      )
    )
  }, [])

  const handleSave = useCallback(async () => {
    await updateOption.mutateAsync({
      key: OPTION_KEY,
      value: JSON.stringify(currentPricing),
    })
  }, [currentPricing, updateOption])

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
    const merged = { ...currentPricing }
    for (const row of syncRows) {
      merged[row.model] = row.spec
    }
    applySyncMutation.mutate(merged)
  }, [applySyncMutation, currentPricing, syncRows])

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
              {t(
                'These prices are isolated to ChannelType 10001 and are not used by ordinary NewAPI model pricing.'
              )}
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
                  <TableHead className='w-[220px]'>{t('Billing unit')}</TableHead>
                  <TableHead className='w-[180px]'>{t('Base price')}</TableHead>
                  <TableHead>{t('Conditional prices')}</TableHead>
                  <TableHead className='w-[80px] text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className='text-muted-foreground py-8 text-center'>
                      {t('No DashScope Native pricing configured')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className='align-top'>
                      <TableCell>
                        <Input
                          value={row.model}
                          placeholder='cosyvoice-v3.5-plus'
                          onChange={(event) => updateRow(row.id, 'model', event.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          items={UNIT_OPTIONS.map((option) => ({
                            value: option.value,
                            label: t(option.label),
                          }))}
                          value={row.unit}
                          onValueChange={(value) =>
                            value !== null && updateRow(row.id, 'unit', value as NativeUnit)
                          }
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
                        <Input
                          type='number'
                          min={0}
                          step='0.000001'
                          value={row.price}
                          onChange={(event) => updateRow(row.id, 'price', Number(event.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className='space-y-2'>
                          {row.conditions.map((condition) => (
                            <div
                              key={condition.id}
                              className='grid gap-2 sm:grid-cols-[1fr_140px_32px]'
                            >
                              <Input
                                value={condition.key}
                                placeholder='duration=5,resolution=720P,ratio=16:9'
                                onChange={(event) =>
                                  updateCondition(row.id, condition.id, 'key', event.target.value)
                                }
                              />
                              <Input
                                type='number'
                                min={0}
                                step='0.000001'
                                value={condition.price}
                                onChange={(event) =>
                                  updateCondition(
                                    row.id,
                                    condition.id,
                                    'price',
                                    Number(event.target.value) || 0
                                  )
                                }
                              />
                              <Button
                                variant='ghost'
                                size='icon'
                                onClick={() => removeCondition(row.id, condition.id)}
                                aria-label={t('Delete')}
                              >
                                <Trash2 className='text-destructive h-4 w-4' />
                              </Button>
                            </div>
                          ))}
                          <Button variant='ghost' size='sm' onClick={() => addCondition(row.id)}>
                            <Plus className='mr-2 h-4 w-4' />
                            {t('Add condition price')}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={() => removeRow(row.id)}
                          aria-label={t('Delete')}
                        >
                          <Trash2 className='text-destructive h-4 w-4' />
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
              {t(
                'DashScope Native sync uses the dedicated dashscope_native endpoint and only writes the native pricing option.'
              )}
            </AlertDescription>
          </Alert>

          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Select
              items={nativeChannels.map((channel) => ({
                value: String(channel.id),
                label: channel.name,
              }))}
              value={selectedChannelId}
              onValueChange={(value) => value !== null && setSelectedChannelId(value)}
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
              disabled={syncRows.length === 0 || applySyncMutation.isPending}
            >
              <CheckSquare className='mr-2 h-4 w-4' />
              {t('Apply Sync')}
            </Button>
          </div>

          <div className='overflow-hidden rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Current')}</TableHead>
                  <TableHead>{t('Upstream')}</TableHead>
                  <TableHead>{t('Source')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='text-muted-foreground py-8 text-center'>
                      {nativeChannels.length === 0
                        ? t('No DashScope Native channels found')
                        : t('No DashScope Native price differences found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  syncRows.map((row) => (
                    <TableRow key={`${row.model}-${row.source}`}>
                      <TableCell className='font-mono text-sm'>{row.model}</TableCell>
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
'''


def write_component(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "models" / "dashscope-native-pricing.tsx"
    path.parent.mkdir(parents=True, exist_ok=True)
    template_path = Path(__file__).with_name("dashscope-native-pricing.tsx.template")
    component = template_path.read_text(encoding="utf-8") if template_path.exists() else COMPONENT
    write(path, component)


def patch_billing_registry(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "billing" / "section-registry.tsx"
    text = read(path)
    if "dashscope-native-pricing" not in text:
        if "import { DashScopeNativePricing } from '../models/dashscope-native-pricing'" not in text:
            text = text.replace(
                "import { RatioSettingsCard } from '../models/ratio-settings-card'\n",
                "import { DashScopeNativePricing } from '../models/dashscope-native-pricing'\n"
                "import { RatioSettingsCard } from '../models/ratio-settings-card'\n",
                1,
            )
        section = """  {
    id: 'dashscope-native-pricing',
    titleKey: 'Ali SDK / DashScope Native Pricing',
    descriptionKey: 'Configure pricing used only by Ali SDK / DashScope Native channels',
    build: (settings: BillingSettings) => (
      <DashScopeNativePricing
        pricingDefault={settings['billing_setting.dashscope_native_pricing']}
        toolPricesDefault={settings['tool_price_setting.prices']}
        billingModeDefault={settings['billing_setting.billing_mode']}
      />
    ),
  },
"""
        anchor = "  {\n    id: 'group-pricing',"
        if anchor not in text:
            raise SystemExit("DashScope Native pricing UI patch failed: billing section insert anchor not found")
        text = text.replace(anchor, section + anchor, 1)
    text = text.replace(
        "        toolPricesDefault={settings['tool_price_setting.prices']}\n"
        "        billingModeDefault={settings['billing_setting.billing_mode']}\n"
        "        visibleTabs={['models', 'tool-prices', 'upstream-sync']}\n",
        "        toolPricesDefault={settings['tool_price_setting.prices']}\n"
        "        visibleTabs={['models', 'tool-prices', 'upstream-sync']}\n",
        1,
    )
    dashscope_props = (
        "        pricingDefault={settings['billing_setting.dashscope_native_pricing']}\n"
        "        toolPricesDefault={settings['tool_price_setting.prices']}\n"
    )
    dashscope_props_with_mode = dashscope_props + "        billingModeDefault={settings['billing_setting.billing_mode']}\n"
    if "<DashScopeNativePricing" in text and dashscope_props_with_mode not in text:
        text = text.replace(
            dashscope_props,
            dashscope_props_with_mode,
            1,
        )
    write(path, text)


def patch_billing_defaults(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "billing" / "index.tsx"
    text = read(path)
    if "'billing_setting.dashscope_native_pricing':" not in text:
        text = text.replace(
            "  'billing_setting.billing_expr': '{}',\n",
            "  'billing_setting.billing_expr': '{}',\n"
            "  'billing_setting.dashscope_native_pricing': '{}',\n",
            1,
        )
    write(path, text)


def patch_types(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "types.ts"
    text = read(path)
    if "'billing_setting.dashscope_native_pricing': string" not in text:
        pattern = r"(export type BillingSettings = \{.*?  'billing_setting\.billing_expr': string\n)"
        text, count = re.subn(
            pattern,
            "\\1  'billing_setting.dashscope_native_pricing': string\n",
            text,
            count=1,
            flags=re.S,
        )
        if count != 1:
            raise SystemExit("DashScope Native pricing UI patch failed: BillingSettings type anchor not found")
    if "| 'dashscope_native_pricing'" not in text:
        ratio_anchor = "  | 'billing_expr'\n"
        if ratio_anchor not in text:
            raise SystemExit("DashScope Native pricing UI patch failed: RatioType anchor not found")
        text = text.replace(
            ratio_anchor,
            ratio_anchor + "  | 'dashscope_native_pricing'\n",
            1,
        )
    write(path, text)


def patch_locale(path: Path, translations: dict[str, str]) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    translation = data.setdefault("translation", {})
    if not isinstance(translation, dict):
        raise SystemExit(f"DashScope Native pricing UI patch failed: invalid locale {path}")
    changed = False
    missing: list[tuple[str, str]] = []
    for key, value in translations.items():
        key_json = json.dumps(key, ensure_ascii=False)
        value_json = json.dumps(value, ensure_ascii=False)
        if key in translation:
            if translation.get(key) == value:
                continue
            pattern = re.compile(rf'^(\s*){re.escape(key_json)}\s*:\s*.*?(,?)$', re.M)
            text, count = pattern.subn(rf'\1{key_json}: {value_json}\2', text, count=1)
            if count != 1:
                translation[key] = value
                text = json.dumps(data, ensure_ascii=False, indent=4) + "\n"
            changed = True
        else:
            missing.append((key_json, value_json))
            changed = True
    if missing:
        close_match = re.search(r'\n(\s*)}\s*\n}\s*$', text)
        if not close_match:
            translation.update({key: value for key, value in translations.items() if key not in translation})
            text = json.dumps(data, ensure_ascii=False, indent=4) + "\n"
        else:
            item_indent = " " * (len(close_match.group(1)) + 4)
            insertion = ",\n" + ",\n".join(
                f"{item_indent}{key_json}: {value_json}" for key_json, value_json in missing
            )
            text = text[:close_match.start()] + insertion + text[close_match.start():]
    if changed:
        path.write_text(text, encoding="utf-8")


def patch_static_keys(root: Path, keys: list[str]) -> None:
    path = root / "src" / "i18n" / "static-keys.ts"
    if not path.exists():
        return
    text = read(path)
    marker = "] as const"
    if marker not in text:
        return
    missing = [key for key in keys if f"'{key}'" not in text and f'"{key}"' not in text]
    if not missing:
        return
    insertion = "".join(f"  '{key}',\n" for key in missing)
    write(path, text.replace(marker, insertion + marker, 1))


def patch_i18n(root: Path) -> None:
    zh = {
        "Ali SDK / DashScope Native Pricing": "阿里 SDK / DashScope 原生定价",
        "Configure pricing used only by Ali SDK / DashScope Native channels": "配置仅阿里 SDK / DashScope 原生渠道使用的专用定价",
        "Native model prices": "原生模型价格",
        "These prices are isolated to Ali SDK / DashScope Native channels and are not used by ordinary NewAPI model pricing.": "这些价格只用于阿里 SDK / DashScope 原生渠道，不会参与普通 NewAPI 模型定价。",
        "Add model": "添加模型",
        "Save DashScope Native pricing": "保存 DashScope 原生定价",
        "Billing unit": "计费单位",
        "Price configuration": "价格配置",
        "Input price": "输入价格",
        "Output price": "输出价格",
        "Cache read price": "缓存读取价格",
        "Cache write price": "缓存写入价格",
        "Default price": "默认价格",
        "Resolution / quality": "分辨率 / 质量",
        "Add pricing condition": "添加条件价格",
        "Conditional prices": "条件价格",
        "No DashScope Native pricing configured": "尚未配置 DashScope 原生定价",
        "Characters": "字符",
        "Audio seconds": "音频秒",
        "Images": "图片张数",
        "Video seconds": "视频秒",
        "Video tasks": "视频任务",
        "Requests": "请求次数",
        "Input/output tokens": "输入/输出 Token",
        "DashScope Native sync uses the selected channel base URL to choose the built-in domestic or international official price catalog, then writes native pricing and billing mode together.": "DashScope 原生同步会根据所选渠道的 Base URL 选择内置的国内或国际官方价格目录，并同时写入原生定价和计费模式。",
        "Select DashScope Native channel": "选择 DashScope 原生渠道",
        "Fetch DashScope Native prices": "拉取 DashScope 原生价格",
        "No DashScope Native channels found": "没有找到 DashScope 原生渠道",
        "No DashScope Native price differences found": "没有 DashScope 原生价格差异",
        "DashScope Native prices fetched successfully": "DashScope 原生价格拉取成功",
        "Please select a DashScope Native channel": "请选择 DashScope 原生渠道",
    }
    en = {key: key for key in zh}
    patch_locale(root / "src" / "i18n" / "locales" / "zh.json", zh)
    patch_locale(root / "src" / "i18n" / "locales" / "en.json", en)
    patch_static_keys(root, list(zh.keys()))


def main() -> None:
    root = frontend_root()
    write_component(root)
    patch_billing_registry(root)
    patch_billing_defaults(root)
    patch_types(root)
    patch_i18n(root)
    print(f"applied DashScope Native graphical pricing UI patch for {FRONTEND}")


if __name__ == "__main__":
    main()
