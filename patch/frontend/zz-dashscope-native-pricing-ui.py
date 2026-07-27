#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src" / "features" / "system-settings").exists():
        return PROJECT_ROOT
    raise SystemExit(f"DashScope pricing UI patch failed: missing frontend root {candidate}")


def patch_locale(path: Path, key: str, value: str) -> None:
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    translation = data.setdefault("translation", {})
    if not isinstance(translation, dict):
        raise SystemExit(f"DashScope pricing UI patch failed: invalid i18n file {path}")
    if translation.get(key) != value:
        translation[key] = value
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_section_registry(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "billing" / "section-registry.tsx"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r"(      <DashScopePricingSettings\n"
        r"        defaultValue=\{settings\['billing_setting\.dashscope_native_pricing'\]\}\n)"
        r"        billing" + r"ModeDefault=\{settings\['billing_setting\.billing_mode'\]\}\n"
        r"(      />)",
        r"\1\2",
        text,
    )
    text = text.replace(
        "titleKey: 'DashScope Native Pricing',\n"
        "    descriptionKey: 'Configure Ali SDK / DashScope Native official-unit pricing',",
        "titleKey: '阿里SDK专用定价',\n"
        "    descriptionKey: '配置 DashScope 原生协议模型的官方单位价格',",
    )
    path.write_text(text, encoding="utf-8")


