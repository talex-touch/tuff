<script name="App" lang="ts" setup>
import AppLayout from '~/views/layout/AppLayout.vue'
import { useDropperResolver } from '~/modules/hooks/dropper-resolver'
// urlHooker,
// clipBoardResolver,
import Beginner from '~/views/base/begin/Beginner.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { isCoreBox } from '@talex-touch/utils/renderer'
import AppEntrance from './AppEntrance.vue'
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

  await initializeLanguage()

  // clipBoardResolver()
  // urlHooker()
  // screenCapture()
  useDropperResolver()

  if (!appSetting?.beginner?.init) beginner.value = true
}
</script>

<template>
  <AppEntrance :on-ready="init">
    <AppLayout>
      <template #title>
        {{ t('app.title') }}
        <span class="tag version fake-background">{{ packageJson.version }}</span>
      </template>
    </AppLayout>

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>
