<script setup lang="ts">
import type { PropType } from 'vue'
import type { TxIconSource } from '../../icon/src/types'
import type {
  ChoiceCardColumns,
  ChoiceCardEmits,
  ChoiceCardProps,
  ChoiceOption,
  ChoiceStep,
  ChoiceStepLabelFormatter,
} from './types'
import { computed, nextTick, ref, useId, watch } from 'vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import TxSkeleton from '../../skeleton/src/TxSkeleton.vue'

defineOptions({ name: 'TxChoiceCard' })

// A runtime object rather than `defineProps<ChoiceCardProps>()`, for the reason TxModeChip
// gives: a type-only declaration is resolved from `types.ts` when this file compiles, and the
// dev server does not recompile it when that file changes. `satisfies` keeps the two in step.
const props = defineProps({
  steps: { type: Array as PropType<ChoiceStep[]>, required: true as const },
  step: { type: Number, default: undefined },
  selected: { type: String, default: undefined },
  loading: { type: Boolean, default: false },
  loadingRows: { type: Number, default: 3 },
  columns: { type: Number as PropType<ChoiceCardColumns>, default: 1 },
  appear: { type: Boolean, default: true },
  prevLabel: { type: String, default: 'Previous' },
  nextLabel: { type: String, default: 'Next' },
  // A Function-typed prop's default is the value itself, not a factory. Inline: defineProps
  // is hoisted out of setup and cannot reference anything declared in it.
  stepLabel: {
    type: Function as PropType<ChoiceStepLabelFormatter>,
    default: (current: number, total: number) => `${current} / ${total}`,
  },
} satisfies Record<keyof ChoiceCardProps, unknown>)

const emit = defineEmits<ChoiceCardEmits>()

defineSlots<{
  /**
   * Replaces the default `<h3>` title. Whatever it renders names the card and its option
   * list, so keep the question in it.
   */
  header?: (props: { step: ChoiceStep, stepIndex: number, total: number }) => any
}>()

const baseId = useId()
// On a wrapper rather than the `<h3>`, so a `header` slot still names the card, and so the
// heading never carries an id a docs outline would pick up as a section.
const headingId = `${baseId}-heading`

// Bars of one width read as a table; the sequence is fixed so renders stay stable.
const SKELETON_LABEL_WIDTHS = ['46%', '38%', '54%', '42%']
const SKELETON_DESC_WIDTHS = ['72%', '60%', '80%', '66%']
const MAX_SKELETON_ROWS = 24
// The stagger stops growing here, so a long list does not keep the last rows waiting.
const MAX_STAGGER_INDEX = 8

const listRef = ref<HTMLElement | null>(null)
const prevRef = ref<HTMLButtonElement | null>(null)
const nextRef = ref<HTMLButtonElement | null>(null)

/* ─── pages ─── */

// Written on every pager move; `step` wins whenever the host passes one (`v-model:step`).
const internalStep = ref(0)

const total = computed(() => props.steps.length)
const stepIndex = computed(() => {
  const raw = props.step ?? internalStep.value
  const index = Number.isFinite(raw) ? Math.trunc(raw) : 0
  return Math.min(Math.max(0, total.value - 1), Math.max(0, index))
})
const current = computed<ChoiceStep | undefined>(() => props.steps[stepIndex.value])
const options = computed<ChoiceOption[]>(() => current.value?.options ?? [])
const hasPrev = computed(() => stepIndex.value > 0)
const hasNext = computed(() => stepIndex.value < total.value - 1)
const counter = computed(() => props.stepLabel(stepIndex.value + 1, total.value))
// Every row keeps an icon column when any row has an icon, so the labels stay aligned.
const hasIcons = computed(() => options.value.some(option => Boolean(option.icon)))
// Identity of the page on screen: the heading and the list remount on a change, which is
// what replays their entrance.
const pageKey = computed(() => (current.value ? `${stepIndex.value}:${current.value.id}` : ''))

const skeletonRows = computed(() => {
  const requested = Math.floor(Number(props.loadingRows) || 0)
  const count = Math.min(MAX_SKELETON_ROWS, Math.max(1, requested))
  return Array.from({ length: count }, (_, index) => ({
    label: SKELETON_LABEL_WIDTHS[index % SKELETON_LABEL_WIDTHS.length]!,
    desc: SKELETON_DESC_WIDTHS[index % SKELETON_DESC_WIDTHS.length]!,
  }))
})

