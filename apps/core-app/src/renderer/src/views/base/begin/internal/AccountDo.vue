<script setup lang="ts" name="AccountDo">
import Forbidden from './Forbidden.vue'
import OptionMode from './OptionMode.vue'
import { Ref } from 'vue'

type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

const choice: Ref<number> = ref(0)
const step: StepFunction = inject('step')!

function handleAgree(): void {
  step({
    comp: !choice.value ? Forbidden : OptionMode
  })
}
</script>

<template>
  <div class="AccountDo">
    <div class="AccountDo-Display">
      <div class="diaplyer transition-cubic" :class="{ fill: choice }"></div>
    </div>

    <div class="AccountDo-Choice">
      <div
        :class="{ active: !choice }"
        class="transition-cubic AccountDo-Section"
        role="button"
        tabindex="0"
        @click="choice = 0"
        @keydown.enter="choice = 0"
        @keydown.space="choice = 0"
      >
        <h1>Sign In<span class="tag">RECOMMENDED</span></h1>
        <span>
          Create an account or sign in to unlock the full potential of this application. Seamlessly
          synchronize your data across all your devices and access cloud services.
          <a
            href="https://talex-touch.github.io/talex-touch/docs/documents/account.html"
            target="_blank"
            >Learn more</a
          >
        </span>
      </div>

      <div
        :class="{ active: choice }"
        class="transition-cubic AccountDo-Section"
        role="button"
        tabindex="0"
        @click="choice = 1"
        @keydown.enter="choice = 1"
        @keydown.space="choice = 1"
      >
        <h1>Continue Offline</h1>
        <span>
          You can use this application without signing in. However, please note that you will not be
          able to synchronize your data across devices or access cloud-based features.
        </span>
      </div>
    </div>

    <div class="AccountDo-Next">
      <FlatButton primary @click="handleAgree">Continue</FlatButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
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

.diaplyer {
  position: relative;
  width: 8rem;
  height: 8rem;

  &.fill {
    --el-color-primary: var(--el-border-color);

    &::after {
      animation: frame_down 0.75s infinite;
    }
  }

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

.AccountDo {
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

    a {
      color: var(--el-color-primary);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
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
