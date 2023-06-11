<template>
  <AppLayout />
</template>

<script name="App" setup>
import AppLayout from '@comp/base/AppLayout.vue'
import { provide, ref, watch } from "vue";
import {
  applicationUpgrade,
  clipBoardResolver,
  dropperResolver,
  urlHooker
} from "@modules/hooks/applicatoin-hooks";
import { pluginManager } from '@modules/channel/plugin-core/api'
import { touchChannel } from './modules/channel/channel-core';

const activePlugin = ref("")
watch(() => activePlugin.value, val => pluginManager.changeActivePlugin(val), { immediate: true })

provide("activePlugin", activePlugin)

onMounted(() => {
  applicationUpgrade()
  clipBoardResolver()
  dropperResolver()
  urlHooker()
  // screenCapture()

  const res = touchChannel.sendSync('app-ready')

  console.log( res )
})

</script>

<style lang="scss"></style>