<script name="App" lang="ts" setup>
import AppLayout from '~/views/layout/AppLayout.vue'
import {
  applicationUpgrade,
  // clipBoardResolver,
  dropperResolver,
  urlHooker,
  usePlugin,
  usePlugins
} from '~/modules/hooks/application-hooks'
import { touchChannel } from '~/modules/channel/channel-core'
import Beginner from '~/views/base/begin/Beginner.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import AppEntrance from './AppEntrance.vue'

const packageJson = window.$nodeApi.getPackageJSON()

const [, pluginsScope] = usePlugins()
const pluginScope = usePlugin()

onBeforeUnmount(() => {
  pluginScope()
  ;(pluginsScope as any).stop()
})

const _init = ref(false)
const beginner = ref(false)

function init(): void {
  touchChannel.send('app-ready').then((res: any) => {
    window.$startupInfo = res

    document.body.classList.add(window.$startupInfo.platform)

    applicationUpgrade()
    // clipBoardResolver()
    dropperResolver()
    urlHooker()
    // screenCapture()
    useTouchSDK({ channel: touchChannel })

    _init.value = true

    if (!appSetting?.beginner?.init) beginner.value = true
  })
}

onMounted(() => {
  try {
    setTimeout(init, 100)
  } catch (e) {
    console.error('FATAL ERROR OCCURRED')
    console.error(e)
  }
})
</script>

<template>
  <AppEntrance>
    <AppLayout v-if="_init">
      <template #title>
        TalexTouch
        <span class="tag version fake-background">{{ packageJson.version }}</span>
      </template>
    </AppLayout>

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>
