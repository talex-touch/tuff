<script lang="ts">
import type { PropType } from 'vue'

// The action slot every plugin surface of the Store template shares — card,
// carousel slide, detail header and installed row. It draws what the store
// computed and reports presses; the install / update flow lives in
// TemplateStoreDemo, so all four surfaces stay in step while a plugin installs.
export interface StoreActionView {
  kind: 'button' | 'progress'
  /** Button: visible verb, its accessible name (verb + plugin), icon and tone. */
  label: string
  ariaLabel: string
  icon: string
  variant: 'primary' | 'secondary'
  loading: boolean
  /** Progress: phase text, byte readout, percentage (`null` = indeterminate). */
  status: string
  detail: string
  percentage: number | null
  /** Names the cancel button, which stays mounted through the whole flow. */
  cancelLabel: string
  /** False while verifying / installing: the button stays, locked. */
  cancellable: boolean
  /** Shown under Retry after a failed install (full size only). */
  error: string
}
</script>

<script setup lang="ts">
defineProps({
  view: { type: Object as PropType<StoreActionView>, required: true },
  /** Cards, slides and rows: a narrow slot, so the byte readout and error line drop out. */
  compact: { type: Boolean, default: false },
})

const emit = defineEmits<{ press: [], cancel: [] }>()
</script>

<template>
  <!-- One stable root: when the button turns into a progress bar, the store
       hands focus to the cancel button inside the same root. -->
  <div class="store-action" :class="[`is-${view.kind}`, { 'is-compact': compact }]">
    <template v-if="view.kind === 'button'">
      <TxButton
        size="sm"
        :variant="view.variant"
        :icon="view.icon"
        :loading="view.loading"
        :aria-label="view.ariaLabel"
        @click="emit('press')"
      >
        {{ view.label }}
      </TxButton>
      <span v-if="view.error && !compact" class="store-action__error">{{ view.error }}</span>
    </template>
    <template v-else>
      <div class="store-action__progress">
        <span class="store-action__status">
          <span class="store-action__phase">{{ view.status }}</span>
          <span v-if="view.detail && !compact" class="store-action__detail">{{ view.detail }}</span>
        </span>
        <TxProgressBar
          :percentage="view.percentage ?? 0"
          :indeterminate="view.percentage === null"
          height="4px"
          :aria-label="view.status"
        />
      </div>
      <!-- Locked with aria-disabled rather than removed or `disabled`: a
           keyboard reader who pressed Install keeps focus here until the
           plugin is ready. -->
      <TxIconButton
        class="store-action__cancel"
        :class="{ 'is-locked': !view.cancellable }"
        icon="i-carbon-close"
        size="xs"
        :label="view.cancelLabel"
        :aria-disabled="view.cancellable ? undefined : 'true'"
        @click="view.cancellable && emit('cancel')"
      />
    </template>
  </div>
</template>

<style scoped>
.store-action {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.store-action.is-button:not(.is-compact) {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.store-action.is-progress {
  width: 100%;
}

.store-action__progress {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.store-action__status {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  gap: 8px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  white-space: nowrap;
}

.store-action__phase {
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-action__detail {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
}

.store-action__cancel.is-locked {
  cursor: default;
  opacity: 0.4;
}

.store-action__error {
  max-width: 280px;
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
  font-size: 12px;
  line-height: 1.45;
}
</style>
