<template>
  <AppLayout>
    <template #view>
      <keep-alive>
        <router-view></router-view>
      </keep-alive>
    </template>
  </AppLayout>

  <FirstInit v-if="first" />
</template>

<script setup>
import AppLayout from '@comp/layout/AppLayout.vue'
import { h, onMounted, provide, ref, watch } from "vue";
import FirstInit from "~/first/FirstInit.vue";
import { applicationUpgrade, clipBoardResolver, dropperResolver } from "@modules/hooks/applicatoin-hooks";
import { pluginManager } from "@modules/samples/node-api";
import { useRouter } from "vue-router";

const router = useRouter()

const activePlugin = ref("")
watch(() => activePlugin.value, val => {
  pluginManager.changeActivePlugin(val)

  if ( val ) router.push(`/plugin/view/${val}`)
})

provide("activePlugin", activePlugin)

const first = ref(false)
provide('closeGuidance', () => first.value = false)

onMounted(() => {
  applicationUpgrade()
  clipBoardResolver()
  dropperResolver()

  if (window._firstInit) {
    first.value = true
  }
})
</script>

<style lang="scss">

</style>