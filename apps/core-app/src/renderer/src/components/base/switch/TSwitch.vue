<script lang="ts" name="TSwitch" setup>
// Legacy adaptor: new CoreApp code should import TxSwitch from @talex-touch/tuffex/switch.
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})
const emits = defineEmits(['update:modelValue', 'change'])

const model = useModelWrapper(props, emits)

function handleChange(value: boolean) {
  emits('change', value)
}
</script>

<template>
  <TxSwitch v-model="model" :disabled="disabled" @change="handleChange" />
</template>
