<script lang="ts" name="TuffBlockLine" setup>
const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    link?: boolean
  }>(),
  {
    title: '',
    description: '',
    link: false
  }
)

const emits = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

function handleClick(event: MouseEvent) {
  if (!props.link) return
  emits('click', event)
}
</script>

<template>
  <div
    class="TBlockLine-Container fake-background index-fix"
    :class="{ link: props.link }"
    @click="handleClick"
  >
    <span class="TBlockLine-Title">
      {{ title }}
    </span>
    <div v-if="!props.link" class="TBlockLine-Description">
      <slot name="description">
        {{ description }}
      </slot>
    </div>
    <div v-else class="TBlockLine-LinkSlot">
      <slot name="description" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TBlockLine-Container {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 2px 18px 2px 50px;
  min-height: 28px;
  border-radius: 0;
  transition:
    background-color 0.2s ease,
    transform 0.15s ease;

  --fake-color: var(--el-fill-color);
  --fake-opacity: 0.45;
  --fake-radius: 0;

  .TBlockLine-Title {
    width: 120px;
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    transition: color 0.2s ease;
  }

  .TBlockLine-Description {
    flex: 1;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-line;
  }

  .TBlockLine-LinkSlot {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-color-primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: color 0.2s ease;
  }

  &.link {
    cursor: pointer;
    padding-top: 2px;
    padding-bottom: 2px;
    --fake-color: var(--el-fill-color);
    --fake-opacity: 0.4;

    .TBlockLine-Title {
      width: auto;
      opacity: 0.7;
      min-width: 120px;
      color: var(--el-text-color);
      text-decoration-color: var(--el-text-color);
    }

    .TBlockLine-LinkSlot {
      color: var(--el-color-primary);
      text-decoration-color: var(--el-color-primary);
    }

    &:hover {
      text-decoration: underline;
      --fake-inner-opacity: 0.75;

      .TBlockLine-LinkSlot {
        color: var(--el-color-primary-dark-2);
      }
    }

    &:active {
      transform: scale(0.99);
    }
  }
}
</style>
