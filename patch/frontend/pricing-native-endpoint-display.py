#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src" / "features" / "pricing").exists():
        return PROJECT_ROOT
    raise SystemExit(f"pricing native endpoint display patch failed: missing frontend root {candidate}")


ROOT = frontend_root()


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"pricing native endpoint display patch failed: missing {path}")
    return path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def patch_types() -> None:
    rel = "src/features/pricing/types.ts"
    text = read(rel)
    if "dashscope_native_pricing?: DashScopeNativePricing" not in text:
        anchor = "  /** Raw expression describing dynamic / tiered billing */\n  billing_expr?: string\n"
        insert = anchor + "  /** DashScope Native dedicated pricing for Ali SDK / native protocol models */\n  dashscope_native_pricing?: DashScopeNativePricing\n"
        if anchor not in text:
            raise SystemExit("pricing native endpoint display patch failed: pricing type billing_expr anchor not found")
        text = text.replace(anchor, insert, 1)
    if "export type DashScopeNativePricing =" not in text:
        anchor = "export type BillingUnit = 'request' | 'second' | 'image'\n"
        insert = anchor + """export type DashScopeNativePricingUnit =
  | 'request'
  | 'image'
  | 'video_second'
  | 'audio_second'
  | 'character'
  | 'video_task'
  | 'token_input_output'
  | string
export type DashScopeNativePricing = {
  unit: DashScopeNativePricingUnit
  price?: number
  prices?: Record<string, number>
  input_price?: number
  output_price?: number
  cache_read_price?: number
  cache_write_price?: number
}
"""
        if anchor not in text:
            raise SystemExit("pricing native endpoint display patch failed: BillingUnit anchor not found")
        text = text.replace(anchor, insert, 1)
    write(rel, text)


def patch_price_lib() -> None:
    rel = "src/features/pricing/lib/price.ts"
    text = read(rel)
    if "export function isDashScopeNativePricingModel(" not in text:
        anchor = "export function getFixedBillingTypeLabelKey(model: PricingModel): string {\n"
        pos = text.find(anchor)
        if pos < 0:
            raise SystemExit("pricing native endpoint display patch failed: price helper anchor not found")
        end = text.find("\n}\n", pos)
        if end < 0:
            raise SystemExit("pricing native endpoint display patch failed: price helper end not found")
        end += len("\n}\n")
        helper = r"""
export function isDashScopeNativePricingModel(model: PricingModel): boolean {
  return (
    model.billing_mode === 'dashscope_native' &&
    Boolean(model.dashscope_native_pricing)
  )
}

export function getDashScopeNativeUnitLabel(unit?: string): string {
  switch ((unit || '').trim()) {
    case 'token_input_output':
      return 'per 1M tokens'
    case 'image':
      return 'per image'
    case 'video_second':
      return 'per video second'
    case 'audio_second':
      return 'per audio second'
    case 'character':
      return 'per character'
    case 'video_task':
      return 'per video task'
    default:
      return 'per request'
  }
}

export function formatDashScopeNativePriceValue(
  price: number | undefined,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1
): string {
  if (price === undefined || price === null || !Number.isFinite(Number(price))) {
    return '-'
  }

  const adjusted = applyRechargeRate(
    Number(price),
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatCurrencyFromUSD(adjusted, {
    digitsLarge: 4,
    digitsSmall: 6,
    abbreviate: false,
  })
}

export function getDashScopeNativePrimaryPriceLabel(model: PricingModel): string {
  const spec = model.dashscope_native_pricing
  if (!spec) return '-'
  if (spec.unit === 'token_input_output') {
    return formatDashScopeNativePriceValue(spec.input_price)
  }
  if (spec.price !== undefined) {
    return formatDashScopeNativePriceValue(spec.price)
  }
  const prices = Object.entries(spec.prices || {})
  if (prices.length === 0) return '-'
  const [, minPrice] = prices.reduce((best, current) =>
    Number(current[1]) < Number(best[1]) ? current : best
  )
  return formatDashScopeNativePriceValue(minPrice)
}

"""
        text = text[:end] + helper + text[end:]
    write(rel, text)


