<script setup lang='ts'>
const { count, inc, dec } = useCount()
</script>

<template>
  <div inline-flex m="y-3">
    <TxButton circle size="small" variant="ghost" icon="i-carbon-subtract" @click="dec()" />
    <div font="mono" w="15" m-auto inline-block>
      {{ count }}
    </div>
    <TxButton circle size="small" variant="ghost" icon="i-carbon-add" @click="inc()" />
  </div>
</template>
