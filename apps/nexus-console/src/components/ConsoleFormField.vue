<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{
  label: string
  hint?: string
  invalid?: boolean
  forId?: string
}>(), {
  invalid: false,
})

const fallbackId = useId()
</script>

<template>
  <div class="ConsoleFormField" :class="{ 'is-invalid': invalid }">
    <label v-if="forId" class="ConsoleFormField-Label" :for="forId">{{ label }}</label>
    <span v-else :id="fallbackId" class="ConsoleFormField-Label">{{ label }}</span>
    <div class="ConsoleFormField-Control">
      <slot :label-id="fallbackId" />
    </div>
    <p v-if="hint" class="ConsoleFormField-Hint">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.ConsoleFormField {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.ConsoleFormField-Label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--tx-text-color-regular);
}

.ConsoleFormField-Control {
  min-width: 0;
}

.ConsoleFormField-Hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--tx-text-color-regular);
}

.ConsoleFormField.is-invalid .ConsoleFormField-Hint {
  color: var(--tx-color-danger);
}
</style>
