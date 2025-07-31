<!--
  AccountDo Component

  Handles the account selection step in the setup wizard.
-->
<!--
  AccountDo Component

  Handles the account selection step in the setup wizard.
-->
<script setup lang="ts" name="AccountDo">
import Forbidden from './Forbidden.vue'
import OptionMode from './OptionMode.vue'
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
    comp: !choice.value ? Forbidden : OptionMode
  })
}
</script>

<!--
  AccountDo Component Template

  Displays account selection options and handles user interaction.
-->
<template>
  <!-- Main container for account selection -->
  <div class="AccountDo">
    <!-- Display area for visual representation -->
    <div class="AccountDo-Display">
      <div class="diaplyer transition-cubic" :class="{ fill: choice }"></div>
    </div>

    <!-- Choice options container -->
    <div class="AccountDo-Choice">
      <!-- Login option -->
      <div
        :class="{ active: !choice }"
        class="transition-cubic AccountDo-Section"
        role="button"
        tabindex="0"
        @click="choice = 0"
        @keydown.enter="choice = 0"
        @keydown.space="choice = 0"
      >
        <h1>Log in<span class="tag">RECOMMENDED</span></h1>
        <span>
          Sign in or sign up, and start using this app. You are able to synchronize your data with
          other devices. Walk through cloud services.
          <a href="https://github.com/17809/blog" target="_blank">Learn more</a>
        </span>
      </div>

      <!-- Skip option -->
      <div
        :class="{ active: choice }"
        class="transition-cubic AccountDo-Section"
        role="button"
        tabindex="0"
        @click="choice = 1"
        @keydown.enter="choice = 1"
        @keydown.space="choice = 1"
      >
        <h1>Not now</h1>
        <span>
          Using this app without signing in is fine. You can still use this app, but you won't be
          able to synchronize your data with other devices.
        </span>
      </div>
    </div>

    <!-- Next button container -->
    <div class="AccountDo-Next">
      <FlatButton primary @click="handleAgree"> SURE </FlatButton>
    </div>
  </div>
</template>

<!--
  AccountDo Component Styles

  SCSS styles for the account selection component including animations and responsive design.
-->
<style lang="scss" scoped>
/** Frame animation keyframes for display element */
@keyframes frame {
  25% {
    transform: translateY(-50%) scale(0.5) translateX(-20%);
  }

  75% {
    transform: translateY(-50%) scale(0.5) translateX(20%);
  }

  0%,
  50%,
  100% {
    transform: translateY(-50%) scale(0.5) translateX(0);
  }
}

/** Frame down animation keyframes for display element */
@keyframes frame_down {
  0% {
    transform: translateY(-50%) scale(0.5) translateY(0%);
  }
  25% {
    transform: translateY(-50%) scale(0.5) translateY(-15%);
  }
  50% {
    transform: translateY(-50%) scale(0.5) translateY(15%);
  }
  75% {
    transform: translateY(-50%) scale(0.5) translateY(-10%);
  }
  100% {
    transform: translateY(-50%) scale(0.5) translateY(10%);
  }
}

/** Display element styles */
.diaplyer {
  position: relative;
  width: 8rem;
  height: 8rem;

  /** Filled state styles */
  &.fill {
    --el-color-primary: var(--el-border-color);

    &::after {
      animation: frame_down 0.75s infinite;
    }
  }

  /** Before pseudo-element styles */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    height: 30%;
    transition: 0.25s;
    border-radius: 12px;
    transform: translateY(150%);
    border: 2px solid var(--el-color-primary);
    background-color: var(--el-color-primary);
  }

  /** After pseudo-element styles */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    transition: 0.25s;
    border-radius: 50%;
    transform: translateY(-50%) scale(0.5);
    background-color: var(--el-color-primary);
    animation: frame 2s infinite;
  }
}

/** Join animation keyframes */
@keyframes join {
  to {
    opacity: 1;
  }
}

/** Main container styles */
.AccountDo {
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
