<script setup lang="ts" name="LanguageSetup">
import type { Component } from 'vue'
import type { SupportedLanguage } from '~/modules/lang'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HelloData from '~/assets/lotties/hello.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import {
  BOOT_LANGUAGE_PREFERENCE,
  readLanguagePreference,
  SUPPORTED_LANGUAGES,
  useLanguage
} from '~/modules/lang'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import AccountDo from './AccountDo.vue'

type StepFunction = (call: { comp: Component; rect?: { width: number; height: number } }) => void

const step = inject<StepFunction>('step')!
const { t } = useI18n()
const { currentLanguage, switchLanguage, setFollowSystemLanguage, getSystemLanguage } =
  useLanguage()

const languageSetupLog = createRendererLogger('LanguageSetup')
const isLanguageListVisible = ref(false)
/**
 * 首启向导答的是产品默认语言，而不是把系统语言当成用户已经做出的选择：在英文 macOS 上，旧写法
 * 预选「跟随系统」＋系统语言，用户点一下「下一步」就把 en-US 存成了自己的语言，界面随即整窗变英文。
 *
 * 已经选过语言的用户重开向导时（设置页可以重开），初值仍应是他现在的选择。`beginner.init` 正是
 * 「首启是否已经走完」这个持久标志：设置里区分不出「没选过」和「选了跟随系统」（两者逐字相同），
 * 所以这里只能靠它分支。
 */
const hasStoredChoice = appSetting?.beginner?.init === true
const initialPreference = hasStoredChoice ? readLanguagePreference() : BOOT_LANGUAGE_PREFERENCE
const followSystem = ref(initialPreference.followSystem)
const selectedLanguage = ref<SupportedLanguage>(initialPreference.locale)
const STARTUP_SOUND_URL = new URL('../../../../assets/sounds/startup.m4a', import.meta.url).href
let startupAudio: HTMLAudioElement | null = null
let removeAudioRetryListeners: (() => void) | null = null
const LANGUAGE_ICONS: Record<SupportedLanguage, string> = {
  'zh-CN': '🇨🇳',
  'en-US': '🇺🇸'
}

const systemLanguage = computed(() => getSystemLanguage())
const selectedLanguageName = computed(
  () =>
    SUPPORTED_LANGUAGES.find((lang) => lang.key === selectedLanguage.value)?.name ??
    selectedLanguage.value
)
const selectedLanguageIcon = computed(() => LANGUAGE_ICONS[selectedLanguage.value] ?? '🌐')

function handleOpenLanguageList(): void {
  isLanguageListVisible.value = true
}

/**
 * 返回＝取消这次挑选，回到卡片原本的答案。旧实现顺手把偏好改成「跟随系统」，而卡片的答案现在由
 * `selectedLanguage` 表示，所以这里不再动它。
 */
function handleCloseLanguageList(): void {
  isLanguageListVisible.value = false
}

async function handleSelectLanguage(lang: (typeof SUPPORTED_LANGUAGES)[number]): Promise<void> {
  selectedLanguage.value = lang.key
  const shouldFollowSystem = lang.key === systemLanguage.value
  followSystem.value = shouldFollowSystem

  await setFollowSystemLanguage(shouldFollowSystem)
  if (!shouldFollowSystem) {
    await switchLanguage(lang.key)
  }
}

/**
 * 让这一步用「它正在问的语言」显示。
 *
 * 首启在英文系统上，卡片答的是产品默认的简体中文；页面若还停在系统语言，屏幕就成了「英文文案 ＋
 * 中文答案」。从列表里挑语言本来就会立刻切换界面，这里只是把同一件事做在初值上。已经选过语言的
 * 用户重开向导时，初值与当前语言一致，不会触发。
 */
async function previewPendingLanguage(): Promise<void> {
  if (selectedLanguage.value === currentLanguage.value) {
    return
  }

  try {
    await switchLanguage(selectedLanguage.value)
  } catch (error) {
    languageSetupLog.error('Failed to preview the pending language', error)
  }
}

async function handleNext(): Promise<void> {
  await setFollowSystemLanguage(followSystem.value)

  if (selectedLanguage.value !== currentLanguage.value) {
    await switchLanguage(selectedLanguage.value)
  }

  step({
    comp: AccountDo
  })
}

function cleanupAudioRetryListeners(): void {
  if (!removeAudioRetryListeners) return
  removeAudioRetryListeners()
  removeAudioRetryListeners = null
}

function bindAudioRetryOnInteraction(): void {
  if (removeAudioRetryListeners) return

  const retryPlay = () => {
    void playStartupAudio(true)
  }

  window.addEventListener('pointerdown', retryPlay, { passive: true })
  window.addEventListener('keydown', retryPlay)
  removeAudioRetryListeners = () => {
    window.removeEventListener('pointerdown', retryPlay)
    window.removeEventListener('keydown', retryPlay)
  }
}

async function playStartupAudio(fromInteraction = false): Promise<void> {
  if (!startupAudio) return

  try {
    await startupAudio.play()
    cleanupAudioRetryListeners()
  } catch {
    if (!fromInteraction) {
      bindAudioRetryOnInteraction()
    }
  }
}

onMounted(() => {
  void previewPendingLanguage()
  startupAudio = new Audio(STARTUP_SOUND_URL)
  startupAudio.volume = 0.65
  startupAudio.preload = 'auto'
  void playStartupAudio()
})

onUnmounted(() => {
  cleanupAudioRetryListeners()
  if (!startupAudio) return
  startupAudio.pause()
  startupAudio.currentTime = 0
  startupAudio = null
})
</script>

