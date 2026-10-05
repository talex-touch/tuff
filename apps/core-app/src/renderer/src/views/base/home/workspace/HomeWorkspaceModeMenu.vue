<script lang="ts" name="HomeWorkspaceModeMenu" setup>
import type { ConversationWorkspaceMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposerChip from '../composer/ComposerChip.vue'

/**
 * The composer's execution-mode chip and the menu behind it: Chat or Agent, and in Agent which of
 * the orchestrator's own profiles runs the work.
 *
 * Every profile row is a real `AiAgentProfile` from Main — nothing is offered that the orchestrator
 * would refuse. A disabled profile is listed, not selectable, with the switch that enables it through
 * the orchestrator's existing save; with none enabled the menu says so rather than inventing one.
 *
 * Mode is an execution authority, not a prompt: a conversation that already has history switches by
 * branching into a new conversation (Main's fork), which the row states before it is pressed.
 */
const props = defineProps<{
  mode: ConversationWorkspaceMode
  profileId?: string
  profiles: AiAgentProfile[]
  profilesLoading: boolean
  profilesError: boolean
  profileSaving: string | null
  /** The conversation has history: a mode change continues in a new branch. */
  branchOnChange: boolean
  /** Main is mid-turn: neither a branch nor a profile change can be taken now. */
  locked: boolean
}>()

const emit = defineEmits<{
  (event: 'select-mode', mode: ConversationWorkspaceMode): void
  (event: 'select-profile', profileId: string): void
  (event: 'toggle-profile', profile: AiAgentProfile, enabled: boolean): void
  (event: 'load-profiles'): void
}>()

const { t } = useI18n()

const MODES = [
  { mode: 'chat', icon: 'i-ri-chat-3-line' },
  { mode: 'agent', icon: 'i-ri-robot-2-line' }
] as const

const open = ref(false)
const triggerWrapRef = ref<HTMLElement | null>(null)
let restoreFocusOnClose = false

const selectedProfile = computed(() =>
  props.profiles.find((profile) => profile.id === props.profileId)
)
const enabledCount = computed(() => props.profiles.filter((profile) => profile.enabled).length)

/** The profile the conversation names is gone or switched off: Main will refuse to run it. */
const profileUnavailable = computed(
  () =>
    props.mode === 'agent' &&
    !props.profilesLoading &&
    !props.profilesError &&
    props.profiles.length > 0 &&
    Boolean(props.profileId) &&
    !selectedProfile.value?.enabled
)

/** Skeleton only for the first read: a refresh keeps the rows already on screen. */
const showSkeleton = computed(() => props.profilesLoading && props.profiles.length === 0)

const chipLabel = computed(() => {
  if (props.mode === 'chat') return t('home.workspace.mode.chat')
  const name = selectedProfile.value?.name
  return name ? `${t('home.workspace.mode.agent')} · ${name}` : t('home.workspace.mode.agent')
})

const chipTone = computed(() =>
  props.mode === 'agent' ? (profileUnavailable.value ? 'danger' : 'info') : 'muted'
)

function chooseMode(mode: ConversationWorkspaceMode): void {
  if (mode === props.mode) return
  if (props.branchOnChange && props.locked) return
  emit('select-mode', mode)
  restoreFocusOnClose = true
  open.value = false
}

function chooseProfile(profile: AiAgentProfile): void {
  if (!profile.enabled || props.locked) return
  emit('select-profile', profile.id)
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') restoreFocusOnClose = true
}

watch(open, (isOpen) => {
  if (isOpen) {
    restoreFocusOnClose = false
    // Read again on every open: a profile enabled elsewhere must not need a restart to appear.
    emit('load-profiles')
    return
  }
  if (restoreFocusOnClose) {
    void nextTick(() => triggerWrapRef.value?.querySelector('button')?.focus())
  }
})
</script>

<template>
  <TxDropdownMenu
    v-model="open"
    placement="top-start"
    :min-width="320"
    :max-height="420"
    :panel-radius="12"
    :panel-padding="6"
    panel-background="pure"
  >
    <template #trigger>
      <span ref="triggerWrapRef" class="HomeWorkspaceModeMenu-TriggerWrap">
        <ComposerChip
          :tone="chipTone"
          :icon="mode === 'agent' ? 'i-ri-robot-2-line' : 'i-ri-chat-3-line'"
          :label="chipLabel"
          collapsible
          :aria-expanded="open"
          :aria-label="`${t('home.workspace.mode.menu')} · ${chipLabel}`"
          :title="t(`home.workspace.mode.${mode}Desc`)"
        />
      </span>
    </template>

    <div class="HomeWorkspaceModeMenu" @keydown="onPanelKeydown">
      <div
        class="HomeWorkspaceModeMenu-Group"
        role="group"
        :aria-label="t('home.workspace.mode.menu')"
      >
        <button
          v-for="option in MODES"
          :key="option.mode"
          class="HomeWorkspaceModeMenu-Option"
          type="button"
          role="menuitemradio"
          :aria-checked="mode === option.mode"
          :aria-disabled="(branchOnChange && locked && mode !== option.mode) || undefined"
          @click="chooseMode(option.mode)"
        >
          <span :class="option.icon" class="HomeWorkspaceModeMenu-Icon" />
          <span class="HomeWorkspaceModeMenu-Label">
            <span>{{ t(`home.workspace.mode.${option.mode}`) }}</span>
            <span class="HomeWorkspaceModeMenu-Hint">
              {{ t(`home.workspace.mode.${option.mode}Desc`) }}
            </span>
          </span>
          <span v-if="mode === option.mode" class="i-ri-check-line HomeWorkspaceModeMenu-Check" />
        </button>
        <p v-if="branchOnChange" class="HomeWorkspaceModeMenu-Note">
          <span class="i-ri-git-branch-line" aria-hidden="true" />
          <span>{{
            locked ? t('home.workspace.mode.branchLocked') : t('home.workspace.mode.branchHint')
          }}</span>
        </p>
      </div>

      <template v-if="mode === 'agent'">
        <div class="HomeWorkspaceModeMenu-Divider" />
        <div
          class="HomeWorkspaceModeMenu-Group"
          role="group"
          :aria-label="t('home.workspace.profile.label')"
          :aria-busy="profilesLoading || undefined"
        >
          <p class="HomeWorkspaceModeMenu-Heading">{{ t('home.workspace.profile.label') }}</p>

          <div v-if="showSkeleton" class="HomeWorkspaceModeMenu-Skeleton" aria-hidden="true">
            <div v-for="row in 2" :key="row" class="HomeWorkspaceModeMenu-SkeletonRow">
              <TxSkeleton class="HomeWorkspaceModeMenu-SkeletonBar" :height="10" :radius="5" />
              <TxSkeleton
                class="HomeWorkspaceModeMenu-SkeletonBar is-short"
                :height="8"
                :radius="4"
              />
            </div>
          </div>

          <div
            v-else-if="profilesError && profiles.length === 0"
            class="HomeWorkspaceModeMenu-State"
            role="alert"
          >
            <span>{{ t('home.workspace.profile.loadFailed') }}</span>
            <button class="HomeWorkspaceModeMenu-Link" type="button" @click="emit('load-profiles')">
              {{ t('home.workspace.retry') }}
            </button>
          </div>

          <template v-else>
            <p v-if="profiles.length === 0" class="HomeWorkspaceModeMenu-State">
              {{ t('home.workspace.profile.none') }}
            </p>
            <p v-else-if="enabledCount === 0" class="HomeWorkspaceModeMenu-State">
              {{ t('home.workspace.profile.noneEnabled') }}
            </p>
            <p v-if="profileUnavailable" class="HomeWorkspaceModeMenu-State is-danger" role="alert">
              {{ t('home.workspace.profile.unavailable') }}
            </p>

            <div
              v-for="profile in profiles"
              :key="profile.id"
              class="HomeWorkspaceModeMenu-ProfileRow"
              :class="{ 'is-disabled': !profile.enabled }"
            >
              <button
                class="HomeWorkspaceModeMenu-Profile"
                type="button"
                role="menuitemradio"
                :aria-checked="profile.id === profileId"
                :aria-disabled="!profile.enabled || locked || undefined"
                @click="chooseProfile(profile)"
              >
                <span class="HomeWorkspaceModeMenu-Label">
                  <span class="HomeWorkspaceModeMenu-ProfileName">{{ profile.name }}</span>
                  <span class="HomeWorkspaceModeMenu-Hint">
                    {{
                      t('home.workspace.profile.summary', {
                        runtime: profile.runtimeProvider,
                        tools: profile.allowedToolIds.length,
                        approval: t(
                          `home.workspace.profile.approval.${profile.permissionPolicy.mode}`
                        )
                      })
                    }}
                  </span>
                </span>
                <span
                  v-if="profile.id === profileId"
                  class="i-ri-check-line HomeWorkspaceModeMenu-Check"
                />
              </button>
              <TxSwitch
                class="HomeWorkspaceModeMenu-Switch"
                size="small"
                :model-value="profile.enabled"
                :disabled="profileSaving !== null"
                :aria-label="
                  t(
                    profile.enabled
                      ? 'home.workspace.profile.disable'
                      : 'home.workspace.profile.enable',
                    {
                      name: profile.name
                    }
                  )
                "
                @update:model-value="emit('toggle-profile', profile, $event)"
              />
            </div>
          </template>
        </div>
      </template>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomeWorkspaceModeMenu-TriggerWrap {
  display: contents;
}

.HomeWorkspaceModeMenu {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeWorkspaceModeMenu-Group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeWorkspaceModeMenu-Heading {
  margin: 4px 9px 2px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
}

.HomeWorkspaceModeMenu-Option,
.HomeWorkspaceModeMenu-Profile {
  display: flex;
  flex: 1;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
  padding: 8px 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  &:hover:not([aria-disabled='true']) {
    background: var(--shell-surface);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }
}

.HomeWorkspaceModeMenu-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-secondary);
}

