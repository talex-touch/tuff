<template>
  <div class="tx-collapse">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import type { CollapseContext } from './types'

interface Props {
  accordion?: boolean
  modelValue?: string | string[]
}

interface Emits {
  'update:modelValue': [value: string | string[]]
  change: [value: string | string[]]
}

const props = withDefaults(defineProps<Props>(), {
  accordion: false
})

const emit = defineEmits<Emits>()

const activeNames = ref<string[]>([])

if (props.modelValue) {
  activeNames.value = Array.isArray(props.modelValue) 
    ? props.modelValue 
    : [props.modelValue]
}

watch(() => props.modelValue, (newValue) => {
  if (newValue !== undefined) {
    activeNames.value = Array.isArray(newValue) ? newValue : [newValue]
  }
}, { immediate: true })

const setActiveNames = (names: string[]) => {
  activeNames.value = names
  
  const emitValue = props.accordion 
    ? (names.length > 0 ? names[0] : [])
    : names
    
  emit('update:modelValue', emitValue)
  emit('change', emitValue)
}

const addItem = (name: string) => {
  if (!activeNames.value.includes(name)) {
    activeNames.value.push(name)
  }
}

const removeItem = (name: string) => {
  const index = activeNames.value.indexOf(name)
  if (index > -1) {
    activeNames.value.splice(index, 1)
  }
}

const handleItemClick = (name: string) => {
  if (props.accordion) {
    if (activeNames.value.includes(name)) {
      setActiveNames([])
    } else {
      setActiveNames([name])
    }
  } else {
    if (activeNames.value.includes(name)) {
      removeItem(name)
      setActiveNames([...activeNames.value])
    } else {
      addItem(name)
      setActiveNames([...activeNames.value])
    }
  }
}

provide<CollapseContext>('collapse', {
  activeNames,
  accordion: props.accordion,
  handleItemClick
})
</script>

<style scoped>
.tx-collapse {
  border: 1px solid var(--tx-collapse-border, #e5e7eb);
  border-radius: 8px;
  background: var(--tx-collapse-bg, #ffffff);
  overflow: hidden;
}
</style>
