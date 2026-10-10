<script lang="ts" name="HomeWorkspaceModeMenu" setup>
import type { ConversationWorkspaceMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import type { JellyIndicatorFrame } from '@talex-touch/tuffex/utils'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { GLIDE, stepSpring, useIndicatorBox, useJellyIndicator } from '@talex-touch/tuffex/utils'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposerChip from '../composer/ComposerChip.vue'
import { useEscapeReturnsFocus } from '../escape-returns-focus'
import { focusWhenShown } from '../focus-when-shown'

/**
 * The composer's mode chip and the menu behind it (`home-composer` › 对话与智能体弹层).
 *
 * The first view is one flat list: 「对话」 and every enabled Agent profile, by name only. Picking a
 * profile is picking Agent mode with that profile; the page decides whether that is a setting or a
 * branch. Enabling and disabling profiles — the orchestrator's own records, saved through its
 * existing call — lives one level down in 「管理智能体」, so the list someone picks from carries no
 * switches and no summaries.
 *
 * Mode is an execution authority, not a prompt: a conversation that already has history switches by
 * branching into a new conversation (Main's fork), which the menu states before anything is pressed.
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
  (event: 'select-chat'): void
  /** Agent mode with this profile; the page turns it into a setting or a branch. */
  (event: 'select-agent', profileId: string): void
  (event: 'toggle-profile', profile: AiAgentProfile, enabled: boolean): void
  (event: 'load-profiles'): void
}>()

const { t } = useI18n()

const open = ref(false)
const view = ref<'main' | 'manage'>('main')
const triggerWrapRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const retryRef = ref<HTMLButtonElement | null>(null)
let restoreFocusOnClose = false

const selectedProfile = computed(() =>
  props.profiles.find((profile) => profile.id === props.profileId)
)
const enabledProfiles = computed(() => props.profiles.filter((profile) => profile.enabled))

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
  return selectedProfile.value?.name ?? t('home.workspace.mode.agent')
})

const chipIcon = computed(() => (props.mode === 'agent' ? 'i-ri-robot-2-line' : 'i-ri-chat-3-line'))

/** A pick that changes the execution authority waits while Main is mid-turn on a thread. */
function isBlocked(target: { mode: ConversationWorkspaceMode; profileId?: string }): boolean {
  if (!props.locked) return false
  if (target.mode !== props.mode) return true
  return target.mode === 'agent' && target.profileId !== props.profileId
}

function close(): void {
  restoreFocusOnClose = true
  open.value = false
}

function chooseChat(): void {
  if (isBlocked({ mode: 'chat' })) return
  if (props.mode !== 'chat') emit('select-chat')
  close()
}

function chooseProfile(profile: AiAgentProfile): void {
  if (!profile.enabled || isBlocked({ mode: 'agent', profileId: profile.id })) return
  if (props.mode !== 'agent' || props.profileId !== profile.id) emit('select-agent', profile.id)
  close()
}

function showView(next: 'main' | 'manage'): void {
  view.value = next
  // The rows under the plate are a different list now: it lands on the new one, not travels there.
  landPlateNext = true
  plate.stop()
  // The view swaps under the pointer; hand focus to it for the keyboard — back on the main list, to
  // the current choice as on opening, so the plate that lands there is not then pulled to row one.
  void nextTick(() =>
    (next === 'main'
      ? currentRow()
      : panelRef.value?.querySelector<HTMLElement>('button:not([aria-disabled="true"])')
    )?.focus()
  )
}

/**
 * One save at a time. The switch being saved stays enabled — disabling the focused control drops
 * focus to the page in the middle of a keyboard pass — so its repeat presses are dropped here.
 */
function toggleProfile(profile: AiAgentProfile, enabled: boolean): void {
  if (props.profileSaving !== null) return
  emit('toggle-profile', profile, enabled)
}

/** The current choice, or the first row that takes a pick: where focus starts, and where it lands. */
function currentRow(): HTMLElement | null | undefined {
  return (
    panelRef.value?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
    panelRef.value?.querySelector<HTMLElement>('button:not([aria-disabled="true"])')
  )
}

/**
 * One travelling highlight for the rows (2026-10-08: switching back and forth had no motion). It
 * follows the pointer or keyboard focus, whichever moved last, and otherwise rests on the current
 * choice — TxSidebarNav's plate, measured by `useIndicatorBox` and moved by the library's indicator
 * engine on the glide material. Rows keep their ink and their check; the fill is this one plate. A
 * locked row (`aria-disabled`) never draws it, and under reduced motion it lands without travelling.
 */
