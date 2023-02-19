<template>
  <div class="AlsoShare-Container">
    <div class="AlsoShare-Content">
      <device-figure />
    </div>

  </div>
</template>

<script>
export default {
  name: "AlsoShare"
}
</script>

<script setup>
import TvTabs from '@comp/tabs/vertical/TvTabs.vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import TvTabItemGroup from '@comp/tabs/vertical/TvTabItemGroup.vue'
import { reactive, ref, unref, watch } from 'vue'
import DeviceFigure from '@comp/device/DeviceFigure.vue'

const activeNodes = ref("")
</script>

<style lang="scss" scoped>
.AlsoShare-Content {
  position: relative;

  width: 100%;
  height: 40%;

  border-radius: 8px;
  background-color: #fff;
}

.AlsoShare-Container {
  position: relative;

  width: 100%;
  height: 100%;
}
</style>