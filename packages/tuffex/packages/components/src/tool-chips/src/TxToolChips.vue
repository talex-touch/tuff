<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { ToolChipDetailLine, ToolChipDiff, ToolChipRow, ToolChipsEmits, ToolChipsProps } from './types'
import { computed, ref, useId } from 'vue'
import TxDiffChips from './TxDiffChips.vue'

defineOptions({ name: 'TxToolChips' })

const props = withDefaults(defineProps<ToolChipsProps>(), {
  diffs: () => [],
  summary: undefined,
  summaryFormatter: (rowCount: number) => `${rowCount} tool call${rowCount === 1 ? '' : 's'}`,
  open: undefined,
  defaultOpen: true,
  expandedRows: undefined,
  defaultExpandedRows: () => [],
  moreCount: 0,
  moreLabelFormatter: (count: number) => `+${count} more`,
})

const emit = defineEmits<ToolChipsEmits>()

defineSlots<{
  /** Replaces the built-in glyph. Required for any `icon` outside ToolChipIcon. */
  'row-icon'?: (props: { row: ToolChipRow }) => any
  /** Replaces the trailing chip. */
  'chip'?: (props: { row: ToolChipRow }) => any
  /** Replaces the expanded detail body. */
  'detail'?: (props: { row: ToolChipRow }) => any
  /** Replaces the whole diff section, divider included. */
  'diffs'?: (props: { diffs: ToolChipDiff[] }) => any
}>()

const baseId = useId()

const internalOpen = ref(props.defaultOpen)
const internalExpanded = ref<string[]>([...props.defaultExpandedRows])

const isOpen = computed(() => props.open ?? internalOpen.value)
const expanded = computed(() => props.expandedRows ?? internalExpanded.value)
const summaryText = computed(() => props.summary ?? props.summaryFormatter(props.rows.length))

function bodyId(index: number): string {
  return `${baseId}-row-${index}`
}

function isExpanded(row: ToolChipRow): boolean {
  return expanded.value.includes(row.id)
}

function toggleOpen(): void {
  const next = !isOpen.value
  internalOpen.value = next
  emit('update:open', next)
}

function toggleRow(row: ToolChipRow): void {
  const open = isExpanded(row)
  const next = open ? expanded.value.filter(id => id !== row.id) : [...expanded.value, row.id]

  internalExpanded.value = next
  emit('update:expandedRows', next)
  emit('toggle', row.id, !open)
  emit('rowClick', row)
}

function detailTone(line: ToolChipDetailLine): string | undefined {
  return line.tone ? `is-${line.tone}` : undefined
}

defineExpose({
  expand: (id: string) => {
    if (expanded.value.includes(id))
      return
    const next = [...expanded.value, id]
    internalExpanded.value = next
    emit('update:expandedRows', next)
    emit('toggle', id, true)
  },
  collapse: (id: string) => {
    if (!expanded.value.includes(id))
      return
    const next = expanded.value.filter(item => item !== id)
    internalExpanded.value = next
    emit('update:expandedRows', next)
    emit('toggle', id, false)
  },
  expandAll: () => {
    const next = props.rows.map(row => row.id)
    internalExpanded.value = next
    emit('update:expandedRows', next)
  },
  collapseAll: () => {
    internalExpanded.value = []
    emit('update:expandedRows', [])
  },
})
</script>

