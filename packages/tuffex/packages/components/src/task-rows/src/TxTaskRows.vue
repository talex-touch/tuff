<!-- Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT. -->
<script setup lang="ts">
import type { TaskRowDetail, TaskRowItem, TaskRowsProps } from './types'
import { computed, ref, useId } from 'vue'

defineOptions({ name: 'TxTaskRows' })

const props = withDefaults(defineProps<TaskRowsProps>(), {
  variant: 'capsules',
  doneText: 'Completed',
  errorText: 'Failed',
  openIds: undefined,
})

const emit = defineEmits<{
  toggle: [id: string, open: boolean]
  'update:openIds': [ids: string[]]
}>()

defineSlots<{
  badge?: (props: { row: TaskRowItem }) => any
  detail?: (props: { row: TaskRowItem, detail: TaskRowDetail, index: number }) => any
  /** Host controls, rendered beside the toggle rather than inside it. */
  trailing?: (props: { row: TaskRowItem }) => any
}>()

const baseId = useId()

/**
 * Ring geometry. A 24px box with a 2px stroke leaves r = 11, and the arc is a
 * fixed 28% of the circumference: upstream's header comment describes a sweep
 * from 0 to 66%, but the code draws this constant dash and only rotates it.
 */
const RING_RADIUS = 11
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const RING_DASH = `${RING_CIRCUMFERENCE * 0.28} ${RING_CIRCUMFERENCE * 0.72}`

const internalOpen = ref(new Set(props.defaultOpenIds ?? []))

const openSet = computed(
  () => (props.openIds ? new Set(props.openIds) : internalOpen.value),
)

function isOpen(id: string): boolean {
  return openSet.value.has(id)
}

function toggle(id: string): void {
  const next = !isOpen(id)
  const ids = new Set(openSet.value)
  if (next)
    ids.add(id)
  else
    ids.delete(id)

  // A host that binds `openIds` owns the set and sees the new one through
  // `update:openIds`; everyone else gets it kept here.
  if (props.openIds === undefined)
    internalOpen.value = ids

  emit('toggle', id, next)
  emit('update:openIds', [...ids])
}

function pillText(row: TaskRowItem): string | undefined {
  if (row.statusText)
    return row.statusText

  switch (row.status) {
    case 'done':
      return props.doneText
    case 'error':
      return props.errorText
    case 'running':
      return props.runningText
    default:
      return props.pendingText
  }
}
</script>

