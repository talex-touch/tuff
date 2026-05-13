const STACK_MATCH_PIXEL_THRESHOLD = 8
const STACK_MATCH_RATIO_THRESHOLD = 0.05

export const STACK_LAYER_OFFSET_Y = -18
export const STACK_LAYER_SCALE_STEP = 0.05
export const STACK_LAYER_MAX_DEPTH = 3
export const STACK_OPACITY_BY_DEPTH = [1, 0.92, 0.78, 0.62, 0.38, 0.16, 0] as const
export const STACK_STATE_EPSILON = 0.001

export interface FlipOverlayStackEntry {
  id: string
  zIndex: number
  openSequence: number
  width: number
  height: number
  visible: boolean
  globalMask: boolean
  maskClass: string
}

const overlayStackRegistry = new Map<string, FlipOverlayStackEntry>()
const overlayStackSubscribers = new Set<() => void>()
let overlayStackVersion = 0
let overlayInstanceSeed = 0
let overlayOpenSequenceSeed = 0
let sharedGlobalMaskElement: HTMLDivElement | null = null

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function resolveVisibleStackBounds(entries: FlipOverlayStackEntry[]): { minZIndex: number, topEntry: FlipOverlayStackEntry } | null {
  if (entries.length === 0)
    return null

  let minZIndex = entries[0]!.zIndex
  for (const entry of entries) {
    if (entry.zIndex < minZIndex)
      minZIndex = entry.zIndex
  }

  return {
    minZIndex,
    topEntry: entries[entries.length - 1]!,
  }
}

function removeSharedGlobalMaskElement(): void {
  if (!sharedGlobalMaskElement)
    return
  sharedGlobalMaskElement.remove()
  sharedGlobalMaskElement = null
}

function ensureSharedGlobalMaskElement(): HTMLDivElement | null {
  if (!canUseDom())
    return null

  if (!sharedGlobalMaskElement) {
    sharedGlobalMaskElement = document.createElement('div')
    sharedGlobalMaskElement.className = 'TxFlipOverlay-GlobalMask'
    document.body.appendChild(sharedGlobalMaskElement)
  }

  return sharedGlobalMaskElement
}

function applySharedGlobalMaskState(): void {
  if (!canUseDom())
    return

  const visibleEntries = getVisibleOverlayStackEntries()
  const bounds = resolveVisibleStackBounds(visibleEntries)

  if (!bounds || visibleEntries.length <= 1 || !bounds.topEntry.globalMask) {
    removeSharedGlobalMaskElement()
    return
  }

  const maskElement = ensureSharedGlobalMaskElement()
  if (!maskElement)
    return

  maskElement.className = 'TxFlipOverlay-GlobalMask'
  maskElement.style.zIndex = String(Math.max(0, bounds.minZIndex - 1))
  maskElement.style.opacity = '1'
}

function markOverlayStackChanged(): void {
  overlayStackVersion += 1
  applySharedGlobalMaskState()
  overlayStackSubscribers.forEach((listener) => {
    try {
      listener()
    }
    catch {
      // Ignore subscriber errors so one overlay cannot block the stack.
    }
  })
}

function isSameStackEntry(current: FlipOverlayStackEntry, next: FlipOverlayStackEntry): boolean {
  return current.zIndex === next.zIndex
    && current.openSequence === next.openSequence
    && current.width === next.width
    && current.height === next.height
    && current.visible === next.visible
    && current.globalMask === next.globalMask
    && current.maskClass === next.maskClass
}

export function subscribeOverlayStackChanged(listener: () => void): () => void {
  overlayStackSubscribers.add(listener)
  return () => overlayStackSubscribers.delete(listener)
}

export function getOverlayStackVersion(): number {
  return overlayStackVersion
}

export function getVisibleOverlayStackEntries(): FlipOverlayStackEntry[] {
  return Array
    .from(overlayStackRegistry.values())
    .filter(entry => entry.visible)
    .sort((a, b) => {
      if (a.zIndex !== b.zIndex)
        return a.zIndex - b.zIndex
      return a.openSequence - b.openSequence
    })
}

export function upsertOverlayStackEntry(entry: FlipOverlayStackEntry): void {
  const previousEntry = overlayStackRegistry.get(entry.id)
  if (previousEntry && isSameStackEntry(previousEntry, entry))
    return

  overlayStackRegistry.set(entry.id, entry)
  markOverlayStackChanged()
}

export function removeOverlayStackEntry(id: string): void {
  if (!overlayStackRegistry.has(id))
    return

  overlayStackRegistry.delete(id)
  markOverlayStackChanged()
}

export function isOverlaySizeMatched(current: FlipOverlayStackEntry, above: FlipOverlayStackEntry): boolean {
  const widthDelta = Math.abs(current.width - above.width)
  const heightDelta = Math.abs(current.height - above.height)
  const widthTolerance = Math.max(STACK_MATCH_PIXEL_THRESHOLD, above.width * STACK_MATCH_RATIO_THRESHOLD)
  const heightTolerance = Math.max(STACK_MATCH_PIXEL_THRESHOLD, above.height * STACK_MATCH_RATIO_THRESHOLD)
  return widthDelta <= widthTolerance && heightDelta <= heightTolerance
}

export function resolveStackOpacity(depth: number): number {
  if (depth < 0)
    return 1
  if (depth >= STACK_OPACITY_BY_DEPTH.length)
    return 0
  return STACK_OPACITY_BY_DEPTH[depth] ?? 0
}

export function nextOverlayInstanceId(): string {
  overlayInstanceSeed += 1
  return `tx-flip-overlay-${overlayInstanceSeed}`
}

export function nextOverlayOpenSequence(): number {
  overlayOpenSequenceSeed += 1
  return overlayOpenSequenceSeed
}
