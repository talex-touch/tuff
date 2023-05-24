<template>
  <AppLayout />
</template>

<script name="App" setup>
import AppLayout from '@comp/base/AppLayout.vue'
import { provide, ref, watch } from "vue";
import {
  applicationUpgrade,
  clipBoardResolver,
  dropperResolver
} from "@modules/hooks/applicatoin-hooks";
import { pluginManager } from '@modules/channel/plugin-core/api'

const activePlugin = ref("")
watch(() => activePlugin.value, pluginManager.changeActivePlugin, { immediate: true })

provide("activePlugin", activePlugin)

onMounted(() => {
  applicationUpgrade()
  clipBoardResolver()
  dropperResolver()
  // screenCapture()
})

</script>

<style lang="scss"></style>