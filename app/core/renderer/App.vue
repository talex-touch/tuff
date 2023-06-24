<script name="App" setup>
import AppLayout from '~/views/layout/AppLayout.vue'
import {
  applicationUpgrade, clipBoardResolver, dropperResolver, urlHooker, usePlugin, usePlugins
} from '@modules/hooks/application-hooks'
import { touchChannel } from '@modules/channel/channel-core'

const packageJson = window.$nodeApi.getPackageJSON()

const [, pluginsScope] = usePlugins()
const pluginScope = usePlugin()

onBeforeUnmount(() => {
  pluginScope()

  pluginsScope.stop()
})

onMounted(() => {
  applicationUpgrade()
  // clipBoardResolver()
  dropperResolver()
  urlHooker()
  // screenCapture()

  window.$startupInfo = touchChannel.sendSync('app-ready')
})
</script>

<template>
  <AppLayout>
    <template #title>
      TalexTouch <span class="tag version fake-background">{{ packageJson.version }}</span>
    </template>
  </AppLayout>
</template>

<style lang="scss"></style>
