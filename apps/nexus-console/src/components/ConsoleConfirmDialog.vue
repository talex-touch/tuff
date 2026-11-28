<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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

const canConfirm = computed(() => {
  if (props.loading)
    return false
  const required = props.requireText?.trim() ?? ''
  return !required || typed.value.trim() === required
})

watch(() => props.open, (isOpen) => {
  if (isOpen)
    typed.value = ''
})

function requestClose(next: boolean) {
  if (!next && props.loading)
    return
  emit('update:open', next)
}

function submitConfirm() {
  if (canConfirm.value)
    emit('confirm')
}
</script>

<template>
  <TxModal
    :model-value="open"
    :title="title"
    :close-label="t('common.close')"
    width="440px"
    @update:model-value="requestClose"
  >
    <div class="ConsoleConfirm">
      <p v-if="description" class="ConsoleConfirm-Desc">
        {{ description }}
      </p>
      <slot />
      <div v-if="requireText" class="ConsoleConfirm-Require">
        <label class="ConsoleConfirm-Label" :for="inputId">
          {{ t('common.requireConfirmText', { text: requireText }) }}
        </label>
        <TuffInput :id="inputId" v-model="typed" autocomplete="off" :disabled="loading" />
      </div>
    </div>
    <template #footer>
      <TxButton variant="secondary" size="sm" :disabled="loading" @click="requestClose(false)">
        {{ cancelLabel || t('common.cancel') }}
      </TxButton>
      <TxButton
        :variant="tone === 'warning' ? 'warning' : 'danger'"
        size="sm"
        :disabled="!canConfirm"
        :loading="loading"
        @click="submitConfirm"
      >
        {{ confirmLabel || t('common.confirm') }}
      </TxButton>
    </template>
  </TxModal>
</template>

<style scoped>
.ConsoleConfirm {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ConsoleConfirm-Desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--tx-text-color-regular);
  text-wrap: pretty;
}

.ConsoleConfirm-Require {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ConsoleConfirm-Label {
  font-size: 13px;
  color: var(--tx-text-color-regular);
}
</style>
