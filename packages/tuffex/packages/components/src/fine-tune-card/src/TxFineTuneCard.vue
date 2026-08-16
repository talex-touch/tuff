<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { TxFlatRadioValue } from '../../flat-radio/src/types'
import type { FineTuneCardEmits, FineTuneCardProps, FineTuneField, FineTuneLayout, FineTuneRange, FineTuneValues } from './types'
import { computed } from 'vue'
import TxFlatRadio from '../../flat-radio/src/TxFlatRadio.vue'
import TxFlatRadioItem from '../../flat-radio/src/TxFlatRadioItem.vue'
import TxScrubField from '../../scrub-field/src/TxScrubField.vue'
import TxFineTuneChipSelect from './TxFineTuneChipSelect.vue'

defineOptions({ name: 'TxFineTuneCard' })

const props = withDefaults(defineProps<FineTuneCardProps>(), {
  defaults: undefined,
  edited: undefined,
  title: 'Fine-tune',
  layoutLabel: 'Layout',
  typeLabel: 'Type',
  typeOptions: () => [],
  typePlaceholder: 'Select type',
  adjustLabel: 'Adjust',
  editedLabel: 'Edited',
  fieldLabels: undefined,
  ranges: undefined,
  disabled: false,
})

const emit = defineEmits<FineTuneCardEmits>()

const LAYOUTS: FineTuneLayout[] = ['row', 'col', 'grid']
const LAYOUT_DOTS: Record<FineTuneLayout, number> = { row: 3, col: 2, grid: 4 }
const DEFAULT_LABELS: Record<FineTuneField, string> = {
  width: 'W',
  height: 'H',
  radius: 'Radius',
  opacity: 'Opacity',
}
const DEFAULT_RANGES: Record<FineTuneField, FineTuneRange> = {
  width: { min: 40, max: 999 },
  height: { min: 24, max: 999 },
  radius: { min: 0, max: 64 },
  opacity: { min: 0, max: 100 },
}

// TxFlatRadio owns its geometry through these variables, so the BUI ladder
// (28px shell, 8px outer radius, 6px thumb) arrives as an inline override —
// inline wins over the component's own :style binding, a descendant rule would not.
const SEGMENTED_STYLE = {
  '--tx-flat-radio-height': '28px',
  '--tx-flat-radio-padding': '2px',
  '--tx-flat-radio-gap': '0px',
  '--tx-flat-radio-radius': 'var(--tx-bui-radius-control, 8px)',
  '--tx-flat-radio-item-radius': '6px',
  'background': 'var(--tx-bui-field, #f2f2f3)',
} as const

function labelOf(field: FineTuneField): string {
  return props.fieldLabels?.[field] ?? DEFAULT_LABELS[field]
}

function rangeOf(field: FineTuneField): FineTuneRange {
  return props.ranges?.[field] ?? DEFAULT_RANGES[field]
}

function isChanged(field: keyof FineTuneValues): boolean {
  const baseline = props.defaults?.[field]
  return baseline !== undefined && props.values[field] !== baseline
}

const isEdited = computed(() => {
  if (props.edited !== undefined)
    return props.edited
  if (!props.defaults)
    return false
  return (Object.keys(props.defaults) as Array<keyof FineTuneValues>).some(isChanged)
})

function update<K extends keyof FineTuneValues>(key: K, value: FineTuneValues[K]): void {
  if (props.values[key] === value)
    return
  emit('update:values', { ...props.values, [key]: value })
  emit('change', key, value)
}

function onLayout(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (typeof value === 'string')
    update('layout', value as FineTuneLayout)
}
</script>

<template>
  <div class="tx-bui-fine-tune-card" :class="{ 'is-disabled': disabled }">
    <div class="tx-bui-fine-tune-card__header">
      <span class="tx-bui-fine-tune-card__title">{{ title }}</span>

      <!-- The v-if/v-else pair mounts a fresh node on every flip, which is what
           replays the badge's pop-in; no explicit :key is needed here. -->
      <span v-if="isEdited" class="tx-bui-fine-tune-card__edited">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        {{ editedLabel }}
      </span>
      <span v-else class="tx-bui-fine-tune-card__adjust">
        <span class="tx-bui-fine-tune-card__spark" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        </span>
        <span class="tx-bui-fine-tune-card__adjust-label">{{ adjustLabel }}</span>
      </span>
    </div>

    <div class="tx-bui-fine-tune-card__section">
      <p class="tx-bui-fine-tune-card__section-title">
        {{ layoutLabel }}
      </p>

      <TxFlatRadio
        class="tx-bui-fine-tune-card__layout"
        size="sm"
        :model-value="values.layout"
        :disabled="disabled"
        :style="SEGMENTED_STYLE"
        @update:model-value="onLayout"
      >
        <TxFlatRadioItem
          v-for="layout in LAYOUTS"
          :key="layout"
          :value="layout"
          :aria-label="`${layout} layout`"
        >
          <span class="tx-bui-fine-tune-card__glyph" :class="`is-${layout}`" aria-hidden="true">
            <span v-for="dot in LAYOUT_DOTS[layout]" :key="dot" class="tx-bui-fine-tune-card__dot" />
          </span>
        </TxFlatRadioItem>
      </TxFlatRadio>

      <div class="tx-bui-fine-tune-card__grid">
        <TxScrubField
          :model-value="values.width"
          :label="labelOf('width')"
          :min="rangeOf('width').min"
          :max="rangeOf('width').max"
          :active="isChanged('width')"
          :disabled="disabled"
          @update:model-value="update('width', $event)"
        />
        <TxScrubField
          :model-value="values.height"
          :label="labelOf('height')"
          :min="rangeOf('height').min"
          :max="rangeOf('height').max"
          :active="isChanged('height')"
          :disabled="disabled"
          @update:model-value="update('height', $event)"
        />
      </div>

      <div class="tx-bui-fine-tune-card__grid">
        <TxScrubField
          :model-value="values.radius"
          :label="labelOf('radius')"
          :min="rangeOf('radius').min"
          :max="rangeOf('radius').max"
          :active="isChanged('radius')"
          :disabled="disabled"
          @update:model-value="update('radius', $event)"
        />
        <TxScrubField
          :model-value="values.opacity"
          :label="labelOf('opacity')"
          :min="rangeOf('opacity').min"
          :max="rangeOf('opacity').max"
          suffix="%"
          :active="isChanged('opacity')"
          :disabled="disabled"
          @update:model-value="update('opacity', $event)"
        />
      </div>
    </div>

    <div class="tx-bui-fine-tune-card__footer">
      <span class="tx-bui-fine-tune-card__footer-label">{{ typeLabel }}</span>
      <div class="tx-bui-fine-tune-card__type">
        <TxFineTuneChipSelect
          :model-value="values.type"
          :options="typeOptions"
          :placeholder="typePlaceholder"
          :aria-label="typeLabel"
          :disabled="disabled"
          @update:model-value="update('type', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;
