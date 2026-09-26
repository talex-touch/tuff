<script setup lang="ts" name="Done">
import type { AnimationItem } from 'lottie-web'
import type { Component } from 'vue'
import type { AcceleratorModifier } from '../../../../../../shared/accelerator-label'
import { sleep } from '@talex-touch/utils/common/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { computed, onMounted, onUnmounted, reactive, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import WelcomeData from '~/assets/lotties/welcome.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { useCoreBoxShortcut } from '~/modules/shortcuts/useCoreBoxShortcut'
import { appSetting, appSettingStore } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  acceleratorKeyCap,
  acceleratorKeyEventCodes,
  acceleratorLabel,
  acceleratorMatchesEvent,
  acceleratorModifierFlag,
  acceleratorModifierLabel,
  parseAccelerator
} from '../../../../../../shared/accelerator-label'
import { COREBOX_TOGGLE_DEFAULT_ACCELERATOR } from '../../../../../../shared/corebox-shortcut'
import BeginShortcutKey from './components/BeginShortcutKey.vue'

type StepFunction = (
  call: { comp: Component | null; rect?: { width: number; height: number } },
  onDone?: () => void
) => void

const step: StepFunction = inject('step')!
const { t } = useI18n()
const doneLog = createRendererLogger('BeginnerDone')
/** Bounded because the user is waiting on a button; three tries cover a contended flush. */
const ONBOARDING_SAVE_RETRIES = 2
const ONBOARDING_SAVE_RETRY_DELAY_MS = 120
const appSdk = useAppSdk()
const transport = useTuffTransport()
const { binding: coreBoxShortcut, platform } = useCoreBoxShortcut()

/**
 * The key this page teaches: the one CoreBox is set to, as settings show it, and before the main
 * process answers, the default. No other key ever stands in for it, so the live key is this one or
 * none; with none (the OS refused it, or it lost an in-app conflict) the page still names it and
 * still completes on it, and the user has had the notice that says why it does nothing elsewhere.
 */
const shortcutAccelerator = computed(
  () => coreBoxShortcut.value?.configured ?? COREBOX_TOGGLE_DEFAULT_ACCELERATOR
)
const parsedShortcut = computed(() => parseAccelerator(shortcutAccelerator.value, platform.value))
const shortcutHint = computed(() =>
  acceleratorLabel(shortcutAccelerator.value, platform.value, ' + ')
)

