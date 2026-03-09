<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const model = useVModel(props, 'modelValue', emit)

function toggle() {
  if (props.disabled)
    return

  model.value = !model.value
}
</script>

<template>
  <label :class="{ disabled }" class="ThCheckBox">
    <input v-model="model" type="checkbox" @click="toggle">
    <div class="checkmark" />
  </label>
</template>

<style lang="scss">
.ThCheckBox.disabled {
  * {
    pointer-events: none !important;
  }

  pointer-events: none !important;
}

/* Hide the default checkbox */
.ThCheckBox input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.ThCheckBox {
  margin: 0 0.5rem;

  display: block;
  position: relative;
  cursor: pointer;
  // font-size: 18px;
  user-select: none;
}

/* Create a custom checkbox */
.checkmark {
  position: relative;
  top: 0;
  left: 0;
  height: 1.3em;
  width: 1.3em;
  background: black;
  border-radius: 50px;
  transition: all 0.7s;
  --spread: 20px;
}

/* When the checkbox is checked, add a blue background */
.ThCheckBox input:checked ~ .checkmark {
  background: black;
  box-shadow:
    -10px -10px var(--spread) 0px #5b51d8,
    0 -10px var(--spread) 0px #833ab4,
    10px -10px var(--spread) 0px #e1306c,
    10px 0 var(--spread) 0px #fd1d1d,
    10px 10px var(--spread) 0px #f77737,
    0 10px var(--spread) 0px #fcaf45,
    -10px 10px var(--spread) 0px #ffdc80;
}

/* Create the checkmark/indicator (hidden when not checked) */
.checkmark:after {
  content: '';
  position: absolute;
  display: none;
}

/* Show the checkmark when checked */
.ThCheckBox input:checked ~ .checkmark:after {
  display: block;
}

/* Style the checkmark/indicator */
.ThCheckBox .checkmark:after {
  left: 0.5em;
  top: 0.3em;
  width: 0.25em;
  height: 0.5em;
  border: solid #f0f0f0;
  border-width: 0 0.15em 0.15em 0;
  transform: rotate(45deg);
}
</style>
