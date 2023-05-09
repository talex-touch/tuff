<template>
  <div class="Plugin-Container">
    <PluginList @select="selectPlugin" :plugins="plugins" />

    <div class="Plugin-Info" ref="pluginInfoRef">
      <PluginInfo v-if="select" :plugin="select" />

      <div class="Plugin-Empty" v-else>
        <div class="Plugin-EmptyBox">
          <el-skeleton style="width: 240px" animated>
            <template #template>
              <div style="padding: 14px">
                <el-skeleton-item variant="p" style="width: 40%" />
                <el-skeleton-item variant="text" style="width: 70%" />
              </div>
            </template>
          </el-skeleton>
        </div>
        <div class="Plugin-EmptyBubble" :style="`--d: ${i * 2 + 1}s`" v-for="i in 5" />

        <div class="Plugin-Mention">
          <p>Start by installing or selecting a plugin</p>
          <span>
          Installing a plugin makes working with your favorite tools even easier. Share your work with your personal cloud, and find out what other developers are using.
          Just click the button below to get started.
        </span>
          <FlatButton @click="() => $router.push('/market')">
            Install a plugin
          </FlatButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script name="Plugin" setup>
import { ref, inject, computed, onMounted } from 'vue'
import PluginInfo from '@comp/plugin/PluginInfo.vue'
import { sleep } from '@modules/utils'
import PluginList from "@comp/plugin/layout/PluginList.vue";
import FlatButton from "@comp/base/button/FlatButton.vue";

const _plugins = inject('plugins')
const plugins = computed(() => _plugins())
const pluginInfoRef = ref()
const select = ref()

watch(plugins, val => {
  console.log('plugins', val)
})

async function selectPlugin(index) {
  if( index === select.value ) return

  const style = pluginInfoRef.value.style

  style.opacity = '0'
  style.transform = 'translateX(100%) perspective(100px) rotateY(10deg) scale(.85)'

  await sleep(100)

  select.value = null

  await sleep(50)

  select.value = index

  await sleep(100)

  style.transform = 'translateX(0) perspective(100px) rotateY(0deg) scale(1)'
  style.opacity = '1'

}
</script>

<style lang="scss" scoped>
.Plugin-EmptyBox {
  &:before {
    content: '';
    position: absolute;

    bottom: 20%;
    right: 5%;

    width: 32px;
    height: 32px;

    border-radius: 50%;
    filter: blur(3px) saturate(1.25) contrast(1.125);
    background-image: linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%);
  }
  &:after {
    content: '';
    position: absolute;

    bottom: 20%;
    right: 12%;

    width: 32px;
    height: 32px;

    border-radius: 50%;
    filter: blur(3px) saturate(1.25) contrast(1.125);
    background-image: linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%);
  }
  position: absolute;

  top: 35%;
  left: 50%;

  width: 280px;
  height: 70px;

  transform: translate(-50%, -50%);
  background-color: var(--el-fill-color-extra-lighter);
  border-radius: 8px;
  backdrop-filter: blur(2px) brightness(1.05);
  box-shadow: 0 0 8px #00000011;
  border: 2px solid var(--el-border-color);
}
.Plugin-Mention {
  position: absolute;

  top: 55%;
  left: 50%;

  width: 420px;
  height: 70px;

  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--el-text-color-light);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;

  & > p {
    margin-bottom: 8px;
    color: var(--el-text-color-lighter);
    font-size: 16px;
    font-weight: 600;
  }
  & > span {
    display: block;
    margin-bottom: 16px;
    color: var(--el-text-color-lighter);
    font-size: 14px;
    font-weight: 500;
  }
  & > button {
    margin: 0 auto;
  }

  :deep(.FlatButton-Container) {
    width: 50%;
    left: 50%;

    transform: translateX(-50%);
  }
}
.Plugin-Empty {
  & .Plugin-EmptyBubble:nth-child(2) {
    left: 22%;
    top: 35%;

    transform: translate(-50%, -50%) scale(.45) skewX(5deg);
  }
  & .Plugin-EmptyBubble:nth-child(3) {
    left: 72%;
    top: 27%;

    transform: translate(-50%, -50%) scale(.15) skewX(5deg);
  }
  & .Plugin-EmptyBubble:nth-child(4) {
    left: 75%;
    top: 45%;

    transform: translate(-50%, -50%) scale(.35) skewX(12deg);
  }
  & .Plugin-EmptyBubble:nth-child(5) {
    left: 35%;
    top: 45%;

    transform: translate(-50%, -50%) scale(.5) skewX(4deg);
  }

  & .Plugin-EmptyBubble:nth-child(6) {
    left: 45%;
    top: 25%;

    transform: translate(-50%, -50%) scale(.25) skewX(16deg);
  }
  .Plugin-EmptyBubble {
    z-index: -1;
    position: absolute;

    width: 48px;
    height: 48px;

    border-radius: 6px;
    background-color: var(--el-fill-color-light);
    filter: opacity(.5) brightness(120%);
    box-shadow: 0 0 8px #00000011;
    transform: translate(-50%, -50%);

    animation: bubble 8s ease-in-out var(--d) infinite;
  }
}

@keyframes bubble {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(.25) skewX(16deg);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(.5) skewX(4deg);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(.75) skewX(16deg);
  }
}

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