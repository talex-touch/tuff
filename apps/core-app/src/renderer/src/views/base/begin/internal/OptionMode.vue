<script setup lang="ts" name="OptionMode">
import Forbidden from './Forbidden.vue'
import Done from './Done.vue'
import { Ref } from 'vue'

type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

const choice: Ref<number> = ref(0)
const step: StepFunction = inject('step')!

function handleAgree(): void {
  step({
    comp: !choice.value ? Forbidden : Done
  })
}
</script>

<template>
  <div class="OptionMode">
    <div class="OptionMode-Display">
      <div class="diaplyer transition-cubic" :class="{ fill: choice }"></div>
    </div>

    <div class="OptionMode-Choice">
      <div
        :class="{ active: !choice }"
        class="transition-cubic OptionMode-Section"
        role="button"
        tabindex="0"
        @click="choice = 0"
        @keydown.enter="choice = 0"
        @keydown.space="choice = 0"
      >
        <h1>Guided Tour<span class="tag">RECOMMENDED</span></h1>
        <span>
          I'm new to this application and would like a comprehensive walkthrough to help me
          understand its features and capabilities.
        </span>
      </div>

      <div
        :class="{ active: choice }"
        class="transition-cubic OptionMode-Section"
        role="button"
        tabindex="0"
        @click="choice = 1"
        @keydown.enter="choice = 1"
        @keydown.space="choice = 1"
      >
        <h1>Self-Guided</h1>
        <span>
          I'm familiar with similar applications and prefer to explore the interface at my own pace
          without a formal tutorial.
        </span>
      </div>
    </div>

    <div class="OptionMode-Next">
      <FlatButton primary @click="handleAgree">Continue</FlatButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
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

.diaplyer {
  position: relative;
  width: 5rem;
  height: 5rem;
  --s: 2.5;
  --t: 0.5;
  border-radius: 50%;
  border: 2px solid var(--el-color-primary);
  animation: shining 1.25s infinite;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    transform: scale(1.25);
    border: 2px solid var(--el-color-primary);
    animation: shining 0.5s infinite;
  }

  &::after {
    --s: 2;
    --t: 0;
    animation: shining 1s infinite;
  }
}

.diaplyer.fill {
  &::before {
    --s: 0;
    --t: 1.75;
    --ob: 1;
    --ot: 0;
  }

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

.OptionMode {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;

  &-Display {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
  }

  &-Choice {
    margin: 10px 0;
    display: flex;
    gap: 1rem;
    flex: 0 0 auto;
  }

  &-Next {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 0 0 auto;
    padding: 1rem 0;
  }

  &-Section {
    flex: 1;
    padding: 1.5rem;
    cursor: pointer;
    border-radius: 12px;
    box-sizing: border-box;
    border: 2px solid transparent;
    transition: all 0.3s ease;

    .tag {
      margin-left: 8px;
      font-size: 0.7rem;
      background-color: #b7aa46a0;
      padding: 2px 6px;
      border-radius: 4px;
      vertical-align: middle;
    }

    h1 {
      margin: 0 0 1rem 0;
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    span {
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--el-text-color-regular);
    }

    &:hover {
      border-color: var(--el-border-color);
      background-color: var(--el-fill-color-light);
    }

    &.active {
      border-color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-9);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }
}
</style>