<template>
  <div class="tx-bui-tool-chips">
    <button
      type="button"
      class="tx-bui-tool-chips__summary"
      :aria-expanded="isOpen"
      :aria-controls="baseId"
      @click="toggleOpen"
    >
      <svg
        class="tx-bui-tool-chips__summary-chevron"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <span class="tx-bui-tool-chips__summary-text">{{ summaryText }}</span>
    </button>

    <div :id="baseId" class="tx-bui-tool-chips__collapse" :class="{ 'is-open': isOpen }">
      <!-- The negative margin plus matching padding gives the row hover pills
           room inside this clip box without shifting content on the x axis. -->
      <div class="tx-bui-tool-chips__clip">
        <ul class="tx-bui-tool-chips__rows">
          <li v-for="(row, index) in rows" :key="row.id" class="tx-bui-tool-chips__row">
            <button
              type="button"
              class="tx-bui-tool-chips__row-button"
              :class="{ 'is-expanded': isExpanded(row) }"
              :aria-expanded="isExpanded(row)"
              :aria-controls="bodyId(index)"
              @click="toggleRow(row)"
            >
              <span class="tx-bui-tool-chips__row-icon">
                <span class="tx-bui-tool-chips__glyph" aria-hidden="true">
                  <slot name="row-icon" :row="row">
                    <svg v-if="row.icon === 'think'" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                    </svg>
                    <svg v-else-if="row.icon === 'write'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                    <svg v-else-if="row.icon === 'run'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 17l6-5-6-5M12 19h8" />
                    </svg>
                    <svg v-else-if="row.icon === 'read'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </slot>
                </span>
                <svg
                  class="tx-bui-tool-chips__row-chevron"
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>

              <span class="tx-bui-tool-chips__row-label">{{ row.label }}</span>

              <span
                v-if="row.chip || $slots.chip"
                class="tx-bui-tool-chips__chip"
                :class="{ 'is-mono': row.mono }"
              >
                <slot name="chip" :row="row">{{ row.chip }}</slot>
              </span>
            </button>

            <div
              :id="bodyId(index)"
              class="tx-bui-tool-chips__detail-collapse"
              :class="{ 'is-open': isExpanded(row) }"
            >
              <div class="tx-bui-tool-chips__detail-clip">
                <div class="tx-bui-tool-chips__detail" :class="{ 'is-mono': row.detailMono }">
                  <slot name="detail" :row="row">
                    <span
                      v-for="line in row.detail ?? []"
                      :key="line.text"
                      class="tx-bui-tool-chips__detail-line"
                      :class="detailTone(line)"
                    >{{ line.text }}</span>
                  </slot>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="diffs.length > 0 || $slots.diffs" class="tx-bui-tool-chips__diffs">
          <slot name="diffs" :diffs="diffs">
            <TxDiffChips
              :diffs="diffs"
              :more-count="moreCount"
              :more-label-formatter="moreLabelFormatter"
              @select="emit('diffClick', $event)"
              @more="emit('more')"
            />
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-up;

