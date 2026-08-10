<script lang="ts" setup>
import { reactive, watch } from 'vue'

defineOptions({ name: 'FlatCodeInput' })

const emits = defineEmits(['input'])

const codes = reactive<number[]>([])

function inputCode(code: number): void {
  const i = codes.indexOf(code)
  if (i !== -1) {
    codes.splice(i, 1)
  } else {
    codes.push(code)
  }
}

watch(codes, (val) => {
  if (val.length === 6) {
    emits('input', val.join(''))
  }
})
</script>

<template>
  <div class="FlatCodeInput-Container">
    <!--
      Buttons, not spans: each digit toggles in and out of the code, so it is an action and
      needs to be focusable and Enter/Space-operable. aria-pressed carries the selected state
      that was previously conveyed by the `active` class alone (#509).

      The `disabled` class is deliberately NOT mapped to aria-disabled: inputCode ignores it and
      the digit still toggles, so announcing "disabled" would describe behaviour the component
      does not have.
    -->
    <button
      v-for="i in 9"
      :key="i"
      type="button"
      :class="{
        active: codes.includes(i),
        disabled: codes.length > 0 && codes[codes.length - 1] !== i
      }"
      class="FlatCodeInput-Item"
      :aria-pressed="codes.includes(i)"
      @click="inputCode(i)"
      v-text="i"
    />
  </div>
</template>

<style lang="scss" scoped>
.FlatCodeInput-Container {
  .FlatCodeInput-Item {
    // Was a span, so it carried no native chrome. Reset it back so promoting these to buttons
    // is an accessibility change only, not a visual one.
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: 2px;
    }

    &.active {
      opacity: 0.5;

      box-shadow: var(--tx-box-shadow-lighter);
      background-color: var(--tx-fill-color-dark);
    }
    &.active.disabled {
      opacity: 0.25;
      pointer-events: none;
    }
    position: relative;
    display: flex;

    justify-content: center;
    align-items: center;

    width: 48px;
    height: 48px;

    font-size: 18px;
    font-weight: 600;

    opacity: 0.75;
    cursor: pointer;
    border-radius: 8px;
    transition: 0.2s;
    box-shadow: var(--tx-box-shadow-light);
    background-color: var(--tx-fill-color-light);
  }
  position: relative;
  padding: 10px 16px;

  display: grid;

  align-items: center;

  grid-template-columns: repeat(3, 1fr);

  gap: 30px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>
