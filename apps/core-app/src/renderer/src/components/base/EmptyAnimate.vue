<template>
  <div class="EmptyAnimate-Container">
    <LottieFrame :data="empty" />

    <!-- <p :data-text="$t('base.empty-select')">{{ $t('base.empty-select') }}</p> -->
  </div>
</template>

<script name="EmptyAnimate" lang="ts" setup>
import LottieFrame from '@comp/icon/lotties/LottieFrame.vue'
// import { $t } from '~/modules/lang'
import empty from '~/assets/lotties/empty.json'
</script>

<style lang="scss" scoped>
.EmptyAnimate-Container {
  position: relative;

  top: 0;
  left: 0;

  //width: 240px;
  //height: 50%;

  opacity: 0.75;

  .LottieFrame-Container {
    transform: translateY(-5%);
  }

  p {
    position: absolute;

    left: 50%;
    bottom: 25%;

    background: linear-gradient(90deg, transparent, var(--el-color-primary-light-3), transparent);
    background-size: 400% 100%;
    background-position-x: 0;
    animation: mix 4s infinite linear reverse;

    font-weight: 600;
    font-size: 16px;

    overflow: hidden;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;

    transform: translateX(-50%) translateY(200%);
  }
}

@keyframes mix {
  0% {
    background-position-x: 0%;
  }
  100% {
    background-position-x: 130%;
  }
}
</style>
