<script setup lang="ts">
const props = defineProps<{
  title: string
  icon: string
}>()
</script>

<template>
  <div class="WarnAlert">
    <div class="bg" />
    <div class="icon" :class="icon" />
    <div class="content">
      <p>{{ title }}</p>
      <span><slot /></span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.WarnAlert {
  .bg {
    position: absolute;
    padding: 1rem;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    background-image: repeating-radial-gradient(
      #f5c7a180 50%,
      #ffeecc80 70%,
      #f5c7a180 95%
    );
    background-size: 50% 200px;
    background-position: 80%;

    filter: blur(15px);
  }

  .icon {
    color: #000;
    font-size: 32px;
  }

  .content {
    z-index: 1;
    display: flex;

    flex-direction: column;
    justify-content: center;

    margin-left: 1rem;

    p {
      font-size: 16px;
      font-weight: 600;

      color: #000;
    }

    span {
      font-size: 14px;
      color: #666666;
    }
  }

  position: relative;
  padding: 1rem;
  display: flex;

  width: 100%;

  height: 72px;

  border-radius: 12px;
  background-color: #ffeecc;

  box-shadow: var(--el-box-shadow);
}
</style>
