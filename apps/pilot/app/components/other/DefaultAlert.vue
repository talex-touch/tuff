<script setup lang="ts">
const props = defineProps<{
  title: string
  icon: string
}>()
</script>

<template>
  <div class="DefaultAlert">
    <div class="icon">
      <div :class="icon" />
    </div>
    <div class="content">
      <p>{{ title }}</p>
      <span>
        <slot />
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.DefaultAlert {
  .icon {
    div {
      width: 100%;
      height: 100%;
    }

    position: relative;
    margin: 0.5rem 0;
    padding: 1rem;

    width: 64px;
    height: 64px;

    border-radius: 18px;
    background-color: #fce4c2e0;
  }

  .content {
    z-index: 1;
    position: relative;
    display: flex;

    flex-direction: column;
    justify-content: center;

    max-width: calc(100% - 2rem - 64px);

    p {
      margin: 0.5rem 0;

      font-size: 16px;
      font-weight: 600;
    }

    span {
      font-size: 14px;
      color: #666666;

      flex-wrap: wrap;
      // white-space: pre-wrap;
      word-break: break-all;
    }
  }

  position: relative;
  // padding: 1rem;
  display: flex;

  gap: 2rem;

  width: 100%;
  height: auto;
}
</style>
