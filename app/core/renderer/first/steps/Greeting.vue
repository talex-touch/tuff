<template>
  <div class="Greeting-Container">
    <LottieFrame id="hello-frame" :loop="true" :data="hello" />

    <p>
      <span style="font-size: 18px;opacity: .75;font-weight: 0">欢迎使用 <span style="color: var(--el-color-primary)">TalexTouch</span></span>
    </p>
  </div>
</template>

<script>
export default {
  name: "Greeting"
}
</script>

<script setup>
import LottieFrame from "@comp/icon/lotties/LottieFrame.vue";
import hello from "@assets/lotties/hello.json";
import {inject, nextTick, onMounted, ref} from "vue";
import {sleep} from "@modules/utils";

const showButton = inject('showButton')

onMounted(async () => {
 const helloFrame = document.getElementById("hello-frame")

  while ( helloFrame._lottieFrame.currentFrame < 400 ) {

   await sleep(100)

  }

  helloFrame._lottieFrame.pause()

  helloFrame.classList.add("shrink")
  helloFrame.nextElementSibling.classList.add("expand")

  await sleep(800)

    helloFrame.nextElementSibling.classList.remove("expand")
    await sleep(1800)

  showButton(() => {

    console.log('click')

  })

})
</script>

<style lang="scss" scoped>
.Greeting-Container {
  p {
    &.expand {
      bottom: 50%;

      opacity: 1;
      transform: translateY(50%) scale(1)
    }
    position: absolute;

    bottom: 15%;
    width: 100%;

    text-align: center;
    font-weight: 600;
    font-size: 24px;

    transition: .35s ease-in;
    opacity: 0;
    transform: translateY(250%) scale(.75)
  }
  :deep(.LottieFrame-Container) {
    position: absolute;

    width: 100%;
    height: 100%;

    transition: .35s ease-in;
    transform: scale(1.25);
    &.shrink {
      opacity: 0;
      //transform: translateY(-25%) scale(.85)
    }
  }
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;
}
</style>