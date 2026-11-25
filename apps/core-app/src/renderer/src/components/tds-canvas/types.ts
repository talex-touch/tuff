import type { DeviceOrientation } from '../preview/tds-devices'

export type TdsCanvasFrameKind = 'html' | 'svg'

export type TdsCanvasTool = 'select' | 'hand' | 'note'

export type TdsCanvasPattern = 'none' | 'dots' | 'grid' | 'paper-grain'

export interface TdsCanvasFrame {
  id: string
  title: string
  kind: TdsCanvasFrameKind
  /** Raw HTML or SVG document source rendered inside the zero-network sandboxed iframe. */
  source: string
  /** Device preset id from `../preview/tds-devices` (e.g. `'iphone-17-pro'`, `'desktop-hd'`, `'responsive'`). */
  deviceId: string
  orientation?: DeviceOrientation
  showShell?: boolean
  /** World-space top-left X coordinate (px). */
  x: number
  /** World-space top-left Y coordinate (px). */
  y: number
  /** Explicit logical viewport width in px (used when `deviceId === 'responsive'`). */
  width?: number
  /** Explicit logical viewport height in px (used when `deviceId === 'responsive'`). */
  height?: number
  /** Optional provenance tag (e.g. conversation message id or workspace file path). */
  sourceRef?: string
}

export interface TdsCanvasNote {
  id: string
  frameId: string
  /** Normalized X coordinate within the frame screen `[0, 1]`. */
  xRatio: number
  /** Normalized Y coordinate within the frame screen `[0, 1]`. */
  yRatio: number
  text: string
  resolved: boolean
  createdAt: number
}

export interface TdsCanvasLintCount {
  errors: number
  warnings: number
}

export interface TdsCanvasAddFramePayload {
  deviceId: string
  kind: TdsCanvasFrameKind
  title: string
}

export interface TdsCanvasSendNotesPayload {
  prompt: string
  noteIds: string[]
}

export interface TdsCanvasAskFramePayload {
  frameId: string
  prompt: string
}

export interface TdsCanvasPoint {
  x: number
  y: number
}

export interface TdsCanvasSize {
  width: number
  height: number
}

export interface TdsCanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TdsCanvasViewport {
  k: number
  tx: number
  ty: number
}

export type SnapGuideAxis = 'x' | 'y'

export type SnapAnchorKind = 'start' | 'center' | 'end'

export interface SnapGuide {
  axis: SnapGuideAxis
  /** World-space coordinate of the alignment line (`x` for vertical, `y` for horizontal). */
  position: number
  /** Start extent along the perpendicular axis (world px). */
  start: number
  /** End extent along the perpendicular axis (world px). */
  end: number
  anchor: SnapAnchorKind
}

export interface FrameSnapResult {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
  guides: SnapGuide[]
}

export interface ArrangeFramesOptions {
  columns?: number
  gapX?: number
  gapY?: number
  originX?: number
  originY?: number
}

export interface TdsCanvasFrameSnapshot {
  id: string
  title: string
  kind: TdsCanvasFrameKind
  deviceId: string
  orientation?: DeviceOrientation
  showShell?: boolean
  x: number
  y: number
  width?: number
  height?: number
  sourceRef?: string
  /** Deterministic content-addressed blob hash referencing `TdsCanvasHistoryState.blobs`. */
  sourceHash: string
}

export interface TdsCanvasHistoryEntry {
  id: string
  label: string
  createdAt: number
  frameSnapshots: TdsCanvasFrameSnapshot[]
}

export interface TdsCanvasHistoryState {
  blobs: Record<string, string>
  entries: TdsCanvasHistoryEntry[]
  /** Index of the active snapshot in `entries`, or `-1` when no snapshot exists yet. */
  cursor: number
}

export interface TdsCanvasSnapshotDiff {
  added: string[]
  removed: string[]
  modified: string[]
  changedCount: number
}

export interface TdsCanvasLabels {
  selectTool: string
  handTool: string
  noteTool: string
  fitToScreen: string
  zoomIn: string
  zoomOut: string
  zoomReset: string
  autoArrange: string
  addFrame: string
  deleteFrame: string
  deviceSwitcher: string
  deviceSearchPlaceholder: string
  deviceResponsive: string
  rotateOrientation: string
  toggleShell: string
  lintBadgeTitle: string
  lintClean: string
  notesPanelTitle: string
  notePlaceholder: string
  noteSave: string
  noteCancel: string
  noteResolve: string
  noteReopen: string
  noteDelete: string
  sendNotesToAi: string
  askFrameAi: string
  askFramePlaceholder: string
  askFrameSend: string
  historyToggle: string
  historyEmpty: string
  historySaveSnapshot: string
  historySnapshotDefault: string
  historyUndo: string
  historyRedo: string
  historyPeek: string
  historyExitPeek: string
  historyRestore: string
  compareToggle: string
  compareExit: string
  compareBefore: string
  compareAfter: string
  compareSelectSnapshot: string
  compareNoEarlierSnapshot: string
  emptyTitle: string
  emptyDescription: string
  emptyAddPhone: string
  emptyAddDesktop: string
  mockupExport: string
  mockupDialogTitle: string
  mockupClose: string
  mockupFramesSection: string
  mockupSelectAll: string
  mockupSelectNone: string
  mockupBackdropSection: string
  mockupBackdropObsidian: string
  mockupBackdropStudio: string
  mockupBackdropSlate: string
  mockupBackdropTransparent: string
  mockupLayoutSection: string
  mockupPerPage: string
  mockupScale: string
  mockupBezelWidth: string
  mockupCornerRadius: string
  mockupShadow: string
  mockupBrand: string
  mockupShowTitles: string
  mockupPage: string
  mockupPrevPage: string
  mockupNextPage: string
  mockupEmptySelection: string
  mockupExportSvg: string
  mockupExportPng: string
  mockupExportPrintHtml: string
  mockupExporting: string
}

