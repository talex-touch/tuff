<script setup lang="ts">

withDefaults(
  defineProps<{
    label?: string
    icon?: string
    color?: string
    background?: string
    border?: string
    size?: 'sm' | 'md'
    closable?: boolean
    disabled?: boolean
  }>(),
  {
    label: '',
    icon: '',
    color: undefined,
    background: '',
    border: '',
    size: 'sm',
    closable: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
  (e: 'close'): void
}>()

</script>

<template>
  <TxTag
    :label="label"
    :icon="icon"
    :color="color"
    :background="background"
    :border="border"
    :size="size"
    :closable="closable"
    :disabled="disabled"
    v-bind="$attrs"
    @click="(event) => emit('click', event)"
    @close="() => emit('close')"
  >
    <slot />
  </TxTag>
</template>
