<script setup lang="ts">
</script>

<template>
  <div class="card-bg-grid">
    <div class="card-bg-scene card-bg-scene--light">
      <div class="card-bg-scene-label">
        Light background
      </div>
      <div class="card-bg-cards">
        <TxCard variant="solid" background="refraction" shadow="none" :padding="12">
          refraction
        </TxCard>
        <TxCard variant="solid" background="glass" shadow="none" :padding="12">
          glass
        </TxCard>
        <TxCard variant="solid" background="blur" shadow="none" :padding="12">
          blur (filter)
        </TxCard>
        <TxCard variant="solid" background="mask" shadow="none" :padding="12">
          mask
        </TxCard>
      </div>
    </div>

    <div class="card-bg-scene card-bg-scene--dark">
      <div class="card-bg-scene-label card-bg-scene-label--light">
        Dark background
      </div>
      <div class="card-bg-cards">
        <TxCard variant="solid" background="refraction" shadow="none" :padding="12">
          refraction
        </TxCard>
        <TxCard variant="solid" background="glass" shadow="none" :padding="12">
          glass
        </TxCard>
        <TxCard variant="solid" background="blur" shadow="none" :padding="12">
          blur (filter)
        </TxCard>
        <TxCard variant="solid" background="mask" shadow="none" :padding="12">
          mask
        </TxCard>
      </div>
    </div>

    <div class="card-bg-scene card-bg-scene--gradient">
      <div class="card-bg-scene-label card-bg-scene-label--light">
        Gradient background
      </div>
      <div class="card-bg-cards">
        <TxCard variant="solid" background="refraction" shadow="none" :padding="12">
          refraction
        </TxCard>
        <TxCard variant="solid" background="glass" shadow="none" :padding="12">
          glass
        </TxCard>
        <TxCard variant="solid" background="blur" shadow="none" :padding="12">
          blur (filter)
        </TxCard>
        <TxCard variant="solid" background="mask" shadow="none" :padding="12">
          mask
        </TxCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-bg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.card-bg-scene {
  border-radius: 14px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 68%, transparent);
}

.card-bg-scene--light {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tx-fill-color-lighter, #fafafa) 92%, transparent) 0%,
    color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 96%, transparent) 100%
  );
}

.card-bg-scene--dark {
  background: color-mix(
    in srgb,
    var(--tx-text-color-primary, #303133) 90%,
    var(--tx-bg-color, #060911)
  );
  border-color: color-mix(in srgb, var(--tx-border-color-lighter, #ebeef5) 20%, transparent);
}

.card-bg-scene--gradient {
  background:
    radial-gradient(1200px 600px at 0% 0%, color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--tx-color-success, #67c23a) 28%, transparent), transparent 55%),
    radial-gradient(900px 500px at 40% 120%, color-mix(in srgb, var(--tx-color-warning, #e6a23c) 22%, transparent), transparent 55%),
    color-mix(in srgb, var(--tx-text-color-primary, #303133) 88%, var(--tx-bg-color, #070b14));
  border-color: color-mix(in srgb, var(--tx-border-color-lighter, #ebeef5) 18%, transparent);
}

.card-bg-scene-label {
  font-size: 12px;
  margin-bottom: 8px;
  color: var(--tx-text-color-secondary, #909399);
}

.card-bg-scene-label--light {
  color: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 72%, transparent);
}

.card-bg-cards {
  display: grid;
  gap: 10px;
}
</style>
