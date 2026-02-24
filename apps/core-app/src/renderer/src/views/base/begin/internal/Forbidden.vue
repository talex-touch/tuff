<script setup lang="ts">
import type { Ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
import HelloData from '~/assets/lotties/compress-loading.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'

type BackFunction = () => void

const back: Ref<BackFunction> = inject('back')!
const appSdk = useAppSdk()
const { t } = useI18n()

function close(): void {
  void appSdk.close()
}
</script>

<template>
  <div class="Forbidden">
    <LottieFrame :loop="true" :data="HelloData" />
    <div class="Forbidden-Content">
      <p>{{ t('beginner.forbidden.description') }}</p>
      <div flex gap-8>
        <TxButton variant="flat" @click="close"> {{ t('beginner.forbidden.close') }} </TxButton>
        <TxButton variant="flat" type="primary" @click="back">
          {{ t('beginner.forbidden.back') }}
        </TxButton>
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
