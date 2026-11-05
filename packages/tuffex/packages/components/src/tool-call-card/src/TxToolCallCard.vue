<script setup lang="ts">
import type { AiToolCallPart } from '../../ai-elements/src/types'
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId, watch } from 'vue'
import TxEdgeFadeMask from '../../edge-fade-mask/src/TxEdgeFadeMask.vue'
import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'

defineOptions({ name: 'TxToolCallCard' })

const props = withDefaults(
  defineProps<{
    toolCall: AiToolCallPart
    defaultExpanded?: boolean
    userOpen?: boolean
    retryLabel?: string
    pendingLabel?: string
    runningLabel?: string
    doneLabel?: string
    errorLabel?: string
    inputLabel?: string
    emptyResultLabel?: string
    showRetry?: boolean
    linesToggleFormatter?: (hiddenCount: number, expanded: boolean) => string
  }>(),
  {
    defaultExpanded: false,
    userOpen: undefined,
    retryLabel: 'Retry',
    pendingLabel: 'Queued',
    runningLabel: 'Running',
    doneLabel: 'Done',
    errorLabel: 'Failed',
    inputLabel: 'Input',
    emptyResultLabel: 'No output',
    showRetry: undefined,
    linesToggleFormatter: undefined,
  },
)

const emit = defineEmits<{
  retry: [id: string]
  toggle: [expanded: boolean]
}>()

defineSlots<{
  summary?: (props: { toolCall: AiToolCallPart }) => any
  /** The widget surface: hosts mount their own rendering (e.g. an arrow-js widget) here. */
  result?: (props: { toolCall: AiToolCallPart }) => any
  icon?: (props: { status: AiToolCallPart['status'] }) => any
}>()
const instance = getCurrentInstance()
const canRetry = computed(() => {
  if (props.showRetry !== undefined)
    return props.showRetry
  return Boolean(
    instance?.vnode.props?.onRetry
    || (instance?.vnode.props as Record<string, unknown> | undefined)?.['onUpdate:retry'],
  )
})


const userOverride = ref<boolean | null>(null)
const bodyId = useId()

const autoOpen = computed(() => {
  if (props.toolCall.status === 'pending' || props.toolCall.status === 'running')
    return true
  if (props.toolCall.status === 'error')
    return true
  return props.defaultExpanded
})

const expanded = computed(() => {
  if (props.userOpen !== undefined)
    return props.userOpen
  if (userOverride.value !== null)
    return userOverride.value
  return autoOpen.value
})
function toggle(): void {
  const next = !expanded.value
  userOverride.value = next
  emit('toggle', next)
}

const statusLabel = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return props.pendingLabel
    case 'running':
      return props.runningLabel
    case 'error':
      return props.errorLabel
    default:
      return props.doneLabel
  }
})

const INPUT_PREVIEW_LINES = 4
const inputExpanded = ref(false)
const inputLines = computed(() => props.toolCall.input?.split('\n') ?? [])
const hiddenInputLines = computed(() => Math.max(0, inputLines.value.length - INPUT_PREVIEW_LINES))
const visibleInput = computed(() =>
  inputExpanded.value || hiddenInputLines.value === 0
    ? props.toolCall.input
    : inputLines.value.slice(0, INPUT_PREVIEW_LINES).join('\n'),
)
const linesToggleLabel = computed(() => {
  if (props.linesToggleFormatter)
    return props.linesToggleFormatter(hiddenInputLines.value, inputExpanded.value)
  return inputExpanded.value ? 'Show less' : `${hiddenInputLines.value} more lines`
})

