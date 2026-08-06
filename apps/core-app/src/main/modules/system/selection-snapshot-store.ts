export interface SelectionSnapshot {
  text: string
  capturedAt: number
}

/**
 * Last successful text selection capture, in memory only.
 *
 * Lives apart from `selection-capture.ts` so readers (the recommendation
 * context provider) do not drag the capture machinery — Electron clipboard,
 * osascript, platform shortcuts — into their import graph.
 */
let latestSelectionSnapshot: SelectionSnapshot | null = null

export const selectionSnapshotStore = {
  get(): SelectionSnapshot | null {
    return latestSelectionSnapshot
  },
  set(snapshot: SelectionSnapshot | null): void {
    latestSelectionSnapshot = snapshot
  },
  clear(): void {
    latestSelectionSnapshot = null
  }
}
