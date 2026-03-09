<script setup lang="ts">

</script>

<template>
  <div class="login-core">
    <div class="login-core-bg" />
    <div class="login-core-bg shine" />
    <div class="login-core-mask" />

    <span class="name-logo">AI</span>

    <div v-for="i in 10" :key="i" class="login-shaving" :style="`--d: ${i * 1}s`" />
  </div>
</template>

<style lang="scss">
.login-shaving {
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  border-radius: 16px;
  transform: scale(0);
  border: 1px solid #1d2431;

  animation: shining_r 5s var(--d) linear infinite;
}

@keyframes shining_r {
  0% {
    opacity: 0;
    transform: scale(0) rotate(0);
  }

  50% {
    opacity: 1;
    transform: scale(1) rotate(180deg);
  }

  100% {
    opacity: 0;
    transform: scale(2) rotate(360deg);
  }
}

.name-logo {
  z-index: 2;

  font-size: 30px;

  font-weight: 600;
  background-image: linear-gradient(to bottom, #dedfdf 20%, #575c64);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.login-core {
  position: relative;
  display: flex;

  align-items: center;
  justify-content: center;

  width: 82px;
  height: 82px;

  border-radius: 16px;
  background-color: red;
}

.login-core-mask {
  z-index: 1;
  position: absolute;

  top: 1.5%;
  left: 1.5%;

  width: 97%;
  height: 97%;

  border-radius: 16px;
  background: #1d2431;
}

.login-core-bg {
  &.shine {
    z-index: 0;
    filter: blur(10px);
  }
  z-index: 1;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  border-radius: 16px;
  background-image: linear-gradient(to top, #ffcb8f 0%, #452ad5 100%);
}
</style>
