<!-- Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT. -->
<script setup lang="ts">
import type { AgentTraceProps, AgentTraceRow, AgentTraceVariant } from './types'
import { computed, ref, useId } from 'vue'

defineOptions({ name: 'TxAgentTrace' })

const props = withDefaults(defineProps<AgentTraceProps>(), {
  variant: 'steps',
  working: false,
  defaultOpen: undefined,
  userOpen: undefined,
  selectedId: undefined,
})

const emit = defineEmits<{
  toggle: [open: boolean]
  /** `search`: the host opens the URL — the trace never navigates on its own. */
  open: [row: AgentTraceRow]
  /** `coding`: null when the row is deselected. */
  select: [id: string | null]
}>()

defineSlots<{
  icon?: (props: { working: boolean }) => any
  label?: (props: { working: boolean }) => any
  row?: (props: { row: AgentTraceRow, index: number }) => any
}>()

const bodyId = useId()

/**
 * Settled copy stays generic: upstream's `Thought for 4 seconds` and
 * `Ran 3 tools` fold a measurement into the string, which only the host can
 * supply. Pass `doneLabel` for those.
 */
const VARIANT_LABELS: Record<AgentTraceVariant, { active: string, done: string }> = {
  steps: { active: 'Thinking', done: 'Thought' },
  reasoning: { active: 'Thinking', done: 'Thought' },
  search: { active: 'Searching the web', done: 'Searched the web' },
  coding: { active: 'Running tools', done: 'Ran tools' },
}

const headerLabel = computed(() => {
  const fallback = VARIANT_LABELS[props.variant] ?? VARIANT_LABELS.steps
  return props.working
    ? props.activeLabel ?? fallback.active
    : props.doneLabel ?? fallback.done
})

/**
 * Open follows the work: the trace holds itself open while `working` and
 * folds away once it settles. A click overrides that from then on — the
 * reader's choice wins, and a host that owns `userOpen` keeps it across
 * remounts.
 */
const userOverride = ref<boolean | null>(null)

const open = computed(
  () => props.userOpen ?? userOverride.value ?? props.defaultOpen ?? props.working,
)

function toggle(): void {
  const next = !open.value
  userOverride.value = next
  emit('toggle', next)
}

// Selection is the host's while `selectedId` is bound, and the component's
// otherwise — the same handoff as `userOpen` above.
const internalSelected = ref<string | null>(null)
const selection = computed(() => props.selectedId ?? internalSelected.value)

const isLink = (row: AgentTraceRow): boolean => props.variant === 'search' && !!row.href
const isSelectable = computed(() => props.variant === 'coding')

function rowTag(row: AgentTraceRow): string {
  if (isLink(row))
    return 'a'
  if (isSelectable.value)
    return 'button'
  return 'div'
}

function rowBindings(row: AgentTraceRow): Record<string, unknown> {
  if (isLink(row))
    return { href: row.href }
  if (isSelectable.value)
    return { 'type': 'button', 'aria-pressed': selection.value === row.id }
  return {}
}

function onRowClick(event: MouseEvent, row: AgentTraceRow): void {
  if (isLink(row)) {
    // Never navigate from inside the component: an Electron renderer opening
    // a remote page in place is a security problem, so the host decides.
    event.preventDefault()
    emit('open', row)
    return
  }

  if (isSelectable.value) {
    const next = selection.value === row.id ? null : row.id
    if (props.selectedId === undefined)
      internalSelected.value = next
    emit('select', next)
  }
}

type StepGlyph = 'spinner' | 'error' | 'check'

function stepGlyph(row: AgentTraceRow, index: number): StepGlyph {
  if (row.status === 'active')
    return 'spinner'
  if (row.status === 'error')
    return 'error'
  if (row.status)
    return 'check'
  // Upstream default: the newest row is the one still turning.
  return props.working && index === props.rows.length - 1 ? 'spinner' : 'check'
}
</script>

