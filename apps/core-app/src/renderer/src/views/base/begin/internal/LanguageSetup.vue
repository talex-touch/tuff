<script setup lang="ts" name="LanguageSetup">
import type { SupportedLanguage } from '~/modules/lang'
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LANGUAGES, useLanguage } from '~/modules/lang'
import Greeting from './Greeting.vue'

type StepFunction = (call: { comp: any, rect?: { width: number, height: number } }) => void

const step = inject<StepFunction>('step')!
const { t } = useI18n()
const { currentLanguage, followSystemLanguage, switchLanguage, setFollowSystemLanguage, getSystemLanguage }
  = useLanguage()

const selectedLanguage = ref<SupportedLanguage>(currentLanguage.value)
const followSystem = ref<boolean>(followSystemLanguage.value)

const systemLanguage = computed(() => getSystemLanguage())
const systemLanguageName = computed(
  () => SUPPORTED_LANGUAGES.find(lang => lang.key === systemLanguage.value)?.name ?? systemLanguage.value,
)

watch(currentLanguage, (lang) => {
  if (!followSystem.value) {
    selectedLanguage.value = lang
  }
})

watch(followSystemLanguage, (value) => {
  followSystem.value = value
  if (value) {
    selectedLanguage.value = systemLanguage.value
  }
})

watch(followSystem, (value) => {
  if (value) {
    selectedLanguage.value = systemLanguage.value
  }
})

async function handleNext(): Promise<void> {
  await setFollowSystemLanguage(followSystem.value)

  if (!followSystem.value && selectedLanguage.value !== currentLanguage.value) {
    await switchLanguage(selectedLanguage.value)
  }

  step({
    comp: Greeting,
  })
}
</script>

<template>
  <div class="LanguageSetup">
    <div class="LanguageSetup-Header">
      <h1>{{ t('beginner.language.title') }}</h1>
      <p>{{ t('beginner.language.desc') }}</p>
    </div>

    <div class="LanguageSetup-System fake-background">
      <label class="LanguageSetup-SystemToggle">
        <input v-model="followSystem" type="checkbox">
        <span>{{ t('beginner.language.followSystem') }}</span>
      </label>
      <p class="LanguageSetup-SystemDetected">
        {{ t('beginner.language.systemDetected', { lang: systemLanguageName }) }}
      </p>
    </div>

    <div class="LanguageSetup-Options" :class="{ disabled: followSystem }">
      <button
        v-for="lang in SUPPORTED_LANGUAGES"
        :key="lang.key"
        :disabled="followSystem"
        :class="{ active: selectedLanguage === lang.key }"
        type="button"
        @click="selectedLanguage = lang.key"
      >
        <span>{{ lang.name }}</span>
        <small v-if="systemLanguage === lang.key">
          {{ t('beginner.language.systemTag') }}
        </small>
      </button>
    </div>

    <FlatButton class="LanguageSetup-Next" primary @click="handleNext">
      {{ t('beginner.language.next') }}
    </FlatButton>
  </div>
</template>

<style scoped lang="scss">
.LanguageSetup {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
  padding: 1rem;

  &-Header {
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
    }

    p {
      margin: 0;
      color: var(--el-text-color-secondary);
    }
  }

  &-System {
    padding: 1rem;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  &-SystemToggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;

    input {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
  }

  &-SystemDetected {
    margin: 0;
    font-size: 0.875rem;
    color: var(--el-text-color-secondary);
  }

  &-Options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;

    &.disabled {
      button {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    button {
      border: 1px solid var(--el-border-color);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      text-align: left;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      background: transparent;
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        border-color: var(--el-color-primary);
        color: var(--el-color-primary);
      }

      &.active {
        border-color: var(--el-color-primary);
        background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
      }

      small {
        font-size: 0.75rem;
        color: var(--el-color-primary);
      }
    }
  }

  &-Next {
    margin-top: auto;
    align-self: flex-end;
  }
}
</style>
