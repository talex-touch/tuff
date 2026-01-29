<template>
  <div class="demo">
    <div class="demo__row">
      <div class="demo__title">
        flowEffect="none"
      </div>
      <TxProgressBar :percentage="72" height="12px" show-text mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">
        flowEffect="shimmer"
      </div>
      <TxProgressBar :percentage="72" height="12px" show-text flow-effect="shimmer" mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">
        flowEffect="wave"
      </div>
      <TxProgressBar :percentage="72" height="12px" show-text flow-effect="wave" mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">
        flowEffect="particles"
      </div>
      <TxProgressBar :percentage="72" height="12px" show-text flow-effect="particles" mask-background="glass" />
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
  grid-template-columns: 160px 1fr;
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
