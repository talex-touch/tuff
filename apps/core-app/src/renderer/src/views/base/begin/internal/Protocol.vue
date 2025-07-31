<!--
  Protocol Component

  Handles the protocol agreement step in the setup wizard.
  Displays the protocol document and handles user agreement.
-->
<script setup lang="ts" name="Protocol">
// Import the protocol document as raw text
import Protocol from '~/assets/docs/protocol.md?raw'
// Import the agreement template component
import AgreementTemplate from '~/components/addon/AgreementTemplate.vue'
// Import the forbidden component for negative response
import Forbidden from './Forbidden.vue'
// Import the license component for positive response
import License from './License.vue'

// Type definition for step function
type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

// Inject the step function from parent component
const step: StepFunction = inject('step')!

/**
 * Handle user agreement response
 * @param val - Boolean indicating if user agreed to the protocol
 * @returns void
 */
function handleAgree(val: boolean): void {
  step({
    comp: val ? License : Forbidden
  })
}
</script>

<!--
  Protocol Component Template

  Displays the agreement template with the protocol document.
-->
<template>
  <!-- Main container for protocol agreement -->
  <div class="Protocol">
    <!-- Agreement template with protocol document and handler -->
    <AgreementTemplate :agree="handleAgree" :agreement="Protocol" />
  </div>
</template>

<!--
  Protocol Component Styles

  SCSS styles for the protocol component including animations.
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
.Protocol {
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