export const DEFAULT_TDS_CANVAS_LABELS: Readonly<TdsCanvasLabels> = {
  selectTool: 'Select (V)',
  handTool: 'Hand pan (H / Space)',
  noteTool: 'Pin note (C)',
  fitToScreen: 'Fit to screen',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Reset zoom to 100%',
  autoArrange: 'Auto-arrange frames',
  addFrame: 'Add frame',
  deleteFrame: 'Delete frame',
  deviceSwitcher: 'Switch device frame',
  deviceSearchPlaceholder: 'Search devices...',
  deviceResponsive: 'Responsive',
  rotateOrientation: 'Rotate orientation',
  toggleShell: 'Toggle device bezel',
  lintBadgeTitle: 'Inspect visual lint issues',
  lintClean: 'Lint clean',
  notesPanelTitle: 'Pin notes',
  notePlaceholder: 'Leave a visual note for AI...',
  noteSave: 'Save note',
  noteCancel: 'Cancel',
  noteResolve: 'Resolve',
  noteReopen: 'Reopen',
  noteDelete: 'Delete',
  sendNotesToAi: 'Send pending notes to AI',
  askFrameAi: 'Ask AI about frame',
  askFramePlaceholder: 'Describe a visual change for this frame...',
  askFrameSend: 'Send',
  historyToggle: 'History',
  historyEmpty: 'No snapshots yet',
  historySaveSnapshot: 'Save snapshot',
  historySnapshotDefault: 'Snapshot',
  historyUndo: 'Undo',
  historyRedo: 'Redo',
  historyPeek: 'Peek',
  historyExitPeek: 'Exit peek',
  historyRestore: 'Restore',
  compareToggle: 'Compare',
  compareExit: 'Exit compare',
  compareBefore: 'Before',
  compareAfter: 'After',
  compareSelectSnapshot: 'Compare with snapshot',
  compareNoEarlierSnapshot: 'Save a snapshot first to compare before/after.',
  emptyTitle: 'Design canvas is empty',
  emptyDescription:
    'Add a device frame or let AI generate HTML/SVG screens to inspect side by side.',
  emptyAddPhone: 'Add iPhone 17 Pro',
  emptyAddDesktop: 'Add Desktop HD',
  mockupExport: 'Export mockup',
  mockupDialogTitle: 'Export mockup showcase',
  mockupClose: 'Close',
  mockupFramesSection: 'Frames',
  mockupSelectAll: 'Select all',
  mockupSelectNone: 'Clear',
  mockupBackdropSection: 'Backdrop',
  mockupBackdropObsidian: 'Dark Obsidian',
  mockupBackdropStudio: 'Studio Light',
  mockupBackdropSlate: 'Neutral Slate',
  mockupBackdropTransparent: 'Transparent',
  mockupLayoutSection: 'Layout',
  mockupPerPage: 'Per board',
  mockupScale: 'Scale',
  mockupBezelWidth: 'Bezel',
  mockupCornerRadius: 'Radius',
  mockupShadow: 'Drop shadow',
  mockupBrand: 'TDS watermark',
  mockupShowTitles: 'Frame titles',
  mockupPage: 'Board',
  mockupPrevPage: 'Previous board',
  mockupNextPage: 'Next board',
  mockupEmptySelection: 'Select at least one frame to preview and export.',
  mockupExportSvg: 'Export SVG',
  mockupExportPng: 'Export PNG',
  mockupExportPrintHtml: 'Print / Save PDF',
  mockupExporting: 'Exporting…'
}

export type TdsMockupExportFormat = 'svg' | 'png' | 'print-html'

export interface TdsMockupExportEventPayload {
  format: TdsMockupExportFormat
  pageCount: number
  frameIds: string[]
}

export interface TdsDesignCanvasProps {
  frames: TdsCanvasFrame[]
  notes?: TdsCanvasNote[]
  selectedFrameId?: string | null
  labels?: Partial<TdsCanvasLabels>
  aiActionsEnabled?: boolean
  lintCounts?: Record<string, TdsCanvasLintCount>
  initialHistory?: TdsCanvasHistoryState | null
  /** Optional sanitized CSS (e.g. TDS Theme Pack tokens) injected into every sandboxed frame. */
  themeCss?: string
  /** Pure CSS background pattern rendered on the infinite canvas stage. */
  canvasPattern?: TdsCanvasPattern
}
