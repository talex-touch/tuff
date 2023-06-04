<template>
  <div class="MusicWaving-Container" :class="{ active, playing: !playing }">
    <div class="MusicWaving-Icon">

    </div>
    <slot />
  </div>
</template>

<script>
export default {
  name: "MusicWaving"
}
</script>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps(['active', 'playing'])
</script>

<style lang="scss" scoped>
@keyframes waving {
  0% {
    height: 0%;
  }
  100% {
    height: var(--height);
  }
}

.playing .MusicWaving-Icon {
  &:after {
    --height: 80%;
    animation: waving .35s infinite alternate;
  }
  &:before {
    --height: 60%;
    animation: waving .3s infinite alternate;
  }

  --height: 40%;
  animation: waving .25s infinite alternate;
}

.MusicWaving-Icon {
  &:before, &:after {
    content: "";
    position: absolute;

    top: 50%;
    left: 50%;

    width: 3px;
    height: 40%;

    --height: 100%;
    transform: translate(-300%, -50%);
    animation: waving .5s infinite alternate;
    background-color: var(--el-color-primary);
  }
  &:before {
    --height: 80%;
    transform: translate(200%, -50%);
  }
  position: absolute;

  top: 50%;
  left: 50%;

  width: 3px;
  height: 40%;

  opacity: 0;

  --height: 6%;
  transform: translate(-50%, -50%);
  animation: waving .5s infinite alternate;
  background-color: var(--el-color-primary);
}

.MusicWaving-Container {
  &.active .MusicWaving-Icon {
    opacity: 1;
  }
  &.active:before {
    content: "";
    position: absolute;
    
    left: 0;
    top: 0;
    
    width: 100%;
    height: 100%;

    opacity: .5;
    background-color: var(--el-overlay-color);
  }
  img {
    width: 100%;
    height: 100%;
  }
  position: relative;

  width: 100%;
  height: 100%;
  
  border-radius: 8px;
  overflow: hidden;
}
</style>