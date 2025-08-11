<script name="App" lang="ts" setup>
import AppLayout from '~/views/layout/AppLayout.vue'
import {} from // applicationUpgrade,
// clipBoardResolver,
// dropperResolver,
// urlHooker,
'~/modules/hooks/application-hooks'
import Beginner from '~/views/base/begin/Beginner.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { isCoreBox } from '@talex-touch/utils/renderer'
import AppEntrance from './AppEntrance.vue'

const packageJson = window.$nodeApi.getPackageJSON()

const beginner = ref(false)

async function init(): Promise<void> {
  if (isCoreBox()) {
    return
  }

  // applicationUpgrade()
  // clipBoardResolver()
  // dropperResolver()
  // urlHooker()
  // screenCapture()

  if (!appSetting?.beginner?.init) beginner.value = true
}
</script>

<template>
  <AppEntrance :on-ready="init">
    <AppLayout>
      <template #title>
        TalexTouch
        <span class="tag version fake-background">{{ packageJson.version }}</span>
      </template>
    </AppLayout>

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>
