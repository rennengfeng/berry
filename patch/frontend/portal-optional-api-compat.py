#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else "berry"


def frontend_root() -> Path:
    candidate = PROJECT_ROOT / "web" / FRONTEND
    if candidate.exists():
        return candidate
    if (PROJECT_ROOT / "src").exists():
        return PROJECT_ROOT
    raise SystemExit(f"portal optional API patch failed: missing frontend root {candidate}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def patch_perf_query(path: Path) -> None:
    if not path.exists():
        return
    text = read(path)
    pattern = (
        r"queryFn: async \(\) => \{\n"
        r"\s*const res = await api\.get\('/api/perf-metrics/summary'\)\n"
        r"\s*return res\.data\?\.data\?\.models as(?P<type>.*?)\n"
        r"\s*\},"
    )
    replacement = (
        "queryFn: async () => {\n"
        "      try {\n"
        "        const res = await api.get('/api/perf-metrics/summary', {\n"
        "          skipErrorHandler: true,\n"
        "          disableDuplicate: true,\n"
        "        } as Record<string, unknown>)\n"
        "        return res.data?.data?.models as\\g<type>\n"
        "      } catch {\n"
        "        return []\n"
        "      }\n"
        "    },"
    )
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count == 0 and "/api/perf-metrics/summary" in text and "skipErrorHandler: true" not in text:
        raise SystemExit(f"portal optional API patch failed: perf query anchor not found in {path}")
    write(path, text)


def patch_wallet_topup_link(root: Path) -> None:
    path = root / "src" / "features" / "wallet" / "hooks" / "use-topup-info.ts"
    if not path.exists():
        return
    text = read(path)
    if "function normalizeTopupLink(" not in text:
        text = text.replace(
            "function parseJsonArray(data: unknown): unknown[] {\n",
            "function normalizeTopupLink(data: unknown): string | undefined {\n"
            "  return typeof data === 'string' && data.trim() ? data.trim() : undefined\n"
            "}\n\n"
            "function parseJsonArray(data: unknown): unknown[] {\n",
            1,
        )
    if "const rawTopupInfo = response.data as TopupInfo & Record<string, unknown>" not in text:
        text = text.replace(
            "      const processedData: TopupInfo = {\n"
            "        ...response.data,",
            "      const rawTopupInfo = response.data as TopupInfo & Record<string, unknown>\n"
            "      const processedData: TopupInfo = {\n"
            "        ...rawTopupInfo,\n"
            "        topup_link: normalizeTopupLink(\n"
            "          rawTopupInfo.topup_link ??\n"
            "            rawTopupInfo.TopUpLink ??\n"
            "            rawTopupInfo.topupLink ??\n"
            "            rawTopupInfo.top_up_link ??\n"
            "            rawTopupInfo.recharge_link ??\n"
            "            rawTopupInfo.PayAddress ??\n"
            "            rawTopupInfo.pay_address\n"
            "        ),",
            1,
        )
        text = text.replace("response.data.pay_methods", "rawTopupInfo.pay_methods")
        text = text.replace("response.data.stripe_min_topup", "rawTopupInfo.stripe_min_topup")
        text = text.replace("response.data.amount_options", "rawTopupInfo.amount_options")
        text = text.replace("response.data.discount", "rawTopupInfo.discount")
        text = text.replace("response.data.creem_products", "rawTopupInfo.creem_products")
        text = text.replace("response.data.waffo_pay_methods", "rawTopupInfo.waffo_pay_methods")
    write(path, text)


def patch_subscription_hub(root: Path) -> None:
    path = root / "src" / "features" / "frontend-portal" / "subscription-hub.tsx"
    if not path.exists():
        return
    text = read(path)
    if "function normalizePortalTopupLink(" not in text:
        text = text.replace(
            "export function SubscriptionHub() {\n",
            "function normalizePortalTopupLink(info: unknown): string | undefined {\n"
            "  if (!info || typeof info !== 'object') return undefined\n"
            "  const data = info as Record<string, unknown>\n"
            "  const value =\n"
            "    data.topup_link ??\n"
            "    data.TopUpLink ??\n"
            "    data.topupLink ??\n"
            "    data.top_up_link ??\n"
            "    data.recharge_link ??\n"
            "    data.PayAddress ??\n"
            "    data.pay_address\n"
            "  return typeof value === 'string' && value.trim() ? value.trim() : undefined\n"
            "}\n\n"
            "export function SubscriptionHub() {\n",
            1,
        )
    if "const topupLink = normalizePortalTopupLink(topupInfo)" not in text:
        text = text.replace(
            "  const { topupInfo, presetAmounts } = useTopupInfo()\n",
            "  const { topupInfo, presetAmounts } = useTopupInfo()\n"
            "  const topupLink = normalizePortalTopupLink(topupInfo)\n",
            1,
        )
    text = text.replace("topupInfo?.topup_link", "topupLink")
    text = text.replace("topupInfo.topup_link", "topupLink")
    write(path, text)


root = frontend_root()
patch_perf_query(root / "src" / "features" / "frontend-portal" / "model-square.tsx")
patch_perf_query(root / "src" / "features" / "frontend-portal" / "model-monitor.tsx")
patch_wallet_topup_link(root)
patch_subscription_hub(root)
print("applied portal optional API/topup link compatibility frontend patch for berry")