const PLATE_ROW = '[data-plate-key]'

const plateRef = ref<HTMLElement | null>(null)
const pointerKey = ref<string | null>(null)
const focusKey = ref<string | null>(null)
const lastIntent = ref<'pointer' | 'focus'>('focus')
/** The plate has painted once: from then on it is the rows' only fill, and it may fade. */
const plateLive = ref(false)
const plateFades = ref(false)
/** The next move lands in place: on opening, and on a view swap, there is nothing to travel from. */
let landPlateNext = true

/** The current choice's row; the manage view has none. */
const currentPlateKey = computed(() => {
  if (view.value !== 'main') return null
  if (props.mode === 'chat') return 'chat'
  return props.profileId ? `profile:${props.profileId}` : null
})

function plateRow(key: string | null): HTMLElement | null {
  if (!key || !panelRef.value) return null
  for (const row of panelRef.value.querySelectorAll<HTMLElement>(PLATE_ROW)) {
    if (row.dataset.plateKey !== key) continue
    return row.getAttribute('aria-disabled') === 'true' ? null : row
  }
  return null
}

/**
 * Pointer or focus, whichever moved last, then the other, then the current choice. A function, not
 * a computed: the rows are queried each time, so a measurement from the ResizeObserver finds rows
 * that arrived after the last change here. The slot renders under the dropdown's own effect, so the
 * profiles are read here too, to measure again when the list changes.
 */
function plateTarget(): { key: string; row: HTMLElement } | null {
  const pointer = pointerKey.value
  const focus = focusKey.value
  const current = currentPlateKey.value
  void enabledProfiles.value
  void showSkeleton.value
  const order =
    lastIntent.value === 'pointer' ? [pointer, focus, current] : [focus, pointer, current]
  for (const key of order) {
    const row = plateRow(key)
    if (key && row) return { key, row }
  }
  return null
}

const { box: plateBox } = useIndicatorBox({
  container: panelRef,
  target: () => plateTarget()?.row
})

let lastPlateFrame: JellyIndicatorFrame | null = null

// The engine writes the plate's transform, size and opacity every frame; the template binds none of
// them (one writer per property), so a trip does not re-render the menu.
function writePlate(el: HTMLElement, frame: JellyIndicatorFrame): void {
  el.style.opacity = frame.visible ? '1' : '0'
  el.style.width = `${frame.rect.width}px`
  el.style.height = `${frame.rect.height}px`
  el.style.transform = `translate3d(${frame.rect.x}px, ${frame.rect.y}px, 0)`
}

function revealPlate(): void {
  plateLive.value = true
  // Two frames: the first paints the plate in place with no fade to run.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      plateFades.value = true
    })
  )
}

const plate = useJellyIndicator({
  axis: 'y',
  material: 'glide',
  integrate: stepSpring,
  // TxSidebarNav's pace: the glide springs at their reference speed, with a lighter lag than the
  // tabs because hover tracking wants the plate to keep up.
  glide: { ...GLIDE, lag: 0.3 },
  bounds: () => {
    const panel = panelRef.value
    return panel && panel.scrollHeight > 0 ? { start: 0, end: panel.scrollHeight } : null
  },
  onFrame(frame) {
    lastPlateFrame = frame
    if (plateRef.value) writePlate(plateRef.value, frame)
    if (frame.visible && !plateLive.value) revealPlate()
  }
})

// The panel's content unmounts after each close; a new plate starts from the last frame, which a
// close leaves hidden, rather than from its stylesheet's top-left corner.
watch(
  plateRef,
  (el) => {
    if (!el) return
    if (lastPlateFrame) writePlate(el, lastPlateFrame)
    else el.style.opacity = '0'
  },
  { flush: 'sync' }
)

// Only a new row travels: the pointer or focus reaching another one, or the plate going home when
// they leave. A re-measure of the same row — a resize, a profile list arriving — lands in place.
let landedPlateKey: string | null | undefined

watch(
  plateBox,
  (box) => {
    const key = plateTarget()?.key ?? null
    const animate = !landPlateNext && key !== landedPlateKey
    landedPlateKey = key
    if (box) landPlateNext = false
    plate.moveTo(box ? { x: box.left, y: box.top, width: box.width, height: box.height } : null, {
      animate
    })
  },
  { flush: 'post' }
)

/**
 * Delegated: the rows come from three templates. A locked row lets go of the plate, as does a
 * manage row (its switch is the control, not the row); the gap between rows, the divider and the
 * notes leave it where it is.
 */