@include bui-keyframes-shimmer-text;

.tx-bui-fine-tune-card {
  @include bui-scope;

  position: relative;
  width: 100%;
  max-width: 240px;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 0 2px 10px #0000000b);

  &.is-disabled {
    opacity: 0.7;
  }
}

.tx-bui-fine-tune-card__header {
  @include bui-card-bar;

  display: flex;
  align-items: center;
  justify-content: space-between;
  // Internal divider, unlike the card outline: upstream draws these rules with
  // a real border and only the card edge with a ring.
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-fine-tune-card__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-fine-tune-card__edited {
  @include bui-pop-in(250ms);

  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-bui-green, #189a4d);
}

.tx-bui-fine-tune-card__adjust {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tx-bui-fine-tune-card__spark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--tx-bui-accent, #0285ff);
  background: var(--tx-bui-accent-tint, #e9f3ff);
  border-radius: 5px;
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 30%, transparent);
}

// The family's shimmer mixin sweeps the ink ramp; this one sweeps the accent,
// so the gradient is written out rather than pulled from `bui-shimmer-text`.
.tx-bui-fine-tune-card__adjust-label {
  font-size: 12px;
  font-weight: 500;
  color: transparent;
  background-image: linear-gradient(
    90deg,
    var(--tx-bui-accent, #0285ff) 35%,
    var(--tx-bui-accent-ink, #0170dd) 50%,
    var(--tx-bui-accent, #0285ff) 65%
  );
  background-clip: text;
  background-size: 200% 100%;
  animation: tx-bui-shimmer-text 1.4s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    color: var(--tx-bui-accent-ink, #0170dd);
    background: none;
    animation: none;
  }
}

.tx-bui-fine-tune-card__section {
  @include bui-card-pad;

  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-fine-tune-card__section-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-fine-tune-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

// TxFlatRadio styles itself with `.tx-flat-radio[data-v-hash]` — one class plus
// an attribute. A plain descendant selector here would only tie that and leave
// stylesheet order to decide the winner, so the wrapper class is repeated to
// out-specify it without reaching for !important.
.tx-bui-fine-tune-card__layout.tx-bui-fine-tune-card__layout {
  display: flex;
  width: 100%;

  &:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 35%, transparent);
  }

  .tx-flat-radio-item {
    flex: 1;
    padding: 0;
    color: var(--tx-bui-ink-3, #9a9da3);
    transition: color 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:hover:not(.is-selected) {
      color: var(--tx-bui-ink-2, #62656b);
    }

    &.is-selected {
      font-weight: inherit;
      color: var(--tx-bui-accent, #0285ff);
    }
  }

  .tx-flat-radio__indicator {
    background: var(--tx-bui-surface, #fff);
    // The thumb rides on a ring-plus-shadow like every other raised BUI
    // surface; tuffex's default thumb shadow is a plain drop shadow.
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
    transition:
      transform 0.3s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      width 0.3s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      opacity 0.15s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-flat-radio-item,
    .tx-flat-radio__indicator {
      transition: none;
    }
  }
}

.tx-bui-fine-tune-card__glyph {
  display: flex;
  gap: 2px;

  &.is-col {
    flex-direction: column;
  }

  &.is-grid {
    display: grid;
    grid-template-columns: repeat(2, auto);
  }
}

.tx-bui-fine-tune-card__dot {
  width: 6px;
  height: 6px;
  border: 1.2px solid currentcolor;
  border-radius: 2px;
}

.tx-bui-fine-tune-card__footer {
  @include bui-card-bar;

  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tx-bui-fine-tune-card__footer-label {
  font-size: 12px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.tx-bui-fine-tune-card__type {
  width: 120px;
  margin-right: -2px;
}
</style>
