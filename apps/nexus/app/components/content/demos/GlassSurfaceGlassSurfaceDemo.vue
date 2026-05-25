<template>
  <div class="glass-surface-basic-demo">
    <div class="glass-surface-basic-demo__copy">
      <span>Glass Journal</span>
      <strong>Layered clarity with visible depth</strong>
      <p>Background color bands and text make blur, refraction, and edge highlights visible.</p>
    </div>

    <div class="glass-surface-basic-demo__swatches" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>

    <TxGlassSurface :width="360" :height="160" :border-radius="20" :background-opacity="0.08">
      <div class="glass-surface-basic-demo__panel">
        GlassSurface
      </div>
    </TxGlassSurface>
  </div>
</template>

<style scoped>
.glass-surface-basic-demo {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background:
    radial-gradient(circle at 16% 18%, rgba(255, 122, 122, 0.72), transparent 25%),
    radial-gradient(circle at 78% 24%, rgba(89, 203, 255, 0.7), transparent 28%),
    linear-gradient(135deg, #f8e3c5 0%, #d7ebff 48%, #d6f5df 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.glass-surface-basic-demo::before {
  position: absolute;
  inset: 18px;
  content: "";
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  background:
    linear-gradient(90deg, rgba(20, 20, 24, 0.08) 1px, transparent 1px) 0 0 / 44px 44px,
    linear-gradient(0deg, rgba(20, 20, 24, 0.08) 1px, transparent 1px) 0 0 / 44px 44px;
}

.glass-surface-basic-demo__copy {
  position: absolute;
  top: 32px;
  left: 36px;
  display: grid;
  max-width: 390px;
  gap: 8px;
  color: rgba(28, 29, 34, 0.82);
}

.glass-surface-basic-demo__copy span {
  width: fit-content;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.glass-surface-basic-demo__copy strong {
  font-size: 24px;
  line-height: 1.18;
}

.glass-surface-basic-demo__copy p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: rgba(28, 29, 34, 0.62);
}

.glass-surface-basic-demo__swatches {
  position: absolute;
  right: 36px;
  bottom: 34px;
  display: grid;
  grid-template-columns: repeat(4, 44px);
  gap: 10px;
}

.glass-surface-basic-demo__swatches span {
  aspect-ratio: 1;
  border: 1px solid rgba(255, 255, 255, 0.54);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(36, 39, 48, 0.14);
}

.glass-surface-basic-demo__swatches span:nth-child(1) {
  background: #f87171;
}

.glass-surface-basic-demo__swatches span:nth-child(2) {
  background: #fbbf24;
}

.glass-surface-basic-demo__swatches span:nth-child(3) {
  background: #38bdf8;
}

.glass-surface-basic-demo__swatches span:nth-child(4) {
  background: #4ade80;
}

.glass-surface-basic-demo__panel {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  padding: 16px;
  color: rgba(20, 22, 28, 0.78);
  font-weight: 700;
}

@media (max-width: 640px) {
  .glass-surface-basic-demo {
    min-height: 320px;
  }

  .glass-surface-basic-demo__copy {
    top: 24px;
    right: 24px;
    left: 24px;
  }

  .glass-surface-basic-demo__copy strong {
    font-size: 20px;
  }

  .glass-surface-basic-demo__swatches {
    right: 24px;
    bottom: 24px;
    grid-template-columns: repeat(4, 34px);
    gap: 8px;
  }
}
</style>
