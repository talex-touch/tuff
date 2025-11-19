<script lang="ts" name="IntelligenceAuditPage" setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import IntelligenceGlobalSettings from '~/components/intelligence/config/IntelligenceGlobalSettings.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()

const {
  globalConfig,
  updateGlobalConfig,
} = useIntelligenceManager()

const cacheExpirationInput = ref(String(globalConfig.value.cacheExpiration || 3600))

function handleGlobalChange() {
  updateGlobalConfig(globalConfig.value)
}

function handleCacheExpirationBlur() {
  const value = Number.parseInt(cacheExpirationInput.value, 10)
  if (!isNaN(value) && value >= 60 && value <= 86400) {
    globalConfig.value.cacheExpiration = value
    handleGlobalChange()
  }
  else {
    // Reset to current value if invalid
    cacheExpirationInput.value = String(globalConfig.value.cacheExpiration || 3600)
  }
}
</script>

<template>
  <div class="flex h-full flex-col" role="main" aria-label="Intelligence Audit & Settings">
    <div class="flex-1 overflow-auto p-6">
      <!-- Global Settings Section -->
      <TuffGroupBlock
        :name="t('intelligence.global.title')"
        :description="t('intelligence.global.description')"
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
        :name="t('intelligence.audit.title')"
        :description="t('intelligence.audit.description')"
        default-icon="i-carbon-event-schedule"
        active-icon="i-carbon-event-schedule"
        memory-name="intelligence-audit-settings"
      >
        <TuffBlockSlot
          :title="t('intelligence.audit.enableTitle')"
          :description="t('intelligence.audit.enableDescription')"
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
          :title="t('intelligence.audit.logsTitle')"
          :description="t('intelligence.audit.logsDescription')"
          default-icon="i-carbon-document-view"
          active-icon="i-carbon-document-view"
        >
          <FlatButton>
            <i class="i-carbon-view" />
            {{ t('intelligence.audit.viewLogs') }}
          </FlatButton>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <!-- Cache Settings Section -->
      <TuffGroupBlock
        :name="t('intelligence.cache.title')"
        :description="t('intelligence.cache.description')"
        default-icon="i-carbon-data-base"
        active-icon="i-carbon-data-base"
        memory-name="intelligence-cache-settings"
      >
        <TuffBlockSlot
          :title="t('intelligence.cache.enableTitle')"
          :description="t('intelligence.cache.enableDescription')"
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
          :title="t('intelligence.cache.expirationTitle')"
          :description="t('intelligence.cache.expirationDescription')"
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
                :placeholder="t('intelligence.cache.expirationPlaceholder')"
                class="tuff-input flex-1"
                @input="update(($event.target as HTMLInputElement).value)"
                @focus="focus"
                @blur="blur"
              >
              <span class="text-sm text-[var(--el-text-color-secondary)]">{{ t('intelligence.cache.seconds') }}</span>
            </div>
          </template>
        </TuffBlockInput>
      </TuffGroupBlock>
    </div>
  </div>
</template>

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
