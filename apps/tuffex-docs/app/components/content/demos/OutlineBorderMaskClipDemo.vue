<template>
  <TxOutlineBorder
    variant="ring"
    :ring-width="2"
    ring-color="var(--tx-color-primary)"
    clip-mode="mask"
    clip-shape="hexagon"
  >
    <div class="outline-border-mask-demo">
      AI
    </div>
  </TxOutlineBorder>
</template>

<style scoped>
.outline-border-mask-demo {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.65), transparent 26px),
    linear-gradient(135deg, #16a34a, #0ea5e9 55%, #4f46e5);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
</style>
