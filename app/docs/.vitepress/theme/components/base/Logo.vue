<template>
  <div class="About-Image">
    <div class="Home-Logo-Bg">
    </div>

    <img :src="Logo" alt="logo" />
  </div>
</template>

<script setup>
import Logo from './../../../../images/logo.svg'
</script>

<style lang="scss">
.About-Image {

  &:before,
  &:after {
    content: "";
    position: absolute;

    left: 50%;
    top: 50%;

    width: 100%;
    height: 100%;

    border-radius: 50%;
    transform: translate(-50%, -50%);
    border: 1px solid var(    --vp-carbon-ads-text-color);

    animation: breathing 1s linear infinite;
  }

  &:after {
    width: 125%;
    height: 125%;

    animation-delay: .5s;
  }

  position: relative;

  top: 0;

  width: 30%;
  aspect-ratio: 1 / 1;

  img {
    position: absolute;

    top: 0;
    right: 0;

    height: 100%;

    //transform: scale(.85)
  }
}

@keyframes breathing {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0);
  }

  30%,
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    opacity: .8;
    transform: translate(-50%, -50%) scale(.8);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.5);
  }
}</style>