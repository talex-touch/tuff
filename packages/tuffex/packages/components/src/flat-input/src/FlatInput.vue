<script lang="ts" setup>
import { computed, ref } from 'vue'
import { TxTag } from '../../tag/index'

defineOptions({
  name: 'FlatInput',
})

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    icon?: string
    password?: boolean
    nonWin?: boolean
    area?: boolean
  }>(),
  {
    placeholder: '',
    icon: '',
    password: false,
    nonWin: false,
    area: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

const capsLockOn = ref(false)

function onKeyDown(e: KeyboardEvent) {
  if (!props.password)
    return

  const keyCode = (e as any).keyCode ? (e as any).keyCode : (e as any).which
  const shift = (e as any).shiftKey ? (e as any).shiftKey : keyCode === 16

  capsLockOn.value
    = ((keyCode >= 65 && keyCode <= 90) && !shift) || ((keyCode >= 97 && keyCode <= 122) && shift)
}
</script>

<template>
  <div
    tabindex="0"
    class="flat-input fake-background"
    :class="{ 'none-prefix': !$slots?.default, 'win': nonWin !== true, area }"
    @keydown="onKeyDown"
  >
    <span v-if="$slots.default" class="flat-input__prefix">
      <slot>
        <i v-if="icon" :class="icon" />
      </slot>
    </span>

    <textarea
      v-if="area"
      v-model="value"
      :placeholder="placeholder"
      class="flat-input__control"
    />

    <input
      v-else
      v-model="value"
      :placeholder="placeholder"
      :type="password ? 'password' : 'text'"
      class="flat-input__control"
    >

    <TxTag
      v-if="password && capsLockOn"
      class="flat-input__caps"
      label="Caps Lock"
      color="var(--tx-color-danger)"
    />
  </div>
</template>

<style lang="scss" scoped>
.flat-input {
  position: relative;
  padding-top: 2px;
  padding-right: 5px;
  display: grid;
  grid-template-columns: 1fr 5fr;
  width: 100%;
  height: 32px;
  line-height: 32px;
  border-radius: 8px;
  box-sizing: border-box;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  --fake-radius: 8px;
  transition: border-color 0.25s, box-shadow 0.25s;

  &:hover {
    border-color: var(--tx-color-primary-light-3, #79bbff);
    box-shadow: 0 0 2px 1px var(--tx-color-primary-light-5, #a0cfff);
  }

  &:focus-within {
    border-color: var(--tx-color-primary, #409eff);
    box-shadow:
      0 0 2px 1px var(--tx-color-primary-light-3, #79bbff),
      0 0 4px 2px var(--tx-color-primary-light-5, #a0cfff);
  }
}

.flat-input__prefix {
  position: relative;
  padding-left: 6px;
  display: flex;
  margin-bottom: 0.15rem;
  align-items: center;
  font-size: 18px;
  color: var(--tx-text-color-primary, #303133);
}

.flat-input__control {
  height: calc(100% - 4px);
  width: calc(100% - 2px);
  outline: none;
  border: none;
  font-size: 16px;
  background-color: transparent;
  color: var(--tx-text-color-primary, #303133);

  &::placeholder {
    color: var(--tx-text-color-placeholder, #a8abb2);
  }
}

textarea.flat-input__control {
  width: 100%;
  resize: none;
}

.flat-input.none-prefix {
  padding: 0 5px;
  grid-template-columns: 1fr;
}

.flat-input.area {
  height: 10rem;
}

.flat-input.win {
  &:before {
    filter: invert(0.25);
    --fake-opacity: 0.25;
    --fake-inner-opacity: 0.25;
  }

  &:hover {
    &:before {
      --fake-opacity: 0.35;
      --fake-inner-opacity: 0.35;
    }

    border-color: var(--tx-border-color, #dcdfe6);
    border-bottom: 1px solid var(--tx-border-color, #dcdfe6);
    box-shadow: none;
  }

  &:focus-within {
    &:before {
      filter: invert(0.05);
      --fake-opacity: 0.5;
      --fake-inner-opacity: 0.5;
    }

    border-color: var(--tx-border-color, #dcdfe6);
    border-bottom: 2px solid var(--tx-color-primary, #409eff);
    box-shadow: none;
  }

  border-radius: 8px;
  --fake-radius: 8px !important;
  border-bottom: 1px solid var(--tx-border-color, #dcdfe6);
}

.flat-input__caps {
  position: absolute;
  top: -30px;
  right: 0;
  font-size: 12px;
}
</style>