function goTo(index: number): void {
  if (index < 0 || index >= total.value || index === stepIndex.value)
    return

  internalStep.value = index
  emit('update:step', index)
}

/* ─── entrance ─── */

// `appear`: rows rise in one after another. `step`: the new page blur-fades in as one.
// Both are CSS animations on freshly mounted nodes, so the options are ready and clickable
// from their first frame, and reduced motion drops only the motion.
type Entrance = 'appear' | 'step' | 'none'

const entrance = ref<Entrance>(props.appear ? 'appear' : 'none')

/* ─── selection and roving focus ─── */

// The option that last held focus. Only it is in the Tab order (roving tabindex).
const activeIndex = ref(-1)

const rovingIndex = computed(() => {
  const list = options.value
  const focused = list[activeIndex.value]
  if (focused && !focused.disabled)
    return activeIndex.value

  const chosen = props.selected === undefined
    ? -1
    : list.findIndex(option => option.id === props.selected && !option.disabled)
  return chosen >= 0 ? chosen : list.findIndex(option => !option.disabled)
})

function iconSource(icon: TxIconSource | string): TxIconSource {
  return typeof icon === 'string' ? { type: 'class', value: icon } : icon
}

function isSelected(option: ChoiceOption): boolean {
  return props.selected !== undefined && option.id === props.selected
}

function choose(option: ChoiceOption, index: number): void {
  const step = current.value
  if (!step || option.disabled)
    return

  activeIndex.value = index
  // The host decides what a choice leads to — the next step, or done — so the card
  // reports it and stays where it is.
  emit('select', { step, stepIndex: stepIndex.value, option })
}

function optionButtons(): HTMLButtonElement[] {
  const list = listRef.value
  return list ? Array.from(list.querySelectorAll<HTMLButtonElement>('.tx-choice-card__option')) : []
}

function focusOption(index: number): void {
  optionButtons()[index]?.focus()
}

/**
 * Columns as rendered, not as asked for: the container query drops `columns: 2` to one
 * below 480px, and Up/Down have to move by the row the reader sees.
 */
