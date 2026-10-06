<script lang="ts" name="HomePermissionMenu" setup>
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import { TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposerChip from './composer/ComposerChip.vue'
import { focusWhenShown } from './focus-when-shown'

/**
 * The composer's permission chip and the menu behind it: three rows — name, icon, the current one
 * checked — with each mode's sentence as the row's hover title instead of a second line
 * (`home-composer` › 权限弹层). The mode itself stays the caller's (an `appSetting` slice the
 * settings layer owns). Anchoring, outside-click, Escape and arrow traversal come from
 * TxDropdownMenu; opening focus is placed here, on the current mode.
 */
const props = defineProps<{ mode: AgentToolsMode }>()

const emit = defineEmits<{
  (event: 'update:mode', mode: AgentToolsMode): void
  /** The caller owns the agent-tools transport instance, so resetting is its job. */
  (event: 'reset'): void
}>()

const { t } = useI18n()

/** The three permission modes in menu order; the icon doubles as the chip's. */
const PERMISSION_MODES = [
  { mode: 'off', icon: 'i-ri-shield-line' },
  { mode: 'review', icon: 'i-ri-shield-check-line' },
  { mode: 'full', icon: 'i-ri-shield-flash-line' }
] as const

const open = ref(false)
/**
 * 「完全允许」 has been chosen once and waits for the second activation that applies it. It is a
 * standing grant over every tool the model can reach, so it is never one click away — but the
 * second step stays in its own row instead of replacing the menu.
 */
const arming = ref(false)
const triggerWrapRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
/**
 * Focus goes back to the chip only when the menu closed from the keyboard or a choice — an
 * outside click moved focus somewhere deliberate, and yanking it back would fight the user.
 */
let restoreFocusOnClose = false

const chipIcon = computed(
  () => PERMISSION_MODES.find((option) => option.mode === props.mode)?.icon ?? 'i-ri-shield-line'
)

const chipLabel = computed(() => t(`home.permissionMode.${props.mode}`))

function closeMenu(): void {
  restoreFocusOnClose = true
  open.value = false
}

function choose(mode: AgentToolsMode): void {
  if (mode === 'full' && props.mode !== 'full' && !arming.value) {
    arming.value = true
    return
  }
  arming.value = false
  emit('update:mode', mode)
  closeMenu()
}

function requestReset(): void {
  closeMenu()
  emit('reset')
}

/** The anchor closes on Escape by itself; this only marks that focus should return to the chip. */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') restoreFocusOnClose = true
}

watch(open, (isOpen) => {
  // Every open starts plain: an abandoned confirmation is not a pending choice.
  arming.value = false
  if (isOpen) {
    restoreFocusOnClose = false
    // On the current mode, so the arrows start from it.
    focusWhenShown(
      () =>
        panelRef.value?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]'),
      () => open.value
    )
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
    initial-focus="none"
    :min-width="208"
    :panel-radius="12"
    :panel-padding="6"
    panel-background="pure"
  >
    <template #trigger>
      <!-- display: contents — the wrapper exists only so closing can find the chip to refocus. -->
      <span ref="triggerWrapRef" class="HomePermissionMenu-TriggerWrap">
        <!-- Folds to the shield alone in a narrow toolbar; the full state stays in the name. -->
        <ComposerChip
          class="HomePermissionMenu-Chip"
          :danger="props.mode === 'full'"
          :icon="chipIcon"
          :label="chipLabel"
          :open="open"
          collapsible
          aria-haspopup="menu"
          :aria-expanded="open"
          :aria-label="`${t('home.permission')} · ${chipLabel}`"
          :title="t(`home.permissionHint.${props.mode}`)"
        />
      </span>
    </template>

    <div ref="panelRef" class="HomePermissionMenu" @keydown="onPanelKeydown">
      <div class="HomePermissionMenu-Options" role="group" :aria-label="t('home.permissionMenu')">
        <button
          v-for="option in PERMISSION_MODES"
          :key="option.mode"
          class="HomePermissionMenu-Option"
          :class="{ 'is-arming': option.mode === 'full' && arming }"
          type="button"
          role="menuitemradio"
          :data-mode="option.mode"
          :aria-checked="props.mode === option.mode"
          :title="t(`home.permissionHint.${option.mode}`)"
          :aria-describedby="
            option.mode === 'full' && arming ? 'home-permission-arm-hint' : undefined
          "
          @click="choose(option.mode)"
        >
          <span :class="option.icon" class="HomePermissionMenu-Icon" aria-hidden="true" />
          <span class="HomePermissionMenu-Label">
            <span>{{ t(`home.permissionMode.${option.mode}`) }}</span>
            <span
              v-if="option.mode === 'full' && arming"
              id="home-permission-arm-hint"
              class="HomePermissionMenu-ArmHint"
            >
              {{ t('home.permissionFullArm') }}
            </span>
          </span>
          <span
            v-if="props.mode === option.mode"
            class="i-ri-check-line HomePermissionMenu-Check"
            aria-hidden="true"
          />
        </button>
      </div>

      <!-- Only under 「自动审阅」: with no confirmations to remember, the other two modes have
           nothing to reset. -->
      <template v-if="props.mode === 'review'">
        <div class="HomePermissionMenu-Divider" role="separator" />
        <button
          class="HomePermissionMenu-Reset"
          type="button"
          role="menuitem"
          @click="requestReset"
        >
          <span class="i-ri-eraser-line" aria-hidden="true" />
          <span>{{ t('home.permissionResetApprovals') }}</span>
        </button>
      </template>

      <!-- The armed row's sentence, said once when it appears. -->
      <span class="HomePermissionMenu-Status" role="status" aria-live="polite">
        {{ arming ? t('home.permissionFullArm') : '' }}
      </span>
    </div>
  </TxDropdownMenu>
</template>

<style lang="scss" scoped>
.HomePermissionMenu-TriggerWrap {
  display: contents;
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

.HomePermissionMenu-Option,
.HomePermissionMenu-Reset {
  display: flex;
  gap: 10px;
  align-items: center;
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

  &:hover {
    background: var(--shell-surface);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomePermissionMenu-Option {
  /* The risky mode is marked in the list too, so the choice reads before it is made. */
  &[data-mode='full'] .HomePermissionMenu-Icon {
    color: var(--shell-danger);
  }

  /* Waiting for the second activation: the row itself carries the warning. */
  &.is-arming,
  &.is-arming:hover {
    align-items: flex-start;
    background: var(--shell-danger-soft);
  }
}

.HomePermissionMenu-Icon {
  flex: none;
  color: var(--shell-text-secondary);
  font-size: 16px;
}

.HomePermissionMenu-Label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.HomePermissionMenu-ArmHint {
  color: var(--shell-danger);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;
}

.HomePermissionMenu-Check {
  flex: none;
  color: var(--shell-primary);
  font-size: 15px;
}

.HomePermissionMenu-Divider {
  margin: 4px 2px;
  border-top: 1px solid var(--shell-border);
}

.HomePermissionMenu-Reset {
  color: var(--shell-text-regular);

  span:first-child {
    color: var(--shell-text-secondary);
    font-size: 16px;
  }
}

.HomePermissionMenu-Status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
