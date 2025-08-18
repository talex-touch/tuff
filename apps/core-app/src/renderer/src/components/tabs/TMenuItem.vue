<template>
  <div class="TMenuItem-Container fake-background" :class="{ active, disabled }">
    <div class="TMenu-Tab-Icon">
      <remix-icon :non-style="nonStyle" :name="icon" />
    </div>
    <div class="TMenu-Tab-Name">{{ name }}</div>
    <span class="TMenu-Referrer">
      <remix-icon name="arrow-right-s" />
    </span>
  </div>
</template>

<script>
export default {
  name: 'TMenuItem'
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { useRouter } from 'vue-router'

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
  activation: {
    type: Boolean,
    default: false
  },
  route: {
    type: String
  },
  nonStyle: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()

const active = computed(() => props?.active?.(props.name))
watch(
  () => active.value,
  (val) => val && router.push(props.route)
)
</script>

<style lang="scss" scoped>
.TMenuItem-Container {
  .TMenu-Referrer {
    position: absolute;

    top: 0.5em;
    right: 0.75em;

    opacity: 0 !important;
    transform: scale(0.75) translateX(-15px);
    transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }
  &.active {
    .TMenu-Referrer {
      opacity: 0.75 !important;
      transform: scale(1) translateX(0);
    }
    --fake-color: var(--el-fill-color-dark) !important;
  }
  .TMenu-Tab-Icon {
    position: relative;
    //margin-right: 5px;

    bottom: -0.125em;
  }
  &:hover {
    .TMenu-Referrer {
      opacity: 1;
    }
    --fake-color: var(--el-fill-color-light);
  }
  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
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
  text-indent: 0.5em;
  //transition: all .25s;
  box-sizing: border-box;

  --fake-color: transparent;
  --fake-radius: 4px;
}

.touch-blur .TMenuItem-Container {
  &.active {
    --fake-color: var(--el-fill-color-lighter) !important;
  }
  --fake-opacity: 0.25;
}
</style>
