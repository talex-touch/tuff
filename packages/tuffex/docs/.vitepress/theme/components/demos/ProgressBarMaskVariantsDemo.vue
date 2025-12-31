<template>
  <div class="demo">
    <div class="demo__row">
      <div class="demo__title">solid</div>
      <TxProgressBar :percentage="45" mask-variant="solid" height="12px" show-text mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">dashed</div>
      <TxProgressBar :percentage="45" mask-variant="dashed" height="12px" show-text mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">plain</div>
      <TxProgressBar :percentage="45" mask-variant="plain" height="12px" show-text mask-background="glass" />
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
  grid-template-columns: 86px 1fr;
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
