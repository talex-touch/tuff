<template>
  <div class="TvTabItem-Container" :class="{ active: isActive, disabled }">
    <div class="TvTabs-Tab-Icon">
      <remix-icon :name="icon" />
    </div>
    <div class="TvTabs-Tab-Name">{{ name }}</div>
  </div>
</template>

<script name="TvTabItem" setup lang="ts">
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { computed } from 'vue'

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
    type: [Boolean, Function],
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const isActive = computed(() => {
  // 处理active prop可能为布尔值或函数的情况
  if (typeof props.active === 'boolean') {
    return props.active
  } else if (typeof props.active === 'function') {
    return props.active(props.name)
  }
  return false
})
</script>

<style lang="scss" scoped>
.TvTabItem-Container {
  &.active {
    .TvTabs-Tab-Name {
      color: var(--el-color-primary);
    }

    .TvTabs-Tab-Icon :deep(.remix-icon) {
      color: var(--el-color-primary);
    }
  }

  .TvTabs-Tab-Icon {
    position: relative;
    margin-bottom: 0.25rem;

    :deep(.remix-icon) {
      font-size: 1.125rem;
      transition: all 0.3s ease;
    }
  }

  .TvTabs-Tab-Name {
    position: relative;
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
    color: var(--el-text-color-primary);
    transition: color 0.3s ease;
  }

  &:hover:not(.disabled) {
    opacity: 0.85;
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;

    &:hover {
      background: transparent;
      transform: none;
      box-shadow: none;
    }
  }

  position: relative;
  display: flex;
  padding: 0.75rem 0.5rem;
  margin-right: 0.5rem;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  transition: all 0.3s ease;
  box-sizing: border-box;
  min-width: 70px;

  &:last-child {
    margin-right: 0;
  }
}

@keyframes fillFromDirection {
  0% {
    opacity: 1;
    --fill-progress: 0%;
  }
  100% {
    opacity: 1;
    --fill-progress: 100%;
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .TvTabItem-Container {
    padding: 0.5rem 0.375rem;
    min-width: 60px;

    .TvTabs-Tab-Icon {
      margin-bottom: 0.125rem;

      :deep(.remix-icon) {
        font-size: 1rem;
      }
    }

    .TvTabs-Tab-Name {
      font-size: 0.6875rem;
    }
  }
}
</style>
