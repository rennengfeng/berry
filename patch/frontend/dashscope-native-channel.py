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
            "  | 'dashscope_native_pricing'\n",
            "ratio type",
        )
        insert_after(
            types_path,
            "  endpoint: string\n",
            "  type?: number\n",
            "type?: number",
            "upstream config type",
        )
        text = types_path.read_text(encoding="utf-8")
        text = text.replace(
            "  current: number | string | null\n  upstreams: Record<string, number | string | 'same'>\n",
            "  current: number | string | Record<string, unknown> | null\n  upstreams: Record<string, number | string | Record<string, unknown> | 'same'>\n",
        )
        types_path.write_text(text, encoding="utf-8")

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
        text = helpers_path.read_text(encoding="utf-8")
        if "export type SyncValue" not in text:
            text = text.replace(
                "import { RATIO_TYPE_OPTIONS } from './constants'\n\n",
                "import { RATIO_TYPE_OPTIONS } from './constants'\n\nexport type SyncValue = number | string | Record<string, unknown>\n\n",
            )
        text = text.replace(
            "  current: number | string | null\n  upstreams: Record<string, number | string | 'same'>\n",
            "  current: SyncValue | null\n  upstreams: Record<string, SyncValue | 'same'>\n",
        )
        text = text.replace(
            "  current: number | string | Record<string, unknown> | null\n  upstreams: Record<string, number | string | Record<string, unknown> | 'same'>\n",
            "  current: SyncValue | null\n  upstreams: Record<string, SyncValue | 'same'>\n",
        )
        text = text.replace(
            "export type ResolutionsMap = Record<\n  string,\n  Record<string, number | string>\n>",
            "export type ResolutionsMap = Record<\n  string,\n  Record<string, number | string | Record<string, unknown>>\n>",
        )
        text = text.replace(
            "export type ResolutionsMap = Record<\n  string,\n  Record<string, number | string | Record<string, unknown>>\n>",
            "export type ResolutionsMap = Record<string, Record<string, SyncValue>>",
        )
        text = text.replace(
            "export type ResolutionsMap = Record<string, Record<string, number | string>>",
            "export type ResolutionsMap = Record<string, Record<string, SyncValue>>",
        )
        text = text.replace(
            "  value: number | string | 'same' | null | undefined\n",
            "  value: SyncValue | 'same' | null | undefined\n",
        )
        if "export function formatSyncValue" not in text:
            text += r'''

export function formatSyncValue(value: SyncValue | 'same' | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function syncValueEquals(
  left: SyncValue | 'same' | null | undefined,
  right: SyncValue | 'same' | null | undefined
): boolean {
  return formatSyncValue(left) === formatSyncValue(right)
}
'''
        helpers_path.write_text(text, encoding="utf-8")
        insert_after(
            helpers_path,
            "  'billing_expr',\n",
            "  'dashscope_native_pricing',\n",
            "dashscope_native_pricing",
            "DashScope Native sync field order",
        )

    columns_path = root / "src" / "features" / "system-settings" / "models" / "upstream-ratio-sync-columns.tsx"
    if columns_path.exists():
        text = columns_path.read_text(encoding="utf-8")
        text = re.sub(r"\ntype SyncValue = number \| string(?: \| Record<string, unknown>)?\n", "\n", text)
        text = re.sub(
            r"\nfunction syncValuesEqual\(a: unknown, b: unknown\): boolean \{\n"
            r"  if \(a === b\) return true\n"
            r"  if \(typeof a === 'object' && typeof b === 'object' && a && b\) \{\n"
            r"    return JSON\.stringify\(a\) === JSON\.stringify\(b\)\n"
            r"  \}\n"
            r"  return false\n"
            r"\}\n",
            "\n",
            text,
        )
        if "formatSyncValue," not in text:
            text = text.replace(
                "  getOrderedRatioTypes,\n",
                "  formatSyncValue,\n  getOrderedRatioTypes,\n",
            )
        if "syncValueEquals," not in text:
            text = text.replace(
                "  isSelectableUpstreamValue,\n",
                "  isSelectableUpstreamValue,\n  syncValueEquals,\n",
            )
        if "type SyncValue," not in text:
            text = text.replace(
                "  type ResolutionsMap,\n",
                "  type ResolutionsMap,\n  type SyncValue,\n",
            )
        text = text.replace(
            "    value: number | string,\n",
            "    value: SyncValue,\n",
        )
        text = text.replace(
            "if (resolutions[row.model]?.[ratioType] === upstreamVal)",
            "if (syncValueEquals(resolutions[row.model]?.[ratioType], upstreamVal))",
        )
        text = text.replace(
            "if (syncValuesEqual(resolutions[row.model]?.[ratioType], upstreamVal))",
            "if (syncValueEquals(resolutions[row.model]?.[ratioType], upstreamVal))",
        )
        text = text.replace(
            "                          resolutions[row.original.model]?.[ratioType] ===\n                          upstreamVal,",
            "                          syncValueEquals(\n                            resolutions[row.original.model]?.[ratioType],\n                            upstreamVal\n                          ),",
        )
        text = text.replace(
            "syncValuesEqual(\n                            resolutions[row.original.model]?.[ratioType],\n                            upstreamVal\n                          ),",
            "syncValueEquals(\n                            resolutions[row.original.model]?.[ratioType],\n                            upstreamVal\n                          ),",
        )
        text = text.replace(
            "upstreamVal as number | string",
            "upstreamVal as SyncValue",
        )
        text = text.replace(
            "  upstreamVal: number | string | 'same' | null | undefined\n",
            "  upstreamVal: SyncValue | 'same' | null | undefined\n",
        )
        text = text.replace(
            "  const text = String(upstreamVal)\n",
            "  const text = formatSyncValue(upstreamVal)\n",
        )
        if "formatSyncValue(" not in text:
            text = text.replace("  formatSyncValue,\n", "")
        columns_path.write_text(text, encoding="utf-8")

    table_path = root / "src" / "features" / "system-settings" / "models" / "upstream-ratio-sync-table.tsx"
    if table_path.exists():
        text = table_path.read_text(encoding="utf-8")
        if "type SyncValue," not in text:
            text = text.replace(
                "  type ResolutionsMap,\n",
                "  type ResolutionsMap,\n  type SyncValue,\n",
            )
        text = re.sub(r"\ntype SyncValue = number \| string(?: \| Record<string, unknown>)?\n", "\n", text)
        text = text.replace(
            "    value: number | string,\n",
            "    value: SyncValue,\n",
        )
        text = text.replace(
            "upstreamVal as number | string",
            "upstreamVal as SyncValue",
        )
        table_path.write_text(text, encoding="utf-8")

    sync_path = root / "src" / "features" / "system-settings" / "models" / "upstream-ratio-sync.tsx"
    if sync_path.exists():
        text = sync_path.read_text(encoding="utf-8")
        text = re.sub(
            r"\ntype SyncValue = number \| string(?: \| Record<string, unknown>)*\n",
            "\n",
            text,
        )
        text = text.replace(
            "type SyncValue = number | string",
            "type SyncValue = number | string | Record<string, unknown>",
        )
        if "syncValueEquals," not in text:
            text = text.replace(
                "  getPreferredSyncField,\n",
                "  getPreferredSyncField,\n  syncValueEquals,\n",
            )
        if "type SyncValue," not in text:
            text = text.replace(
                "  type ResolutionsMap,\n",
                "  type ResolutionsMap,\n  type SyncValue,\n",
            )
        text = text.replace(
            "    value: number | string,\n    sourceName: string\n  ) => {\n",
            "    value: SyncValue,\n    sourceName: string\n  ) => {\n",
        )
        text = re.sub(
            r"(\n\s*)value: number \| string,\n(\s*sourceName: string\n\s*\) => \{\n)",
            r"\1value: SyncValue,\n\2",
            text,
            count=1,
        )
        text = text.replace(
            "      const finalValue = preferredValue as number | string\n",
            "      const finalValue = preferredValue as SyncValue\n",
        )
        text = text.replace(
            "    value: number | string\n  ): string => {\n",
            "    value: SyncValue\n  ): string => {\n",
        )
        text = text.replace(
            "    const entry = Object.entries(upMap).find(([, v]) => v === value)\n",
            "    const entry = Object.entries(upMap).find(([, v]) =>\n      syncValueEquals(v, value)\n    )\n",
        )
        text = re.sub(
            r"    const entry = Object\.entries\(upMap\)\.find\(\(\[, v\]\) => \{\n"
            r"\s*if \(v === value\) return true\n"
            r"\s*return false\n"
            r"\s*\}\)\n",
            "    const entry = Object.entries(upMap).find(([, v]) =>\n      syncValueEquals(v, value)\n    )\n",
            text,
        )
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
        text = sync_path.read_text(encoding="utf-8")
        legacy_mode_pattern = (
            r"\s*if \(finalType === 'dashscope_native_pricing' && sourceName && modelDiffs\) \{\n"
            r"\s*const modeVal = modelDiffs\.billing_mode\?\.upstreams\?\.\[sourceName\]\n"
            r"\s*newModelRes\['billing_mode'\] =\n"
            r"\s*modeVal !== undefined && modeVal !== null && modeVal !== 'same'\n"
            r"\s*\? modeVal\n"
            r"\s*: 'dashscope_native'\n"
            r"\s*\}\n"
        )
        text = re.sub(legacy_mode_pattern, "\n", text)
        sync_path.write_text(text, encoding="utf-8")
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

    pricing_component_path = root / "src" / "features" / "system-settings" / "models" / "dashscope-pricing-settings.tsx"
    write_dashscope_pricing_component(pricing_component_path)

    billing_registry_path = root / "src" / "features" / "system-settings" / "billing" / "section-registry.tsx"
    if billing_registry_path.exists():
        text = billing_registry_path.read_text(encoding="utf-8")
        if "DashScopePricingSettings" not in text:
            text = text.replace(
                "import { PaymentSettingsSection } from '../integrations/payment-settings-section'\n",
                "import { PaymentSettingsSection } from '../integrations/payment-settings-section'\n"
                "import { DashScopePricingSettings } from '../models/dashscope-pricing-settings'\n",
            )
        text = re.sub(
            r"(import \{ DashScopePricingSettings \} from '../models/dashscope-pricing-settings'\n)+",
            "import { DashScopePricingSettings } from '../models/dashscope-pricing-settings'\n",
            text,
        )
        text = text.replace(
            "titleKey: 'DashScope Native Pricing',\n"
            "    descriptionKey: 'Configure Ali SDK / DashScope Native official-unit pricing',",
            "titleKey: '阿里SDK专用定价',\n"
            "    descriptionKey: '配置 DashScope 原生协议模型的官方单位价格',",
        )
        if "id: 'dashscope-native-pricing'" not in text:
            anchor = "  {\n    id: 'payment',\n"
            section = """  {
    id: 'dashscope-native-pricing',
    titleKey: '阿里SDK专用定价',
    descriptionKey: '配置 DashScope 原生协议模型的官方单位价格',
    build: (settings: BillingSettings) => (
      <DashScopePricingSettings
        defaultValue={settings['billing_setting.dashscope_native_pricing']}
      />
    ),
  },
"""
            if anchor not in text:
                raise SystemExit("DashScope Native frontend patch failed: billing section anchor not found")
            text = text.replace(anchor, section + anchor, 1)
        billing_registry_path.write_text(text, encoding="utf-8")


