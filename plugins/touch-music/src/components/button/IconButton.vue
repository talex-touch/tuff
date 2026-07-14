<script setup lang="ts">
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { TxIconButton } from '@talex-touch/tuffex/icon-button'

defineOptions({
  name: 'IconButton',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  icon?: string
  label?: string
  plain?: boolean
  small?: boolean
  select?: boolean
  activeIcon?: string
}>(), {
  icon: '',
  label: '',
  plain: false,
  small: false,
  select: false,
  activeIcon: '',
})
</script>

<template>
  <TxIconButton
    class="IconButton-Container transition"
    :class="{ plain: props.plain, small: props.small, select: props.select }"
    :size="props.small ? 'xs' : 'lg'"
    :pressed="props.select"
    :aria-label="props.label || props.icon || 'Icon action'"
    v-bind="$attrs"
  >
    <template #default="{ hover }">
      <RemixIcon v-if="props.activeIcon && props.icon && props.select" :name="props.activeIcon" />
      <RemixIcon v-else-if="props.activeIcon && props.icon" :name="props.icon" />
      <RemixIcon v-else-if="props.icon" :name="props.icon" :style="props.select || hover ? 'fill' : 'line'" />
      <slot v-else name="icon" :hover="hover" :select="props.select" />
    </template>
  </TxIconButton>
</template>

<style lang="scss" scoped>
.IconButton-Container {
  --tx-icon-button-radius: 8px;
  --tx-icon-button-bg-hover: var(--tx-fill-color-lighter);

  box-shadow: var(--tx-box-shadow);

  &.plain {
    --tx-icon-button-bg-hover: transparent;

    box-shadow: none;
  }

  &.small {
    --tx-icon-button-radius: 4px;

    :deep(.remix) {
      font-size: 14px;
    }
  }

  &.select {
    box-shadow: var(--tx-box-shadow-lighter);
  }

}
</style>
