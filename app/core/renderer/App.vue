<script name="App" setup>
import AppLayout from '@comp/base/AppLayout.vue'
import { provide, ref, watch } from 'vue'
import { pluginManager } from '@modules/channel/plugin-core/api'
import {
  applicationUpgrade, clipBoardResolver, dropperResolver, urlHooker,
} from '~/renderer/modules/hooks/application-hooks'

const activePlugin = ref('')
watch(() => activePlugin.value, val => pluginManager.changeActivePlugin(val), { immediate: true })

provide('activePlugin', activePlugin)

onMounted(() => {
  applicationUpgrade()
  clipBoardResolver()
  dropperResolver()
  urlHooker()
  // screenCapture()

  window.$startupInfo = touchChannel.sendSync('app-ready')
})
</script>

<template>
  <AppLayout />
</template>

<style lang="scss"></style>
