<template>
  <div class="FlatFooter">
    <FlatDownload />
    <FlatUserInfo />
  </div>
</template>

<script lang="ts" setup>
import FlatUserInfo from './FlatUserInfo.vue'
import FlatDownload from '~/components/download/FlatDownload.vue'
</script>

<style lang="scss" scoped>
.FlatFooter {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
</style>
