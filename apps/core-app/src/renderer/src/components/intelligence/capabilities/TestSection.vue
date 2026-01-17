<script lang="ts" setup>
import type { IntelligenceProviderConfig } from '@talex-touch/utils/types/intelligence'
import type { CapabilityTestResult } from './types'
import CapabilityTestInput from './CapabilityTestInput.vue'
import CapabilityTestResultView from './CapabilityTestResult.vue'

defineProps<{
  capabilityId: string
  isTesting: boolean
  disabled: boolean
  testResult?: CapabilityTestResult | null
  enabledBindings?: Array<{
    providerId: string
    provider?: IntelligenceProviderConfig
    models?: string[]
  }>
}>()

const emits = defineEmits<{
  test: [
    options: {
      providerId: string
      model?: string
      promptTemplate?: string
      promptVariables?: Record<string, any>
      userInput?: string
    }
  ]
}>()

function handleTest(options: {
  providerId: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, any>
  userInput?: string
}): void {
  emits('test', options)
}
</script>

<template>
  <div class="test-section">
    <CapabilityTestInput
      :capability-id="capabilityId"
      :is-testing="isTesting"
      :disabled="disabled"
      :enabled-bindings="enabledBindings"
      @test="handleTest"
    />

    <CapabilityTestResultView v-if="testResult" :result="testResult" />
  </div>
</template>

<style lang="scss" scoped>
.test-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
