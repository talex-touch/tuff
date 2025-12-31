<script setup lang="ts">
const segments = [
  { value: 25, color: 'linear-gradient(90deg, #60a5fa, #34d399)' },
  { value: 18, color: 'linear-gradient(90deg, #a78bfa, #f472b6)' },
  { value: 12, color: 'linear-gradient(90deg, #fb7185, #f59e0b)' },
]
</script>

<template>
  <div class="demo">
    <TxProgressBar
      :segments="segments"
      :segments-total="100"
      height="14px"
      show-text
      tooltip
      tooltip-content="Multi-segment progress"
      indicator-effect="sparkle"
      mask-background="glass"
    />
  </div>
</template>

<style scoped>
.demo {
  width: 100%;
}
</style>
