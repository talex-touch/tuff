<template>
  <div class="corner-overlay-demo">
    <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
      <span class="corner-overlay-demo__avatar">TD</span>
      <template #overlay>
        <span class="corner-overlay-demo__status" />
      </template>
    </TxCornerOverlay>

    <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
      <span class="corner-overlay-demo__avatar corner-overlay-demo__avatar--muted">NX</span>
      <template #overlay>
        <span class="corner-overlay-demo__badge">
          <TxIcon name="i-carbon-checkmark-filled" />
        </span>
      </template>
    </TxCornerOverlay>
  </div>
</template>

<style scoped>
.corner-overlay-demo {
  display: flex;
  align-items: center;
  gap: 24px;
}

.corner-overlay-demo__avatar {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--tx-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.corner-overlay-demo__avatar--muted {
  background: var(--tx-fill-color-dark, #dcdfe6);
  color: var(--tx-text-color-primary);
}

.corner-overlay-demo__status {
  width: 12px;
  height: 12px;
  border: 2px solid var(--tx-bg-color);
  border-radius: 999px;
  background: #22c55e;
}

.corner-overlay-demo__badge {
  display: inline-flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--tx-bg-color);
  color: var(--tx-color-primary);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
  font-size: 18px;
}
</style>
