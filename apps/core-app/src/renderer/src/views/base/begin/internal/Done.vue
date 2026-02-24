<script setup lang="ts" name="Done">
import type { AnimationItem } from 'lottie-web'
import type { Component } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import { hasNavigator } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
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
const isMac = computed(() => hasNavigator() && /Mac|iPhone|iPad|iPod/i.test(navigator.platform))
const shortcutKeyLabel = computed(() =>
  isMac.value ? t('beginner.done.shortcut.command') : t('beginner.done.shortcut.ctrl')
)
const shortcutHint = computed(() => (isMac.value ? '⌘ + E' : 'Ctrl + E'))
const isModifierPressed = ref(false)
const isEPressed = ref(false)
const isDoneClosing = ref(false)

function handleWelcomeLoaded(animation: AnimationItem): void {
  animation.setSpeed(1.5)
}

async function completeBeginner(options: { hideWindow?: boolean } = {}): Promise<void> {
  if (isDoneClosing.value) return
  isDoneClosing.value = true
  step(
    {
      comp: null
    },
    () => {
      appSetting.beginner.init = true
    }
  )

  if (options.hideWindow) {
    try {
      await appSdk.hide()
    } catch {
      // noop
    }
  }
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
  isModifierPressed.value = true
  isEPressed.value = true
  void completeBeginner({ hideWindow: true })
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Meta' || event.key === 'Control') {
    isModifierPressed.value = false
  }

  if (event.key.toLowerCase() === 'e') {
    isEPressed.value = false
  }
}

function resetKeyPressedState(): void {
  isModifierPressed.value = false
  isEPressed.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', resetKeyPressedState)
})

onUnmounted(() => {
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
      <p>{{ t('beginner.done.description') }}</p>
      <div class="Done-Shortcut">
        <div class="Done-ShortcutKeys">
          <BeginShortcutKey :label="shortcutKeyLabel" :active="isModifierPressed" />
          <span class="Done-ShortcutPlus">+</span>
          <BeginShortcutKey label="E" :active="isEPressed" />
        </div>
        <small>{{ t('beginner.done.shortcut.hint', { shortcut: shortcutHint }) }}</small>
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
  gap: 0.9rem;

  &-Welcome {
    width: 230px;
    height: 128px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    :deep(.LottieFrame-Container) {
      width: 100%;
      height: 100%;
      transform: scale(2.05);
      transform-origin: center;
    }
  }

  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 0.8rem;
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
