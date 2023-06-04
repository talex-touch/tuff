<template>
  <div class="BlurBackGround-Container">
    <img :alt="song?.detail?.song?.name" :src="song?.detail?.song?.al.picUrl" />
<!--    <WavingParticle :song="song" />-->
  </div>
</template>

<script>
export default {
  name: "BlurBackGround"
}
</script>

<script setup>
import WavingParticle from '@comp/music/particle/bg/WavingParticle.outdate.vue'
import { ref } from 'vue'

const props = defineProps(['song'])

</script>

<style lang="scss" scoped>
//.BlurBackground-BackWrapper {
//  canvas, img {
//    width: 100%;
//    height: 100%;
//  }
//  position: absolute;
//
//  top: 0;
//  left: 0;
//
//  width: 100%;
//  height: 100%;
//
//  filter: saturate(180%) blur(10px) brightness(50%);
//  transform: scale(1.125);
//}

.BlurBackGround-Container {
  img {
    .dark & {
      filter: saturate(180%) blur(50px) brightness(50%);
    }
    width: 100%;
    height: 100%;

    filter: saturate(180%) blur(50px) brightness(80%);
  }
  //:deep(.WavingParticle-Container) {
  //  filter: saturate(180%) blur(10px) brightness(50%);
  //
  //  mix-blend-mode: difference;
  //}
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  transform: scale(2);
}
</style>