<template>
  <div class="tx-bui-agent-trace" :data-variant="variant">
    <button
      type="button"
      class="tx-bui-agent-trace__header"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span
        class="tx-bui-agent-trace__icon"
        :class="{ 'is-working': working }"
        aria-hidden="true"
      >
        <slot name="icon" :working="working">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        </slot>
      </span>

      <!-- Keyed on the phase so settling replays the fade-in: without a fresh
           element the `both`-filled animation would never run again. -->
      <span
        :key="working ? 'working' : 'settled'"
        class="tx-bui-agent-trace__label"
        :class="{ 'is-working': working }"
      >
        <slot name="label" :working="working">{{ headerLabel }}</slot>
      </span>

      <span
        class="tx-bui-agent-trace__chevron"
        :class="{ 'is-open': open }"
        aria-hidden="true"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>

    <!-- `inert` while closed: a 0fr grid still leaves its rows in the tab
         order, so the collapse has to take them out of it too. -->
    <div
      :id="bodyId"
      class="tx-bui-agent-trace__collapse"
      :class="{ 'is-open': open }"
      :inert="open ? undefined : true"
    >
      <div>
        <div class="tx-bui-agent-trace__trace">
          <div class="tx-bui-agent-trace__body">
            <div v-if="query" class="tx-bui-agent-trace__query">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <span>{{ query }}</span>
            </div>

            <ul v-if="rows.length" class="tx-bui-agent-trace__rows">
              <li
                v-for="(row, index) in rows"
                :key="row.id"
                class="tx-bui-agent-trace__item"
                :style="{ '--tx-bui-agent-trace-index': index }"
              >
                <component
                  :is="rowTag(row)"
                  class="tx-bui-agent-trace__row"
                  :class="{ 'is-selected': isSelectable && selection === row.id }"
                  v-bind="rowBindings(row)"
                  @click="onRowClick($event, row)"
                >
                  <slot name="row" :row="row" :index="index">
                    <span
                      v-if="variant === 'search'"
                      class="tx-bui-agent-trace__dot"
                      aria-hidden="true"
                    >
                      <svg
                        width="9" height="9" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                      </svg>
                    </span>

                    <template v-if="variant === 'steps'">
                      <span
                        v-if="stepGlyph(row, index) === 'spinner'"
                        class="tx-bui-agent-trace__spinner"
                        aria-hidden="true"
                      />
                      <svg
                        v-else-if="stepGlyph(row, index) === 'error'"
                        class="tx-bui-agent-trace__glyph is-error"
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      <svg
                        v-else
                        class="tx-bui-agent-trace__glyph"
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </template>

                    <span class="tx-bui-agent-trace__primary">{{ row.primary }}</span>

                    <span
                      v-if="row.secondary"
                      class="tx-bui-agent-trace__secondary"
                      :class="{ 'is-mono': row.mono }"
                    >{{ row.secondary }}</span>

                    <span v-if="row.added !== undefined || row.removed !== undefined" class="tx-bui-agent-trace__diff">
                      <span
                        v-if="row.added !== undefined"
                        class="tx-bui-agent-trace__added"
                      >+{{ row.added }}</span>
                      <!-- U+2212 MINUS SIGN, not a hyphen: it matches the plus
                           in width and weight so the pair stays aligned. -->
                      <span
                        v-if="row.removed !== undefined"
                        class="tx-bui-agent-trace__removed"
                      >−{{ row.removed }}</span>
                    </span>
                  </slot>
                </component>
              </li>
            </ul>

            <span v-if="moreLabel" class="tx-bui-agent-trace__more">{{ moreLabel }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-shimmer-text;
@include bui-keyframes-fade-up;
@include bui-keyframes-fade-in;
@include bui-keyframes-spin;

.tx-bui-agent-trace {
  @include bui-scope;

  display: flex;
  flex-direction: column;

  .tx-bui-agent-trace__header {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 8px;
    margin-left: -6px;
    padding: 4px 6px;
    border-radius: var(--tx-bui-radius-control, 8px);
    cursor: pointer;
    transition: background-color 0.1s ease;

    &:hover {
      background: var(--tx-bui-hover-2, #e7e9eb);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: 2px;
    }
  }

  .tx-bui-agent-trace__icon {
    display: inline-flex;
    flex: none;
    color: var(--tx-bui-ink-3, #9a9da3);

    &.is-working {
      color: var(--tx-bui-ink-2, #62656b);
    }
  }

  .tx-bui-agent-trace__label {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;

    &.is-working {
      @include bui-shimmer-text;
    }

    &:not(.is-working) {
      color: var(--tx-bui-ink-2, #62656b);
      animation: tx-bui-fade-in 350ms ease-out both;
    }
  }

  .tx-bui-agent-trace__chevron {
    display: inline-flex;
    flex: none;
    color: var(--tx-bui-ink-3, #9a9da3);
    transition: transform 0.3s ease;

    &.is-open {
      transform: rotate(180deg);
    }
  }

  .tx-bui-agent-trace__collapse {
    @include bui-disclosure-collapse(0.4s);
  }

  .tx-bui-agent-trace__trace {
    position: relative;
    margin-top: 4px;
    margin-left: 5px;
    padding-left: 16px;

    // The rail. Upstream measures the row stack in a layout effect and tweens
    // its height over 500ms; an inset pseudo-element draws the same line with
    // no measurement, and the collapse is already clipping it as it grows.
    &::before {
      content: '';
      position: absolute;
      top: -8px;
      bottom: 2px;
      left: 3px;
      width: 1px;
      background: var(--tx-bui-line, #ecedef);
    }
  }

  .tx-bui-agent-trace__body,
  .tx-bui-agent-trace__rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tx-bui-agent-trace__body {
    padding: 4px 0;
  }

  .tx-bui-agent-trace__item {
    @include bui-fade-up(320ms, calc(var(--tx-bui-agent-trace-index, 0) * 120ms));
  }

  .tx-bui-agent-trace__row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 28px;
    padding: 2px 6px;
    border-radius: 6px;
    color: inherit;
    text-align: left;
    text-decoration: none;
    transition: background-color 0.15s ease;
  }

  a.tx-bui-agent-trace__row,
  button.tx-bui-agent-trace__row {
    cursor: pointer;

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: -2px;
    }

    &.is-selected {
      background: var(--tx-bui-inset, #f7f8f9);
    }
  }

  .tx-bui-agent-trace__dot {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: var(--tx-bui-accent, #0285ff);
    color: #fff;
  }

  // Upstream cycles the source dots through accent / orange / green.
  .tx-bui-agent-trace__item:nth-child(3n + 2) .tx-bui-agent-trace__dot {
    background: var(--tx-bui-orange, #ef720c);
  }

  .tx-bui-agent-trace__item:nth-child(3n) .tx-bui-agent-trace__dot {
    background: var(--tx-bui-green, #189a4d);
  }

  .tx-bui-agent-trace__glyph {
    flex: none;
    color: var(--tx-bui-ink-3, #9a9da3);

    &.is-error {
      color: var(--tx-bui-red, #e3474c);
    }
  }

  // A bordered circle rather than an SVG arc — one border-top colour is the
  // whole spinner.
  .tx-bui-agent-trace__spinner {
    flex: none;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--tx-bui-line-strong, #e0e2e5);
    border-top-color: var(--tx-bui-ink-2, #62656b);
    border-radius: 999px;
    animation: tx-bui-spin 700ms linear infinite;
  }

  .tx-bui-agent-trace__primary {
    position: relative;
    min-width: 0;
    overflow: hidden;
    color: var(--tx-bui-ink, #1f2124);
    font-size: 12.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // Prose reasoning wraps and never truncates. Upstream carries both `truncate`
  // and `whitespace-normal` here, which leaves the ellipsis machinery on a
  // multi-line paragraph; this is the readable half of that intent.
  &[data-variant='reasoning'] .tx-bui-agent-trace__primary {
    overflow: visible;
    color: var(--tx-bui-ink-2, #62656b);
    font-weight: 400;
    line-height: 1.625;
    text-overflow: clip;
    white-space: normal;
  }

  &[data-variant='search'] .tx-bui-agent-trace__primary::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 1px;
    background: currentColor;
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &[data-variant='search'] .tx-bui-agent-trace__row:hover .tx-bui-agent-trace__primary::after,
  &[data-variant='search'] .tx-bui-agent-trace__row:focus-visible .tx-bui-agent-trace__primary::after {
    transform: scaleX(1);
  }

  .tx-bui-agent-trace__secondary {
    flex: none;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 11.5px;

    &.is-mono {
      font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    }
  }

  .tx-bui-agent-trace__diff {
    @include bui-tabular-nums;

    display: inline-flex;
    flex: none;
    gap: 4px;
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11px;
  }

  .tx-bui-agent-trace__added {
    color: var(--tx-bui-green, #189a4d);
  }

  .tx-bui-agent-trace__removed {
    color: var(--tx-bui-red, #e3474c);
  }

  .tx-bui-agent-trace__more {
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 12px;
    animation: tx-bui-fade-in 300ms ease-out both;
  }

  .tx-bui-agent-trace__query {
    @include bui-fade-up(300ms);

    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 6px;
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 12.5px;

    svg {
      flex: none;
      color: var(--tx-bui-ink-3, #9a9da3);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  // The mixins carry their own guards; these are the hand-written ones. The
  // trace still runs its state machine — only the tweening stops.
  .tx-bui-agent-trace .tx-bui-agent-trace__chevron,
  .tx-bui-agent-trace .tx-bui-agent-trace__row,
  .tx-bui-agent-trace .tx-bui-agent-trace__header,
  .tx-bui-agent-trace .tx-bui-agent-trace__primary::after {
    transition: none;
  }

  .tx-bui-agent-trace .tx-bui-agent-trace__spinner,
  .tx-bui-agent-trace .tx-bui-agent-trace__more,
  .tx-bui-agent-trace .tx-bui-agent-trace__label:not(.is-working) {
    animation: none;
  }
}
</style>
