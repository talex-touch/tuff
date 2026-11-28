<script setup lang="ts">
import type { ComponentPublicInstance, PropType } from 'vue'
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
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'
import TxButton from '../../button/src/button.vue'
import TxCard from '../../card/src/TxCard.vue'
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
const autoSizerRef = ref<InstanceType<typeof TxAutoSizer> | null>(null)
let prevButtonEl: HTMLButtonElement | null = null
let nextButtonEl: HTMLButtonElement | null = null

function bindNavButton(which: 'prev' | 'next', target: Element | ComponentPublicInstance | null): void {
  let el: HTMLButtonElement | null = null
  if (target) {
    if (typeof HTMLButtonElement !== 'undefined' && target instanceof HTMLButtonElement)
      el = target
    else if ('$el' in target && typeof HTMLButtonElement !== 'undefined' && target.$el instanceof HTMLButtonElement)
      el = target.$el
  }
  if (which === 'prev')
    prevButtonEl = el
  else
    nextButtonEl = el
}

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

// `appear`: rows rise in one after another on mount / after loading.
// `step`: outgoing page slides out while the incoming page slides in seamlessly.
type Entrance = 'appear' | 'step' | 'none'
type SlideDirection = 'none' | 'next' | 'prev'

const entrance = ref<Entrance>(props.appear ? 'appear' : 'none')
const slideDirection = ref<SlideDirection>('none')
const slideTransitionName = computed(() => {
  if (slideDirection.value === 'next')
    return 'tx-choice-card-slide-next'
  if (slideDirection.value === 'prev')
    return 'tx-choice-card-slide-prev'
  return ''
})

let lastStepIndex = stepIndex.value

// Sync flush so `<Transition :name="slideTransitionName">` already carries the new
// direction on the exact render that swaps `pageKey`.
watch(pageKey, (nextKey, prevKey) => {
  if (!prevKey || !nextKey || prevKey === nextKey)
    slideDirection.value = 'none'
  else if (stepIndex.value < lastStepIndex)
    slideDirection.value = 'prev'
  else
    slideDirection.value = 'next'

  lastStepIndex = stepIndex.value
}, { flush: 'sync' })

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

  void autoSizerRef.value?.refresh()

  const focused = document.activeElement
  const prevEl = prevButtonEl
  const nextEl = nextButtonEl
  const fromList = focused !== null && Boolean(listRef.value?.contains(focused))
  const fromPager = focused !== null && (focused === prevEl || focused === nextEl)
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
    const other = fromPager === prevEl ? nextButtonEl : prevButtonEl
    if (other && !other.disabled)
      other.focus()
    else
      focusOption(rovingIndex.value)
  }
})

