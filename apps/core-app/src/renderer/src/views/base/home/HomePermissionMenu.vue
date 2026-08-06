<script lang="ts" name="HomePermissionMenu" setup>
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The composer's permission pill and the menu behind it. The pill lives inside the component
 * because everything on it — label, icon, warning tint — is derived from the mode; the mode
 * itself stays the caller's (it is an `appSetting` slice the settings layer owns). Anchoring,
 * outside-click, Escape and arrow traversal come from TxDropdownMenu.
 */
const props = defineProps<{ mode: AgentToolsMode }>()

const emit = defineEmits<{
  (event: 'update:mode', mode: AgentToolsMode): void
  /** The caller owns the agent-tools transport instance, so resetting is its job. */
  (event: 'reset'): void
}>()

const { t } = useI18n()

/** The three permission modes in menu order; the icon doubles as the pill's. */
const PERMISSION_MODES = [
  { mode: 'off', icon: 'i-ri-shield-line' },
  { mode: 'review', icon: 'i-ri-shield-check-line' },
  { mode: 'full', icon: 'i-ri-shield-flash-line' }
] as const

const open = ref(false)
/** True while the 「完全允许」 consequence step has replaced the mode list. */
const confirming = ref(false)
const triggerWrapRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
/**
 * Focus goes back to the pill only when the menu closed from the keyboard or a choice —
 * an outside click moved focus somewhere deliberate, and yanking it back would fight the user.
 */
let restoreFocusOnClose = false

const pillIcon = computed(
  () => PERMISSION_MODES.find((option) => option.mode === props.mode)?.icon ?? 'i-ri-shield-line'
)

/** Queried rather than collected through refs: moving focus is a DOM concern either way. */
function focusCheckedOption(): void {
  const index = PERMISSION_MODES.findIndex((option) => option.mode === props.mode)
  const buttons = Array.from(
    panelRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
  )
  buttons[Math.max(index, 0)]?.focus()
}

function closeMenu(): void {
  restoreFocusOnClose = true
  open.value = false
}

function choose(mode: AgentToolsMode): void {
  if (mode === 'full' && props.mode !== 'full') {
    // Never one click away: 「完全允许」 is a standing grant over every tool the model can
    // reach, so it costs an explicit second step that states what it means.
    confirming.value = true
    void nextTick(() => cancelRef.value?.focus())
    return
  }
  emit('update:mode', mode)
  closeMenu()
}

function confirmFull(): void {
  emit('update:mode', 'full')
  closeMenu()
}

function cancelFull(): void {
  // Leaving the consequence step keeps the mode untouched.
  confirming.value = false
  void nextTick(focusCheckedOption)
}

function requestReset(): void {
  closeMenu()
  emit('reset')
}

/** The anchor closes on Escape by itself; this only marks that focus should return to the pill. */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') restoreFocusOnClose = true
}