def patch_online_chat() -> None:
    rel = "src/features/frontend-portal/online-chat.tsx"
    text = read(rel)
    old = """function getModelCapability(model: ModelOption): ChatMode | 'video' | 'audio' {
  const name = model.value.toLowerCase()
  const endpoints = (model.endpoints ?? []).join(' ').toLowerCase()
  const haystack = `${name} ${endpoints}`
"""
    new = """function getModelCapability(model: ModelOption): ChatMode | 'video' | 'audio' {
  const name = model.value.toLowerCase()
  const endpointList = (model.endpoints ?? []).map((item) => item.toLowerCase())

  if (endpointList.length > 0) {
    if (endpointList.includes('image-generation')) return 'image'
    if (endpointList.some((item) => item.includes('video'))) return 'video'
    if (endpointList.some((item) => /(audio|speech|tts|asr)/i.test(item))) return 'audio'
  }

  const haystack = name
"""
    if old in text:
        text = text.replace(old, new, 1)
    elif "const endpointList = (model.endpoints ?? []).map" not in text:
        raise SystemExit("pricing native endpoint display patch failed: getModelCapability anchor not found")
    text = text.replace(
        "    if (endpointList.some((item) => ['openai', 'openai-response', 'openai-response-compact', 'gemini', 'anthropic'].includes(item))) {\n      return 'chat'\n    }\n",
        "",
        1,
    )
    if "if (endpointList.some((item) => ['openai', 'openai-response', 'openai-response-compact', 'gemini', 'anthropic'].includes(item)))" not in text:
        text = text.replace(
            "  if (/(^|[/_\\s-])(image|images|text2image|image2image)([/_\\s-]|$)/i.test(haystack) || /(qwen-image|gpt-image|dall-e|imagen|flux|midjourney|stable-diffusion)/i.test(haystack)) {\n    return 'image'\n  }\n  return 'chat'\n",
            "  if (/(^|[/_\\s-])(image|images|text2image|image2image)([/_\\s-]|$)/i.test(haystack) || /(qwen-image|gpt-image|dall-e|imagen|flux|midjourney|stable-diffusion)/i.test(haystack)) {\n    return 'image'\n  }\n  if (endpointList.some((item) => ['openai', 'openai-response', 'openai-response-compact', 'gemini', 'anthropic'].includes(item))) {\n    return 'chat'\n  }\n  return 'chat'\n",
            1,
        )
    write(rel, text)


def patch_model_card() -> None:
    rel = "src/features/pricing/components/model-card.tsx"
    text = read(rel)
    if "getDashScopeNativePrimaryPriceLabel" not in text:
        text = text.replace(
            "  formatPrice,\n",
            "  formatPrice,\n  getDashScopeNativePrimaryPriceLabel,\n  getDashScopeNativeUnitLabel,\n",
            1,
        )
        text = text.replace(
            "  getFixedBillingUnitLabelKey,\n",
            "  getFixedBillingUnitLabelKey,\n  isDashScopeNativePricingModel,\n",
            1,
        )
    if "const isNativePricing = isDashScopeNativePricingModel(props.model)" not in text:
        text = text.replace(
            "  const isDynamicPricing =\n    props.model.billing_mode === 'tiered_expr' &&\n    Boolean(props.model.billing_expr)\n",
            "  const isDynamicPricing =\n    props.model.billing_mode === 'tiered_expr' &&\n    Boolean(props.model.billing_expr)\n  const isNativePricing = isDashScopeNativePricingModel(props.model)\n",
            1,
        )
    if ") : isNativePricing ? (" not in text:
        text = text.replace(
            "              ) : isTokenBased ? (\n",
            "              ) : isNativePricing ? (\n                <span className='text-muted-foreground whitespace-nowrap'>\n                  {t('DashScope Native')}{' '}\n                  <span className='text-foreground font-mono font-semibold'>\n                    {getDashScopeNativePrimaryPriceLabel(props.model)}\n                  </span>\n                  /{t(getDashScopeNativeUnitLabel(props.model.dashscope_native_pricing?.unit))}\n                </span>\n              ) : isTokenBased ? (\n",
            1,
        )
    write(rel, text)


