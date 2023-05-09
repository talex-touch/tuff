<template>
  <AppLayout />

  <FirstInit v-if="first" />

<!--  <video id="video" autoplay muted playsinline></video>-->
</template>

<script name="App" setup>
import AppLayout from '@comp/base/AppLayout.vue'
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
watch(() => activePlugin.value, pluginManager.changeActivePlugin, { immediate: true })

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