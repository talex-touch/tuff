import type {
  TdsCanvasFrame,
  TdsCanvasFrameSnapshot,
  TdsCanvasHistoryEntry,
  TdsCanvasHistoryState,
  TdsCanvasSnapshotDiff
} from './types'

const FNV_OFFSET_BASIS_32 = 0x811c9dc5
const FNV_PRIME_32 = 0x01000193
export const MAX_CANVAS_HISTORY_ENTRIES = 50
export const MAX_CANVAS_HISTORY_BLOBS = 512
const DEFAULT_MAX_ENTRIES = MAX_CANVAS_HISTORY_ENTRIES
const DEFAULT_MAX_BLOBS = MAX_CANVAS_HISTORY_BLOBS

/**
 * Fast, deterministic 32-bit FNV-1a content hash with length discriminator.
 * Used to content-address frame HTML/SVG source blobs with zero external dependencies.
 */
export function fnv1aHash(input: string): string {
  let hash = FNV_OFFSET_BASIS_32
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}-${input.length}`
}

export function createCanvasHistoryState(): TdsCanvasHistoryState {
  return {
    blobs: {},
    entries: [],
    cursor: -1
  }
}

function toFrameSnapshot(
  frame: TdsCanvasFrame,
  blobs: Record<string, string>
): TdsCanvasFrameSnapshot {
  const sourceHash = fnv1aHash(frame.source)
  if (!(sourceHash in blobs)) {
    blobs[sourceHash] = frame.source
  }
  const snap: TdsCanvasFrameSnapshot = {
    id: frame.id,
    title: frame.title,
    kind: frame.kind,
    deviceId: frame.deviceId,
    x: frame.x,
    y: frame.y,
    sourceHash
  }
  if (frame.orientation !== undefined) snap.orientation = frame.orientation
  if (frame.showShell !== undefined) snap.showShell = frame.showShell
  if (frame.width !== undefined) snap.width = frame.width
  if (frame.height !== undefined) snap.height = frame.height
  if (frame.sourceRef !== undefined) snap.sourceRef = frame.sourceRef
  return snap
}

export function materializeSnapshot(
  state: TdsCanvasHistoryState,
  entry: TdsCanvasHistoryEntry
): TdsCanvasFrame[] {
  return entry.frameSnapshots.map((snap) => {
    const frame: TdsCanvasFrame = {
      id: snap.id,
      title: snap.title,
      kind: snap.kind,
      source: state.blobs[snap.sourceHash] ?? '',
      deviceId: snap.deviceId,
      x: snap.x,
      y: snap.y
    }
    if (snap.orientation !== undefined) frame.orientation = snap.orientation
    if (snap.showShell !== undefined) frame.showShell = snap.showShell
    if (snap.width !== undefined) frame.width = snap.width
    if (snap.height !== undefined) frame.height = snap.height
    if (snap.sourceRef !== undefined) frame.sourceRef = snap.sourceRef
    return frame
  })
}

function pruneUnreferencedBlobs(
  blobs: Record<string, string>,
  entries: readonly TdsCanvasHistoryEntry[]
): Record<string, string> {
  const referenced = new Set<string>()
  for (const entry of entries) {
    for (const snap of entry.frameSnapshots) {
      referenced.add(snap.sourceHash)
    }
  }
  const nextBlobs: Record<string, string> = {}
  for (const hash of referenced) {
    if (hash in blobs) {
      nextBlobs[hash] = blobs[hash]!
    }
  }
  return nextBlobs
}

function buildEntryId(entriesCount: number, createdAt: number): string {
  return `snap-${createdAt.toString(36)}-${(entriesCount + 1).toString(36)}`
}

export interface CommitSnapshotOptions {
  now?: number
  id?: string
  maxEntries?: number
  maxBlobs?: number
  /**
   * When true, appends at the end of the timeline without dropping entries after `cursor`.
   * Used by `restoreSnapshot` so pre-restore states remain intact.
   */
  preserveFuture?: boolean
}

export function commitSnapshot(
  state: TdsCanvasHistoryState,
  label: string,
  frames: readonly TdsCanvasFrame[],
  options: CommitSnapshotOptions = {}
): { state: TdsCanvasHistoryState; entry: TdsCanvasHistoryEntry } {
  const createdAt = options.now ?? Date.now()
  const maxEntries = Math.max(2, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
  const maxBlobs = Math.max(1, options.maxBlobs ?? DEFAULT_MAX_BLOBS)
  const baseEntries = options.preserveFuture
    ? [...state.entries]
    : state.cursor >= 0
      ? state.entries.slice(0, state.cursor + 1)
      : []

  const nextBlobs: Record<string, string> = { ...state.blobs }
  const frameSnapshots = frames.map((frame) => toFrameSnapshot(frame, nextBlobs))
  const entry: TdsCanvasHistoryEntry = {
    id: options.id ?? buildEntryId(baseEntries.length, createdAt),
    label: label.trim() || 'Snapshot',
    createdAt,
    frameSnapshots
  }

  let nextEntries = [...baseEntries, entry]
  if (nextEntries.length > maxEntries) {
    nextEntries = nextEntries.slice(nextEntries.length - maxEntries)
  }

  let prunedBlobs = pruneUnreferencedBlobs(nextBlobs, nextEntries)
  // Never drop a blob that is still referenced by a retained snapshot: prune oldest snapshots first
  // so every retained entry can always materialize its full frame source cleanly.
  while (Object.keys(prunedBlobs).length > maxBlobs && nextEntries.length > 1) {
    nextEntries = nextEntries.slice(1)
    prunedBlobs = pruneUnreferencedBlobs(nextBlobs, nextEntries)
  }

  return {
    state: {
      blobs: prunedBlobs,
      entries: nextEntries,
      cursor: nextEntries.length - 1
    },
    entry
  }
}

export function undoSnapshot(state: TdsCanvasHistoryState): {
  state: TdsCanvasHistoryState
  entry: TdsCanvasHistoryEntry | null
  frames: TdsCanvasFrame[] | null
} {
  if (state.cursor <= 0 || state.entries.length === 0) {
    return { state, entry: null, frames: null }
  }
  const nextCursor = state.cursor - 1
  const entry = state.entries[nextCursor] ?? null
  if (!entry) {
    return { state, entry: null, frames: null }
  }
  const nextState: TdsCanvasHistoryState = {
    ...state,
    cursor: nextCursor
  }
  return {
    state: nextState,
    entry,
    frames: materializeSnapshot(nextState, entry)
  }
}

export function redoSnapshot(state: TdsCanvasHistoryState): {
  state: TdsCanvasHistoryState
  entry: TdsCanvasHistoryEntry | null
  frames: TdsCanvasFrame[] | null
} {
  if (state.cursor < 0 || state.cursor >= state.entries.length - 1) {
    return { state, entry: null, frames: null }
  }
  const nextCursor = state.cursor + 1
  const entry = state.entries[nextCursor] ?? null
  if (!entry) {
    return { state, entry: null, frames: null }
  }
  const nextState: TdsCanvasHistoryState = {
    ...state,
    cursor: nextCursor
  }
  return {
    state: nextState,
    entry,
    frames: materializeSnapshot(nextState, entry)
  }
}

/**
 * Non-destructive preview of a snapshot by id; leaves `state` and `cursor` untouched.
 */
export function peekSnapshot(state: TdsCanvasHistoryState, id: string): TdsCanvasFrame[] | null {
  const entry = state.entries.find((item) => item.id === id)
  if (!entry) return null
  return materializeSnapshot(state, entry)
}

/**
 * Forward-commits a restored copy of snapshot `id` onto the timeline so pre-restore
 * snapshots are never destroyed and can always be undone or re-inspected.
 */
export function restoreSnapshot(
  state: TdsCanvasHistoryState,
  id: string,
  options: { label?: string; now?: number; maxEntries?: number } = {}
): {
  state: TdsCanvasHistoryState
  entry: TdsCanvasHistoryEntry
  frames: TdsCanvasFrame[]
} | null {
  const target = state.entries.find((item) => item.id === id)
  if (!target) return null
  const frames = materializeSnapshot(state, target)
  const label = options.label ?? `Restore: ${target.label}`
  const committed = commitSnapshot(state, label, frames, {
    now: options.now,
    maxEntries: options.maxEntries,
    preserveFuture: true
  })
  return {
    state: committed.state,
    entry: committed.entry,
    frames
  }
}

function isFrameSnapshotEqual(a: TdsCanvasFrameSnapshot, b: TdsCanvasFrameSnapshot): boolean {
  return (
    a.sourceHash === b.sourceHash &&
    a.title === b.title &&
    a.kind === b.kind &&
    a.deviceId === b.deviceId &&
    a.orientation === b.orientation &&
    a.showShell === b.showShell &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  )
}

export function diffSnapshots(
  state: TdsCanvasHistoryState,
  aId: string,
  bId: string
): TdsCanvasSnapshotDiff {
  const aEntry = state.entries.find((item) => item.id === aId)
  const bEntry = state.entries.find((item) => item.id === bId)

  const aMap = new Map<string, TdsCanvasFrameSnapshot>(
    (aEntry?.frameSnapshots ?? []).map((snap) => [snap.id, snap])
  )
  const bMap = new Map<string, TdsCanvasFrameSnapshot>(
    (bEntry?.frameSnapshots ?? []).map((snap) => [snap.id, snap])
  )

  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const [id, bSnap] of bMap) {
    const aSnap = aMap.get(id)
    if (!aSnap) {
      added.push(id)
    } else if (!isFrameSnapshotEqual(aSnap, bSnap)) {
      modified.push(id)
    }
  }

  for (const id of aMap.keys()) {
    if (!bMap.has(id)) {
      removed.push(id)
    }
  }

  return {
    added,
    removed,
    modified,
    changedCount: added.length + removed.length + modified.length
  }
}

export interface CanvasHistoryController {
  getState: () => TdsCanvasHistoryState
  getEntries: () => readonly TdsCanvasHistoryEntry[]
  getCurrentEntry: () => TdsCanvasHistoryEntry | null
  getBlobCount: () => number
  canUndo: () => boolean
  canRedo: () => boolean
  commitSnapshot: (
    label: string,
    frames: readonly TdsCanvasFrame[],
    options?: CommitSnapshotOptions
  ) => TdsCanvasHistoryEntry
  undo: () => TdsCanvasFrame[] | null
  redo: () => TdsCanvasFrame[] | null
  peekSnapshot: (id: string) => TdsCanvasFrame[] | null
  restoreSnapshot: (
    id: string,
    options?: { label?: string; now?: number }
  ) => TdsCanvasFrame[] | null
  diffSnapshots: (aId: string, bId: string) => TdsCanvasSnapshotDiff
}

export function createCanvasHistory(
  initialState?: TdsCanvasHistoryState | null
): CanvasHistoryController {
  let state: TdsCanvasHistoryState = initialState
    ? {
        blobs: { ...initialState.blobs },
        entries: initialState.entries.map((entry) => ({
          ...entry,
          frameSnapshots: entry.frameSnapshots.map((snap) => ({ ...snap }))
        })),
        cursor: initialState.cursor
      }
    : createCanvasHistoryState()

  return {
    getState: () => state,
    getEntries: () => state.entries,
    getCurrentEntry: () => (state.cursor >= 0 ? (state.entries[state.cursor] ?? null) : null),
    getBlobCount: () => Object.keys(state.blobs).length,
    canUndo: () => state.cursor > 0,
    canRedo: () => state.cursor >= 0 && state.cursor < state.entries.length - 1,
    commitSnapshot(label, frames, options) {
      const result = commitSnapshot(state, label, frames, options)
      state = result.state
      return result.entry
    },
    undo() {
      const result = undoSnapshot(state)
      state = result.state
      return result.frames
    },
    redo() {
      const result = redoSnapshot(state)
      state = result.state
      return result.frames
    },
    peekSnapshot(id) {
      return peekSnapshot(state, id)
    },
    restoreSnapshot(id, options) {
      const result = restoreSnapshot(state, id, options)
      if (!result) return null
      state = result.state
      return result.frames
    },
    diffSnapshots(aId, bId) {
      return diffSnapshots(state, aId, bId)
    }
  }
}
