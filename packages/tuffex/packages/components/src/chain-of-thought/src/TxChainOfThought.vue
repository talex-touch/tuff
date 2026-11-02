<script setup lang="ts">
import type { AiChainStep } from '../../ai-elements/src/types'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import TxThinkingOrb from '../../thinking-orb/src/TxThinkingOrb.vue'
import TxThinkingBody from './TxThinkingBody.vue'

defineOptions({ name: 'TxChainOfThought' })

const props = withDefaults(
  defineProps<{
    steps: AiChainStep[]
    streaming?: boolean
    defaultOpen?: boolean
    label?: string
    /**
     * The host-held user override. Streaming hosts re-render this component's
     * surroundings on every delta, and a branch realignment can recreate the
     * instance — an override kept only in instance state dies with it, which
     * reads as "clicking does nothing". Hosts that own it (feed `toggle` back
     * in here) make the reader's choice survive any remount; `undefined`
     * falls back to the internal override for standalone use.
     */
    userOpen?: boolean
    /**
     * How long (ms) to hold the trail open after active thinking settles before
     * automatically collapsing. Allows the reader visual continuity to read the thought.
     * @default 2000
     */
    collapseDelayMs?: number
    /**
     * Whether to show step bullets (spinner/checkmark markers).
     * Defaults to true when there are multiple steps, false for single-step thoughts.
     */
    bullets?: boolean
  }>(),
  {
    streaming: false,
    defaultOpen: true,
    label: 'Chain of thought',
    userOpen: undefined,
    collapseDelayMs: 2000,
    bullets: undefined,
  },
)
const emit = defineEmits<{
  toggle: [open: boolean]
}>()

const bodyId = useId()

const hasActive = computed(() => props.steps.some(step => step.status === 'active'))

/**
 * Open follows the thinking: while a step is live the trail holds itself
 * open. Once the last live step settles, it stays open for `collapseDelayMs`
 * so the reader can see the conclusion, and then folds away automatically.
 * A click overrides the automation from then on — the reader's choice wins.
 */
const userOverride = ref<boolean | null>(null)
const settlingGrace = ref(false)
let collapseTimer: ReturnType<typeof setTimeout> | undefined

function clearCollapseTimer(): void {
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = undefined
  }
}

