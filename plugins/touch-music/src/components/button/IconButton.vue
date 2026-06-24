<script>
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { ref, watchEffect } from 'vue'

defineOptions({
  name: 'IconButton',
})

const props = defineProps({
  icon: {
    type: String,
  },
  label: {
    type: String,
    default: '',
  },
  plain: {
    type: Boolean,
  },
  small: {
    type: Boolean,
  },
  select: {
    type: Boolean,
  },
  activeIcon: {
    type: String,
    required: false,
  },
})

const emit = defineEmits(['click'])

const hover = ref(false)
const select = ref(false)

watchEffect(() => {
  // if (props.direct) select.value = (route.path === props.direct)
  if (props.hasOwnProperty('select'))
    select.value = props.select
})

function handleClick(event) {
  emit('click', event)
}
</script>

<template>
  <button
    type="button"
    :aria-label="label || icon || 'Icon action'"
    :aria-pressed="props.hasOwnProperty('select') ? select : undefined"
    :class="{ plain, small, select }"
    class="IconButton-Container fake-background transition"
    @click="handleClick" @mouseenter="hover = true" @mouseleave="hover = false"
  >
    <div class="IconButton-Icon">
      <RemixIcon v-if="activeIcon && icon && select" :name="activeIcon" />
      <RemixIcon v-else-if="activeIcon && icon" :name="icon" />
      <RemixIcon v-else-if="icon" :name="icon" :style="select || hover ? 'fill' : 'line'" />
      <slot v-else name="icon" :hover="hover" :select="select" />
    </div>

    <!--    <div v-if="display !== 'popover'" class="IconButton-Text"> -->
    <!--      <slot name="text" /> -->
    <!--    </div> -->
  </button>
</template>

<style lang="scss" scoped>
.IconButton-Container {
  &.plain {
    background-color: transparent;
    border: none;
    box-shadow: none;
  }
  &.small {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    .IconButton-Icon {
      line-height: 24px;
      font-size: 14px;
    }
  }
  &.select {
    box-shadow: var(--tx-box-shadow-lighter);
  }
  &:hover {
    --fake-color: var(--tx-fill-color-lighter);
  }
  .IconButton-Icon {
    &:hover {
      opacity: .9;
    }
    padding: 5px;

    font-size: 20px;
  }
  &:active {
    transform: scale(.75)
  }
  display: flex;
  //margin: 10px 0;

  justify-content: center;
  align-items: center;

  width: 48px;
  height: 48px;

  padding: 0;
  border: 0;
  appearance: none;
  cursor: pointer;
  color: inherit;
  font: inherit;
  background: transparent;
  border-radius: 8px;
  box-shadow: var(--tx-box-shadow);
  --fake-color: var(--tx-fill-color);
  --fake-radius: 8px;
  --fake-opacity: .5;
}
</style>
