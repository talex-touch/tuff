<template>
  <div class="ViewEye-Container" :class="{ visible }">

  </div>
</template>

<script setup>

defineProps({ visible: Boolean })

</script>

<script>
export default {
  name: "ViewEye"
}
</script>

<style lang="scss" scoped>
@keyframes wave {

  0%, 6% {
    transform: scaleY(0) translateY(10%);
  }

  70%, 84% {
    transform: scaleY(.85);
  }

  5%, 10%, 100% {
    transform: scaleY(1);
  }

}

.ViewEye-Container {
  &:before {
    content: "";
    position: absolute;

    width: 6px;
    height: 6px;

    left: 50%;
    top: 50%;

    border-radius: 50%;
    background-color: var(--el-text-color-regular);
    border: 1px solid var(--el-text-color-regular);
    transform: translate(-50%, -50%);
    transition: .3s cubic-bezier(.25,.8,.25,1);
  }
  &:after {
    content: "";
    position: absolute;

    width: 1px;
    height: 20px;

    left: 50%;
    top: 50%;

    box-shadow: 1px 0 0 0 var(--el-bg-color);
    background-color: var(--el-text-color-regular);
    transform: translate(-50%, -50%) rotate(45deg) translateX(-1px) translateY(-50%) scaleY(0);
    transition: .3s cubic-bezier(.25,.8,.25,1);
  }
  position: relative;
  display: inline-block;

  width: 16px;
  height: 10px;

  border-radius: 40px / 30px;
  border: 1px solid var(--el-text-color-regular);
  animation: wave 8.25s infinite;
}

.ViewEye-Container.visible {
  animation: wave 0;
  &:before {
    background-color: rgba(0, 0, 0, 0);
  }
  &:after {
    transform: translate(-50%, -50%) rotate(45deg) translateX(-1px);
  }
}

</style>
