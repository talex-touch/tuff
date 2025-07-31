<!--
  License Component

  Displays the license agreement and handles user acceptance.
-->
<script setup lang="ts" name="License">
import Protocol from "~/assets/docs/license.md?raw";
import AgreementTemplate from "~/components/addon/AgreementTemplate.vue";
import Forbidden from "./Forbidden.vue";
import AccountDo from "./AccountDo.vue";
import { Ref } from "vue";

// Type definition for step function
type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void;

// Inject step function from parent component
const step: Ref<StepFunction> = inject("step")!;

/**
 * Handle user agreement and navigate to the next step
 * @param val - Boolean indicating if user agreed to the license
 */
function handleAgree(val: boolean): void {
  step.value({
    comp: val ? AccountDo : Forbidden,
  });
}
</script>

<!--
  License Component Template

  Displays the license agreement using the AgreementTemplate component.
-->
<template>
  <!-- Main container for license agreement -->
  <div class="Protocol">
    <!-- Agreement template with license content -->
    <AgreementTemplate title="License" :agree="handleAgree" :agreement="Protocol" />
  </div>
</template>

<!--
  License Component Styles

  SCSS styles for the license component including animations and responsive design.
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