def patch_pricing_columns() -> None:
    rel = "src/features/pricing/components/pricing-columns.tsx"
    text = read(rel)
    if "formatDashScopeNativePriceValue" not in text:
        text = text.replace(
            "  formatPrice,\n",
            "  formatPrice,\n  formatDashScopeNativePriceValue,\n",
            1,
        )
        text = text.replace(
            "  formatRequestPrice,\n",
            "  formatRequestPrice,\n  getDashScopeNativeUnitLabel,\n",
            1,
        )
        text = text.replace(
            "  getFixedBillingUnitLabelKey,\n",
            "  getFixedBillingUnitLabelKey,\n  isDashScopeNativePricingModel,\n",
            1,
        )
    if "if (isDashScopeNativePricingModel(model))" not in text:
        anchor = "        const isTokenBased = isTokenBasedModel(model)\n"
        block = r"""        if (isDashScopeNativePricingModel(model)) {
          const spec = model.dashscope_native_pricing
          const prices = Object.entries(spec?.prices || {})
          const primaryPrice =
            spec?.unit === 'token_input_output'
              ? spec.input_price
              : spec?.price !== undefined
                ? spec.price
                : prices.length > 0
                  ? prices.reduce((best, current) =>
                      Number(current[1]) < Number(best[1]) ? current : best
                    )[1]
                  : undefined
          const price = stripTrailingZeros(
            formatDashScopeNativePriceValue(
              primaryPrice,
              showRechargePrice,
              priceRate,
              usdExchangeRate
            )
          )

          return (
            <div className='min-w-[130px]'>
              <span className='font-mono text-sm tabular-nums'>{price}</span>
              <div className='text-muted-foreground/50 text-[10px]'>
                / {t(getDashScopeNativeUnitLabel(spec?.unit))}
              </div>
            </div>
          )
        }

"""
        if anchor not in text:
            raise SystemExit("pricing native endpoint display patch failed: pricing column token anchor not found")
        text = text.replace(anchor, block + anchor, 1)
    write(rel, text)


