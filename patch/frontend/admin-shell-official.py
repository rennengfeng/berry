#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys


def find_official_src(project_dir: Path, frontend_root: Path) -> Path:
    candidates = [
        project_dir / "web" / "src",
        frontend_root.parent / "src",
        project_dir / "new-api-main0728" / "new-api-main" / "web" / "src",
        project_dir / "new-api-main" / "web" / "src",
    ]
    for candidate in candidates:
        if (candidate / "components" / "layout" / "components" / "app-sidebar.tsx").exists():
            return candidate
    raise SystemExit("admin shell patch failed: official web/src not found")


def copy_tree_file(src_root: Path, dst_root: Path, rel: str) -> None:
    src = src_root / rel
    if not src.exists():
        raise SystemExit(f"admin shell patch failed: missing official source {rel}")
    dst = dst_root / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def keep_second_dev_routes_compatible(frontend_src: Path) -> None:
    sidebar_data = frontend_src / "hooks" / "use-sidebar-data.ts"
    text = sidebar_data.read_text(encoding="utf-8")
    system_info_block = """          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
"""
    if system_info_block in text:
        text = text.replace(system_info_block, "")
        text = text.replace("  ServerCog,\n", "")
        text = text.replace("import { ROLE } from '@/lib/roles'\n", "")
        sidebar_data.write_text(text, encoding="utf-8")


def main() -> None:
    project_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    frontend = sys.argv[2] if len(sys.argv) > 2 else "berry"
    frontend_root = project_dir / "web" / frontend
    if not frontend_root.exists():
        frontend_root = project_dir / frontend
    if not frontend_root.exists():
        raise SystemExit(f"admin shell patch failed: frontend root not found for {frontend}")

    official_src = find_official_src(project_dir, frontend_root)
    files = [
        "components/command-menu.tsx",
        "components/layout/components/app-sidebar.tsx",
        "components/layout/components/authenticated-layout.tsx",
        "components/layout/components/sidebar-view-header.tsx",
        "components/layout/config/system-settings.config.ts",
        "components/layout/index.ts",
        "components/layout/lib/sidebar-view-registry.ts",
        "components/layout/types.ts",
        "hooks/use-sidebar-data.ts",
        "hooks/use-sidebar-view.ts",
    ]
    for rel in files:
        copy_tree_file(official_src, frontend_root / "src", rel)
    keep_second_dev_routes_compatible(frontend_root / "src")

    print("restored official admin shell/sidebar files")


if __name__ == "__main__":
    main()
