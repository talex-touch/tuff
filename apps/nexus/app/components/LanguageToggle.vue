<script setup lang="ts">
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxIconButton } from '@talex-touch/tuffex/button'
import { computed, ref } from 'vue'
import { toLocalizedDocsPath } from '#shared/utils/docs-path'

type SupportedLocale = 'zh' | 'en'

interface LanguageOption {
  /**
   * Only locales that actually resolve belong here. The menu previously also
   * listed fr/ru/ja/vi, which `selectLocale` silently dropped — there are no
   * such locale bundles (`i18n/locales/` has en and zh only), so those rows
   * looked selectable, announced themselves as `menuitemradio` options to a
   * screen reader, and did nothing when clicked.
   */
  code: SupportedLocale
  label: string
}

const languageOptions: LanguageOption[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
]

const { locale, t } = useI18n()
const { setManualLocale } = useLocaleOrchestrator()
const route = useRoute()
const isOpen = ref(false)

const nextLocale = computed(() => (locale.value === 'zh' ? 'en' : 'zh'))
const triggerAriaLabel = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.switchToZh' : 'ui.languageToggle.switchToEn'),
)
const triggerTitle = computed(() =>
  t(nextLocale.value === 'zh' ? 'ui.languageToggle.zhLabel' : 'ui.languageToggle.enLabel'),
)

async function selectLocale(option: LanguageOption) {
  if (/^\/(?:en|zh)\/docs(?:\/|$)/.test(route.path)) {
    await navigateTo({
      path: toLocalizedDocsPath(route.path, option.code),
      query: route.query,
      hash: route.hash,
    })
  }
  await setManualLocale(option.code)
  isOpen.value = false
}

</script>

<template>
  <div class="LanguageToggle">
    <TxDropdownMenu
      v-model="isOpen"
      trigger="hover"
      placement="bottom-end"
      :offset="10"
    >
      <template #trigger>
        <TxIconButton
          icon="i-carbon-language"
          :label="triggerAriaLabel"
          :title="triggerTitle"
          size="sm"
          shape="circle"
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
