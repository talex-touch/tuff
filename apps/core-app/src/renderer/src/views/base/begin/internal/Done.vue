<script setup lang="ts" name="Done">
import type { AnimationItem } from 'lottie-web'
import type { Component } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'
import { TxButton } from '@talex-touch/tuffex'
import { hasNavigator } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents, TrayEvents } from '@talex-touch/utils/transport/events'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import WelcomeData from '~/assets/lotties/welcome.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { appSetting } from '~/modules/channel/storage'
import BeginShortcutKey from './components/BeginShortcutKey.vue'

type StepFunction = (
  call: { comp: Component | null; rect?: { width: number; height: number } },
  onDone?: () => void
) => void

const step: StepFunction = inject('step')!
const { t } = useI18n()
const appSdk = useAppSdk()
const transport = useTuffTransport()

const beginnerShortcutTriggeredEvent = defineRawEvent<void, void>('beginner:shortcut-triggered')

const isMac = computed(() => hasNavigator() && /Mac|iPhone|iPad|iPod/i.test(navigator.platform))
const shortcutKeyLabel = computed(() =>
  isMac.value ? t('beginner.done.shortcut.command') : t('beginner.done.shortcut.ctrl')
)
const shortcutHint = computed(() => (isMac.value ? '⌘ + E' : 'Ctrl + E'))

const isModifierPressed = ref(false)
const isEPressed = ref(false)
const isShortcutSuccess = ref(false)
const isShortcutFlowRunning = ref(false)
const isDoneClosing = ref(false)
let removeShortcutTriggeredListener: (() => void) | null = null

type BeginnerState = {
  init: boolean
  shortcutArmed?: boolean
}

type SetupState = {
  hideDock?: boolean
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

function ensureSetupState(): SetupState {
  return appSetting.setup as SetupState
}

async function enableHideDockDefault(): Promise<void> {
  const setupState = ensureSetupState()
  if (setupState.hideDock === true) return
  setupState.hideDock = true
  try {
    await transport.send(TrayEvents.hideDock.set)
  } catch {
    // noop
  }
}

async function completeBeginner(
  options: { hideWindow?: boolean; openCoreBox?: boolean } = {}
): Promise<void> {
  if (isDoneClosing.value) return

  isDoneClosing.value = true
  getBeginnerState().init = true
  disarmDoneShortcut()
  step({ comp: null })

  if (options.hideWindow) {
    try {
      await appSdk.hide()
    } catch {
      // noop
    }
  }

  if (options.openCoreBox) {
    try {
      await transport.send(CoreBoxEvents.ui.show)
    } catch {
      // noop
    }
  }
}

async function runShortcutFinishFlow(): Promise<void> {
  if (isDoneClosing.value || isShortcutFlowRunning.value) return

  isShortcutFlowRunning.value = true
  isModifierPressed.value = true
  isEPressed.value = true
  await sleep(120)

  isShortcutSuccess.value = true
  await sleep(420)

  await enableHideDockDefault()
  await completeBeginner({ hideWindow: true, openCoreBox: true })
}

function goon(): void {
  void completeBeginner()
}

function handleKeyDown(event: KeyboardEvent): void {
  const modifierActive = isMac.value ? event.metaKey : event.ctrlKey
  const normalizedKey = event.key.toLowerCase()

  if (event.key === 'Meta' || event.key === 'Control') {
    isModifierPressed.value = true
  }

  if (normalizedKey === 'e') {
    isEPressed.value = true
  }

  if (!modifierActive || normalizedKey !== 'e') return

  event.preventDefault()
  event.stopPropagation()
  void runShortcutFinishFlow()
}

function handleKeyUp(event: KeyboardEvent): void {
  if (isShortcutFlowRunning.value) return

  if (event.key === 'Meta' || event.key === 'Control') {
    isModifierPressed.value = false
  }

  if (event.key.toLowerCase() === 'e') {
    isEPressed.value = false
  }
}

function resetKeyPressedState(): void {
  if (isShortcutFlowRunning.value) return
  isModifierPressed.value = false
  isEPressed.value = false
}

onMounted(() => {
  armDoneShortcut()

  removeShortcutTriggeredListener = transport.on(beginnerShortcutTriggeredEvent, () => {
    void runShortcutFinishFlow()
  })

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
          <BeginShortcutKey
            :label="shortcutKeyLabel"
            :active="isModifierPressed"
            :success="isShortcutSuccess"
          />
          <span class="Done-ShortcutPlus">+</span>
          <BeginShortcutKey label="E" :active="isEPressed" :success="isShortcutSuccess" />
        </div>
        <small>{{ t('beginner.done.shortcut.changeInSettings') }}</small>
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
  }
}
</style>
