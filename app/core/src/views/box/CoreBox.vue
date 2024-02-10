<script setup lang="ts" name="CoreBox">
const searchVal = ref("");
</script>

<template>
  <div class="CoreBox fake-background">
    <FlatInput
      placeholder="Type what you want to search by talex-touch."
      v-model="searchVal"
    />
  </div>
</template>

<style lang="scss">
div.CoreBox {
  .FlatInput-Container {
    height: 100% !important;

    opacity: 0.75;
  }

  z-index: 100000000;
  position: absolute;
  display: none;

  justify-content: center;

  width: 80%;
  height: 50px;

  left: 50%;
  top: 20%;

  transform: translate(-50%, -50%);
  backdrop-filter: saturate(180%) brightness(0.9) blur(5px);

  .core-box & {
    display: flex;
  }
}

.core-box .AppLayout-Wrapper {
  filter: saturate(180%) brightness(0.9) blur(5px);
  transform: scale(1.0125);

  user-select: none;
  pointer-events: none;
  -webkit-app-region: drag;
}
</style>