def patch_setting_types(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "types.ts"
    if path.exists():
        text = path.read_text(encoding="utf-8")
        text = text.replace(
            "  'billing_setting.billing_expr': string\n  'tool_price_setting.prices': string\n",
            "  'billing_setting.billing_expr': string\n  'billing_setting.dashscope_native_pricing': string\n  'tool_price_setting.prices': string\n",
        )
        text = text.replace(
            "  'billing_setting.billing_expr': string\n  'tool_price_setting.prices': string\n",
            "  'billing_setting.billing_expr': string\n  'billing_setting.dashscope_native_pricing': string\n  'tool_price_setting.prices': string\n",
        )
        path.write_text(text, encoding="utf-8")

    for defaults_path in [
        root / "src" / "features" / "system-settings" / "billing" / "index.tsx",
        root / "src" / "features" / "system-settings" / "models" / "index.tsx",
        root / "src" / "features" / "models" / "components" / "drawers" / "model-mutate-drawer.tsx",
    ]:
        if defaults_path.exists():
            text = defaults_path.read_text(encoding="utf-8")
            text = text.replace(
                "  'billing_setting.billing_expr': '{}',\n  'tool_price_setting.prices': '{}',\n",
                "  'billing_setting.billing_expr': '{}',\n  'billing_setting.dashscope_native_pricing': '{}',\n  'tool_price_setting.prices': '{}',\n",
            )
            text = text.replace(
                "      'billing_setting.billing_expr': '{}',\n      'tool_price_setting.prices': '{}',\n",
                "      'billing_setting.billing_expr': '{}',\n      'billing_setting.dashscope_native_pricing': '{}',\n      'tool_price_setting.prices': '{}',\n",
            )
            defaults_path.write_text(text, encoding="utf-8")


def write_pricing_component(root: Path) -> None:
    path = root / "src" / "features" / "system-settings" / "models" / "dashscope-pricing-settings.tsx"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        r'''import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Save, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { useUpdateOption } from '../hooks/use-update-option'

const OPTION_KEY = 'billing_setting.dashscope_native_pricing'
const UNIT_OPTIONS = [
  { value: 'character', label: '按字符', hint: 'CosyVoice 等语音合成模型，按实际文本字符数计费。' },
  { value: 'audio_second', label: '按音频秒', hint: 'ASR 或音频处理模型，按音频时长秒数计费。' },
  { value: 'image', label: '按图片', hint: '生图模型，支持按分辨率或质量增加阶梯单价。' },
  { value: 'video_second', label: '按视频秒', hint: '视频生成模型，按 duration 秒数计费，支持 resolution|ratio 阶梯。' },
  { value: 'video_task', label: '按视频任务', hint: '异步视频任务，每提交一次任务计费。' },
  { value: 'request', label: '按请求', hint: '原生 REST 请求，每次调用固定计费。' },
  { value: 'token_input_output', label: '按输入/输出 Token', hint: '带 usage 的原生返回，分别配置输入与输出 token 单价。' },
] as const

type NativeUnit = (typeof UNIT_OPTIONS)[number]['value']

type TierRow = {
  id: string
  key: string
  price: string
}

type PricingRow = {
  id: string
  model: string
  unit: NativeUnit
  price: string
  inputPrice: string
  outputPrice: string
  tiers: TierRow[]
}

type DashScopePricingSettingsProps = {
  defaultValue: string
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function toText(value: unknown) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeUnit(value: unknown): NativeUnit {
  return UNIT_OPTIONS.some((item) => item.value === value)
    ? (value as NativeUnit)
    : 'character'
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  const text = (raw ?? '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parseRows(raw: string | undefined): PricingRow[] {
  const parsed = parseJsonObject(raw)
  return Object.entries(parsed).map(([model, value]) => {
    const spec =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
    const prices =
      spec.prices && typeof spec.prices === 'object' && !Array.isArray(spec.prices)
        ? (spec.prices as Record<string, unknown>)
        : {}
    return {
      id: createId(),
      model,
      unit: normalizeUnit(spec.unit),
      price: toText(spec.price),
      inputPrice: toText(spec.input_price),
      outputPrice: toText(spec.output_price),
      tiers: Object.entries(prices).map(([key, price]) => ({
        id: createId(),
        key,
        price: toText(price),
      })),
    }
  })
}

function serializeRows(rows: PricingRow[]) {
  const result: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    const model = row.model.trim()
    if (!model) continue
    const spec: Record<string, unknown> = { unit: row.unit }
    if (row.unit === 'token_input_output') {
      if (row.inputPrice.trim()) spec.input_price = toNumber(row.inputPrice)
      if (row.outputPrice.trim()) spec.output_price = toNumber(row.outputPrice)
    } else {
      if (row.price.trim()) spec.price = toNumber(row.price)
      const prices: Record<string, number> = {}
      for (const tier of row.tiers) {
        const key = tier.key.trim()
        if (!key) continue
        prices[key] = toNumber(tier.price)
      }
      if (Object.keys(prices).length > 0) spec.prices = prices
    }
    result[model] = spec
  }
  return result
}

function createDefaultRow(model = ''): PricingRow {
  return {
    id: createId(),
    model,
    unit: 'character',
    price: '',
    inputPrice: '',
    outputPrice: '',
    tiers: [],
  }
}

function cloneRow(row: PricingRow): PricingRow {
  return {
    ...row,
    tiers: row.tiers.map((tier) => ({ ...tier })),
  }
}

function getUnitLabel(unit: NativeUnit) {
  return UNIT_OPTIONS.find((item) => item.value === unit)?.label ?? '按字符'
}

function getUnitHint(unit: NativeUnit) {
  return UNIT_OPTIONS.find((item) => item.value === unit)?.hint ?? ''
}

function getPriceSummary(row: PricingRow) {
  if (row.unit === 'token_input_output') {
    const input = row.inputPrice.trim() || '0'
    const output = row.outputPrice.trim() || '0'
    return `输入 ${input} / 输出 ${output}`
  }
  const base = row.price.trim() ? `基础 ${row.price.trim()}` : '未设置基础价'
  if (row.tiers.length === 0) return base
  return `${base}，${row.tiers.length} 个阶梯`
}

function validateRows(rows: PricingRow[]) {
  const names = rows.map((row) => row.model.trim()).filter(Boolean)
  if (names.length !== rows.length) return '模型名称不能为空'
  if (names.length !== new Set(names).size) return '模型名称重复，请检查后再保存'

  for (const row of rows) {
    if (row.unit === 'token_input_output') {
      if (toNumber(row.inputPrice) <= 0 && toNumber(row.outputPrice) <= 0) {
        return `${row.model} 至少需要设置输入或输出 token 单价`
      }
      continue
    }

    const hasBase = toNumber(row.price) > 0
    const hasTier = row.tiers.some(
      (tier) => tier.key.trim() && toNumber(tier.price) > 0
    )
    if (!hasBase && !hasTier) {
      return `${row.model} 至少需要设置基础单价或阶梯单价`
    }
  }

  return ''
}

export function DashScopePricingSettings({
  defaultValue,
}: DashScopePricingSettingsProps) {
  const updateOption = useUpdateOption()
  const [rows, setRows] = useState<PricingRow[]>(() => parseRows(defaultValue))
  const [query, setQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PricingRow>(() => createDefaultRow())

  useEffect(() => {
    setRows(parseRows(defaultValue))
  }, [defaultValue])

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(
      (row) =>
        row.model.toLowerCase().includes(keyword) ||
        getUnitLabel(row.unit).toLowerCase().includes(keyword)
    )
  }, [query, rows])

  const openEditor = useCallback((row?: PricingRow) => {
    if (row) {
      setEditingId(row.id)
      setDraft(cloneRow(row))
    } else {
      setEditingId(null)
      setDraft(createDefaultRow())
    }
    setEditorOpen(true)
  }, [])

  const saveDraft = useCallback(() => {
    const model = draft.model.trim()
    if (!model) {
      toast.error('模型名称不能为空')
      return
    }
    const duplicate = rows.some(
      (row) => row.id !== editingId && row.model.trim() === model
    )
    if (duplicate) {
      toast.error('模型名称重复，请检查后再保存')
      return
    }
    const nextDraft = { ...draft, model }
    setRows((current) =>
      editingId
        ? current.map((row) => (row.id === editingId ? cloneRow(nextDraft) : row))
        : [...current, cloneRow(nextDraft)]
    )
    setEditorOpen(false)
  }, [draft, editingId, rows])

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id))
  }, [])

  const saveAll = useCallback(async () => {
    const error = validateRows(rows)
    if (error) {
      toast.error(error)
      return
    }

    const payload = serializeRows(rows)
    await updateOption.mutateAsync({
      key: OPTION_KEY,
      value: JSON.stringify(payload, null, 2),
    })
    toast.success('阿里SDK专用定价已保存')
  }, [rows, updateOption])

  const updateDraft = useCallback((patch: Partial<PricingRow>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const updateTier = useCallback((id: string, patch: Partial<TierRow>) => {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier) =>
        tier.id === id ? { ...tier, ...patch } : tier
      ),
    }))
  }, [])

  const addTier = useCallback(() => {
    setDraft((current) => ({
      ...current,
      tiers: [
        ...current.tiers,
        {
          id: createId(),
          key: current.unit === 'video_second' ? '720p|16:9' : 'default',
          price: '',
        },
      ],
    }))
  }, [])

  const removeTier = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.filter((tier) => tier.id !== id),
    }))
  }, [])

  return (
    <SettingsSection
      title='阿里SDK专用定价'
      description='为 DashScope 原生协议模型配置官方单位价格；兼容格式模型继续使用 NewAPI 原有模型定价。'
    >
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='relative min-w-[240px] flex-1'>
            <Search className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4' />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='搜索模型或计费方式'
              className='pl-8'
            />
          </div>
          <div className='flex gap-2'>
            <Button type='button' variant='outline' onClick={() => openEditor(createDefaultRow('cosyvoice-v3.5-plus'))}>
              添加 CosyVoice
            </Button>
            <Button type='button' onClick={() => openEditor()}>
              <Plus data-icon='inline-start' />
              添加模型
            </Button>
          </div>
        </div>

        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                <TableHead>计费方式</TableHead>
                <TableHead>价格摘要</TableHead>
                <TableHead className='w-[120px] text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className='text-muted-foreground h-24 text-center'>
                    暂无阿里SDK专用定价
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className='font-medium'>{row.model}</TableCell>
                    <TableCell>
                      <Badge variant='secondary'>{getUnitLabel(row.unit)}</Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{getPriceSummary(row)}</TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-1'>
                        <Button type='button' variant='ghost' size='icon' onClick={() => openEditor(row)}>
                          <Pencil className='h-4 w-4' />
                        </Button>
                        <Button type='button' variant='ghost' size='icon' onClick={() => removeRow(row.id)}>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className='flex justify-end'>
          <Button onClick={saveAll} disabled={updateOption.isPending}>
            <Save data-icon='inline-start' />
            {updateOption.isPending ? '保存中...' : '保存阿里SDK专用定价'}
          </Button>
        </div>

        <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
          <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-2xl'>
            <SheetHeader>
              <SheetTitle>{editingId ? '编辑模型定价' : '添加模型定价'}</SheetTitle>
              <SheetDescription>{draft.model || 'DashScope 原生协议模型'}</SheetDescription>
            </SheetHeader>

            <div className='space-y-5 py-4'>
              <div className='space-y-2'>
                <div className='text-sm font-medium'>模型名称</div>
                <Input
                  value={draft.model}
                  onChange={(event) => updateDraft({ model: event.target.value })}
                  placeholder='happyhorse-1.1-r2v'
                />
              </div>

              <Tabs
                value={draft.unit}
                onValueChange={(value) =>
                  updateDraft({
                    unit: value as NativeUnit,
                    tiers: value === 'token_input_output' ? [] : draft.tiers,
                  })
                }
              >
                <TabsList className='grid h-auto w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7'>
                  {UNIT_OPTIONS.map((option) => (
                    <TabsTrigger key={option.value} value={option.value} className='text-xs'>
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {UNIT_OPTIONS.map((option) => (
                  <TabsContent key={option.value} value={option.value} className='space-y-4'>
                    <div className='text-muted-foreground text-sm'>
                      {getUnitHint(option.value)}
                    </div>

                    {option.value === 'token_input_output' ? (
                      <div className='grid gap-3 sm:grid-cols-2'>
                        <div className='space-y-2'>
                          <div className='text-sm font-medium'>输入 token 单价</div>
                          <Input
                            value={draft.inputPrice}
                            onChange={(event) => updateDraft({ inputPrice: event.target.value })}
                            inputMode='decimal'
                            placeholder='0.000001'
                          />
                        </div>
                        <div className='space-y-2'>
                          <div className='text-sm font-medium'>输出 token 单价</div>
                          <Input
                            value={draft.outputPrice}
                            onChange={(event) => updateDraft({ outputPrice: event.target.value })}
                            inputMode='decimal'
                            placeholder='0.000002'
                          />
                        </div>
                      </div>
                    ) : (
                      <div className='space-y-4'>
                        <div className='space-y-2'>
                          <div className='text-sm font-medium'>基础单价</div>
                          <Input
                            value={draft.price}
                            onChange={(event) => updateDraft({ price: event.target.value })}
                            inputMode='decimal'
                            placeholder='美元单价，例如 0.000022'
                          />
                        </div>

                        <div className='space-y-3'>
                          <div className='flex items-center justify-between gap-2'>
                            <div className='text-sm font-medium'>阶梯单价</div>
                            <Button type='button' variant='outline' size='sm' onClick={addTier}>
                              <Plus data-icon='inline-start' />
                              添加阶梯
                            </Button>
                          </div>
                          {draft.tiers.length === 0 ? (
                            <div className='text-muted-foreground rounded-md border border-dashed p-3 text-sm'>
                              可选。视频建议使用 720p|16:9、720p、default；图片可使用分辨率或质量作为匹配键。
                            </div>
                          ) : (
                            draft.tiers.map((tier) => (
                              <div key={tier.id} className='grid gap-2 sm:grid-cols-[minmax(160px,1fr)_180px_auto]'>
                                <Input
                                  value={tier.key}
                                  onChange={(event) => updateTier(tier.id, { key: event.target.value })}
                                  placeholder='720p|16:9、720p、default'
                                />
                                <Input
                                  value={tier.price}
                                  onChange={(event) => updateTier(tier.id, { price: event.target.value })}
                                  inputMode='decimal'
                                  placeholder='美元单价'
                                />
                                <Button type='button' variant='ghost' size='icon' onClick={() => removeTier(tier.id)}>
                                  <Trash2 className='h-4 w-4' />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            <SheetFooter>
              <Button type='button' variant='outline' onClick={() => setEditorOpen(false)}>
                取消
              </Button>
              <Button type='button' onClick={saveDraft}>
                保存到列表
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </SettingsSection>
  )
}
''',
        encoding="utf-8",
    )


def main() -> None:
    root = frontend_root()
    patch_section_registry(root)
    patch_setting_types(root)
    write_pricing_component(root)
    patch_locale(root / "src" / "i18n" / "locales" / "zh.json", "阿里SDK专用定价", "阿里SDK专用定价")
    patch_locale(root / "src" / "i18n" / "locales" / "en.json", "阿里SDK专用定价", "Ali SDK pricing")
    print(f"applied DashScope Native graphical pricing UI patch for {FRONTEND}")


if __name__ == "__main__":
    main()
