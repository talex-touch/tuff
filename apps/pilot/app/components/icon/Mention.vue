<!--
  - Copyright (c) 2022. TalexDreamSoul
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  -     http://www.apache.org/licenses/LICENSE-2.0
  -
  - Unless required by applicable law or agreed to in writing, software
  - distributed under the License is distributed on an "AS IS" BASIS,
  - WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - See the License for the specific language governing permissions and
  - limitations under the License.
  -->

<script name="Mention" lang="ts" setup>
const props = defineProps(['mode'])
</script>

<template>
  <div
    class="Mention-Icon-Wrapper" :class="{
      normal: mode === null,
      warning: mode === TipType.WARNING,
      info: mode === TipType.INFO,
      error: mode === TipType.ERROR,
      success: mode === TipType.SUCCESS,
      loading: mode === 'loading' }"
  >
    <div class="Mention-Icon-Container transition-cubic">
      <div class="Mention-Icon-Floater transition-cubic" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Mention-Icon-Wrapper.normal {
  transform: scale(0) !important;
}

.Mention-Icon-Wrapper {
  .Mention-Icon-Container {
    border-radius: 50%;
    border: 2px solid var(--bg-color, var(--el-text-color-regular));

    width: 100%;
    height: 100%;

    position: relative;
    &:before {
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      border-radius: 50%;
      background-color: var(--bg-color, var(--el-text-color-regular));
    }
    .Mention-Icon-Floater {
      &:before,
      &:after {
        content: '';
        position: absolute;

        left: 50%;
        top: 50%;

        width: 50%;
        height: 50%;

        border-radius: 8px;
        transform: translate(-50%, -50%) rotate(0deg);
        transition: 0.15s;
        background-color: var(--bg-color, var(--el-text-color-regular));
      }

      &:after {
        //height: 200%;

        //transform: translate(300%, -40%) rotate(0deg);
      }
      position: absolute;

      top: 0;
      left: 0;

      width: 25%;
      height: 25%;

      border-radius: 50%;
      //background-color: transparent;
      transform: translate(-0, 0);
    }
  }

  width: 36px;
  height: 36px;
}

.Mention-Icon-Wrapper.success .Mention-Icon-Container {
  .Mention-Icon-Floater {
    &:before {
      left: 0;
      top: 0;
      width: 30%;
      height: 130%;
      transition: 0.25s 0.05s;
      transform: translate(-50%, -10%) rotate(-45deg);
    }

    &:after {
      left: 0;
      top: 0;
      width: 30%;
      height: 200%;

      transition: 0.25s 0.1s;
      transform: translate(300%, -40%) rotate(45deg);
    }
    top: 60%;
    left: 50%;

    transform: translate(-50%, -50%);
  }
  &:before {
    animation: floater-wave 0.65s forwards;
  }
  //animation: rotate .85s linear infinite;
  --bg-color: var(--el-color-success);
}

.Mention-Icon-Wrapper.error .Mention-Icon-Container {
  .Mention-Icon-Floater {
    &:before,
    &:after {
      left: 50%;
      top: 50%;
      width: 30%;
      height: 200%;
      transition: 0.25s 0.1s;
      transform: translate(-50%, -65%) rotate(-45deg);
    }

    &:after {
      transform: translate(-50%, -65%) rotate(45deg);
    }
    top: 60%;
    left: 50%;

    transform: translate(-50%, -50%);
  }
  &:before {
    animation: floater-wave 0.65s forwards;
  }
  //animation: rotate .85s linear infinite;
  --bg-color: var(--el-color-error);
}

.Mention-Icon-Wrapper.warning .Mention-Icon-Container {
  .Mention-Icon-Floater {
    &:before,
    &:after {
      left: 50%;
      top: 50%;
      width: 30%;
      height: 150%;
      transition: 0.25s 0.1s;
      transform: translate(-50%, -100%) rotate(0);
    }

    &:after {
      height: 30%;

      transform: translate(-50%, 100%) rotate(0);
    }
    top: 60%;
    left: 50%;

    transform: translate(-50%, -50%);
  }
  &:before {
    animation: floater-wave 0.65s forwards;
  }
  //animation: rotate .85s linear infinite;
  --bg-color: var(--el-color-warning);
}

.Mention-Icon-Wrapper.info .Mention-Icon-Container {
  .Mention-Icon-Floater {
    &:before,
    &:after {
      left: 50%;
      top: 50%;
      width: 30%;
      height: 150%;
      transition: 0.25s 0.1s;
      transform: translate(-50%, -100%) rotate(0);
    }

    &:after {
      height: 30%;

      transform: translate(-50%, 100%) rotate(0);
    }
    top: 60%;
    left: 50%;

    transform: translate(-50%, -50%);
  }
  &:before {
    animation: floater-wave 0.65s forwards;
  }
  //animation: rotate .85s linear infinite;
  --bg-color: var(--el-color-primary);
}

.Mention-Icon-Wrapper.loading .Mention-Icon-Container {
  &:before {
    animation: floater-wave 0.65s infinite;
  }
  .Mention-Icon-Floater {
    background-color: var(--bg-color, var(--el-text-color-regular));
  }
  animation: rotate 0.85s linear infinite;
  // --bg-color: var(--el-text-color-regular);
}

@keyframes floater-wave {
  from {
    transform: scale(0);
    opacity: 1;
  }

  to {
    transform: scale(1);
    opacity: 0.45;
  }
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>
