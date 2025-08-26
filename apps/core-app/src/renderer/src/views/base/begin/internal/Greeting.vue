<script setup lang="ts">
import HelloData from '~/assets/lotties/hello.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import Protocol from './Protocol.vue'

type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

const step: StepFunction = inject('step')!

function goon(): void {
  step({
    comp: Protocol
  })
}
</script>

<template>
  <div class="Greeting">
    <LottieFrame :loop="true" :data="HelloData" />
    <div class="Greeting-Content">
      <p>Welcome to Tuff</p>
      <FlatButton primary @click="goon">Get Started</FlatButton>
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
      margin-bottom: 1rem;
      font-size: 1.5rem;
      font-weight: 500;
      text-align: center;
    }
  }
}
</style>
