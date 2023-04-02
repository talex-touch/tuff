<template>
  <NavBar />

  <FirstInit v-if="first" />
</template>

<script setup>
import NavBar from '@comp/layout/NavBar.vue'
import {onMounted, ref, watch} from "vue";
import FirstInit from "~/first/FirstInit.vue";
import {clipBoardResolver} from "@modules/hooks/applicatoin-hooks";

const first = ref(false)

watch(() => window._firstInit, (value) => {
  first.value = value
})

onMounted(() => clipBoardResolver())
</script>

<style lang="scss">

</style>