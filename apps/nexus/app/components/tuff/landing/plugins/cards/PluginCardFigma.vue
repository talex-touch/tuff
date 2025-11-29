<script lang="ts" setup>
</script>

<template>
  <div class="PluginCardFigma inset-0 h-full w-full flex items-center justify-center bg-white/[0.12]">
    <div class="PluginCardFigma-Overlay absolute bottom-0 z-5 z-5 h-[40%] w-full backdrop-blur-sm" />

    <div class="PluginCardFigma-Gradient flex items-center justify-between">
      <div class="PluginCardFigma-GradientBlock h-96 w-16 rounded-full bg-[#AC3A27] blur-[24px]" style="--d: 7.25s; --w: 4rem" />
      <div class="PluginCardFigma-GradientBlock h-88 w-24 rounded-full bg-[#874FFF] blur-[36px]" style="--d: 1.35s; --w: 6rem" />
      <div class="PluginCardFigma-GradientBlock h-72 w-20 rounded-full bg-[#1BB5F4] blur-[24px]" style="--d: 8.5s; --w: 5rem" />
      <div class="PluginCardFigma-GradientBlock h-104 w-12 rounded-full bg-[#26CB71] blur-[16px]" style="--d: 3.65s; --w: 4rem" />
    </div>

    <div class="PluginCardFigma-Main absolute bottom-0 z-10 h-[60%] w-full flex justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" fill="none" viewBox="0 0 480 720" aria-label="Homepage" class="h-[128px]"><path fill="#24CB71" d="M0 600c0-66.274 53.726-120 120-120h120v120c0 66.274-53.726 120-120 120S0 666.274 0 600" /><path fill="#FF7237" d="M240 0v240h120c66.274 0 120-53.726 120-120S426.274 0 360 0z" /><circle cx="359" cy="360" r="120" fill="#00B6FF" /><path fill="#FF3737" d="M0 120c0 66.274 53.726 120 120 120h120V0H120C53.726 0 0 53.726 0 120" /><path fill="#874FFF" d="M0 360c0 66.274 53.726 120 120 120h120V240H120C53.726 240 0 293.726 0 360" /></svg>
    </div>
  </div>
</template>

<style scoped>
.PluginCardFigma-Gradient {
  z-index: 2;
  position: absolute;

  width: 100%;
  height: 10%;

  bottom: 0;

  opacity: 0;
  filter: blur(24px);
  animation: gradient-fade-in 1.25s 1s ease-in forwards;
}

.PluginCardFigma-GradientBlock {
  opacity: 0.75;
  animation: gradient-shining 5s var(--d, 0) ease-in-out infinite;
}

@keyframes gradient-fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 0.5;
  }
}

@keyframes gradient-shining {
  0%,
  100% {
    width: 40%;
    opacity: 0.75;
    transform: scaleY(0.65);
  }

  50% {
    width: var(--w);
    opacity: 1;
    transform: scaleY(1);
  }
}
</style>
