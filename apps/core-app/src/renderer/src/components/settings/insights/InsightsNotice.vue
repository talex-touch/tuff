<script setup lang="ts">
import type { InsightsNoticeTone } from './types'

/**
 * A notice inside an insights page: a title, a sentence, and at most one action at the end.
 *
 * `error` is an interruption (`role="alert"`); `warning` and `info` are announced politely
 * (`role="status"`). The page decides when a notice exists; this only decides how it reads.
 */
defineOptions({ name: 'InsightsNotice' })

defineProps<{
  tone: InsightsNoticeTone
  /** Bold first line. */
  title?: string
  /** The sentence under the title, or the whole message when there is no title. */
  description?: string
}>()

defineSlots<{
  /** One button, at the end of the row: the thing to do about it. */
  action?: () => unknown
}>()
</script>

<template>
  <div class="InsightsNotice" :class="`is-${tone}`" :role="tone === 'error' ? 'alert' : 'status'">
    <div>
      <strong v-if="title">{{ title }}</strong>
      <span v-if="description">{{ description }}</span>
    </div>
    <slot name="action" />
  </div>
</template>

<style scoped lang="scss">
.InsightsNotice {
  display: flex;
  gap: var(--shell-space-4);
  align-items: center;
  justify-content: space-between;
  max-width: 1440px;
  margin: 0 auto var(--shell-space-4);
  padding: var(--shell-space-3) var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
  color: var(--shell-text-regular);

  &.is-error {
    border-color: var(--shell-danger-border);
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }

  &.is-warning {
    border-color: var(--shell-warning-border);
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }

  /* The neutral ramp, so a fact does not compete with the two tones that ask for action. */
  &.is-info {
    border-color: var(--shell-info-border);
    background: var(--shell-info-soft);
    color: var(--shell-info);
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: var(--shell-space-1);
  }

  strong,
  span {
    font-size: var(--shell-fs-body);
    line-height: 1.4;
  }
}

@media (max-width: 680px) {
  .InsightsNotice {
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .InsightsNotice {
    display: flex;
    flex-direction: column;
  }
}
</style>
