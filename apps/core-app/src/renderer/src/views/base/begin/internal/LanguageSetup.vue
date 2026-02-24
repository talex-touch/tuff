<script setup lang="ts" name="LanguageSetup">
import type { Component } from 'vue'
import type { SupportedLanguage } from '~/modules/lang'
import { TxButton, TxCard } from '@talex-touch/tuffex'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HelloData from '~/assets/lotties/hello.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { SUPPORTED_LANGUAGES, useLanguage } from '~/modules/lang'
import AccountDo from './AccountDo.vue'

type StepFunction = (call: { comp: Component; rect?: { width: number; height: number } }) => void

const step = inject<StepFunction>('step')!
const { t } = useI18n()
const { currentLanguage, switchLanguage, setFollowSystemLanguage, getSystemLanguage } =
  useLanguage()

const isLanguageListVisible = ref(false)
const followSystem = ref(true)
const selectedLanguage = ref<SupportedLanguage>(getSystemLanguage())
let startupAudio: HTMLAudioElement | null = null
const LANGUAGE_ICONS: Record<SupportedLanguage, string> = {
  'zh-CN': '🇨🇳',
  'en-US': '🇺🇸'
}

const systemLanguage = computed(() => getSystemLanguage())
const systemLanguageName = computed(
  () =>
    SUPPORTED_LANGUAGES.find((lang) => lang.key === systemLanguage.value)?.name ??
    systemLanguage.value
)
const systemLanguageIcon = computed(() => LANGUAGE_ICONS[systemLanguage.value] ?? '🌐')
const selectedLanguageName = computed(
  () =>
    SUPPORTED_LANGUAGES.find((lang) => lang.key === selectedLanguage.value)?.name ??
    selectedLanguage.value
)

function handleOpenLanguageList(): void {
  isLanguageListVisible.value = true
}

function handleBackToDefault(): void {
  isLanguageListVisible.value = false
}

function handleSelectLanguage(lang: (typeof SUPPORTED_LANGUAGES)[number]): void {
  selectedLanguage.value = lang.key
  followSystem.value = lang.key === systemLanguage.value
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

onMounted(() => {
  startupAudio = new Audio('/sound/startup.m4a')
  startupAudio.volume = 0.45
  startupAudio.preload = 'auto'
  void startupAudio.play().catch(() => {})
})

onUnmounted(() => {
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
          <span class="LanguageSetup-LangAvatar">{{ systemLanguageIcon }}</span>
          <div class="LanguageSetup-CurrentInfo">
            <strong>{{ systemLanguageName }}</strong>
            <small>{{ t('beginner.language.systemTag') }}</small>
          </div>
          <div class="LanguageSetup-CurrentCheck ml-auto i-carbon-checkmark" />
        </div>
      </TxCard>

      <div v-else key="list-select" class="LanguageSetup-ListPanel w-full">
        <div class="LanguageSetup-ListHeader">
          <TxButton variant="bare" class="LanguageSetup-Back" @click="handleBackToDefault">
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
            :class="{ active: selectedLanguage === lang.key }"
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
                class="LanguageSetup-OptionCheck ml-auto i-carbon-checkmark"
              />
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
    background: color-mix(in srgb, var(--tx-bg-color-card, #fff) 92%, transparent);
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
    box-shadow: inset 0 0 0 1px var(--tx-border-color);
    transition: all 0.2s ease;

    &:hover {
      box-shadow: inset 0 0 0 1px var(--tx-color-primary);
    }

    &.active {
      box-shadow: inset 0 0 0 1px var(--tx-color-primary);
      background-color: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
    }
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
