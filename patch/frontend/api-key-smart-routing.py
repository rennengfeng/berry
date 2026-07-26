#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
FRONTEND = sys.argv[2] if len(sys.argv) > 2 else ""
PATCH_ROOT = Path(__file__).resolve().parent
TEMPLATE_ROOT = PATCH_ROOT / "berry-smart-routing"


SMART_ROUTING_I18N = {
    "All available groups": "All available groups",
    "Balances price, speed, and success rate": "Balances price, speed, and success rate",
    "Compares TTFT for the current model in each candidate group first. Cold start uses 200 virtual samples at 3000ms.": "Compares TTFT for the current model in each candidate group first. Cold start uses 200 virtual samples at 3000ms.",
    "Compares success rate for the current model in each candidate group first. Cold start uses 200 virtual samples at 95% success.": "Compares success rate for the current model in each candidate group first. Cold start uses 200 virtual samples at 95% success.",
    "Compares the estimated cost for the current model in each candidate group first, then uses success rate and TTFT as tie breakers.": "Compares the estimated cost for the current model in each candidate group first, then uses success rate and TTFT as tie breakers.",
    "Manual routing": "Manual routing",
    "No group selected": "No group selected",
    "No groups selected. Smart routing will use all groups available to this account.": "No groups selected. Smart routing will use all groups available to this account.",
    "Price first": "Price first",
    "Prioritizes faster first-token response": "Prioritizes faster first-token response",
    "Prioritizes lower-cost groups": "Prioritizes lower-cost groups",
    "Prioritizes recently stable groups": "Prioritizes recently stable groups",
    "Route": "Route",
    "Scores the current model across candidate groups using price, TTFT, and success rate. If no groups are selected, all usable groups are candidates.": "Scores the current model across candidate groups using price, TTFT, and success rate. If no groups are selected, all usable groups are candidates.",
    "Select one or more groups. Manual routing tries them in order when failures occur.": "Select one or more groups. Manual routing tries them in order when failures occur.",
    "Smart auto": "Smart auto",
    "Smart routing": "Smart routing",
    "Smart routing is off. Requests follow the manual group order below.": "Smart routing is off. Requests follow the manual group order below.",
    "Smart routing will choose among the selected groups.": "Smart routing will choose among the selected groups.",
    "Speed first": "Speed first",
    "Success rate first": "Success rate first",
    "Turn smart routing off to edit groups, then turn it back on to route intelligently within those groups.": "Turn smart routing off to edit groups, then turn it back on to route intelligently within those groups.",
    "{{count}} group(s) selected": "{{count}} group(s) selected",
}

SMART_ROUTING_ZH = {
    "All available groups": "全部可用分组",
    "Balances price, speed, and success rate": "综合平衡价格、速度和成功率",
    "Manual routing": "手动路由",
    "No group selected": "未选择分组",
    "No groups selected. Smart routing will use all groups available to this account.": "未选择分组时，智能路由会使用当前账户可用的全部普通分组。",
    "Price first": "价格优先",
    "Prioritizes faster first-token response": "优先选择首字响应更快的分组",
    "Prioritizes lower-cost groups": "优先选择成本更低的分组",
    "Prioritizes recently stable groups": "优先选择近期更稳定的分组",
    "Route": "路由",
    "Select one or more groups. Manual routing tries them in order when failures occur.": "请选择一个或多个分组。手动路由会在失败时按顺序尝试。",
    "Smart auto": "智能自动",
    "Smart routing": "智能路由",
    "Smart routing is off. Requests follow the manual group order below.": "智能路由已关闭，请求会按下方手动分组顺序执行。",
    "Smart routing will choose among the selected groups.": "智能路由会在已选择的分组内择优。",
    "Speed first": "速度优先",
    "Success rate first": "成功率优先",
    "Turn smart routing off to edit groups, then turn it back on to route intelligently within those groups.": "先关闭智能路由即可编辑分组，重新开启后会在这些分组内智能路由。",
    "{{count}} group(s) selected": "已选择 {{count}} 个分组",
}


def frontend_root() -> Path:
    if FRONTEND:
        return PROJECT_ROOT / "web" / FRONTEND
    if (PROJECT_ROOT / "src" / "features" / "keys").exists():
        return PROJECT_ROOT
    return PROJECT_ROOT / "web" / "berry"


def copy_template_file(target_root: Path, rel: str) -> None:
    src = TEMPLATE_ROOT / rel
    dst = target_root / rel
    if not src.exists():
        raise SystemExit(f"smart routing frontend patch failed: missing template {src}")
    if not dst.parent.exists():
        raise SystemExit(f"smart routing frontend patch failed: missing target directory {dst.parent}")
    shutil.copyfile(src, dst)


def patch_static_keys(target_root: Path) -> None:
    path = target_root / "src" / "i18n" / "static-keys.ts"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    missing = [key for key in SMART_ROUTING_I18N if f"'{key}'" not in text and f'"{key}"' not in text]
    if not missing:
        return
    marker = "] as const"
    if marker not in text:
        return
    snippet = "".join(f"  '{key}',\n" for key in missing)
    text = text.replace(marker, snippet + marker, 1)
    path.write_text(text, encoding="utf-8")


def patch_locale_file(path: Path) -> None:
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    translations = dict(SMART_ROUTING_I18N)
    if path.name == "zh.json":
        translations.update(SMART_ROUTING_ZH)
    changed = False
    for key, value in translations.items():
        if key not in data:
            data[key] = value
            changed = True
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_i18n(target_root: Path) -> None:
    patch_static_keys(target_root)
    locale_dir = target_root / "src" / "i18n" / "locales"
    if locale_dir.exists():
        for path in locale_dir.glob("*.json"):
            patch_locale_file(path)


def main() -> None:
    if FRONTEND and FRONTEND != "berry":
        print(f"skip berry API key smart routing UI patch for frontend={FRONTEND}")
        return

    target_root = frontend_root()
    if not (target_root / "src" / "features" / "keys").exists():
        print(f"skip berry API key smart routing UI patch: missing frontend keys folder at {target_root}")
        return

    files = [
        "src/features/keys/types.ts",
        "src/features/keys/lib/api-key-form.ts",
        "src/features/keys/components/api-keys-mutate-drawer.tsx",
        "src/features/keys/components/api-keys-columns.tsx",
    ]
    for rel in files:
        copy_template_file(target_root, rel)
    patch_i18n(target_root)
    print("applied berry API key smart routing frontend patch")


if __name__ == "__main__":
    main()
