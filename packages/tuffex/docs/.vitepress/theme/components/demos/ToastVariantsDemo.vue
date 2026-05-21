<script setup lang="ts">
import { clearToasts, dismissToast, toast } from '@tuffex/packages/utils'

const persistentId = 'docs-toast-persistent'
const replaceId = 'docs-toast-replace'

function showVariants() {
  toast({ title: 'Success', description: 'Synced', variant: 'success', duration: 0 })
  toast({ title: 'Warning', description: 'Quota is almost full', variant: 'warning', duration: 0 })
  toast({ title: 'Danger', description: 'Save failed', variant: 'danger', duration: 0 })
}

function showPersistent() {
  toast({
    id: persistentId,
    title: 'Persistent',
    description: 'duration: 0 keeps this notification visible until dismissToast(id).',
    variant: 'warning',
    duration: 0,
  })
}

function dismissPersistent() {
  dismissToast(persistentId)
}

function replaceToast() {
  toast({
    id: replaceId,
    title: 'Upload status',
    description: `Replaced at ${new Date().toLocaleTimeString()}`,
    variant: 'success',
    duration: 0,
  })
}
</script>

<template>
  <TxToastHost />

  <div class="tx-demo tx-demo__row">
    <TxButton @click="showVariants">
      Show variants
    </TxButton>
    <TxButton variant="warning" @click="showPersistent">
      duration: 0
    </TxButton>
    <TxButton variant="ghost" @click="dismissPersistent">
      dismissToast
    </TxButton>
    <TxButton variant="secondary" @click="replaceToast">
      Replace same id
    </TxButton>
    <TxButton variant="ghost" @click="clearToasts">
      Clear all
    </TxButton>
  </div>
</template>
