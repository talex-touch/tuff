<template>
  <div class="outline-border-demo">
    <TxOutlineBorder :ring-width="2" ring-color="var(--tx-color-primary)" :offset="2" offset-bg="var(--tx-bg-color)">
      <div class="outline-border-demo__avatar outline-border-demo__avatar--primary">
        TX
      </div>
    </TxOutlineBorder>

    <TxOutlineBorder
      variant="border"
      :border-width="2"
      border-color="var(--tx-border-color)"
      :padding="2"
      shape="rect"
      :border-radius="12"
    >
      <div class="outline-border-demo__avatar outline-border-demo__avatar--rect">
        UI
      </div>
    </TxOutlineBorder>
  </div>
</template>

<style scoped>
.outline-border-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.outline-border-demo__avatar {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: white;
  font-size: 13px;
  font-weight: 700;
}

.outline-border-demo__avatar--primary {
  border-radius: 999px;
  background: linear-gradient(135deg, #409eff, #7c3aed);
}

.outline-border-demo__avatar--rect {
  border-radius: 10px;
  background: linear-gradient(135deg, #0f172a, #475569);
}
</style>
