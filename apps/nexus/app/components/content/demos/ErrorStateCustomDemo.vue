<script setup lang="ts">
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 16px;">
    <TxErrorState
      title="Failed to load data"
      description="The server returned error 500. Please check your network and try again."
      surface="card"
      :primary-action="{ label: 'Retry', type: 'primary' }"
    />
  </div>
</template>
