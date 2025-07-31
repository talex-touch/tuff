<!--
  Forbidden Component

  Displays a forbidden message and provides options to go back or close the application.
-->
<script setup lang="ts">
import HelloData from '~/assets/lotties/compress-loading.json'
import LottieFrame from '~/components/icon/lotties/LottieFrame.vue'
import { Ref } from 'vue'

// Type definition for back function
type BackFunction = () => void

// Inject back function from parent component
const back: Ref<BackFunction> = inject('back')!

/**
 * Close the application
 */
function close(): void {
  window.$nodeApi.close()
}
</script>

<!--
  Forbidden Component Template

  Displays a forbidden message with animation and action buttons.
-->
<template>
  <!-- Main container for forbidden message -->
  <div class="Forbidden">
    <!-- Animated lottie frame -->
    <LottieFrame :loop="true" :data="HelloData" />

    <!-- Content area with message and buttons -->
    <div class="Forbidden-Content">
      <p>We can't provide you with services.</p>
      <!-- Button group for actions -->
      <div flex gap-8>
        <FlatButton @click="close"> CLOSE </FlatButton>
        <FlatButton primary @click="back"> BACK </FlatButton>
      </div>
    </div>
  </div>
</template>

<!--
  Forbidden Component Styles

  SCSS styles for the forbidden component including animations and responsive design.
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
.Forbidden {
  position: relative;
  height: 100%;

  /** Content area styles */
  &-Content {
    display: flex;
    align-items: center;
    flex-direction: column;
    opacity: 0;
    animation: join forwards 0.5s 1s;
  }
}
</style>
