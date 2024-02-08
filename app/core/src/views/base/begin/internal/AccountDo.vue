<script setup lang="ts" name="AccountDo">
import Forbidden from "./Forbidden.vue";
import OptionMode from "./OptionMode.vue";

const choice = ref(0);
const step = inject("step")!;

function handleAgree() {
  step({
    comp: !choice.value ? Forbidden : OptionMode,
  });
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
        @click="choice = 0"
        class="transition-cubic AccountDo-Section"
      >
        <h1>Log in<span class="tag">RECOMMENDED</span></h1>
        <span>
          Sign in or sign up, and start using this app. You are able to synchronize your
          data with other devices. Walk through cloud services.
          <a href="https://github.com/17809/blog" target="_blank">Learn more</a>
        </span>
      </div>
      <div
        :class="{ active: choice }"
        @click="choice = 1"
        class="transition-cubic AccountDo-Section"
      >
        <h1>Not now</h1>
        <span>
          Using this app without signing in is fine. You can still use this app, but you
          won't be able to synchronize your data with other devices.
        </span>
      </div>
    </div>
    <div class="AccountDo-Next">
      <FlatButton primary @click="handleAgree"> SURE </FlatButton>
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

.diaplyer {
  &.fill {
    --el-color-primary: var(--el-border-color);
  }

  &::before {
    content: "";
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
    content: "";
    position: absolute;

    inset: 0;

    transition: 0.25s;
    border-radius: 50%;
    transform: translateY(-50%) scale(0.5);
    background-color: var(--el-color-primary);
    animation: frame 2s infinite;
  }

  position: relative;
  width: 8rem;
  height: 8rem;
}

@keyframes join {
  to {
    opacity: 1;
  }
}

.AccountDo {
  &-Display {
    display: flex;

    align-items: center;
    justify-content: center;

    height: 60%;
  }

  &-Choice {
    margin: 10px 0;
    display: flex;

    height: 30%;

    gap: 1rem;
  }

  &-Next {
    height: 10%;
  }

  &-Section {
    .tag {
      margin-left: 5px;
      font-size: 14px;

      background-color: #b7aa46a0;
    }

    h1 {
      margin: 0;
    }

    &:hover {
      border-color: var(--el-border-color);
    }

    &.active {
      border-color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-7);
    }

    width: 50%;

    padding: 1rem;

    cursor: pointer;
    border-radius: 8px;
    box-sizing: border-box;
    border: 1px solid transparent;
  }

  position: relative;

  height: 100%;
}
</style>
