import type { Display, Rectangle } from 'electron'

export type WindowBounds = Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>

export interface MainWindowStateV1 {
  v: 1
  profiles: Record<string, { bounds: WindowBounds; updatedAt: number }>
  lastLayout?: string
}

interface Size {
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function intersectionArea(a: WindowBounds, b: WindowBounds): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const w = right - left
  const h = bottom - top
  if (w <= 0 || h <= 0) return 0
  return w * h
}

function toBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const x = obj.x
  const y = obj.y
  const width = obj.width
  const height = obj.height
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null
  }

  return { x, y, width, height }
}

export function getDisplayLayoutSignature(displays: Display[]): string {
  return displays
    .slice()
    .sort((a, b) => {
      if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x
      if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y
      if (a.bounds.width !== b.bounds.width) return a.bounds.width - b.bounds.width
      if (a.bounds.height !== b.bounds.height) return a.bounds.height - b.bounds.height
      return a.scaleFactor - b.scaleFactor
    })
    .map((d) => `${d.bounds.x},${d.bounds.y},${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}`)
    .join('|')
}

export function normalizeBoundsToDisplays(
  bounds: WindowBounds,
  displays: Display[],
  primaryDisplay: Display,
  minSize: Size
): WindowBounds {
  const primaryWorkArea = primaryDisplay.workArea
  const best = displays.reduce<{ display: Display; score: number }>(
    (acc, display) => {
      const score = intersectionArea(bounds, display.workArea)
      if (score > acc.score) {
        return { display, score }
      }
      return acc
    },
    { display: primaryDisplay, score: intersectionArea(bounds, primaryWorkArea) }
  ).display

  const workArea = best.workArea
  const width = clamp(Math.round(bounds.width), minSize.width, workArea.width)
  const height = clamp(Math.round(bounds.height), minSize.height, workArea.height)

  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height

  const x = maxX >= workArea.x ? clamp(Math.round(bounds.x), workArea.x, maxX) : workArea.x
  const y = maxY >= workArea.y ? clamp(Math.round(bounds.y), workArea.y, maxY) : workArea.y

  return { x, y, width, height }
}

export function getDefaultCenteredBounds(
  primaryDisplay: Display,
  size: Size,
  minSize: Size
): WindowBounds {
  const workArea = primaryDisplay.workArea
  const width = clamp(size.width, minSize.width, workArea.width)
  const height = clamp(size.height, minSize.height, workArea.height)
  const x = workArea.x + Math.round((workArea.width - width) / 2)
  const y = workArea.y + Math.round((workArea.height - height) / 2)
  return { x, y, width, height }
}

export function pickBestMainWindowBounds(
  state: unknown,
  layoutSignature: string,
  displays: Display[],
  primaryDisplay: Display,
  defaultSize: Size,
  minSize: Size
): { bounds: WindowBounds; usedLayout: string; reason: 'match' | 'fallback-visible' | 'default' } {
  const defaultBounds = getDefaultCenteredBounds(primaryDisplay, defaultSize, minSize)

  if (!state || typeof state !== 'object') {
    return { bounds: defaultBounds, usedLayout: layoutSignature, reason: 'default' }
  }

  const raw = state as Partial<MainWindowStateV1>
  const profiles =
    raw.profiles && typeof raw.profiles === 'object'
      ? (raw.profiles as MainWindowStateV1['profiles'])
      : null
  if (!profiles) {
    return { bounds: defaultBounds, usedLayout: layoutSignature, reason: 'default' }
  }

  const direct = profiles[layoutSignature]
  const directBounds = toBounds(direct?.bounds)
  if (directBounds) {
    return {
      bounds: normalizeBoundsToDisplays(directBounds, displays, primaryDisplay, minSize),
      usedLayout: layoutSignature,
      reason: 'match'
    }
  }

  let best: { bounds: WindowBounds; updatedAt: number } | null = null
  for (const profile of Object.values(profiles)) {
    const b = toBounds(profile?.bounds)
    const updatedAt = typeof profile?.updatedAt === 'number' ? profile.updatedAt : 0
    if (!b) continue
    const normalized = normalizeBoundsToDisplays(b, displays, primaryDisplay, minSize)
    const visible = displays.some((d) => intersectionArea(normalized, d.workArea) > 0)
    if (!visible) continue
    if (!best || updatedAt > best.updatedAt) {
      best = { bounds: normalized, updatedAt }
    }
  }

  if (best) {
    return { bounds: best.bounds, usedLayout: layoutSignature, reason: 'fallback-visible' }
  }

  return { bounds: defaultBounds, usedLayout: layoutSignature, reason: 'default' }
}

export function upsertMainWindowStateProfile(
  appSettings: unknown,
  layoutSignature: string,
  bounds: WindowBounds
): void {
  if (!appSettings || typeof appSettings !== 'object') return

  const settings = appSettings as Record<string, unknown>
  const windowSettings =
    typeof settings.window === 'object' && settings.window
      ? (settings.window as Record<string, unknown>)
      : {}
  settings.window = windowSettings

  const current = windowSettings.mainWindowState
  const raw =
    current && typeof current === 'object' ? (current as Partial<MainWindowStateV1>) : null

  const profiles =
    raw?.profiles && typeof raw.profiles === 'object'
      ? { ...(raw.profiles as MainWindowStateV1['profiles']) }
      : {}
  const lastLayout = typeof raw?.lastLayout === 'string' ? raw.lastLayout : undefined

  const state: MainWindowStateV1 = { v: 1, profiles, lastLayout }

  state.profiles[layoutSignature] = {
    bounds,
    updatedAt: Date.now()
  }
  state.lastLayout = layoutSignature

  windowSettings.mainWindowState = state
}
