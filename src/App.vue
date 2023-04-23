<template>
  <AppLayout />

  <FirstInit v-if="first" />

<!--  <video id="video" autoplay muted playsinline></video>-->
</template>

<script setup>
import AppLayout from '@comp/layout/AppLayout.vue'
import { onMounted, provide, ref, watch } from "vue";
import FirstInit from "~/first/FirstInit.vue";
import {
  applicationUpgrade,
  clipBoardResolver,
  dropperResolver
} from "@modules/hooks/applicatoin-hooks";
import { pluginManager } from "@modules/samples/node-api";
import { useRouter, useRoute } from "vue-router";

const route = useRoute()
const router = useRouter()

const activePlugin = ref("")
watch(() => activePlugin.value, val => {
  pluginManager.changeActivePlugin(val)

  if ( val ) router.push(`/plugin/view/${val}`)
})
watch(route, val => {
  const param = val.params?.name
  if ( !param ) activePlugin.value = ""
})

provide("activePlugin", activePlugin)

const first = ref(false)
provide('closeGuidance', () => first.value = false)

onMounted(() => {
  applicationUpgrade()
  clipBoardResolver()
  dropperResolver()
  // screenCapture()
})

document.onfocus = () => {
  first.value = window._firstInit
}
</script>

<style lang="scss">
#video {
  z-index: 10000;
  position: absolute;

  top: 0;
  left: 0;


}
</style>