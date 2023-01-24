<template>
  <div class="TTabItem-Container" :class="{ active, disabled }">
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
    background-color: var(--el-fill-color) !important;
  }
  .TTabs-Tab-Icon {
    position: relative;
    //margin-right: 5px;

    bottom: -0.125em;
  }
  &:hover {
    background-color: var(--el-fill-color-light);
  }
  &.disabled {
    cursor: not-allowed;
    opacity: .85;
    &:hover {
      background-color: transparent;
    }
  }
  position: relative;
  display: flex;
  margin: 5px 0;
  padding: 6px 8px;

  cursor: pointer;
  user-select: none;
  //border-radius: 4px;
  text-indent: 5px;
  transition: all .25s;
}
</style>