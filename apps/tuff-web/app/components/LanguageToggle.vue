<script setup lang="ts">
import { computed, ref } from 'vue'
import HeaderIconButton from '~/components/HeaderIconButton.vue'
import { useLazyDropdownMenu } from '~/composables/useLazyMenu'
import { persistLocalePreference, toLocalizedWebPath, type SupportedLocale } from '~/utils/web-route'

const triggerRef = ref<InstanceType<typeof HeaderIconButton> | null>(null)
const {
  isOpen,
  menuActivated,
  activateMenu,
  TxDropdownMenu,
  TxDropdownItem,
} = useLazyDropdownMenu(triggerRef)

interface LanguageOption {
  code: SupportedLocale
  label: string
}

const languageOptions: LanguageOption[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
]

const { locale, t } = useI18n()
const route = useRoute()

const nextLocale = computed(() => (locale.value === 'zh' ? 'en' : 'zh'))
const triggerAriaLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.switchToZh' : 'ui.languageToggle.switchToEn'),
)
const triggerTitle = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.zhLabel' : 'ui.languageToggle.enLabel'),
)

async function selectLocale(option: LanguageOption) {
  persistLocalePreference(option.code, true)
  isOpen.value = false
  const targetPath = toLocalizedWebPath(route.path, option.code)
  if (targetPath !== route.path) {
    await navigateTo({
      path: targetPath,
      query: route.query,
      hash: route.hash,
    })
  }
  else {
    locale.value = option.code
  }
}
</script>

<template>
  <div class="LanguageToggle">
    <TxDropdownMenu
      v-if="menuActivated"
      v-model="isOpen"
      trigger="hover"
      placement="bottom-end"
      :offset="10"
    >
      <template #trigger>
        <HeaderIconButton
          ref="triggerRef"
          icon="i-carbon-language"
          :label="triggerAriaLabel"
          :title="triggerTitle"
          class="LanguageToggle-Trigger"
          aria-haspopup="menu"
          :aria-expanded="isOpen"
        />
      </template>

      <TxDropdownItem
        v-for="option in languageOptions"
        :key="option.code"
        role="menuitemradio"
        :aria-checked="locale === option.code"
        @select="selectLocale(option)"
      >
        {{ option.label }}

        <template v-if="locale === option.code" #right>
          <span class="i-carbon-checkmark LanguageToggle-Check" aria-hidden="true" />
        </template>
      </TxDropdownItem>
    </TxDropdownMenu>
    <HeaderIconButton
      v-else
      ref="triggerRef"
      icon="i-carbon-language"
      :label="triggerAriaLabel"
      :title="triggerTitle"
      class="LanguageToggle-Trigger"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      @pointerenter="activateMenu()"
      @focus="activateMenu()"
      @click="activateMenu(true)"
    />
  </div>
</template>

<style scoped>
.LanguageToggle {
  display: inline-flex;
  align-items: center;
}

.LanguageToggle-Check {
  font-size: 0.95rem;
  opacity: 0.85;
}
</style>
