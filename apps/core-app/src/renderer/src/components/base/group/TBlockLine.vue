<template>
  <div class="TBlockLine-Container fake-background index-fix" :class="{ link }">
    <span class="TBlockLine-Title">
      {{ title }}
    </span>

    <div v-if="!link" class="TBlockLine-Description">
      <slot name="description">
        {{ description }}
      </slot>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'TBlockLine'
}
</script>

<script lang="ts" setup>
defineProps({
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  link: {
    type: Boolean,
    default: false
  }
})
</script>

<style lang="scss" scoped>
.TBlockLine-Container {
  &.link {
    &:hover .TBlockLine-Title {
      background-color: var(--el-fill-color-dark);
    }

    .TBlockLine-Title {
      position: relative;
      padding: 2px 6px;

      left: 32px;

      font-size: 13px;

      cursor: pointer;
      width: max-content;
      border-radius: 4px;
      text-indent: 0;
      //transform: scale(.9);
    }

    display: flex;
    align-items: center;

    padding: 1px 12px;

    font-size: 12px;
    color: var(--el-color-primary-dark-2);
  }

  .TBlockLine-Title {
    font-size: 14px;
    font-weight: 500;
    color: var(--el-text-color);
  }

  .TBlockLine-Description {
    position: absolute;

    left: 120px;

    opacity: 0.5;
    font-size: 13px;
  }

  position: relative;
  padding: 6px 18px 2px 18px;
  display: flex;

  height: 24px;

  --fake-color: var(--el-fill-color);
  --fake-opacity: 0.45;
}
</style>
