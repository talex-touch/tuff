<script lang="ts" name="HomeSchedulerRow" setup>
import type { FilterChipItem } from '@talex-touch/tuffex/filter-chips'
import type { ConversationWorkspaceMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  coordinatorIdOf,
  findCoordinator,
  isCoordinatorSelected,
  schedulerShortName
} from './scheduler'

/**
 * The scheduler row inside the composer's model menu: who runs the next send (the built-in Tuff Pi
 * coordinator or a scanned CLI profile), one line above the reasoning effort and drawn the same
 * way — label on the left, chips on the right. The model pill on the composer names the scheduler
 * in front of the model, so scheduler and model are one control with one popover.
 *
 * Switching is an execution-authority change, not a prompt: a conversation with history branches
 * (the page decides), and while Main is mid-turn every other scheduler is locked. The gear opens
 * the profile switches in place (enable / disable), saved through the orchestrator's own call.
 */
const props = defineProps<{
  mode: ConversationWorkspaceMode
  profileId?: string
  profiles: AiAgentProfile[]
  profilesLoading: boolean
  profilesError: boolean
  profileSaving: string | null
  /** The conversation has history: a scheduler change continues in a new branch. */
  branchOnChange: boolean
  /** Main is mid-turn: no other scheduler can be taken now. */
  locked: boolean
}>()

const emit = defineEmits<{
  (event: 'select-agent', profileId: string): void
  (event: 'toggle-profile', profile: AiAgentProfile, enabled: boolean): void
  (event: 'load-profiles'): void
}>()

const { t } = useI18n()

const managing = ref(false)

const coordinatorId = computed(() => coordinatorIdOf(props.profiles))
const currentId = computed(() =>
  isCoordinatorSelected(props.mode, props.profileId, props.profiles)
    ? coordinatorId.value
    : (props.profileId ?? coordinatorId.value)
)

const chips = computed<FilterChipItem[]>(() => {
  const coordinator = findCoordinator(props.profiles)
  const items: FilterChipItem[] = [
    {
      value: coordinatorId.value,
      label: coordinator
        ? schedulerShortName(coordinator.name)
        : t('home.workspace.mode.coordinator'),
      iconClass: 'i-ri-robot-2-line',
      disabled: props.locked && currentId.value !== coordinatorId.value
    }
  ]
  for (const profile of props.profiles) {
    if (!profile.enabled || profile.id === coordinatorId.value) continue
    items.push({
      value: profile.id,
      label: schedulerShortName(profile.name),
      iconClass: 'i-ri-terminal-box-line',
      disabled: props.locked && currentId.value !== profile.id
    })
  }
  return items
})

/** The profile the conversation names is gone or switched off: Main will refuse to run it. */
const profileUnavailable = computed(
  () =>
    props.mode === 'agent' &&
    !props.profilesLoading &&
    !props.profilesError &&
    props.profiles.length > 0 &&
    Boolean(props.profileId) &&
    !props.profiles.find((profile) => profile.id === props.profileId)?.enabled
)

/** Skeleton only for the first read: a refresh keeps the chips already on screen. */
const showSkeleton = computed(() => props.profilesLoading && props.profiles.length === 0)

const note = computed(() => {
  if (props.profilesError && props.profiles.length === 0) return ''
  if (profileUnavailable.value) return t('home.workspace.profile.unavailable')
  if (props.branchOnChange) {
    return props.locked
      ? t('home.workspace.mode.branchLocked')
      : t('home.workspace.mode.branchHint')
  }
  return ''
})

function pick(value: string | number): void {
  const id = String(value)
  if (id === currentId.value && props.mode === 'agent') return
  if (props.locked && id !== currentId.value) return
  emit('select-agent', id)
}

function toggleProfile(profile: AiAgentProfile, enabled: boolean): void {
  // One save at a time; the switch being saved stays focusable, so its repeat presses drop here.
  if (props.profileSaving !== null) return
  emit('toggle-profile', profile, enabled)
}

// The menu's panel mounts on every opening: read again, so a profile enabled elsewhere shows up.
onMounted(() => emit('load-profiles'))
</script>

