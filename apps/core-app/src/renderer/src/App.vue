<script name="App" lang="ts" setup>
import AppLayout from '~/views/layout/AppLayout.vue'
import { useDropperResolver } from '~/modules/hooks/dropper-resolver'
// urlHooker,
// clipBoardResolver,
import Beginner from '~/views/base/begin/Beginner.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { isCoreBox } from '@talex-touch/utils/renderer'
import AppEntrance from './AppEntrance.vue'
import BuildSecurityBanner from '@comp/base/BuildSecurityBanner.vue'
import { useI18n } from 'vue-i18n'
import { useLanguage } from '~/modules/lang'

const { t } = useI18n()
const { initializeLanguage } = useLanguage()

const packageJson = window.$nodeApi.getPackageJSON()

const beginner = ref(false)

async function init(): Promise<void> {
  if (isCoreBox()) {
    return
  }

  try {
    await initializeLanguage()
  } catch (error) {
    console.error('[App] Failed to initialize language:', error)
  }

  // clipBoardResolver()
  // urlHooker()
  // screenCapture()
  useDropperResolver()

  if (!appSetting?.beginner?.init) beginner.value = true
}
</script>

<template>
  <AppEntrance :on-ready="init">
    <BuildSecurityBanner />
    <AppLayout>
      <template #title>
        <span text-sm>{{ t('app.title') }}</span>
        <span
          style="--fake-radius: 4px"
          class="px-[3px] py-[1px] rounded-md text-xs version fake-background"
          >{{ packageJson.version }}</span
        >
      </template>
    </AppLayout>

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>