// Declared after the page watcher so that, when a page and its options arrive together,
// the options' first appearance wins.
watch(() => props.loading, (loading, was) => {
  if (was && !loading) {
    slideDirection.value = 'none'
    entrance.value = props.appear ? 'appear' : 'none'
  }
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
    <TxCard
      class="tx-choice-card__card"
      variant="solid"
      background="refraction"
      shadow="soft"
      :padding="12"
      :radius="24"
      :refraction-strength="34"
      refraction-tone="mist"
    >
      <header class="tx-choice-card__head">
        <div :id="headingId" class="tx-choice-card__heading-viewport">
          <Transition :name="slideTransitionName">
            <div
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
          </Transition>
        </div>

        <div v-if="total > 1" class="tx-choice-card__pager">
          <TxButton
            :ref="(el) => bindNavButton('prev', el)"
            variant="bare"
            :border="false"
            class="tx-choice-card__nav"
            :aria-label="prevLabel"
            :disabled="!hasPrev"
            @click="goTo(stepIndex - 1)"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </TxButton>
          <span class="tx-choice-card__count" role="status">{{ counter }}</span>
          <TxButton
            :ref="(el) => bindNavButton('next', el)"
            variant="bare"
            :border="false"
            class="tx-choice-card__nav"
            :aria-label="nextLabel"
            :disabled="!hasNext"
            @click="goTo(stepIndex + 1)"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </TxButton>
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

      <TxAutoSizer
        v-else
        ref="autoSizerRef"
        :width="false"
        :height="true"
        :duration-ms="280"
        easing="cubic-bezier(0.22, 1, 0.36, 1)"
        outer-class="tx-choice-card__viewport"
      >
        <Transition :name="slideTransitionName">
          <ul
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
              <TxButton
                variant="bare"
                :border="false"
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
                <span v-else class="tx-choice-card__arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </TxButton>
            </li>
          </ul>
        </Transition>
      </TxAutoSizer>
    </TxCard>
  </section>
</template>

<style lang="scss">
@keyframes tx-choice-card-rise {
  from {
    opacity: 0;
    translate: 0 6px;
  }
}

.tx-choice-card {
  // Sizes are read, never set, here: a host overrides them on the card or any ancestor.
  //   --tx-choice-card-pad            inset between the TxCard edge and the options (12px)
  //   --tx-choice-card-option-radius  option & pager corner radius, matching TxButton (12px)
  //   --tx-choice-card-option-pad-x   option horizontal inset (12px)
  //   --tx-choice-card-label-line     label line height (20px)
  //   --tx-choice-card-desc-line      description line height (18px)
  container: tx-choice-card / inline-size;
  box-sizing: border-box;
  width: 100%;
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
  text-align: start;
}

.tx-choice-card__card.tx-card {
  // Concentric with the options and pager: outer radius = inner radius + card inset.
  // Set padding and radius directly too so host overrides of --tx-choice-card-*
  // win over TxCard's inline prop variables.
  --tx-card-radius: calc(var(--tx-choice-card-option-radius, 12px) + var(--tx-choice-card-pad, 12px));
  --tx-card-padding: var(--tx-choice-card-pad, 12px);
  padding: var(--tx-choice-card-pad, 12px);
  border-radius: calc(var(--tx-choice-card-option-radius, 12px) + var(--tx-choice-card-pad, 12px));
}

.tx-choice-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 0 12px 4px;
}

.tx-choice-card__heading-viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.tx-choice-card__heading {
  width: 100%;
  min-width: 0;
}

.tx-choice-card__pager {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 2px;
  padding: 3px;
  border-radius: var(--tx-choice-card-option-radius, 12px);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
}

.tx-choice-card__nav.tx-button {
  --tx-button-bare-padding: 0;
  --tx-button-bare-radius: calc(var(--tx-choice-card-option-radius, 12px) - 3px);
  --tx-button-bare-bg: transparent;
  --tx-button-bare-hover: var(--tx-fill-color, #f0f2f5);
  --tx-button-height: 22px;

  display: inline-grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: calc(var(--tx-choice-card-option-radius, 12px) - 3px);
  justify-content: center;
  color: inherit;
  cursor: pointer;
  outline-offset: 1px;

  &:enabled:hover {
    background-color: var(--tx-fill-color, #f0f2f5);
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
  min-width: 34px;
  padding: 0 2px;
  font-size: 11.5px;
  font-weight: var(--tx-font-weight-medium, 500);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.tx-choice-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: var(--tx-font-weight-semibold, 600);
  line-height: 20px;
  overflow-wrap: anywhere;

  &.is-placeholder {
    --tx-skeleton-base-color: var(--tx-fill-color, #f0f2f5);
  }
}

.tx-choice-card__viewport {
  position: relative;
  margin: -6px calc(var(--tx-choice-card-pad, 12px) * -1);
  padding: 6px var(--tx-choice-card-pad, 12px);
  overflow: hidden;
}

.tx-choice-card__options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tx-choice-card__item {
  display: flex;
  margin: 0;
  padding: 0;
}

.tx-choice-card__option {
  --tx-button-bare-padding: 10px var(--tx-choice-card-option-pad-x, 12px);
  --tx-button-bare-radius: var(--tx-choice-card-option-radius, 12px);
  --tx-button-bare-bg: var(--tx-fill-color-light, #f5f7fa);
  --tx-button-bare-hover: var(--tx-fill-color, #f0f2f5);
  --tx-button-height: auto;

  display: flex;
  flex: auto;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: auto;
  padding: 10px var(--tx-choice-card-option-pad-x, 12px);
  border-radius: var(--tx-choice-card-option-radius, 12px);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: inherit;
  font: inherit;
  text-align: start;
  white-space: normal;
  cursor: pointer;
  outline-offset: 2px;

  &:enabled:hover {
    background-color: var(--tx-fill-color, #f0f2f5);
    box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);

    .tx-choice-card__arrow {
      color: var(--tx-text-color-primary, #303133);
      opacity: 0.9;
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  // Colour is not the only mark: the chosen row also carries a check badge and aria-current.
  &.is-selected {
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, var(--tx-fill-color-light, #f5f7fa));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 46%, transparent);

    &:enabled:hover {
      background-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, var(--tx-fill-color-light, #f5f7fa));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 58%, transparent);
    }

    .tx-choice-card__icon {
      background: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, var(--tx-bg-color-overlay, #ffffff));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 32%, transparent);
      color: var(--tx-color-primary, #409eff);
    }
  }

  &.is-placeholder {
    --tx-skeleton-base-color: var(--tx-fill-color-darker, #ebeef5);

    pointer-events: none;
  }
}

.tx-choice-card__bar {
  display: grid;
  align-items: center;
  height: 1lh;
}

.tx-choice-card__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--tx-bg-color-overlay, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
  font-size: 16px;
}

.tx-choice-card__check {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 15%, transparent);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 62%, var(--tx-text-color-primary, #303133));
  font-size: 13px;
}

.tx-choice-card__arrow {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  color: var(--tx-text-color-regular, #606266);
  opacity: 0.45;
}

.tx-choice-card__desc {
  color: var(--tx-text-color-regular, #606266);
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
  font-weight: var(--tx-font-weight-medium, 500);
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

// Motion is opt-in: under `prefers-reduced-motion: reduce` neither animation exists,
// and every resting style is already its end frame, so the content is simply in place.
@media (prefers-reduced-motion: no-preference) {
  .is-appearing > .tx-choice-card__item {
    animation: tx-choice-card-rise 320ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))
      calc(var(--tx-choice-card-index, 0) * 45ms) both;
  }

  .tx-choice-card-slide-next-enter-active,
  .tx-choice-card-slide-next-leave-active,
  .tx-choice-card-slide-prev-enter-active,
  .tx-choice-card-slide-prev-leave-active {
    transition:
      transform 280ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
      opacity 220ms ease;
    will-change: transform, opacity;
  }

  .tx-choice-card__heading.tx-choice-card-slide-next-leave-active,
  .tx-choice-card__heading.tx-choice-card-slide-prev-leave-active {
    position: absolute;
    inset: 0 0 auto;
    width: 100%;
    pointer-events: none;
  }

  .tx-choice-card__options.tx-choice-card-slide-next-leave-active,
  .tx-choice-card__options.tx-choice-card-slide-prev-leave-active {
    position: absolute;
    inset: 6px var(--tx-choice-card-pad, 12px) auto;
    pointer-events: none;
  }

  .tx-choice-card-slide-next-enter-from,
  .tx-choice-card-slide-prev-leave-to {
    transform: translateX(calc(100% + var(--tx-choice-card-pad, 12px)));
    opacity: 0;
  }

  .tx-choice-card-slide-next-leave-to,
  .tx-choice-card-slide-prev-enter-from {
    transform: translateX(calc(-100% - var(--tx-choice-card-pad, 12px)));
    opacity: 0;
  }

  .tx-choice-card__arrow {
    transition: transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  .tx-choice-card__option:enabled:hover .tx-choice-card__arrow {
    transform: translateX(2px);
  }
}
</style>