/** Modifier state as the last key event reported it, so each cap lights while its key is held. */
const heldModifiers = reactive({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
const isKeyPressed = ref(false)
/** The finish flow presses every cap at once, whichever way the shortcut arrived. */
const isShortcutPressed = ref(false)
const isShortcutSuccess = ref(false)
const isShortcutFlowRunning = ref(false)
const isDoneClosing = ref(false)
let removeShortcutTriggeredListener: (() => void) | null = null

/** The word printed on a modifier key: `option` on a Mac keyboard, `alt` on a PC one. */
function modifierLegendKey(modifier: AcceleratorModifier): string {
  if (platform.value === 'darwin') {
    if (modifier === 'alt') return 'option'
    return modifier === 'super' ? 'command' : modifier
  }
  switch (modifier) {
    case 'control':
      return 'ctrl'
    case 'alt':
      return 'alt'
    case 'shift':
      return 'shift'
    default:
      return platform.value === 'win32' ? 'win' : 'super'
  }
}

interface ShortcutCap {
  id: string
  label: string
  symbol?: string
  active: boolean
}

const shortcutCaps = computed<ShortcutCap[]>(() => {
  const parsed = parsedShortcut.value
  if (!parsed) return []
  const isMacPlatform = platform.value === 'darwin'
  return [
    ...parsed.modifiers.map((modifier) => ({
      id: modifier,
      label: t(`beginner.done.shortcut.${modifierLegendKey(modifier)}`),
      symbol: isMacPlatform ? acceleratorModifierLabel(modifier, platform.value) : undefined,
      active: isShortcutPressed.value || heldModifiers[acceleratorModifierFlag(modifier)]
    })),
    {
      id: 'key',
      label: acceleratorKeyCap(parsed.key),
      active: isShortcutPressed.value || isKeyPressed.value
    }
  ]
})

type BeginnerState = {
  init: boolean
  shortcutArmed?: boolean
}

function ensureBeginnerState(): void {
  if (!appSetting.beginner) {
    appSetting.beginner = {
      init: false
    }
  }
}

function getBeginnerState(): BeginnerState {
  ensureBeginnerState()
  return appSetting.beginner as BeginnerState
}

function armDoneShortcut(): void {
  getBeginnerState().shortcutArmed = true
}

function disarmDoneShortcut(): void {
  getBeginnerState().shortcutArmed = false
}

function handleWelcomeLoaded(animation: AnimationItem): void {
  animation.setSpeed(1.5)
}

async function completeBeginner(options: { openCoreBox?: boolean } = {}): Promise<boolean> {
  if (isDoneClosing.value) return false

  isDoneClosing.value = true
  const beginnerState = getBeginnerState()
  const completedBeginnerState = {
    ...toRaw(beginnerState),
    init: true,
    shortcutArmed: false
  }

  // `beginner.init` admits CoreBox and search in the main process. Send a detached snapshot and
  // require the main process to persist it before mutating renderer state: changing the reactive
  // object first would race its 300ms auto-save against this lifecycle-critical write.
  //
  // Retried because this write has no later tick — the main-process config repository says as much
  // where it explains why *it* retries — so a single contended flush or transport hiccup would
  // otherwise put a dead end in front of the user on their first run. A conflict is not retried:
  // it means a newer value already won, and resending the stale snapshot would only lose again.
  try {
    let result = await appSettingStore.saveDurable({
      ...toRaw(appSetting),
      beginner: completedBeginnerState
    })

    for (
      let attempt = 1;
      attempt <= ONBOARDING_SAVE_RETRIES && !result.success && !result.conflict;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, ONBOARDING_SAVE_RETRY_DELAY_MS * attempt))
      doneLog.warn('Retrying onboarding completion save', { attempt, reason: result.reason })
      result = await appSettingStore.saveDurable({
        ...toRaw(appSetting),
        beginner: completedBeginnerState
      })
    }

    if (!result.success) {
      // Carry the reason: renderer logs do not reach the main log, so without it a failed first
      // run leaves nothing to diagnose from.
      throw new Error(
        result.conflict
          ? 'ONBOARDING_SAVE_CONFLICT'
          : `ONBOARDING_SAVE_FAILED:${result.reason ?? 'unknown'}`
      )
    }
  } catch (error) {
    isDoneClosing.value = false
    doneLog.error('Failed to persist onboarding completion', error)
    toast.error(t('beginner.done.persistFailed'))
    return false
  }

  beginnerState.init = true
  disarmDoneShortcut()
  step({ comp: null })

  try {
    await appSdk.hide()
  } catch {
    // noop
  }

  if (options.openCoreBox) {
    try {
      await transport.send(CoreBoxEvents.ui.show)
    } catch {
      // noop
    }
  }

  return true
}

async function runShortcutFinishFlow(): Promise<void> {
  if (isDoneClosing.value || isShortcutFlowRunning.value) return

  isShortcutFlowRunning.value = true
  isShortcutPressed.value = true
  await sleep(120)

  isShortcutSuccess.value = true
  await sleep(420)

  const completed = await completeBeginner({ openCoreBox: true })
  if (!completed) {
    isShortcutFlowRunning.value = false
    isShortcutSuccess.value = false
    isShortcutPressed.value = false
    resetKeyPressedState()
  }
}

function goon(): void {
  void completeBeginner()
}

function syncHeldModifiers(event: KeyboardEvent): void {
  heldModifiers.metaKey = event.metaKey
  heldModifiers.ctrlKey = event.ctrlKey
  heldModifiers.altKey = event.altKey
  heldModifiers.shiftKey = event.shiftKey
}

