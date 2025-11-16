<template>
  <div class="aisdk-global-settings">
    <!-- Enable Audit Logging -->
    <TuffBlockSwitch
      v-model="localEnableAudit"
      :title="t('aisdk.global.auditLogging')"
      :description="t('aisdk.global.auditLoggingHint')"
      default-icon="i-carbon-document-tasks"
      active-icon="i-carbon-document-tasks"
      @update:model-value="handleAuditChange"
    />

    <!-- Enable Caching -->
    <TuffBlockSwitch
      v-model="localEnableCache"
      :title="t('aisdk.global.caching')"
      :description="t('aisdk.global.cachingHint')"
      default-icon="i-carbon-data-base"
      active-icon="i-carbon-data-base"
      @update:model-value="handleCacheChange"
    />

    <!-- Cache Expiration (conditional on caching enabled) -->
    <Transition name="fade">
      <TuffBlockSelect
        v-if="localEnableCache"
        v-model="localCacheExpiration"
        :title="t('aisdk.global.cacheExpiration')"
        :description="t('aisdk.global.cacheExpirationHint')"
        default-icon="i-carbon-time"
        active-icon="i-carbon-time"
        @update:model-value="handleCacheExpirationChange"
      >
        <TSelectItem :model-value="300">
          <div class="flex items-center gap-2">
            <i class="i-carbon-time" />
            <span>{{ t('aisdk.global.cacheExpiration5min') }}</span>
          </div>
        </TSelectItem>
        <TSelectItem :model-value="900">
          <div class="flex items-center gap-2">
            <i class="i-carbon-time" />
            <span>{{ t('aisdk.global.cacheExpiration15min') }}</span>
          </div>
        </TSelectItem>
        <TSelectItem :model-value="3600">
          <div class="flex items-center gap-2">
            <i class="i-carbon-time" />
            <span>{{ t('aisdk.global.cacheExpiration1hour') }}</span>
          </div>
        </TSelectItem>
        <TSelectItem :model-value="21600">
          <div class="flex items-center gap-2">
            <i class="i-carbon-time" />
            <span>{{ t('aisdk.global.cacheExpiration6hours') }}</span>
          </div>
        </TSelectItem>
        <TSelectItem :model-value="86400">
          <div class="flex items-center gap-2">
            <i class="i-carbon-time" />
            <span>{{ t('aisdk.global.cacheExpiration24hours') }}</span>
          </div>
        </TSelectItem>
      </TuffBlockSelect>
    </Transition>
  </div>
</template>

<script lang="ts" name="IntelligenceGlobalSettings" setup>
import { ref, watch, getCurrentInstance } from 'vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import type { AISDKGlobalConfig } from '~/types/aisdk'

const props = defineProps<{
  modelValue: AISDKGlobalConfig
}>()

const emits = defineEmits<{
  'update:modelValue': [value: AISDKGlobalConfig]
  change: []
}>()

const instance = getCurrentInstance()
const t = (key: string) => instance?.proxy?.$t(key) || key

const localEnableAudit = ref(props.modelValue.enableAudit)
const localEnableCache = ref(props.modelValue.enableCache)
const localCacheExpiration = ref(props.modelValue.cacheExpiration || 3600)

// Watch for external changes
watch(
  () => props.modelValue.enableAudit,
  (newValue) => {
    localEnableAudit.value = newValue
  }
)

watch(
  () => props.modelValue.enableCache,
  (newValue) => {
    localEnableCache.value = newValue
  }
)

watch(
  () => props.modelValue.cacheExpiration,
  (newValue) => {
    localCacheExpiration.value = newValue || 3600
  }
)

function handleAuditChange() {
  const updated: AISDKGlobalConfig = {
    ...props.modelValue,
    enableAudit: localEnableAudit.value
  }
  emits('update:modelValue', updated)
  emits('change')
}

function handleCacheChange() {
  const updated: AISDKGlobalConfig = {
    ...props.modelValue,
    enableCache: localEnableCache.value
  }
  
  // If disabling cache, remove cacheExpiration
  if (!localEnableCache.value) {
    delete updated.cacheExpiration
  } else {
    // If enabling cache, set default expiration if not set
    updated.cacheExpiration = localCacheExpiration.value
  }
  
  emits('update:modelValue', updated)
  emits('change')
}

function handleCacheExpirationChange() {
  const updated: AISDKGlobalConfig = {
    ...props.modelValue,
    cacheExpiration: localCacheExpiration.value
  }
  emits('update:modelValue', updated)
  emits('change')
}
</script>

<style lang="scss" scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
