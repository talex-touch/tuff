<script setup lang="ts">
import { toast } from '@talex-touch/tuffex/utils'

const props = withDefaults(defineProps<{
  successLabel?: string
  warningLabel?: string
  errorLabel?: string
  successTitle?: string
  successDescription?: string
  warningTitle?: string
  warningDescription?: string
  errorTitle?: string
  errorDescription?: string
}>(), {
  successLabel: 'Success',
  warningLabel: 'Warning',
  errorLabel: 'Error',
  successTitle: 'Saved',
  successDescription: '',
  warningTitle: 'Warning',
  warningDescription: '',
  errorTitle: 'Error',
  errorDescription: '',
})

function triggerSuccess() {
  toast({
    title: props.successTitle,
    description: props.successDescription,
  })
}

function triggerWarning() {
  toast({
    title: props.warningTitle,
    description: props.warningDescription,
    variant: 'warning',
  })
}

function triggerError() {
  toast({
    title: props.errorTitle,
    description: props.errorDescription,
    variant: 'danger',
  })
}
</script>

<template>
  <TxToastHost />
  <div class="tuff-demo-row">
    <TxButton @click="triggerSuccess">
      {{ props.successLabel }}
    </TxButton>
    <TxButton variant="warning" @click="triggerWarning">
      {{ props.warningLabel }}
    </TxButton>
    <TxButton variant="danger" @click="triggerError">
      {{ props.errorLabel }}
    </TxButton>
  </div>
</template>
