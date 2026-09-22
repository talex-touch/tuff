<script setup lang="ts" generic="T">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { DiffChangeKind, DiffTableColumn, DiffTableCounts, DiffTableEmits, DiffTableProps, DiffTableRow } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'TxDiffTable' })

const props = withDefaults(defineProps<DiffTableProps<T>>(), {
  columns: () => [],
  rows: () => [],
  play: 'auto',
  stageDelays: () => [800, 1000, 1000],
  duration: 400,
  selectable: false,
  footer: false,
  // Vue hands an absent prop to the component as `undefined` only if the default
  // says so — for arrays the factory would run and produce `[]`, which is a
  // legitimate "nothing accepted" value and would make the uncontrolled branch
  // unreachable.
  modelValue: undefined,
  hint: '',
  summaryFormatter: undefined,
  applyLabelFormatter: undefined,
  rowToggleLabelFormatter: undefined,
})

const emit = defineEmits<DiffTableEmits>()

defineSlots<{
  /** Replaces the card bar heading. */
  title?: () => any
  /** Replaces the hint at the right end of the title bar. */
  hint?: () => any
  /** Replaces the whole footer. */
  footer?: (props: { counts: DiffTableCounts, accepted: (string | number)[] }) => any
  /** Per-column cell body. `change` lets the slot react to the row's own state. */
  [key: `cell-${string}`]: (props: {
    row: DiffTableRow<T>
    column: DiffTableColumn<T>
    value: any
    change: DiffChangeKind
    index: number
  }) => any
}>()

// Stage 0 and 1 are both plain — the first delay is a reading pause, matching
// upstream, where the tint guard is `stage >= 2`. Stage 2 tints the outgoing
// rows, stage 3 expands the incoming ones and is terminal.
const TINT_STAGE = 2
const EXPAND_STAGE = 3

const stage = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null

const finalStage = computed(() => props.stageDelays.length)
const tinted = computed(() => stage.value >= TINT_STAGE)
const expanded = computed(() => stage.value >= EXPAND_STAGE)

function clearTimer(): void {
  if (timer === null)
    return
  clearTimeout(timer)
  timer = null
}

function setStage(next: number): void {
  if (next === stage.value)
    return
  stage.value = next
  emit('stageChange', next)
  if (next >= finalStage.value)
    emit('settled')
}

function schedule(): void {
  clearTimer()
  if (stage.value >= finalStage.value)
    return
  const delay = props.stageDelays[stage.value] ?? 0
  timer = setTimeout(() => {
    timer = null
    setStage(stage.value + 1)
    schedule()
  }, delay)
}

/** Runs the sequence from wherever it currently rests. */
function play(): void {
  schedule()
}

/** Returns to the plain table and stops any pending stage. */
function reset(): void {
  clearTimer()
  stage.value = 0
  emit('stageChange', 0)
}

/** Jumps straight to the completed diff. */
function settle(): void {
  clearTimer()
  setStage(finalStage.value)
}

// Reduced motion keeps the state machine — only the tweens are dropped, in CSS.
// Freezing the sequence would leave the reader looking at a table that never
// shows the diff at all.
onMounted(() => {
  if (props.play === 'settled')
    settle()
  else if (props.play === 'auto')
    play()
})

watch(
  () => props.play,
  (mode) => {
    if (mode === 'settled')
      settle()
    else if (mode === 'auto')
      play()
    else
      clearTimer()
  },
)

onBeforeUnmount(clearTimer)

function trackOf(column: DiffTableColumn<T>): string {
  if (column.width === undefined)
    return 'minmax(0, 1fr)'
  return typeof column.width === 'number' ? `${column.width}px` : column.width
}

// The appended row cannot be a <tr> (a table row has no height to animate), so
// it lives in a colspan cell whose inner grid has to line up with the columns.
// Deriving both tracks and <colgroup> from `columns` keeps that one truth — the
// accept control is a real extra column, so it has to join both.
const SELECT_TRACK = '44px'

