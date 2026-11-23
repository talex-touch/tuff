<script lang="ts" name="HomeComposerModeSlot" setup>
import type { ConversationWorkspaceMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { TxButton } from '@talex-touch/tuffex/button'
import { useI18n } from 'vue-i18n'
import HomeWorkspaceModeMenu from './workspace/HomeWorkspaceModeMenu.vue'

/**
 * Leading mode controls injected into `TuffAIComposer`'s `#mode` slot: browser landing's Browse /
 * Ask toggle or Home's Chat / Agent profile menu.
 */
defineProps<{
  browserLanding: boolean
  browserNavigating: boolean
  hasAttachments: boolean
  workspaceMode: ConversationWorkspaceMode
  profileId?: string
  profiles: AiAgentProfile[]
  profilesLoading: boolean
  profileSaving: string | null
  profilesError: boolean
  branchOnChange: boolean
  locked: boolean
}>()

const browserMode = defineModel<'browse' | 'ask'>('browserMode', { required: true })

const emit = defineEmits<{
  (event: 'select-chat'): void
  (event: 'select-agent', profileId: string): void
  (event: 'toggle-profile', profile: AiAgentProfile, enabled: boolean): void
  (event: 'load-profiles'): void
}>()

const { t } = useI18n()
</script>

<template>
  <template v-if="browserLanding">
    <TxButton
      size="sm"
      variant="flat"
      :type="browserMode === 'browse' ? 'primary' : 'text'"
      :aria-pressed="browserMode === 'browse'"
      :disabled="hasAttachments || browserNavigating"
      icon="i-ri-global-line"
      @click="browserMode = 'browse'"
      >{{ t('browser.browse') }}</TxButton
    >
    <TxButton
      size="sm"
      variant="flat"
      :type="browserMode === 'ask' ? 'primary' : 'text'"
      :aria-pressed="browserMode === 'ask'"
      :disabled="browserNavigating"
      icon="i-ri-search-line"
      @click="browserMode = 'ask'"
      >{{ t('browser.ask') }}</TxButton
    >
  </template>
  <HomeWorkspaceModeMenu
    v-if="!browserLanding"
    :mode="workspaceMode"
    :profile-id="profileId"
    :profiles="profiles"
    :profiles-loading="profilesLoading"
    :profile-saving="profileSaving"
    :profiles-error="profilesError"
    :branch-on-change="branchOnChange"
    :locked="locked"
    @select-chat="emit('select-chat')"
    @select-agent="emit('select-agent', $event)"
    @toggle-profile="(profile, enabled) => emit('toggle-profile', profile, enabled)"
    @load-profiles="emit('load-profiles')"
  />
</template>
