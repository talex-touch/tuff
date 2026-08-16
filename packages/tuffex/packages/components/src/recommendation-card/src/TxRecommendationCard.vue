<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { RecommendationCardEmits, RecommendationCardProps, RecommendationConfidence, RecommendationOption } from './types'
import { computed, ref, useId } from 'vue'
import TxSignalMeter from '../../signal-meter/src/TxSignalMeter.vue'

defineOptions({ name: 'TxRecommendationCard' })

const props = withDefaults(defineProps<RecommendationCardProps>(), {
  modelValue: undefined,
  open: undefined,
  accepted: undefined,
  alternativesLabel: 'Alternatives',
  otherOptionsLabel: 'Other options',
  acceptedLabel: 'Accepted',
  acceptLabel: 'Accept',
})

const emit = defineEmits<RecommendationCardEmits>()

defineSlots<{
  /** Replaces the rationale — the place for inline code and emphasis. */
  'body'?: (props: { option: RecommendationOption }) => any
  /** Replaces a meter, in the footer and in each drawer row. */
  'meter'?: (props: { option: RecommendationOption }) => any
  /** Appended to the footer, left of the actions. */
  'footer-extra'?: () => any
}>()

const drawerId = useId()

const SIGNAL_BY_CONFIDENCE: Record<RecommendationConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
}

const TONE_BY_CONFIDENCE: Record<RecommendationConfidence, string> = {
  high: 'var(--tx-bui-green, #189a4d)',
  medium: 'var(--tx-bui-orange, #ef720c)',
  low: 'var(--tx-bui-red, #e3474c)',
  none: 'var(--tx-bui-ink-3, #9a9da3)',
}

const internalKey = ref<string | undefined>(undefined)
const internalOpen = ref(false)
const internalAccepted = ref(false)

const activeKey = computed(() => props.modelValue ?? internalKey.value ?? props.options[0]?.key)
const active = computed<RecommendationOption | undefined>(
  () => props.options.find(option => option.key === activeKey.value) ?? props.options[0],
)
const others = computed(() => props.options.filter(option => option.key !== active.value?.key))

const isOpen = computed(() => props.open ?? internalOpen.value)
const isAccepted = computed(() => props.accepted ?? internalAccepted.value)

function signalOf(option: RecommendationOption): number {
  return option.signal ?? SIGNAL_BY_CONFIDENCE[option.confidence ?? 'none']
}

function toneOf(option: RecommendationOption): string {
  return option.tone ?? TONE_BY_CONFIDENCE[option.confidence ?? 'none']
}

function setOpen(next: boolean): void {
  if (isOpen.value === next)
    return

  internalOpen.value = next
  emit('update:open', next)
}

function setAccepted(next: boolean): void {
  if (isAccepted.value === next)
    return

  internalAccepted.value = next
  emit('update:accepted', next)
}

/** Picking an alternative promotes it, retracts the drawer and clears any prior acceptance. */
function select(option: RecommendationOption): void {
  internalKey.value = option.key
  emit('update:modelValue', option.key)
  emit('select', option)
  setAccepted(false)
  setOpen(false)
}

function accept(): void {
  const option = active.value
  if (!option)
    return

  setAccepted(true)
  emit('accept', option)
}
</script>

