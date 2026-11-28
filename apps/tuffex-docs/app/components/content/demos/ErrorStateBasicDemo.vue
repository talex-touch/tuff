<script setup lang="ts">
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 16px;">
    <TxErrorState
      :primary-action="{ label: 'Retry', type: 'primary' }"
      :secondary-action="{ label: 'Go Back' }"
    />
  </div>
</template>