/**
 * Reached only when the global shortcut did not take the press, e.g. when it is not registered:
 * a registered one is consumed by the OS and arrives as `beginner.shortcutTriggered` instead.
 * Matched by physical key: Option rewrites `key` on a Mac (`⌥Space` types a no-break space).
 */
function handleKeyDown(event: KeyboardEvent): void {
  syncHeldModifiers(event)
  const parsed = parsedShortcut.value
  if (!parsed) return

  if (acceleratorKeyEventCodes(parsed.key).includes(event.code)) {
    isKeyPressed.value = true
  }

  if (!acceleratorMatchesEvent(parsed, event)) return

  event.preventDefault()
  event.stopPropagation()
  void runShortcutFinishFlow()
}

function handleKeyUp(event: KeyboardEvent): void {
  if (isShortcutFlowRunning.value) return

  syncHeldModifiers(event)
  const parsed = parsedShortcut.value
  if (parsed && acceleratorKeyEventCodes(parsed.key).includes(event.code)) {
    isKeyPressed.value = false
  }
}

function resetKeyPressedState(): void {
  if (isShortcutFlowRunning.value) return
  heldModifiers.metaKey = false
  heldModifiers.ctrlKey = false
  heldModifiers.altKey = false
  heldModifiers.shiftKey = false
  isKeyPressed.value = false
}

onMounted(() => {
  armDoneShortcut()

  const removeCanonicalShortcutListener = transport.on(
    CoreBoxEvents.beginner.shortcutTriggered,
    () => {
      void runShortcutFinishFlow()
    }
  )
  removeShortcutTriggeredListener = () => {
    removeCanonicalShortcutListener()
  }

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', resetKeyPressedState)
})

onUnmounted(() => {
  removeShortcutTriggeredListener?.()
  removeShortcutTriggeredListener = null

  if (!isDoneClosing.value) {
    disarmDoneShortcut()
  }

  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', resetKeyPressedState)
})
</script>

<template>
  <div class="Done">
    <div class="Done-Welcome">
      <LottieFrame :loop="true" :data="WelcomeData" @loaded="handleWelcomeLoaded" />
    </div>

    <div class="Done-Content">
      <p>{{ t('beginner.done.shortcut.hint', { shortcut: shortcutHint }) }}</p>
      <div class="Done-Shortcut">
        <div class="Done-ShortcutKeys my-4">
          <template v-for="(cap, index) in shortcutCaps" :key="cap.id">
            <span v-if="index > 0" class="Done-ShortcutPlus">+</span>
            <BeginShortcutKey
              :label="cap.label"
              :symbol="cap.symbol"
              :active="cap.active"
              :success="isShortcutSuccess"
            />
          </template>
        </div>
        <small>{{ t('beginner.done.shortcut.changeInSettings') }}</small>
        <!--
          On every platform: macOS reports the key as registered even while another app holds it,
          so a press that opens Raycast, Alfred or ChatGPT is the only sign the user will get.
        -->
        <small class="Done-ShortcutConflict">{{ t('beginner.done.shortcut.conflictHint') }}</small>
      </div>
      <TxButton variant="flat" type="primary" @click="goon">
        {{ t('beginner.done.action') }}
      </TxButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes join {
  to {
    opacity: 1;
  }
}

.Done {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2rem;

  &-Welcome {
    width: 630px;
    height: 128px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    :deep(.LottieFrame-Container) {
      width: 100%;
      height: 100%;
      transform-origin: center;
    }
  }

  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 2rem;
    opacity: 0;
    animation: join forwards 0.45s 1.6s;

    p {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 500;
      text-align: center;
      color: var(--tx-text-color-primary);
    }
  }

  &-Shortcut {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;

    &Keys {
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }

    &Plus {
      color: var(--tx-text-color-secondary);
      font-size: 1rem;
      font-weight: 600;
      line-height: 1;
    }

    small {
      color: var(--tx-text-color-secondary);
      font-size: 0.72rem;
      text-align: center;
    }

    // The longest line on the page; balanced so it wraps into two even lines, not one and a word.
    &Conflict {
      max-width: 28rem;
      text-wrap: balance;
    }
  }
}
</style>
