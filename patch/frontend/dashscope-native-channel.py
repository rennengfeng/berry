#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"
NATIVE_ID = 10001
LEGACY_ID = 59
LABEL = "Ali SDK / DashScope Native"
NATIVE_ENDPOINT = "dashscope_native"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src" / "features" / "channels").exists():
        return PROJECT_ROOT
    raise SystemExit(f"DashScope Native frontend patch failed: missing frontend root {candidate}")


def patch_constants(root: Path) -> None:
    path = root / "src" / "features" / "channels" / "constants.ts"
    text = path.read_text(encoding="utf-8")
    text = text.replace(f"  {LEGACY_ID}: '{LABEL}',\n", f"  {NATIVE_ID}: '{LABEL}',\n")
    if f"  {NATIVE_ID}: '{LABEL}'," not in text:
        text, count = re.subn(
            r"(\n} as const)",
            f"\n  {NATIVE_ID}: '{LABEL}',\\1",
            text,
            count=1,
        )
        if count != 1:
            raise SystemExit("DashScope Native frontend patch failed: CHANNEL_TYPES anchor not found")

    order_pattern = r"(const CHANNEL_TYPE_DISPLAY_ORDER: number\[\] = \[)(.*?)(\n\])"
    match = re.search(order_pattern, text, flags=re.S)
    if not match:
        raise SystemExit("DashScope Native frontend patch failed: channel display order not found")
    order = [int(value) for value in re.findall(r"\d+", match.group(2))]
    order = [value for value in order if value not in {LEGACY_ID, NATIVE_ID}]
    try:
        ali_index = order.index(17) + 1
    except ValueError:
        ali_index = len(order)
    order.insert(ali_index, NATIVE_ID)
    replacement = match.group(1) + "\n  " + ", ".join(map(str, order)) + "," + match.group(3)
    text = text[:match.start()] + replacement + text[match.end():]

    fetch_pattern = r"(export const MODEL_FETCHABLE_TYPES = new Set\(\[)(.*?)(\n\]\))"
    match = re.search(fetch_pattern, text, flags=re.S)
    if match:
        fetchable = [int(value) for value in re.findall(r"\d+", match.group(2))]
        fetchable = [value for value in fetchable if value not in {LEGACY_ID, NATIVE_ID}]
        fetchable.append(NATIVE_ID)
        replacement = match.group(1) + "\n  " + ", ".join(map(str, fetchable)) + "," + match.group(3)
        text = text[:match.start()] + replacement + text[match.end():]

    path.write_text(text, encoding="utf-8")


def patch_locale(path: Path, key: str, value: str) -> None:
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    translation = data.setdefault("translation", {})
    if not isinstance(translation, dict):
        raise SystemExit(f"DashScope Native frontend patch failed: invalid translation namespace in {path}")
    if translation.get(key) != value:
        translation[key] = value
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_static_keys(root: Path) -> None:
    path = root / "src" / "i18n" / "static-keys.ts"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    if f"'{LABEL}'" in text or f'"{LABEL}"' in text:
        return
    marker = "] as const"
    if marker in text:
        text = text.replace(marker, f"  '{LABEL}',\n{marker}", 1)
        path.write_text(text, encoding="utf-8")


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"DashScope Native frontend patch failed: {label} matched {count} anchors in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def insert_after(path: Path, anchor: str, snippet: str, marker: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    if anchor not in text:
        raise SystemExit(f"DashScope Native frontend patch failed: {label} anchor not found in {path}")
    path.write_text(text.replace(anchor, anchor + snippet, 1), encoding="utf-8")