.tx-bui-tool-chips {
  @include bui-scope;

  width: 100%;
  max-width: 320px;
  padding-bottom: 4px;

  /* ─── run header ─── */

  .tx-bui-tool-chips__summary {
    display: flex;
    gap: 6px;
    align-items: center;
    width: fit-content;
    margin-inline: -6px;
    padding: 4px 6px;
    font-size: 12.5px;
    color: var(--tx-bui-ink-2, #62656b);
    cursor: pointer;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition: background-color 0.1s ease;

    &:hover {
      background: var(--tx-bui-hover-2, #e7e9eb);
    }
  }

  .tx-bui-tool-chips__summary-text {
    @include bui-tabular-nums;
  }

  .tx-bui-tool-chips__summary-chevron {
    flex: none;
    transform: rotate(-90deg);
    transition: transform 0.2s ease;
  }

  .tx-bui-tool-chips__summary[aria-expanded='true'] .tx-bui-tool-chips__summary-chevron {
    transform: rotate(0deg);
  }

  .tx-bui-tool-chips__collapse {
    @include bui-disclosure-collapse(0.3s);
  }

  .tx-bui-tool-chips__clip {
    min-height: 0;
    margin-inline: -4px;
    padding-inline: 6px;
    padding-bottom: 4px;
  }

  /* ─── rows ─── */

  .tx-bui-tool-chips__rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }

  .tx-bui-tool-chips__row {
    @include bui-fade-up(300ms);
  }

  .tx-bui-tool-chips__row-button {
    display: flex;
    gap: 8px;
    align-items: center;
    width: calc(100% + 6px);
    min-width: 0;
    height: 28px;
    margin-inline: -3px;
    padding-inline: 3px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition: background-color 0.1s ease;

    &:hover {
      background: var(--tx-bui-hover-2, #e7e9eb);
    }
  }

  .tx-bui-tool-chips__row-icon {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  .tx-bui-tool-chips__glyph {
    display: inline-flex;
    transition: opacity 0.1s ease;
  }

  .tx-bui-tool-chips__row-chevron {
    position: absolute;
    opacity: 0;
    transform: rotate(-90deg);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  // Hover swaps the tool glyph for the disclosure chevron in place; an expanded
  // row keeps the chevron pinned so the state stays readable after the pointer
  // leaves.
  .tx-bui-tool-chips__row-button:hover .tx-bui-tool-chips__glyph,
  .tx-bui-tool-chips__row-button.is-expanded .tx-bui-tool-chips__glyph {
    opacity: 0;
  }

  .tx-bui-tool-chips__row-button:hover .tx-bui-tool-chips__row-chevron,
  .tx-bui-tool-chips__row-button.is-expanded .tx-bui-tool-chips__row-chevron {
    opacity: 1;
  }

  .tx-bui-tool-chips__row-button.is-expanded .tx-bui-tool-chips__row-chevron {
    transform: rotate(0deg);
  }

  // Without a pointer there is no hover to reveal the affordance, so the
  // chevron replaces the glyph outright rather than hiding the fact that the
  // row expands at all.
  @media (hover: none) {
    .tx-bui-tool-chips__glyph {
      opacity: 0;
    }

    .tx-bui-tool-chips__row-chevron {
      opacity: 1;
    }
  }

  .tx-bui-tool-chips__row-label {
    flex: none;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--tx-bui-ink, #1f2124);
  }

  .tx-bui-tool-chips__chip {
    display: inline-flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    height: 22px;
    padding-inline: 6px;
    overflow: hidden;
    font-size: 11.5px;
    // Upstream hardcodes this ink; it is not one of the BUI tokens. Exposed as
    // a component variable so a host can retarget it without a selector war.
    color: var(--tx-bui-tool-chips-chip-color, #43464c);
    text-overflow: ellipsis;
    white-space: nowrap;
    background: var(--tx-bui-tool-chips-chip-bg, var(--tx-bui-hover-2, #e7e9eb));
    border-radius: var(--tx-bui-radius-chip, 6px);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
    transition: background-color 0.1s ease;

    &.is-mono {
      font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    }
  }

  .tx-bui-tool-chips__row-button:hover .tx-bui-tool-chips__chip {
    background: var(--tx-bui-tool-chips-chip-hover-bg, var(--tx-bui-line-strong, #e0e2e5));
  }

  /* ─── detail ─── */

  .tx-bui-tool-chips__detail-collapse {
    @include bui-disclosure-collapse(0.3s);
  }

  .tx-bui-tool-chips__detail-clip {
    min-height: 0;
  }

  .tx-bui-tool-chips__detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 2px 0 4px 8px;
    padding: 2px 0 2px 14px;
    border-left: 1px solid var(--tx-bui-line, #ecedef);

    &.is-mono {
      font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    }
  }

  .tx-bui-tool-chips__detail-line {
    overflow: hidden;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--tx-bui-ink-2, #62656b);
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-add {
      color: var(--tx-bui-green, #189a4d);
    }

    &.is-del {
      color: var(--tx-bui-red, #e3474c);
    }
  }

  /* ─── diffs ─── */

  .tx-bui-tool-chips__diffs {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--tx-bui-line, #ecedef);
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-bui-tool-chips__summary,
    .tx-bui-tool-chips__summary-chevron,
    .tx-bui-tool-chips__row-button,
    .tx-bui-tool-chips__glyph,
    .tx-bui-tool-chips__row-chevron,
    .tx-bui-tool-chips__chip {
      transition: none;
    }
  }
}

// The chip is the one surface upstream drives with `dark:` utilities rather
// than tokens, so the dark values are re-pointed here on the same selectors
// the token layer uses.
[data-theme='dark'] .tx-bui-tool-chips,
.dark .tx-bui-tool-chips {
  --tx-bui-tool-chips-chip-color: var(--tx-bui-ink-2, #a5a8ad);
  --tx-bui-tool-chips-chip-bg: var(--tx-bui-field, #2b2c2f);
  --tx-bui-tool-chips-chip-hover-bg: var(--tx-bui-hover, #2a2b2e);
}
</style>
