<!--
  Greeting Component

  Displays a welcome message with animation and provides option to continue to the next step.
-->
<script setup lang="ts">
import HelloData from '~/assets/lotties/hello.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import Protocol from './Protocol.vue'
import { Ref } from 'vue'

// Type definition for step function
type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

// Inject step function from parent component
const step: Ref<StepFunction> = inject('step')!

/**
 * Continue to the next step (Protocol component)
 */
function goon(): void {
  step.value({
    comp: Protocol
  })
}
</script>

<!--
  Greeting Component Template

  Displays a welcome message with animation and a continue button.
-->
<template>
  <!-- Main container for greeting message -->
  <div class="Greeting">
    <!-- Animated lottie frame -->
    <LottieFrame :loop="true" :data="HelloData" />

    <!-- Content area with message and button -->
    <div class="Greeting-Content">
      <p>Flick the button to continue.</p>
      <!-- Continue button -->
      <FlatButton primary @click="goon"> NEXT </FlatButton>
    </div>
  </div>
</template>

<!--
  Greeting Component Styles

  SCSS styles for the greeting component including animations and responsive design.
-->
<style lang="scss">
/** Lottie frame container styles */
.LottieFrame-Container {
  position: relative;
  height: 80%;
}

/** Join animation keyframes */
@keyframes join {
  to {
    opacity: 1;
  }
}

/** Main container styles */
.Greeting {
  position: relative;
  height: 100%;

  /** Content area styles */
  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    opacity: 0;
    animation: join forwards 0.5s 3s;
  }
}
</style>
