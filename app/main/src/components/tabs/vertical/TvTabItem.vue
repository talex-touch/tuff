<template>
  <div class="TvTabItem-Container" :class="{ active, disabled }">
    <div class="TvTabs-Tab-Icon">
      <remix-icon  :name="icon" />
    </div>
<!--    :style="select(type) ? 'fill' : 'line'"-->
    <div class="TvTabs-Tab-Name">{{ name }}</div>
  </div>
</template>

<script>
export default {
  name: "TvTabItem"
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
.TvTabItem-Container {
  &.active {
    background-color: var(--el-color-primary-light-5) !important;
    border: 1px solid var(--el-color-primary);
  }
  .TTabs-Tab-Icon {
    position: relative;
    //margin-right: 5px;

    bottom: -0.125em;
  }
  &:hover {
    background-color: var(--el-color-primary-light-9);
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
  padding: 6px 8px;
  margin-right: 5px;

  //height: 100%;

  flex-direction: column;
  justify-content: center;
  align-items: center;

  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  border-radius: 4px;
  text-indent: 5px;
  transition: all .25s;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color);
}
</style>