function renderedColumns(): number {
  const list = listRef.value
  if (props.columns !== 2 || !list || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return props.columns === 2 ? 2 : 1

  // A grid container's resolved track list is one length per column. Anything else (no
  // layout, or the computed `repeat()` form of a hidden grid) falls back to the prop.
  const tracks = window.getComputedStyle(list).gridTemplateColumns.trim()
  if (!tracks || tracks === 'none' || tracks.includes('('))
    return 2
  return Math.max(1, tracks.split(/\s+/).length)
}

/** Previous / next enabled option in reading order, wrapping at both ends. */
function stepLinear(from: number, delta: 1 | -1, enabled: boolean[]): number {
  const count = enabled.length
  for (let offset = 1; offset <= count; offset++) {
    const index = (((from + delta * offset) % count) + count) % count
    if (enabled[index])
      return index
  }
  return from
}

/** The enabled option a row above or below in the same column, wrapping within it. */
function stepVertical(from: number, delta: 1 | -1, enabled: boolean[], columns: number): number {
  if (columns <= 1)
    return stepLinear(from, delta, enabled)

  const column: number[] = []
  for (let index = from % columns; index < enabled.length; index += columns)
    column.push(index)

  const at = column.indexOf(from)
  for (let offset = 1; offset <= column.length; offset++) {
    const index = column[(((at + delta * offset) % column.length) + column.length) % column.length]!
    if (enabled[index])
      return index
  }
  return from
}

function onKeydown(event: KeyboardEvent, index: number): void {
  if (event.altKey || event.ctrlKey || event.metaKey)
    return

  const enabled = options.value.map(option => !option.disabled)
  const columns = renderedColumns()
  let target = -1

  switch (event.key) {
    case 'ArrowDown':
      target = stepVertical(index, 1, enabled, columns)
      break
    case 'ArrowUp':
      target = stepVertical(index, -1, enabled, columns)
      break
    // Left and right only mean something beside another column.
    case 'ArrowRight':
      if (columns > 1)
        target = stepLinear(index, 1, enabled)
      break
    case 'ArrowLeft':
      if (columns > 1)
        target = stepLinear(index, -1, enabled)
      break
    case 'Home':
      target = enabled.indexOf(true)
      break
    case 'End':
      target = enabled.lastIndexOf(true)
      break
  }

  if (target < 0)
    return

  event.preventDefault()
  focusOption(target)
}

/* ─── page changes ─── */

// Pre-flush: runs before the DOM shows the new page, while focus is still where it was.
watch(pageKey, async (key, previous) => {
  activeIndex.value = -1
  entrance.value = previous ? 'step' : (props.appear ? 'appear' : 'none')

  if (!previous || !key || typeof document === 'undefined')
    return

  const focused = document.activeElement
  const fromList = focused !== null && Boolean(listRef.value?.contains(focused))
  const fromPager = focused !== null && (focused === prevRef.value || focused === nextRef.value)
    ? focused as HTMLButtonElement
    : null
  if (!fromList && !fromPager)
    return

  await nextTick()

  // The old list is gone with the button that had focus; carry it to the new page's tab
  // stop, so a keyboard user who picked an option lands on the next question's options.
  if (fromList) {
    focusOption(rovingIndex.value)
    return
  }

  // An arrow that just became disabled cannot keep focus; hand it to the other one.
  if (fromPager?.disabled) {
    const other = fromPager === prevRef.value ? nextRef.value : prevRef.value
    if (other && !other.disabled)
      other.focus()
    else
      focusOption(rovingIndex.value)
  }
})

// Declared after the page watcher so that, when a page and its options arrive together,
// the options' first appearance wins.
watch(() => props.loading, (loading, was) => {
  if (was && !loading)
    entrance.value = props.appear ? 'appear' : 'none'
})
</script>

<template>
  <section
    v-if="current || loading"
    class="tx-choice-card"
    :class="{ 'is-two-columns': columns === 2 }"
    :aria-labelledby="headingId"
    :aria-busy="loading || undefined"
  >
    <header class="tx-choice-card__head">
      <div v-if="total > 1" class="tx-choice-card__pager">
        <button
          ref="prevRef"
          type="button"
          class="tx-choice-card__nav"
          :aria-label="prevLabel"
          :disabled="!hasPrev"
          @click="goTo(stepIndex - 1)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span class="tx-choice-card__count" role="status">{{ counter }}</span>
        <button
          ref="nextRef"
          type="button"
          class="tx-choice-card__nav"
          :aria-label="nextLabel"
          :disabled="!hasNext"
          @click="goTo(stepIndex + 1)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div
        :id="headingId"
        :key="pageKey || 'placeholder'"
        class="tx-choice-card__heading"
        :class="{ 'is-stepping': entrance === 'step' }"
      >
        <slot v-if="current" name="header" :step="current" :step-index="stepIndex" :total="total">
          <h3 class="tx-choice-card__title">
            {{ current.title }}
          </h3>
        </slot>
        <div v-else class="tx-choice-card__title tx-choice-card__bar is-placeholder" aria-hidden="true">
          <TxSkeleton width="56%" :height="12" :radius="4" />
        </div>
      </div>
    </header>

    <!-- The skeleton is built from the loaded row's own boxes, so nothing moves when the
         options land; only the bars inside are placeholders. -->
    <div
      v-if="loading"
      class="tx-choice-card__options is-placeholder"
      aria-hidden="true"
    >
      <div v-for="(row, index) in skeletonRows" :key="index" class="tx-choice-card__item">
        <div class="tx-choice-card__option is-placeholder">
          <span class="tx-choice-card__icon">
            <TxSkeleton variant="rect" :width="16" :height="16" :radius="5" />
          </span>
          <span class="tx-choice-card__text">
            <span class="tx-choice-card__label tx-choice-card__bar">
              <TxSkeleton :width="row.label" :height="10" :radius="4" />
            </span>
            <span class="tx-choice-card__desc tx-choice-card__bar">
              <TxSkeleton :width="row.desc" :height="8" :radius="4" />
            </span>
          </span>
        </div>
      </div>
    </div>

    <ul
      v-else
      ref="listRef"
      :key="pageKey"
      class="tx-choice-card__options"
      :class="{ 'is-appearing': entrance === 'appear', 'is-stepping': entrance === 'step' }"
      role="list"
      :aria-labelledby="headingId"
    >
      <li
        v-for="(option, index) in options"
        :key="option.id"
        class="tx-choice-card__item"
        :style="{ '--tx-choice-card-index': Math.min(index, MAX_STAGGER_INDEX) }"
      >
        <button
          type="button"
          class="tx-choice-card__option"
          :class="{ 'is-selected': isSelected(option) }"
          :disabled="option.disabled"
          :tabindex="index === rovingIndex ? 0 : -1"
          :aria-current="isSelected(option) ? 'true' : undefined"
          :aria-labelledby="`${baseId}-o${index}`"
          :aria-describedby="option.description ? `${baseId}-o${index}-desc` : undefined"
          @click="choose(option, index)"
          @focus="activeIndex = index"
          @keydown="onKeydown($event, index)"
        >
          <span v-if="hasIcons" class="tx-choice-card__icon" aria-hidden="true">
            <TxIcon v-if="option.icon" :icon="iconSource(option.icon)" />
          </span>
          <span class="tx-choice-card__text">
            <span :id="`${baseId}-o${index}`" class="tx-choice-card__label">{{ option.label }}</span>
            <span
              v-if="option.description"
              :id="`${baseId}-o${index}-desc`"
              class="tx-choice-card__desc"
            >{{ option.description }}</span>
          </span>
          <span v-if="isSelected(option)" class="tx-choice-card__check" aria-hidden="true">
            <TxIcon name="check" />
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style lang="scss">
// Ink on fill, WCAG 2 contrast, measured 2026-09-26 across the four theme blocks of
// style/variables.scss (:root / .dark / html.contrast / html.dark.contrast). Each cell is the
// worst of the four option fills: resting (--tx-fill-color-light), hover (--tx-fill-color),
// selected (--tx-color-primary-light-9) and selected hover (primary 20% over --tx-bg-color).
//
//   label, text-color-primary        10.78   10.93   13.04   14.05
//   description + icon, regular       5.06    8.80   10.79   12.76   (12px: needs 4.5)
//   check, primary 50% over primary   4.82    7.39    7.96   10.38   (glyph: needs 3)
//
// The worst description cell is the selected hover in :root; at rest it is 5.69. The check
// is TxModeChip's `info` ink on the same two fills. --tx-text-color-secondary was not used for
// the description: it measures 2.87:1 on the resting fill.
//
// Size: this sheet is held to 4 KiB compiled (the on-demand CSS gate has no slack), so ink
// is inherited wherever the parent already carries it, shared resets are grouped, and the
// motion only exists under `no-preference` instead of being declared and then cancelled.

@keyframes tx-choice-card-rise {
  from {
    opacity: 0;
    translate: 0 6px;
  }
}

@keyframes tx-choice-card-blur-in {
  from {
    opacity: 0;
    filter: blur(4px);
  }
}

.tx-choice-card {
  // Sizes are read, never set, here: a host overrides them on the card or any ancestor.
  //   --tx-choice-card-pad            inset between the card edge and the options (8px)
  //   --tx-choice-card-option-radius  option corner radius (10px)
  //   --tx-choice-card-option-pad-x   option horizontal inset, and the title's (12px)
  //   --tx-choice-card-label-line     label line height, and the icon box's height (20px)
  //   --tx-choice-card-desc-line      description line height (18px)
  container: tx-choice-card / inline-size;
  box-sizing: border-box;
  width: 100%;
  padding: var(--tx-choice-card-pad, 8px);
  // Concentric with the options: outer radius = inner radius + the inset between them.
  border-radius: calc(var(--tx-choice-card-option-radius, 10px) + var(--tx-choice-card-pad, 8px));
  // Opaque, so the card hides whatever it is laid over.
  background: var(--tx-bg-color, #fff);
  // A ring, not a border: it stays out of layout, and a border beside a drop shadow reads
  // doubled at the corners.
  box-shadow:
    0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
    var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
  // The title, the rows and their labels all inherit this ink.
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
  text-align: start;
}

// A column flexbox, so the heading stays a flex item (its own formatting context) and a
// `header` slot's margins stay inside it.
.tx-choice-card__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  // The title lines up with the options' content, one option inset in from their edge.
  padding: 6px var(--tx-choice-card-option-pad-x, 12px) 10px;
}

.tx-choice-card__pager {
  display: flex;
  align-items: center;
  gap: 2px;
  // The chevron sits 5px inside its 24px button; pulling the pager out by as much lines
  // the glyph up with the title under it.
  margin-inline-start: -5px;
  // The arrows and the counter inherit it.
  color: var(--tx-text-color-regular, #606266);
}

// Both buttons start from the same reset. Colour is inherited: the arrows take the pager's
// regular ink, the options the card's primary ink.
.tx-choice-card__nav,
.tx-choice-card__option {
  margin: 0;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  appearance: none;
}

.tx-choice-card__nav {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  background: none;
  // Read only while the focus ring below draws.
  outline-offset: 1px;

  // Immediate: nothing on the card transitions colour. `:enabled` is `:not(:disabled)`
  // for a button, and never matches the skeleton's plain boxes.
  &:enabled:hover {
    background-color: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
}

.tx-choice-card__nav:focus-visible,
.tx-choice-card__option:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
}

.tx-choice-card__count {
  min-width: 36px;
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.tx-choice-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  overflow-wrap: anywhere;

  // On the card surface the skeleton's own default, the lightest fill, is too faint.
  &.is-placeholder {
    --tx-skeleton-base-color: var(--tx-fill-color, #f0f2f5);
  }
}

.tx-choice-card__options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

// No `min-width: 0` needed: the tracks' minimum is a fixed 0, so a row never grows past it.
.tx-choice-card__item {
  display: flex;
  margin: 0;
  padding: 0;
}

.tx-choice-card__option {
  display: flex;
  flex: auto;
  align-items: start;
  gap: 10px;
  min-width: 0;
  // Two lines of text, so the block inset sits near the inline one; the inline inset clears
  // the corner radius.
  padding: 10px var(--tx-choice-card-option-pad-x, 12px);
  border-radius: var(--tx-choice-card-option-radius, 10px);
  background: var(--tx-fill-color-light, #f5f7fa);
  text-align: start;
  outline-offset: 2px;

  &:enabled:hover {
    background-color: var(--tx-fill-color, #f0f2f5);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  // Colour is not the only mark: the chosen row also carries a check and aria-current.
  &.is-selected {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    box-shadow: inset 0 0 0 1px var(--tx-color-primary-light-5, #a0cfff);

    &:enabled:hover {
      background-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, var(--tx-bg-color, #fff));
    }
  }

  // Same boxes as a loaded row; the bars read on the row fill, where the skeleton's own
  // default (the lightest fill) would vanish.
  &.is-placeholder {
    --tx-skeleton-base-color: var(--tx-fill-color-darker, #ebeef5);

    pointer-events: none;
  }
}

// A skeleton bar's box: exactly one line of the text it stands in for (`1lh` is the
// element's own line height), with the bar centred in it, so nothing moves when the text
// lands.
.tx-choice-card__bar {
  display: grid;
  align-items: center;
  height: 1lh;
}

// One label line tall, so the glyph centres on the first line whatever the description does.
.tx-choice-card__icon,
.tx-choice-card__check {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: var(--tx-choice-card-label-line, 20px);
  font-size: 16px;
}

.tx-choice-card__icon,
.tx-choice-card__desc {
  color: var(--tx-text-color-regular, #606266);
}

.tx-choice-card__check {
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
}

.tx-choice-card__text {
  display: grid;
  flex: auto;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.tx-choice-card__label {
  font-size: 14px;
  font-weight: 500;
  line-height: var(--tx-choice-card-label-line, 20px);
}

.tx-choice-card__desc {
  font-size: 12px;
  line-height: var(--tx-choice-card-desc-line, 18px);
}

// Two columns need room for two readable rows side by side, so they only exist from 480px
// of card up. The arrow keys read the rendered track count, so they follow this too.
@container tx-choice-card (width >= 480px) {
  .tx-choice-card.is-two-columns .tx-choice-card__options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// Motion is opt-in, as in TxStatCard: under `prefers-reduced-motion: reduce` neither
// animation exists, and every resting style is already their end frame, so the content is
// simply in place.
@media (prefers-reduced-motion: no-preference) {
  // Rows rise in one after another; the index is capped in the template.
  .is-appearing > .tx-choice-card__item {
    animation: tx-choice-card-rise 320ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))
      calc(var(--tx-choice-card-index, 0) * 45ms) both;
  }

  // A new page arrives as one: heading and options blur-fade in together.
  .tx-choice-card__options.is-stepping,
  .tx-choice-card__heading.is-stepping {
    animation: tx-choice-card-blur-in 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) both;
  }
}
</style>
