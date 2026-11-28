<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { DiffChipsEmits, DiffChipsProps, ToolChipDiff, ToolChipDiffLine } from './types'
import { computed, onBeforeUnmount, ref } from 'vue'
import { hasDocument, hasWindow } from '../../../../utils/env'

defineOptions({ name: 'TxDiffChips' })

const props = withDefaults(defineProps<DiffChipsProps & { preview?: boolean }>(), {
  moreCount: 0,
  moreLabelFormatter: (count: number) => `+${count} more`,
  staggerStep: 80,
  preview: true,
})

const emit = defineEmits<DiffChipsEmits>()

defineSlots<{
  /** Replaces a chip's contents. */
  chip?: (props: { diff: ToolChipDiff }) => any
}>()

const rootRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const hoveredFile = ref<string | null>(null)
const pinnedFile = ref<string | null>(null)
const popoverPos = ref<{ top: number, left: number }>({ top: 0, left: 0 })
let closeTimer: ReturnType<typeof setTimeout> | null = null
let listeningOutside = false

const activeFile = computed(() => pinnedFile.value ?? hoveredFile.value)
const activeDiff = computed<ToolChipDiff | null>(() => {
  if (!props.preview || !activeFile.value)
    return null
  const found = props.diffs.find(item => item.file === activeFile.value)
  return found && found.lines && found.lines.length > 0 ? found : null
})

function hasLines(diff: ToolChipDiff): boolean {
  return Boolean(props.preview && diff.lines && diff.lines.length > 0)
}

function clearCloseTimer(): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function positionFromElement(el: HTMLElement): void {
  if (!hasWindow())
    return
  const rect = el.getBoundingClientRect()
  const maxWidth = Math.min(340, Math.max(220, window.innerWidth - 24))
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - maxWidth - 12))
  const estimatedHeight = 180
  const placeAbove = rect.bottom + 8 + estimatedHeight > window.innerHeight && rect.top > estimatedHeight + 16
  const top = placeAbove ? Math.max(12, rect.top - estimatedHeight - 8) : rect.bottom + 8
  popoverPos.value = { top, left }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    pinnedFile.value = null
    hoveredFile.value = null
    detachOutsideListeners()
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null
  if (!target)
    return
  if (rootRef.value?.contains(target) || popoverRef.value?.contains(target))
    return
  pinnedFile.value = null
  hoveredFile.value = null
  detachOutsideListeners()
}

function attachOutsideListeners(): void {
  if (listeningOutside || !hasDocument())
    return
  listeningOutside = true
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('pointerdown', onDocumentPointerDown)
}

function detachOutsideListeners(): void {
  if (!listeningOutside || !hasDocument())
    return
  listeningOutside = false
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
}

function onChipEnter(diff: ToolChipDiff, event: Event): void {
  if (!hasLines(diff))
    return
  clearCloseTimer()
  hoveredFile.value = diff.file
  if (event.currentTarget instanceof HTMLElement)
    positionFromElement(event.currentTarget)
  attachOutsideListeners()
}

function scheduleClose(): void {
  clearCloseTimer()
  if (pinnedFile.value)
    return
  closeTimer = setTimeout(() => {
    closeTimer = null
    hoveredFile.value = null
    if (!pinnedFile.value)
      detachOutsideListeners()
  }, 110)
}

function onChipClick(diff: ToolChipDiff, event: MouseEvent): void {
  emit('select', diff)
  if (!hasLines(diff))
    return
  clearCloseTimer()
  if (pinnedFile.value === diff.file) {
    pinnedFile.value = null
    hoveredFile.value = null
    detachOutsideListeners()
    return
  }
  pinnedFile.value = diff.file
  hoveredFile.value = diff.file
  if (event.currentTarget instanceof HTMLElement)
    positionFromElement(event.currentTarget)
  attachOutsideListeners()
}

function lineMarker(line: ToolChipDiffLine): string {
  if (line.kind === 'add')
    return '+'
  if (line.kind === 'del')
    return '−'
  return ' '
}

onBeforeUnmount(() => {
  clearCloseTimer()
  detachOutsideListeners()
})
</script>

