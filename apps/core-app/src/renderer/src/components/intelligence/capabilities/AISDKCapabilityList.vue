<template>
  <aside class="AISDKCapabilityList h-full flex flex-col">
    <div class="flex-shrink-0 border-b border-[var(--el-border-color-lighter)] p-3">
      <div class="search-wrapper">
        <label for="capability-search" class="sr-only">{{ t('settings.intelligence.capabilitySearchLabel') }}</label>
        <i class="i-ri-search-line search-icon" aria-hidden="true" />
        <input
          id="capability-search"
          v-model="searchQuery"
          type="search"
          :placeholder="t('settings.intelligence.capabilitySearchPlaceholder')"
          class="search-input"
          autocomplete="off"
        />
        <FlatButton
          v-if="searchQuery"
          class="clear-icon"
          mini
          :aria-label="t('settings.intelligence.capabilitySearchClear')"
          @click="clearSearch"
        >
          <i class="i-ri-close-line" aria-hidden="true" />
        </FlatButton>
      </div>
    </div>

    <div class="flex-1 overflow-hidden">
      <TouchScroll>
        <div class="p-3 pb-24">
          <p
            v-if="filteredCapabilities.length === 0"
            class="py-10 text-center text-sm text-[var(--el-text-color-secondary)]"
            role="status"
          >
            {{ t('settings.intelligence.capabilityListEmpty') }}
          </p>
          <transition-group name="list" tag="div" role="list" aria-live="polite">
            <AISDKCapabilityListItem
              v-for="capability in filteredCapabilities"
              :key="capability.id"
              :capability="capability"
              :is-selected="capability.id === selectedId"
              role="listitem"
              @select="handleSelect"
            />
          </transition-group>
        </div>
      </TouchScroll>
    </div>

    <div class="flex-shrink-0 border-t border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color-page)] p-3">
      <p class="text-xs text-[var(--el-text-color-secondary)]">
        {{ t('settings.intelligence.capabilitySummary', { count: capabilities.length }) }}
      </p>
    </div>
  </aside>
</template>

<script lang="ts" name="AISDKCapabilityList" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import AISDKCapabilityListItem from './AISDKCapabilityListItem.vue'
import type { AISDKCapabilityConfig } from '@talex-touch/utils/types/intelligence'

const props = defineProps<{
  capabilities: AISDKCapabilityConfig[]
  selectedId: string | null
}>()

const emits = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()
const searchQuery = ref('')

const filteredCapabilities = computed(() => {
  if (!searchQuery.value.trim()) return props.capabilities
  const query = searchQuery.value.toLowerCase()
  return props.capabilities.filter(
    (capability) =>
      capability.id.toLowerCase().includes(query) ||
      (capability.label?.toLowerCase().includes(query) ?? false) ||
      (capability.description?.toLowerCase().includes(query) ?? false)
  )
})

function handleSelect(id: string): void {
  emits('select', id)
}

function clearSearch(): void {
  searchQuery.value = ''
}
</script>

<style lang="scss" scoped>
.AISDKCapabilityList {
  background: var(--el-bg-color);
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  padding: 0 12px;
  height: 36px;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: var(--el-fill-color-light);
    border-color: var(--el-border-color);
  }

  &:focus-within {
    background: var(--el-bg-color);
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
  }
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.9rem;
  color: var(--el-text-color-primary);
}

.search-icon {
  color: var(--el-text-color-placeholder);
  margin-right: 8px;
}

.clear-icon {
  margin-left: 8px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.list-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
