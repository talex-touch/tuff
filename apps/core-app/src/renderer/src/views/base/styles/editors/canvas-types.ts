export interface CanvasItem {
  id: string
  area: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  visible?: boolean
}

export interface CanvasConfig {
  enabled: boolean
  preset: string | 'custom'
  columns: number
  rowHeight: number
  gap: number
  items: CanvasItem[]
  colorVars?: Record<string, string>
  customCSS?: string
}

export interface CanvasAreaOption {
  area: string
  label: string
}

export function clampItem(item: CanvasItem, columns: number): CanvasItem {
  const maxCols = Math.max(1, columns)
  const minW = Math.max(1, item.minW ?? 1)
  const minH = Math.max(1, item.minH ?? 1)
  const maxW = Math.max(minW, item.maxW ?? maxCols)
  const maxH = Math.max(minH, item.maxH ?? 32)
  const width = Math.max(minW, Math.min(maxW, item.w))
  const height = Math.max(minH, Math.min(maxH, item.h))
  const x = Math.max(0, Math.min(maxCols - width, item.x))
  const y = Math.max(0, item.y)

  return {
    ...item,
    x,
    y,
    w: width,
    h: height
  }
}

export function intersects(a: CanvasItem, b: CanvasItem): boolean {
  if (a.id === b.id) return false

  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}

export function hasCollision(items: CanvasItem[], target: CanvasItem): boolean {
  return items.some((item) => intersects(item, target))
}

export function moveItem(
  items: CanvasItem[],
  id: string,
  patch: Partial<CanvasItem>,
  columns: number
): { items: CanvasItem[]; valid: boolean } {
  const next = items.map((item) => {
    if (item.id !== id) return item

    return clampItem({ ...item, ...patch }, columns)
  })

  const target = next.find((item) => item.id === id)
  if (!target) return { items, valid: false }

  if (hasCollision(next, target)) {
    return { items, valid: false }
  }

  return { items: next, valid: true }
}

export function normalizeCanvasConfig(config: CanvasConfig): CanvasConfig {
  const columns = Math.max(4, Math.min(24, Number(config.columns) || 12))
  const rowHeight = Math.max(12, Math.min(120, Number(config.rowHeight) || 24))
  const gap = Math.max(0, Math.min(24, Number(config.gap) || 8))

  return {
    ...config,
    columns,
    rowHeight,
    gap,
    items: (config.items || []).map((item) => clampItem(item, columns))
  }
}
