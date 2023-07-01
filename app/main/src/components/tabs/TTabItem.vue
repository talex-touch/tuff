<template>
  <div class="TTabItem-Container fake-background" :class="{ active, disabled }">
    <div class="TTabs-Tab-Icon">
      <remix-icon :non-style="nonStyle" :name="icon" />
    </div>
<!--    :style="select(type) ? 'fill' : 'line'"-->
    <div class="TTabs-Tab-Name">{{ name }}</div>
  </div>
</template>

<script>
export default {
  name: "TTabItem"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { inject, ref, watchEffect } from 'vue'

const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  active: {
    type: Function
  },
  disabled: {
    type: Boolean,
    default: false
  },
  nonStyle: {
    type: Boolean
  },
  activation: {
    type: Boolean,
    default: false
  }
})

const active = ref(false)
watchEffect(() => {
  active.value = props?.active?.(props.name)
})

// const select = inject('select')
// const type = inject('type')()
</script>

<style lang="scss" scoped>
.TTabItem-Container {
  &.active {
    --fake-color: var(--el-fill-color-dark) !important;
  }
  .TTabs-Tab-Icon {
    position: relative;
    //margin-right: 5px;

    bottom: -0.125em;
  }
  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
  &.disabled {
    cursor: not-allowed;
    opacity: .5;
    --fake-color: transparent;
  }
  z-index: 0;
  position: relative;
  display: flex;
  margin: 5px;
  padding: 6px 8px;

  cursor: pointer;
  user-select: none;
  border-radius: 4px;
  text-indent: 5px;
  //transition: all .25s;
  box-sizing: border-box;

  --fake-color: transparent;
  --fake-radius: 4px;
}

.touch-blur .TTabItem-Container {
  &.active {
    --fake-color: var(--el-fill-color-lighter) !important;
  }
  --fake-opacity: .25;
}
</style>