<template>
  <div ref="rootRef" class="tx-bui-diff-chips" :style="{ '--tx-bui-diff-chips-step': `${props.staggerStep}ms` }">
    <button
      v-for="(diff, index) in diffs"
      :key="diff.file"
      type="button"
      class="tx-bui-diff-chips__chip"
      :class="{
        'has-preview': hasLines(diff),
        'is-preview-open': activeDiff?.file === diff.file,
      }"
      :aria-expanded="hasLines(diff) ? activeDiff?.file === diff.file : undefined"
      :style="{ '--tx-bui-diff-chips-index': index }"
      @mouseenter="onChipEnter(diff, $event)"
      @focus="onChipEnter(diff, $event)"
      @mouseleave="scheduleClose"
      @blur="scheduleClose"
      @click="onChipClick(diff, $event)"
    >
      <slot name="chip" :diff="diff">
        <span class="tx-bui-diff-chips__file">{{ diff.file }}</span>
        <span class="tx-bui-diff-chips__add">+{{ diff.add }}</span>
        <!-- U+2212 MINUS SIGN, not a hyphen: it aligns with the plus and keeps
             the tabular columns even. -->
        <span v-if="diff.del > 0" class="tx-bui-diff-chips__del">&#8722;{{ diff.del }}</span>
      </slot>
    </button>

    <button
      v-if="moreCount > 0"
      type="button"
      class="tx-bui-diff-chips__more"
      :style="{ '--tx-bui-diff-chips-index': diffs.length }"
      @click="emit('more')"
    >
      {{ moreLabelFormatter(moreCount) }}
    </button>

    <Teleport to="body">
      <div
        v-if="activeDiff"
        ref="popoverRef"
        class="tx-bui-diff-chips__popover"
        role="region"
        :aria-label="activeDiff.file"
        :style="{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }"
        @mouseenter="clearCloseTimer"
        @mouseleave="scheduleClose"
      >
        <div class="tx-bui-diff-chips__popover-head">
          <span class="tx-bui-diff-chips__popover-file">{{ activeDiff.file }}</span>
          <span class="tx-bui-diff-chips__popover-counts">
            <span class="tx-bui-diff-chips__add">+{{ activeDiff.add }}</span>
            <span v-if="activeDiff.del > 0" class="tx-bui-diff-chips__del">&#8722;{{ activeDiff.del }}</span>
          </span>
        </div>
        <div class="tx-bui-diff-chips__popover-code">
          <div
            v-for="(line, lineIdx) in activeDiff.lines"
            :key="lineIdx"
            class="tx-bui-diff-chips__popover-line"
            :class="line.kind && line.kind !== 'context' ? `is-${line.kind}` : undefined"
          >
            <span class="tx-bui-diff-chips__popover-sign" aria-hidden="true">{{ lineMarker(line) }}</span>
            <span class="tx-bui-diff-chips__popover-text">{{ line.text }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;
@include bui-keyframes-fade-in;

.tx-bui-diff-chips {
  @include bui-scope;

  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 100%;

  .tx-bui-diff-chips__chip {
    @include bui-pop-in(250ms);

    display: inline-flex;
    gap: 6px;
    align-items: center;
    max-width: 100%;
    height: 28px;
    padding: 0 8px;
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11.5px;
    color: var(--tx-bui-ink, #1f2124);
    cursor: pointer;
    background: var(--tx-bui-surface, #fff);
    border-radius: var(--tx-bui-radius-chip, 6px);
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
    animation-delay: calc(var(--tx-bui-diff-chips-index, 0) * var(--tx-bui-diff-chips-step, 80ms));

    &:hover,
    &.is-preview-open {
      background: var(--tx-bui-hover, #f4f5f6);
    }
  }

  .tx-bui-diff-chips__file {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-diff-chips__more {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 6px;
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11.5px;
    color: var(--tx-bui-ink-3, #9a9da3);
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 2px;
    cursor: pointer;
    border-radius: var(--tx-bui-radius-chip, 6px);
    animation: tx-bui-fade-in 300ms ease-out both;
    animation-delay: calc(var(--tx-bui-diff-chips-index, 0) * var(--tx-bui-diff-chips-step, 80ms));

    &:hover {
      color: var(--tx-bui-ink-2, #62656b);
      text-decoration-color: currentcolor;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-bui-diff-chips__chip,
    .tx-bui-diff-chips__more {
      animation: none;
    }
  }
}

.tx-bui-diff-chips__add,
.tx-bui-diff-chips__del {
  @include bui-tabular-nums;

  flex: none;
}

.tx-bui-diff-chips__add {
  color: var(--tx-bui-green, #189a4d);
}

.tx-bui-diff-chips__del {
  color: var(--tx-bui-red, #e3474c);
}

.tx-bui-diff-chips__popover {
  position: fixed;
  z-index: 2200;
  box-sizing: border-box;
  min-width: 248px;
  max-width: min(360px, calc(100vw - 24px));
  overflow: hidden;
  border-radius: var(--tx-bui-radius-card, 10px);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-overlay, 0 0 0 1px #ecedef, 0 10px 28px #0000001a);
  font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
  font-size: 11.5px;
  color: var(--tx-bui-ink, #1f2124);
  animation: tx-bui-fade-in 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

.tx-bui-diff-chips__popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-diff-chips__popover-file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-bui-diff-chips__popover-counts {
  display: inline-flex;
  gap: 6px;
  flex: none;
}

.tx-bui-diff-chips__popover-code {
  padding: 6px 0;
  overflow-x: auto;
}

.tx-bui-diff-chips__popover-line {
  display: flex;
  gap: 8px;
  padding: 1px 10px;
  line-height: 1.65;
  color: var(--tx-bui-ink-2, #62656b);
  white-space: pre;

  &.is-add {
    background: color-mix(in oklab, var(--tx-bui-green, #189a4d) 14%, transparent);
    color: var(--tx-bui-green, #189a4d);
  }

  &.is-del {
    background: color-mix(in oklab, var(--tx-bui-red, #e3474c) 14%, transparent);
    color: var(--tx-bui-red, #e3474c);
  }
}

.tx-bui-diff-chips__popover-sign {
  flex: none;
  width: 10px;
  user-select: none;
  opacity: 0.85;
}
</style>
