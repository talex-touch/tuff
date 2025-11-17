<script setup lang="ts" name="Done">
import HelloData from '~/assets/lotties/welcome.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { appSetting } from '~/modules/channel/storage'

const step: any = inject('step')!

function goon(): void {
  step(
    {
      comp: null
    },
    () => {
      appSetting.beginner.init = true
    }
  )
}
</script>

<template>
  <div class="Greeting">
    <LottieFrame :loop="true" :data="HelloData" />

    <div class="Greeting-Content">
      <p>You're all set! Let's get started.</p>
      <FlatButton primary @click="goon"> Get Started </FlatButton>
    </div>
  </div>
</template>

<style lang="scss">
.LottieFrame-Container {
  position: relative;
  height: 80%;
}

@keyframes join {
  to {
    opacity: 1;
  }
}

.Greeting {
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
    animation: join forwards 0.5s 3s;

    p {
      margin-bottom: 1.5rem;
      font-size: 1.3rem;
      font-weight: 500;
      text-align: center;
      color: var(--el-text-color-primary);
    }
  }
}
</style>
