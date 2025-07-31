<!--
  OptionMode Component

  Handles the option mode selection step in the setup wizard.
-->
<script setup lang="ts" name="OptionMode">
import Forbidden from './Forbidden.vue'
import Done from './Done.vue'
import { Ref } from 'vue'

// Type definition for step function
type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

// Reactive references
const choice: Ref<number> = ref(0)
const step: Ref<StepFunction> = inject('step')!

/**
 * Handle user agreement and navigate to the next step
 */
function handleAgree(): void {
  step.value({
    comp: !choice.value ? Forbidden : Done
  })
}
</script>

<!--
  OptionMode Component Template

  Displays option mode selection and handles user interaction.
-->
<template>
  <!-- Main container for option mode selection -->
  <div class="OptionMode">
    <!-- Display area for visual representation -->
    <div class="OptionMode-Display">
      <div class="diaplyer transition-cubic" :class="{ fill: choice }"></div>
    </div>

    <!-- Choice options container -->
    <div class="OptionMode-Choice">
      <!-- Novice option -->
      <div
        :class="{ active: !choice }"
        class="transition-cubic OptionMode-Section"
        role="button"
        tabindex="0"
        @click="choice = 0"
        @keydown.enter="choice = 0"
        @keydown.space="choice = 0"
      >
        <h1>Novice<span class="tag">RECOMMENDED</span></h1>
        <span>
          I'm a novice. And I have not yet learned how to use this software even other similar apps.
          Please help me.
        </span>
      </div>

      <!-- Experienced option -->
      <div
        :class="{ active: choice }"
        class="transition-cubic OptionMode-Section"
        role="button"
        tabindex="0"
        @click="choice = 1"
        @keydown.enter="choice = 1"
        @keydown.space="choice = 1"
      >
        <h1>Experienced</h1>
        <span>
          I'm an experienced user. I have used other similar apps. Skip the base tutorial.
        </span>
      </div>
    </div>

    <!-- Next button container -->
    <div class="OptionMode-Next">
      <FlatButton primary @click="handleAgree"> SURE </FlatButton>
    </div>
  </div>
</template>

<!--
  OptionMode Component Styles

  SCSS styles for the option mode component including animations and responsive design.
-->
<style lang="scss" scoped>
/** Shining animation keyframes for display element */
@keyframes shining {
  from {
    opacity: var(--ob, 0);
    transform: scale(var(--s, 1.25));
  }

  to {
    opacity: var(--ot, 1);
    transform: scale(var(--t, 1));
  }
}

/** Display element styles */
.diaplyer {
  position: relative;
  width: 5rem;
  height: 5rem;
  --s: 2.5;
  --t: 0.5;
  border-radius: 50%;
  border: 2px solid var(--el-color-primary);
  animation: shining 1.25s infinite;

  /** Before and after pseudo-element styles */
  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    transform: scale(1.25);
    border: 2px solid var(--el-color-primary);
    // background-color: var(--el-color-primary);
    animation: shining 0.5s infinite;
  }

  /** After pseudo-element styles */
  &::after {
    --s: 2;
    --t: 0;
    animation: shining 1s infinite;
  }
}

/** Filled state styles for display element */
.diaplyer.fill {
  /** Before pseudo-element filled state */
  &::before {
    --s: 0;
    --t: 1.75;
    --ob: 1;
    --ot: 0;
  }

  /** After pseudo-element filled state */
  &::after {
    --s: 0;
    --t: 2.5;
    --ob: 1;
    --ot: 0;
  }

  --s: 0;
  --t: 1.5;
  --ob: 1;
  --ot: 0;
}

/** Join animation keyframes */
@keyframes join {
  to {
    opacity: 1;
  }
}

/** Main container styles */
.OptionMode {
  position: relative;
  height: 100%;

  /** Display area styles */
  &-Display {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60%;
  }

  /** Choice options container styles */
  &-Choice {
    margin: 10px 0;
    display: flex;
    height: 30%;
    gap: 1rem;
  }

  /** Next button container styles */
  &-Next {
    height: 10%;
  }

  /** Choice section styles */
  &-Section {
    width: 50%;
    padding: 1rem;
    cursor: pointer;
    border-radius: 8px;
    box-sizing: border-box;
    border: 1px solid transparent;

    /** Tag styles */
    .tag {
      margin-left: 5px;
      font-size: 14px;
      background-color: #b7aa46a0;
    }

    /** Heading styles */
    h1 {
      margin: 0;
    }

    /** Hover state styles */
    &:hover {
      border-color: var(--el-border-color);
    }

    /** Active state styles */
    &.active {
      border-color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-7);
    }
  }
}
</style>