<template>
  <div class="HomeSchedulerRow">
    <div class="HomeSchedulerRow-Line">
      <span class="HomeSchedulerRow-Label" aria-hidden="true">
        {{ t('home.workspace.mode.scheduler') }}
      </span>
      <div class="HomeSchedulerRow-Controls">
        <div v-if="showSkeleton" class="HomeSchedulerRow-Skeleton" aria-hidden="true">
          <TxSkeleton :width="64" :height="22" :radius="11" />
          <TxSkeleton :width="72" :height="22" :radius="11" />
        </div>
        <div
          v-else-if="profilesError && profiles.length === 0"
          class="HomeSchedulerRow-Error"
          role="alert"
        >
          <span>{{ t('home.workspace.profile.loadFailed') }}</span>
          <button class="HomeSchedulerRow-Link" type="button" @click="emit('load-profiles')">
            {{ t('home.workspace.retry') }}
          </button>
        </div>
        <TxFilterChips
          v-else
          class="HomeSchedulerRow-Chips"
          role="toolbar"
          :aria-label="t('home.workspace.mode.scheduler')"
          :items="chips"
          :model-value="currentId"
          @update:model-value="pick"
        />
        <button
          class="HomeSchedulerRow-Gear"
          :class="{ 'is-open': managing }"
          type="button"
          :aria-expanded="managing"
          :aria-label="t('home.workspace.profile.manage')"
          :title="t('home.workspace.profile.manage')"
          @click="managing = !managing"
        >
          <span class="i-ri-settings-3-line" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      v-if="managing"
      class="HomeSchedulerRow-Manage"
      role="group"
      :aria-label="t('home.workspace.profile.manage')"
    >
      <p v-if="profiles.length === 0" class="HomeSchedulerRow-Note">
        {{ t('home.workspace.profile.none') }}
      </p>
      <div
        v-for="profile in profiles"
        :key="profile.id"
        class="HomeSchedulerRow-ManageRow"
        :class="{ 'is-disabled': !profile.enabled }"
      >
        <span class="HomeSchedulerRow-ManageName">{{ profile.name }}</span>
        <TxSwitch
          size="small"
          :model-value="profile.enabled"
          :disabled="profileSaving !== null && profileSaving !== profile.id"
          :aria-busy="profileSaving === profile.id || undefined"
          :aria-label="
            t(
              profile.enabled ? 'home.workspace.profile.disable' : 'home.workspace.profile.enable',
              { name: profile.name }
            )
          "
          @update:model-value="toggleProfile(profile, $event)"
        />
      </div>
    </div>

    <p
      v-if="note"
      class="HomeSchedulerRow-Note"
      :class="{ 'is-danger': profileUnavailable }"
      :role="profileUnavailable ? 'alert' : undefined"
    >
      {{ note }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
/* Mirrors HomeModelMenu's effort row: same line box, label ink and chip tokens. */
.HomeSchedulerRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.HomeSchedulerRow-Line {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.HomeSchedulerRow-Label {
  flex: none;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  white-space: nowrap;
}

.HomeSchedulerRow-Controls {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.HomeSchedulerRow-Chips {
  --tx-bui-ink: var(--shell-text-primary);
  --tx-bui-ink-2: var(--shell-text-muted);
  --tx-bui-surface: var(--shell-surface-2);
  --tx-bui-hover: var(--shell-surface);
  --tx-bui-accent: var(--shell-primary);
  --tx-bui-shadow-btn: none;

  min-width: 0;
}

.HomeSchedulerRow-Skeleton {
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  gap: 4px;
}

.HomeSchedulerRow-Gear {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 14px;
  cursor: pointer;

  &:hover,
  &.is-open {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomeSchedulerRow-Manage {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0 2px;
}

.HomeSchedulerRow-ManageRow {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;

  &.is-disabled .HomeSchedulerRow-ManageName {
    color: var(--shell-text-muted);
  }
}

.HomeSchedulerRow-ManageName {
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSchedulerRow-Error {
  display: flex;
  gap: 8px;
  align-items: baseline;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
}

.HomeSchedulerRow-Link {
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

.HomeSchedulerRow-Note {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.35;

  &.is-danger {
    color: var(--shell-danger);
  }
}
</style>