function onPlatePointer(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const row = target?.closest<HTMLElement>(PLATE_ROW)
  if (row && panelRef.value?.contains(row)) {
    pointerKey.value =
      row.getAttribute('aria-disabled') === 'true' ? null : (row.dataset.plateKey ?? null)
    lastIntent.value = 'pointer'
    return
  }
  if (target?.closest('.HomeWorkspaceModeMenu-ManageRow')) pointerKey.value = null
}

function onPlateLeave(): void {
  pointerKey.value = null
}

function onPlateFocusIn(event: FocusEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const row = target?.closest<HTMLElement>(PLATE_ROW)
  focusKey.value =
    row && row.getAttribute('aria-disabled') !== 'true' ? (row.dataset.plateKey ?? null) : null
  lastIntent.value = 'focus'
}

function onPlateFocusOut(event: FocusEvent): void {
  // Focus moving on to another row: its focusin takes over, so there is no retarget home between.
  const next = event.relatedTarget instanceof Element ? event.relatedTarget : null
  if (next?.closest(PLATE_ROW) && panelRef.value?.contains(next)) return
  focusKey.value = null
}

// A press on a locked row lands on the group behind it (`[aria-disabled]` takes no pointer), which
// takes focus: Escape still returns it to the chip.
useEscapeReturnsFocus(
  open,
  () => [panelRef.value, triggerWrapRef.value],
  () => {
    restoreFocusOnClose = true
  }
)

/**
 * The retry key leaves with the error it answers. If it held focus, focus moves to the current row
 * once the profiles are in, instead of falling to the page out of reach of the arrows.
 */
watch(
  () => props.profilesError && props.profiles.length === 0,
  (failed, wasFailed) => {
    if (!wasFailed || failed || !retryRef.value || document.activeElement !== retryRef.value) return
    void nextTick(() => currentRow()?.focus())
  }
)

watch(open, (isOpen) => {
  if (isOpen) {
    restoreFocusOnClose = false
    view.value = 'main'
    // A fresh opening: nothing hovered or focused yet, so the plate lands on the current choice.
    pointerKey.value = null
    focusKey.value = null
    lastIntent.value = 'focus'
    landPlateNext = true
    plate.stop()
    // Read again on every open: a profile enabled elsewhere must not need a restart to appear.
    emit('load-profiles')
    // On the current choice, so the arrows start from it.
    focusWhenShown(currentRow, () => open.value)
    return
  }
  if (restoreFocusOnClose) {
    void nextTick(() => triggerWrapRef.value?.querySelector('button')?.focus())
  }
})
</script>

