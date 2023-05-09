<template>
  <div class="Market-Container cubic-transition">
    <div class="Market-Header">
      <FlatCompletion :fetch="fetch" />
    </div>

    <transition-group
      :css="false"
      class="Market-List"
      tag="ul"
      @before-enter="onBeforeEnterList"
      @enter="onEnterList"
      @leave="onLeaveList"
    >
      <MarketItem :data-index="index" :item="item" v-for="(item, index) in value" />
    </transition-group>
  </div>
</template>

<script name="Market" setup>
import gsap from "gsap";
import FlatCompletion from "@comp/base/input/FlatCompletion.vue";
import MarketItem from "@comp/market/MarketItem.vue";

const value = ref([])

function fetch(key) {
  value.value = []

  while( value.value.length < Math.min(key.length, 9) ) {
    value.value.push({
      name: 'test' + key[value.value.length],
      description: 'test'
    })
  }

  return []
}

function onBeforeEnterList(el) {
  el.style.opacity = 0;
  el.style.transform = 'translateX(10px)'
}

function onLeaveList(el, done) {
  gsap.to(el, {
    opacity: 0,
    transform: 'translateX(-10px)',
    duration: 0.2,
    onComplete: done,
    delay: el.dataset.index * .5
  })
}

function onEnterList(el, done) {
  gsap.to(el, {
    opacity: 1,
    transform: 'translateX(0)',
    duration: 0.2,
    onComplete: done,
    delay: el.dataset.index * .5
  })
}
</script>

<style lang="scss" scoped>
.Market-List {
  position: relative;
  padding: 1% 1.5%;
  display: flex;

  gap: 16px;
  flex-wrap: wrap;

  top: 5%;

  width: 100%;
  height: 80%;

  list-style: none;

  box-sizing: border-box;
}

.Market-Header {
  :deep(.FlatInput-Container) {
    margin: 0;
  }
  position: relative;
  display: flex;
  padding: 1% 1%;
  margin-top: 2%;

  align-items: center;
  justify-content: center;

  left: 15%;

  width: 70%;

  box-sizing: border-box;
  //box-shadow: var(--el-box-shadow-lighter);
}

.Market-Container {
  position: relative;

  width: 100%;
  height: 100%;
}
</style>