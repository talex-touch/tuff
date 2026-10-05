<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { ref } from 'vue'

/**
 * The Flow page's confirmation: the third page of the ⌘K card, for a target that needs
 * authorization, confirmation of the dispatch, or both. It only draws what the owner worked out
 * (`useMetaFlowPage`); the owner moves focus here and keeps Tab among the buttons.
 */

defineProps<{
  title: string
  description: string
  denyLabel: string
  /** The second button; drawn only when `showOnce`, beside an `always` primary. */
  onceLabel: string
  showOnce: boolean
  primaryLabel: string
  /** The grant is on its way: every button waits for the card to close. */
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'deny'): void
  (e: 'once'): void
  (e: 'primary'): void
}>()

const rootRef = ref<HTMLElement>()

/** The buttons in order, for the owner's Tab and Enter handling. */
function buttons(): HTMLButtonElement[] {
  return Array.from(rootRef.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
}

/** The page opens on its primary button: Enter confirms, Escape denies. */
function focusPrimary(): void {
  rootRef.value?.querySelector<HTMLButtonElement>('.MetaFlowConfirm-Primary')?.focus()
}

defineExpose({ buttons, focusPrimary })
</script>

<template>
  <div
    ref="rootRef"
    class="MetaFlowConfirm"
    role="group"
    aria-labelledby="meta-flow-confirm-title"
    aria-describedby="meta-flow-confirm-description"
  >
    <p id="meta-flow-confirm-title" class="MetaFlowConfirm-Title">{{ title }}</p>
    <p id="meta-flow-confirm-description" class="MetaFlowConfirm-Description">
      {{ description }}
    </p>
    <div class="MetaFlowConfirm-Actions">
      <TxButton variant="secondary" size="sm" :disabled="loading" @click="emit('deny')">
        {{ denyLabel }}
      </TxButton>
      <TxButton
        v-if="showOnce"
        variant="secondary"
        size="sm"
        :disabled="loading"
        @click="emit('once')"
      >
        {{ onceLabel }}
      </TxButton>
      <TxButton
        class="MetaFlowConfirm-Primary"
        variant="primary"
        size="sm"
        :disabled="loading"
        @click="emit('primary')"
      >
        {{ primaryLabel }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.MetaFlowConfirm {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.MetaFlowConfirm-Title {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.MetaFlowConfirm-Description {
  margin: 0;
  // Read before deciding: `secondary` ink is under AA for text (tuffex-design-rules).
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}

.MetaFlowConfirm-Actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