<template>
  <ul class="tx-bui-task-rows" :class="`is-${variant}`" role="list">
    <li
      v-for="(row, index) in rows"
      :key="row.id"
      class="tx-bui-task-rows__row"
      :class="{ 'is-open': isOpen(row.id) }"
      :data-status="row.status"
      :style="{ '--tx-bui-task-rows-index': index }"
    >
      <div class="tx-bui-task-rows__header">
        <button
          type="button"
          class="tx-bui-task-rows__toggle"
          :aria-expanded="isOpen(row.id)"
          :aria-controls="`${baseId}-${index}`"
          @click="toggle(row.id)"
        >
          <span class="tx-bui-task-rows__badge">
            <slot name="badge" :row="row">
              <!-- Keyed on the status so the badge is rebuilt when it changes:
                   a `both`-filled pop-in never replays on a reused element. -->
              <span
                v-if="row.status === 'done' || row.status === 'error'"
                :key="row.status"
                class="tx-bui-task-rows__mark"
                :class="row.status === 'done' ? 'is-done' : 'is-error'"
                aria-hidden="true"
              >
                <svg
                  v-if="row.status === 'done'"
                  width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <svg
                  v-else
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="3.5" stroke-linecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </span>

              <span
                v-else
                :key="row.status"
                class="tx-bui-task-rows__ring"
                :class="{ 'is-active': row.status === 'running' }"
              >
                <svg
                  class="tx-bui-task-rows__ring-track"
                  width="24" height="24" viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    cx="12" cy="12" :r="RING_RADIUS" fill="none"
                    stroke="var(--tx-bui-line, #ecedef)" stroke-width="2"
                  />
                  <circle
                    v-if="row.status === 'running'"
                    cx="12" cy="12" :r="RING_RADIUS" fill="none"
                    stroke="var(--tx-bui-ink-3, #9a9da3)" stroke-width="2"
                    stroke-linecap="round" :stroke-dasharray="RING_DASH"
                  />
                </svg>
                <span v-if="row.index !== undefined" class="tx-bui-task-rows__ring-index">{{ row.index }}</span>
              </span>
            </slot>
          </span>

          <span class="tx-bui-task-rows__label">{{ row.label }}</span>

          <span v-if="row.amount" class="tx-bui-task-rows__amount">{{ row.amount }}</span>

          <span
            v-if="pillText(row)"
            :key="row.status"
            class="tx-bui-task-rows__pill"
          >
            {{ pillText(row) }}
            <!-- The turning arrow reports that a retry is under way. It is not
                 a control: a real button here would nest inside this toggle.
                 Hosts that need one use the `trailing` slot. -->
            <span
              v-if="row.status === 'error' && row.retryable !== false"
              class="tx-bui-task-rows__retry"
              aria-hidden="true"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
            </span>
          </span>

          <span class="tx-bui-task-rows__chevron" :class="{ 'is-open': isOpen(row.id) }" aria-hidden="true">
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>

        <slot name="trailing" :row="row" />
      </div>

      <!-- `inert` while closed: a 0fr grid still leaves its contents in the
           tab order, so the collapse has to take them out of it too. -->
      <div
        :id="`${baseId}-${index}`"
        class="tx-bui-task-rows__collapse"
        :class="{ 'is-open': isOpen(row.id) }"
        :inert="isOpen(row.id) ? undefined : true"
      >
        <div>
          <div v-if="row.details?.length" class="tx-bui-task-rows__details">
            <span class="tx-bui-task-rows__rail" aria-hidden="true" />
            <div class="tx-bui-task-rows__detail-list">
              <div
                v-for="(detail, detailIndex) in row.details"
                :key="detail.label"
                class="tx-bui-task-rows__detail"
                :style="{ '--tx-bui-task-rows-detail-index': detailIndex }"
              >
                <slot name="detail" :row="row" :detail="detail" :index="detailIndex">
                  <span class="tx-bui-task-rows__detail-label">{{ detail.label }}</span>
                  <span v-if="detail.meta" class="tx-bui-task-rows__detail-meta">{{ detail.meta }}</span>
                </slot>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  </ul>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-up;
@include bui-keyframes-fade-in;
@include bui-keyframes-pop-in;
@include bui-keyframes-spin;

