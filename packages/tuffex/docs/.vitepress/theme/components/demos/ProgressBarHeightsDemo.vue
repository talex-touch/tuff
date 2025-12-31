<template>
  <div class="demo">
    <div class="demo__row">
      <div class="demo__title">height="4px"</div>
      <TxProgressBar :percentage="75" height="4px" show-text mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">height="10px"</div>
      <TxProgressBar :percentage="75" height="10px" show-text mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">height="20px"</div>
      <TxProgressBar :percentage="75" height="20px" show-text mask-background="glass" />
    </div>
  </div>
</template>

<style scoped>
.demo {
  width: 100%;
  display: grid;
  gap: 12px;
}

.demo__row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  align-items: center;
}

.demo__title {
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-text-color-primary, #fff) 82%, transparent);
  white-space: nowrap;
}
</style>
