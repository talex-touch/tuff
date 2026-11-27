<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <TxGlowText tag="div" :radius="14" :angle="20" :band-size="34" :duration-ms="1600" color="rgba(255, 255, 255, 0.95)">
      <div
        style="width: 240px; height: 120px; border-radius: 14px; background: linear-gradient(135deg, #111827, #0f766e); border: 1px solid var(--tx-border-color-light);"
      />
    </TxGlowText>

    <TxGlowText tag="div" :radius="12" :angle="-12" :band-size="40" :duration-ms="2000" :opacity="0.55" color="rgba(255, 255, 255, 0.85)" blend-mode="soft-light">
      <div
        style="width: 240px; height: 120px; border-radius: 12px; background: linear-gradient(135deg, #f8fafc, #e2e8f0); border: 1px solid rgba(148, 163, 184, 0.25);"
      />
    </TxGlowText>
  </div>
</template>