.tx-bui-task-rows {
  @include bui-scope;

  display: flex;
  flex-direction: column;

  &.is-capsules {
    gap: 8px;
  }

  // One card holding hairline-divided rows, rather than a stack of capsules.
  &.is-list {
    align-self: flex-start;
    overflow: hidden;
    border-radius: var(--tx-bui-radius-card, 10px);
    background: var(--tx-bui-surface, #fff);
    box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);
  }

  .tx-bui-task-rows__row {
    @include bui-fade-up(450ms, calc(var(--tx-bui-task-rows-index, 0) * 80ms));

    align-self: stretch;
    overflow: hidden;
    transition: border-radius 0.3s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  &.is-capsules .tx-bui-task-rows__row {
    // The capsule squares off as it opens — the signature move of the variant.
    border-radius: 22px;
    background: var(--tx-bui-surface, #fff);
    box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);

    &.is-open {
      border-radius: 14px;
    }
  }

  &.is-list .tx-bui-task-rows__row {
    border-bottom: 1px solid var(--tx-bui-line, #ecedef);

    &:last-child {
      border-bottom: 0;
    }
  }

  .tx-bui-task-rows__header {
    display: flex;
    align-items: center;
  }

  .tx-bui-task-rows__toggle {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 44px;
    padding: 0 10px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.1s ease;

    &:hover {
      background: var(--tx-bui-inset, #f7f8f9);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: -2px;
    }
  }

  .tx-bui-task-rows__badge {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .tx-bui-task-rows__mark {
    @include bui-pop-in(300ms);

    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    color: #fff;

    &.is-done {
      background: var(--tx-bui-green, #189a4d);
    }

    &.is-error {
      background: var(--tx-bui-red, #e3474c);
    }
  }

  .tx-bui-task-rows__ring {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .tx-bui-task-rows__ring-track {
    position: absolute;
    inset: 0;
  }

  .tx-bui-task-rows__ring.is-active .tx-bui-task-rows__ring-track {
    animation: tx-bui-spin 1.1s linear infinite;
  }

  .tx-bui-task-rows__ring-index {
    @include bui-tabular-nums;

    position: relative;
    color: var(--tx-bui-ink, #1f2124);
    font-size: 10.5px;
    font-weight: 600;
  }

  .tx-bui-task-rows__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--tx-bui-ink, #1f2124);
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-task-rows__amount {
    @include bui-tabular-nums;

    flex: none;
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 12.5px;
  }

  .tx-bui-task-rows__pill {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--tx-bui-field, #f2f2f3);
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 11.5px;
    font-weight: 500;
    animation: tx-bui-fade-in 200ms ease-out both;
  }

  .tx-bui-task-rows__row[data-status='done'] .tx-bui-task-rows__pill {
    background: var(--tx-bui-green-tint, #e8f5ed);
    color: var(--tx-bui-green, #189a4d);
  }

  .tx-bui-task-rows__row[data-status='error'] .tx-bui-task-rows__pill {
    background: var(--tx-bui-red-tint, #fcecec);
    color: var(--tx-bui-red, #e3474c);
  }

  .tx-bui-task-rows__retry {
    display: flex;
    animation: tx-bui-spin 1.2s linear infinite;
  }

  .tx-bui-task-rows__chevron {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-left: -8px;
    border-radius: 999px;
    color: var(--tx-bui-ink-3, #9a9da3);

    svg {
      transition: transform 0.3s ease;
    }

    &.is-open svg {
      transform: rotate(180deg);
    }
  }

  .tx-bui-task-rows__collapse {
    @include bui-disclosure-collapse(0.3s);
  }

  .tx-bui-task-rows__details {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 10px;
    margin-bottom: 10px;
    padding: 0 10px;
  }

  .tx-bui-task-rows__rail {
    width: 1px;
    height: 100%;
    margin: 0 auto;
    background: var(--tx-bui-line, #ecedef);
  }

  .tx-bui-task-rows__detail-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tx-bui-task-rows__detail {
    @include bui-fade-up(300ms, calc(120ms + var(--tx-bui-task-rows-detail-index, 0) * 100ms));

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .tx-bui-task-rows__detail-label {
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 12px;
  }

  .tx-bui-task-rows__detail-meta {
    @include bui-tabular-nums;

    color: var(--tx-bui-ink-3, #9a9da3);
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  // The mixins carry their own guards; these are the hand-written ones. Status
  // still moves through the rows — only the tweening stops.
  .tx-bui-task-rows .tx-bui-task-rows__row,
  .tx-bui-task-rows .tx-bui-task-rows__toggle,
  .tx-bui-task-rows .tx-bui-task-rows__chevron svg {
    transition: none;
  }

  .tx-bui-task-rows .tx-bui-task-rows__ring.is-active .tx-bui-task-rows__ring-track,
  .tx-bui-task-rows .tx-bui-task-rows__retry,
  .tx-bui-task-rows .tx-bui-task-rows__pill {
    animation: none;
  }
}
</style>
