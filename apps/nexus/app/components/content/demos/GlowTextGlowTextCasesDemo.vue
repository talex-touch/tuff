<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <TxGlowText tag="div" :radius="999" :angle="-20" :band-size="28" :duration-ms="1200" :repeat="false">
      <div
        style="padding: 8px 14px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-weight: 600; font-size: 13px; letter-spacing: 0.02em;"
      >
        New Feature
      </div>
    </TxGlowText>

    <TxGlowText tag="div" :radius="12" :angle="16" :band-size="36" :duration-ms="1800" :opacity="0.6" color="rgba(255, 255, 255, 0.85)">
      <div
        style="padding: 12px 14px; border-radius: 12px; background: #0b1220; color: #e2e8f0; border: 1px solid rgba(148, 163, 184, 0.2); display: flex; align-items: center; gap: 10px;"
      >
        <div style="width: 8px; height: 8px; border-radius: 999px; background: #22c55e;" />
        <div>
          <div style="font-size: 12px; opacity: 0.8;">
Connected
</div>
          <div style="font-size: 14px; font-weight: 600;">
Realtime Sync
</div>
        </div>
      </div>
    </TxGlowText>
  </div>
</template>
