<template>
  <div class="ProgressBar-Container" :class="{ loading, error, warn, success }">

  </div>
</template>

<script setup>
import { defineProps } from 'vue'

defineProps({
  loading: false, error: false, warn: false, success: false
})

</script>

<script>
export default {
  name: "ProgressBar"
}
</script>

<style lang="scss" scoped>
.error {

  --bar-color: var(--el-color-error);

  animation: mention 10s forwards;

}

.success {

  --bar-color: var(--el-color-success);

  animation: mention 10s forwards;

}

.loading {

  animation: loadingFrame 1.25s infinite linear;

}

.warn {

  --bar-color: var(--el-color-warning);

  animation: mention 10s forwards;

}

.ProgressBar-Container {
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 3px;

  background-color: var(--bar-color, var(--el-color-primary));
}

@keyframes mention {

  0% {

    height: 5px;

  }

  5%, 95% {

    height: 5px;

    background-color: var(--bar-color, rgba(0, 0, 0, 0));

  }

  100% {

    height: 3px;

    background-color: var(--bar-color, rgba(0, 0, 0, 0));

  }

}

@keyframes loadingFrame {

  0% {

    left: 0;
    width: 0;

  }

  20% {

    left: 0;
    width: 50%;

  }

  40% {

    left: 25%;
    width: 75%;

  }

  60% {

    left: 50%;
    width: 100%;

  }

  80% {

    left: 75%;
    width: 25%;

  }

  100% {

    left: 100%;
    width: 1px;

  }

}
</style>