def write_dashscope_pricing_component(path: Path) -> None:
    component = r'''import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const OPTION_KEY = 'billing_setting.dashscope_native_pricing'

const UNIT_OPTIONS = [
  { value: 'character', label: '按字符' },
  { value: 'audio_second', label: '按音频秒' },
  { value: 'image', label: '按图片张数' },
  { value: 'video_second', label: '按视频秒' },
  { value: 'video_task', label: '按视频任务' },
  { value: 'request', label: '按请求' },
  { value: 'token_input_output', label: '按输入/输出 Token' },
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

const EXAMPLES: Record<NativeUnit, string> = {
  character: 'CosyVoice：官方每万字符价格 / 10000',
  audio_second: 'ASR/音频：每音频秒价格',
  image: '生图：可按分辨率、质量配置阶梯',
  video_second: '生视频：按 duration 秒数计费，可按 720P|16:9 等阶梯',
  video_task: '视频任务：每提交一次任务计费',
  request: '原生请求：每次请求计费',
  token_input_output: '兼容 usage 的原生返回：分别设置输入/输出 token 单价',
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

function parseRows(raw: string | undefined): PricingRow[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
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
  } catch {
    return []
  }
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

function buildCosyVoiceRow(): PricingRow {
  return {
    ...createDefaultRow('cosyvoice-v3.5-plus'),
    unit: 'character',
    price: '0.000022',
  }
}

type DashScopePricingSettingsProps = {
  defaultValue: string
}

export function DashScopePricingSettings({
  defaultValue,
}: DashScopePricingSettingsProps) {
  const updateOption = useUpdateOption()
  const [rows, setRows] = useState<PricingRow[]>(() => parseRows(defaultValue))

  useEffect(() => {
    setRows(parseRows(defaultValue))
  }, [defaultValue])

  const payload = useMemo(() => serializeRows(rows), [rows])

  const updateRow = useCallback(
    (id: string, patch: Partial<PricingRow>) => {
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, ...patch } : row))
      )
    },
    []
  )

  const updateTier = useCallback(
    (rowId: string, tierId: string, patch: Partial<TierRow>) => {
      setRows((current) =>
        current.map((row) =>
          row.id === rowId
            ? {
                ...row,
                tiers: row.tiers.map((tier) =>
                  tier.id === tierId ? { ...tier, ...patch } : tier
                ),
              }
            : row
        )
      )
    },
    []
  )

  const addTier = useCallback((rowId: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              tiers: [
                ...row.tiers,
                { id: createId(), key: row.unit === 'video_second' ? '720p|16:9' : 'default', price: '' },
              ],
            }
          : row
      )
    )
  }, [])

  const removeTier = useCallback((rowId: string, tierId: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, tiers: row.tiers.filter((tier) => tier.id !== tierId) }
          : row
      )
    )
  }, [])

  const handleSave = useCallback(async () => {
    const models = rows.map((row) => row.model.trim()).filter(Boolean)
    if (models.length !== new Set(models).size) {
      toast.error('模型名称重复，请检查后再保存')
      return
    }
    await updateOption.mutateAsync({
      key: OPTION_KEY,
      value: JSON.stringify(payload),
    })
    toast.success('阿里SDK专用定价已保存')
  }, [payload, rows, updateOption])

  return (
    <SettingsSection
      title='阿里SDK专用定价'
      description='配置 DashScope 原生协议的官方单位价格；兼容格式模型仍在模型定价页按原 NewAPI 方式配置。'
    >
      <div className='space-y-4'>
        <Alert>
          <AlertDescription className='text-sm'>
            这里只给原生协议模型使用。保存后系统会自动写入底层定价配置；没有配置价格的原生模型会被拒绝，避免错扣费。
          </AlertDescription>
        </Alert>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setRows((current) => [...current, createDefaultRow()])}
          >
            <Plus className='mr-2 h-4 w-4' />
            添加模型
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setRows((current) => [...current, buildCosyVoiceRow()])}
          >
            <RotateCcw className='mr-2 h-4 w-4' />
            添加 CosyVoice 示例
          </Button>
        </div>

        <div className='space-y-3'>
          {rows.length === 0 && (
            <div className='text-muted-foreground rounded-md border border-dashed p-6 text-sm'>
              暂无阿里SDK原生定价。点击“添加模型”开始配置。
            </div>
          )}

          {rows.map((row) => (
            <div key={row.id} className='space-y-3 rounded-md border p-4'>
              <div className='grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_auto]'>
                <div className='space-y-1'>
                  <div className='text-sm font-medium'>模型名称</div>
                  <Input
                    value={row.model}
                    onChange={(event) => updateRow(row.id, { model: event.target.value })}
                    placeholder='cosyvoice-v3.5-plus'
                  />
                </div>
                <div className='space-y-1'>
                  <div className='text-sm font-medium'>计费单位</div>
                  <select
                    value={row.unit}
                    onChange={(event) =>
                      updateRow(row.id, {
                        unit: event.target.value as NativeUnit,
                        tiers: event.target.value === 'token_input_output' ? [] : row.tiers,
                      })
                    }
                    className='border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none'
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='flex items-end justify-end'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      setRows((current) => current.filter((item) => item.id !== row.id))
                    }
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>

              <div className='text-muted-foreground text-xs'>{EXAMPLES[row.unit]}</div>

              {row.unit === 'token_input_output' ? (
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='space-y-1'>
                    <div className='text-sm font-medium'>输入价格</div>
                    <Input
                      value={row.inputPrice}
                      onChange={(event) => updateRow(row.id, { inputPrice: event.target.value })}
                      placeholder='每 token 美元价格，例如 0.000001'
                    />
                  </div>
                  <div className='space-y-1'>
                    <div className='text-sm font-medium'>输出价格</div>
                    <Input
                      value={row.outputPrice}
                      onChange={(event) => updateRow(row.id, { outputPrice: event.target.value })}
                      placeholder='每 token 美元价格，例如 0.000002'
                    />
                  </div>
                </div>
              ) : (
                <div className='space-y-3'>
                  <div className='grid gap-3 md:grid-cols-[minmax(180px,260px)_1fr]'>
                    <div className='space-y-1'>
                      <div className='text-sm font-medium'>基础单价</div>
                      <Input
                        value={row.price}
                        onChange={(event) => updateRow(row.id, { price: event.target.value })}
                        placeholder='美元单价，例如 0.000022'
                      />
                    </div>
                    <div className='text-muted-foreground flex items-end text-xs'>
                      字符/秒/张/请求等单位按这里的美元单价结算；有阶梯价格时会优先匹配阶梯。
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='text-sm font-medium'>阶梯价格</div>
                      <Button variant='outline' size='sm' onClick={() => addTier(row.id)}>
                        <Plus className='mr-2 h-4 w-4' />
                        添加阶梯
                      </Button>
                    </div>
                    {row.tiers.map((tier) => (
                      <div key={tier.id} className='grid gap-2 md:grid-cols-[minmax(160px,1fr)_180px_auto]'>
                        <Input
                          value={tier.key}
                          onChange={(event) => updateTier(row.id, tier.id, { key: event.target.value })}
                          placeholder='720p|16:9、720p、default'
                        />
                        <Input
                          value={tier.price}
                          onChange={(event) => updateTier(row.id, tier.id, { price: event.target.value })}
                          placeholder='美元单价'
                        />
                        <Button variant='ghost' size='sm' onClick={() => removeTier(row.id, tier.id)}>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ))}
                    {row.tiers.length === 0 && (
                      <div className='text-muted-foreground text-xs'>
                        可选。HappyHorse 这类视频模型建议按 resolution|ratio、resolution、default 配置。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className='rounded-md border p-4'>
          <div className='mb-3 text-sm font-medium'>支持的计费单位</div>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
            {UNIT_OPTIONS.map((option) => (
              <div key={option.value} className='space-y-1'>
                <Badge variant='secondary'>{option.label}</Badge>
                <div className='text-muted-foreground text-xs'>{EXAMPLES[option.value]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className='flex justify-end'>
          <Button onClick={handleSave} disabled={updateOption.isPending}>
            <Save className='mr-2 h-4 w-4' />
            {updateOption.isPending ? '保存中...' : '保存阿里SDK专用定价'}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
'''
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(component, encoding="utf-8")


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