def patch_model_details() -> None:
    rel = "src/features/pricing/components/model-details.tsx"
    text = read(rel)
    if "formatDashScopeNativePriceValue" not in text:
        text = text.replace(
            "  formatFixedPrice,\n",
            "  formatFixedPrice,\n  formatDashScopeNativePriceValue,\n",
            1,
        )
        text = text.replace(
            "  formatGroupPrice,\n",
            "  formatGroupPrice,\n  getDashScopeNativeUnitLabel,\n",
            1,
        )
        text = text.replace(
            "  getFixedBillingUnitLabelKey,\n",
            "  getFixedBillingUnitLabelKey,\n  isDashScopeNativePricingModel,\n",
            1,
        )
    if "const conditionPrices = Object.entries(spec?.prices || {}).sort" not in text:
        marker = "  const primaryPriceTypes: { label: string; type: PriceType }[] = [\n"
        block = r"""  if (isDashScopeNativePricingModel(props.model)) {
    const spec = props.model.dashscope_native_pricing
    const unitLabel = getDashScopeNativeUnitLabel(spec?.unit)
    const conditionPrices = Object.entries(spec?.prices || {}).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    const tokenEntries = [
      { label: t('Input'), value: spec?.input_price },
      { label: t('Output'), value: spec?.output_price },
      { label: t('Cache Read'), value: spec?.cache_read_price },
      { label: t('Cache Write'), value: spec?.cache_write_price },
    ].filter((entry) => entry.value !== undefined)

    return (
      <section>
        <SectionTitle>{t('Base Price')}</SectionTitle>
        {spec?.unit === 'token_input_output' ? (
          <div className='grid grid-cols-2 gap-2'>
            {tokenEntries.map((entry) => (
              <div key={entry.label} className='bg-muted/20 rounded-lg border p-3'>
                <div className='text-muted-foreground text-xs'>{entry.label}</div>
                <div className='text-foreground mt-1 font-mono text-base font-semibold tabular-nums'>
                  {formatDashScopeNativePriceValue(
                    entry.value,
                    props.showRechargePrice,
                    props.priceRate,
                    props.usdExchangeRate
                  )}
                  <span className='text-muted-foreground/40 ml-1 text-xs font-normal'>
                    / {t(unitLabel)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : conditionPrices.length > 0 ? (
          <div className='bg-muted/20 rounded-lg border px-3 py-2.5'>
            <div className='space-y-1.5'>
              {conditionPrices.map(([condition, price]) => (
                <div
                  key={condition}
                  className='flex items-baseline justify-between gap-4'
                >
                  <span className='text-muted-foreground/70 text-sm'>
                    {condition}
                  </span>
                  <span className='text-muted-foreground font-mono text-sm tabular-nums'>
                    {formatDashScopeNativePriceValue(
                      price,
                      props.showRechargePrice,
                      props.priceRate,
                      props.usdExchangeRate
                    )}
                    <span className='text-muted-foreground/40 ml-1 text-xs font-normal'>
                      / {t(unitLabel)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className='flex items-baseline justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('DashScope Native')}
            </span>
            <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
              {formatDashScopeNativePriceValue(
                spec?.price,
                props.showRechargePrice,
                props.priceRate,
                props.usdExchangeRate
              )}
              <span className='text-muted-foreground/40 ml-1 text-xs font-normal'>
                / {t(unitLabel)}
              </span>
            </span>
          </div>
        )}
      </section>
    )
  }

"""
        if marker not in text:
            raise SystemExit("pricing native endpoint display patch failed: PriceSection marker not found")
        text = text.replace(marker, block + marker, 1)
    if "const tokenFields = [" not in text:
        marker = "  if (isDynamicPricingModel(props.model)) {\n"
        block = r"""  if (isDashScopeNativePricingModel(props.model)) {
    const spec = props.model.dashscope_native_pricing
    const unitLabel = getDashScopeNativeUnitLabel(spec?.unit)
    const conditionPrices = Object.entries(spec?.prices || {}).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    const tokenFields = [
      { label: t('Input'), value: spec?.input_price },
      { label: t('Output'), value: spec?.output_price },
      { label: t('Cache Read'), value: spec?.cache_read_price },
      { label: t('Cache Write'), value: spec?.cache_write_price },
    ].filter((entry) => entry.value !== undefined)

    return (
      <section>
        <SectionTitle>{t('Pricing by Group')}</SectionTitle>
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <div className='-mx-4 overflow-x-auto sm:mx-0'>
          <Table className='text-sm'>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead className={thClass}>{t('Group')}</TableHead>
                <TableHead className={thClass}>{t('Ratio')}</TableHead>
                {spec?.unit === 'token_input_output' ? (
                  tokenFields.map((field) => (
                    <TableHead
                      key={field.label}
                      className={`${thClass} text-right`}
                    >
                      {field.label}
                    </TableHead>
                  ))
                ) : conditionPrices.length > 0 ? (
                  conditionPrices.map(([condition]) => (
                    <TableHead
                      key={condition}
                      className={`${thClass} text-right`}
                    >
                      {condition}
                    </TableHead>
                  ))
                ) : (
                  <TableHead className={`${thClass} text-right`}>
                    {t('Price')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {availableGroups.map((group) => {
                const ratio = props.groupRatio[group] || 1
                const renderNative = (price?: number) =>
                  formatDashScopeNativePriceValue(
                    price === undefined ? undefined : Number(price) * ratio,
                    showRechargePrice,
                    props.priceRate,
                    props.usdExchangeRate
                  )

                return (
                  <TableRow key={group}>
                    <TableCell className='py-2.5'>
                      <GroupBadge group={group} size='sm' />
                    </TableCell>
                    <TableCell className='text-muted-foreground py-2.5 font-mono text-xs'>
                      {ratio}x
                    </TableCell>
                    {spec?.unit === 'token_input_output' ? (
                      tokenFields.map((field) => (
                        <TableCell
                          key={field.label}
                          className='py-2.5 text-right font-mono'
                        >
                          {renderNative(field.value)}
                        </TableCell>
                      ))
                    ) : conditionPrices.length > 0 ? (
                      conditionPrices.map(([condition, price]) => (
                        <TableCell
                          key={condition}
                          className='py-2.5 text-right font-mono'
                        >
                          {renderNative(price)}
                        </TableCell>
                      ))
                    ) : (
                      <TableCell className='py-2.5 text-right font-mono'>
                        {renderNative(spec?.price)}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className='text-muted-foreground/40 mt-1.5 px-4 text-[10px] sm:px-0'>
            {t('Prices shown')} / {t(unitLabel)}
          </p>
        </div>
      </section>
    )
  }

"""
        if marker not in text:
            raise SystemExit("pricing native endpoint display patch failed: GroupPricingSection marker not found")
        text = text.replace(marker, block + marker, 1)
    write(rel, text)


def main() -> None:
    patch_types()
    patch_price_lib()
    patch_online_chat()
    patch_model_card()
    patch_pricing_columns()
    patch_model_details()
    print("applied pricing native endpoint display frontend patch")


if __name__ == "__main__":
    main()
