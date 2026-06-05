import type { ComputedRef } from 'vue'
import type { TxRadioGroupProps, TxRadioValue } from './types'
import { computed, ref, watch } from 'vue'

type RadioGroupEmit = {
  (e: 'update:modelValue', v: TxRadioValue): void
  (e: 'change', v: TxRadioValue): void
}

interface UseRadioGroupModelOptions {
  props: Readonly<TxRadioGroupProps>
  updateModelOnSettled: ComputedRef<boolean>
  emit: RadioGroupEmit
}

export function useRadioGroupModel(options: UseRadioGroupModelOptions) {
  const { props, updateModelOnSettled, emit } = options
  const localModelValue = ref<TxRadioValue | undefined>(props.modelValue)
  const pendingModelValue = ref<TxRadioValue | null>(null)

  function emitModelValue(v: TxRadioValue) {
    emit('update:modelValue', v)
    emit('change', v)
  }

  function commitPendingModelValue() {
    if (!updateModelOnSettled.value) {
      return
    }
    const pending = pendingModelValue.value
    if (pending == null) {
      return
    }
    if (pending === props.modelValue) {
      pendingModelValue.value = null
      return
    }
    pendingModelValue.value = null
    emitModelValue(pending)
  }

  watch(
    updateModelOnSettled,
    () => {
      pendingModelValue.value = null
      localModelValue.value = props.modelValue
    },
    { immediate: true },
  )

  watch(
    () => props.modelValue,
    (v) => {
      if (!updateModelOnSettled.value) {
        return
      }
      pendingModelValue.value = null
      localModelValue.value = v
    },
  )

  const model = computed<TxRadioValue | undefined>({
    get: () => (updateModelOnSettled.value ? localModelValue.value : props.modelValue),
    set: (v) => {
      if (v == null) {
        return
      }
      if (!updateModelOnSettled.value) {
        emitModelValue(v)
        return
      }
      if (localModelValue.value === v) {
        return
      }
      localModelValue.value = v
      pendingModelValue.value = v
    },
  })

  return {
    model,
    commitPendingModelValue,
  }
}
