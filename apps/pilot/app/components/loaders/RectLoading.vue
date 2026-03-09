<script setup lang="ts"></script>

<template>
  <div class="loaderContainer">
    <div class="particleContainer">
      <div />
      <div />
      <div />
    </div>
    <div class="particleContainer">
      <div />
      <div />
      <div />
    </div>
  </div>
</template>

<style>
.loaderContainer {
  display: flex;
  width: 9em;
  overflow: hidden;
  gap: 0.5em;
}
.particleContainer {
  display: flex;
  gap: 0.5em;
  animation: slide 2000ms linear infinite;
}
.particleContainer div {
  width: 2.5em;
  aspect-ratio: 1;
  border-radius: 5px;
  background: black;
  transform-origin: left bottom;
  animation: squeeze 750ms ease-in-out infinite;
}
.particleContainer div:nth-child(2) {
  animation-delay: 50ms;
}
.particleContainer div:last-child {
  animation-delay: 100ms;
}
@keyframes squeeze {
  0% {
    transform: scale(1) translateY(0);
  }
  50% {
    transform: scale(0.75);
  }
  75% {
    transform: scale(1.05);
  }
  100% {
    transform: sclae(1);
  }
}
@keyframes slide {
  from {
    transform: translateX(0%);
  }
  to {
    transform: translateX(calc(-50% + 1.25em));
  }
}
</style>