<template>
  <div class="LanguageSetup max-w-md mx-auto">
    <div class="LanguageSetup-Header mb-12">
      <div class="LanguageSetup-Hello">
        <LottieFrame :loop="true" :data="HelloData" />
      </div>
      <p>{{ t('beginner.language.desc', { lang: selectedLanguageName }) }}</p>
    </div>

    <Transition name="LanguageSetup-Switch" mode="out-in">
      <TxCard
        v-if="!isLanguageListVisible"
        key="system-default"
        class="LanguageSetup-CurrentCard"
        variant="solid"
        background="mask"
        shadow="none"
        :radius="18"
        :padding="0"
      >
        <div class="LanguageSetup-CurrentMain w-full flex items-center gap-2 pr-4">
          <span class="LanguageSetup-LangAvatar">{{ selectedLanguageIcon }}</span>
          <div class="LanguageSetup-CurrentInfo">
            <strong>{{ selectedLanguageName }}</strong>
            <small v-if="followSystem">{{ t('beginner.language.systemTag') }}</small>
          </div>
          <div class="LanguageSetup-CurrentCheck ml-auto bg-brand-primary rounded-full">
            <div class="i-carbon-checkmark text-white" />
          </div>
        </div>
      </TxCard>

      <div v-else key="list-select" class="LanguageSetup-ListPanel w-full">
        <div class="LanguageSetup-ListHeader">
          <TxButton variant="bare" class="LanguageSetup-Back" @click="handleCloseLanguageList">
            <i class="i-ri-arrow-left-s-line" />
            <span>{{ t('layout.back') }}</span>
          </TxButton>
        </div>

        <div class="LanguageSetup-Options">
          <TxCard
            v-for="lang in SUPPORTED_LANGUAGES"
            :key="lang.key"
            variant="solid"
            background="mask"
            shadow="none"
            :radius="14"
            :padding="0"
            :clickable="true"
            class="LanguageSetup-OptionCard"
            :style="`${selectedLanguage === lang.key ? '--tx-border-color-light: var(--tx-color-primary)' : ''}`"
            role="button"
            tabindex="0"
            @click="handleSelectLanguage(lang)"
            @keydown.enter.prevent="handleSelectLanguage(lang)"
            @keydown.space.prevent="handleSelectLanguage(lang)"
          >
            <div class="LanguageSetup-OptionMain w-full">
              <span class="LanguageSetup-LangAvatar LanguageSetup-LangAvatar--small">
                {{ LANGUAGE_ICONS[lang.key] ?? '🌐' }}
              </span>
              <div class="LanguageSetup-OptionInfo">
                <span>{{ lang.name }}</span>
              </div>
              <div
                v-if="selectedLanguage === lang.key"
                class="LanguageSetup-OptionCheck ml-auto bg-brand-primary rounded-full"
              >
                <div class="i-carbon-checkmark text-white" />
              </div>
            </div>
          </TxCard>
        </div>
      </div>
    </Transition>

    <TxButton size="lg" variant="flat" type="primary" class="w-full" @click="handleNext">
      {{ t('beginner.language.next') }}
    </TxButton>

    <TxButton
      v-if="!isLanguageListVisible"
      variant="bare"
      class="LanguageSetup-Change"
      @click="handleOpenLanguageList"
    >
      <span>{{ t('beginner.language.changeLanguage') }}</span>
      <i class="i-ri-arrow-right-s-line" />
    </TxButton>
  </div>
</template>

<style scoped lang="scss">
.LanguageSetup-CurrentMain {
  border-radius: 16px;
  border: 1px solid var(--tx-color-primary);
}

.LanguageSetup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  height: 100%;

  &-Header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;

    p {
      margin: 0;
      font-size: 0.8rem;
      color: var(--tx-text-color-secondary);
    }
  }

  &-Hello {
    width: 230px;
    height: 128px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    :deep(.LottieFrame-Container) {
      width: 100%;
      height: 100%;
      transform: scale(2.15);
      transform-origin: center;
    }
  }

  &-CurrentInfo {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;

    strong {
      font-size: 0.9rem;
      line-height: 1.1;
    }

    small {
      font-size: 0.58rem;
      color: var(--tx-text-color-secondary);
    }
  }

  &-LangAvatar {
    width: 52px;
    height: 52px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    line-height: 1;
    flex: 0 0 auto;

    &--small {
      width: 34px;
      height: 34px;
      font-size: 1.05rem;
    }
  }

  &-ListPanel {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  &-ListHeader {
    display: flex;
    align-items: center;
  }

  &-Back {
    padding: 0.12rem 0.24rem;
    color: var(--tx-text-color-secondary);
    font-size: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;

    i {
      font-size: 1.1em;
    }
  }

  &-Options {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  &-OptionCard {
    padding: 0.6rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: all 0.2s ease;
  }

  &-OptionMain {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  &-OptionInfo {
    display: flex;
    flex-direction: column;
    gap: 0.08rem;

    span {
      font-size: 1rem;
      font-weight: 600;
    }

    small {
      font-size: 0.5rem;
      color: var(--tx-text-color-secondary);
    }
  }

  &-OptionCheck {
    font-size: 0.82rem;
    color: var(--tx-color-primary);
  }

  &-Change {
    padding: 0.12rem 0.2rem;
    color: var(--tx-text-color-secondary);
    font-size: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.16rem;
    transition: color 0.2s ease;

    &:hover {
      color: var(--tx-color-primary);
    }

    i {
      font-size: 1.05em;
    }
  }
}

.LanguageSetup-Switch-enter-active,
.LanguageSetup-Switch-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.LanguageSetup-Switch-enter-from,
.LanguageSetup-Switch-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.985);
}
</style>