<template>
  <div v-if="active" class="tx-bui-recommendation-card">
    <div class="tx-bui-recommendation-card__head">
      <span class="tx-bui-recommendation-card__title">{{ title }}</span>
      <p :key="active.key" class="tx-bui-recommendation-card__body">
        <slot name="body" :option="active">
{{ active.text }}
</slot>
      </p>
    </div>

    <div
      :id="drawerId"
      class="tx-bui-recommendation-card__drawer"
      :class="{ 'is-open': isOpen }"
    >
      <!-- A 0fr grid still leaves its buttons focusable, so the closed drawer is
           marked inert rather than merely clipped. -->
      <div class="tx-bui-recommendation-card__drawer-clip" :inert="!isOpen || undefined">
        <div class="tx-bui-recommendation-card__drawer-inner">
          <p class="tx-bui-recommendation-card__drawer-title">
            {{ otherOptionsLabel }}
          </p>
          <button
            v-for="option in others"
            :key="option.key"
            type="button"
            class="tx-bui-recommendation-card__alt"
            @click="select(option)"
          >
            <slot name="meter" :option="option">
              <TxSignalMeter :value="signalOf(option)" :tone="toneOf(option)" />
            </slot>
            <span class="tx-bui-recommendation-card__alt-text">{{ option.short }}</span>
            <span class="tx-bui-recommendation-card__alt-label">{{ option.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="tx-bui-recommendation-card__footer">
      <span class="tx-bui-recommendation-card__confidence">
        <slot name="meter" :option="active">
          <TxSignalMeter :value="signalOf(active)" :tone="toneOf(active)" />
        </slot>
        <span class="tx-bui-recommendation-card__confidence-label">{{ active.label }}</span>
      </span>

      <span class="tx-bui-recommendation-card__actions">
        <slot name="footer-extra" />
        <button
          type="button"
          class="tx-bui-recommendation-card__alternatives"
          :class="{ 'is-open': isOpen }"
          :aria-expanded="isOpen"
          :aria-controls="drawerId"
          @click="setOpen(!isOpen)"
        >
          {{ alternativesLabel }}
        </button>
        <button
          type="button"
          class="tx-bui-recommendation-card__accept"
          :class="[`is-tone-${active.ctaTone ?? 'ink'}`, { 'is-accepted': isAccepted }]"
          @click="accept"
        >
          {{ isAccepted ? acceptedLabel : (active.cta ?? acceptLabel) }}
        </button>
      </span>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-in;

.tx-bui-recommendation-card {
  @include bui-scope;

  width: 100%;
  max-width: 380px;
  overflow: hidden;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);

  .tx-bui-recommendation-card__head {
    @include bui-card-pad;
  }

  .tx-bui-recommendation-card__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--tx-bui-ink, #1f2124);
  }

  .tx-bui-recommendation-card__body {
    // The floor keeps the card from resizing as options of different lengths
    // swap in. Tunable because it is measured against Latin text at 13px.
    min-height: var(--tx-bui-recommendation-card-body-min-height, 48px);
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.625;
    color: var(--tx-bui-ink-2, #62656b);
    animation: tx-bui-fade-in 180ms ease-out both;
  }

  // Inline code in the rationale, styled here so a host filling `#body` with
  // rich content gets the treatment without restating it.
  .tx-bui-recommendation-card__body code {
    padding: 2px 6px;
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 12px;
    color: var(--tx-bui-accent-ink, #0170dd);
    background: var(--tx-bui-accent-tint, #e9f3ff);
    border-radius: 6px;

    &.is-warning {
      color: var(--tx-bui-orange, #ef720c);
      background: var(--tx-bui-orange-tint, #fdf1e5);
    }
  }

  /* ─── alternatives drawer ─── */

  .tx-bui-recommendation-card__drawer {
    @include bui-disclosure-collapse(0.3s);

    // Upstream gives this drawer a softer easing than the rest of the family,
    // so the shared curve is replaced rather than inherited.
    transition:
      grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tx-bui-recommendation-card__drawer-clip {
    min-height: 0;
  }

  .tx-bui-recommendation-card__drawer-inner {
    padding: 8px;
    background: var(--tx-bui-inset, #f7f8f9);
    border-top: 1px solid var(--tx-bui-line, #ecedef);
  }

  .tx-bui-recommendation-card__drawer-title {
    margin: 0 0 4px;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  .tx-bui-recommendation-card__alt {
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 6px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--tx-bui-radius-control, 8px);
    transition: background-color 0.1s ease;

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }
  }

  .tx-bui-recommendation-card__alt-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 12.5px;
    color: var(--tx-bui-ink, #1f2124);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-recommendation-card__alt-label {
    flex: none;
    font-size: 11px;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  /* ─── footer ─── */

  .tx-bui-recommendation-card__footer {
    @include bui-card-bar;

    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    background: var(--tx-bui-inset, #f7f8f9);
    border-top: 1px solid var(--tx-bui-line, #ecedef);
  }

  .tx-bui-recommendation-card__confidence,
  .tx-bui-recommendation-card__actions {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }

  .tx-bui-recommendation-card__actions {
    margin-right: -2px;
  }

  .tx-bui-recommendation-card__confidence-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--tx-bui-ink-2, #62656b);
  }

  .tx-bui-recommendation-card__alternatives {
    height: 28px;
    padding: 0 10px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--tx-bui-ink, #1f2124);
    cursor: pointer;
    background: var(--tx-bui-surface, #fff);
    border-radius: var(--tx-bui-radius-control, 8px);
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
    transition: background-color 0.1s ease, transform 0.1s ease;

    &:hover,
    &.is-open {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &:active {
      transform: scale(0.96);
    }
  }

  .tx-bui-recommendation-card__accept {
    height: 28px;
    padding: 0 12px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--tx-bui-canvas, #f1f2f3);
    cursor: pointer;
    background: var(--tx-bui-ink, #1f2124);
    border-radius: var(--tx-bui-radius-control, 8px);
    // Upstream keeps these ambient values in both themes; they read as a bevel
    // on the solid fill rather than as a themed hairline.
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 14%),
      0 0 0 1px rgb(16 24 40 / 12%),
      0 1px 2px rgb(16 24 40 / 10%);
    transition: background-color 0.15s ease, transform 0.15s ease;

    &.is-tone-accent {
      color: #fff;
      background: var(--tx-bui-accent, #0285ff);
    }

    &.is-tone-danger {
      color: #fff;
      background: var(--tx-bui-red, #e3474c);
    }

    &.is-accepted {
      color: #fff;
      background: var(--tx-bui-green, #189a4d);
    }

    &:active {
      transform: scale(0.96);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-bui-recommendation-card__body {
      animation: none;
    }

    .tx-bui-recommendation-card__drawer,
    .tx-bui-recommendation-card__alt,
    .tx-bui-recommendation-card__alternatives,
    .tx-bui-recommendation-card__accept {
      transition: none;
    }

    .tx-bui-recommendation-card__alternatives:active,
    .tx-bui-recommendation-card__accept:active {
      transform: none;
    }
  }
}
</style>
