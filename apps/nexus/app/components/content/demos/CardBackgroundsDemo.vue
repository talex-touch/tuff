<script setup lang="ts">
</script>

<template>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
    <div style="border-radius: 14px; padding: 14px; background: #f5f7fa; border: 1px solid rgba(0,0,0,0.06);">
      <div style="font-size: 12px; margin-bottom: 8px; color: rgba(0,0,0,0.55);">
        Light background
      </div>
      <div style="display: grid; gap: 10px;">
        <TxCard variant="solid" background="blur" shadow="none" :padding="12">
          blur
        </TxCard>
        <TxCard variant="solid" background="glass" shadow="none" :padding="12">
          glass
        </TxCard>
      </div>
    </div>

    <div style="border-radius: 14px; padding: 14px; background: #0b1020; border: 1px solid rgba(255,255,255,0.08);">
      <div style="font-size: 12px; margin-bottom: 8px; color: rgba(255,255,255,0.65);">
        Dark background
      </div>
      <div style="display: grid; gap: 10px;">
        <TxCard variant="solid" background="blur" shadow="none" :padding="12">
          blur
        </TxCard>
        <TxCard variant="solid" background="glass" shadow="none" :padding="12">
          glass
        </TxCard>
      </div>
    </div>

    <div
      style="
        border-radius: 14px;
        padding: 14px;
        background: radial-gradient(1200px 600px at 0% 0%, rgba(88, 129, 255, 0.25), transparent 55%),
          radial-gradient(900px 500px at 100% 0%, rgba(246, 108, 255, 0.22), transparent 55%),
          radial-gradient(900px 500px at 40% 120%, rgba(57, 255, 214, 0.14), transparent 55%),
          #0b1020;
        border: 1px solid rgba(255,255,255,0.08);
      "
    >
      <div style="font-size: 12px; margin-bottom: 8px; color: rgba(255,255,255,0.65);">
        Gradient background
      </div>
      <div style="display: grid; gap: 10px;">
        <TxCard variant="solid" background="blur" shadow="none" :padding="12">
          blur
        </TxCard>
        <TxCard variant="solid" background="glass" shadow="none" :padding="12">
          glass
        </TxCard>
      </div>
    </div>
  </div>
</template>