<template>
  <!-- The dropdown pins its width to the larger of the chip and `min-width` instead of fitting its
       content, so this is the panel's width for both views: room for a 「管理智能体」 row (name,
       one-line summary, switch), and no jump when the view swaps. -->
  <TxDropdownMenu
    v-model="open"
    placement="top-start"
    initial-focus="none"
    :min-width="272"
    :max-height="420"
    :panel-radius="12"
    :panel-padding="6"
    panel-background="pure"
  >
    <template #trigger>
      <span ref="triggerWrapRef" class="HomeWorkspaceModeMenu-TriggerWrap">
        <ComposerChip
          :danger="profileUnavailable"
          :icon="chipIcon"
          :label="chipLabel"
          :open="open"
          collapsible
          aria-haspopup="menu"
          :aria-expanded="open"
          :aria-label="`${t('home.workspace.mode.menu')} · ${chipLabel}`"
          :title="
            profileUnavailable
              ? t('home.workspace.profile.unavailable')
              : t(`home.workspace.mode.${mode}Desc`)
          "
        />
      </span>
    </template>

    <div
      ref="panelRef"
      class="HomeWorkspaceModeMenu"
      :class="{ 'has-plate': plateLive }"
      @mouseover="onPlatePointer"
      @mouseleave="onPlateLeave"
      @focusin="onPlateFocusIn"
      @focusout="onPlateFocusOut"
    >
      <span
        ref="plateRef"
        class="HomeWorkspaceModeMenu-Plate"
        :class="{ 'is-fading': plateFades }"
        aria-hidden="true"
      />
      <template v-if="view === 'main'">
        <div
          class="HomeWorkspaceModeMenu-Group"
          role="group"
          :aria-label="t('home.workspace.mode.menu')"
          :aria-busy="profilesLoading || undefined"
        >
          <button
            class="HomeWorkspaceModeMenu-Row"
            type="button"
            role="menuitemradio"
            data-plate-key="chat"
            :aria-checked="mode === 'chat'"
            :aria-disabled="isBlocked({ mode: 'chat' }) || undefined"
            @click="chooseChat"
          >
            <span class="i-ri-chat-3-line HomeWorkspaceModeMenu-Icon" aria-hidden="true" />
            <span class="HomeWorkspaceModeMenu-Name">{{ t('home.workspace.mode.chat') }}</span>
            <span
              v-if="mode === 'chat'"
              class="i-ri-check-line HomeWorkspaceModeMenu-Check"
              aria-hidden="true"
            />
          </button>

          <div v-if="showSkeleton" class="HomeWorkspaceModeMenu-Skeleton" aria-hidden="true">
            <span class="i-ri-robot-2-line HomeWorkspaceModeMenu-Icon" />
            <TxSkeleton class="HomeWorkspaceModeMenu-SkeletonBar" :height="10" :radius="5" />
          </div>

          <template v-else>
            <button
              v-for="profile in enabledProfiles"
              :key="profile.id"
              class="HomeWorkspaceModeMenu-Row"
              type="button"
              role="menuitemradio"
              :data-plate-key="`profile:${profile.id}`"
              :aria-checked="mode === 'agent' && profile.id === profileId"
              :aria-disabled="isBlocked({ mode: 'agent', profileId: profile.id }) || undefined"
              @click="chooseProfile(profile)"
            >
              <span class="i-ri-robot-2-line HomeWorkspaceModeMenu-Icon" aria-hidden="true" />
              <span class="HomeWorkspaceModeMenu-Name">{{ profile.name }}</span>
              <span
                v-if="mode === 'agent' && profile.id === profileId"
                class="i-ri-check-line HomeWorkspaceModeMenu-Check"
                aria-hidden="true"
              />
            </button>
          </template>
        </div>

        <div
          v-if="profilesError && profiles.length === 0"
          class="HomeWorkspaceModeMenu-State"
          role="alert"
        >
          <span>{{ t('home.workspace.profile.loadFailed') }}</span>
          <button
            ref="retryRef"
            class="HomeWorkspaceModeMenu-Link"
            type="button"
            @click="emit('load-profiles')"
          >
            {{ t('home.workspace.retry') }}
          </button>
        </div>
        <p v-else-if="!showSkeleton && profiles.length === 0" class="HomeWorkspaceModeMenu-State">
          {{ t('home.workspace.profile.none') }}
        </p>
        <p
          v-else-if="!showSkeleton && enabledProfiles.length === 0"
          class="HomeWorkspaceModeMenu-State"
        >
          {{ t('home.workspace.profile.noneEnabled') }}
        </p>
        <p v-if="profileUnavailable" class="HomeWorkspaceModeMenu-State is-danger" role="alert">
          {{ t('home.workspace.profile.unavailable') }}
        </p>

        <div class="HomeWorkspaceModeMenu-Divider" role="separator" />
        <button
          class="HomeWorkspaceModeMenu-Row"
          type="button"
          role="menuitem"
          aria-haspopup="true"
          data-plate-key="manage"
          @click="showView('manage')"
        >
          <span class="i-ri-settings-3-line HomeWorkspaceModeMenu-Icon" aria-hidden="true" />
          <span class="HomeWorkspaceModeMenu-Name">{{ t('home.workspace.profile.manage') }}</span>
          <span class="i-ri-arrow-right-s-line HomeWorkspaceModeMenu-Tail" aria-hidden="true" />
        </button>

        <p v-if="branchOnChange" class="HomeWorkspaceModeMenu-Note">
          <span class="i-ri-git-branch-line" aria-hidden="true" />
          <span>{{
            locked ? t('home.workspace.mode.branchLocked') : t('home.workspace.mode.branchHint')
          }}</span>
        </p>
      </template>

      <template v-else>
        <button
          class="HomeWorkspaceModeMenu-Back"
          type="button"
          role="menuitem"
          data-plate-key="back"
          @click="showView('main')"
        >
          <span class="i-ri-arrow-left-s-line" aria-hidden="true" />
          <span>{{ t('home.workspace.profile.manage') }}</span>
        </button>
        <div class="HomeWorkspaceModeMenu-Divider" role="separator" />

        <div
          class="HomeWorkspaceModeMenu-Group"
          role="group"
          :aria-label="t('home.workspace.profile.manage')"
        >
          <p v-if="profiles.length === 0" class="HomeWorkspaceModeMenu-State">
            {{ t('home.workspace.profile.none') }}
          </p>
          <div
            v-for="profile in profiles"
            :key="profile.id"
            class="HomeWorkspaceModeMenu-ManageRow"
            :class="{ 'is-disabled': !profile.enabled }"
          >
            <span class="i-ri-robot-2-line HomeWorkspaceModeMenu-Icon" aria-hidden="true" />
            <span class="HomeWorkspaceModeMenu-Text">
              <span class="HomeWorkspaceModeMenu-Name">{{ profile.name }}</span>
              <span class="HomeWorkspaceModeMenu-Hint">
                {{
                  t('home.workspace.profile.summary', {
                    runtime: profile.runtimeProvider,
                    tools: profile.allowedToolIds.length,
                    approval: t(`home.workspace.profile.approval.${profile.permissionPolicy.mode}`)
                  })
                }}
              </span>
            </span>
            <TxSwitch
              class="HomeWorkspaceModeMenu-Switch"
              size="small"
              :model-value="profile.enabled"
              :disabled="profileSaving !== null && profileSaving !== profile.id"
              :aria-busy="profileSaving === profile.id || undefined"
              :aria-label="
                t(
                  profile.enabled
                    ? 'home.workspace.profile.disable'
                    : 'home.workspace.profile.enable',
                  { name: profile.name }
                )
              "
              @update:model-value="toggleProfile(profile, $event)"
            />
          </div>
        </div>
      </template>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomeWorkspaceModeMenu-TriggerWrap {
  display: contents;
}

