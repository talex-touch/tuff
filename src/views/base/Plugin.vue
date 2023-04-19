<template>
  <div class="Plugin-Container">
    <PluginList @select="selectPlugin" :plugins="plugins" />

    <div class="Plugin-Info" ref="pluginInfoRef">
<!--      <PluginCard v-if="plugins && plugins[select]" :plugin="plugins[select]" />-->
      <PluginInfo v-if="plugins && plugins[select]" :plugin="plugins[select]" />

      <EmptyAnimate v-else />
    </div>

<!--    <div class="Plugin-Core">-->
<!--      <template v-if="plugins && plugins[select]">-->
<!---->
<!--        <PluginIcon :icon="plugins[select].pluginInfo.icon" :alt="plugins[select].pluginInfo.name" />-->
<!--      </template>-->
<!--    </div>-->
  </div>
</template>

<script>
export default {
  name: "Plugin"
}
</script>

<script setup>
import { ref, inject, onMounted } from 'vue'
import PluginInfo from '@comp/plugin/PluginInfo.vue'
import { sleep } from '@modules/utils'
import EmptyAnimate from '@comp/base/EmptyAnimate.vue'
import PluginList from "@comp/plugin/layout/PluginList.vue";

const plugins = ref()
const pluginInfoRef = ref()
const select = ref()

onMounted(() => {
  const [_plugins, cb] = inject('plugins')()

  plugins.value = [ ..._plugins ]
  cb((val) => {
    plugins.value = [ ...val ]
  })

})

async function selectPlugin(index) {
  if( index === select.value ) return

  const style = pluginInfoRef.value.style

  style.opacity = '0'
  style.transform = 'translateX(100%) scale(.85)'

  await sleep(100)

  select.value = null

  await sleep(100)

  select.value = index

  await sleep(100)

  style.transform = 'translateX(0) scale(1)'
  style.opacity = '1'

}
</script>

<style lang="scss" scoped>
//@keyframes waving {
//  0% {
//    transform: translate(-50%, -50%) scale(.8);
//    opacity: .5;
//  }
//  50% {
//    transform: translate(-50%, -50%) scale(1.3);
//    opacity: .25;
//  }
//  100% {
//    transform: translate(-50%, -50%) scale(0);
//    opacity: 0;
//  }
//}
//
//@keyframes waving-2 {
//  0% {
//    transform: translate(-50%, -50%) scale(.8);
//    opacity: .5;
//  }
//  100% {
//    transform: translate(-50%, -50%) scale(1.75);
//    opacity: 0;
//  }
//}
//
//@keyframes coloring {
//  0%, 100% {
//    background: var(--el-fill-color-light);
//  }
//  50% {
//    background: var(--el-fill-color-dark);
//  }
//}
//
//@keyframes coloring-2 {
//  0%, 100% {
//    background: var(--el-color-primary-light-9);
//  }
//  50% {
//    background: var(--el-color-primary-light-7);
//  }
//}
//.Plugin-Core {
//  &:has(.PluginIcon-Container) {
//    //top: 30px;
//    &:before {
//      animation: waving-2 1.5s infinite;
//    }
//    &:after {
//      animation: coloring-2 1.5s infinite;
//    }
//  }
//  :deep(.PluginIcon-Container) {
//    position: absolute;
//
//    top: 50%;
//
//    width: 48px;
//    height: 48px;
//
//    right: -5px;
//    font-size: 48px;
//
//    //mix-blend-mode: overlay;
//    //-webkit-mask: -webkit-gradient(linear, 45% 45%, 55% 55%, from(rgba(0,0,0,1)), to(rgba(0,0,0,0)));
//
//    transform: translate(-50%, -50%);
//  }
//  &:before, &:after {
//    z-index: -1;
//    content: '';
//    position: absolute;
//
//    left: 50%;
//    top: 50%;
//
//    width: 100%;
//    height: 100%;
//    border-radius: 50%;
//
//    background: var(--el-fill-color-light);
//    transform: translate(-50%, -50%);
//
//    animation: waving 2.5s infinite;
//    //box-shadow: 0 0 2px 2px var(--el-fill-color), 0 0 16px 4px var(--el-fill-color-lighter);
//  }
//  &:after {
//    opacity: .5;
//
//    transform: translate(-50%, -50%) scale(1.1);
//
//    animation: coloring 2.5s infinite;
//  }
//  position: absolute;
//
//  left: 0;
//  top: 50%;
//
//  width: 148px;
//  height: 148px;
//
//  background: var(--el-fill-color-light);
//  //box-shadow:
//  //    0 0 2px 2px var(--el-fill-color),
//  //    0 0 16px 4px var(--el-fill-color-lighter)
//  //  ;
//  border-radius: 50%;
//  transform: translate(-50%, -50%);
//  transition: transform .25s;
//}

.Plugin-Container {
  position: relative;
  display: flex;

  width: 100%;
  height: 100%;
}

.Plugin-Info {
  &:after {
    z-index: -1;
    content: "";
    position: absolute;

    right: 0;
    top: 0;

    width: 100%;
    height: 500%;

    background-image:
        radial-gradient(circle at top right, rgba(94, 74, 176, 0.2) 50%, transparent 60%),
        radial-gradient(circle at top right, var(--el-color-primary-light-5) 10%, transparent 80%),
        radial-gradient(circle at top right, rgba(94, 74, 176, 0.8) 20%,  rgba(94, 74, 176, 0) 100%),
  ;
    background-position:
        top right,
        top right,
        top right;
    background-size:
        60% 25%,
        80% 30%,
        100% 25%;
    background-repeat: no-repeat;

    opacity: .25;
    filter: blur(18px) saturate(100%) brightness(120%);
  }
  position: relative;

  top: 0;
  right: 0;

  flex: 1;
  height: 100%;
  overflow: hidden;
  //background-color: var(--el-fill-color-light);
  transition: all .25s ease-in-out;

}
</style>