<script setup lang="ts">
import HelloData from '~/assets/lotties/compress-loading.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { Ref } from 'vue'

type BackFunction = () => void

const back: Ref<BackFunction> = inject('back')!

function close(): void {
  window.$nodeApi.close()
}
</script>

<template>
  <div class="Forbidden">
    <LottieFrame :loop="true" :data="HelloData" />
    <div class="Forbidden-Content">
      <p>We can't provide you with services.</p>
      <div flex gap-8>
        <FlatButton @click="close"> CLOSE </FlatButton>
        <FlatButton primary @click="back"> BACK </FlatButton>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.Forbidden {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    opacity: 0;
    animation: join forwards 0.5s 1s;

    p {
      margin-bottom: 1.5rem;
      font-size: 1.3rem;
      text-align: center;
    }
  }
}

@keyframes join {
  to {
    opacity: 1;
  }
}
</style>