/* Panel chrome (surface, border, shadow, placement) belongs to the primitive; this is content. */
.HomeWorkspaceModeMenu {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;

  // Positioned and later in the tree than the plate, so every row, note and divider paints over it
  // — including whatever it crosses on the way.
  > :not(.HomeWorkspaceModeMenu-Plate) {
    position: relative;
  }
}

/*
 * The travelling highlight. The engine writes its transform, size and opacity every frame, so none
 * of them may carry a transition — CSS would re-ease each written frame and the plate would trail
 * its own spring. The fade is the one exception, and only once the plate has painted in place.
 */
.HomeWorkspaceModeMenu-Plate {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  opacity: 0;
  pointer-events: none;
  will-change: transform;
}

@media (prefers-reduced-motion: no-preference) {
  .HomeWorkspaceModeMenu-Plate.is-fading {
    transition: opacity 150ms ease;
  }
}

.HomeWorkspaceModeMenu-Group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomeWorkspaceModeMenu-Row,
.HomeWorkspaceModeMenu-Back {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  min-height: 32px;
  padding: 6px 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  // Once the plate has painted it is the only fill; until then, and wherever it cannot run, a row
  // keeps its own — immediate, as every hover here.
  .HomeWorkspaceModeMenu:not(.has-plate) &:hover:not([aria-disabled='true']) {
    background: var(--shell-surface);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }

  &[aria-disabled='true'] {
    color: var(--shell-text-muted);
    cursor: not-allowed;
  }
}

.HomeWorkspaceModeMenu-Back {
  gap: 4px;
  padding-inline: 6px;
  font-weight: 600;

  span:first-child {
    color: var(--shell-text-secondary);
    font-size: 16px;
  }
}

.HomeWorkspaceModeMenu-Icon {
  flex: none;
  color: var(--shell-text-secondary);
  font-size: 16px;
}

.HomeWorkspaceModeMenu-Name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeWorkspaceModeMenu-Check {
  flex: none;
  color: var(--shell-primary);
  font-size: 15px;
}

.HomeWorkspaceModeMenu-Tail {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.HomeWorkspaceModeMenu-Divider {
  margin: 4px 2px;
  border-top: 1px solid var(--shell-border);
}

.HomeWorkspaceModeMenu-Note {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 2px 9px 4px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;
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

.HomeWorkspaceModeMenu-ManageRow {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 9px;

  &.is-disabled .HomeWorkspaceModeMenu-Name {
    color: var(--shell-text-muted);
  }
}

.HomeWorkspaceModeMenu-Text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.HomeWorkspaceModeMenu-Hint {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.4;
}

.HomeWorkspaceModeMenu-Switch {
  flex: none;
}

/* One profile row: the icon and a name-width bar in the row's own padding and line box. */
.HomeWorkspaceModeMenu-Skeleton {
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 32px;
  padding: 6px 9px;
  font-size: var(--shell-fs-body);
}

.HomeWorkspaceModeMenu-SkeletonBar {
  width: 58%;
  height: 1lh;
}
</style>
