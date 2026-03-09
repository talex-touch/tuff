<script setup lang="ts"></script>

<template>
  <div class="RoundLoading" />
</template>

<style lang="scss">
.RoundLoading {
  position: absolute;

  left: -6px;

  width: 28px;
  height: 28px;

  border-radius: 16px;
  border: 2px solid currentColor;

  animation: shining 1s infinite linear;
}

@keyframes shining {
  0% {
    border-radius: 8px;
    transform: rotate(0deg) scale(0.75);
  }

  50% {
    border-radius: 16px;
    transform: rotate(180deg) scale(1.25);
  }

  100% {
    border-radius: 8px;
    transform: rotate(360deg) scale(0.75);
  }
}
</style>
