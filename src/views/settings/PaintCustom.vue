<template>
  <div class="PaintCustom-Container">
    <tv-tabs v-model="activeNodes">
      <tv-tab-item-group name="控制栏">
        <tv-tab-item icon="finder" name="MacOS">
          <MacOSController :close-window="fakeFunc" :minimize-window="fakeFunc" />
        </tv-tab-item>
        <tv-tab-item icon="windows" name="Windows">
          <WindowsController :close-window="fakeFunc" :minimize-window="fakeFunc" />
        </tv-tab-item>
      </tv-tab-item-group>
      <tv-tab-item-group name="侧边栏">
        <tv-tab-item icon="leaf" name="轻盈">GOOD,TOUCH</tv-tab-item>
        <tv-tab-item icon="plant" name="丰富" disabled>GOOD,TOUCH</tv-tab-item>
        <tv-tab-item icon="blaze" name="效果" disabled></tv-tab-item>
      </tv-tab-item-group>
      <tv-tab-item-group name="图标栏">
        <tv-tab-item icon="exchange" name="跟随插件" disabled>THIS,HUGE</tv-tab-item>
        <tv-tab-item icon="remixicon" name="固定图标">THIS,HUGE</tv-tab-item>
      </tv-tab-item-group>
      <tv-tab-item icon="more" name="更多设置">MORE, SETTING</tv-tab-item>
    </tv-tabs>
  </div>
</template>

<script>
export default {
  name: "PaintCustom"
}
</script>

<script setup>
import TvTabs from '@comp/tabs/vertical/TvTabs.vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import TvTabItemGroup from '@comp/tabs/vertical/TvTabItemGroup.vue'
import { reactive, ref, unref, watch } from 'vue'
import MacOSController from '@comp/customize/controller/MacOSController.vue'
import WindowsController from '@comp/customize/controller/WindowsController.vue'

const activeNodes = ref(window.$storage.paintCustom)

watch(() => activeNodes.value, () => {
  Object.assign(window.$storage.paintCustom, activeNodes.value)
})

function fakeFunc() {}

</script>

<style lang="scss" scoped>
.PaintCustom-Container {
  position: relative;

  width: 100%;
  height: 100%;
}
</style>