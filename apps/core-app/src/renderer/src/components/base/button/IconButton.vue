<template>
  <div
    @click="handleClick"
    @mouseenter="hover = true"
    :class="{ plain, small, select: _select, undot, scaleUpper, middle }"
    @mouseleave="hover = false"
    role="button"
    class="IconButton-Container fake-background transition"
  >
    <div class="IconButton-Icon">
      <slot :hover="hover" :select="_select" :style="_select || hover ? 'fill' : 'line'">
        <remix-icon :name="icon" :style="_select || hover ? 'fill' : 'line'" />
      </slot>
    </div>
  </div>
</template>

<script name="IconButton" lang="ts" setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  icon: {
    type: String
  },
  direct: {
    type: String,
    required: false
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
  undot: {
    type: Boolean
  },
  scaleUpper: {
    type: Boolean
  },
  middle: {
    type: Boolean
  }
})

const router = useRouter()
const route = useRoute()

const hover = ref(false)
const _select = ref(false)

watch(
  () => route.path,
  () => {
    if (props.hasOwnProperty('select')) _select.value = props.select
    if (props.direct) {
      _select.value = route.path === props.direct

      // if (  _select.value )
      // console.log( route, props.direct, _select.value )
    }
  }
)

function handleClick() {
  props.direct && router.push(props.direct)
}
</script>

<style lang="scss" scoped>
.IconButton-Container {
  &.scaleUpper {
    animation: scale-up-center 0.4s cubic-bezier(0.785, 0.135, 0.15, 0.86) both;
  }
  &.plain {
    &:after {
      content: '';
      position: absolute;

      top: 50%;
      left: -10px;

      width: 5px;
      height: 10px;

      border-radius: 5px;
      background-color: var(--el-fill-color);
      opacity: var(--fake-opacity);

      transform: translateY(-50%);
      transition: 0.25s;
    }
    &.select {
      --fake-opacity: 0.75;
      &:after {
        height: 25px;

        background-color: var(--el-color-primary);
      }
    }

    --fake-opacity: 0.5;

    background-color: transparent;
    border: none;
    box-shadow: none;
  }
  &.undot {
    &:after {
      display: none;
    }
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
  &.middle {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    .IconButton-Icon {
      line-height: 32px;
      font-size: 18px;
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
      opacity: 0.9;
    }
    padding: 5px;

    font-size: 20px;
  }
  &:active {
    &:after {
      transform: translate(-100%, -50%) scale(1.5) !important;
    }
    transform: scale(0.75);
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
  --fake-opacity: 0.5;
}
</style>
