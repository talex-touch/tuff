<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { computed, ref, useId, watch } from 'vue'
import { canConfirmAdminAction } from '~/utils/admin-kit'

/**
 * The console's one confirmation for destructive and risky actions.
 *
 * - `tone` colours the confirm button: `danger` for what cannot be undone,
 *   `warning` for what can.
 * - `requireText` makes the operator type a value (an email, an id, "DELETE")
 *   before the button unlocks — for the irreversible ones.
 * - While `loading`, both buttons are disabled and Escape / the backdrop cannot
 *   close the dialog, so a request in flight is never orphaned.
 *
 * Built on `TxModal` rather than `TxBottomDialog`: the bottom sheet has action rows
 * but no content slot, so it cannot hold the confirmation input.
 */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'warning'
  requireText?: string
  loading?: boolean
}>(), {
  tone: 'danger',
  loading: false,
})

const emit = defineEmits<{
  'update:open': [open: boolean]
  'confirm': []
}>()

const { t } = useI18n()
const typed = ref('')
const inputId = useId()

const canConfirm = computed(() => canConfirmAdminAction({
  requireText: props.requireText,
  input: typed.value,
  loading: props.loading,
}))

watch(() => props.open, (open) => {
  if (open)
    typed.value = ''
})

function requestClose(open: boolean) {
  if (!open && props.loading)
    return
  emit('update:open', open)
}

function confirm() {
  if (canConfirm.value)
    emit('confirm')
}
</script>

<template>
  <TxModal :model-value="open" :title="title" width="440px" @update:model-value="requestClose">
    <div class="AdminConfirmDialog">
      <p v-if="description" class="AdminConfirmDialog-Description">
        {{ description }}
      </p>
      <slot />
      <div v-if="requireText" class="AdminConfirmDialog-Require">
        <label class="AdminConfirmDialog-RequireLabel" :for="inputId">
          {{ t('dashboard.sections.adminKit.confirm.requireText', { text: requireText }) }}
        </label>
        <TuffInput :id="inputId" v-model="typed" autocomplete="off" spellcheck="false" :disabled="loading" />
      </div>
    </div>
    <template #footer>
      <TxButton variant="secondary" size="sm" :disabled="loading" @click="requestClose(false)">
        {{ cancelLabel || t('common.cancel', 'Cancel') }}
      </TxButton>
      <TxButton
        :variant="tone === 'warning' ? 'warning' : 'danger'"
        size="sm"
        :disabled="!canConfirm"
        :loading="loading"
        @click="confirm"
      >
        {{ confirmLabel || t('common.confirm', 'Confirm') }}
      </TxButton>
    </template>
  </TxModal>
</template>

<style scoped>
.AdminConfirmDialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.AdminConfirmDialog-Description {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-line;
}

.AdminConfirmDialog-Require {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.AdminConfirmDialog-RequireLabel {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.4;
}
</style>
