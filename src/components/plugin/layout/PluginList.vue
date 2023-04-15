<template>
  <el-scrollbar @scroll="onWheel" v-if="plugins" class="PluginList-Container">
    <div @click="select(index)" class="PluginList-Item fake-background"
         :class="{ target: index === target, dev: plugin.pluginInfo.pluginSubInfo?.dev?.enable }" v-for="(plugin, index) in Object.values(plugins)" :key="index" >
      <PluginIcon :icon="plugin.pluginInfo.icon" :alt="plugin.pluginInfo.name" />

      <div class="PluginList-Item-Main">
        <p>{{ plugin.pluginInfo.name }}</p>

        <p>{{ plugin.pluginInfo.description }}</p>
      </div>

<!--      {{plugin}}-->
    </div>
  </el-scrollbar>
</template>

<script>
export default {
  name: "PluginList",
}
</script>

<script setup>
import {TweenMax} from "gsap/gsap-core";
import {nextTick, onMounted, ref, watch} from "vue";
import PluginIcon from "@comp/plugin/PluginIcon.vue";

const props = defineProps(['plugins'])
const emits = defineEmits(['select'])
const target = ref(-1)

watch(() => target.value, () => emits('select', Object.keys(props.plugins)[target.value]))

function select(index) {
  if ( target.value === index ) return
  // 获取el-scrollbar元素和滚动容器元素
  const scrollbarEl = document.querySelector('.el-scrollbar__bar');
  const scrollContainerEl = document.querySelector('.el-scrollbar__wrap');

// 计算目标滚动位置（例如：向下滚动100px）
  const targetElements = document.querySelectorAll('.PluginList-Item')[index];
  const rect = targetElements.getBoundingClientRect();
  const targetScrollTop = rect.y + rect.height + 10//scrollContainerEl.scrollTop + 100;

// 使用TweenMax对象创建一个Tween动画
  TweenMax.to(scrollContainerEl, 1, {
    scrollTop: targetScrollTop, // 目标滚动位置
    ease: "ease-adopters-out" // 缓动函数（先加速后减速）
  });

// 使用TweenMax对象创建一个Tween动画，滚动条动画
  TweenMax.to(scrollbarEl, 1, {
    top: targetScrollTop / (scrollContainerEl.scrollHeight - scrollContainerEl.clientHeight) * 100 + '%',
    ease: "ease-adopters-out"
  });
}

function onWheel() {
  const baseY = 100
  const container = document.querySelector('.PluginList-Container')

  const rect = container.getBoundingClientRect()
  const height = rect.height

  const items = document.querySelectorAll('.PluginList-Item')

  items.forEach((item, index) => {
    const rect = item.getBoundingClientRect()

    const offsetY = rect.y - baseY + 10

    const scale = (1 - Math.abs(offsetY) / height)

    // if ( scale >= 9 ) item.classList.add('target')
    // else item.classList.remove('target')
    if ( scale >= 0.9 )  target.value = index

    item.style.transform = `scale(${scale})`
  })
}

onMounted(() => nextTick(onWheel))
</script>

<style lang="scss" scoped>
.PluginList-Item {
  .PluginList-Item-Main {
    margin-left: 15px;
    & :first-child {
      margin: 0;

      font-weight: 600;
      font-size: 20px;
    }
    & :last-child {
      margin: 0;

      font-size: 14px;
      color: var(--el-text-color-secondary);
    }
    display: flex;
    height: 60%;

    flex-direction: column;
    justify-content: space-between;
  }
  :deep(.PluginIcon-Container) {
    display: flex;

    justify-content: center;
    align-items: center;

    grid-column: 1;
    grid-row: 1 / 3;

    width: 64px;
    height: 64px;

    font-size: 48px;

    border-radius: 50%;
    box-sizing: border-box;
    background-color: var(--el-fill-color);
  }
  &.target {
    box-shadow: 0 0 8px 4px var(--el-fill-color-dark);
  }
  &.dev {
    &:after {
      // linear image
      content: "";
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;
      background: linear-gradient(45deg, rgba(254, 159, 14, 0.1) 25%, transparent 25%, transparent 50%, rgba(254, 159, 14, 0.2) 50%, rgba(254, 159, 14, 0.1) 75%, transparent 75%, transparent);
    }
  }
  display: flex;
  padding: 0 20px;

  align-items: center;

  height: 100px;
  margin: 10px 0;

  cursor: pointer;
  border-radius: 5px;

  overflow: hidden;
  transition: .05s;
}

.PluginList-Container {
  :deep(.el-scrollbar__view) {
    margin-top: 15%;
    margin-bottom: 130%;
  }
  position: relative;
  padding: 0 10px;

  min-width: 300px;
  width: 35%;

  box-sizing: border-box;
}
</style>