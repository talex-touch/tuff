<script setup>
import { onBeforeMount, onMounted, ref } from 'vue'
import { throttleRef } from './../../../plugins/Common'

const props = defineProps({
  parentAmo: Number,
})

const dom = ref(null)
let target

const animate = throttleRef(false, 200)

function focus() {
  animate.value = true
}

function blur(e) {
  animate.value = false
}

onMounted(() => {
  let el = dom.value; let amo = props.parentAmo

  while (amo) {
    el = el.parentElement

    --amo
  }

  target = el

  el.addEventListener('focus', focus)
  el.addEventListener('click', focus)
  window.addEventListener('click', blur)
})

onBeforeUnmount(() => {
  if (!target)
    return

  target.removeEventListener('focus', focus)
  target.removeEventListener('click', focus)
  window.removeEventListener('click', blur)
})
</script>

<script>
export default {
  name: 'UserAnimate',
}
</script>

<template>
  <div ref="dom" class="UserAnimate-Container" :class="{ animate }" />
</template>

<style lang="scss" scoped>
.UserAnimate-Container.animate {
  &:before {
    animation: userAnimation 20s ease-in-out infinite;
  }
}

@keyframes userAnimation {
  0%,
  18%,
  100% {
    transform: translate(-50%, -50%) scaleY(0);
  }

  20% {
    transform: translate(-50%, -50%) scaleY(1);
  }

  24% {
    transform: translate(-50%, -50%) scaleY(0.8);
  }

  27% {
    transform: translate(-50%, -50%) scaleY(0);
  }

  30%,
  34%,
  72%,
  78%,
  94% {
    transform: translate(-50%, -50%) translateX(-2px);
  }

  32%,
  74%,
  84%,
  98% {
    transform: translate(-50%, -50%) translateX(2px);
  }

  34% {
    transform-origin: 2px 2px;
    transform: translate(-50%, -50%) rotate(120deg);
  }

  38% {
    transform-origin: 2px 2px;
    transform: translate(-50%, -50%) rotate(-160deg);
  }

  43% {
    transform-origin: 2px 2px;
    transform: translate(-50%, -50%) rotate(360deg);
  }

  45% {
    transform: translate(-50%, -50%) scaleY(0.35);
  }

  47% {
    transform: translate(-50%, -50%) scale(1.15, 0.8);
  }

  50% {
    transform: translate(-50%, -50%) scale(1.15);
  }

  60% {
    transform: translate(-50%, -50%) scale(0.75);
  }

  70% {
    box-shadow: 0 0 1px 2px var(--el-text-color-regular);
    transform: translate(-50%, -50%) scale(1.125);
  }

  85% {
    box-shadow: 0 0 4px 6px var(--el-text-color-regular);
    transform: translate(-50%, -50%) scale(0.25);
  }

  90% {
    box-shadow: 0 0 2px 4px var(--el-text-color-regular);
    transform: translate(-50%, -50%) scale(0.5);
  }
}

.UserAnimate-Container {
  &:before {
    content: '';
    position: absolute;

    width: 5px;
    height: 5px;

    left: 50%;
    top: 50%;

    background: var(--el-text-color-regular);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  &:after {
    content: '';
    position: absolute;

    width: 20px;
    height: 20px;

    left: 0;
    top: 110%;

    border: 1px solid var(--el-text-color-regular);
    border-radius: 50%;
    clip: rect(0, 12px, 12px, 0);
    transform: translate(-30%, 10%) rotate(45deg);
  }
  position: relative;

  top: 40%;
  left: 50%;

  width: 10px;
  height: 10px;

  border: 1px solid var(--el-text-color-regular);
  //background-clip: rect(0, 10px, 10px, 0);
  border-radius: 50%;
  transform: translate(-50%, -50%) translateX(-4px);
}
</style>