def patch_price_sync(root: Path) -> None:
    types_path = root / "src" / "features" / "system-settings" / "types.ts"
    if types_path.exists():
        insert_after(
            types_path,
            "  | 'billing_expr'\n",
            "  | 'dashscope_native_pricing'\n",
            "dashscope_native_pricing",
            "ratio type",
        )
        insert_after(
            types_path,
            "  endpoint: string\n",
            "  type?: number\n",
            "type?: number",
            "upstream config type",
        )

    constants_path = root / "src" / "features" / "system-settings" / "models" / "constants.ts"
    if constants_path.exists():
        insert_after(
            constants_path,
            "export const OPENROUTER_ENDPOINT = 'openrouter'\n",
            f"export const DASHSCOPE_NATIVE_ENDPOINT = '{NATIVE_ENDPOINT}'\n",
            "DASHSCOPE_NATIVE_ENDPOINT",
            "DashScope Native endpoint",
        )
        insert_after(
            constants_path,
            "export const OPENROUTER_CHANNEL_TYPE = 20\n",
            f"export const DASHSCOPE_NATIVE_CHANNEL_TYPE = {NATIVE_ID}\n",
            "DASHSCOPE_NATIVE_CHANNEL_TYPE",
            "DashScope Native channel type",
        )
        insert_after(
            constants_path,
            "  { label: 'OpenRouter', value: OPENROUTER_ENDPOINT },\n",
            "  { label: 'DashScope Native official prices', value: DASHSCOPE_NATIVE_ENDPOINT },\n",
            "DashScope Native official prices",
            "DashScope Native endpoint option",
        )
        insert_after(
            constants_path,
            "  { label: 'Expression billing', value: 'billing_expr' },\n",
            "  { label: 'DashScope Native pricing', value: 'dashscope_native_pricing' },\n",
            "DashScope Native pricing",
            "DashScope Native ratio option",
        )

    helpers_path = root / "src" / "features" / "system-settings" / "models" / "upstream-ratio-sync-helpers.ts"
    if helpers_path.exists():
        insert_after(
            helpers_path,
            "  'billing_expr',\n",
            "  'dashscope_native_pricing',\n",
            "dashscope_native_pricing",
            "DashScope Native sync field order",
        )

    sync_path = root / "src" / "features" / "system-settings" / "models" / "upstream-ratio-sync.tsx"
    if sync_path.exists():
        text = sync_path.read_text(encoding="utf-8")
        text = text.replace(
            "  DASHSCOPE_NATIVE_CHANNEL_TYPE,\n  DASHSCOPE_NATIVE_ENDPOINT,\n",
            "",
        )
        text = text.replace(
            "  DASHSCOPE_NATIVE_CHANNEL_TYPE,\n",
            "",
        )
        text = text.replace(
            "  if (channel.type === DASHSCOPE_NATIVE_CHANNEL_TYPE)\n    return DASHSCOPE_NATIVE_ENDPOINT\n",
            "",
        )
        text = text.replace(
            "      'billing_setting.dashscope_native_pricing': parseJsonRecord<unknown>(\n        modelRatios['billing_setting.dashscope_native_pricing']\n      ),\n",
            "",
        )
        sync_path.write_text(text, encoding="utf-8")
        insert_after(
            sync_path,
            "import {\n  DEFAULT_ENDPOINT,\n",
            "  DASHSCOPE_NATIVE_CHANNEL_TYPE,\n  DASHSCOPE_NATIVE_ENDPOINT,\n",
            "DASHSCOPE_NATIVE_CHANNEL_TYPE",
            "DashScope Native constants import",
        )
        insert_after(
            sync_path,
            "    'billing_setting.billing_expr': string\n",
            "    'billing_setting.dashscope_native_pricing': string\n",
            "dashscope_native_pricing': string",
            "DashScope Native modelRatios prop",
        )
        replace_once(
            sync_path,
            "  if (ratioType === 'model_price' || ratioType === 'billing_unit')\n    return 'price'\n",
            "  if (\n    ratioType === 'model_price' ||\n    ratioType === 'billing_unit' ||\n    ratioType === 'dashscope_native_pricing'\n  )\n    return 'price'\n",
            "DashScope Native billing category",
        )
        insert_after(
            sync_path,
            "  if (channel.id === OFFICIAL_CHANNEL_ID) return OFFICIAL_CHANNEL_ENDPOINT\n",
            "  if (channel.type === DASHSCOPE_NATIVE_CHANNEL_TYPE)\n    return DASHSCOPE_NATIVE_ENDPOINT\n",
            "return DASHSCOPE_NATIVE_ENDPOINT",
            "DashScope Native default endpoint",
        )
        insert_after(
            sync_path,
            "    billing_expr: 'billing_setting.billing_expr',\n",
            "    dashscope_native_pricing: 'billing_setting.dashscope_native_pricing',\n",
            "dashscope_native_pricing: 'billing_setting.dashscope_native_pricing'",
            "DashScope Native option key mapping",
        )
        insert_after(
            sync_path,
            "      endpoint: channelEndpoints[ch.id] || DEFAULT_ENDPOINT,\n",
            "      type: ch.type,\n",
            "type: ch.type",
            "send upstream channel type",
        )
        insert_after(
            sync_path,
            "        newModelRes[finalType] = finalValue\n",
            "        if (finalType === 'dashscope_native_pricing' && sourceName && modelDiffs) {\n          const modeVal = modelDiffs.billing_mode?.upstreams?.[sourceName]\n          newModelRes['billing_mode'] =\n            modeVal !== undefined && modeVal !== null && modeVal !== 'same'\n              ? modeVal\n              : 'dashscope_native'\n        }\n",
            "finalType === 'dashscope_native_pricing'",
            "DashScope Native selection mode",
        )
        insert_after(
            sync_path,
            "      ModelPrice: parseJsonRecord<number>(modelRatios.ModelPrice),\n",
            "      'billing_setting.dashscope_native_pricing': parseJsonRecord<\n        Record<string, unknown>\n      >(modelRatios['billing_setting.dashscope_native_pricing']),\n",
            "parseJsonRecord<\n        Record<string, unknown>\n      >(modelRatios['billing_setting.dashscope_native_pricing'])",
            "DashScope Native parsed ratios",
        )
        insert_after(
            sync_path,
            "    if (currentRatios.ModelPrice[model] !== undefined) return 'price'\n",
            "    if (\n      currentRatios['billing_setting.dashscope_native_pricing'][model] !==\n      undefined\n    )\n      return 'price'\n",
            "currentRatios['billing_setting.dashscope_native_pricing']",
            "DashScope Native local category",
        )
        text = sync_path.read_text(encoding="utf-8")
        text = text.replace(
            "const finalRatios: Record<string, Record<string, number | string>> = {",
            "const finalRatios: Record<string, Record<string, unknown>> = {",
        )
        text = text.replace(
            "const hasPrice = selectedTypes.includes('model_price')",
            "const hasPrice =\n          selectedTypes.includes('model_price') ||\n          selectedTypes.includes('dashscope_native_pricing')",
        )
        sync_path.write_text(text, encoding="utf-8")
        insert_after(
            sync_path,
            "        'billing_setting.billing_expr': {\n          ...currentRatios['billing_setting.billing_expr'],\n        },\n",
            "        'billing_setting.dashscope_native_pricing': {\n          ...currentRatios['billing_setting.dashscope_native_pricing'],\n        },\n",
            "'billing_setting.dashscope_native_pricing': {",
            "DashScope Native final ratios",
        )
        insert_after(
            sync_path,
            "          delete finalRatios.ModelPrice[model]\n",
            "          delete finalRatios['billing_setting.dashscope_native_pricing'][model]\n",
            "delete finalRatios['billing_setting.dashscope_native_pricing'][model]",
            "DashScope Native ratio conflict cleanup",
        )
        text = sync_path.read_text(encoding="utf-8")
        old = """          finalRatios[optionKey][model] = NUMERIC_SYNC_FIELDS.has(ratioType)
            ? Number(value)
            : value
"""
        if old in text and "ratioType === 'dashscope_native_pricing'" not in text[text.find(old) - 300 : text.find(old) + 300]:
            text = text.replace(
                old,
                """          if (ratioType === 'dashscope_native_pricing') {
            finalRatios[optionKey][model] =
              typeof value === 'string' ? JSON.parse(value) : value
            return
          }
          finalRatios[optionKey][model] = NUMERIC_SYNC_FIELDS.has(ratioType)
            ? Number(value)
            : value
""",
                1,
            )
        old_openrouter = """          finalRatios[optionKey][model] =
            NUMERIC_SYNC_FIELDS.has(ratioType)
              ? Number(value)
              : value
"""
        if old_openrouter in text and "ratioType === 'dashscope_native_pricing'" not in text[text.find(old_openrouter) - 300 : text.find(old_openrouter) + 300]:
            text = text.replace(
                old_openrouter,
                """          if (ratioType === 'dashscope_native_pricing') {
            finalRatios[optionKey][model] =
              typeof value === 'string' ? JSON.parse(value) : value
            return
          }
          finalRatios[optionKey][model] = NUMERIC_SYNC_FIELDS.has(ratioType)
            ? Number(value)
            : value
""",
                1,
            )
        sync_path.write_text(text, encoding="utf-8")

    selector_path = root / "src" / "features" / "system-settings" / "models" / "channel-selector-dialog.tsx"
    if selector_path.exists():
        insert_after(
            selector_path,
            "  CHANNEL_STATUS_CONFIG,\n",
            "  DASHSCOPE_NATIVE_CHANNEL_TYPE,\n",
            "DASHSCOPE_NATIVE_CHANNEL_TYPE",
            "DashScope Native selector import",
        )
        insert_after(
            selector_path,
            "function isOfficialChannel(channel: UpstreamChannel): boolean {\n  return (\n    channel.id === OFFICIAL_CHANNEL_ID || channel.id === MODELS_DEV_PRESET_ID\n  )\n}\n",
            "\nfunction isDashScopeNativeChannel(channel: UpstreamChannel): boolean {\n  return channel.type === DASHSCOPE_NATIVE_CHANNEL_TYPE\n}\n",
            "isDashScopeNativeChannel",
            "DashScope Native selector helper",
        )
        insert_after(
            selector_path,
            "          const isOfficial = isOfficialChannel(channel)\n",
            "          const isDashScopeNative = isDashScopeNativeChannel(channel)\n",
            "isDashScopeNative =",
            "DashScope Native selector flag",
        )
        insert_after(
            selector_path,
            "              {isOfficial && (\n                <StatusBadge\n                  label={t('Official')}\n                  variant='success'\n                  size='sm'\n                  copyable={false}\n                />\n              )}\n",
            "              {isDashScopeNative && (\n                <StatusBadge\n                  label={t('DashScope Native official prices')}\n                  variant='info'\n                  size='sm'\n                  copyable={false}\n                />\n              )}\n",
            "isDashScopeNative &&",
            "DashScope Native selector badge",
        )

    section_registry_path = root / "src" / "features" / "system-settings" / "billing" / "section-registry.tsx"
    if section_registry_path.exists():
        insert_after(
            section_registry_path,
            "  BillingExpr: settings['billing_setting.billing_expr'],\n",
            "  DashScopeNativePricing: settings['billing_setting.dashscope_native_pricing'],\n",
            "DashScopeNativePricing:",
            "DashScope Native model defaults",
        )

    ratio_card_path = root / "src" / "features" / "system-settings" / "models" / "ratio-settings-card.tsx"
    if ratio_card_path.exists():
        insert_after(
            ratio_card_path,
            """  BillingExpr: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
""",
            """  DashScopeNativePricing: z.string().superRefine((value, ctx) => {
    const result = validateJsonString(value)
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message || 'Invalid JSON',
      })
    }
  }),
""",
            "DashScopeNativePricing: z.string()",
            "DashScope Native form schema",
        )
        insert_after(
            ratio_card_path,
            "    BillingExpr: normalizeJsonString(modelDefaults.BillingExpr),\n",
            "    DashScopeNativePricing: normalizeJsonString(\n      modelDefaults.DashScopeNativePricing\n    ),\n",
            "DashScopeNativePricing: normalizeJsonString",
            "DashScope Native normalized defaults",
        )
        insert_after(
            ratio_card_path,
            "      BillingExpr: formatJsonForTextarea(modelDefaults.BillingExpr),\n",
            "      DashScopeNativePricing: formatJsonForTextarea(\n        modelDefaults.DashScopeNativePricing\n      ),\n",
            "DashScopeNativePricing: formatJsonForTextarea",
            "DashScope Native formatted defaults",
        )
        text = ratio_card_path.read_text(encoding="utf-8")
        norm_anchor = "    BillingExpr: normalizeJsonString(modelDefaults.BillingExpr),\n"
        norm_snippet = "    DashScopeNativePricing: normalizeJsonString(\n      modelDefaults.DashScopeNativePricing\n    ),\n"
        text = re.sub(
            re.escape(norm_anchor) + r"(?!\s*DashScopeNativePricing: normalizeJsonString)",
            norm_anchor + norm_snippet,
            text,
        )
        fmt_anchor = "      BillingExpr: formatJsonForTextarea(modelDefaults.BillingExpr),\n"
        fmt_snippet = "      DashScopeNativePricing: formatJsonForTextarea(\n        modelDefaults.DashScopeNativePricing\n      ),\n"
        text = re.sub(
            re.escape(fmt_anchor) + r"(?!\s*DashScopeNativePricing: formatJsonForTextarea)",
            fmt_anchor + fmt_snippet,
            text,
        )
        ratio_card_path.write_text(text, encoding="utf-8")
        insert_after(
            ratio_card_path,
            "          'billing_setting.billing_expr': modelDefaults.BillingExpr,\n",
            "          'billing_setting.dashscope_native_pricing':\n            modelDefaults.DashScopeNativePricing,\n",
            "'billing_setting.dashscope_native_pricing':",
            "DashScope Native upstream sync props",
        )
        insert_after(
            ratio_card_path,
            "        BillingExpr: normalizeJsonString(values.BillingExpr),\n",
            "        DashScopeNativePricing: normalizeJsonString(\n          values.DashScopeNativePricing\n        ),\n",
            "values.DashScopeNativePricing",
            "DashScope Native normalized save value",
        )
        insert_after(
            ratio_card_path,
            "        BillingExpr: 'billing_setting.billing_expr',\n",
            "        DashScopeNativePricing: 'billing_setting.dashscope_native_pricing',\n",
            "DashScopeNativePricing: 'billing_setting.dashscope_native_pricing'",
            "DashScope Native save api key",
        )

    model_ratio_form_path = root / "src" / "features" / "system-settings" / "models" / "model-ratio-form.tsx"
    if model_ratio_form_path.exists():
        insert_after(
            model_ratio_form_path,
            "  BillingExpr: string\n",
            "  DashScopeNativePricing: string\n",
            "DashScopeNativePricing: string",
            "DashScope Native model form type",
        )


def main() -> None:
    root = frontend_root()
    patch_constants(root)
    patch_price_sync(root)
    patch_locale(root / "src" / "i18n" / "locales" / "zh.json", LABEL, "阿里SDK / DashScope 原生协议")
    patch_locale(root / "src" / "i18n" / "locales" / "en.json", LABEL, LABEL)
    patch_locale(root / "src" / "i18n" / "locales" / "zh.json", "DashScope Native official prices", "DashScope Native 官方价格")
    patch_locale(root / "src" / "i18n" / "locales" / "en.json", "DashScope Native official prices", "DashScope Native official prices")
    patch_locale(root / "src" / "i18n" / "locales" / "zh.json", "DashScope Native pricing", "DashScope Native 价格规格")
    patch_locale(root / "src" / "i18n" / "locales" / "en.json", "DashScope Native pricing", "DashScope Native pricing")
    patch_static_keys(root)
    print(f"applied DashScope Native channel frontend patch for {FRONTEND}")


if __name__ == "__main__":
    main()
