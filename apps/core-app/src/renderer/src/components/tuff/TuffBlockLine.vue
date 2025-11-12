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
  align-items: flex-start;
  padding: 6px 18px 6px 50px;
  min-height: 36px;
  border-radius: 12px;

  --fake-color: var(--el-fill-color);
  --fake-opacity: 0.45;

  .TBlockLine-Title {
    width: 120px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color);
  }

  .TBlockLine-Description {
    flex: 1;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-line;
  }

  .TBlockLine-LinkSlot {
    margin-left: auto;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-color-primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &.link {
    cursor: pointer;
    padding-top: 4px;
    padding-bottom: 4px;
    --fake-color: var(--el-fill-color);
    --fake-opacity: 0.4;

    .TBlockLine-Title {
      width: auto;
      color: var(--el-color-primary);
    }

    .TBlockLine-LinkSlot {
      color: var(--el-color-primary);
    }

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
