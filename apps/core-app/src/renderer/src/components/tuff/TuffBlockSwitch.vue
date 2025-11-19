<script lang="ts" name="TuffBlockSwitch" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { computed } from 'vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    modelValue: boolean
    defaultIcon?: string | ITuffIcon
    activeIcon?: string | ITuffIcon
    disabled?: boolean
    guidance?: boolean
    loading?: boolean
  }>(),
  {
    disabled: false,
    guidance: false,
    loading: false,
  },
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
  (e: 'click', event: MouseEvent): void
}>()

const value = useModelWrapper(props, emits)
const isActive = computed(() => !!value.value)

function handleChange(val: boolean) {
  emits('change', val)
}

function handleClick(event: MouseEvent) {
  if (props.guidance) {
    emits('click', event)
  }
}
</script>

<template>
  <TuffBlockSlot
    :title="title"
    :description="description"
    :default-icon="defaultIcon"
    :active-icon="activeIcon"
    :active="isActive"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <template #tags>
      <slot name="tags" />
    </template>
    <template v-if="!guidance">
      <div class="flex items-center gap-3">
        <span
          v-if="loading"
          class="i-ri-loader-4-line text-[var(--el-text-color-secondary)] animate-spin"
        />
        <TSwitch v-model="value" :disabled="disabled || loading" @change="handleChange" />
      </div>
    </template>
    <template v-else>
      <i class="i-carbon-chevron-right text-lg text-[var(--el-text-color-secondary)]" />
    </template>
  </TuffBlockSlot>
</template>
