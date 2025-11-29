<script lang="ts" setup>
import TuffUserInfo from '~/components/base/TuffUserInfo.vue'
import FlatDownload from '~/components/download/FlatDownload.vue'
</script>

<template>
  <div class="LayoutFooter">
    <FlatDownload />
    <TuffUserInfo />
  </div>
</template>

<style lang="scss" scoped>
.LayoutFooter {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
</style>