function formatDuration(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 10)
    return `${Math.max(0.1, seconds).toFixed(1)}s`
  if (seconds < 60)
    return `${Math.round(seconds)}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/**
 * The header names what the call is about: the host's one-line `summary`, else a plain-text input's
 * first line (a command, a path). A structured input is never previewed here - cut to its first
 * line it is only `{`, and the body below already shows it whole.
 */
const headerArgs = computed(() => {
  const { summary, input } = props.toolCall
  if (summary !== undefined) return summary
  if (!input) return ''
  const first = input.split('\n')[0] ?? ''
  return /^\s*[{[]/.test(first) ? '' : first
})

const tailText = computed(() => {
  const { status, logs } = props.toolCall
  if (status !== 'pending' && status !== 'running') return ''
  return logs ? logs.trimEnd().split('\n').slice(-2).join('\n') : ''
})

const inFlight = computed(() => props.toolCall.status === 'pending' || props.toolCall.status === 'running')
const durationText = computed(() => {
  const ms = props.toolCall.durationMs
  return ms === undefined || inFlight.value ? '' : formatDuration(ms)
})
const elapsedMs = ref(0)
let clockStartedAt = 0
let clockTimer: ReturnType<typeof setInterval> | null = null
let clockInFlight = false
// An off-screen card stops its 100 ms tick. The reading is wall-clock based,
// so it is correct again as soon as the card scrolls back into view.
let clockOnScreen = true
let clockObserver: IntersectionObserver | null = null
const cardRef = ref<HTMLElement | null>(null)

function stopClock(): void {
  if (clockTimer !== null)
    clearInterval(clockTimer)
  clockTimer = null
}

function tickClock(): void {
  elapsedMs.value = Date.now() - clockStartedAt
}

function runClock(): void {
  if (!clockInFlight || !clockOnScreen) {
    stopClock()
    return
  }
  if (clockTimer !== null)
    return
  tickClock()
  clockTimer = setInterval(tickClock, 100)
}

function syncClock(status: AiToolCallPart['status'], previous?: AiToolCallPart['status']): void {
  if (status !== 'pending' && status !== 'running') {
    clockInFlight = false
    stopClock()
    return
  }
  const continuing = clockInFlight && (previous === 'pending' || previous === 'running')
  if (!continuing) {
    stopClock()
    clockStartedAt = Date.now()
    elapsedMs.value = 0
  }
  clockInFlight = true
  runClock()
}

const elapsedLabel = computed(() => (elapsedMs.value / 1000).toFixed(1))

onMounted(() => {
  if (typeof IntersectionObserver === 'function' && cardRef.value) {
    clockObserver = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1]
      if (latest) {
        clockOnScreen = latest.isIntersecting
        runClock()
      }
    })
    clockObserver.observe(cardRef.value)
  }
  syncClock(props.toolCall.status)
})
watch(() => props.toolCall.status, (status, previous) => syncClock(status, previous))
onBeforeUnmount(() => {
  stopClock()
  clockObserver?.disconnect()
  clockObserver = null
})

// Logs, output and the collapsed peek all stay pinned to their bottom, like a terminal tail.
const logsRef = ref<HTMLElement | null>(null)
const resultRef = ref<HTMLElement | null>(null)
const peekRef = ref<HTMLElement | null>(null)
/** The mask owns the card's scroll box; its viewport is what the follow pins. */
const maskRef = ref<{ viewport?: HTMLElement | null, refresh?: () => void } | null>(null)

function pinToBottom(el: HTMLElement | null): void {
  if (el)
    el.scrollTop = el.scrollHeight
}

/**
 * The whole frame is capped, so the thing that has to follow a running call is
 * the mask's viewport, not the individual log boxes: pinning those while the
 * frame stays put left the reader looking at the top of the card as output
 * piled up below. Following stops as soon as the reader scrolls the card.
 */
const detached = ref(false)

function atViewportBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 4
}

function onViewportScroll(): void {
  const el = maskRef.value?.viewport
  if (el && expanded.value)
    detached.value = !atViewportBottom(el)
}

function followFrame(): void {
  const el = maskRef.value?.viewport
  if (el && expanded.value && !detached.value)
    el.scrollTop = el.scrollHeight
  maskRef.value?.refresh?.()
}

watch(
  () => [props.toolCall.logs, props.toolCall.output, props.toolCall.error, expanded.value],
  () => {
    pinToBottom(logsRef.value)
    pinToBottom(resultRef.value)
    pinToBottom(peekRef.value)
    void nextTick(followFrame)
  },
  { flush: 'post', immediate: true },
)

// Reopening the card starts the follow over rather than inheriting the position
// the reader left it at, which may now be far from the newest output.
watch(expanded, (open) => {
  if (open) {
    detached.value = false
    void nextTick(followFrame)
  }
})

// The mask's root is not the scrolling element — its viewport is — so the listener
// goes on that element, not on the component.
let viewport: HTMLElement | null = null

function bindViewport(): void {
  viewport?.removeEventListener('scroll', onViewportScroll)
  viewport = maskRef.value?.viewport ?? null
  viewport?.addEventListener('scroll', onViewportScroll, { passive: true })
}

/**
 * Output also grows without the props changing: a log line wraps, a widget
 * finishes laying out, a font loads. The resize observer is what keeps the
 * follow honest across all of it — the same reason the transcript watches its
 * own list rather than only its message array.
 */
let contentObserver: ResizeObserver | null = null

function observeContent(): void {
  contentObserver?.disconnect()
  const frame = maskRef.value?.viewport?.firstElementChild
  if (!frame || typeof ResizeObserver === 'undefined')
    return
  contentObserver = new ResizeObserver(() => {
    followFrame()
  })
  contentObserver.observe(frame)
}

onMounted(() => {
  bindViewport()
  observeContent()
  // The card mounts already holding a running call's output, so the first
  // follow has to happen after the viewport exists — the immediate watcher
  // above runs before the ref is populated.
  void nextTick(followFrame)
})
onUpdated(() => {
  bindViewport()
  observeContent()
  // Highlighting, wrapping and widget layout all land after the first render,
  // so the tail is re-read here too; `detached` keeps a reader's own scroll-up
  // from being undone by it.
  followFrame()
})
onBeforeUnmount(() => {
  viewport?.removeEventListener('scroll', onViewportScroll)
  viewport = null
  contentObserver?.disconnect()
  contentObserver = null
})
</script>

<template>
  <div ref="cardRef" class="tx-tool-call-card" :data-status="toolCall.status">
    <button
      type="button"
      class="tx-tool-call-card__header"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="tx-tool-call-card__icon" aria-hidden="true">
        <slot name="icon" :status="toolCall.status">
          <svg v-if="toolCall.status === 'pending'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          <svg v-else-if="toolCall.status === 'running'" class="tx-tool-call-card__spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-9-9" />
          </svg>
          <svg v-else-if="toolCall.status === 'done'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m4.5 12.5 5 5 10-11" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5" />
            <circle cx="12" cy="16.4" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </slot>
      </span>

      <span v-if="inFlight" class="tx-tool-call-card__clock" aria-hidden="true">(<TxTextMorph :text="elapsedLabel" :duration-ms="120" />)</span>
      <span class="tx-tool-call-card__name">{{ toolCall.name }}</span>

      <span class="tx-tool-call-card__summary">
        <slot name="summary" :tool-call="toolCall">{{ headerArgs }}</slot>
      </span>

      <span v-if="durationText" class="tx-tool-call-card__time"><TxTextMorph :text="durationText" :duration-ms="360" /></span>

      <span class="tx-tool-call-card__chevron" :class="{ 'is-open': expanded }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>

    <pre v-if="!expanded && tailText" ref="peekRef" class="tx-tool-call-card__peek">{{ tailText }}</pre>

    <!-- `inert` while closed: a 0fr grid still leaves the retry button and
         scrollable logs in the tab order -->
    <div
      :id="bodyId"
      class="tx-tool-call-card__collapse"
      :class="{ 'is-open': expanded }"
      :inert="expanded ? undefined : true"
    >
      <div class="tx-tool-call-card__body">
        <!-- Capped and internally scrollable: a long log, a JSON dump or an
             embedded widget must not push the rest of the thread off screen.
             The mask fades the edge that can still be scrolled toward. -->
        <TxEdgeFadeMask
          ref="maskRef"
          class="tx-tool-call-card__scroller"
          axis="vertical"
          :size="20"
        >
          <div class="tx-tool-call-card__frame">
            <div
              v-if="toolCall.input"
              class="tx-tool-call-card__section"
              role="group"
              :aria-label="inputLabel"
            >
              <pre class="tx-tool-call-card__pre">{{ visibleInput }}</pre>
              <button
                v-if="hiddenInputLines > 0"
                type="button"
                class="tx-tool-call-card__lines"
                :aria-expanded="inputExpanded"
                @click="inputExpanded = !inputExpanded"
              >
                <span>{{ linesToggleLabel }}</span>
                <svg
                  class="tx-tool-call-card__lines-chevron"
                  :class="{ 'is-open': inputExpanded }"
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>

            <pre
              v-if="toolCall.status === 'running' && toolCall.logs"
              ref="logsRef"
              class="tx-tool-call-card__logs"
            >{{ toolCall.logs }}</pre>
            <div
              v-else-if="toolCall.status === 'running' && !toolCall.input"
              class="tx-tool-call-card__running-hint"
            >
              {{ runningLabel }}…
            </div>

            <div v-if="toolCall.status === 'done'" ref="resultRef" class="tx-tool-call-card__result">
              <slot name="result" :tool-call="toolCall">
                <pre v-if="toolCall.output" class="tx-tool-call-card__pre">{{ toolCall.output }}</pre>
                <div v-else-if="!toolCall.input" class="tx-tool-call-card__empty-result">
                  {{ emptyResultLabel }}
                </div>
              </slot>
            </div>

            <div v-if="toolCall.status === 'error'" class="tx-tool-call-card__error" role="alert">
              <span class="tx-tool-call-card__error-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              </span>
              <span class="tx-tool-call-card__error-text">{{ toolCall.error || errorLabel }}</span>
              <button
                v-if="canRetry"
                type="button"
                class="tx-tool-call-card__retry"
                @click="emit('retry', toolCall.id)"
              >
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                <span>{{ retryLabel }}</span>
              </button>
            </div>

            <div class="tx-tool-call-card__footer">
              <span class="tx-tool-call-card__status">
                <svg
                  v-if="toolCall.status === 'done'"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  aria-hidden="true"
                >
                  <path d="m4.5 12.5 5 5 10-11" />
                </svg>
                {{ statusLabel }}
              </span>
            </div>
          </div>
        </TxEdgeFadeMask>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-tool-call-card {
  .tx-tool-call-card__header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--tx-text-color-primary, #111827);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }

  .tx-tool-call-card__icon {
    display: inline-flex;
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    transition: color 0.15s ease;
  }

  &[data-status='running'] .tx-tool-call-card__icon {
    color: var(--tx-color-primary, #409eff);
  }

  &[data-status='done'] .tx-tool-call-card__icon {
    color: var(--tx-color-success, #67c23a);
  }

  &[data-status='error'] .tx-tool-call-card__icon {
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-call-card__spin {
    animation: tx-tool-call-card-spin 0.9s linear infinite;
  }

  .tx-tool-call-card__clock {
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  &[data-status='pending'] .tx-tool-call-card__name,
  &[data-status='running'] .tx-tool-call-card__name {
    background: linear-gradient(
      90deg,
      var(--tx-text-color-secondary, #6b7280) 35%,
      var(--tx-text-color-primary, #111827) 50%,
      var(--tx-text-color-secondary, #6b7280) 65%
    );
    background-clip: text;
    background-size: 200% 100%;
    color: transparent;
    animation: tx-tool-call-card-shimmer 1.6s linear infinite;
  }

  .tx-tool-call-card__name {
    flex: none;
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  .tx-tool-call-card__summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--tx-text-color-secondary, #6b7280);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-tool-call-card__chevron {
    display: inline-flex;
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      transform: rotate(180deg);
    }
  }

  // The 0fr↔1fr grid transition animates height without JS measurement.
  .tx-tool-call-card__collapse {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.26s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      grid-template-rows: 1fr;
    }
  }

  .tx-tool-call-card__body {
    min-height: 0;
    overflow: hidden;
    padding: 0 12px;
  }

  // The card's own scroll box: everything below the header lives inside it, so
  // one cap covers the command, the log, the result and the footer together.
  .tx-tool-call-card__scroller {
    max-height: var(--tx-tool-call-card-max-height, 420px);
  }

  .tx-tool-call-card__collapse.is-open > .tx-tool-call-card__body {
    padding-bottom: 10px;
  }

  // The bordered frame holds the command, the output and the footer as one unit.
  .tx-tool-call-card__frame {
    margin-top: 6px;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 12px;
    background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 45%, transparent);
    overflow: hidden;

    > * + * {
      border-top: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    }
  }

  &[data-status='error'] .tx-tool-call-card__frame {
    border-color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 32%, var(--tx-border-color-lighter, #e5e7eb));
  }

  .tx-tool-call-card__section {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
  }

  .tx-tool-call-card__pre {
    margin: 0;
    color: var(--tx-text-color-primary, #111827);
    font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tx-tool-call-card__lines {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;

    &:hover {
      color: var(--tx-text-color-primary, #111827);
    }
  }

  .tx-tool-call-card__lines-chevron {
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      transform: rotate(180deg);
    }
  }

  .tx-tool-call-card__logs {
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--tx-color-black, #000) 82%, transparent);
    color: var(--tx-tool-call-card-log-color, #d6e2f0);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  // The widget surface: bounded so an embedded widget can't swallow the chat.
  .tx-tool-call-card__result {
    max-height: var(--tx-tool-call-card-result-max-height, 320px);
    overflow: auto;
    overscroll-behavior: contain;
    padding: 10px 12px;
  }

  .tx-tool-call-card__empty-result {
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11.5px;
    font-style: italic;
  }

  .tx-tool-call-card__running-hint {
    padding: 8px 12px;
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent);
    color: var(--tx-color-primary, #409eff);
    font-size: 11.5px;
  }

  .tx-tool-call-card__error {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 8%, transparent);
  }

  .tx-tool-call-card__error-icon {
    flex: none;
    display: inline-flex;
    margin-top: 1px;
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-call-card__error-text {
    flex: 1;
    min-width: 0;
    color: var(--tx-color-danger, #f56c6c);
    font-size: 12px;
    line-height: 1.5;
    word-break: break-word;
  }

  .tx-tool-call-card__retry {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid color-mix(in srgb, var(--tx-color-danger, #f56c6c) 35%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 10%, transparent);
    color: var(--tx-color-danger, #f56c6c);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover {
      background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 20%, transparent);
      border-color: var(--tx-color-danger, #f56c6c);
    }
  }

  .tx-tool-call-card__footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11.5px;
  }

  .tx-tool-call-card__status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  &[data-status='running'] .tx-tool-call-card__status {
    color: var(--tx-color-primary, #409eff);
  }

  &[data-status='done'] .tx-tool-call-card__status {
    color: var(--tx-color-success, #67c23a);
  }

  &[data-status='error'] .tx-tool-call-card__status {
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-call-card__time {
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }

  .tx-tool-call-card__peek {
    margin: 0;
    max-height: 3.1em;
    overflow-y: auto;
    padding: 0 12px 8px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    scrollbar-width: thin;
  }
}

@keyframes tx-tool-call-card-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@keyframes tx-tool-call-card-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-tool-call-card .tx-tool-call-card__collapse,
  .tx-tool-call-card .tx-tool-call-card__chevron,
  .tx-tool-call-card .tx-tool-call-card__lines-chevron,
  .tx-tool-call-card .tx-tool-call-card__spin {
    transition: none;
    animation: none;
  }

  .tx-tool-call-card[data-status='pending'] .tx-tool-call-card__name,
  .tx-tool-call-card[data-status='running'] .tx-tool-call-card__name {
    background: none;
    color: inherit;
    animation: none;
  }
}
</style>
