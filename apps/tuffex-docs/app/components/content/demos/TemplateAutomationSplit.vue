<script setup lang="ts">
// The Automation template's centre column. Wide, a TxSplitter puts the run log
// under the canvas; narrower, the log moves to the rail and the canvas stands
// alone. The canvas is one subtree either way, so the template writes it once
// as slot `a` instead of once per breakpoint.
defineProps<{
  split: boolean
}>()

defineSlots<{
  a: () => unknown
  b: () => unknown
}>()

const ratio = defineModel<number>({ default: 0.72 })
</script>

<template>
  <TxSplitter
    v-if="split"
    v-model="ratio"
    class="template-automation-split"
    direction="vertical"
    :min="0.5"
    :max="0.8"
  >
    <template #a>
      <slot name="a" />
    </template>
    <template #b>
      <slot name="b" />
    </template>
  </TxSplitter>
  <div v-else class="template-automation-split template-automation-split--single">
    <slot name="a" />
  </div>
</template>

<style scoped>
.template-automation-split--single {
  height: 100%;
}

/* The splitter draws its own frame; here it is a pane of the app, so the frame
   goes and the grip becomes a quiet handle on the dividing line. */
.template-automation-split.tx-splitter {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.template-automation-split :deep(.tx-splitter__bar) {
  box-shadow: inset 0 1px 0 var(--tx-border-color-lighter, #ebeef5);
}

.template-automation-split :deep(.tx-splitter__grip) {
  width: 36px;
  height: 4px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-border-color, #dcdfe6);
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
</style>
