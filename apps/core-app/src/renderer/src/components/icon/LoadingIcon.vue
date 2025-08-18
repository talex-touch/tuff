<template>
  <div class="LoadingIcon-Container">
    <div class="LoadingIcon-Floater"></div>
  </div>
</template>

<script>
export default {
  name: 'LoadingIcon'
}
</script>

<style lang="scss" scoped>
.LoadingIcon-Container {
  .LoadingIcon-Floater {
    position: absolute;

    top: 0;
    left: 0;

    width: 8px;
    height: 8px;

    border-radius: 50%;
    background-color: var(--bg-color, var(--el-text-color-regular));
  }
  &:before {
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    border-radius: 50%;
    background-color: var(--bg-color, var(--el-text-color-regular));
    animation: floater-wave 0.65s infinite;
  }
  position: relative;

  width: 32px;
  height: 32px;

  border-radius: 50%;
  border: 2px solid var(--bg-color, var(--el-text-color-regular));
  animation: rotate 0.85s linear infinite;
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
