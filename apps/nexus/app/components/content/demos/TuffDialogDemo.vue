<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  triggerLabel?: string
  title?: string
  content?: string
  cancelLabel?: string
  confirmLabel?: string
}>(), {
  triggerLabel: 'Open Dialog',
  title: 'Dialog',
  content: '',
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
})

const dialogOpen = ref(false)
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton @click="dialogOpen = true">
      {{ props.triggerLabel }}
    </TxButton>
  </div>
  <TxModal v-model="dialogOpen" :title="props.title">
    <p>{{ props.content }}</p>
    <template #footer>
      <TxButton variant="ghost" @click="dialogOpen = false">
        {{ props.cancelLabel }}
      </TxButton>
      <TxButton @click="dialogOpen = false">
        {{ props.confirmLabel }}
      </TxButton>
    </template>
  </TxModal>
</template>
