<template>
  <section class="IntelligenceListModule" :aria-labelledby="`${sectionId}-heading`">
    <h2
      :id="`${sectionId}-heading`"
      class="my-2 flex justify-between items-center text-xs opacity-70"
    >
      <span class="flex items-center gap-2">
        <i :class="icon" class="text-base text-[var(--el-color-primary)]" aria-hidden="true" />
        {{ title }}
      </span>
      <span
        class="text-[var(--el-text-color-secondary)]"
        :aria-label="`${providers.length} ${t('intelligence.list.providersCount')}`"
      >
        {{ providers.length }}
      </span>
    </h2>

    <p v-if="providers.length === 0" class="text-center opacity-75 text-sm" role="status">
      {{ t('intelligence.list.empty') }}
    </p>

    <transition-group name="list" tag="div" role="list" :aria-label="title">
      <IntelligenceItem
        v-for="provider in providers"
        :key="provider.id"
        :provider="provider"
        :is-selected="provider.id === modelValue"
        role="listitem"
        @click="handleSelect(provider.id)"
      />
    </transition-group>
  </section>
</template>

<script lang="ts" name="IntelligenceListModule" setup>
import { useI18n } from 'vue-i18n'
import IntelligenceItem from './IntelligenceItem.vue'

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
  sectionId: string
}>()

const emits = defineEmits<{
  'update:modelValue': [id: string]
}>()

const { t } = useI18n()

function handleSelect(id: string) {
  emits('update:modelValue', id)
}
</script>

<style lang="scss" scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-20px) scale(0.95);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.95);
}

.list-move {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-leave-active {
  position: absolute;
  width: calc(100% - 1rem);
}

// Stagger animation for initial load
:deep(.aisdk-item) {
  animation: fadeInSlide 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: both;

  @for $i from 1 through 20 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 0.05}s;
    }
  }
}

@keyframes fadeInSlide {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
