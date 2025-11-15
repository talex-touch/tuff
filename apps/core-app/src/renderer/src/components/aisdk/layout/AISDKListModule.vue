<template>
  <div class="mb-12 min-h-16">
    <p class="my-4 flex justify-between items-center text-xs opacity-70">
      <span class="flex items-center gap-2">
        <i :class="icon" class="text-base text-[var(--el-color-primary)]" />
        {{ title }}
      </span>
      <span class="text-[var(--el-text-color-secondary)]">
        {{ providers.length }}
      </span>
    </p>

    <p v-if="providers.length === 0" class="text-center opacity-75 text-sm">
      {{ t('aisdk.list.empty') }}
    </p>

    <transition-group name="list" tag="div">
      <AISDKItem
        v-for="provider in providers"
        :key="provider.id"
        :provider="provider"
        :is-selected="provider.id === modelValue"
        @click="handleSelect(provider.id)"
        @toggle="handleToggle"
      />
    </transition-group>
  </div>
</template>

<script lang="ts" name="AISDKListModule" setup>
import { useI18n } from 'vue-i18n'
import AISDKItem from './AISDKItem.vue'

interface AiProviderConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  rateLimit?: {
    requestsPerMinute?: number
    tokensPerMinute?: number
  }
  priority?: number
}

defineProps<{
  modelValue: string | null
  providers: AiProviderConfig[]
  title: string
  icon: string
}>()

const emits = defineEmits<{
  'update:modelValue': [id: string]
  toggle: [provider: AiProviderConfig]
}>()

const { t } = useI18n()

function handleSelect(id: string) {
  emits('update:modelValue', id)
}

function handleToggle(provider: AiProviderConfig) {
  emits('toggle', provider)
}
</script>

<style lang="scss" scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.list-move {
  transition: transform 0.3s ease;
}
</style>
