<template>
  <div class="demo">
    <div class="demo__row">
      <div class="demo__title">classic</div>
      <TxProgressBar indeterminate height="10px" message="Classic" indeterminate-variant="classic" mask-variant="dashed" mask-background="mask" />
    </div>

    <div class="demo__row">
      <div class="demo__title">sweep</div>
      <TxProgressBar indeterminate height="10px" message="Uploading..." indeterminate-variant="sweep" mask-background="blur" />
    </div>

    <div class="demo__row">
      <div class="demo__title">bounce</div>
      <TxProgressBar indeterminate height="10px" message="Bounce" indeterminate-variant="bounce" mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">elastic</div>
      <TxProgressBar indeterminate height="10px" message="Elastic" indeterminate-variant="elastic" mask-background="glass" />
    </div>

    <div class="demo__row">
      <div class="demo__title">split</div>
      <TxProgressBar indeterminate height="10px" message="Split" indeterminate-variant="split" mask-background="glass" />
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
  grid-template-columns: 110px 1fr;
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