watch(
  hasActive,
  (active, prev) => {
    if (active) {
      clearCollapseTimer()
      settlingGrace.value = false
    } else if (prev && props.collapseDelayMs && props.collapseDelayMs > 0) {
      settlingGrace.value = true
      clearCollapseTimer()
      collapseTimer = setTimeout(() => {
        settlingGrace.value = false
        collapseTimer = undefined
      }, props.collapseDelayMs)
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearCollapseTimer()
})

const autoOpen = computed(() => {
  if (props.streaming) {
    return hasActive.value || settlingGrace.value
  }
  return settlingGrace.value ? true : props.defaultOpen
})

const open = computed(
  () =>
    props.userOpen
    ?? userOverride.value
    ?? autoOpen.value,
)

function toggle(): void {
  const next = !open.value
  clearCollapseTimer()
  settlingGrace.value = false
  userOverride.value = next
  emit('toggle', next)
}
/** `12.3s` under ten seconds, whole seconds above — locale-neutral units. */
function formatStepDuration(ms: number): string {
  const seconds = ms / 1000
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${Math.max(0.1, seconds).toFixed(1)}s`
}

// A live tool step's output follows its own tail; a thinking step's body does it itself, as the
// text is released (`TxThinkingBody`), so jumping it to the end on arrival would undo the pacing.
const activeBodyRef = ref<HTMLElement | null>(null)

/**
 * Unconditional function ref — `:ref="cond ? fn : undefined"` let the
 * compiler treat the vnode as hoistable ("Missing ref owner context"), and a
 * hoisted subtree stops re-rendering: the whole trail froze after mount.
 */
function trackActiveBody(el: unknown, active: boolean): void {
  if (active && el instanceof HTMLElement) activeBodyRef.value = el
}

watch(
  () => props.steps.map(step => step.body?.length ?? 0).join(','),
  () => {
    const el = activeBodyRef.value
    if (el)
      el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)

// ---------------------------------------------------------------------------
// Live elapsed time
// ---------------------------------------------------------------------------

/**
 * A thought that has been running for ten seconds looks identical to one that
 * just started: the shimmer says "live", not "how long". The header carries the
 * elapsed time next to the chevron while a step is active, so the wait is
 * legible without opening the trail. It stops with the last active step; a
 * settled trail falls back to each step's own duration suffix.
 */
const elapsedMs = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | undefined
let startedAt = 0

function stopElapsed(): void {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = undefined
  }
}

function startElapsed(): void {
  stopElapsed()
  startedAt = performance.now() - elapsedMs.value
  elapsedTimer = setInterval(() => {
    elapsedMs.value = performance.now() - startedAt
  }, 100)
}

watch(
  hasActive,
  (active) => {
    if (active) startElapsed()
    else stopElapsed()
  },
  { immediate: true },
)

onBeforeUnmount(stopElapsed)

/** `0.0s` → `12.3s` → `1m02s`, matching the step durations under the trail. */
const elapsedLabel = computed(() => {
  const seconds = elapsedMs.value / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  const whole = Math.round(seconds)
  return whole < 60 ? `${whole}s` : `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, '0')}s`
})

/**
 * A single step whose title is the header's own label would otherwise read twice:
 * once as the header, once as the step row under it. The header already says it.
 */
const showStepTitles = computed(
  () => props.steps.length > 1 || props.steps.some(step => step.title !== props.label),
)

const showBullets = computed(
  () => props.bullets ?? props.steps.length > 1,
)
</script>

<template>
  <div class="tx-chain-of-thought" :class="{ 'is-thinking': streaming && hasActive }">
    <button
      type="button"
      class="tx-chain-of-thought__header"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="tx-chain-of-thought__icon" aria-hidden="true">
        <!-- A live chain gets a thinking orb (random per chain); settled ones keep the bulb. -->
        <TxThinkingOrb v-if="streaming && hasActive" :size="20" :display-size="14" />
        <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3a6 6 0 0 1 6 6c0 2.2-1.2 3.6-2.4 4.8-.7.7-1.1 1.4-1.3 2.2h-4.6c-.2-.8-.6-1.5-1.3-2.2C7.2 12.6 6 11.2 6 9a6 6 0 0 1 6-6Z" />
          <path d="M9.5 19.5h5M10.5 22h3" />
        </svg>
      </span>
      <span class="tx-chain-of-thought__label">{{ label }}</span>
      <!-- A count of one is noise: the label already names the single step. -->
      <span v-if="steps.length > 1" class="tx-chain-of-thought__count">{{ steps.length }}</span>
      <!-- How long the live thought has been running; the chevron follows it. -->
      <span v-if="streaming && hasActive" class="tx-chain-of-thought__elapsed">{{
        elapsedLabel
      }}</span>
      <span class="tx-chain-of-thought__chevron" :class="{ 'is-open': open }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>

    <div :id="bodyId" class="tx-chain-of-thought__collapse" :class="{ 'is-open': open }">
      <ol class="tx-chain-of-thought__steps">
        <li
          v-for="step in steps"
          :key="step.id"
          class="tx-chain-of-thought__step"
          :class="{ 'is-single': !showBullets }"
          :data-status="step.status"
          :data-kind="step.kind"
        >
          <span v-if="showBullets" class="tx-chain-of-thought__bullet" aria-hidden="true">
            <svg v-if="step.status === 'active'" class="tx-chain-of-thought__spin" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M21 12a9 9 0 1 1-9-9" />
            </svg>
            <svg v-else-if="step.status === 'error'" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
            <svg v-else-if="step.kind === 'tool'" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.7L3 17.7V21h3.3l5.7-5.7a4.5 4.5 0 0 0 5.7-6l-3 3-2.7-.6-.6-2.7 3.3-2.7Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="m4.5 12.5 5 5 10-11" />
            </svg>
          </span>
          <div class="tx-chain-of-thought__content">
            <span v-if="showStepTitles" class="tx-chain-of-thought__title">
              {{ step.title
              }}<span
                v-if="step.status === 'done' && step.durationMs"
                class="tx-chain-of-thought__duration"
              >· {{ formatStepDuration(step.durationMs) }}</span>
            </span>
            <div
              v-if="step.body"
              :ref="(el) => trackActiveBody(el, step.status === 'active' && step.kind !== 'thinking')"
              class="tx-chain-of-thought__body"
              :class="{ 'is-plain': step.kind !== 'thinking' }"
            >
              <!-- Reasoning is markdown (models head their thoughts with bold
                   runs); tool output stays verbatim — rendering a JSON blob
                   or a log through markdown would mangle it. Rendered by a
                   local marked+DOMPurify pass rather than TxStreamMarkdown:
                   embedding the full streaming component here froze the
                   trail's own update reactivity (bisected), and a trail body
                   needs typography, not a markdown pipeline. -->
              <TxThinkingBody
                v-if="step.kind === 'thinking'"
                :text="step.body"
                :streaming="streaming && step.status === 'active'"
              />
              <span v-if="step.kind !== 'thinking'" class="tx-chain-of-thought__raw">{{
                step.body
              }}</span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>

<style lang="scss">
.tx-chain-of-thought {
  font-size: 12.5px;

  .tx-chain-of-thought__header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    border: none;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font: inherit;
    cursor: pointer;
  }

  .tx-chain-of-thought__icon {
    display: inline-flex;
  }

  .tx-chain-of-thought__label {
    font-style: italic;
  }

  &.is-thinking .tx-chain-of-thought__label {
    background: linear-gradient(
      90deg,
      var(--tx-text-color-secondary, #6b7280) 35%,
      var(--tx-text-color-primary, #111827) 50%,
      var(--tx-text-color-secondary, #6b7280) 65%
    );
    background-clip: text;
    background-size: 200% 100%;
    color: transparent;
    animation: tx-chain-shimmer 1.6s linear infinite;
  }

  .tx-chain-of-thought__count {
    padding: 1px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 12%, transparent);
    font-size: 10.5px;
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  // Tabular figures so the tenths tick without the label beside it shifting.
  .tx-chain-of-thought__elapsed {
    margin-left: 2px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .tx-chain-of-thought__chevron {
    display: inline-flex;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      transform: rotate(180deg);
    }
  }

  .tx-chain-of-thought__collapse {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.26s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      grid-template-rows: 1fr;
    }
  }

  .tx-chain-of-thought__steps {
    min-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 4px 0 0;
    list-style: none;
  }

  .tx-chain-of-thought__step {
    position: relative;
    display: flex;
    gap: 10px;
    padding: 0 0 12px 2px;

    // The connecting line, drawn from each bullet down to the next step.
    &::before {
      content: '';
      position: absolute;
      top: 18px;
      bottom: 0;
      left: 9px;
      width: 1px;
      background: var(--tx-border-color-light, #e4e7ed);
    }

    &:last-child {
      padding-bottom: 2px;

      &::before {
        display: none;
      }
    }

    &.is-single {
      gap: 0;
      padding: 0 0 2px 0;

      &::before {
        display: none;
      }
    }
  }

  .tx-chain-of-thought__bullet {
    z-index: 1;
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    border: 1px solid var(--tx-border-color-light, #e4e7ed);
    border-radius: 999px;
    background: var(--tx-fill-color-blank, #fff);
    color: var(--tx-color-success, #67c23a);
  }

  .tx-chain-of-thought__step[data-status='active'] .tx-chain-of-thought__bullet {
    color: var(--tx-color-primary, #409eff);
  }

  .tx-chain-of-thought__step[data-status='error'] .tx-chain-of-thought__bullet {
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-chain-of-thought__step[data-kind='tool'][data-status='done'] .tx-chain-of-thought__bullet {
    color: var(--tx-text-color-secondary, #6b7280);
  }

  .tx-chain-of-thought__spin {
    animation: tx-chain-spin 0.9s linear infinite;
  }

  .tx-chain-of-thought__content {
    flex: 1;
    min-width: 0;
  }

  .tx-chain-of-thought__title {
    color: var(--tx-text-color-primary, #111827);
  }

  .tx-chain-of-thought__duration {
    margin-left: 5px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  // The live step's tail dims like streaming prose — same reveal language.
  &.is-thinking .tx-chain-of-thought__step[data-status='active'] .tx-chain-of-thought__body {
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 1.6em), rgb(0 0 0 / 40%) 100%);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 1.6em), rgb(0 0 0 / 40%) 100%);
  }

  // Reasoning reads as prose and must not be boxed: a thought is part of the answer's
  // flow, so it takes its natural height and the trail folds it away once it settles.
  // Tool output is the one that gets bounded — a log or a JSON dump can be megabytes.
  .tx-chain-of-thought__body {
    margin-top: 4px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
    line-height: 1.6;
    word-break: break-word;

    // Verbatim tool output keeps its own line breaks; markdown owns its own.
    &.is-plain {
      max-height: var(--tx-chain-of-thought-output-max-height, 140px);
      overflow: auto;
      overscroll-behavior: contain;
      white-space: pre-wrap;
    }
  }

  // Rendered reasoning adopts the trail's quiet voice, not body-copy rhythm.
  .tx-chain-of-thought__md {
    p,
    ul,
    ol {
      margin: 0 0 0.5em;
      padding-left: 0;
    }

    ul,
    ol {
      padding-left: 1.3em;
    }

    > :last-child {
      margin-bottom: 0;
    }

    strong {
      color: var(--tx-text-color-primary, #111827);
      font-weight: var(--tx-font-weight-semibold, 600);
    }

    code {
      padding: 0.1em 0.3em;
      border-radius: 4px;
      background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 10%, transparent);
      font-size: 0.9em;
    }
  }
}

@keyframes tx-chain-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@keyframes tx-chain-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-chain-of-thought .tx-chain-of-thought__collapse,
  .tx-chain-of-thought .tx-chain-of-thought__chevron,
  .tx-chain-of-thought .tx-chain-of-thought__spin,
  .tx-chain-of-thought.is-thinking .tx-chain-of-thought__label {
    transition: none;
    animation: none;
  }
}
</style>
