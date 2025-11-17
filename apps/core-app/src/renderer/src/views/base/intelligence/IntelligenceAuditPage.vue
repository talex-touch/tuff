<template>
  <div class="flex h-full flex-col" role="main" aria-label="Intelligence Audit & Settings">
    <div class="flex-1 overflow-auto p-6">
      <!-- Global Settings Section -->
      <TuffGroupBlock
        :name="t('aisdk.global.title')"
        :description="t('aisdk.global.description')"
        default-icon="i-carbon-settings-adjust"
        active-icon="i-carbon-settings-adjust"
        memory-name="intelligence-global-settings"
      >
        <IntelligenceGlobalSettings
          v-model="globalConfig"
          @change="handleGlobalChange"
        />
      </TuffGroupBlock>

      <!-- Audit Settings Section -->
      <TuffGroupBlock
        :name="t('aisdk.audit.title')"
        :description="t('aisdk.audit.description')"
        default-icon="i-carbon-event-schedule"
        active-icon="i-carbon-event-schedule"
        memory-name="intelligence-audit-settings"
      >
        <TuffBlockSlot
          :title="t('aisdk.audit.enableTitle')"
          :description="t('aisdk.audit.enableDescription')"
          default-icon="i-carbon-checkmark"
          active-icon="i-carbon-checkmark"
          :active="globalConfig.enableAudit"
        >
          <TSwitch
            v-model="globalConfig.enableAudit"
            @update:model-value="handleGlobalChange"
          />
        </TuffBlockSlot>

        <TuffBlockSlot
          v-if="globalConfig.enableAudit"
          :title="t('aisdk.audit.logsTitle')"
          :description="t('aisdk.audit.logsDescription')"
          default-icon="i-carbon-document-view"
          active-icon="i-carbon-document-view"
        >
          <FlatButton>
            <i class="i-carbon-view" />
            {{ t('aisdk.audit.viewLogs') }}
          </FlatButton>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <!-- Cache Settings Section -->
      <TuffGroupBlock
        :name="t('aisdk.cache.title')"
        :description="t('aisdk.cache.description')"
        default-icon="i-carbon-data-base"
        active-icon="i-carbon-data-base"
        memory-name="intelligence-cache-settings"
      >
        <TuffBlockSlot
          :title="t('aisdk.cache.enableTitle')"
          :description="t('aisdk.cache.enableDescription')"
          default-icon="i-carbon-checkmark"
          active-icon="i-carbon-checkmark"
          :active="globalConfig.enableCache"
        >
          <TSwitch
            v-model="globalConfig.enableCache"
            @update:model-value="handleGlobalChange"
          />
        </TuffBlockSlot>

        <TuffBlockInput
          v-if="globalConfig.enableCache"
          v-model="cacheExpirationInput"
          :title="t('aisdk.cache.expirationTitle')"
          :description="t('aisdk.cache.expirationDescription')"
          default-icon="i-carbon-time"
          active-icon="i-carbon-time"
          @blur="handleCacheExpirationBlur"
        >
          <template #control="{ modelValue, update, focus, blur }">
            <div class="flex items-center gap-2">
              <input
                :value="modelValue"
                type="number"
                min="60"
                max="86400"
                :placeholder="t('aisdk.cache.expirationPlaceholder')"
                class="tuff-input flex-1"
                @input="update(($event.target as HTMLInputElement).value)"
                @focus="focus"
                @blur="blur"
              />
              <span class="text-sm text-[var(--el-text-color-secondary)]">{{ t('aisdk.cache.seconds') }}</span>
            </div>
          </template>
        </TuffBlockInput>
      </TuffGroupBlock>
    </div>
  </div>
</template>

<script lang="ts" name="IntelligenceAuditPage" setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import IntelligenceGlobalSettings from '~/components/intelligence/config/IntelligenceGlobalSettings.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()

const {
  globalConfig,
  updateGlobalConfig
} = useIntelligenceManager()

const cacheExpirationInput = ref(String(globalConfig.value.cacheExpiration || 3600))

function handleGlobalChange() {
  updateGlobalConfig(globalConfig.value)
}

function handleCacheExpirationBlur() {
  const value = parseInt(cacheExpirationInput.value, 10)
  if (!isNaN(value) && value >= 60 && value <= 86400) {
    globalConfig.value.cacheExpiration = value
    handleGlobalChange()
  } else {
    // Reset to current value if invalid
    cacheExpirationInput.value = String(globalConfig.value.cacheExpiration || 3600)
  }
}
</script>

<style lang="scss" scoped>
.tuff-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;

  &:focus {
    border-color: var(--el-color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }
}
</style>