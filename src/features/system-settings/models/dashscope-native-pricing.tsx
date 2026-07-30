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
