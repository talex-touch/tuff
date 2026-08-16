// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/** Built-in glyphs. Anything else falls through to the `row-icon` slot. */
export type ToolChipIcon = 'think' | 'write' | 'run' | 'read'

export interface ToolChipDetailLine {
  text: string
  /** `add` reads as success, `del` as danger; anything else stays muted. */
  tone?: 'add' | 'del'
}

export interface ToolChipRow {
  id: string
  label: string
  /** Trailing truncating chip — the argument, path or command. */
  chip?: string
  icon?: ToolChipIcon | (string & {})
  /** Render the chip in the mono face (paths, commands). */
  mono?: boolean
  /** Render the detail lines in the mono face (code, logs). */
  detailMono?: boolean
  detail?: ToolChipDetailLine[]
}

export interface ToolChipDiff {
  file: string
  /** Added line count, rendered `+N`. */
  add: number
  /** Removed line count, rendered `−N` (U+2212). Zero hides the counter. */
  del: number
}

export interface ToolChipsProps {
  rows: ToolChipRow[]
  /** Diff summary appended under a divider. Omit to hide the whole section. */
  diffs?: ToolChipDiff[]
  /** Header text. Falls back to `summaryFormatter(rows.length)`. */
  summary?: string
  /** @default n => `${n} tool call(s)` */
  summaryFormatter?: (rowCount: number) => string
  /** `v-model:open` — the whole run. Omit to let the component own it. */
  open?: boolean
  /** Initial open state when uncontrolled. @default true */
  defaultOpen?: boolean
  /** `v-model:expandedRows` — ids of the expanded rows. */
  expandedRows?: string[]
  /** Ids expanded on first render when uncontrolled. */
  defaultExpandedRows?: string[]
  /** Diffs beyond `diffs`, surfaced as a `+N more` control. */
  moreCount?: number
  /** @default n => `+${n} more` */
  moreLabelFormatter?: (count: number) => string
}

export interface ToolChipsEmits {
  (e: 'update:open', open: boolean): void
  (e: 'update:expandedRows', ids: string[]): void
  (e: 'toggle', id: string, expanded: boolean): void
  (e: 'rowClick', row: ToolChipRow): void
  (e: 'diffClick', diff: ToolChipDiff): void
  (e: 'more'): void
}

export interface DiffChipsProps {
  diffs: ToolChipDiff[]
  /** Diffs not present in `diffs`, surfaced as a `+N more` control. */
  moreCount?: number
  /** @default n => `+${n} more` */
  moreLabelFormatter?: (count: number) => string
  /** Entrance stagger between chips, in ms. @default 80 */
  staggerStep?: number
}

export interface DiffChipsEmits {
  (e: 'select', diff: ToolChipDiff): void
  (e: 'more'): void
}