.HomeWorkspaceModeMenu-Label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.HomeWorkspaceModeMenu-ProfileName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeWorkspaceModeMenu-Hint {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;
}

.HomeWorkspaceModeMenu-Check {
  flex: none;
  margin-top: 2px;
  color: var(--shell-primary);
}

.HomeWorkspaceModeMenu-Note {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin: 2px 9px 4px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;

  span:first-child {
    flex: none;
    margin-top: 2px;
  }
}

.HomeWorkspaceModeMenu-Divider {
  margin: 4px 2px;
  border-top: 1px solid var(--shell-border);
}

.HomeWorkspaceModeMenu-ProfileRow {
  display: flex;
  gap: 4px;
  align-items: center;
  padding-right: 6px;

  &.is-disabled .HomeWorkspaceModeMenu-ProfileName {
    color: var(--shell-text-muted);
  }
}

.HomeWorkspaceModeMenu-Switch {
  flex: none;
}

.HomeWorkspaceModeMenu-State {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  margin: 2px 9px 6px;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;

  &.is-danger {
    color: var(--shell-danger);
  }
}

.HomeWorkspaceModeMenu-Link {
  flex: none;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-primary);
  font: inherit;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

/* Two profile rows: a name line and a summary line, in the rows' own padding and line boxes. */
.HomeWorkspaceModeMenu-Skeleton {
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeWorkspaceModeMenu-SkeletonRow {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 9px;
  font-size: var(--shell-fs-body);
}

.HomeWorkspaceModeMenu-SkeletonBar {
  justify-content: center;
  width: 46%;
  height: 1lh;

  &.is-short {
    width: 72%;
    height: calc(var(--shell-fs-caption) * 1.45);
  }
}
</style>
