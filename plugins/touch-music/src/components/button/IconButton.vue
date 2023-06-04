<template>
  <div @click="handleClick" @mouseenter="hover = true"
       :class="{ plain, small, select }"
       @mouseleave="hover = false" role="button" class="IconButton-Container fake-background transition">
    <div class="IconButton-Icon">
      <remix-icon v-if="activeIcon && icon && select" :name="activeIcon" />
      <remix-icon v-else-if="activeIcon && icon" :name="icon" />
      <remix-icon v-else-if="icon" :name="icon" :style="select || hover ? 'fill' : 'line'" />
      <slot v-else name="icon" :hover="hover" :select="select"></slot>
    </div>

<!--    <div v-if="display !== 'popover'" class="IconButton-Text">-->
<!--      <slot name="text" />-->
<!--    </div>-->
  </div>
</template>

<script>
export default {
  name: "IconButton"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { ref, watchEffect } from 'vue'

const props = defineProps({
  icon: {
    type: String
  },
  plain: {
    type: Boolean
  },
  small: {
    type: Boolean
  },
  select: {
    type: Boolean
  },
  activeIcon: {
    type: String,
    required: false
  }
})

const hover = ref(false)
const select = ref(false)

watchEffect(() => {
  // if (props.direct) select.value = (route.path === props.direct)
  if ( props.hasOwnProperty('select') ) select.value = props.select
})

// function handleClick() {
//   props.direct && router.push( props.direct )
// }
</script>

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
    box-shadow: var(--el-box-shadow-lighter);
  }
  &:hover {
    --fake-color: var(--el-fill-color-lighter);
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

  cursor: pointer;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow);
  --fake-color: var(--el-fill-color);
  --fake-radius: 8px;
  --fake-opacity: .5;
}
</style>