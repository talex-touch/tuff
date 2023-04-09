<template>
  <AppLayout>
    <template #view>
      <keep-alive>
        <router-view></router-view>
      </keep-alive>

      <!--      <teleport to=".AppLayout-View">-->
      <div class="Blur-Container fake-background" :class="{ blur: options.blur, display: activePlugin?.length }">
        <PluginView />
      </div>
      <!--      </teleport>-->
    </template>
  </AppLayout>

  <FirstInit v-if="first" />
</template>

<script setup>
import AppLayout from '@comp/layout/AppLayout.vue'
import { onMounted, provide, ref, watch } from "vue";
import FirstInit from "~/first/FirstInit.vue";
import { clipBoardResolver } from "@modules/hooks/applicatoin-hooks";
import PluginView from "@comp/plugin/PluginView.vue";
import { pluginManager } from "@modules/samples/node-api";

const options = window.$storage.themeStyle
const paintCustom = window.$storage.paintCustom

const activePlugin = ref("")
watch(() => activePlugin.value, val => pluginManager.changeActivePlugin(val))

provide("activePlugin", activePlugin)

const first = ref(false)

onMounted(() => {
  clipBoardResolver()

  if (window._firstInit) {
    first.value = true
  }
})
</script>

<style lang="scss">

</style>