watch(open, (isOpen) => {
  // Reopening always starts at the list: an abandoned consequence step is not a pending choice.
  confirming.value = false
  if (isOpen) {
    restoreFocusOnClose = false
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
    :min-width="304"
    :panel-radius="12"
    :panel-padding="6"
    panel-background="pure"
  >
    <template #trigger>
      <!-- display: contents — the wrapper exists only so closing can find the pill to refocus. -->
      <span ref="triggerWrapRef" class="HomePermissionMenu-TriggerWrap">
        <button
          class="HomePermissionMenu-Pill"
          :class="{ active: props.mode === 'review', 'is-full': props.mode === 'full' }"
          type="button"
          :aria-expanded="open"
          :title="t(`home.permissionHint.${props.mode}`)"
        >
          <span :class="pillIcon" />
          <span>{{ t('home.permission') }} · {{ t(`home.permissionMode.${props.mode}`) }}</span>
        </button>
      </span>
    </template>

    <div ref="panelRef" class="HomePermissionMenu" @keydown="onPanelKeydown">
      <template v-if="!confirming">
        <div class="HomePermissionMenu-Options" role="group" :aria-label="t('home.permissionMenu')">
          <button
            v-for="option in PERMISSION_MODES"
            :key="option.mode"
            class="HomePermissionMenu-Option"
            type="button"
            role="menuitemradio"
            :data-mode="option.mode"
            :aria-checked="props.mode === option.mode"
            @click="choose(option.mode)"
          >
            <span :class="option.icon" class="HomePermissionMenu-Icon" />
            <span class="HomePermissionMenu-Label">
              <span>{{ t(`home.permissionMode.${option.mode}`) }}</span>
              <span class="HomePermissionMenu-Hint">
                {{ t(`home.permissionHint.${option.mode}`) }}
              </span>
            </span>
            <span
              v-if="props.mode === option.mode"
              class="i-ri-check-line HomePermissionMenu-Check"
            />
          </button>
        </div>

        <!-- Only under 「自动审阅」: with no confirmations to remember, the
             other two modes have nothing to reset. -->
        <template v-if="props.mode === 'review'">
          <div class="HomePermissionMenu-Divider" />
          <button
            class="HomePermissionMenu-Reset"
            type="button"
            role="menuitem"
            @click="requestReset"
          >
            <span class="i-ri-eraser-line" />
            <span>{{ t('home.permissionResetApprovals') }}</span>
          </button>
        </template>
      </template>

      <!-- `group` rather than `alertdialog`: focus moves here but is not
           trapped, and claiming modality we do not implement would mislead. -->
      <div
        v-else
        class="HomePermissionMenu-Confirm"
        role="group"
        aria-labelledby="home-permission-confirm-title"
        aria-describedby="home-permission-confirm-desc"
      >
        <p id="home-permission-confirm-title" class="HomePermissionMenu-ConfirmTitle">
          {{ t('home.permissionFullConfirmTitle') }}
        </p>
        <p id="home-permission-confirm-desc" class="HomePermissionMenu-ConfirmDesc">
          {{ t('home.permissionFullConfirmDesc') }}
        </p>
        <div class="HomePermissionMenu-ConfirmActions">
          <button
            ref="cancelRef"
            class="HomePermissionMenu-Cancel"
            type="button"
            @click="cancelFull"
          >
            {{ t('home.permissionFullConfirmCancel') }}
          </button>
          <button class="HomePermissionMenu-Apply" type="button" @click="confirmFull">
            {{ t('home.permissionFullConfirmApply') }}
          </button>
        </div>
      </div>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomePermissionMenu-TriggerWrap {
  display: contents;
}

.HomePermissionMenu-Pill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: var(--shell-surface);
  }

  /* Tools on and asking first: an ordinary enabled state, so it carries the accent. */
  &.active {
    border-color: var(--shell-primary-border);
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    font-weight: 500;
  }

  /* 「完全允许」 has to stay visible as a state, not just as a label the eye skips:
     every tool call runs unasked while it is on. The shell has no warning ramp, and
     the alarm one is the honest read here — it also re-points under `html.contrast`,
     which a hand-picked amber would not. */
  &.is-full {
    border-color: var(--shell-danger-border);
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
    font-weight: 500;
  }
}

/* Panel chrome (surface, border, shadow, placement) belongs to the primitive; this is content. */
.HomePermissionMenu {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomePermissionMenu-Options {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomePermissionMenu-Option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
  }

  /* The risky option is marked in the list too, so the choice reads before it is made. */
  &[data-mode='full'] .HomePermissionMenu-Icon {
    color: var(--shell-danger);
  }
}

.HomePermissionMenu-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-secondary);
}

.HomePermissionMenu-Label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.HomePermissionMenu-Hint {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;
}

.HomePermissionMenu-Check {
  flex: none;
  margin-top: 2px;
  color: var(--shell-primary);
}

.HomePermissionMenu-Divider {
  margin: 4px 2px;
  border-top: 1px solid var(--shell-border);
}

.HomePermissionMenu-Reset {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 7px 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  text-align: left;
  font-family: inherit;
  font-size: var(--shell-fs-sm);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
  }
}

.HomePermissionMenu-Confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 9px 8px;
}

.HomePermissionMenu-ConfirmTitle {
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-body);
  font-weight: 600;
}

.HomePermissionMenu-ConfirmDesc {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.55;
}

.HomePermissionMenu-ConfirmActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.HomePermissionMenu-Cancel,
.HomePermissionMenu-Apply {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--shell-radius-full);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Cancel keeps the ordinary weight and the confirm stays an outline: the grant is the
   consequential click, so it must not be the one the eye lands on first. */
.HomePermissionMenu-Cancel {
  border: 1px solid var(--shell-border-strong);
  background: transparent;
  color: var(--shell-text-regular);

  &:hover {
    background: var(--shell-surface);
  }
}

.HomePermissionMenu-Apply {
  border: 1px solid var(--shell-danger-border);
  background: var(--shell-danger-soft);
  color: var(--shell-danger);

  &:hover {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
  }
}
</style>