const gridTemplateColumns = computed(() => {
  const tracks = props.columns.map(trackOf)
  if (!props.selectable)
    return tracks.join(' ')
  // The control column is a fixed strip, and a percentage set that already
  // totals 100% would push it past the grid's right edge — where `overflow:
  // hidden` eats it, so the appended row silently loses its control while every
  // <tr> above keeps one. Each percentage track gives back an equal share.
  const share = `${SELECT_TRACK} / ${tracks.length}`
  const shrunk = tracks.map(track => (track.endsWith('%') ? `calc(${track} - ${share})` : track))
  return `${shrunk.join(' ')} ${SELECT_TRACK}`
})

const columnSpan = computed(() => props.columns.length + (props.selectable ? 1 : 0))

function changeOf(row: DiffTableRow<T>): DiffChangeKind {
  return row.change ?? 'unchanged'
}

const bodyRows = computed(() => props.rows.map((row, index) => ({ row, index, change: changeOf(row) })))

function cellValue(row: DiffTableRow<T>, column: DiffTableColumn<T>): any {
  const key = column.dataIndex ?? column.key
  return (row.data as Record<string, any> | undefined)?.[key]
}

function formatCell(row: DiffTableRow<T>, column: DiffTableColumn<T>, index: number): string {
  const value = cellValue(row, column)
  if (column.format)
    return column.format(value, row.data, index)
  return value == null ? '' : String(value)
}

function rowClass(change: DiffChangeKind) {
  return [`is-${change}`, { 'is-tinted': tinted.value }]
}

function cellClass(column: DiffTableColumn<T>, change: DiffChangeKind) {
  const marks = tinted.value && (change === 'removed' || change === 'modified')
  return [
    `is-align-${column.align ?? 'left'}`,
    {
      'is-tinted': marks && column.tintText !== false,
      'is-struck': marks && change === 'removed' && Boolean(column.strikeOnRemove),
    },
  ]
}

const shellStyle = computed(() => ({
  '--tx-bui-diff-table-duration': `${props.duration}ms`,
}))

// ── Accept / reject bookkeeping ──────────────────────────────────────────────
//
// Two modes on one surface. With `modelValue` bound the component is fully
// controlled and never writes. Without it, it tracks *rejections* rather than
// acceptances, so a row streamed in later arrives accepted like its neighbours
// instead of silently defaulting to off.

const internalRejected = ref<Set<string | number>>(new Set())

const changedKeys = computed(() =>
  props.rows.filter(row => changeOf(row) !== 'unchanged').map(row => row.key),
)

const acceptedKeys = computed<(string | number)[]>(() => {
  if (props.modelValue !== undefined)
    return props.modelValue
  return changedKeys.value.filter(key => !internalRejected.value.has(key))
})

const acceptedSet = computed(() => new Set(acceptedKeys.value))

function isAccepted(key: string | number): boolean {
  return acceptedSet.value.has(key)
}

function toggleRow(row: DiffTableRow<T>): void {
  const change = changeOf(row)
  if (!props.selectable || change === 'unchanged')
    return

  const key = row.key
  const accepted = !isAccepted(key)
  // Rebuild from `changedKeys` rather than appending, so the emitted array
  // keeps row order instead of toggle order.
  const nextKeys = accepted
    ? changedKeys.value.filter(candidate => candidate === key || acceptedSet.value.has(candidate))
    : acceptedKeys.value.filter(candidate => candidate !== key)

  if (props.modelValue === undefined) {
    const next = new Set(internalRejected.value)
    if (accepted)
      next.delete(key)
    else
      next.add(key)
    internalRejected.value = next
  }

  emit('update:modelValue', nextKeys)
  emit('toggle', { key, accepted })
}

/** Tallies only accepted rows, so the footer reports what apply would do. */
const counts = computed<DiffTableCounts>(() => {
  let added = 0
  let removed = 0
  let modified = 0
  for (const row of props.rows) {
    if (!acceptedSet.value.has(row.key))
      continue
    const change = changeOf(row)
    if (change === 'added')
      added += 1
    else if (change === 'removed')
      removed += 1
    else if (change === 'modified')
      modified += 1
  }
  return { added, removed, modified, total: added + removed + modified }
})

