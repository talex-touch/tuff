<script setup lang="ts">
import type { Ref } from 'vue'
import { useAppSdk } from '@talex-touch/utils/renderer'
import HelloData from '~/assets/lotties/compress-loading.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { TxButton } from '@talex-touch/tuffex'

type BackFunction = () => void

const back: Ref<BackFunction> = inject('back')!
const appSdk = useAppSdk()

function close(): void {
  void appSdk.close()
}
</script>

<template>
  <div class="Forbidden">
    <LottieFrame :loop="true" :data="HelloData" />
    <div class="Forbidden-Content">
      <p>We're sorry, but we are unable to provide service at this time.</p>
      <div flex gap-8>
        <TxButton variant="flat" @click="close"> CLOSE </TxButton>
        <TxButton variant="flat" type="primary" @click="back"> BACK </TxButton>
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
