<script lang="ts" setup>
import type { IntelligenceProviderConfig } from '@talex-touch/utils/types/intelligence'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TxButton } from '@talex-touch/tuffex'
import TuffDrawer from '~/components/base/dialog/TuffDrawer.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const props = defineProps<{
  modelValue: boolean
  capabilityId: string
  enabledProviders: IntelligenceProviderConfig[]
  isTesting: boolean
  testMeta: {
    requiresUserInput: boolean
    inputHint: string
  }
}>()

const emits = defineEmits<{
  'update:modelValue': [value: boolean]
  test: [providerId: string, userInput?: string]
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emits('update:modelValue', value)
})

const selectedProviderId = ref<string>('')
const userInput = ref('')

watch(
  () => props.enabledProviders,
  (providers) => {
    if (providers.length > 0 && !selectedProviderId.value) {
      selectedProviderId.value = providers[0].id
    }
  },
  { immediate: true }
)

watch(visible, (isVisible) => {
  if (!isVisible) {
    userInput.value = ''
  }
})

function handleTest(): void {
  if (!selectedProviderId.value) return
  emits('test', selectedProviderId.value, userInput.value || undefined)
}

function handleCancel(): void {
  visible.value = false
}
</script>

<template>
  <TuffDrawer v-model:visible="visible" :title="t('settings.intelligence.capabilityTestTitle')">
    <div class="capability-test-dialog">
      <p class="capability-test-dialog__description">
        {{ t('settings.intelligence.capabilityTestDesc') }}
      </p>

      <TuffGroupBlock
        :name="t('settings.intelligence.testProvider')"
        :description="t('settings.intelligence.testProviderDesc')"
        default-icon="i-carbon-api-1"
        active-icon="i-carbon-api-1"
        memory-name="capability-test-provider"
      >
        <div class="provider-select-list">
          <TxButton
            v-for="provider in enabledProviders"
            :key="provider.id"
            variant="bare"
            native-type="button"
            class="provider-select-item"
            :class="{ 'is-selected': selectedProviderId === provider.id }"
            @click="selectedProviderId = provider.id"
          >
            <div class="provider-select-item__content">
              <span class="provider-select-item__name">{{ provider.name }}</span>
              <span class="provider-select-item__type">{{ provider.type }}</span>
            </div>
            <i
              v-if="selectedProviderId === provider.id"
              class="i-carbon-checkmark-filled provider-select-item__check"
            />
          </TxButton>
          <div v-if="enabledProviders.length === 0" class="provider-select-empty">
            {{ t('settings.intelligence.noEnabledProviders') }}
          </div>
        </div>
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="testMeta.requiresUserInput"
        :name="t('settings.intelligence.testInput')"
        :description="testMeta.inputHint"
        default-icon="i-carbon-edit"
        active-icon="i-carbon-edit"
        memory-name="capability-test-input"
      >
        <el-input v-model="userInput" type="textarea" :placeholder="testMeta.inputHint" :rows="4" />
      </TuffGroupBlock>

      <div class="capability-test-dialog__actions">
        <TxButton variant="flat" block @click="handleCancel">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton
          variant="flat"
          type="primary"
          block
          :disabled="isTesting || !selectedProviderId"
          :aria-busy="isTesting"
          @click="handleTest"
        >
          <i
            :class="isTesting ? 'i-carbon-renew animate-spin' : 'i-carbon-flash'"
            aria-hidden="true"
          />
          <span>{{
            isTesting ? t('settings.intelligence.testing') : t('settings.intelligence.runTest')
          }}</span>
        </TxButton>
      </div>
    </div>
  </TuffDrawer>
</template>

<style lang="scss" scoped>
.capability-test-dialog {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.capability-test-dialog__description {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.provider-select-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-select-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-radius: 0.9rem;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-border-color);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    background: rgba(99, 102, 241, 0.08);
  }
}

.provider-select-item__content {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.provider-select-item__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.provider-select-item__type {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}

.provider-select-item__check {
  font-size: 1.25rem;
  color: var(--el-color-primary);
}

.provider-select-empty {
  padding: 1rem;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.capability-test-dialog__actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}
</style>