function defaultSummary(tally: DiffTableCounts): string {
  const parts: string[] = []
  if (tally.removed)
    parts.push(`${tally.removed} removal${tally.removed === 1 ? '' : 's'}`)
  if (tally.added)
    parts.push(`${tally.added} addition${tally.added === 1 ? '' : 's'}`)
  if (tally.modified)
    parts.push(`${tally.modified} change${tally.modified === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

const summaryText = computed(() => (props.summaryFormatter ?? defaultSummary)(counts.value))

const applyLabel = computed(() => {
  const total = counts.value.total
  if (props.applyLabelFormatter)
    return props.applyLabelFormatter(total)
  return `Apply ${total} change${total === 1 ? '' : 's'}`
})

function rowToggleLabel(accepted: boolean, change: DiffChangeKind): string {
  if (props.rowToggleLabelFormatter)
    return props.rowToggleLabelFormatter(accepted, change)
  return accepted ? 'Reject this change' : 'Accept this change'
}

function onApply(): void {
  emit('apply', acceptedKeys.value)
}

defineExpose({ play, reset, settle, stage })
</script>

<template>
  <div class="tx-bui-diff-table" :style="shellStyle">
    <div class="tx-bui-diff-table__shell">
      <div v-if="title || $slots.title || hint || $slots.hint" class="tx-bui-diff-table__bar">
        <span class="tx-bui-diff-table__title">
          <slot name="title">{{ title }}</slot>
        </span>
        <span v-if="hint || $slots.hint" class="tx-bui-diff-table__hint">
          <slot name="hint">{{ hint }}</slot>
        </span>
      </div>

      <table class="tx-bui-diff-table__table">
        <colgroup>
          <col
            v-for="column in columns"
            :key="column.key"
            :style="column.width === undefined ? undefined : { width: trackOf(column) }"
          >
          <col v-if="selectable" :style="{ width: SELECT_TRACK }">
        </colgroup>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              class="tx-bui-diff-table__th"
              :class="`is-align-${column.align ?? 'left'}`"
            >
              {{ column.title }}
            </th>
            <th v-if="selectable" scope="col" class="tx-bui-diff-table__th">
              <span class="tx-bui-diff-table__sr">{{ rowToggleLabel(false, 'modified') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in bodyRows" :key="entry.row.key">
            <tr v-if="entry.change === 'added'" class="tx-bui-diff-table__added">
              <td :colspan="columnSpan" class="tx-bui-diff-table__added-cell">
                <div class="tx-bui-diff-table__reveal" :class="{ 'is-open': expanded }">
                  <div class="tx-bui-diff-table__reveal-inner">
                    <div
                      class="tx-bui-diff-table__added-grid"
                      :style="{ gridTemplateColumns }"
                      :aria-hidden="expanded ? undefined : 'true'"
                      :inert="expanded ? undefined : true"
                    >
                      <span
                        v-for="column in columns"
                        :key="column.key"
                        class="tx-bui-diff-table__cell is-added"
                        :class="cellClass(column, entry.change)"
                      >
                        <slot
                          :name="`cell-${column.key}`"
                          :row="entry.row"
                          :column="column"
                          :value="cellValue(entry.row, column)"
                          :change="entry.change"
                          :index="entry.index"
                        >
                          {{ formatCell(entry.row, column, entry.index) }}
                        </slot>
                      </span>
                      <span v-if="selectable" class="tx-bui-diff-table__cell is-select">
                        <button
                          type="button"
                          class="tx-bui-diff-table__accept is-added"
                          :class="{ 'is-on': isAccepted(entry.row.key) }"
                          :aria-pressed="isAccepted(entry.row.key)"
                          :aria-label="rowToggleLabel(isAccepted(entry.row.key), entry.change)"
                          @click.stop="toggleRow(entry.row)"
                        >
                          <i class="i-carbon-checkmark" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
            <tr
              v-else
              class="tx-bui-diff-table__row"
              :class="[rowClass(entry.change), { 'is-toggleable': selectable && entry.change !== 'unchanged' }]"
              @click="toggleRow(entry.row)"
            >
              <td
                v-for="column in columns"
                :key="column.key"
                class="tx-bui-diff-table__cell"
                :class="cellClass(column, entry.change)"
              >
                <slot
                  :name="`cell-${column.key}`"
                  :row="entry.row"
                  :column="column"
                  :value="cellValue(entry.row, column)"
                  :change="entry.change"
                  :index="entry.index"
                >
                  {{ formatCell(entry.row, column, entry.index) }}
                </slot>
              </td>
              <td v-if="selectable" class="tx-bui-diff-table__cell is-select">
                <button
                  v-if="entry.change !== 'unchanged'"
                  type="button"
                  class="tx-bui-diff-table__accept"
                  :class="[`is-${entry.change}`, { 'is-on': isAccepted(entry.row.key) }]"
                  :aria-pressed="isAccepted(entry.row.key)"
                  :aria-label="rowToggleLabel(isAccepted(entry.row.key), entry.change)"
                  @click.stop="toggleRow(entry.row)"
                >
                  <i class="i-carbon-checkmark" aria-hidden="true" />
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <slot name="footer" :counts="counts" :accepted="acceptedKeys">
        <div v-if="footer" class="tx-bui-diff-table__foot">
          <span class="tx-bui-diff-table__summary">{{ summaryText }}</span>
          <button
            type="button"
            class="tx-bui-diff-table__apply"
            :disabled="counts.total === 0"
            @click="onApply"
          >
            {{ applyLabel }}
          </button>
        </div>
      </slot>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-diff-table {
  @include bui-scope;

  width: 100%;
}

.tx-bui-diff-table__shell {
  position: relative;
  overflow: hidden;
  border-radius: var(--tx-bui-radius-card, 10px);
  background: var(--tx-bui-surface, #fff);
  // The hairline is the shadow ring, never a border — pairing both draws two
  // lines a pixel apart.
  box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);
}

.tx-bui-diff-table__bar {
  @include bui-card-bar;

  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-diff-table__title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
}

// Secondary to the title, and it names an affordance rather than content, so it
// takes the muted ink and drops a step in size.
.tx-bui-diff-table__hint {
  font-size: 11.5px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

// Never `display: none` — that drops the node out of the a11y tree, which is
// the opposite of what this is for.
.tx-bui-diff-table__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.tx-bui-diff-table__row.is-toggleable {
  cursor: pointer;
}

.tx-bui-diff-table__cell.is-select {
  width: 44px;
  padding-right: 10px;
  text-align: right;
  vertical-align: middle;
}

// A filled disc in the row's own tone. White on a solid semantic fill is not a
// supported pairing in this library (see tuffex-design-rules.md), so the glyph
// is the row's tint — the same near-white the row is already painted with —
// which reads as a knockout while keeping the contrast the tint already has.
.tx-bui-diff-table__accept {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--tx-bui-radius-chip, 6px);
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--tx-bui-line-strong, #e0e2e5);
  color: transparent;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 2px;
  }

  &.is-on {
    box-shadow: none;
  }

  &.is-on.is-removed,
  &.is-on.is-modified {
    background: var(--tx-bui-red, #e3474c);
    color: var(--tx-bui-red-tint, #fcecec);
  }

  &.is-on.is-added {
    background: var(--tx-bui-green, #189a4d);
    color: var(--tx-bui-green-tint, #e8f5ed);
  }
}

.tx-bui-diff-table__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  // A footer that scrolls content past it is separated by a line, not a shadow.
  border-top: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-diff-table__summary {
  font-size: 12px;
  color: var(--tx-bui-ink-2, #62656b);
  font-variant-numeric: tabular-nums;
}

.tx-bui-diff-table__apply {
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-bui-accent, #0285ff);
  color: #fff;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;

  &:disabled {
    background: var(--tx-bui-hover-2, #e7e9eb);
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 2px;
  }
}

.tx-bui-diff-table__table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
}

.tx-bui-diff-table__th {
  @include bui-card-bar;

  font-size: 12px;
  font-weight: 500;
  color: var(--tx-bui-ink-3, #9a9da3);
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-diff-table__cell {
  @include bui-card-bar;
  @include bui-tabular-nums;

  font-size: 12.5px;
  color: var(--tx-bui-ink-2, #62656b);
  // Cells clip rather than wrap: a wrapped value grows the row and knocks the
  // whole table out of its rhythm, and upstream truncates here too. The
  // `is-select` cell opts back out — it holds a fixed-size control, not text.
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition:
    color var(--tx-bui-diff-table-duration, 400ms) var(--tx-transition-function, cubic-bezier(0.4, 0, 0.2, 1)),
    text-decoration-color var(--tx-bui-diff-table-duration, 400ms) var(--tx-transition-function, cubic-bezier(0.4, 0, 0.2, 1));

  &.is-select {
    overflow: visible;
    text-overflow: clip;
  }
}

.tx-bui-diff-table__cell:first-child {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-diff-table__cell.is-align-center {
  text-align: center;
}

.tx-bui-diff-table__cell.is-align-right {
  text-align: right;
}

.tx-bui-diff-table__th.is-align-center {
  text-align: center;
}

.tx-bui-diff-table__th.is-align-right {
  text-align: right;
}

.tx-bui-diff-table__row {
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
  transition: background-color var(--tx-bui-diff-table-duration, 400ms)
    var(--tx-transition-function, cubic-bezier(0.4, 0, 0.2, 1));
}

.tx-bui-diff-table__row:last-child {
  border-bottom: 0;
}

// Row tints are class-driven, not inline styles. Upstream sets `style.background`
// on the outgoing rows, which outranks its own `hover:bg-hover` and silently
// kills hover feedback on exactly the rows a reader wants to inspect.
.tx-bui-diff-table__row:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.tx-bui-diff-table__row.is-removed.is-tinted {
  background: var(--tx-bui-red-tint, #fcecec);
}

.tx-bui-diff-table__row.is-removed.is-tinted:hover {
  background: color-mix(in oklab, var(--tx-bui-red, #e3474c) 18%, transparent);
}

.tx-bui-diff-table__row.is-modified.is-tinted {
  background: var(--tx-bui-orange-tint, #fdf1e5);
}

.tx-bui-diff-table__row.is-modified.is-tinted:hover {
  background: color-mix(in oklab, var(--tx-bui-orange, #ef720c) 18%, transparent);
}

.tx-bui-diff-table__row.is-removed.is-tinted .tx-bui-diff-table__cell.is-tinted,
.tx-bui-diff-table__row.is-removed.is-tinted .tx-bui-diff-table__cell.is-tinted:first-child {
  color: var(--tx-bui-red, #e3474c);
}

.tx-bui-diff-table__row.is-modified.is-tinted .tx-bui-diff-table__cell.is-tinted,
.tx-bui-diff-table__row.is-modified.is-tinted .tx-bui-diff-table__cell.is-tinted:first-child {
  color: var(--tx-bui-orange, #ef720c);
}

.tx-bui-diff-table__cell.is-struck {
  text-decoration-line: line-through;
  text-decoration-color: color-mix(in oklab, var(--tx-bui-red, #e3474c) 50%, transparent);
}

// Non-tinted cells inside a changed row fade instead of recolouring, so chips
// and badges keep their own palette.
.tx-bui-diff-table__row.is-tinted.is-removed .tx-bui-diff-table__cell:not(.is-tinted),
.tx-bui-diff-table__row.is-tinted.is-modified .tx-bui-diff-table__cell:not(.is-tinted) {
  opacity: 0.55;
  transition: opacity var(--tx-bui-diff-table-duration, 400ms)
    var(--tx-transition-function, cubic-bezier(0.4, 0, 0.2, 1));
}

.tx-bui-diff-table__added-cell {
  padding: 0;
}

.tx-bui-diff-table__reveal {
  @include bui-disclosure-collapse(0.4s);

  transition-duration: var(--tx-bui-diff-table-duration, 400ms);
}

.tx-bui-diff-table__reveal-inner {
  background: var(--tx-bui-green-tint, #e8f5ed);
}

.tx-bui-diff-table__added-grid {
  display: grid;
  align-items: center;
  border-top: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-diff-table__cell.is-added {
  display: block;
  color: var(--tx-bui-green, #189a4d);
}

.tx-bui-diff-table__cell.is-added:first-child {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-bui-green, #189a4d);
}

@media (prefers-reduced-motion: reduce) {
  .tx-bui-diff-table__row,
  .tx-bui-diff-table__cell,
  .tx-bui-diff-table__reveal {
    transition: none;
  }
}
</style>
