<script setup lang="ts" name="MainBoxHeader">
import type { ITuffIcon } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import { computed, ref } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { appSetting } from '~/modules/channel/storage'
import BoxInput from './BoxInput.vue'
import PrefixPart from './PrefixPart.vue'
import TagSection from './tag/TagSection.vue'

interface Props {
  searchVal: string
  boxOptions: IBoxOptions
  clipboardOptions: any
  activeActivations: any[]
  isUIMode: boolean
  completionDisplay: string
}

interface Emits {
  (e: 'update:searchVal', value: string): void
  (e: 'exit'): void
  (e: 'deactivate-provider', id?: string): void
  (e: 'paste', options?: { overrideDismissed?: boolean }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const boxInputRef = ref()
defineExpose({ boxInputRef })

const inputValue = computed({
  get: () => props.searchVal,
  set: (v) => emit('update:searchVal', v)
})

const pinIcon = computed<ITuffIcon>(() => ({
  type: 'class',
  value: appSetting.tools.autoHide ? 'i-ri-pushpin-2-line' : 'i-ri-pushpin-2-fill',
  status: 'normal'
}))

function handleTogglePin(): void {
  appSetting.tools.autoHide = !appSetting.tools.autoHide
}

function handlePaste(): void {
  emit('paste', { overrideDismissed: true })
}
</script>

<template>
  <div class="MainBoxHeader" @paste="handlePaste">
    <PrefixPart
      :providers="activeActivations"
      @close="emit('exit')"
      @deactivate-provider="(id) => emit('deactivate-provider', id)"
    />

    <BoxInput
      ref="boxInputRef"
      v-model="inputValue"
      :box-options="boxOptions"
      :class="{ 'ui-mode-hidden': isUIMode }"
      :disabled="isUIMode"
    >
      <template #completion>
        <div class="text-sm truncate" v-html="completionDisplay" />
      </template>
    </BoxInput>

    <TagSection
      v-if="!isUIMode"
      :box-options="boxOptions"
      :clipboard-options="clipboardOptions"
    />

    <div class="CoreBox-Configure">
      <TuffIcon :icon="pinIcon" alt="固定 CoreBox" @click="handleTogglePin" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.MainBoxHeader {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.25rem;
}

.CoreBox-Configure {
  display: flex;
  padding: 0 0.5rem;
  cursor: pointer;
  font-size: 1.25em;

  .cancel-button {
    color: var(--el-color-danger);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }
}

// Hide input in UI mode but keep layout
:deep(.ui-mode-hidden) {
  opacity: 0 !important;
  pointer-events: none !important;
}
</style>
