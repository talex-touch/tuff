<template>
  <div class="demo">
    <div class="demo__row">
      <div class="demo__title">indicatorEffect="none"</div>
      <TxProgressBar :percentage="86" height="12px" show-text flow-effect="wave" mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">indicatorEffect="sparkle"</div>
      <TxProgressBar :percentage="86" height="12px" show-text flow-effect="wave" indicator-effect="sparkle" hover-effect="glow" mask-background="glass" />
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
  grid-template-columns: 190px 1fr;
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
