<script lang="ts" setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, provide } from 'vue'

defineOptions({
  name: 'TuffSelect',
})

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: '请选择',
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'change': [value: string | number]
}>()

const isOpen = ref(false)
const selectRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const selectedLabel = ref('')

const currentValue = computed({
  get: () => props.modelValue,
  set: (val: string | number) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function handleSelect(value: string | number, label: string) {
  currentValue.value = value
  selectedLabel.value = label
  close()
}

function handleClickOutside(event: MouseEvent) {
  if (!selectRef.value?.contains(event.target as Node)) {
    close()
  }
}

provide('tuffSelect', {
  currentValue,
  handleSelect,
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="selectRef"
    :class="[
      'tuff-select',
      {
        'is-open': isOpen,
        'is-disabled': disabled,
      },
    ]"
  >
    <div class="tx-select__trigger" @click="toggle">
      <span :class="['tx-select__value', { 'is-placeholder': !selectedLabel }]">
        {{ selectedLabel || placeholder }}
      </span>
      <span class="tx-select__arrow">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"/>
        </svg>
      </span>
    </div>
    
    <Transition name="tx-select-dropdown">
      <div v-show="isOpen" ref="dropdownRef" class="tx-select__dropdown">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.tuff-select {
  position: relative;
  display: inline-block;
  width: 100%;

  &__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--tx-border-color, #dcdfe6);
    border-radius: 4px;
    background-color: var(--tx-bg-color, #fff);
    cursor: pointer;
    transition: all 0.25s;

    &:hover {
      border-color: var(--tx-color-primary-light-3, #79bbff);
    }
  }

  &__value {
    flex: 1;
    font-size: 14px;
    color: var(--tx-text-color-primary, #303133);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-placeholder {
      color: var(--tx-text-color-placeholder, #a8abb2);
    }
  }

  &__arrow {
    display: flex;
    align-items: center;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.3s;
  }

  &__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1000;
    width: 100%;
    padding: 4px 0;
    background-color: var(--tx-bg-color, #fff);
    border: 1px solid var(--tx-border-color-light, #e4e7ed);
    border-radius: 4px;
    box-shadow: var(--tx-box-shadow-light, 0 2px 12px rgba(0, 0, 0, 0.1));
  }

  &.is-open {
    .tuff-select__trigger {
      border-color: var(--tx-color-primary, #409eff);
    }

    .tuff-select__arrow {
      transform: rotate(180deg);
    }
  }

  &.is-disabled {
    .tuff-select__trigger {
      background-color: var(--tx-disabled-bg-color, #f5f7fa);
      cursor: not-allowed;
    }

    .tuff-select__value {
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }
}

.tuff-select-dropdown-enter-active,
.tuff-select-dropdown-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.tuff-select-dropdown-enter-from,
.tuff-select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
