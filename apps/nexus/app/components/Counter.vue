<script setup lang='ts'>
const { count, inc, dec } = useCount()
</script>

<template>
  <div class="my-3 inline-flex">
    <TxButton circle size="small" variant="ghost" icon="i-carbon-subtract" @click="dec()" />
    <div class="m-auto inline-block w-15 font-mono">
      {{ count }}
    </div>
    <TxButton circle size="small" variant="ghost" icon="i-carbon-add" @click="inc()" />
  </div>
</template>
