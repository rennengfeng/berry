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
import type { ReactNode } from 'react'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/theme-provider'

export type PortalThemeMode = 'default' | 'system' | 'light' | 'dark'
export type PortalTemplate = 'default' | 'console' | 'paper'
export type PortalThemePreset = 'default' | 'ocean' | 'sunset' | 'forest'

function normalizeThemeMode(value: unknown): PortalThemeMode {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value
  }
  return 'default'
}

function normalizeTemplate(value: unknown): PortalTemplate {
  if (value === 'console' || value === 'paper') {
    return value
  }
  return 'default'
}

function normalizePreset(value: unknown): PortalThemePreset {
  if (value === 'ocean' || value === 'sunset' || value === 'forest') {
    return value
  }
  return 'default'
}

export function usePortalAppearance() {
  const { status } = useStatus()
  const { resolvedTheme } = useTheme()
  const source = status?.data ?? status
  const configuredThemeMode = normalizeThemeMode(source?.theme_mode)
  const themeMode =
    configuredThemeMode === 'default' ? resolvedTheme : configuredThemeMode
  const template = normalizeTemplate(source?.theme_template)
  const preset = normalizePreset(source?.theme_preset)
  const systemName =
    typeof source?.system_name === 'string' && source.system_name.trim()
      ? source.system_name.trim()
      : 'New API'

  const presetHeroClass =
    preset === 'ocean'
      ? themeMode === 'dark'
        ? 'bg-[linear-gradient(135deg,rgba(3,7,18,0.98),rgba(8,47,73,0.92)),radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.24),transparent_32%)] text-slate-50'
        : 'bg-[linear-gradient(135deg,rgba(239,248,255,0.96),rgba(224,242,254,0.92)),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.22),transparent_32%)] text-slate-900'
      : preset === 'sunset'
        ? themeMode === 'dark'
          ? 'bg-[linear-gradient(135deg,rgba(28,25,23,0.98),rgba(120,53,15,0.90)),radial-gradient(circle_at_80%_20%,rgba(251,146,60,0.25),transparent_34%)] text-orange-50'
          : 'bg-[linear-gradient(135deg,rgba(255,247,237,0.98),rgba(255,241,242,0.95)),radial-gradient(circle_at_80%_20%,rgba(251,146,60,0.24),transparent_32%)] text-stone-900'
        : preset === 'forest'
          ? themeMode === 'dark'
            ? 'bg-[linear-gradient(135deg,rgba(3,12,9,0.98),rgba(22,78,33,0.88)),radial-gradient(circle_at_80%_20%,rgba(74,222,128,0.24),transparent_32%)] text-emerald-50'
            : 'bg-[linear-gradient(135deg,rgba(240,253,244,0.98),rgba(236,253,245,0.94)),radial-gradient(circle_at_80%_20%,rgba(132,204,22,0.22),transparent_32%)] text-stone-900'
          : 'bg-[linear-gradient(135deg,rgba(10,10,20,0.98),rgba(26,26,46,0.94)),radial-gradient(circle_at_82%_18%,rgba(251,146,60,0.20),transparent_28%)] text-white'

  const presetPanelClass =
    preset === 'ocean'
      ? themeMode === 'dark'
        ? 'border-cyan-900/50 bg-slate-950/45'
        : 'border-sky-200/70 bg-cyan-50/70'
      : preset === 'sunset'
        ? themeMode === 'dark'
          ? 'border-orange-900/40 bg-stone-950/35'
          : 'border-orange-200/70 bg-orange-50/75'
        : preset === 'forest'
          ? themeMode === 'dark'
            ? 'border-emerald-900/40 bg-emerald-950/25'
            : 'border-emerald-200/70 bg-emerald-50/75'
          : 'border-white/10 bg-white/5'

  const presetSubtleClass =
    preset === 'ocean'
      ? 'border-cyan-400/15 bg-cyan-500/6'
      : preset === 'sunset'
        ? 'border-orange-400/15 bg-orange-500/6'
        : preset === 'forest'
          ? 'border-emerald-400/15 bg-emerald-500/6'
          : 'bg-muted/30'

  const shellClass = cn(
    'space-y-5 border-0 rounded-none bg-transparent px-4 pb-4 shadow-none sm:px-5'
  )

  const heroClass = cn(
    'relative overflow-hidden border p-6 shadow-sm sm:p-8',
    template === 'console'
      ? 'rounded-[1.5rem] border-cyan-400/15'
      : template === 'paper'
        ? 'rounded-[1.25rem] border-stone-200/70'
        : 'rounded-[2rem] border-white/10',
    presetHeroClass
  )

  const panelClass = cn(
    'backdrop-blur',
    template === 'console'
      ? 'rounded-xl border border-cyan-500/18 shadow-[0_8px_28px_rgba(8,47,73,0.18)]'
      : template === 'paper'
        ? 'rounded-md border border-stone-300/80 shadow-[0_8px_20px_rgba(120,113,108,0.08)]'
        : 'rounded-2xl border border-border/60 shadow-sm',
    presetPanelClass
  )

  const subtlePanelClass = cn(
    'rounded-2xl border p-4',
    template === 'console'
      ? 'border-cyan-500/15 bg-cyan-500/5'
      : template === 'paper'
        ? 'rounded-xl border-stone-200/70 bg-white/70'
        : presetSubtleClass
  )

  const badgeClass = cn(
    'gap-1.5',
    template === 'console'
      ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
      : template === 'paper'
        ? 'border-stone-300/60 bg-white/80 text-stone-900'
      : 'bg-white/15 text-white'
  )

  const shellHeaderClass = cn(
    'flex flex-wrap items-center justify-between gap-3',
    template === 'console'
      ? 'rounded-xl border border-cyan-500/18 bg-slate-950/55 px-4 py-3 font-mono text-cyan-100'
      : template === 'paper'
        ? 'rounded-md border border-stone-300/80 bg-white/85 px-4 py-3 text-stone-900'
        : 'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/90 backdrop-blur'
  )

  const shellHeaderMetaClass = cn(
    'flex flex-wrap items-center gap-2',
    template === 'console' ? 'text-cyan-100' : ''
  )

  const templateLabel =
    template === 'console'
      ? 'Console Template'
      : template === 'paper'
        ? 'Paper Template'
        : 'Default Template'
  const modeLabel =
    themeMode === 'light'
      ? 'Light'
      : themeMode === 'dark'
        ? 'Dark'
        : themeMode === 'system'
          ? 'System'
          : 'Default'
  const presetLabel =
    preset === 'ocean'
      ? 'Ocean Preset'
      : preset === 'sunset'
        ? 'Sunset Preset'
        : preset === 'forest'
          ? 'Forest Preset'
          : 'Default Preset'

  return {
    template,
    themeMode,
    preset,
    systemName,
    shellClass,
    shellHeaderClass,
    shellHeaderMetaClass,
    heroClass,
    panelClass,
    subtlePanelClass,
    badgeClass,
    templateLabel,
    modeLabel,
    presetLabel,
  }
}

export function PortalShell(props: { children: ReactNode }) {
  const appearance = usePortalAppearance()

  return <div className={appearance.shellClass}>{props.children}</div>
}
