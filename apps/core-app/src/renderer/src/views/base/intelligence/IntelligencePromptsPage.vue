<template>
  <div class="aisdk-page h-full flex flex-col" role="main" aria-label="Intelligence Prompt Center">
    <header class="aisdk-hero">
      <div>
        <p class="aisdk-hero__eyebrow">{{ t('flatNavBar.aisdk') }}</p>
        <h1>{{ t('settings.aisdk.promptPageTitle') }}</h1>
        <p class="aisdk-hero__desc">
          {{ t('settings.aisdk.promptPageDesc') }}
        </p>
      </div>
      <div class="aisdk-hero__actions">
        <button class="aisdk-btn ghost" type="button" @click="openDocs">
          <i class="i-carbon-link" aria-hidden="true" />
          <span>{{ t('settings.aisdk.docsButton') }}</span>
        </button>
      </div>
    </header>

    <div class="aisdk-body flex-1 flex flex-col gap-4 overflow-auto">
      <div
        v-for="capability in capabilityList"
        :key="capability.id"
        class="capability-card"
      >
        <header class="capability-card__header">
          <div>
            <h3>{{ capability.label || capability.id }}</h3>
            <p>{{ capability.description }}</p>
          </div>
        </header>
        <div class="capability-card__section">
          <p class="section-title">{{ t('settings.aisdk.promptEditorLabel') }}</p>
          <textarea
            class="aisdk-textarea"
            rows="4"
            :value="capability.promptTemplate || ''"
            :placeholder="t('settings.aisdk.promptEditorPlaceholder')"
            @change="handlePromptChange(capability.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>

      <div class="capability-card">
        <header class="capability-card__header">
          <div>
            <h3>{{ t('settings.aisdk.futureCenterTitle') }}</h3>
            <p>{{ t('settings.aisdk.futureCenterDesc') }}</p>
          </div>
        </header>
        <div class="capability-card__section">
          <ul class="text-sm text-[var(--el-text-color-secondary)] list-disc pl-4">
            <li>{{ t('settings.aisdk.futureCloudSync') }}</li>
            <li>{{ t('settings.aisdk.futureTargetShare') }}</li>
            <li>{{ t('settings.aisdk.futureDownload') }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" name="IntelligencePromptsPage" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AISDKCapabilityConfig } from '~/types/aisdk'
import { useAISDKManagement } from '~/modules/hooks/useAISDKManagement'

const { t } = useI18n()
const { capabilities, updateCapability } = useAISDKManagement()

const capabilityList = computed<AISDKCapabilityConfig[]>(() =>
  Object.values(capabilities.value || {}).sort((a, b) => a.id.localeCompare(b.id))
)

function handlePromptChange(capabilityId: string, prompt: string): void {
  updateCapability(capabilityId, { promptTemplate: prompt })
}

function openDocs(): void {
  window.open('https://github.com/talex-touch/talex-touch', '_blank', 'noopener')
}
</script>

<style lang="scss" scoped>
@import './intelligence-shared.scss';
</style>
